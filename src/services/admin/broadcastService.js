// src/services/admin/broadcastService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import walletService from '../wallet/walletService.js';
import tracking from '../../utils/tracking.js';
import socketService from '../socket/socketService.js';
import telegramNotificationService from '../notification/telegramNotificationService.js';

class BroadcastService {
  /**
   * Create a new broadcast campaign
   */
  async createBroadcast(advertiserId, data) {
    const {
      botId,
      type = 'POKAZ', // PDP or POKAZ
      contentType, // TEXT, HTML, etc.
      text,
      mediaUrl,
      mediaType,
      buttons,
      targetCount, // How many users (for POKAZ) or target clicks (for PDP)
      activeDays = 30, // Threshold for active users
      language, // Targeting: 'uz', 'ru', 'all', etc.
      scheduledAt,
      isMixedAudience = true // Whether to include uploaded users
    } = data;

    try {
      // 1. Validate bot
      const bot = await prisma.bot.findUnique({ where: { id: botId } });
      if (!bot || bot.status !== 'ACTIVE') {
        throw new Error('Bot is not active or not found');
      }

      // 2. Find target users
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - parseInt(activeDays));
      
      const where = { botId };
      if (language && language !== 'all') {
        where.languageCode = language;
      }
      
      // If ONLY system users or ONLY uploaded users? 
      // User said "mix qilib yuboramz", so we don't filter by source by default.
      
      where.lastSeenAt = { gte: threshold };

      const availableUsers = await prisma.botUser.findMany({
        where,
        select: { id: true, telegramUserId: true },
      });
      
      if (availableUsers.length === 0) {
        throw new Error('No active users found for this targeting');
      }

      // 3. Calculate cost based on type
      let actualTargetCount = 0;
      let totalCost = 0;
      let pricePerUnit = 0;
      
      if (type === 'POKAZ') {
        pricePerUnit = parseFloat(bot.pricePerPokaz) || 0.001; // Default if not set
        actualTargetCount = Math.min(targetCount, availableUsers.length);
        totalCost = actualTargetCount * pricePerUnit;
      } else {
        // PDP (Per Click)
        pricePerUnit = parseFloat(bot.pricePerClick) || 0.01;
        // For PDP, we usually send to the whole available audience (or up to a limit)
        // because we don't know who will click.
        // But the advertiser pays for CLICKS.
        actualTargetCount = availableUsers.length; 
        totalCost = targetCount * pricePerUnit; // Here targetCount is "targetClicks"
      }

      // Add base platform fee or markup
      const platformFee = totalCost * 0.20; // 20% platform fee
      const botOwnerEarn = totalCost * 0.80; // 80% to bot owner

      // 4. Picking users (Shuffle)
      const usersToNotify = availableUsers
        .sort(() => 0.5 - Math.random())
        .slice(0, actualTargetCount);

      const finalTargetCount = usersToNotify.length;

      // 5. Charge advertiser
      await walletService.debit(advertiserId, totalCost, 'AD_SPEND', `Broadcast ${type}`);

      // 5. Create Broadcast record (PENDING — awaiting admin moderation)
      const broadcast = await prisma.broadcast.create({
        data: {
          advertiserId,
          botId,
          status: 'PENDING_REVIEW',
          type,
          contentType,
          text,
          mediaUrl,
          mediaType,
          buttons,
          targetCount: type === 'POKAZ' ? finalTargetCount : targetCount, // for PDP it's target clicks
          totalCost,
          platformFee,
          botOwnerEarn,
          language,
          scheduledAt,
          initialAudience: availableUsers.length
        }
      });

      // 6. Create recipients (will be sent after admin approval)
      const recipientData = usersToNotify.map(u => ({
        broadcastId: broadcast.id,
        botUserId: u.id,
        status: 'PENDING'
      }));

      await prisma.broadcastRecipient.createMany({
        data: recipientData
      });

      return broadcast;
    } catch (error) {
      logger.error('Create broadcast failed:', error);
      throw error;
    }
  }

  /**
   * Send a formatted report to the advertiser via Telegram
   */
  async sendBroadcastReport(broadcastId) {
    try {
      const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        include: { 
          bot: true, 
          advertiser: { select: { telegramId: true, username: true } } 
        }
      });

      if (!broadcast || !broadcast.advertiser.telegramId) return;

      const durationMs = broadcast.completedAt - broadcast.startedAt;
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);

      const report = `
📢 <b>Рассылка:</b> @${broadcast.bot.username}
 
<b>${broadcast.status === 'COMPLETED' ? '✅ Завершена' : '📊 Отчет (48ч)'}</b>

<b>Аудитория</b>
└ На момент запуска: ${broadcast.initialAudience || 0}

<b>Пользователи</b>
├ Успешно: ${broadcast.successCount}
├ Заблокировали: ${broadcast.blockedCount}
└ Ошибка: ${broadcast.failedCount}

<b>Результаты</b>
├ Тип: ${broadcast.type}
├ CTR: ${broadcast.type === 'PDP' ? ((broadcast.clickCount / Math.max(1, broadcast.successCount)) * 100).toFixed(2) + '%' : 'N/A'}
└ Кликов: ${broadcast.clickCount}

<b>Время</b>
├ Выполнено за: ${hours} ч. ${minutes} мин.
└ Завершено: ${broadcast.completedAt ? broadcast.completedAt.toLocaleString('ru-RU') : 'N/A'}
      `.trim();

      const { default: telegramBot } = await import('../../config/telegram.js');
      await telegramBot.bot.api.sendMessage(broadcast.advertiser.telegramId, report, { parse_mode: 'HTML' });
      
    } catch (err) {
      logger.error(`Failed to send broadcast report ${broadcastId}:`, err);
    }
  }

  /**
   * Background process to send broadcast messages
   */
  async processBroadcast(broadcastId) {
    try {
      const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        include: { bot: true }
      });

      if (!broadcast || !['APPROVED', 'RUNNING'].includes(broadcast.status)) return;

      // Update status to RUNNING (handles both fresh start and resume)
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'RUNNING', startedAt: broadcast.startedAt || new Date() }
      });

      socketService.terminalLog(`Broadcast ${broadcastId} started! Type: ${broadcast.type}`, 'broadcast', { id: broadcastId });

      const bot = broadcast.bot;
      const botToken = encryption.decrypt(bot.tokenEncrypted);

      const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'PENDING' },
        include: { botUser: true }
      });

      logger.info(`Starting broadcast ${broadcastId} (${broadcast.type}) to ${recipients.length} users`);

      for (const recipient of recipients) {
        // Check if broadcast was paused mid-run
        const currentState = await prisma.broadcast.findUnique({
          where: { id: broadcastId },
          select: { status: true }
        });
        if (currentState?.status === 'PAUSED') {
          logger.info(`Broadcast ${broadcastId} paused mid-run. Stopping loop.`);
          return;
        }

        try {
          // Send message
          await this.sendTGMessage(botToken, recipient.botUser.telegramUserId, broadcast);

          // Update recipient
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', sentAt: new Date() }
          });

          // Update broadcast counts
          await prisma.broadcast.update({
            where: { id: broadcastId },
            data: { 
              sentCount: { increment: 1 },
              successCount: { increment: 1 }
            }
          });

          // Sleep slightly (30 msgs/sec limit)
          await new Promise(r => setTimeout(r, 40)); 
          
        } catch (err) {
          logger.error(`Failed to send broadcast to ${recipient.botUser.telegramUserId}:`, err.message);
          const isBlocked = err.message && (err.message.includes('forbidden') || err.message.includes('blocked'));
          
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: isBlocked ? 'BLOCKED' : 'FAILED', error: err.message }
          });

          await prisma.broadcast.update({
            where: { id: broadcastId },
            data: { 
              sentCount: { increment: 1 },
              failedCount: isBlocked ? 0 : { increment: 1 },
              blockedCount: isBlocked ? { increment: 1 } : 0
            }
          });
        }
      }

      // Mark as completed
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });

      socketService.terminalLog(`Broadcast ${broadcastId} COMPLETED! Success: ${broadcast.successCount}, Blocked: ${broadcast.blockedCount}`, 'success', { id: broadcastId });

      // Credit bot owner
      await walletService.credit(bot.ownerId, broadcast.botOwnerEarn, 'EARNINGS', broadcast.id);

      // Send immediate report for POKAZ
      if (broadcast.type === 'POKAZ') {
        await this.sendBroadcastReport(broadcastId);
      }

      logger.info(`Broadcast ${broadcastId} completed`);
    } catch (error) {
      logger.error(`Broadcast process fatal error: ${broadcastId}`, error);
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'PAUSED' } // Or failed
      });
    }
  }

  async sendTGMessage(botToken, chatId, broadcast) {
    const { contentType, text, mediaUrl, mediaType, buttons } = broadcast;

    // Prepare buttons with tracking
    let replyMarkup = null;
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      const trackedButtons = tracking.wrapButtonsWithTracking(
        buttons, 
        { broadcastId: broadcast.id, botId: broadcast.botId }
      );

      replyMarkup = {
        inline_keyboard: [
          trackedButtons.map(btn => ({ 
            text: btn.text, 
            url: btn.url 
          }))
        ]
      };
    }

    if (contentType === 'MEDIA' && mediaUrl) {
      if (mediaType?.startsWith('image')) {
        return await telegramAPI.sendPhoto(botToken, {
          chat_id: chatId,
          photo: mediaUrl,
          caption: text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        });
      } else if (mediaType?.startsWith('video')) {
        return await telegramAPI.sendVideo(botToken, {
          chat_id: chatId,
          video: mediaUrl,
          caption: text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        });
      }
    }

    return await telegramAPI.sendMessage(botToken, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined
    });
  }

  async approveBroadcast(broadcastId, adminId) {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { firstName: true, username: true }
    });

    const broadcast = await prisma.broadcast.findUnique({ 
      where: { id: broadcastId },
      include: { bot: true }
    });
    if (!broadcast) throw new Error('Broadcast not found');
    if (broadcast.status !== 'PENDING_REVIEW') throw new Error('Broadcast is not pending');

    // BOT OWNER MODERATION CHECK:
    if (broadcast.bot.autoAcceptAds) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'APPROVED' }
      });

      // If scheduled for future, don't start now
      if (broadcast.scheduledAt && new Date(broadcast.scheduledAt) > new Date()) {
        logger.info(`Broadcast ${broadcastId} is scheduled for ${broadcast.scheduledAt}. Awaiting scheduler.`);
      } else {
        // Run in background immediately
        this.processBroadcast(broadcastId).catch(err => {
          logger.error(`Broadcast process failed after approval: ${broadcastId}`, err);
        });
      }
    } else {
      // Wait for Bot Owner to approve
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'PENDING_BOT_OWNER' }
      });
      logger.info(`Broadcast ${broadcastId} waiting for Bot Owner approval.`);
      
      // Notify Bot Owner via Telegram
      try {
        const botOwner = await prisma.user.findUnique({ 
          where: { id: broadcast.bot.ownerId }, 
          select: { telegramId: true } 
        });
        if (botOwner?.telegramId) {
          await telegramNotificationService.notifyNewBroadcast(
            botOwner.telegramId, 
            broadcast.bot.username, 
            broadcastId
          );
        }
      } catch (err) {
        logger.error('Failed to notify bot owner:', err.message);
      }
    }

    // ✅ Telegram dagi xabarni yangilash
    const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
    const resolverName = admin?.username || admin?.firstName || 'Admin';
    adminNotificationService.markAsResolved('broadcast', broadcastId, resolverName, '✅ TASDIQLANDI (SAYT)').catch(() => {});

    // Notify advertiser
    try {
      const advertiser = await prisma.user.findUnique({ where: { id: broadcast.advertiserId }, select: { telegramId: true, locale: true } });
      if (advertiser?.telegramId) {
        const { default: telegramBot } = await import('../../config/telegram.js');
        await telegramBot.bot.api.sendMessage(
          advertiser.telegramId,
          `✅ <b>Broadcast tasdiqlandi!</b>\n\n🆔 ID: <code>${broadcastId}</code>\n👥 Qabul qiluvchilar: ${broadcast.targetCount} ta\n\nYaqin orada yuboriladi.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (e) {
      logger.warn('Failed to notify advertiser on broadcast approve:', e.message);
    }

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  async rejectBroadcast(broadcastId, adminId, reason) {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { firstName: true, username: true }
    });

    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new Error('Broadcast not found');
    if (broadcast.status !== 'PENDING_REVIEW') throw new Error('Broadcast is not pending');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'REJECTED' }
    });

    // Refund advertiser
    try {
      await walletService.credit(broadcast.advertiserId, broadcast.totalCost, 'REFUND', broadcastId);
    } catch (e) {
      logger.error('Broadcast reject refund failed:', e);
    }

    // ✅ Telegram dagi xabarni yangilash
    const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
    const resolverName = admin?.username || admin?.firstName || 'Admin';
    adminNotificationService.markAsResolved('broadcast', broadcastId, resolverName, '❌ RAD ETILDI (SAYT)').catch(() => {});

    // Notify advertiser
    try {
      const advertiser = await prisma.user.findUnique({ where: { id: broadcast.advertiserId }, select: { telegramId: true } });
      if (advertiser?.telegramId) {
        const { default: telegramBot } = await import('../../config/telegram.js');
        await telegramBot.bot.api.sendMessage(
          advertiser.telegramId,
          `❌ <b>Broadcast rad etildi</b>\n\n🆔 ID: <code>${broadcastId}</code>\n📝 Sabab: ${reason || 'Moderatsiya qoidalariga mos kelmaydi'}\n\n💰 $${broadcast.totalCost.toFixed(2)} hamyoningizga qaytarildi.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (e) {
      logger.warn('Failed to notify advertiser on broadcast reject:', e.message);
    }

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  async requestBroadcastEdit(broadcastId, adminId, feedback) {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { firstName: true, username: true }
    });

    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new Error('Broadcast not found');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'DRAFT' }
    });

    // ✅ Telegram dagi xabarni yangilash
    const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
    const resolverName = admin?.username || admin?.firstName || 'Admin';
    adminNotificationService.markAsResolved('broadcast', broadcastId, resolverName, '✏️ EDIT SO\'RALDI (SAYT)').catch(() => {});

    // Notify advertiser
    try {
      const advertiser = await prisma.user.findUnique({ where: { id: broadcast.advertiserId }, select: { telegramId: true } });
      if (advertiser?.telegramId) {
        const { default: telegramBot } = await import('../../config/telegram.js');
        await telegramBot.bot.api.sendMessage(
          advertiser.telegramId,
          `✏️ <b>Broadcast tahrir so'raldi</b>\n\n🆔 ID: <code>${broadcastId}</code>\n📝 Izoh: ${feedback}\n\nSaytga kiring va broadcastni qayta yuboring.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (e) {
      logger.warn('Failed to notify advertiser on broadcast edit request:', e.message);
    }

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  async pauseBroadcast(broadcastId, userId, isAdmin = false) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId }, include: { bot: true } });
    if (!broadcast) throw new Error('Broadcast not found');
    if (!isAdmin && broadcast.advertiserId !== userId) throw new Error('Not authorized');
    if (broadcast.status !== 'RUNNING') throw new Error('Broadcast is not running');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'PAUSED' }
    });

    socketService.terminalLog(`Broadcast ${broadcastId} PAUSED by ${isAdmin ? 'admin' : 'advertiser'}`, 'warning', { id: broadcastId });
    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  async resumeBroadcast(broadcastId, userId, isAdmin = false) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId }, include: { bot: true } });
    if (!broadcast) throw new Error('Broadcast not found');
    if (!isAdmin && broadcast.advertiserId !== userId) throw new Error('Not authorized');
    if (broadcast.status !== 'PAUSED') throw new Error('Broadcast is not paused');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'RUNNING' }
    });

    socketService.terminalLog(`Broadcast ${broadcastId} RESUMED by ${isAdmin ? 'admin' : 'advertiser'}`, 'broadcast', { id: broadcastId });

    // Continue sending remaining PENDING recipients
    this.processBroadcast(broadcastId).catch(err => {
      logger.error(`Broadcast resume process failed: ${broadcastId}`, err);
    });

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  async getBroadcasts(advertiserId = null, filters = {}) {
    const { limit = 20, offset = 0, status } = filters;
    const where = {};
    if (advertiserId) where.advertiserId = advertiserId;
    if (status) where.status = status;

    const broadcasts = await prisma.broadcast.findMany({
      where,
      include: {
        bot: { select: { username: true, id: true } },
        advertiser: { select: { id: true, firstName: true, lastName: true, username: true, telegramId: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.broadcast.count({ where });

    return { broadcasts, total };
  }

  /**
   * Bot Owner approves the broadcast
   */
  async botOwnerApproveBroadcast(broadcastId, botOwnerId) {
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      include: { bot: true }
    });

    if (!broadcast) throw new Error('Broadcast not found');
    if (broadcast.bot.ownerId !== botOwnerId) throw new Error('Not authorized');
    if (broadcast.status !== 'PENDING_BOT_OWNER') throw new Error('Broadcast not in bot owner pending state');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'APPROVED' }
    });

    // Start or schedule
    if (broadcast.scheduledAt && new Date(broadcast.scheduledAt) > new Date()) {
      logger.info(`Broadcast ${broadcastId} approved by owner. Scheduled for ${broadcast.scheduledAt}`);
    } else {
      this.processBroadcast(broadcastId).catch(err => {
        logger.error(`Broadcast process failed after owner approval: ${broadcastId}`, err);
      });
    }

    // Notify advertiser
    try {
      const advertiser = await prisma.user.findUnique({ where: { id: broadcast.advertiserId }, select: { telegramId: true } });
      if (advertiser?.telegramId) {
        const { default: telegramBot } = await import('../../config/telegram.js');
        await telegramBot.bot.api.sendMessage(
          advertiser.telegramId,
          `✅ <b>Bot egasi reklamani tasdiqladi!</b>\n\n🆔 ID: <code>${broadcastId}</code>\n🤖 Bot: @${broadcast.bot.username}\n\nYuborish boshlanadi.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (e) {
      logger.warn('Failed to notify advertiser on owner approve:', e.message);
    }

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }

  /**
   * Bot Owner rejects the broadcast
   */
  async botOwnerRejectBroadcast(broadcastId, botOwnerId, reason) {
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      include: { bot: true }
    });

    if (!broadcast) throw new Error('Broadcast not found');
    if (broadcast.bot.ownerId !== botOwnerId) throw new Error('Not authorized');
    if (broadcast.status !== 'PENDING_BOT_OWNER') throw new Error('Broadcast not in bot owner pending state');

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'REJECTED' }
    });

    // Refund advertiser
    await walletService.credit(broadcast.advertiserId, broadcast.totalCost, 'REFUND', broadcastId);

    // Notify advertiser
    try {
      const advertiser = await prisma.user.findUnique({ where: { id: broadcast.advertiserId }, select: { telegramId: true } });
      if (advertiser?.telegramId) {
        const { default: telegramBot } = await import('../../config/telegram.js');
        await telegramBot.bot.api.sendMessage(
          advertiser.telegramId,
          `❌ <b>Bot egasi reklamani rad etdi</b>\n\n🆔 ID: <code>${broadcastId}</code>\n🤖 Bot: @${broadcast.bot.username}\n📝 Sabab: ${reason || 'Bot egasi xohlamadi'}\n\n💰 $${broadcast.totalCost.toFixed(2)} qaytarildi.`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (e) {
      logger.warn('Failed to notify advertiser on owner reject:', e.message);
    }

    return await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  }
}

export default new BroadcastService();
