const RPC = require('discord-rpc');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

process.on('uncaughtException', (err) => console.error('🔥 ОШИБКА (сервер выжил):', err.message));
process.on('unhandledRejection', (err) => console.error('🔥 ПРОМИС (сервер выжил):', err));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const configPath = path.join(__dirname, '../config.json');
if (!fs.existsSync(configPath)) {
    console.error('❌ ОШИБКА: Файл config.json не найден!');
    console.log('Запусти установку: npm run setup');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const CLIENT_ID = config.clientId;
const PORT = config.port || 3000;

let rpc = new RPC.Client({ transport: 'ipc' });
let meta = { title: '', poster: '' };
let progress = { episode: '?', dubbing: 'Неизвестно', currentTime: 0, duration: 0, isPaused: false };

let currentStartTimestamp = null;
let lastActivityJson = '';
let lastVideoTime = 0; 
let lastDiscordUpdate = 0;
let isBrowserConnected = false; 
const imageCache = new Map();

let reconnectAttempts = 0;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY = 10000; 

function connectDiscord() {
    rpc = new RPC.Client({ transport: 'ipc' }); 
    rpc.on('ready', async () => {
        console.log('✅ Discord RPC подключен!');
        reconnectAttempts = 0; 
        try { await rpc.clearActivity(); } catch (e) {} 
    });
    rpc.login({ clientId: CLIENT_ID }).catch(e => {
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_ATTEMPTS) {
            console.log(`❌ Discord IPC не готов (Попытка ${reconnectAttempts}/${MAX_ATTEMPTS}). Жду 10 сек...`);
            setTimeout(connectDiscord, RETRY_DELAY);
        } else {
            console.log(`🛑 Discord не найден. Статус работать не будет.`);
        }
    });
}

async function fetchWithTimeout(url, options = {}, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) { return null; } finally { clearTimeout(id); }
}

async function fetchFromAniList(query) {
  const data = await fetchWithTimeout('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge } } }`, variables: { search: query } })
  });
  return data?.data?.Media?.coverImage?.extraLarge || null;
}

async function fetchFromKitsu(query) {
  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page%5Blimit%5D=1`;
  const data = await fetchWithTimeout(url, { headers: { 'Accept': 'application/vnd.api+json' } });
  return data?.data?.[0]?.attributes?.posterImage?.original || null;
}

async function fetchFromJikan(query) {
  const data = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
  if (data?.data?.[0]?.images?.jpg?.large_image_url) {
      return `https://wsrv.nl/?url=${encodeURIComponent(data.data[0].images.jpg.large_image_url)}&output=jpg&w=512&h=512&fit=cover`;
  }
  return null;
}

async function findAnimeCover(searchQuery) {
  if (!searchQuery) return null;
  const cleanSearch = searchQuery.split('—')[0].split('|')[0].split('смотреть')[0].trim();
  if (imageCache.has(cleanSearch)) return imageCache.get(cleanSearch);
  
  let img = await fetchFromAniList(cleanSearch); 
  if (!img) img = await fetchFromKitsu(cleanSearch);
  if (!img) img = await fetchFromJikan(cleanSearch);
  
  if (img) { imageCache.set(cleanSearch, img); return img; }
  return null; 
}

function buildActivity() {
  if (!isBrowserConnected || progress.duration === 0 || !meta.title) return null;

  const activity = { instance: false, activityType: 3 };
  activity.details = meta.title;
  
  const percent = Math.min(1, Math.max(0, progress.currentTime / progress.duration));
  const filled = Math.floor(percent * 10);
  const bar = '▰'.repeat(Math.max(1, filled)) + '▱'.repeat(10 - Math.max(1, filled));
  let epText = progress.episode !== '?' ? `E${progress.episode}` : ''; 
  const dubText = progress.dubbing !== 'Неизвестно' ? `[${progress.dubbing}] ` : '';
  const actionText = progress.isPaused ? 'Перевариваю ⏸' : 'Смотрю ▶';
  
  activity.state = `${actionText} ${dubText}[${bar}] ${Math.round(percent * 100)}% ${epText}`.trim();

  // Ставим ТОЛЬКО постер. Никаких play/pause и заглушек.
  if (meta.poster && meta.poster.startsWith('http')) {
    activity.largeImageKey = meta.poster;
    activity.largeImageText = meta.title;
  }
  
  if (currentStartTimestamp && progress.duration > 1 && !progress.isPaused) {
      activity.startTimestamp = currentStartTimestamp;
  }

  return activity;
}

async function updateDiscord() {
  if (!rpc || reconnectAttempts > MAX_ATTEMPTS) return; 
  if (Date.now() - lastDiscordUpdate < 2000) return; 
  lastDiscordUpdate = Date.now();
  
  const activity = buildActivity();
  
  if (!activity) {
      if (lastActivityJson !== '') {
          try { await rpc.clearActivity(); lastActivityJson = ''; } catch (e) {}
      }
      return;
  }

  const activityJson = JSON.stringify(activity);
  if (activityJson === lastActivityJson) return;
  
  try {
    await rpc.setActivity(activity);
    lastActivityJson = activityJson;
    console.log(`🖼️ Статус обновлен: ${activity.details} | ${activity.state}`);
  } catch (e) {}
}

setInterval(() => {
    if (progress.duration > 0 && Date.now() - lastVideoTime > 10000) {
        progress.duration = 0; progress.currentTime = 0; lastDiscordUpdate = 0;
        updateDiscord();
    }
}, 5000);

setInterval(() => {
  if (wss.clients.size === 0 && isBrowserConnected) {
      console.log('🛑 Вкладка отключилась. Очищаю статус.');
      isBrowserConnected = false; 
      meta = { title: '', poster: '' };
      progress = { episode: '?', dubbing: 'Неизвестно', currentTime: 0, duration: 0, isPaused: false };
      currentStartTimestamp = null; 
      lastDiscordUpdate = 0; 
      updateDiscord();
  }
}, 5000);

wss.on('connection', (ws) => {
    isBrowserConnected = true;
    console.log('🔌 Браузер подключен!');
    ws.on('close', () => console.log('❌ Браузер отключен.'));

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'PING') return;

        if (data.type === 'website') {
          if (data.dubbing && data.dubbing !== 'Неизвестно' && data.dubbing !== progress.dubbing) { 
              progress.dubbing = data.dubbing; lastDiscordUpdate = 0; 
          }
          if (data.title && data.title !== meta.title) {
            console.log(`📄 Новое аниме: ${data.title}`);
            meta.title = data.title; meta.poster = ''; lastDiscordUpdate = 0; updateDiscord(); 
            findAnimeCover(data.searchTitle).then(posterUrl => {
                if (posterUrl) { meta.poster = posterUrl; lastDiscordUpdate = 0; updateDiscord(); }
            });
          }
        } else if (data.type === 'videoplayer') {
          if (data.duration && data.duration < 60) return; 
          
          lastVideoTime = Date.now(); 
          if (data.duration) progress.duration = data.duration;
          if (data.isPaused !== undefined) progress.isPaused = data.isPaused;
          if (data.episode) progress.episode = data.episode;
          
          if (data.dubbing && data.dubbing !== 'Неизвестно' && data.dubbing !== progress.dubbing) { 
              progress.dubbing = data.dubbing; lastDiscordUpdate = 0; 
          }
          
          if (data.currentTime !== undefined) {
             if (!progress.isPaused) {
                 if (!currentStartTimestamp) currentStartTimestamp = Math.floor(Date.now() - (data.currentTime * 1000));
                 else {
                     const expected = (Date.now() - currentStartTimestamp) / 1000;
                     if (Math.abs(data.currentTime - expected) > 5) currentStartTimestamp = Math.floor(Date.now() - (data.currentTime * 1000));
                 }
             }
             progress.currentTime = data.currentTime;
          }
        }
        updateDiscord();
      } catch (e) { console.error('Ошибка обработки:', e.message); }
    });
});

server.listen(PORT, '127.0.0.1', () => console.log(`🚀 Сервер слушает ws://127.0.0.1:${PORT}`));
connectDiscord();