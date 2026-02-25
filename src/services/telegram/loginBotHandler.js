import { InlineKeyboard, InputFile } from 'grammy';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import telegramAuthService from '../auth/telegramAuthService.js';
import prisma from '../../config/database.js';
import hash from '../../utils/hash.js';
import redis from '../../config/redis.js';
import logger from '../../utils/logger.js';

/**
 * Login Bot Handler - GramAds Style
 * ✅ FIXED: Now fetches and passes avatar URL
 */
class LoginBotHandler {
  constructor() {
    this.sessions = new Map();
  }

  setup(bot) {
    this.bot = bot; // ✅ Store bot instance for API calls

    // /start command
    bot.command('start', async (ctx) => {
      try {
        const args = ctx.match?.trim();

        if (!args) {
          await this.showMainMenu(ctx);
          return;
        }

        if (args.startsWith('login_')) {
          await this.handleLoginStart(ctx, args);
        }
      } catch (error) {
        logger.error('Start command error:', error);
        await ctx.reply('❌ Xatolik yuz berdi.');
      }
    });

    // Callback query handler
    bot.on('callback_query:data', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    logger.info('Login bot handlers setup complete');
  }

  /**
   * Get user's profile photo URL
   */
  async getUserPhotoUrl(userId) {
    try {
      const photos = await this.bot.api.getUserProfilePhotos(userId, { limit: 1 });

      if (!photos.photos || photos.photos.length === 0 || photos.photos[0].length === 0) {
        return null;
      }

      // Get largest photo
      const photo = photos.photos[0][photos.photos[0].length - 1];
      const file = await this.bot.api.getFile(photo.file_id);

      // Construct URL
      const photoUrl = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;

      return photoUrl;
    } catch (error) {
      logger.error('Get user photo failed:', error);
      return null;
    }
  }

  /**
   * Get frontend URL based on environment
   */
  getFrontendUrl() {
    return process.env.FRONTEND_URL || 'https://akhmads.net';
  }

  /**
   * Show main menu — Professional Telegram Auth
   * Generates a signed Telegram Login Widget URL → URL button directly
   */
  async showMainMenu(ctx) {
    const from = ctx.from;
    const telegramId = from.id.toString();

    let user = await prisma.user.findUnique({
      where: { telegramId },
      include: { wallet: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
          role: 'ADVERTISER',
          isActive: true,
        },
      });
      await prisma.wallet.create({ data: { userId: user.id } });
    }

    const balance = user.wallet?.available || 0;
    const name = user.firstName || 'User';
    const frontendUrl = this.getFrontendUrl();

    // ── Generate signed Telegram auth URL ──────────────────────────────────
    const photoUrl = await this.getUserPhotoUrl(from.id);
    const authDate = Math.floor(Date.now() / 1000);

    const authData = {
      id: from.id,
      first_name: from.first_name,
      ...(from.last_name && { last_name: from.last_name }),
      ...(from.username && { username: from.username }),
      ...(photoUrl && { photo_url: photoUrl }),
      auth_date: authDate,
    };

    // HMAC-SHA256 hash (Telegram Login Widget spec)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const checkString = Object.keys(authData).sort().map(k => `${k}=${authData[k]}`).join('\n');
    const authHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const params = new URLSearchParams({
      ...authData,
      hash: authHash,
    });
    const authUrl = `${frontendUrl}/?${params.toString()}`;
    // ──────────────────────────────────────────────────────────────────────

    const welcomeText = `✨ AKHMADS.NET\nTelegram Ad Network\n\n👤 ${name}\n💰 Balance: $${(parseFloat(balance) / 100).toFixed(2)}\n\n🌐 Blog · 💬 Support · 📱 Telegram Mini App`;

    // Helper: UTF-16 offset + length hisoblash
    const getEmojiEntity = (str, searchEmoji, customEmojiId) => {
      const idx = str.indexOf(searchEmoji);
      if (idx === -1) return null;
      let offset = 0;
      for (let i = 0; i < idx;) {
        const cp = str.codePointAt(i);
        offset += cp > 0xFFFF ? 2 : 1;
        i += cp > 0xFFFF ? 2 : 1;
      }
      const cp = str.codePointAt(idx);
      return { type: 'custom_emoji', offset, length: cp > 0xFFFF ? 2 : 1, custom_emoji_id: customEmojiId };
    };

    const messageEntities = [
      getEmojiEntity(welcomeText, '✨', '5890925363067886150'),
      getEmojiEntity(welcomeText, '👤', '5260399854500191689'),
      getEmojiEntity(welcomeText, '💰', '5904462880941545555'),
      getEmojiEntity(welcomeText, '🌐', '5776233299424843260'),
      getEmojiEntity(welcomeText, '💬', '5904248647972820334'),
      getEmojiEntity(welcomeText, '📱', '6033070647213560346'),
    ].filter(Boolean);

    // Telegram faqat https:// URL larni qabul qiladi
    // Localhost (http://) uchun callback button ishlatamiz
    const isHttp = authUrl.startsWith('http://');
    const keyboard = new InlineKeyboard();
    if (isHttp) {
      // localhost: authUrl ni sessions'ga saqlaymiz, callback orqali beramiz
      this.sessions.set(`auth_url:${telegramId}`, authUrl);
      keyboard.text('🌐 Авторизоваться', 'authorize_web');
    } else {
      keyboard.url('🌐 Авторизоваться', authUrl);
    }
    keyboard.row().text('📁 Channel', 'channel').text('💬 Chat', 'chat');

    // GIF + caption + keyboard — bitta xabarda
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const gifPath = join(__dirname, '../../../main-gif.mov');
    await ctx.replyWithAnimation(new InputFile(createReadStream(gifPath)), {
      caption: welcomeText,
      caption_entities: messageEntities,
      reply_markup: keyboard,
    });
  }

  /**
   * Handle login start
   */
  async handleLoginStart(ctx, loginToken) {
    try {
      const token = loginToken.substring(6);
      const telegramId = ctx.from.id.toString();

      // Get login session
      const session = await prisma.loginSession.findUnique({
        where: { token },
      });

      if (!session) {
        await ctx.reply('❌ Login sessiyasi topilmadi yoki muddati o\'tgan.');
        return;
      }

      if (new Date() > session.expiresAt) {
        await ctx.reply('❌ Login sessiyasi muddati tugagan.');
        return;
      }

      if (session.authorized) {
        await ctx.reply('✅ Siz allaqachon login qilgansiz.');
        return;
      }

      // Get codes from Redis
      const codesJson = await redis.get(`login_codes:${token}`);

      if (!codesJson) {
        await ctx.reply('❌ Kodlar topilmadi. Qaytadan login qiling.');
        return;
      }

      const codes = JSON.parse(codesJson);
      const correctCode = session.correctCode;

      console.log('🔍 Bot handler codes:', { codes, correctCode });

      // Store in memory
      this.sessions.set(telegramId, {
        loginToken: token,
        correctCode: correctCode,
        codes: codes,
      });

      const keyboard = new InlineKeyboard();

      // Add 4 code buttons
      codes.forEach((code, idx) => {
        keyboard.text(code, `code_${token}_${code}`);
        if (idx % 2 === 1) keyboard.row();
      });

      const loginText = `
This is a backup login method
What code do you currently see in the browser?
`;

      await ctx.reply(loginText, { reply_markup: keyboard });

      logger.info(`Login initiated for user ${telegramId}`);
    } catch (error) {
      logger.error('Handle login start error:', error);
      await ctx.reply('❌ Xatolik yuz berdi.');
    }
  }

  /**
  * Handle callback queries
  */
  async handleCallbackQuery(ctx) {
    try {
      const data = ctx.callbackQuery.data;
      const telegramId = ctx.from.id.toString();

      console.log('🔍 Callback data:', data);

      if (data === 'authorize_web') {
        const authUrl = this.sessions.get(`auth_url:${telegramId}`);
        await ctx.answerCallbackQuery(); // spinner'ni o'chiramiz
        if (authUrl) {
          await ctx.reply('🔐 Login qilish uchun:', {
            reply_markup: new InlineKeyboard().url('🌐 Kirish', authUrl),
          });
        }
        return;
      }

      if (data === 'channel' || data === 'chat') {
        await ctx.answerCallbackQuery('Coming soon!');
        return;
      }

      if (data.startsWith('code_')) {
        const parts = data.split('_');
        const selectedCode = parts[parts.length - 1];
        const tokenParts = parts.slice(1, parts.length - 1);
        const token = tokenParts.join('_');

        console.log('🔍 Parsed:', { token, selectedCode });

        await this.handleCodeSelection(ctx, token, selectedCode, telegramId);
      }
    } catch (error) {
      logger.error('Handle callback query error:', error);
      await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
    }
  }

  /**
   * Handle code selection
   * ✅ FIXED: Now fetches and passes avatar URL
   */
  async handleCodeSelection(ctx, loginToken, selectedCode, telegramId) {
    try {
      const session = this.sessions.get(telegramId);

      if (!session) {
        await ctx.answerCallbackQuery('❌ Sessiya topilmadi');
        return;
      }

      const { correctCode } = session;

      if (selectedCode !== correctCode) {
        await ctx.answerCallbackQuery('❌ Noto\'g\'ri kod');
        return;
      }

      // ✅ FETCH AVATAR URL
      const photoUrl = await this.getUserPhotoUrl(ctx.from.id);

      logger.info(`Fetched avatar for user ${telegramId}: ${photoUrl || 'no photo'}`);

      // ✅ PASS TELEGRAM DATA WITH AVATAR
      const result = await telegramAuthService.verifyLogin(
        loginToken,
        telegramId,
        selectedCode,
        {
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username,
          language_code: ctx.from.language_code,
          photo_url: photoUrl,  // ✅ AVATAR URL
        }
      );

      const keyboard = new InlineKeyboard()
        .text('🌐 Open Mini App', 'mini_app');

      const successText = `
✅ Вы авторизовались в браузере

You have logged in on your browser
`;

      await ctx.answerCallbackQuery('✅ Muvaffaqiyatli!');
      await ctx.editMessageText(successText, { reply_markup: keyboard });

      this.sessions.delete(telegramId);

      logger.info(`User ${telegramId} logged in successfully with avatar`);
    } catch (error) {
      logger.error('Handle code selection error:', error);
      await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
    }
  }
}

const loginBotHandler = new LoginBotHandler();
export default loginBotHandler;