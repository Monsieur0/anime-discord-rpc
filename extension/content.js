const SUPPORTED_DOMAINS = ['yummyani.me', 'yummyanime.tv', 'animego.me', 'wwwanitype.fun', 'kodik', 'aniboom', 'alloha', 'cvh'];
if (!SUPPORTED_DOMAINS.some(domain => window.location.hostname.includes(domain))) {
    console.log('[RPC] Левый домен, игнорируем:', window.location.hostname);
} else {
    console.log('%c[RPC] СКРИПТ ЗАПУЩЕН: ' + window.location.hostname, 'color: lime; font-weight: bold;');

    function getCleanTitle() {
        let titleEl = document.querySelector('h1[itemprop="name"]') || document.querySelector('h1.anime-title') || document.querySelector('h1');
        let title = titleEl ? titleEl.innerText.trim() : '';
        if (!title || title.length < 2) title = document.title;
        return title.split('—')[0].split('|')[0].split('смотреть')[0].split('онлайн')[0].trim();
    }

    function getEnglishTitle() {
        const enSelectors = ['.anime-title-en', '.alternative-title', '[itemprop="alternativeHeadline"]'];
        for (let sel of enSelectors) {
            let el = document.querySelector(sel);
            if (el && /[a-zA-Z]/.test(el.innerText)) return el.innerText.trim();
        }
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && /[a-zA-Z]/.test(ogTitle.content)) return ogTitle.content.replace(/^#/, '').split(':')[0].split('|')[0].trim();
        return null;
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
        if (document.visibilityState === 'hidden') return; 

        let payload = null;
        const videos = Array.from(document.querySelectorAll('video'));
        const mainVideo = videos.find(v => v.duration > 60 && !isNaN(v.duration));

        if (mainVideo) {
            let episode = '?';
            const urlMatch = window.location.href.match(/[?&](?:episode|ep)=(\d+)/);
            if (urlMatch) episode = urlMatch[1];
            
            payload = { type: "videoplayer", episode: episode, currentTime: mainVideo.currentTime, duration: mainVideo.duration, isPaused: mainVideo.paused, dubbing: 'Неизвестно' };
        } else {
            const title = getCleanTitle();
            if (title.length > 2) {
                const englishTitle = getEnglishTitle();
                payload = { type: "website", title: title, searchTitle: englishTitle || title.split(':')[0].replace(/\.\d/g, '').trim(), dubbing: getDubbing() };
            }
        }

        if (payload) chrome.runtime.sendMessage({ type: "animepresence", payload: payload });
    }, 3000);
}