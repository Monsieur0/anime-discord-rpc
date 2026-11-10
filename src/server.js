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
if (!fs.existsSync(configPath)) { process.exit(1); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const CLIENT_ID = config.clientId;
const PORT = config.port || 3000;

let rpc = new RPC.Client({ transport: 'ipc' });
let meta = { title: '', poster: '' };
let progress = { episode: '?', dubbing: 'Неизвестно', currentTime: 0, duration: 0, isPaused: false };

let currentStartTimestamp = null;
let lastActivityJson = '';
let lastVideoTime = Date.now(); // Инициализируем текущим временем
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
            console.log(`🛑 Discord не найден.`);
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

function processSitePoster(url) {
    if (!url) return null;
    if (/\.(avif|webp)$/i.test(url)) {
        const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&w=512&h=512`;
        if (proxyUrl.length <= 256) return proxyUrl;
    }
    if (url.length <= 256 && /\.(jpg|jpeg|png)$/i.test(url)) return url;
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&w=512&h=512`;
    if (proxyUrl.length <= 256) return proxyUrl;
    return null;
}

async function translateToEnglish(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ru|en`;
    const data = await fetchWithTimeout(url);
    if (data?.responseData?.translatedText) return data.responseData.translatedText;
    return null;
}
async function getEnglishTitleFromShikimori(query) {
    const targetUrl = `https://shikimori.one/api/animes?search=${encodeURIComponent(query)}&limit=1`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const data = await fetchWithTimeout(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3000);
    if (data && data[0]) return data[0].english || data[0].name; 
    return null;
}
async function findCoverByEnglish(englishTitle) {
    try {
        const aniListData = await fetchWithTimeout('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge } } }`, variables: { search: englishTitle } })
        });
        if (aniListData?.data?.Media?.coverImage?.extraLarge) return aniListData.data.Media.coverImage.extraLarge;
    } catch (e) {}
    try {
        const jikanData = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(englishTitle)}&limit=1`);
        if (jikanData?.data?.[0]?.images?.jpg?.large_image_url) return jikanData.data[0].images.jpg.large_image_url;
    } catch (e) {}
    return null; 
}

async function findAnimeCover(searchQuery) {
  if (!searchQuery) return null;
  const cleanSearch = searchQuery.split('—')[0].split('|')[0].split('смотреть')[0].replace(/[!?.,:;…—–\-_]/g, ' ').trim().toLowerCase();
  if (imageCache.has(cleanSearch)) return imageCache.get(cleanSearch);
  
  console.log(`\n🔍 [API Fallback] Ищу обложку для: "${cleanSearch}"`);

  if (!/[а-яА-ЯёЁ]/.test(cleanSearch)) {
      const img = await findCoverByEnglish(cleanSearch);
      if (img) { imageCache.set(cleanSearch, img); return img; }
  } else {
      let englishTitle = await getEnglishTitleFromShikimori(cleanSearch);
      if (!englishTitle) englishTitle = await translateToEnglish(cleanSearch);
      if (englishTitle) {
          const img = await findCoverByEnglish(englishTitle);
          if (img) { imageCache.set(cleanSearch, img); return img; }
      }
  }
  console.log('❌ API не нашли обложку.');
  return null; 
}

function buildActivity() {
  // Если нет подключения или названия, не показываем ничего
  if (!isBrowserConnected || !meta.title) return null;

  const activity = { instance: false, activityType: 3 };
  activity.details = meta.title;

  // Если видео еще грузится (длительность 0), показываем "Загрузку"
  if (progress.duration > 0) {
      const percent = Math.min(1, Math.max(0, progress.currentTime / progress.duration));
      const filled = Math.floor(percent * 10);
      const bar = '▰'.repeat(Math.max(1, filled)) + '▱'.repeat(10 - Math.max(1, filled));
      let epText = progress.episode !== '?' ? `E${progress.episode}` : ''; 
      const dubText = progress.dubbing !== 'Неизвестно' ? `[${progress.dubbing}] ` : '';
      const actionText = progress.isPaused ? 'Перевариваю ⏸' : 'Смотрю ▶';
      
      activity.state = `${actionText} ${dubText}[${bar}] ${Math.round(percent * 100)}% ${epText}`.trim();
  } else {
      activity.state = 'Загрузка плеера...';
  }

  if (meta.poster && meta.poster.startsWith('http') && meta.poster.length <= 256) {
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

// Сторожевой таймер (УВЕЛИЧЕН ДО 65 СЕКУНД, чтобы Chrome не сбрасывал статус в фоне)
setInterval(() => {
    if (progress.duration > 0 && Date.now() - lastVideoTime > 65000) {
        console.log('🛑 Нет данных от видео 65 секунд. Очищаю статус.');
        progress.duration = 0; progress.currentTime = 0; 
        meta.title = ''; // Сбрасываем название, чтобы статус исчез
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
            
            let sitePoster = processSitePoster(data.sitePosterUrl);
            
            if (sitePoster) {
                console.log(`   ✅ Использую картинку с сайта: ${sitePoster}`);
                meta.poster = sitePoster;
                lastDiscordUpdate = 0;
                updateDiscord();
            } else {
                console.log(`   ⚠️ Картинка с сайта не подошла. Ищу в API...`);
                findAnimeCover(data.searchTitle).then(posterUrl => {
                    if (posterUrl) { meta.poster = posterUrl; lastDiscordUpdate = 0; updateDiscord(); }
                });
            }
          }
        } else if (data.type === 'videoplayer') {
          if (data.duration && data.duration < 60) return; 
          
          lastVideoTime = Date.now(); // Обновляем время получения данных
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