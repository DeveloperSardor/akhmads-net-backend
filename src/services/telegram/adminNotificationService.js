// src/services/telegram/adminNotificationService.js
// Admin/Moderator/SuperAdmin larga yangi ad va bot haqida Telegram xabar yuboradi

import { InlineKeyboard } from 'grammy';
import telegramBot from '../../config/telegram.js';
import prisma from '../../config/database.js';
import redis from '../../config/redis.js';
import logger from '../../utils/logger.js';

class AdminNotificationService {

  /**
   * Yangi ad yuborilganda admin/moderator/superadmin larga xabar yuboradi
   */
  async notifyNewAd(ad, advertiser) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'MODERATOR', 'SUPER_ADMIN'] }, isActive: true },
        select: { telegramId: true, role: true },
      });

      const userName = advertiser?.username
        ? `@${advertiser.username}`
        : `${advertiser?.firstName || ''} (ID: ${advertiser?.telegramId || '?'})`;

      const adText = (ad.text || ad.htmlContent || '').substring(0, 200);
      const adPreview = adText.length > 200 ? adText + '...' : adText;

      const message =
        `📢 <b>Yangi Reklama So'rovi</b>\n\n` +
        `👤 Reklamachi: ${userName}\n` +
        `🆔 Ad ID: <code>${ad.id}</code>\n` +
        `📊 Ko'rishlar: ${ad.targetImpressions || 0}\n` +
        `💰 Narx: $${ad.totalCost || 0}\n\n` +
        `📝 <b>Matn:</b>\n${adPreview}`;

      const keyboard = new InlineKeyboard()
        .text('✅ Tasdiqlash', `ad_approve_${ad.id}`)
        .text('❌ Rad etish', `ad_reject_${ad.id}`)
        .row()
        .text('✏️ Edit so\'r', `ad_request_edit_${ad.id}`);

      const messageIds = [];
      for (const admin of admins) {
        if (admin.telegramId) {
          try {
            const msg = await telegramBot.bot.api.sendMessage(admin.telegramId, message, {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
            messageIds.push({ chatId: admin.telegramId, messageId: msg.message_id });
          } catch (e) {
            logger.warn(`Admin ${admin.telegramId} ga ad xabari yuborilmadi: ${e.message}`);
          }
        }
      }

      if (messageIds.length > 0) {
        await redis.set(`admin_notify:ad:${ad.id}`, JSON.stringify(messageIds), 'EX', 86400 * 7);
      }

      logger.info(`Ad notification sent to ${admins.length} admins for ad: ${ad.id}`);
    } catch (e) {
      logger.error('Ad admin notification error:', e);
    }
  }

  /**
   * Yangi broadcast yaratilganda adminga xabar yuboradi
   */
  async notifyNewBroadcast(broadcast, advertiser) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'MODERATOR', 'SUPER_ADMIN'] }, isActive: true },
        select: { telegramId: true },
      });

      const userName = advertiser?.username
        ? `@${advertiser.username}`
        : `${advertiser?.firstName || ''} (ID: ${advertiser?.telegramId || '?'})`;

      const textPreview = (broadcast.text || '').substring(0, 200);
      const adPreview = textPreview.length >= 200 ? textPreview + '...' : textPreview;

      const message =
        `📡 <b>Yangi Broadcast So'rovi</b>\n\n` +
        `👤 Reklamachi: ${userName}\n` +
        `🆔 ID: <code>${broadcast.id}</code>\n` +
        `🤖 Bot: @${broadcast.bot?.username || '?'}\n` +
        `👥 Qabul qiluvchilar: ${broadcast.targetCount} ta\n` +
        `💰 Narx: $${parseFloat(broadcast.totalCost).toFixed(2)}\n\n` +
        `📝 <b>Matn:</b>\n${adPreview}`;

      const keyboard = new InlineKeyboard()
        .text('✅ Tasdiqlash', `bcast_approve_${broadcast.id}`)
        .text('❌ Rad etish', `bcast_reject_${broadcast.id}`)
        .row()
        .text('✏️ Edit so\'r', `bcast_edit_${broadcast.id}`);

      const messageIds = [];
      for (const admin of admins) {
        if (admin.telegramId) {
          try {
            const msg = await telegramBot.bot.api.sendMessage(admin.telegramId, message, {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
            messageIds.push({ chatId: admin.telegramId, messageId: msg.message_id });
          } catch (e) {
            logger.warn(`Admin ${admin.telegramId} ga broadcast xabari yuborilmadi: ${e.message}`);
          }
        }
      }

      if (messageIds.length > 0) {
        await redis.set(`admin_notify:broadcast:${broadcast.id}`, JSON.stringify(messageIds), 'EX', 86400 * 7);
      }

      logger.info(`Broadcast notification sent to ${admins.length} admins for broadcast: ${broadcast.id}`);
    } catch (e) {
      logger.error('Broadcast admin notification error:', e);
    }
  }

  /**
   * Yangi bot qo'shilganda admin/moderator/superadmin larga xabar yuboradi
   */
  async notifyNewBot(bot, owner) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'MODERATOR', 'SUPER_ADMIN'] }, isActive: true },
        select: { telegramId: true, role: true },
      });

      const ownerName = owner?.username
        ? `@${owner.username}`
        : `${owner?.firstName || ''} (ID: ${owner?.telegramId || '?'})`;

      const message =
        `🤖 <b>Yangi Bot Tasdiqlash So'rovi</b>\n\n` +
        `👤 Egasi: ${ownerName}\n` +
        `🤖 Bot: @${bot.username || bot.botUsername || '?'}\n` +
        `📛 Nom: ${bot.name || bot.botName || '?'}\n` +
        `🆔 Bot ID: <code>${bot.id}</code>\n\n` +
        `📝 Tavsif: ${(bot.description || '').substring(0, 150)}`;

      const keyboard = new InlineKeyboard()
        .text('✅ Tasdiqlash', `bot_approve_${bot.id}`)
        .text('❌ Rad etish', `bot_reject_${bot.id}`);

      const messageIds = [];
      for (const admin of admins) {
        if (admin.telegramId) {
          try {
            const msg = await telegramBot.bot.api.sendMessage(admin.telegramId, message, {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
            messageIds.push({ chatId: admin.telegramId, messageId: msg.message_id });
          } catch (e) {
            logger.warn(`Admin ${admin.telegramId} ga bot xabari yuborilmadi: ${e.message}`);
          }
        }
      }

      if (messageIds.length > 0) {
        await redis.set(`admin_notify:bot:${bot.id}`, JSON.stringify(messageIds), 'EX', 86400 * 7);
      }

      logger.info(`Bot notification sent to ${admins.length} admins for bot: ${bot.id}`);
    } catch (e) {
      logger.error('Bot admin notification error:', e);
    }
  }

  /**
   * Remove action buttons for other admins when an entity is resolved
   */
  async markAsResolved(entityType, entityId, resolverName, actionType) {
    try {
      const key = `admin_notify:${entityType}:${entityId}`;
      const data = await redis.get(key);
      if (data) {
        const messageIds = JSON.parse(data);
        const resolvedText = `${actionType} by @${resolverName}`;
        for (const { chatId, messageId } of messageIds) {
          try {
            await telegramBot.bot.api.editMessageReplyMarkup(chatId, messageId, {
              reply_markup: {
                inline_keyboard: [[{ text: resolvedText, callback_data: 'ignore' }]]
              }
            });
          } catch (e) {
            // ignore if message not found or blocked
          }
        }
        await redis.del(key);
      }
    } catch (e) {
      logger.error('Error marking as resolved:', e);
    }
  }
}

const adminNotificationService = new AdminNotificationService();
export default adminNotificationService;
