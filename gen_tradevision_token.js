
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

const secret = 'your-super-secret-jwt-key-minimum-64-characters-long-for-development';
const bot = {
    id: 'cmm3xhxpd0002xgpoxu6sth1p',
    ownerId: 'cmm0y3p9s0001cbctm6n00qin',
    telegramBotId: '8426606062',
    username: 'tradevisionai_signalpilot_bot'
};

const token = jwt.sign(
    {
        botId: bot.id,
        ownerId: bot.ownerId,
        telegramBotId: bot.telegramBotId,
        username: bot.username,
    },
    secret,
    {
        expiresIn: '1y',
        issuer: 'akhmads.net',
        audience: 'bot-api',
        jwtid: nanoid(),
    }
);

console.log('REAL_TOKEN:', token);
