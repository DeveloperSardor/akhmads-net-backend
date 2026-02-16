import prisma from '../../config/database.js';
import { startOfDay, subDays } from 'date-fns';
import logger from '../../utils/logger.js';

/**
 * Admin Analytics Service
 * Platform-wide analytics for administrators
 */
class AdminAnalytics {
  /**
   * Get platform overview
   */
  async getPlatformOverview() {
    try {
      const [users, bots, ads, revenue, impressions] = await Promise.all([
        this.getUserStats(),
        this.getBotStats(),
        this.getAdStats(),
        this.getRevenueStats(),
        this.getImpressionStats(),
      ]);

      return {
        users,
        bots,
        ads,
        revenue,
        impressions,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Get platform overview failed:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    try {
      const [total, active, banned, byRole] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true, isBanned: false } }),
        prisma.user.count({ where: { isBanned: true } }),
        prisma.user.groupBy({
          by: ['role'],
          _count: { id: true },
        }),
      ]);

      const roleBreakdown = Object.fromEntries(
        byRole.map(r => [r.role, r._count.id])
      );

      return {
        total,
        active,
        banned,
        byRole: roleBreakdown,
      };
    } catch (error) {
      logger.error('Get user stats failed:', error);
      throw error;
    }
  }

  /**
   * Get bot statistics
   */
  async getBotStats() {
    try {
      const [total, active, pending, monetized] = await Promise.all([
        prisma.bot.count(),
        prisma.bot.count({ where: { status: 'ACTIVE', isPaused: false } }),
        prisma.bot.count({ where: { status: 'PENDING' } }),
        prisma.bot.count({ where: { monetized: true } }),
      ]);

      const totalEarnings = await prisma.bot.aggregate({
        _sum: { totalEarnings: true },
      });

      return {
        total,
        active,
        pending,
        monetized,
        totalEarnings: parseFloat(totalEarnings._sum.totalEarnings || 0),
      };
    } catch (error) {
      logger.error('Get bot stats failed:', error);
      throw error;
    }
  }

  /**
   * Get ad statistics
   */
  async getAdStats() {
    try {
      const [total, running, completed, byStatus] = await Promise.all([
        prisma.ad.count(),
        prisma.ad.count({ where: { status: 'RUNNING' } }),
        prisma.ad.count({ where: { status: 'COMPLETED' } }),
        prisma.ad.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);

      const statusBreakdown = Object.fromEntries(
        byStatus.map(s => [s.status, s._count.id])
      );

      const totalSpent = await prisma.ad.aggregate({
        where: { status: { in: ['RUNNING', 'COMPLETED'] } },
        _sum: { totalCost: true },
      });

      return {
        total,
        running,
        completed,
        byStatus: statusBreakdown,
        totalSpent: parseFloat(totalSpent._sum.totalCost || 0),
      };
    } catch (error) {
      logger.error('Get ad stats failed:', error);
      throw error;
    }
  }

  /**
   * Get revenue statistics
   */
  async getRevenueStats() {
    try {
      const deposits = await prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'SUCCESS' },
        _sum: { amount: true },
      });

      const withdrawals = await prisma.transaction.aggregate({
        where: { type: 'WITHDRAW', status: 'SUCCESS' },
        _sum: { amount: true },
      });

      const platformFees = await prisma.impression.aggregate({
        _sum: { platformFee: true },
      });

      return {
        totalDeposits: parseFloat(deposits._sum.amount || 0),
        totalWithdrawals: parseFloat(withdrawals._sum.amount || 0),
        platformRevenue: parseFloat(platformFees._sum.platformFee || 0),
      };
    } catch (error) {
      logger.error('Get revenue stats failed:', error);
      throw error;
    }
  }

  /**
   * Get impression statistics
   */
  async getImpressionStats() {
    try {
      const total = await prisma.impression.count();

      const last7Days = await prisma.impression.count({
        where: {
          createdAt: { gte: subDays(new Date(), 7) },
        },
      });

      const last30Days = await prisma.impression.count({
        where: {
          createdAt: { gte: subDays(new Date(), 30) },
        },
      });

      return {
        total,
        last7Days,
        last30Days,
      };
    } catch (error) {
      logger.error('Get impression stats failed:', error);
      throw error;
    }
  }

  /**
   * Get growth chart data
   */
  async getGrowthData(days = 30) {
    try {
      const startDate = startOfDay(subDays(new Date(), days));

      const dailyStats = await prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(DISTINCT CASE WHEN entity_type = 'user' THEN entity_id END) as new_users,
          COUNT(DISTINCT CASE WHEN entity_type = 'bot' THEN entity_id END) as new_bots
        FROM audit_logs
        WHERE created_at >= ${startDate}
          AND action IN ('USER_CREATED', 'BOT_APPROVED')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;

      return dailyStats;
    } catch (error) {
      logger.error('Get growth data failed:', error);
      return [];
    }
  }
}

const adminAnalytics = new AdminAnalytics();
export default adminAnalytics;