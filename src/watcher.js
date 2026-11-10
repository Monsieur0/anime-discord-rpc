const psListModule = require('ps-list');
const { spawn } = require('child_process');
const path = require('path');

// Ебаная ESM-библиотека, которую надо вызывать через .default
const psList = psListModule.default || psListModule;

let serverProcess = null;
let isDiscordRunning = false;
let startTimeout = null;

// ПРАВИЛЬНЫЙ ПУТЬ: Берем папку, где лежит этот watcher.js (то есть src), и добавляем server.js
const SERVER_PATH = path.join(__dirname, 'server.js');

async function checkProcesses() {
    try {
        const processes = await psList();
        const discord = processes.find(p => p.name.toLowerCase().includes('discord'));
        
        if (discord && !isDiscordRunning) {
            isDiscordRunning = true;
            console.log('✅ Дискорд найден! Жду 8 секунд...');
            
            startTimeout = setTimeout(() => {
                if (!serverProcess && isDiscordRunning) {
                    console.log(`🚀 Запускаю сервер по пути: ${SERVER_PATH}...`);
                    serverProcess = spawn(process.execPath, [SERVER_PATH], { stdio: 'inherit' });
                }
            }, 8000); 
            
        } else if (!discord && isDiscordRunning) {
            isDiscordRunning = false;
            console.log('🛑 Дискорд закрыт. Убиваю сервер...');
            if (startTimeout) clearTimeout(startTimeout);
            if (serverProcess) {
                serverProcess.kill();
                serverProcess = null;
            }
        }
    } catch (error) {
        console.error('Ошибка при чтении процессов:', error.message);
    }
}

console.log('👀 Сторож запущен. Жду запуск Дискорда...');
setInterval(checkProcesses, 5000);
checkProcesses();