const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ВАШИ ДАННЫЕ
const API_KEY = '3744f057979c6d2524c9cc533f130dbc';
const SITE_NAME = 'daniilmogila';

// Получение бан-листа
async function getBannedUsers() {
    try {
        const response = await fetch(`https://neocities.org/api/list?site=${SITE_NAME}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const data = await response.json();
        console.log('Ответ API list:', data);
        
        const bannedFile = data.result?.files?.find(f => f.path === 'banned.json');
        if (!bannedFile) {
            console.log('Файл banned.json не найден');
            return [];
        }
        
        const fileResponse = await fetch(`https://${SITE_NAME}.neocities.org/banned.json`);
        const users = await fileResponse.json();
        console.log('Загружено пользователей:', users.length);
        return users;
    } catch (error) {
        console.error('Ошибка получения бан-листа:', error);
        return [];
    }
}

// Сохранение бан-листа
async function saveBannedUsers(users) {
    const content = JSON.stringify(users, null, 2);
    const base64Content = Buffer.from(content).toString('base64');
    
    const response = await fetch('https://neocities.org/api/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            files: [{ path: 'banned.json', content: base64Content }]
        })
    });
    
    const data = await response.json();
    console.log('Результат сохранения:', data);
    return data;
}

// 🔥 НОВЫЙ JSONP ЭНДПОИНТ
app.get('/banned-list-jsonp', async (req, res) => {
    try {
        const callback = req.query.callback;
        console.log('JSONP запрос получен, callback:', callback);
        
        const users = await getBannedUsers();
        const data = JSON.stringify({ success: true, users });
        
        if (callback) {
            // JSONP ответ
            res.setHeader('Content-Type', 'application/javascript');
            res.send(`${callback}(${data})`);
        } else {
            // Обычный JSON ответ
            res.json({ success: true, users });
        }
    } catch (error) {
        console.error('Ошибка в /banned-list-jsonp:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки' });
    }
});

// Эндпоинт для бана
app.post('/ban-user', async (req, res) => {
    try {
        const { username, reason } = req.body;
        console.log('Получен запрос на бан:', username);
        
        if (!username) {
            return res.status(400).json({ success: false, message: 'Имя пользователя обязательно' });
        }
        
        let bannedUsers = await getBannedUsers();
        if (bannedUsers.some(u => u.username === username)) {
            return res.json({ success: false, message: `Пользователь ${username} уже в бан-листе` });
        }
        
        const newBan = {
            username,
            reason: reason || 'Не указана',
            date: new Date().toLocaleString('ru-RU')
        };
        bannedUsers.push(newBan);
        await saveBannedUsers(bannedUsers);
        
        res.json({ success: true, message: `✅ Пользователь ${username} успешно забанен!` });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
});

// Корневой эндпоинт
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Сервер работает!',
        site: SITE_NAME
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Сайт: ${SITE_NAME}.neocities.org`);
});
