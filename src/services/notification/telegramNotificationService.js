import { Bot, InlineKeyboard } from 'grammy';
import logger from '../../utils/logger.js';

/**
 * Telegram Notification Service
 * Sends system notifications to users (advertisers & bot owners)
 */
class TelegramNotificationService {
  constructor() {
    this.bot = null;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      this.bot = new Bot(token);
      logger.info('Telegram Notification Bot initialized');
    } else {
      logger.warn('TELEGRAM_BOT_TOKEN not found. Telegram notifications disabled.');
    }
  }

  /**
   * Send a general notification
   */
  async sendNotification(telegramId, text, replyMarkup = null) {
    if (!this.bot) return false;
    try {
      await this.bot.api.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      return true;
    } catch (err) {
      logger.error(`Failed to send TG notification to ${telegramId}:`, err.message);
      return false;
    }
  }

  /**
   * Notify bot owner about new broadcast moderation
   */
  async notifyNewBroadcast(ownerTelegramId, botUsername, broadcastId) {
    const text = `
<b>🔔 Yangi reklama moderatsiyasi!</b>

Bot: @${botUsername}
Sizning botingizda yangi reklama (rassilka) yubormoqchi. Iltimos, uni ko'rib chiqing va tasdiqlang yoki rad eting.

Moderatsiya sahifasiga o'tish:
<a href="${process.env.FRONTEND_URL}/uz/moderation">O'tish</a>
    `;

    const keyboard = new InlineKeyboard()
      .url('Moderatsiya sahifasiga o\'tish', `${process.env.FRONTEND_URL}/uz/moderation`);

    return await this.sendNotification(ownerTelegramId, text, keyboard);
  }

  /**
   * Notify advertiser about broadcast result
   */
  async notifyBroadcastStatus(advertiserTelegramId, broadcastId, status, reason = null) {
    const statusText = status === 'APPROVED' ? '✅ Tasdiqlandi' : '❌ Rad etildi';
    const text = `
<b>📢 Reklama holati o'zgardi</b>

Sizning reklamangiz (ID: #${broadcastId.substring(0, 8)}) holati: <b>${statusText}</b>
${reason ? `\nSabab: <i>${reason}</i>` : ''}

Batafsil ma'lumotni reklamalarim sahifasida ko'rishingiz mumkin.
    `;

    return await this.sendNotification(advertiserTelegramId, text);
  }
}

export default new TelegramNotificationService();
