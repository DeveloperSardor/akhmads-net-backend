import adModerationService from '../ad/adModerationService.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import autoBotManager from '../bot/autoBotManager.js';

/**
 * Content Moderation Service
 * Unified moderation for ads and bots
 */
class ModerationService {
  /**
   * Get moderation queue
   */
  async getModerationQueue() {
    try {
      const [pendingAds, pendingBots, pendingWithdrawals] = await Promise.all([
        prisma.ad.count({ where: { status: 'SUBMITTED' } }),
        prisma.bot.count({ where: { status: 'PENDING' } }),
        prisma.withdrawRequest.count({ 
          where: { status: { in: ['REQUESTED', 'PENDING_REVIEW'] } } 
        }),
      ]);

      return {
        ads: pendingAds,
        bots: pendingBots,
        withdrawals: pendingWithdrawals,
        total: pendingAds + pendingBots + pendingWithdrawals,
      };
    } catch (error) {
      logger.error('Get moderation queue failed:', error);
      throw error;
    }
  }

  /**
   * Get all bots with filters
   */
  async getAllBots(filters = {}, limit = 20, offset = 0) {
    try {
      const { status, search } = filters;

      const where = {};
      if (status) where.status = status;

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { telegramBotId: { contains: search, mode: 'insensitive' } },
        ];
      }

      const bots = await prisma.bot.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      // Enrich with real-time stats
      const enrichedBots = await Promise.all(
        bots.map(async (bot) => {
          const impressionsCount = await prisma.impression.count({
            where: { botId: bot.id },
          });

          const earningsAggregate = await prisma.impression.aggregate({
            where: { botId: bot.id },
            _sum: { botOwnerEarns: true },
          });

          return {
            ...bot,
            adsReceived: impressionsCount,
            earnings: parseFloat(earningsAggregate._sum.botOwnerEarns || 0),
          };
        })
      );

      const total = await prisma.bot.count({ where });

      return { bots: enrichedBots, total };
    } catch (error) {
      logger.error('Get all bots failed:', error);
      throw error;
    }
  }

  /**
   * Get pending bots
   */
  /**
   * Get pending bots
   */
  async getPendingBots(filters = {}, limit = 20, offset = 0) {
    try {
      const { search } = filters;
      const where = { status: "PENDING" };

      if (search) {
        where.OR = [
          { username: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { telegramBotId: { contains: search, mode: "insensitive" } },
        ];
      }

      const bots = await prisma.bot.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.bot.count({ where });

      return { bots, total };
    } catch (error) {
      logger.error("Get pending bots failed:", error);
      throw error;
    }
  }

  /**
   * Approve bot
   */
  async approveBot(botId, adminId) {
    try {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { firstName: true, username: true }
      });

      const bot = await prisma.bot.update({
        where: { id: botId },
        data: {
          status: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'BOT_APPROVED',
          entityType: 'bot',
          entityId: botId,
          metadata: { botUsername: bot.username },
        },
      });

      // ✅ Telegram dagi xabarni yangilash
      const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
      const resolverName = admin?.username || admin?.firstName || 'Admin';
      adminNotificationService.markAsResolved('bot', botId, resolverName, '✅ TASDIQLANDI (SAYT)').catch(() => {});

      logger.info(`Bot approved: ${botId}`);

      // Notify owner
      const owner = await prisma.user.findUnique({ where: { id: bot.ownerId } });
      if (owner) {
        const { default: userNotificationService } = await import('../telegram/userNotificationService.js');
        await userNotificationService.notifyBotApproved(owner, bot);
      }
      
      // If AUTO mode, start it
      if (bot.integrationMode === 'AUTO' && bot.status === 'ACTIVE' && !bot.isPaused) {
        autoBotManager.startBot(bot);
      }

      return bot;
    } catch (error) {
      logger.error('Approve bot failed:', error);
      throw error;
    }
  }

  /**
   * Reject bot
   */
  async rejectBot(botId, adminId, reason) {
    try {
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { firstName: true, username: true }
      });

      const bot = await prisma.bot.update({
        where: { id: botId },
        data: { status: 'REJECTED' },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'BOT_REJECTED',
          entityType: 'bot',
          entityId: botId,
          metadata: { botUsername: bot.username, reason },
        },
      });

      // ✅ Telegram dagi xabarni yangilash
      const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
      const resolverName = admin?.username || admin?.firstName || 'Admin';
      adminNotificationService.markAsResolved('bot', botId, resolverName, '❌ RAD ETILDI (SAYT)').catch(() => {});

      logger.info(`Bot rejected: ${botId}, reason=${reason}`);

      // Notify owner
      const owner = await prisma.user.findUnique({ where: { id: bot.ownerId } });
      if (owner) {
        const { default: userNotificationService } = await import('../telegram/userNotificationService.js');
        await userNotificationService.notifyBotRejected(owner, bot, reason);
      }

      return bot;
    } catch (error) {
      logger.error('Reject bot failed:', error);
      throw error;
    }
  }

  /**
   * Pause bot by admin
   */
  async pauseBot(botId, adminId) {
    try {
      const bot = await prisma.bot.update({
        where: { id: botId },
        data: { isPaused: true },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'BOT_PAUSED_BY_ADMIN',
          entityType: 'bot',
          entityId: botId,
          metadata: { botUsername: bot.username },
        },
      });

      // Stop Auto Bot Manager if needed
      autoBotManager.stopBot(botId);

      logger.info(`Bot paused by admin: ${botId}`);
      return bot;
    } catch (error) {
      logger.error('Pause bot failed:', error);
      throw error;
    }
  }

  /**
   * Resume bot by admin
   */
  async resumeBot(botId, adminId) {
    try {
      const bot = await prisma.bot.update({
        where: { id: botId },
        data: { isPaused: false },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'BOT_RESUMED_BY_ADMIN',
          entityType: 'bot',
          entityId: botId,
          metadata: { botUsername: bot.username },
        },
      });

      // Start Auto Bot Manager if needed
      if (bot.integrationMode === 'AUTO' && bot.status === 'ACTIVE') {
        autoBotManager.startBot(bot);
      }

      logger.info(`Bot resumed by admin: ${botId}`);
      return bot;
    } catch (error) {
      logger.error('Resume bot failed:', error);
      throw error;
    }
  }

  /**
   * Get moderation history
   */
  async getModerationHistory(moderatorId, limit = 50) {
    try {
      const history = await prisma.auditLog.findMany({
        where: {
          userId: moderatorId,
          action: {
            in: ['AD_APPROVED', 'AD_REJECTED', 'BOT_APPROVED', 'BOT_REJECTED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return history;
    } catch (error) {
      logger.error('Get moderation history failed:', error);
      throw error;
    }
  }
}

const moderationService = new ModerationService();
export default moderationService;