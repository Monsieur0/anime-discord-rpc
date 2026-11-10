# 🎌 Anime Discord Rich Presence

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-blue)](https://github.com/)

Устали от того, что в Discord не видно, какую анимешку вы смотрите? Этот проект решает проблему. Расширение для браузера в связке с локальным сервером автоматически транслирует ваш просмотр в статус Discord: название, серия, озвучка, обложка и кастомный прогресс-бар.

## ✨ Особенности
*   **Автоматическое определение:** Название аниме, номер серии и текущая озвучка (AniDUB, AniLibria и др.) парсятся прямо со страницы.
*   **Умный поиск обложек:** Каскадный поиск постеров через API (AniList, Kitsu, Shikimori, MyAnimeList). Если одна база падает — используется другая.
*   **Кастомный прогресс-бар:** Уникальная полоска из символов `▰` и `▱`, которая заполняется по мере просмотра.
*   **Игнорирование рекламы:** Скрипт не реагирует на рекламные ролики в плеере (берет только видео длиной более 60 секунд).
*   **Автономность (Watcher):** Сторожевой скрипт запускает сервер только тогда, когда открыт Discord, и убивает его, когда вы закрываете мессенджер.
*   **Полная безопасность:** Сервер не падает при потере связи, а ваш личный `Client ID` хранится в локальном конфиге и никогда не попадает в репозиторий.

## 🌐 Поддерживаемые сайты и плееры
**Сайты:**
*   YummyAnime (`yummyani.me`, `yummyanime.tv`)
*   AnimeGO (`animego.me`)
*   Wanitype (`wwwanitype.fun`)

**Плееры (iframe):**
*   Kodik
*   Aniboom
*   Alloha
*   CVH

## 🛠️ Установка

### 1. Подготовка Discord
1. Перейдите в [Discord Developer Portal](https://discord.com/developers/applications).
2. Нажмите **New Application** и задайте любое имя (оно будет отображаться в статусе).
3. Скопируйте **Application ID** (он же Client ID).
4. Перейдите в раздел **Rich Presence** -> **Art Assets** и загрузите три картинки (обязательно назовите их так):
   *   `poster` (обложка аниме по умолчанию)
   *   `play` (иконка воспроизведения)
   *   `pause` (иконка паузы)
5. Нажмите **Save Changes**.

### 2. Установка серверной части
Убедитесь, что у вас установлен [Node.js](https://nodejs.org/) версии 18 или выше.

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Monsieur0/anime-discord-rpc.git
cd anime-discord-rpc

# 2. Установите зависимости
npm install

# 3. Запустите интерактивную настройку (введите ваш Application ID)
npm run setup
