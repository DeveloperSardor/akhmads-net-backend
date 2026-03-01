import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * User Management Service
 * Admin user management operations
 */
class UserManagementService {
  /**
   * Get all users with filters
   */
  async getUsers(filters = {}) {
    try {
      const { role, isActive, isBanned, search, limit = 50, offset = 0 } = filters;

      const where = {};
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;
      if (isBanned !== undefined) where.isBanned = isBanned;
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { telegramId: { contains: search } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        include: {
          wallet: true,
          _count: {
            select: {
              ads: true,
              bots: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.user.count({ where });

      return { users, total };
    } catch (error) {
      logger.error('Get users failed:', error);
      throw error;
    }
  }

  /**
   * Get user details
   */
  async getUserDetails(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          ads: {
            select: {
              id: true,
              title: true,
              status: true,
              deliveredImpressions: true,
              totalCost: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          bots: {
            select: {
              id: true,
              username: true,
              status: true,
              totalEarnings: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Get user details failed:', error);
      throw error;
    }
  }

  /**
   * Update user role(s)
   * Supports both single role (string) and multiple roles (array)
   */
  async updateUserRole(userId, newRolesInput, adminId) {
    try {
      // Convert to array if string is provided
      const newRoles = Array.isArray(newRolesInput) ? newRolesInput : [newRolesInput];

      // Determine the highest privilege "main" role for backward compatibility
      // Order: SUPER_ADMIN > ADMIN > MODERATOR > BOT_OWNER > ADVERTISER
      let mainRole = 'ADVERTISER';
      if (newRoles.includes('SUPER_ADMIN')) mainRole = 'SUPER_ADMIN';
      else if (newRoles.includes('ADMIN')) mainRole = 'ADMIN';
      else if (newRoles.includes('MODERATOR')) mainRole = 'MODERATOR';
      else if (newRoles.includes('BOT_OWNER')) mainRole = 'BOT_OWNER';

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          role: mainRole,
          roles: newRoles
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'USER_ROLE_UPDATED',
          entityType: 'user',
          entityId: userId,
          metadata: JSON.stringify({ newRole: mainRole, newRoles }),
        },
      });

      logger.info(`User role updated: ${userId} -> main: ${mainRole}, roles: [${newRoles.join(', ')}]`);
      return user;
    } catch (error) {
      logger.error('Update user role failed:', error);
      throw error;
    }
  }

  /**
   * Ban user
   */
  async banUser(userId, reason, adminId) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          banReason: reason,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'USER_BANNED',
          entityType: 'user',
          entityId: userId,
          metadata: { reason },
        },
      });

      logger.info(`User banned: ${userId}`);
      return user;
    } catch (error) {
      logger.error('Ban user failed:', error);
      throw error;
    }
  }

  /**
   * Unban user
   */
  async unbanUser(userId, adminId) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          banReason: null,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'USER_UNBANNED',
          entityType: 'user',
          entityId: userId,
        },
      });

      logger.info(`User unbanned: ${userId}`);
      return user;
    } catch (error) {
      logger.error('Unban user failed:', error);
      throw error;
    }
  }

  /**
   * Get user activity
   */
  async getUserActivity(userId, limit = 20) {
    try {
      const activity = await prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return activity;
    } catch (error) {
      logger.error('Get user activity failed:', error);
      throw error;
    }
  }

  /**
   * Top up user wallet (Admin manual adjustment)
   */
  async topUpUserWallet(userId, amount, reason, adminId) {
    try {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundError('Wallet not found');

      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: {
          available: { increment: amount },
        },
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          userId,
          type: 'ADJUSTMENT', // Or 'DEPOSIT' depending on preference, ADJUSTMENT is clearer for manual
          provider: 'ADMIN',
          coin: 'USDT',
          amount,
          status: 'SUCCESS',
          metadata: JSON.stringify({ reason, adminId, action: 'MANUAL_TOPUP' }),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'USER_WALLET_TOPUP',
          entityType: 'wallet',
          entityId: wallet.id,
          metadata: JSON.stringify({ userId, amount, reason }),
        },
      });

      logger.info(`Admin ${adminId} topped up user ${userId} wallet by $${amount}. Reason: ${reason}`);
      return updatedWallet;
    } catch (error) {
      logger.error('Top up user wallet failed:', error);
      throw error;
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats() {
    try {
      const [
        totalUsers,
        activeUsers,
        totalBots,
        activeBots,
        totalAds,
        runningAds,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true, isBanned: false } }),
        prisma.bot.count(),
        prisma.bot.count({ where: { status: 'ACTIVE' } }),
        prisma.ad.count(),
        prisma.ad.count({ where: { status: 'RUNNING' } }),
      ]);

      // Revenue stats
      const revenueStats = await prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'SUCCESS' },
        _sum: { amount: true },
      });

      return {
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        bots: {
          total: totalBots,
          active: activeBots,
        },
        ads: {
          total: totalAds,
          running: runningAds,
        },
        revenue: {
          total: revenueStats._sum.amount || 0,
        },
      };
    } catch (error) {
      logger.error('Get platform stats failed:', error);
      throw error;
    }
  }
}

const userManagementService = new UserManagementService();
export default userManagementService;