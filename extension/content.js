console.log('%c[RPC] СКРИПТ ЗАПУЩЕН НА: ' + window.location.hostname, 'color: lime; font-size: 16px; font-weight: bold;');

const SUPPORTED_DOMAINS = ['yummyani.me', 'yummyanime.tv', 'animego.me', 'wwwanitype.fun', 'kodik', 'aniboom', 'alloha', 'cvh'];
if (!SUPPORTED_DOMAINS.some(domain => window.location.hostname.includes(domain))) {
    console.log('[RPC] Левый домен, игнорируем.');
} else {
    const isKodik = window.location.hostname.includes('kodik');
    
    function getCleanTitle() {
        let titleEl = document.querySelector('h1[itemprop="name"]') || document.querySelector('h1.anime-title') || document.querySelector('h1');
        let title = titleEl ? titleEl.innerText.trim() : '';
        if (!title || title.length < 2) title = document.title;
        return title.split('—')[0].split('|')[0].split('смотреть')[0].split('онлайн')[0].trim();
    }

    function getEnglishTitle() {
        const enSelectors = ['.anime-title-en', '.alternative-title', '[itemprop="alternativeHeadline"]', '.alt-names-list li'];
        for (let sel of enSelectors) {
            let els = document.querySelectorAll(sel);
            for (let el of els) {
                if (/[a-zA-Z]/.test(el.innerText) && el.innerText.length > 2) return el.innerText.trim();
            }
        }
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && /[a-zA-Z]/.test(ogTitle.content)) return ogTitle.content.replace(/^#/, '').split(':')[0].split('|')[0].trim();
        return null;
    }

    // --- ПОЛНОСТЬЮ АВТОМАТИЧЕСКИЙ ПОИСК КАРТИНКИ ---
    function getPosterUrl() {
        // 1. Универсальные мета-теги (работают почти везде)
        const metaSelectors = [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="twitter:image"]',
            'link[rel="image_src"]'
        ];
        for (let sel of metaSelectors) {
            let el = document.querySelector(sel);
            if (el) {
                let url = el.content || el.href;
                if (url) {
                    if (url.startsWith('//')) url = 'https:' + url; // Добавляем протокол
                    if (url.startsWith('http')) return url;
                }
            }
        }

        // 2. Если мета-тегов нет, ищем САМУЮ БОЛЬШУЮ картинку на странице
        const images = Array.from(document.querySelectorAll('img'));
        let bestImage = null;
        let maxArea = 0;

        for (let img of images) {
            // Берем data-full (там часто оригинал), если нет - src
            let src = img.getAttribute('data-full') || img.src || img.getAttribute('data-src');
            if (!src) continue;
            
            if (src.startsWith('//')) src = 'https:' + src;
            if (!src.startsWith('http')) continue;

            // Получаем размеры картинки (даже если она не загрузилась, берем атрибуты)
            const w = img.naturalWidth || img.width || img.clientWidth || 0;
            const h = img.naturalHeight || img.height || img.clientHeight || 0;
            
            // Отсеиваем мелкие иконки и баннеры
            if (w < 150 || h < 150) continue; 

            const area = w * h;
            if (area > maxArea) {
                maxArea = area;
                bestImage = src;
            }
        }

        return bestImage;
    }

    function getDubbing() {
        let selectors = ['.select2-selection__rendered', '.player-translation .active', '[class*="singleValue"]', '.dubbing-name', '.translation-name', '.animeVoices .studio-name'];
        for (let sel of selectors) {
            let el = document.querySelector(sel);
            if (el && el.innerText.trim()) return el.innerText.trim().replace(/^Озвучка\s+/i, '').replace(/\s*\(\d+\s*эп\.\)/i, '').trim();
        }
        return 'Неизвестно';
    }

    setInterval(() => {
        if (!chrome.runtime?.id) return;

        let payload = null;
        const videos = Array.from(document.querySelectorAll('video'));
        const mainVideo = videos.find(v => v.duration > 60 && !isNaN(v.duration));

        if (mainVideo) {
            let episode = '?';
            const urlMatch = window.location.href.match(/[?&](?:episode|ep)=(\d+)/);
            if (urlMatch) episode = urlMatch[1];
            
            payload = { type: "videoplayer", episode: episode, currentTime: mainVideo.currentTime, duration: mainVideo.duration, isPaused: mainVideo.paused, dubbing: 'Неизвестно' };
        } else if (!isKodik) {
            const title = getCleanTitle();
            if (title.length > 2) {
                const englishTitle = getEnglishTitle();
                const sitePoster = getPosterUrl(); 
                
                payload = { 
                    type: "website", 
                    title: title, 
                    searchTitle: englishTitle || title, 
                    sitePosterUrl: sitePoster, 
                    dubbing: getDubbing() 
                };
                console.log(`[RPC] Найдено: "${title}" | Постер с сайта: ${sitePoster ? 'Да' : 'Нет'}`);
            }
        }

        if (payload) {
            chrome.runtime.sendMessage({ type: "animepresence", payload: payload });
        }
    }, 3000);
}