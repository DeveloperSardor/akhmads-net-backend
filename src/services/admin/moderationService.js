import adModerationService from '../ad/adModerationService.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

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
      const { status } = filters;

      const where = {};
      if (status) where.status = status;

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

      const total = await prisma.bot.count({ where });

      return { bots, total };
    } catch (error) {
      logger.error('Get all bots failed:', error);
      throw error;
    }
  }

  /**
   * Get pending bots
   */
  async getPendingBots(limit = 20, offset = 0) {
    try {
      const bots = await prisma.bot.findMany({
        where: { status: 'PENDING' },
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
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.bot.count({
        where: { status: 'PENDING' },
      });

      return { bots, total };
    } catch (error) {
      logger.error('Get pending bots failed:', error);
      throw error;
    }
  }

  /**
   * Approve bot
   */
  async approveBot(botId, adminId) {
    try {
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

      logger.info(`Bot approved: ${botId}`);
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

      logger.info(`Bot rejected: ${botId}`);
      return bot;
    } catch (error) {
      logger.error('Reject bot failed:', error);
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