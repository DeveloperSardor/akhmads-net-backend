import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { startOfDay, endOfDay, subDays } from 'date-fns';

/**
 * Bot Statistics Service
 * Aggregates and manages bot statistics
 */
class BotStatsService {
  /**
   * Aggregate daily stats for bot
   */
  async aggregateDailyStats(botId, date = new Date()) {
    try {
      const startDate = startOfDay(date);
      const endDate = endOfDay(date);

      // Get impressions for the day
      const impressions = await prisma.impression.findMany({
        where: {
          botId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate stats
      const totalImpressions = impressions.length;
      const uniqueUsers = new Set(impressions.map(i => i.telegramUserId)).size;
      const totalRevenue = impressions.reduce(
        (sum, i) => sum + parseFloat(i.botOwnerEarns),
        0
      );

      // Get clicks for the day
      const clicks = await prisma.clickEvent.count({
        where: {
          botId,
          clicked: true,
          clickedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate eCPM
      const ecpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

      // Upsert stats
      await prisma.botStatistics.upsert({
        where: {
          botId_date: {
            botId,
            date: startDate,
          },
        },
        update: {
          impressions: totalImpressions,
          uniqueUsers,
          clicks,
          revenue: totalRevenue,
          ecpm,
        },
        create: {
          botId,
          date: startDate,
          impressions: totalImpressions,
          uniqueUsers,
          clicks,
          revenue: totalRevenue,
          ecpm,
        },
      });

      logger.info(`Stats aggregated for bot ${botId} on ${startDate.toISOString()}`);
      return true;
    } catch (error) {
      logger.error('Aggregate daily stats failed:', error);
      throw error;
    }
  }

  /**
   * Get bot stats for period
   */
  async getBotStats(botId, days = 7) {
    try {
      const startDate = startOfDay(subDays(new Date(), days));

      const stats = await prisma.botStatistics.findMany({
        where: {
          botId,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      // Calculate totals
      const totals = stats.reduce(
        (acc, day) => ({
          impressions: acc.impressions + day.impressions,
          uniqueUsers: acc.uniqueUsers + day.uniqueUsers,
          clicks: acc.clicks + day.clicks,
          revenue: acc.revenue + parseFloat(day.revenue),
        }),
        { impressions: 0, uniqueUsers: 0, clicks: 0, revenue: 0 }
      );

      return {
        period: { days, startDate },
        daily: stats,
        totals,
      };
    } catch (error) {
      logger.error('Get bot stats failed:', error);
      throw error;
    }
  }

  /**
   * Update bot current eCPM
   */
  async updateCurrentEcpm(botId) {
    try {
      // Get last 7 days stats
      const stats = await this.getBotStats(botId, 7);

      const avgEcpm = stats.totals.impressions > 0
        ? (stats.totals.revenue / stats.totals.impressions) * 1000
        : 0;

      await prisma.bot.update({
        where: { id: botId },
        data: { currentEcpm: avgEcpm },
      });

      logger.info(`Current eCPM updated for bot: ${botId}`);
    } catch (error) {
      logger.error('Update current eCPM failed:', error);
    }
  }

  /**
   * Sync bot member count
   */
  async syncMemberCount(botId) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) return;

      // TODO: Get actual member count from bot
      // For now, just update timestamp
      await prisma.bot.update({
        where: { id: botId },
        data: { lastStatsSync: new Date() },
      });

      logger.info(`Member count synced for bot: ${botId}`);
    } catch (error) {
      logger.error('Sync member count failed:', error);
    }
  }
}

const botStatsService = new BotStatsService();
export default botStatsService;