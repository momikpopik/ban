const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ВАШИ ДАННЫЕ
const API_KEY = '3744f057979c6d2524c9cc533f130dbc';
const SITE_NAME = 'daniilmogila';

// ============================================================
// 1. ПОЛУЧЕНИЕ БАН-ЛИСТА
// ============================================================
async function getBannedUsers() {
    try {
        console.log('📥 Получение бан-листа...');
        
        const response = await fetch(`https://${SITE_NAME}.neocities.org/banned.json?t=${Date.now()}`);
        
        if (!response.ok) {
            console.log(`⚠️ Файл не найден, статус: ${response.status}`);
            return [];
        }
        
        const text = await response.text();
        console.log(`📄 Содержимое файла (сырое): "${text}"`);
        
        if (!text || text.trim() === '' || text === '[]') {
            console.log('⚠️ Файл пустой, возвращаем пустой список');
            return [];
        }
        
        try {
            const users = JSON.parse(text);
            console.log(`✅ Загружено пользователей: ${users.length}`);
            return users;
        } catch (parseError) {
            console.log('⚠️ Ошибка парсинга JSON, возвращаем пустой список');
            return [];
        }
    } catch (error) {
        console.error('❌ Ошибка получения бан-листа:', error);
        return [];
    }
}

// ============================================================
// 2. СОХРАНЕНИЕ БАН-ЛИСТА (АЛЬТЕРНАТИВНЫЙ СПОСОБ)
// ============================================================
async function saveBannedUsers(users) {
    try {
        console.log('💾 Сохранение бан-листа...');
        
        if (!Array.isArray(users)) {
            users = [];
        }
        
        const content = JSON.stringify(users, null, 2);
        console.log('📝 Содержимое для сохранения:', content);
        console.log('📝 Длина содержимого:', content.length);
        
        // 🔥 АЛЬТЕРНАТИВНЫЙ СПОСОБ: Используем прямую отправку без библиотеки form-data
        const boundary = '---------------------------' + Date.now().toString(16);
        const body = [];
        
        body.push(`--${boundary}`);
        body.push('Content-Disposition: form-data; name="file"; filename="banned.json"');
        body.push('Content-Type: application/json');
        body.push('');
        body.push(content);
        body.push(`--${boundary}--`);
        
        const bodyString = body.join('\r\n');
        
        const response = await fetch('https://neocities.org/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(bodyString).toString()
            },
            body: bodyString
        });
        
        const data = await response.json();
        console.log('📤 Результат сохранения:', JSON.stringify(data, null, 2));
        
        if (!response.ok || data.result !== 'success') {
            throw new Error(`Upload failed: ${response.status} ${JSON.stringify(data)}`);
        }
        
        console.log('✅ Файл banned.json успешно сохранен!');
        
        // Проверяем несколько раз
        console.log('⏳ Проверка файла...');
        for (let attempt = 1; attempt <= 3; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const checkResponse = await fetch(`https://${SITE_NAME}.neocities.org/banned.json?t=${Date.now()}`);
            if (checkResponse.ok) {
                const text = await checkResponse.text();
                console.log(`📄 Попытка ${attempt}:`, text);
                if (text && text.trim() !== '' && text !== '[]') {
                    console.log('✅ Файл успешно обновлен!');
                    break;
                }
            }
        }
        
        return data;
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        throw error;
    }
}

// ============================================================
// 3. JSONP - ПОЛУЧЕНИЕ БАН-ЛИСТА
// ============================================================
app.get('/banned-list-jsonp', async (req, res) => {
    try {
        const callback = req.query.callback;
        console.log('📥 JSONP запрос списка, callback:', callback);
        
        if (!callback) {
            return res.status(400).json({ error: 'Missing callback' });
        }
        
        const users = await getBannedUsers();
        const data = JSON.stringify({ success: true, users });
        
        console.log(`📤 Отправка ответа с ${users.length} пользователями`);
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`${callback}(${data})`);
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        const { callback } = req.query;
        if (callback) {
            res.send(`${callback}(${JSON.stringify({ success: false, message: 'Ошибка сервера' })})`);
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// ============================================================
// 4. JSONP - БАН ПОЛЬЗОВАТЕЛЯ
// ============================================================
app.get('/ban-user-jsonp', async (req, res) => {
    try {
        const { username, reason, callback } = req.query;
        console.log(`🔨 JSONP бан запрос: username=${username}, reason=${reason}, callback=${callback}`);
        
        if (!callback) {
            return res.status(400).json({ error: 'Missing callback' });
        }
        
        if (!username || username.trim() === '') {
            const data = JSON.stringify({ success: false, message: 'Имя обязательно' });
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(`${callback}(${data})`);
        }
        
        let bannedUsers = await getBannedUsers();
        console.log('📋 Текущий бан-лист:', JSON.stringify(bannedUsers, null, 2));
        
        if (bannedUsers.some(u => u.username === username)) {
            const data = JSON.stringify({ success: false, message: `${username} уже в бане` });
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(`${callback}(${data})`);
        }
        
        const newBan = {
            username: username.trim(),
            reason: reason || 'Не указана',
            date: new Date().toLocaleString('ru-RU')
        };
        bannedUsers.push(newBan);
        console.log('➕ Добавлен пользователь:', JSON.stringify(newBan, null, 2));
        
        await saveBannedUsers(bannedUsers);
        console.log('✅ Бан-лист успешно сохранен!');
        
        const data = JSON.stringify({
            success: true,
            message: `✅ Пользователь ${username} успешно забанен!`
        });
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`${callback}(${data})`);
        
    } catch (error) {
        console.error('❌ Ошибка в /ban-user-jsonp:', error);
        const { callback } = req.query;
        if (callback) {
            const data = JSON.stringify({ success: false, message: 'Ошибка: ' + error.message });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(`${callback}(${data})`);
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// ============================================================
// 5. ТЕСТОВЫЙ ЭНДПОИНТ
// ============================================================
app.get('/test-upload', async (req, res) => {
    try {
        const testData = [{ username: 'test', reason: 'test', date: new Date().toISOString() }];
        const content = JSON.stringify(testData, null, 2);
        
        const boundary = '---------------------------' + Date.now().toString(16);
        const body = [];
        
        body.push(`--${boundary}`);
        body.push('Content-Disposition: form-data; name="file"; filename="banned.json"');
        body.push('Content-Type: application/json');
        body.push('');
        body.push(content);
        body.push(`--${boundary}--`);
        
        const bodyString = body.join('\r\n');
        
        const response = await fetch('https://neocities.org/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(bodyString).toString()
            },
            body: bodyString
        });
        
        const data = await response.json();
        res.json({ 
            uploadResult: data,
            testData: testData,
            contentLength: content.length,
            bodyLength: bodyString.length
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ============================================================
// 6. КОРНЕВОЙ ЭНДПОИНТ
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Сервер работает!',
        site: SITE_NAME,
        endpoints: [
            '/',
            '/banned-list-jsonp?callback=test',
            '/ban-user-jsonp?username=test&reason=test&callback=test',
            '/test-upload'
        ]
    });
});

// ============================================================
// 7. ЗАПУСК
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Сайт: ${SITE_NAME}.neocities.org`);
    console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);
});
