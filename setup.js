const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("=========================================");
console.log("🎌 Установка Anime Discord Rich Presence");
console.log("=========================================\n");
console.log("Где взять этот ебучий CLIENT_ID?");
console.log("1. Иди на https://discord.com/developers/applications");
console.log("2. Жми New Application (или открой старое)");
console.log("3. Скопируй Application ID (он же Client ID), вставь сюда и не задавай вопросов.\n");

rl.question("Вставь свой Application ID: ", (answer) => {
    const clientId = answer.trim();

    // Жесткая проверка, чтобы пользователь не вставил сюда какую-нибудь хуйню
    if (!/^\d{17,20}$/.test(clientId)) {
        console.error("\n❌ Ошибка: Это не похоже на Discord ID. Он должен состоять из 17-20 цифр.");
        console.error("Ты вставил какую-то хуйню. Попробуй еще раз.");
        rl.close();
        process.exit(1);
    }

    const config = {
        clientId: clientId,
        port: 3000,
    };

    const configPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

    console.log(`\n✅ Конфиг создан! (config.json)`);
    console.log("Всё, теперь запускай сторож командой: npm run watch");
    
    rl.close();
});