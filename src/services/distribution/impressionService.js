import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Impression Service
 * Records and manages ad impressions
 */
class ImpressionService {
  /**
   * Record impression
   */
  async recordImpression(data) {
    try {
      const { adId, botId, telegramUserId, firstName, lastName, username, languageCode, messageId } = data;

      // Get ad to calculate revenue
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (!ad) {
        throw new Error('Ad not found');
      }

      // Calculate revenue per impression
      const revenuePerImpression = parseFloat(ad.finalCpm) / 1000;
      const platformFeePercentage = parseFloat(ad.platformFee) / parseFloat(ad.totalCost) * 100;
      const platformFee = (revenuePerImpression * platformFeePercentage) / 100;
      const botOwnerEarns = revenuePerImpression - platformFee;

      // Create impression
      const impression = await prisma.impression.create({
        data: {
          adId,
          botId,
          telegramUserId,
          firstName,
          lastName,
          username,
          languageCode,
          revenue: revenuePerImpression,
          platformFee,
          botOwnerEarns,
          messageId: messageId?.toString(),
        },
      });

      // Update ad stats
      await prisma.ad.update({
        where: { id: adId },
        data: {
          deliveredImpressions: { increment: 1 },
          remainingBudget: { decrement: revenuePerImpression },
        },
      });

      // Check if ad completed
      const updatedAd = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (
        updatedAd.deliveredImpressions >= updatedAd.targetImpressions ||
        updatedAd.remainingBudget <= 0
      ) {
        await prisma.ad.update({
          where: { id: adId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        logger.info(`Ad completed: ${adId}`);
      }

      logger.info(`Impression recorded: ${impression.id}`);
      return impression;
    } catch (error) {
      logger.error('Record impression failed:', error);
      throw error;
    }
  }

  /**
   * Get impressions for ad
   */
  async getAdImpressions(adId, limit = 100, offset = 0) {
    try {
      const impressions = await prisma.impression.findMany({
        where: { adId },
        include: {
          bot: {
            select: { username: true, firstName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.impression.count({
        where: { adId },
      });

      return { impressions, total };
    } catch (error) {
      logger.error('Get ad impressions failed:', error);
      throw error;
    }
  }

  /**
   * Get unique viewers count
   */
  async getUniqueViewersCount(adId) {
    try {
      const uniqueUsers = await prisma.impression.findMany({
        where: { adId },
        select: { telegramUserId: true },
        distinct: ['telegramUserId'],
      });

      return uniqueUsers.length;
    } catch (error) {
      logger.error('Get unique viewers count failed:', error);
      return 0;
    }
  }
}

const impressionService = new ImpressionService();
export default impressionService;