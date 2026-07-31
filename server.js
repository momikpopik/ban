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

// ============================================================
// 1. ПОЛУЧЕНИЕ БАН-ЛИСТА (из файла banned.json)
// ============================================================
async function getBannedUsers() {
    try {
        const response = await fetch(`https://neocities.org/api/list?site=${SITE_NAME}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const data = await response.json();
        console.log('API list ответ:', data);
        
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

// ============================================================
// 2. СОХРАНЕНИЕ БАН-ЛИСТА (в файл banned.json)
// ============================================================
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

// ============================================================
// 3. JSONP - ПОЛУЧЕНИЕ БАН-ЛИСТА (для banned.html)
// ============================================================
app.get('/banned-list-jsonp', async (req, res) => {
    try {
        const callback = req.query.callback;
        console.log('JSONP запрос списка, callback:', callback);
        
        if (!callback) {
            return res.status(400).json({ error: 'Missing callback' });
        }
        
        const users = await getBannedUsers();
        const data = JSON.stringify({ success: true, users });
        
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`${callback}(${data})`);
        
    } catch (error) {
        console.error('Ошибка в /banned-list-jsonp:', error);
        const { callback } = req.query;
        if (callback) {
            res.send(`${callback}(${JSON.stringify({ success: false, message: 'Ошибка сервера' })})`);
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// ============================================================
// 4. JSONP - БАН ПОЛЬЗОВАТЕЛЯ (для index.html)
// ============================================================
app.get('/ban-user-jsonp', async (req, res) => {
    try {
        const { username, reason, callback } = req.query;
        console.log('🔨 JSONP бан запрос:', { username, reason, callback });
        
        // Проверяем callback
        if (!callback) {
            return res.status(400).json({ error: 'Missing callback parameter' });
        }
        
        // Проверяем username
        if (!username || username.trim() === '') {
            const data = JSON.stringify({ 
                success: false, 
                message: 'Имя пользователя обязательно' 
            });
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(`${callback}(${data})`);
        }
        
        // Получаем текущий бан-лист
        let bannedUsers = await getBannedUsers();
        console.log('Текущий бан-лист:', bannedUsers);
        
        // Проверяем, не забанен ли уже
        if (bannedUsers.some(u => u.username === username)) {
            const data = JSON.stringify({ 
                success: false, 
                message: `Пользователь ${username} уже в бан-листе` 
            });
            res.setHeader('Content-Type', 'application/javascript');
            return res.send(`${callback}(${data})`);
        }
        
        // Добавляем нового пользователя
        const newBan = {
            username: username.trim(),
            reason: reason || 'Не указана',
            date: new Date().toLocaleString('ru-RU')
        };
        bannedUsers.push(newBan);
        
        // Сохраняем обновленный список
        await saveBannedUsers(bannedUsers);
        console.log('✅ Пользователь добавлен в бан-лист');
        
        // Отправляем успешный ответ
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
            const data = JSON.stringify({ 
                success: false, 
                message: 'Внутренняя ошибка сервера: ' + error.message 
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(`${callback}(${data})`);
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// ============================================================
// 5. КОРНЕВОЙ ЭНДПОИНТ (проверка работы)
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
// 6. ЗАПУСК СЕРВЕРА
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Сайт: ${SITE_NAME}.neocities.org`);
    console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);
});
