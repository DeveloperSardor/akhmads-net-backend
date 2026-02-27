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
   * Sync bot member count from BotStat.io
   * ✅ Uses BOT_STAT_IO key from .env
   */
  async syncMemberCount(botId) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) return;

      const botstatKey = process.env.BOT_STAT_IO;
      if (!botstatKey) {
        logger.warn('BOT_STAT_IO key missing in .env, skipping sync');
        return;
      }

      // Format username for BotStat.io API
      const usernameForApi = bot.username.startsWith('@') ? bot.username : `@${bot.username}`;
      
      try {
        const response = await axios.get(`https://api.botstat.io/get/${usernameForApi}/${botstatKey}`, {
          timeout: 10000
        });

        if (response.data && response.data.ok && response.data.result) {
          const result = response.data.result;
          const activeMembers = result.users_live || 0;
          const totalMembers = (result.users_live || 0) + (result.users_die || 0);

          await prisma.bot.update({
            where: { id: botId },
            data: {
              totalMembers,
              activeMembers,
              botstatData: result,
              lastStatsSync: new Date(),
            },
          });

          logger.info(`Member count synced for bot @${bot.username}: ${totalMembers} total, ${activeMembers} active`);
        } else {
          logger.warn(`BotStat.io sync failed for @${bot.username}: ${response.data?.result || 'Unknown error'}`);
        }
      } catch (axiosErr) {
        logger.error(`BotStat.io API request failed for @${bot.username}:`, axiosErr.message);
      }
    } catch (error) {
      logger.error('Sync member count failed:', error);
    }
  }

  /**
   * Sync all active bots
   */
  async syncAllBots() {
    try {
      const bots = await prisma.bot.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true }
      });

      logger.info(`Starting member count sync for ${bots.length} active bots`);

      // Sync sequentially to avoid hitting rate limits or overloading
      for (const bot of bots) {
        await this.syncMemberCount(bot.id);
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Finished member count sync for all bots');
    } catch (error) {
      logger.error('Sync all bots failed:', error);
    }
  }
}

const botStatsService = new BotStatsService();
export default botStatsService;