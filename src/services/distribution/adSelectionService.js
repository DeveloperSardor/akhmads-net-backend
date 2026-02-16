import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Ad Selection Service
 * Selects the best ad for a given bot/user
 */
class AdSelectionService {
  /**
   * Select best ad for bot and user
   */
  async selectBestAd(botId, telegramUserId) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot || bot.status !== 'ACTIVE' || bot.isPaused) {
        return null;
      }

      // Parse bot settings
      const allowedCategories = JSON.parse(bot.allowedCategories || '[]');
      const blockedCategories = JSON.parse(bot.blockedCategories || '[]');

      // Build query
      const where = {
        status: 'RUNNING',
        remainingBudget: { gt: 0 },
        deliveredImpressions: {
          lt: prisma.raw('target_impressions'),
        },
      };

      // Apply bot's post filter
      if (bot.postFilter === 'not_mine') {
        where.advertiserId = { not: bot.ownerId };
      } else if (bot.postFilter === 'only_mine') {
        where.advertiserId = bot.ownerId;
      }

      // Get eligible ads
      const ads = await prisma.ad.findMany({
        where,
        orderBy: [
          { cpmBid: 'desc' },
          { createdAt: 'asc' },
        ],
        take: 20,
      });

      // Filter ads
      for (const ad of ads) {
        // Check excluded users
        const excludedUsers = JSON.parse(ad.excludedUserIds || '[]');
        if (excludedUsers.includes(telegramUserId)) {
          continue;
        }

        // Check category filters
        const targeting = JSON.parse(ad.targeting || '{}');
        const adCategories = targeting.categories || [];

        if (allowedCategories.length > 0) {
          const hasAllowedCategory = adCategories.some(cat =>
            allowedCategories.includes(cat)
          );
          if (!hasAllowedCategory) continue;
        }

        if (blockedCategories.length > 0) {
          const hasBlockedCategory = adCategories.some(cat =>
            blockedCategories.includes(cat)
          );
          if (hasBlockedCategory) continue;
        }

        // Check frequency cap
        if (await this.checkFrequencyCap(ad.id, botId, telegramUserId, bot.frequencyMinutes)) {
          continue;
        }

        // Check unique frequency
        if (targeting.frequency === 'unique') {
          const alreadyShown = await prisma.impression.findFirst({
            where: {
              adId: ad.id,
              telegramUserId,
            },
          });

          if (alreadyShown) continue;
        }

        // Check specific bots targeting
        const specificBotIds = JSON.parse(ad.specificBotIds || '[]');
        if (specificBotIds.length > 0 && !specificBotIds.includes(botId)) {
          continue;
        }

        return ad;
      }

      return null;
    } catch (error) {
      logger.error('Select best ad failed:', error);
      return null;
    }
  }

  /**
   * Check frequency cap
   */
  async checkFrequencyCap(adId, botId, telegramUserId, frequencyMinutes) {
    try {
      const lastImpression = await prisma.impression.findFirst({
        where: {
          adId,
          botId,
          telegramUserId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastImpression) {
        return false; // No previous impression
      }

      const timeSince = Date.now() - lastImpression.createdAt.getTime();
      const minInterval = frequencyMinutes * 60 * 1000;

      return timeSince < minInterval; // True if too soon
    } catch (error) {
      logger.error('Check frequency cap failed:', error);
      return false;
    }
  }

  /**
   * Get ads ready for distribution
   */
  async getRunningAds() {
    try {
      return await prisma.ad.findMany({
        where: {
          status: 'RUNNING',
          remainingBudget: { gt: 0 },
          deliveredImpressions: {
            lt: prisma.raw('target_impressions'),
          },
        },
        include: {
          advertiser: {
            select: { id: true, firstName: true },
          },
        },
      });
    } catch (error) {
      logger.error('Get running ads failed:', error);
      return [];
    }
  }
}

const adSelectionService = new AdSelectionService();
export default adSelectionService;