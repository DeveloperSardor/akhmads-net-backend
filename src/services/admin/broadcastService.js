// src/services/admin/broadcastService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import walletService from '../wallet/walletService.js';

class BroadcastService {
  /**
   * Create a new broadcast campaign
   */
  async createBroadcast(advertiserId, data) {
    const {
      botId,
      contentType, // TEXT, HTML, etc.
      text,
      mediaUrl,
      mediaType,
      buttons,
      targetCount, // How many users to send to
      activeDays = 30 // Threshold for active users
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
      
      const availableUsers = await prisma.botUser.findMany({
        where: {
          botId,
          lastSeenAt: { gte: threshold },
        },
        select: { id: true, telegramUserId: true },
      });

      if (availableUsers.length === 0) {
        throw new Error('No active users found for this bot in specified period');
      }

      // Shuffle and pick targetCount
      const usersToNotify = availableUsers
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.min(targetCount, availableUsers.length));

      const actualTargetCount = usersToNotify.length;

      // 3. Calculate cost
      // Base fee + $0.05 per targeted user
      const baseFee = 0.50; // Minimal protocol fee
      const pricePerMessage = 0.05; 
      const totalCost = (actualTargetCount * pricePerMessage) + baseFee;
      const platformFee = totalCost * 0.30;
      const botOwnerEarn = (actualTargetCount * pricePerMessage) * 0.70;

      // 4. Charge advertiser
      await walletService.debit(advertiserId, totalCost, 'AD_SPEND', 'Broadcast');

      // 5. Create Broadcast record
      const broadcast = await prisma.broadcast.create({
        data: {
          advertiserId,
          botId,
          status: 'APPROVED', // Auto-approve for now if paid
          contentType,
          text,
          mediaUrl,
          mediaType,
          buttons,
          targetCount: actualTargetCount,
          totalCost,
          platformFee,
          botOwnerEarn,
        }
      });

      // 6. Create recipients
      const recipientData = usersToNotify.map(u => ({
        broadcastId: broadcast.id,
        botUserId: u.id,
        status: 'PENDING'
      }));

      await prisma.broadcastRecipient.createMany({
        data: recipientData
      });

      // Trigger background processing
      this.processBroadcast(broadcast.id).catch(err => {
        logger.error(`Initial broadcast process failed: ${broadcast.id}`, err);
      });

      return broadcast;
    } catch (error) {
      logger.error('Create broadcast failed:', error);
      throw error;
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

      if (!broadcast || broadcast.status !== 'APPROVED') return;

      // Update status to RUNNING
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'RUNNING', startedAt: new Date() }
      });

      const bot = broadcast.bot;
      const botToken = encryption.decrypt(bot.tokenEncrypted);

      const recipients = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, status: 'PENDING' },
        include: { botUser: true }
      });

      logger.info(`Starting broadcast ${broadcastId} to ${recipients.length} users`);

      for (const recipient of recipients) {
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
            data: { sentCount: { increment: 1 } }
          });

          // Sleep slightly to avoid TG rate limits if needed
          await new Promise(r => setTimeout(r, 50)); // 20 messages per second per bot (standard TG limit is ~30)
          
        } catch (err) {
          logger.error(`Failed to send broadcast to ${recipient.botUser.telegramUserId}:`, err.message);
          
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', error: err.message }
          });

          await prisma.broadcast.update({
            where: { id: broadcastId },
            data: { failedCount: { increment: 1 } }
          });
        }
      }

      // Mark as completed
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });

      // Credit bot owner
      await walletService.credit(bot.ownerId, broadcast.botOwnerEarn, 'EARNINGS', broadcast.id);

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

    // Prepare buttons if any
    let replyMarkup = null;
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      replyMarkup = {
        inline_keyboard: [
          buttons.map(btn => ({
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

  async getBroadcasts(advertiserId = null, filters = {}) {
    const { limit = 20, offset = 0 } = filters;
    const where = {};
    if (advertiserId) where.advertiserId = advertiserId;

    const broadcasts = await prisma.broadcast.findMany({
      where,
      include: {
        bot: { select: { username: true } },
        advertiser: { select: { firstName: true, lastName: true, username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.broadcast.count({ where });

    return { broadcasts, total };
  }
}

export default new BroadcastService();
