import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';

/**
 * User Service
 * Handles user management operations
 */
class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Get user by ID failed:', error);
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId) {
    try {
      return await prisma.user.findUnique({
        where: { telegramId },
        include: {
          wallet: true,
        },
      });
    } catch (error) {
      logger.error('Get user by Telegram ID failed:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, data) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          username: data.username,
          avatarUrl: data.avatarUrl,
          locale: data.locale,
        },
      });

      logger.info(`User profile updated: ${userId}`);

      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictError('Email or username already exists');
      }
      logger.error('Update profile failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive user statistics
   * ✅ FIXED - impressionsServed removed from Bot aggregate
   */
  async getUserStats(userId) {
    try {
      const user = await this.getUserById(userId);

      // Get ad stats (for advertisers)
      const adStats = await prisma.ad.aggregate({
        where: { advertiserId: userId },
        _sum: {
          deliveredImpressions: true,
          clicks: true,
          conversions: true,
        },
        _count: { id: true },
      });

      // Get bot stats (for bot owners)
      const botStats = await prisma.bot.aggregate({
        where: { ownerId: userId },
        _sum: {
          totalEarnings: true,
          totalMembers: true,
          // ✅ impressionsServed removed - field doesn't exist in Bot model
        },
        _count: { id: true },
      });

      // Calculate totals
      const totalImpressions = adStats._sum.deliveredImpressions || 0;
      const totalClicks = adStats._sum.clicks || 0;
      const totalConversions = adStats._sum.conversions || 0;
      
      // Calculate average CTR
      const averageCtr = totalImpressions > 0 
        ? (totalClicks / totalImpressions) * 100 
        : 0;

      return {
        // Overall stats
        totalImpressions,
        totalClicks,
        totalConversions,
        averageCtr,
        
        // Wallet stats (from wallet table)
        totalSpent: parseFloat(user.wallet?.totalSpent || 0),
        totalEarned: parseFloat(user.wallet?.totalEarned || 0),
        
        // Ad stats (if advertiser)
        totalAds: adStats._count.id || 0,
        
        // Bot stats (if bot owner)
        totalBots: botStats._count.id || 0,
        totalBotEarnings: parseFloat(botStats._sum.totalEarnings || 0),
        totalBotMembers: botStats._sum.totalMembers || 0,
      };
    } catch (error) {
      logger.error('Get user stats failed:', error);
      throw error;
    }
  }

  /**
   * Delete user (soft delete)
   */
  async deleteUser(userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          isBanned: true,
        },
      });

      logger.info(`User deleted: ${userId}`);

      return true;
    } catch (error) {
      logger.error('Delete user failed:', error);
      throw error;
    }
  }
}

const userService = new UserService();
export default userService;