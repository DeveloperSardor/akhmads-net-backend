import telegramBot from '../../config/telegram.js';
import logger from '../../utils/logger.js';

class UserNotificationService {
  /**
   * Helper function to send message to user via Telegram
   */
  async sendMessage(telegramId, text) {
    if (!telegramId) return;
    try {
      await telegramBot.bot.api.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
      });
      logger.info(`User notification sent to ${telegramId}`);
    } catch (error) {
      logger.warn(`Failed to send user notification to ${telegramId}: ${error.message}`);
    }
  }

  // --- Ads ---

  async notifyAdApproved(user, ad) {
    const text = 
      `🎉 <b>Reklamangiz Tasdiqlandi!</b>\n\n` +
      `Sizning <b>"${ad.title || 'Reklama'}"</b> nomli reklamangiz moderator tomonidan tasdiqlandi va ${ad.status === 'SCHEDULED' ? 'rejalashtirildi' : 'hozirgi vaqtda faol holatga o\'tdi'}.\n\n` +
      `🔹 ID: <code>${ad.id}</code>\n` +
      `🔹 Byudjet: $${ad.totalCost || 0}\n\n` +
      `Tizimdan foydalanganingiz uchun rahmat!`;
    await this.sendMessage(user.telegramId, text);
  }

  async notifyAdRejected(user, ad, reason) {
    const text = 
      `❌ <b>Reklamangiz Rad Etildi</b>\n\n` +
      `Sizning <b>"${ad.title || 'Reklama'}"</b> nomli reklamangiz afsuski rad etildi.\n\n` +
      `🔹 Sabab: <i>${reason || 'Sabab ko\'rsatilmagan'}</i>\n\n` +
      `Iltimos, kamchiliklarni to\'g\'irlab, qaytadan yuboring yoki qo\'llab-quvvatlash xizmatiga murojaat qiling.`;
    await this.sendMessage(user.telegramId, text);
  }

  // --- Broadcasts ---

  async notifyBroadcastApproved(user, broadcast) {
    const text = 
      `📡 <b>Rassilka (Broadcast) Tasdiqlandi!</b>\n\n` +
      `Sizning rassilka kampaniyangiz tasdiqlandi va jarayonga qo\'yildi.\n\n` +
      `🔹 ID: <code>${broadcast.id}</code>\n` +
      `🔹 Target: ${broadcast.targetCount} ta foydalanuvchi\n\n` +
      `Kuzatib boring, statistika tez orada yangilanadi.`;
    await this.sendMessage(user.telegramId, text);
  }

  async notifyBroadcastRejected(user, broadcast, reason) {
    const text = 
      `❌ <b>Rassilka Rad Etildi</b>\n\n` +
      `Siz rejalashtirgan rassilka afsuski rad etildi.\n\n` +
      `🔹 Sabab: <i>${reason || 'Sabab ko\'rsatilmagan'}</i>\n\n` +
      `Pul mablag\'laringiz balansingizga qaytarildi.`;
    await this.sendMessage(user.telegramId, text);
  }

  // --- Bots ---

  async notifyBotApproved(user, bot) {
    const text = 
      `🤖 <b>Botingiz Tasdiqlandi!</b>\n\n` +
      `Sizning <b>@${bot.username}</b> botingiz muvaffaqiyatli tasdiqlandi va platformaga qo\'shildi.\n\n` +
      `Endi siz reklamalarni botingiz orqali joylashtirib pul ishlashingiz mumkin!`;
    await this.sendMessage(user.telegramId, text);
  }

  async notifyBotRejected(user, bot, reason) {
    const text = 
      `❌ <b>Botingiz Rad Etildi</b>\n\n` +
      `Sizning <b>@${bot.username}</b> botingizni platformaga qo\'shish so\'rovi rad etildi.\n\n` +
      `🔹 Sabab: <i>${reason || 'Keltirilmagan'}</i>\n\n` +
      `Kamchiliklarni bartaraf qilib, qayta urinib ko\'ring.`;
    await this.sendMessage(user.telegramId, text);
  }

  // --- Withdrawals ---

  async notifyWithdrawalApproved(user, withdrawal) {
    const text = 
      `✅ <b>To'lov Muvaffaqiyatli Amalga Oshirildi!</b>\n\n` +
      `Sizning $${parseFloat(withdrawal.amount).toFixed(2)} miqdoridagi pul yechish so\'rovingiz tasdiqlandi va hisobingizga o\'tkazildi.\n\n` +
      `🔹 Tranzaksiya ID: <code>${withdrawal.id}</code>\n` +
      `🔹 Hamyon: ${withdrawal.address || withdrawal.method}\n\n` +
      `Biz bilan ishlab pul topayotganingizdan xursandmiz!`;
    await this.sendMessage(user.telegramId, text);
  }

  async notifyWithdrawalRejected(user, withdrawal, reason) {
    const text = 
      `❌ <b>Pul Yechish So'rovi Rad Etildi</b>\n\n` +
      `Sizning $${parseFloat(withdrawal.amount).toFixed(2)} pul yechish so\'rovingiz bekor qilindi.\n\n` +
      `🔹 Sabab: <i>${reason || 'Mablag\'ingiz balansingizga qaytarildi'}</i>\n\n` +
      `Qo\'shimcha ma\'lumot uchun admin bilan bog\'laning.`;
    await this.sendMessage(user.telegramId, text);
  }
}

const userNotificationService = new UserNotificationService();
export default userNotificationService;
