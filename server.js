const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
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
        
        const response = await fetch(`https://neocities.org/api/list?site=${SITE_NAME}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const data = await response.json();
        
        const bannedFile = data.result?.files?.find(f => f.path === 'banned.json');
        if (!bannedFile) {
            console.log('⚠️ Файл banned.json не найден');
            return [];
        }
        
        const fileResponse = await fetch(`https://${SITE_NAME}.neocities.org/banned.json`);
        if (!fileResponse.ok) {
            console.log('⚠️ Не удалось скачать файл');
            return [];
        }
        
        const users = await fileResponse.json();
        console.log(`✅ Загружено пользователей: ${users.length}`);
        return users;
    } catch (error) {
        console.error('❌ Ошибка получения бан-листа:', error);
        return [];
    }
}

// ============================================================
// 2. СОХРАНЕНИЕ БАН-ЛИСТА (ПРАВИЛЬНАЯ ВЕРСИЯ)
// ============================================================
async function saveBannedUsers(users) {
    try {
        console.log('💾 Сохранение бан-листа...');
        
        // Формируем содержимое файла
        const content = JSON.stringify(users, null, 2);
        console.log('📝 Содержимое:', content);
        
        // 1-й способ: через FormData (рекомендуемый)
        const formData = new FormData();
        formData.append('file', Buffer.from(content, 'utf-8'), 'banned.json');
        
        const response = await fetch('https://neocities.org/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });
        
        const data = await response.json();
        console.log('📤 Результат сохранения:', JSON.stringify(data, null, 2));
        
        if (!response.ok || data.result !== 'success') {
            throw new Error(`Upload failed: ${response.status} ${JSON.stringify(data)}`);
        }
        
        console.log('✅ Файл успешно сохранен!');
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
        
        // Получаем текущий список
        let bannedUsers = await getBannedUsers();
        console.log('📋 Текущий бан-лист:', JSON.stringify(bannedUsers, null, 2));
        
        // Проверяем дубликат
        if (bannedUsers.some(u => u.username === username)) {
            const data = JSON.stringify({ success: false, message: `${username} уже в бане` });
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(`${callback}(${data})`);
        }
        
        // Добавляем нового
        const newBan = {
            username: username.trim(),
            reason: reason || 'Не указана',
            date: new Date().toLocaleString('ru-RU')
        };
        bannedUsers.push(newBan);
        console.log('➕ Добавлен пользователь:', JSON.stringify(newBan, null, 2));
        
        // Сохраняем
        await saveBannedUsers(bannedUsers);
        console.log('✅ Бан-лист успешно сохранен!');
        
        // Проверяем, что файл создался
        const checkResponse = await fetch(`https://${SITE_NAME}.neocities.org/banned.json`);
        console.log('🔍 Проверка файла, статус:', checkResponse.status);
        if (checkResponse.ok) {
            const content = await checkResponse.text();
            console.log('📄 Содержимое файла:', content);
        }
        
        // Отправляем ответ
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
// 5. КОРНЕВОЙ ЭНДПОИНТ
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Сервер работает!',
        site: SITE_NAME,
        endpoints: [
            '/',
            '/banned-list-jsonp?callback=test',
            '/ban-user-jsonp?username=test&reason=test&callback=test'
        ]
    });
});

// ============================================================
// 6. ЗАПУСК
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Сайт: ${SITE_NAME}.neocities.org`);
    console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);
});
