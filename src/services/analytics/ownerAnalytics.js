import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Bot Owner Analytics Service
 * Provides earnings and performance data for bot owners
 */
class OwnerAnalytics {
  /**
   * Get bot owner dashboard
   */
  async getOverview(ownerId) {
    try {
      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId: ownerId },
      });

      // Get bots summary
      const botStats = await prisma.bot.aggregate({
        where: { ownerId },
        _count: { id: true },
        _sum: {
          totalEarnings: true,
          pendingEarnings: true,
          totalMembers: true,
        },
      });

      // Get active bots
      const activeBots = await prisma.bot.count({
        where: {
          ownerId,
          status: 'ACTIVE',
          isPaused: false,
        },
      });

      return {
        wallet: {
          available: wallet?.available || 0,
          totalEarned: wallet?.totalEarned || 0,
          totalWithdrawn: wallet?.totalWithdrawn || 0,
        },
        bots: {
          total: botStats._count.id || 0,
          active: activeBots,
          totalEarnings: botStats._sum.totalEarnings || 0,
          pendingEarnings: botStats._sum.pendingEarnings || 0,
          totalMembers: botStats._sum.totalMembers || 0,
        },
      };
    } catch (error) {
      logger.error('Get owner overview failed:', error);
      throw error;
    }
  }

  /**
   * Get bot detailed stats
   */
  async getBotStats(botId, ownerId, period = '7d') {
    try {
      // Verify ownership
      const bot = await prisma.bot.findFirst({
        where: { id: botId, ownerId },
      });

      if (!bot) {
        return null;
      }

      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get daily stats
      const dailyStats = await prisma.botStatistics.findMany({
        where: {
          botId,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      // Aggregate totals
      const totals = dailyStats.reduce(
        (acc, day) => ({
          impressions: acc.impressions + day.impressions,
          clicks: acc.clicks + day.clicks,
          revenue: acc.revenue + parseFloat(day.revenue),
          uniqueUsers: Math.max(acc.uniqueUsers, day.uniqueUsers),
        }),
        { impressions: 0, clicks: 0, revenue: 0, uniqueUsers: 0 }
      );

      // Calculate average eCPM
      const avgEcpm = totals.impressions
        ? (totals.revenue / totals.impressions) * 1000
        : 0;

      return {
        bot: {
          id: bot.id,
          username: bot.username,
          totalMembers: bot.totalMembers,
          totalEarnings: parseFloat(bot.totalEarnings),
        },
        period: {
          days,
          startDate,
          endDate: new Date(),
        },
        totals: {
          impressions: totals.impressions,
          clicks: totals.clicks,
          revenue: totals.revenue.toFixed(2),
          uniqueUsers: totals.uniqueUsers,
          ctr: totals.impressions ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0,
          avgEcpm: avgEcpm.toFixed(2),
        },
        daily: dailyStats.map(day => ({
          date: day.date,
          impressions: day.impressions,
          clicks: day.clicks,
          revenue: parseFloat(day.revenue).toFixed(2),
          ecpm: parseFloat(day.ecpm).toFixed(2),
        })),
      };
    } catch (error) {
      logger.error('Get bot stats failed:', error);
      throw error;
    }
  }
}

const ownerAnalytics = new OwnerAnalytics();
export default ownerAnalytics;