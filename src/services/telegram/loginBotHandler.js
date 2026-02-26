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
import i18n from '../../utils/i18n.js';

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
        const from = ctx.from;
        const telegramId = from.id.toString();
        const args = ctx.match?.trim();

        // 1. Check/Register User
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
              locale: 'uz', // Default, will prompt to change
            },
          });
          await prisma.wallet.create({ data: { userId: user.id } });
          
          // New user -> Always show language selection
          await this.showLanguageSelection(ctx);
          return;
        }

        // 2. Handle Login Token if present
        if (args && args.startsWith('login_')) {
          await this.handleLoginStart(ctx, args);
          return;
        }

        // 3. Regular Start -> Show Main Menu (or language selection if not set)
        await this.showMainMenu(ctx, user);
      } catch (error) {
        logger.error('Start command error:', error);
        await ctx.reply('❌ Error occurred.');
      }
    });

    // Language change command
    bot.command('lang', async (ctx) => {
      await this.showLanguageSelection(ctx);
    });

    // Callback query handler
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith('set_lang:')) {
        await this.handleLanguageSet(ctx);
        return;
      }
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
  /**
   * Show Language Selection Menu
   */
  async showLanguageSelection(ctx) {
    const keyboard = new InlineKeyboard()
      .text('🇺🇿 O\'zbekcha', 'set_lang:uz')
      .text('🇷🇺 Русский', 'set_lang:ru')
      .row()
      .text('🇺🇸 English', 'set_lang:en');

    await ctx.reply('<b>Choose your language / Tilni tanlang / Выберите язык:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  /**
   * Handle Language Selection
   */
  async handleLanguageSet(ctx) {
    try {
      const lang = ctx.callbackQuery.data.split(':')[1];
      const telegramId = ctx.from.id.toString();

      const user = await prisma.user.update({
        where: { telegramId },
        data: { locale: lang },
        include: { wallet: true }
      });

      await ctx.answerCallbackQuery();
      // await ctx.deleteMessage(); // REMOVED: No more delete
      await this.showMainMenu(ctx, user, { edit: true });
    } catch (error) {
      logger.error('Set language error:', error);
      await ctx.answerCallbackQuery('❌ Error');
    }
  }

  /**
   * Show main menu — Professional Telegram Auth
   */
  async showMainMenu(ctx, user = null, options = { edit: false }) {
    const from = ctx.from;
    const telegramId = from.id.toString();

    if (!user) {
      user = await prisma.user.findUnique({
        where: { telegramId },
        include: { wallet: true },
      });
    }

    if (!user) {
      // Should not happen with current /start logic, but for safety
      await ctx.reply('❌ User not found. Please /start');
      return;
    }

    const locale = user.locale || 'uz';
    const balance = user.wallet?.available || 0;
    const name = user.firstName || 'User';
    const frontendUrl = this.getFrontendUrl();

    // Generate signed Telegram auth URL
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

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const checkString = Object.keys(authData).sort().map(k => `${k}=${authData[k]}`).join('\n');
    const authHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const params = new URLSearchParams({
      ...authData,
      hash: authHash,
    });
    const authUrl = `${frontendUrl}/?${params.toString()}`;

    const welcomeText = i18n.t(locale, 'welcome', {
      name,
      balance: (parseFloat(balance) / 100).toFixed(2),
      miniAppUrl: `https://t.me/akhmadsnetbot/app`
    });

    const isHttp = authUrl.startsWith('http://');
    const keyboard = new InlineKeyboard();
    if (isHttp) {
      this.sessions.set(`auth_url:${telegramId}`, authUrl);
      keyboard.text(i18n.t(locale, 'auth_web'), 'authorize_web');
    } else {
      keyboard.url(i18n.t(locale, 'auth_web'), authUrl);
    }
    keyboard.row()
      .text(i18n.t(locale, 'channel'), 'channel')
      .text(i18n.t(locale, 'chat'), 'chat')
      .row();

    // ✅ Mini App requires HTTPS
    if (frontendUrl.startsWith('https://')) {
      keyboard.webApp(i18n.t(locale, 'open_mini_app'), frontendUrl);
    } else {
      keyboard.url(i18n.t(locale, 'open_mini_app'), frontendUrl);
    }

    keyboard.row()
      .text('🌐 Tilni o\'zgartirish / Change Language', 'change_lang');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const gifPath = join(__dirname, '../../../main-gif.mov');
    
    try {
      if (options.edit) {
        await ctx.editMessageCaption(welcomeText, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      } else {
        await ctx.replyWithAnimation(new InputFile(createReadStream(gifPath)), {
          caption: welcomeText,
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      }
    } catch (error) {
      // Fallback if animation fails or can't be edited
      if (options.edit) {
        await ctx.editMessageText(welcomeText, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      } else {
        await ctx.reply(welcomeText, {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        });
      }
    }
  }

  /**
   * Handle login start
   */
  async handleLoginStart(ctx, loginToken) {
    try {
      const token = loginToken.substring(6);
      const telegramId = ctx.from.id.toString();

      // Get user for locale
      const user = await prisma.user.findUnique({ where: { telegramId } });
      const locale = user?.locale || 'uz';

      // Get login session
      const session = await prisma.loginSession.findUnique({
        where: { token },
      });

      if (!session) {
        await ctx.reply(i18n.t(locale, 'login_session_not_found'));
        return;
      }

      if (new Date() > session.expiresAt) {
        await ctx.reply(i18n.t(locale, 'login_session_expired'));
        return;
      }

      if (session.authorized) {
        await ctx.reply(i18n.t(locale, 'already_logged_in'));
        return;
      }

      // Get codes from Redis
      const codesJson = await redis.get(`login_codes:${token}`);

      if (!codesJson) {
        await ctx.reply(i18n.t(locale, 'codes_not_found'));
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

      const loginText = i18n.t(locale, 'backup_login_method');

      await ctx.reply(loginText, { reply_markup: keyboard });

      logger.info(`Login initiated for user ${telegramId}`);
    } catch (error) {
      logger.error('Handle login start error:', error);
      await ctx.reply('❌ Error occurred.');
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
        await ctx.answerCallbackQuery();
        if (authUrl) {
          const user = await prisma.user.findUnique({ where: { telegramId } });
          const locale = user?.locale || 'uz';
          await ctx.reply(`🔐 ${i18n.t(locale, 'auth_web')}:`, {
            reply_markup: new InlineKeyboard().url('🌐 Enter', authUrl),
          });
        }
        return;
      }

      if (data === 'change_lang') {
        await ctx.answerCallbackQuery();
        await this.showLanguageSelection(ctx);
        return;
      }

      if (data === 'channel' || data === 'chat') {
        const user = await prisma.user.findUnique({ where: { telegramId } });
        await ctx.answerCallbackQuery(i18n.t(user?.locale || 'uz', 'coming_soon'));
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

      const { correctCode } = session;

      const user = await prisma.user.findUnique({ where: { telegramId } });
      const locale = user?.locale || 'uz';

      if (selectedCode !== correctCode) {
        await ctx.answerCallbackQuery(i18n.t(locale, 'wrong_code'));
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

      const frontendUrl = this.getFrontendUrl();
      const keyboard = new InlineKeyboard();
      
      if (frontendUrl.startsWith('https://')) {
        keyboard.webApp(i18n.t(locale, 'open_mini_app'), frontendUrl);
      } else {
        keyboard.url(i18n.t(locale, 'open_mini_app'), frontendUrl);
      }

      const successText = i18n.t(locale, 'auth_success');

      await ctx.answerCallbackQuery('✅');
      await ctx.editMessageText(successText, { 
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });

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