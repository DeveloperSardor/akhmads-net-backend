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
import { messageToHtml } from '../../utils/telegram-html.js';

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

        // 2. Handle Deep Linking
        if (args && args.startsWith('login_')) {
          await this.handleLoginStart(ctx, args);
          return;
        }

        if (args === 'add_ad') {
          await this.showHowToAddAd(ctx, user);
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

    // Handle incoming messages (Potential ads)
    bot.on('message', async (ctx) => {
      try {
        if (ctx.message.text?.startsWith('/')) return;

        const from = ctx.from;
        const telegramId = from.id.toString();
        const user = await prisma.user.findUnique({ where: { telegramId } });
        
        if (!user) return;
        const isAdvertiser = user.role === 'ADVERTISER' || (user.roles && user.roles.includes('ADVERTISER'));
        if (!isAdvertiser) return;

        const sessionKey = `ad_session:${telegramId}`;
        const sessionJson = await redis.get(sessionKey);

        if (sessionJson) {
          const session = JSON.parse(sessionJson);
          
          if (session.step === 'AWAITING_BUTTON_TEXT') {
            session.temp = { buttonText: ctx.message.text };
            session.step = 'AWAITING_BUTTON_URL';
            await redis.set(sessionKey, JSON.stringify(session), 3600);
            await ctx.reply("<b>Zo'r! Endi bu tugma qaysi manzilga (URL) olib borishini yuboring:</b>\n<i>(Masalan: https://t.me/kanal_nomi)</i>", { parse_mode: 'HTML' });
            return;
          }

          if (session.step === 'AWAITING_BUTTON_URL') {
            const url = ctx.message.text;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              await ctx.reply("❌ Iltimos, to'g'ri URL manzil kiriting (http:// yoki https:// bilan boshlanishi kerak):");
              return;
            }

            session.temp.buttonUrl = url;
            session.step = 'AWAITING_BUTTON_COLOR';
            await redis.set(sessionKey, JSON.stringify(session), 3600);

            const colorKb = new InlineKeyboard()
              .add({ text: '🔵 Ko\'k', callback_data: 'draft_btn_color_blue' })
              .add({ text: '🟢 Yashil', callback_data: 'draft_btn_color_green' }).row()
              .add({ text: '🔴 Qizil', callback_data: 'draft_btn_color_red' })
              .add({ text: '🟣 Binafsha', callback_data: 'draft_btn_color_violet' }).row()
              .add({ text: '🟠 To\'q sariq', callback_data: 'draft_btn_color_orange' })
              .add({ text: '⚪ Oddiy (standart)', callback_data: 'draft_btn_color_default' });

            await ctx.reply("<b>🎨 Tugma rangini tanlang:</b>", { parse_mode: 'HTML', reply_markup: colorKb });
            return;
          }

          if (session.step === 'AWAITING_IMPRESSIONS') {
            const impressions = parseInt(ctx.message.text);
            if (isNaN(impressions) || impressions < 100) {
              await ctx.reply("❌ Iltimos, 100 dan katta butun son (kamida 100) kiriting:");
              return;
            }
            session.draft.targetImpressions = impressions;
            session.step = 'DRAFT_MENU';
            await redis.set(sessionKey, JSON.stringify(session), 3600);
            await this.renderDraftMenu(ctx, telegramId, session.draft, true);
            return;
          }
        }

        // Initialize Draft Session
        const text = ctx.message.text || ctx.message.caption || '';
        const entities = ctx.message.entities || ctx.message.caption_entities || [];
        const htmlContent = messageToHtml(text, entities);

        let mediaUrl = null;
        let mediaType = 'NONE';

        if (ctx.message.photo) {
          const photo = ctx.message.photo[ctx.message.photo.length - 1];
          const file = await ctx.api.getFile(photo.file_id);
          mediaUrl = file.file_path; 
          mediaType = 'IMAGE';
        } else if (ctx.message.video) {
          mediaUrl = ctx.message.video.file_id;
          mediaType = 'VIDEO';
        }

        const draft = {
          userId: user.id,
          text: text,
          htmlContent: htmlContent,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          media_file_id: mediaUrl,
          buttons: [],
          targetImpressions: 1000,
          targeting: { aiSegments: [] }
        };

        const session = { step: 'AWAITING_CATEGORIES', draft: draft };
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await this.renderCategoryMenu(ctx, telegramId, draft, true);

      } catch (error) {
        logger.error('Message handler error:', error);
      }
    });

    // Callback query handler
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith('set_lang:')) {
        await this.handleLanguageSet(ctx);
        return;
      }
      if (data.startsWith('draft_')) {
        await this.handleDraftInteractions(ctx, data);
        return;
      }
      await this.handleCallbackQuery(ctx);
    });

    logger.info('Login bot handlers setup complete');
  }

  async renderCategoryMenu(ctx, telegramId, draft, isNew = false) {
    const cats = [
      { id: 'tech', label: 'Tech Enthusiasts' },
      { id: 'shoppers', label: 'Active Shoppers' },
      { id: 'gamers', label: 'Gamers' },
      { id: 'crypto', label: 'Crypto Traders' }
    ];
    
    const kb = new InlineKeyboard();
    const curr = draft.targeting?.aiSegments || [];
    
    cats.forEach(cat => {
      const isSelected = curr.includes(cat.id);
      kb.add({ text: `${isSelected ? '✅' : '⬜️'} ${cat.label}`, callback_data: `draft_toggle_cat_${cat.id}` }).row();
    });
    
    kb.add({ text: "➡️ Keyingi qadam (Impressionlar)", callback_data: "draft_next_impressions", style: "primary" });
    
    const text = "<b>🎯 Auditoriyani tanlang (Smart Targeting)</b>\n<i>Qaysi turdagi foydalanuvchilar reklamangizni ko'rishini xohlaysiz? (Bir nechtasini tanlashingiz mumkin):</i>";
    
    if (isNew) {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  async renderImpressionsMenu(ctx, telegramId, draft, isNew = false) {
    const kb = new InlineKeyboard()
      .add({ text: "1,000 ta", callback_data: "draft_set_imp_1000" })
      .add({ text: "5,000 ta", callback_data: "draft_set_imp_5000" }).row()
      .add({ text: "10,000 ta", callback_data: "draft_set_imp_10000" })
      .add({ text: "50,000 ta", callback_data: "draft_set_imp_50000" });
      
    const text = "<b>👁‍🗨 Necha kishi ko'rishini xohlaysiz?</b>\n<i>Variantlardan birini tanlang yoki chatga raqam yozib yuboring (kamida 100 ta bo'lishi kerak):</i>";
    
    if (isNew) {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  async renderDraftMenu(ctx, telegramId, draft, isNew = false) {
    const cost = ((draft.targetImpressions || 1000) / 1000) * 10.0;
    const cats = draft.targeting?.aiSegments || [];
    
    const keyboard = new InlineKeyboard()
      .add({ text: "👁 Qanday ko'rinadi? (Prevyu)", callback_data: "draft_preview", style: "primary" }).row()
      .add({ text: "➕ Tugma qo'shish", callback_data: "draft_add_button" })
      .add({ text: `🎯 Auditoriyani o'zgartirish`, callback_data: "draft_back_categories" }).row()
      .add({ text: `👁‍🗨 Soni: ${draft.targetImpressions} ta`, callback_data: "draft_next_impressions" }).row()
      .add({ text: `✅ Xarid qilish va Saqlash ($${cost.toFixed(2)})`, callback_data: "draft_submit", style: "success" }).row()
      .add({ text: "❌ Bekor qilish", callback_data: "draft_cancel", style: "danger" });

    const colorEmojis = { blue: '🔵', green: '🟢', red: '🔴', violet: '🟣', orange: '🟠', default: '⚪' };
    const btnList = (draft.buttons || []).map((b, i) => {
      const ce = colorEmojis[b.color] || '⚪';
      return `  ${i + 1}. ${ce} ${b.text}`;
    }).join('\n');

    const messageText = `<b>📝 Reklama loyihasi (Umumiy Xulosa)</b>\n\n` +
      `${draft.mediaType !== 'NONE' ? `📎 <b>Media:</b> ${draft.mediaType}\n` : ''}` +
      `<b>Tugmalar:</b> ${draft.buttons?.length || 0} ta\n` +
      `${btnList ? btnList + '\n' : ''}` +
      `<b>Tanlangan auditoriya:</b> ${cats.length > 0 ? cats.join(', ') : 'Barcha foydalanuvchilar'}\n` +
      `<b>Taassurotlar (Ko'rishlar):</b> ${draft.targetImpressions} ta\n` +
      `<b>Umumiy Narx:</b> $${cost.toFixed(2)}\n\n` +
      `<i>Matn:</i>\n${draft.htmlContent.substring(0, 200)}${draft.htmlContent.length > 200 ? '...' : ''}`;

    if (isNew) {
      await ctx.reply(messageText, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.editMessageText(messageText, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  }

  async handleDraftInteractions(ctx, data) {
    try {
      const telegramId = ctx.from.id.toString();
      const sessionKey = `ad_session:${telegramId}`;
      const sessionJson = await redis.get(sessionKey);

      if (!sessionJson) {
        await ctx.answerCallbackQuery("❌ Sessiya eskirgan. Qaytadan boshlang.");
        return;
      }

      const session = JSON.parse(sessionJson);
      await ctx.answerCallbackQuery();

      if (data.startsWith('draft_toggle_cat_')) {
        const catId = data.replace('draft_toggle_cat_', '');
        if (!session.draft.targeting.aiSegments) session.draft.targeting.aiSegments = [];
        const index = session.draft.targeting.aiSegments.indexOf(catId);
        if (index > -1) session.draft.targeting.aiSegments.splice(index, 1);
        else session.draft.targeting.aiSegments.push(catId);
        
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await this.renderCategoryMenu(ctx, telegramId, session.draft, false);
        return;
      }
      
      if (data === 'draft_next_impressions') {
        session.step = 'AWAITING_IMPRESSIONS';
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await this.renderImpressionsMenu(ctx, telegramId, session.draft, false);
        return;
      }
      
      if (data === 'draft_back_categories') {
        session.step = 'AWAITING_CATEGORIES';
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await this.renderCategoryMenu(ctx, telegramId, session.draft, false);
        return;
      }
      
      if (data.startsWith('draft_set_imp_')) {
        const imp = parseInt(data.replace('draft_set_imp_', ''));
        session.draft.targetImpressions = imp;
        session.step = 'DRAFT_MENU';
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await this.renderDraftMenu(ctx, telegramId, session.draft, false);
        return;
      }

      if (data === 'draft_preview') {
        const colorStyles = { blue: 'primary', green: 'positive', red: 'destructive', violet: 'primary', orange: 'destructive', default: undefined };
        const colorEmojis = { blue: '🔵', green: '🟢', red: '🔴', violet: '🟣', orange: '🟠', default: '' };
        const keyboard = new InlineKeyboard();
        if (session.draft.buttons && session.draft.buttons.length > 0) {
          session.draft.buttons.forEach(btn => {
            const emoji = colorEmojis[btn.color] || '';
            const label = emoji ? `${emoji} ${btn.text}` : btn.text;
            const style = colorStyles[btn.color];
            const buttonObj = { text: label, url: btn.url };
            if (style) buttonObj.style = style;
            keyboard.add(buttonObj).row();
          });
        }
        const previewMsg = `<b>[Prevyu]</b>\n\n${session.draft.htmlContent}`;
        await ctx.reply(previewMsg, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      if (data.startsWith('draft_btn_color_')) {
        const color = data.replace('draft_btn_color_', '');
        if (!session.draft.buttons) session.draft.buttons = [];
        session.draft.buttons.push({
          text: session.temp.buttonText,
          url: session.temp.buttonUrl,
          color: color
        });
        session.temp = null;
        session.step = 'DRAFT_MENU';
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        const colorNames = { blue: '🔵 Ko\'k', green: '🟢 Yashil', red: '🔴 Qizil', violet: '🟣 Binafsha', orange: '🟠 To\'q sariq', default: '⚪ Oddiy' };
        await ctx.editMessageText(`✅ Tugma qo'shildi!\nRang: ${colorNames[color] || color}`, { parse_mode: 'HTML' });
        await this.renderDraftMenu(ctx, telegramId, session.draft, true);
        return;
      }

      if (data === 'draft_add_button') {
        session.step = 'AWAITING_BUTTON_TEXT';
        await redis.set(sessionKey, JSON.stringify(session), 3600);
        await ctx.reply("<b>Tugma yozuvini yuboring:</b>\n<i>(Masalan: 🌐 Saytga o'tish)</i>", { parse_mode: 'HTML' });
        return;
      }

      if (data === 'draft_submit') {
        await this.handleAdCreationFromDraft(ctx, session.draft, sessionKey);
        return;
      }

      if (data === 'draft_cancel') {
        await redis.del(sessionKey);
        await ctx.editMessageText("❌ Reklama loyihasi bekor qilindi.", { parse_mode: 'HTML' });
        return;
      }

    } catch (error) {
      logger.error('Draft interaction error:', error);
      await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
    }
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
    }) + (user.role === 'ADVERTISER' || (user.roles && user.roles.includes('ADVERTISER')) ? `\n\n📢 <b>Reklama berish:</b> Shunchaki botga matn yoki rasm/video yuboring!` : '');

    const isHttp = authUrl.startsWith('http://');
    const emojiIds = i18n.emojis(locale);
    const keyboard = new InlineKeyboard();

    keyboard
      .add({ 
        text: i18n.t(locale, 'channel') + " ↗️", 
        callback_data: 'channel', 
        icon_custom_emoji_id: emojiIds.pencil 
      })
      .add({ 
        text: i18n.t(locale, 'chat') + " ↗️", 
        callback_data: 'chat', 
        icon_custom_emoji_id: emojiIds.chat 
      })
      .row();

    // 1.5. Add Ad via Bot (For Advertisers)
    if (user.role === 'ADVERTISER' || (user.roles && user.roles.includes('ADVERTISER'))) {
      keyboard.add({
        text: "📢 Reklama qo'shish (Bot)",
        callback_data: 'how_to_add_ad'
      }).row();
    }

    // 2. Authorize (PRIMARY BLUE)
    if (isHttp) {
      this.sessions.set(`auth_url:${telegramId}`, authUrl);
      keyboard.add({ 
        text: i18n.t(locale, 'auth_web'), 
        callback_data: 'authorize_web',
        style: 'primary', 
        icon_custom_emoji_id: emojiIds.play 
      });
    } else {
      keyboard.add({ 
        text: i18n.t(locale, 'auth_web'), 
        url: authUrl,
        style: 'primary', 
        icon_custom_emoji_id: emojiIds.play 
      });
    }
    keyboard.row();

    // 3. Mini App
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

      if (data === 'how_to_add_ad') {
        const user = await prisma.user.findUnique({ where: { telegramId } });
        await ctx.answerCallbackQuery();
        await this.showHowToAddAd(ctx, user);
        return;
      }

      if (data.startsWith('create_ad_')) {
        const draftId = data.replace('create_ad_', '');
        await this.handleAdCreationFromDraft(ctx, draftId);
        return;
      }

      if (data === 'cancel_ad') {
        const user = await prisma.user.findUnique({ where: { telegramId } });
        await ctx.answerCallbackQuery();
        await ctx.editMessageText("❌ Reklama bekor qilindi.");
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

  /**
   * Handle ad creation from draft
   */
  async handleAdCreationFromDraft(ctx, draft, sessionKey) {
    try {
      if (!draft) {
        await ctx.answerCallbackQuery("❌ Draft topilmadi yoki muddati o'tgan.");
        return;
      }
      
      // Calculate basic pricing
      const targetImpressions = draft.targetImpressions || 1000;
      const baseCpm = 10.0;
      const totalCost = (targetImpressions / 1000) * baseCpm;

      // Create ad in database
      const ad = await prisma.ad.create({
        data: {
          advertiserId: draft.userId,
          title: "Ad via Bot " + new Date().toLocaleDateString(),
          text: draft.text,
          htmlContent: draft.htmlContent,
          mediaUrl: draft.mediaUrl,
          mediaType: draft.mediaType,
          contentType: 'HTML',
          status: 'PENDING', // Needs moderation
          buttons: draft.buttons || [],
          targeting: draft.targeting || {},
          targetImpressions: targetImpressions, 
          totalCost: totalCost, 
          remainingBudget: totalCost,
          deliveredImpressions: 0,
          baseCpm: baseCpm,
          finalCpm: baseCpm,
          platformFee: totalCost * 0.1, // 10% fee example
          botOwnerRevenue: totalCost * 0.9,
        }
      });

      await ctx.answerCallbackQuery("✅");
      await ctx.editMessageText(`✅ <b>Reklama muvaffaqiyatli saqlandi!</b>\n\nID: <code>${ad.id}</code>\nTaassurotlar: <b>${targetImpressions}</b>\nStatus: <b>Kutilmoqda (PENDING)</b>\n\n<i>Moderatsiyadan so'ng tarqatish boshlanadi.</i>`, {
        parse_mode: 'HTML'
      });

      // Cleanup session
      if (sessionKey) {
        await redis.del(sessionKey);
      }
      
      logger.info(`Ad created from bot draft: ${ad.id}`);
    } catch (error) {
      logger.error('Handle ad creation from draft error:', error);
      await ctx.answerCallbackQuery('❌ Xatolik yuz berdi');
    }
  }

  /**
   * Show how to add ad instructions
   */
  async showHowToAddAd(ctx, user) {
    const locale = user?.locale || 'uz';
    const text = i18n.t(locale, 'how_to_add_ad_desc') || 
      "<b>Bot orqali reklama qo'shish juda oson!</b>\n\nShunchaki botga matnli xabar yoki rasm/video (caption bilan) yuboring. Bot uni avtomatik ravishda qoralama sifatida saqlaydi va sizga tasdiqlash uchun yuboradi.";
    
    await ctx.reply(text, {
      parse_mode: 'HTML'
    });
  }
}

const loginBotHandler = new LoginBotHandler();
export default loginBotHandler;