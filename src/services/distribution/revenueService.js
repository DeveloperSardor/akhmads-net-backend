import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import logger from '../../utils/logger.js';

/**
 * Revenue Distribution Service
 * Distributes revenue between platform and bot owners
 */
class RevenueService {
  /**
   * Distribute impression revenue
   */
  async distributeImpressionRevenue(impressionId) {
    try {
      const impression = await prisma.impression.findUnique({
        where: { id: impressionId },
        include: {
          bot: true,
          ad: true,
        },
      });

      if (!impression) {
        throw new Error('Impression not found');
      }

      const botOwnerEarns = parseFloat(impression.botOwnerEarns);

      // Credit bot owner wallet
      await walletService.credit(
        impression.bot.ownerId,
        botOwnerEarns,
        'EARNINGS',
        impressionId
      );

      // Update bot earnings
      await prisma.bot.update({
        where: { id: impression.botId },
        data: {
          totalEarnings: { increment: botOwnerEarns },
          pendingEarnings: { increment: botOwnerEarns },
        },
      });

      logger.info(`Revenue distributed for impression: ${impressionId}`);
      return true;
    } catch (error) {
      logger.error('Distribute impression revenue failed:', error);
      throw error;
    }
  }

  /**
   * Calculate platform revenue
   */
  async calculatePlatformRevenue(startDate, endDate) {
    try {
      const impressions = await prisma.impression.aggregate({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          platformFee: true,
        },
      });

      return parseFloat(impressions._sum.platformFee || 0);
    } catch (error) {
      logger.error('Calculate platform revenue failed:', error);
      return 0;
    }
  }

  /**
   * Get bot owner earnings
   */
  async getBotOwnerEarnings(ownerId, startDate, endDate) {
    try {
      const bots = await prisma.bot.findMany({
        where: { ownerId },
        select: { id: true },
      });

      const botIds = bots.map(b => b.id);

      const impressions = await prisma.impression.aggregate({
        where: {
          botId: { in: botIds },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          botOwnerEarns: true,
        },
      });

      return parseFloat(impressions._sum.botOwnerEarns || 0);
    } catch (error) {
      logger.error('Get bot owner earnings failed:', error);
      return 0;
    }
  }
}

const revenueService = new RevenueService();
export default revenueService;