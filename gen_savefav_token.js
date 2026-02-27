
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

const secret = 'your-super-secret-jwt-key-minimum-64-characters-long-for-development';
const bot = {
    id: 'cmm5aew860008m3vmvzujfczk',
    ownerId: 'cmm0y5rp20006cbctkr2degk6',
    telegramBotId: '6768133581',
    username: 'SaveFavBot'
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
