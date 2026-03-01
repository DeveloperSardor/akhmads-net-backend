import prisma from '../../config/database.js';
import telegramAPI from '../../utils/telegram-api.js';
import botStatsService from './botStatsService.js';
import encryption from '../../utils/encryption.js';
import jwtUtil from '../../utils/jwt.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ConflictError, ExternalServiceError } from '../../utils/errors.js';
import axios from 'axios';
import storageService from '../storage/storageService.js';
import { nanoid } from 'nanoid';

/**
 * Bot Service
 * ✅ Enhanced with comprehensive bot management
 */
class BotService {
  /**
   * Verify bot token and get bot info
   */
  async verifyBotToken(token) {
    try {
      const botInfo = await telegramAPI.getMe(token);
      return {
        telegramBotId: botInfo.id.toString(),
        username: botInfo.username,
        firstName: botInfo.first_name,
        canJoinGroups: botInfo.can_join_groups,
      };
    } catch (error) {
      logger.error('Bot token verification failed:', error);
      throw new ExternalServiceError('Invalid bot token', 'telegram');
    }
  }

  /**
   * Verify bot token and get bot info including avatar URL
   * Useful for previewing bots before registration.
   */
  async verifyTokenWithAvatar(token) {
    try {
      const botInfo = await telegramAPI.getMe(token);
      const avatarUrl = await telegramAPI.getBotProfilePhotoUrl(token);

      return {
        telegramBotId: botInfo.id.toString(),
        username: botInfo.username,
        firstName: botInfo.first_name,
        canJoinGroups: botInfo.can_join_groups,
        avatarUrl,
      };
    } catch (error) {
      logger.error('Token verification with avatar failed:', error);
      throw new ExternalServiceError('Invalid bot token', 'telegram');
    }
  }

  /**
   * Register new bot
   * ✅ Returns bot + apiKey
   */
  async registerBot(ownerId, data) {
    try {
      // Verify token
      const botInfo = await this.verifyBotToken(data.token);

      // Check if bot already exists
      const existing = await prisma.bot.findUnique({
        where: { telegramBotId: botInfo.telegramBotId },
      });

      if (existing) {
        throw new ConflictError('Bot already registered');
      }

      // Encrypt token
      const tokenEncrypted = encryption.encrypt(data.token);

      // --- Fetch Avatar and BotStat data ---
      let avatarUrl = null;
      let botstatData = null;
      let totalMembers = 0;
      let activeMembers = 0;

      try {
        const photoUrl = await telegramAPI.getBotProfilePhotoUrl(data.token);
        if (photoUrl) {
          const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data, 'binary');
          const ext = photoUrl.split('.').pop() || 'jpg';
          const filename = storageService.generateFilename(`avatar.${ext}`, ownerId);
          
          const uploadResult = await storageService.uploadFile({
            buffer,
            filename,
            mimetype: response.headers['content-type'] || 'image/jpeg',
          });
          avatarUrl = uploadResult.url;
        }
      } catch (err) {
        logger.error('Failed to fetch/upload bot avatar:', err.message);
      }

      // 1. Create bot with temporary apiKey details first to get the persistent ID
      const bot = await prisma.bot.create({
        data: {
          ownerId,
          telegramBotId: botInfo.telegramBotId,
          username: botInfo.username,
          firstName: botInfo.firstName,
          tokenEncrypted,
          apiKey: 'temp_' + nanoid(), // Placeholder
          apiKeyHash: 'temp_' + nanoid(), // Placeholder
          shortDescription: data.shortDescription || null,
          category: data.category,
          language: data.language || 'uz',
          monetized: data.monetized !== undefined ? data.monetized : true,
          status: 'PENDING',
          avatarUrl,
          botstatData,
          activeMembers,
          totalMembers,
        },
      });

      // 2. Now generate the real API key using the actual bot.id
      const apiKey = jwtUtil.generateBotApiKey({
        id: bot.id,
        ownerId,
        telegramBotId: bot.telegramBotId,
        username: bot.username,
      });

      // 3. Update the bot record with the real apiKey and its hash
      const updatedBot = await prisma.bot.update({
        where: { id: bot.id },
        data: {
          apiKey,
          apiKeyHash: encryption.hash(apiKey),
        },
      });

      logger.info(`Bot registered and token generated: ${bot.id}`);

      // Sync member count immediately
      botStatsService.syncMemberCount(bot.id).catch(err => {
        logger.error(`Initial member sync failed for bot ${bot.id}:`, err);
      });
      
      return { ...updatedBot, apiKey };
    } catch (error) {
      logger.error('Register bot failed:', error);
      throw error;
    }
  }

  /**
   * Get user's bots WITH stats
   * ✅ Enhanced with impressions, clicks, CTR, spent
   */
  async getUserBots(ownerId) {
    try {
      const bots = await prisma.bot.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
      });

      // Enrich with stats
      const botsWithStats = await Promise.all(
        bots.map(async (bot) => {
          // Get impressions count
          const impressionsCount = await prisma.impression.count({
            where: { botId: bot.id },
          });

          // Get clicks count
          const clicksCount = await prisma.clickEvent.count({
            where: { botId: bot.id, clicked: true },
          });

          // Calculate CTR
          const ctr = impressionsCount > 0
            ? ((clicksCount / impressionsCount) * 100).toFixed(2)
            : '0.00';

          // Get total revenue
          const totalRevenue = await prisma.impression.aggregate({
            where: { botId: bot.id },
            _sum: { revenue: true },
          });

          return {
            ...bot,
            impressionsServed: impressionsCount,
            clicks: clicksCount,
            ctr: parseFloat(ctr),
            spent: parseFloat(totalRevenue._sum.revenue || 0),
          };
        })
      );

      return botsWithStats;
    } catch (error) {
      logger.error('Get user bots failed:', error);
      throw error;
    }
  }

  /**
   * Get bot by ID
   */
  async getBotById(botId) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        include: { owner: true },
      });

      if (!bot) {
        throw new NotFoundError('Bot not found');
      }

      // Get impressions count
      const impressionsCount = await prisma.impression.count({
        where: { botId: bot.id },
      });

      // Get clicks count
      const clicksCount = await prisma.clickEvent.count({
        where: { botId: bot.id, clicked: true },
      });

      // Calculate CTR
      const ctr = impressionsCount > 0
        ? ((clicksCount / impressionsCount) * 100).toFixed(2)
        : '0.00';

      // Get total revenue
      const totalRevenue = await prisma.impression.aggregate({
        where: { botId: bot.id },
        _sum: { revenue: true },
      });

      return {
        ...bot,
        impressionsServed: impressionsCount,
        clicks: clicksCount,
        ctr: parseFloat(ctr),
        spent: parseFloat(totalRevenue._sum.revenue || 0),
      };
    } catch (error) {
      logger.error('Get bot failed:', error);
      throw error;
    }
  }

  /**
   * Update bot settings
   * ✅ Enhanced with all settings fields
   */
  async updateBot(botId, ownerId, data) {
    try {
      const bot = await prisma.bot.findFirst({
        where: { id: botId, ownerId },
      });

      if (!bot) {
        throw new NotFoundError('Bot not found');
      }

      const updated = await prisma.bot.update({
        where: { id: botId },
        data: {
          shortDescription: data.shortDescription,
          category: data.category,
          language: data.language,
          monetized: data.monetized,
          postFilter: data.postFilter,
          allowedCategories: data.allowedCategories,
          blockedCategories: data.blockedCategories,
          blockedAdIds: data.blockedAdIds,
          frequencyMinutes: data.frequencyMinutes,
        },
      });

      logger.info(`Bot updated: ${botId}`);
      return updated;
    } catch (error) {
      logger.error('Update bot failed:', error);
      throw error;
    }
  }

  /**
   * Pause/resume bot
   */
  async togglePause(botId, ownerId, isPaused) {
    try {
      const bot = await prisma.bot.update({
        where: { id: botId, ownerId },
        data: { isPaused },
      });

      logger.info(`Bot ${isPaused ? 'paused' : 'resumed'}: ${botId}`);
      return bot;
    } catch (error) {
      logger.error('Toggle bot pause failed:', error);
      throw error;
    }
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(botId, ownerId) {
    try {
      const bot = await this.getBotById(botId);

      if (bot.ownerId !== ownerId) {
        throw new NotFoundError('Bot not found');
      }

      // Generate new API key
      const newApiKey = jwtUtil.generateBotApiKey({
        id: botId,
        ownerId,
        telegramBotId: bot.telegramBotId,
        username: bot.username,
      });

      const updated = await prisma.bot.update({
        where: { id: botId },
        data: {
          apiKey: newApiKey,
          apiKeyHash: encryption.hash(newApiKey),
          apiKeyRevoked: false,
        },
      });

      logger.info(`API key regenerated: ${botId}`);
      return { bot: updated, newApiKey };
    } catch (error) {
      logger.error('Regenerate API key failed:', error);
      throw error;
    }
  }

  /**
   * Update bot token
   */
  async updateBotToken(botId, ownerId, newToken) {
    try {
      // Verify new token
      const botInfo = await this.verifyBotToken(newToken);

      const bot = await this.getBotById(botId);

      if (bot.ownerId !== ownerId) {
        throw new NotFoundError('Bot not found');
      }

      if (bot.telegramBotId !== botInfo.telegramBotId) {
        throw new ConflictError('Token belongs to different bot');
      }

      // Encrypt new token
      const tokenEncrypted = encryption.encrypt(newToken);

      const updated = await prisma.bot.update({
        where: { id: botId },
        data: { tokenEncrypted },
      });

      logger.info(`Bot token updated: ${botId}`);
      return updated;
    } catch (error) {
      logger.error('Update bot token failed:', error);
      throw error;
    }
  }

  /**
   * Delete bot
   */
  async deleteBot(botId, ownerId) {
    try {
      await prisma.bot.delete({
        where: { id: botId, ownerId },
      });

      logger.info(`Bot deleted: ${botId}`);
      return true;
    } catch (error) {
      logger.error('Delete bot failed:', error);
      throw error;
    }
  }

  /**
   * Get bot statistics
   */
  async getBotStats(botId, period = '7d') {
    try {
      const bot = await this.getBotById(botId);

      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await prisma.botStatistics.findMany({
        where: {
          botId,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      const totalImpressions = stats.reduce((sum, s) => sum + s.impressions, 0);
      const totalRevenue = stats.reduce((sum, s) => sum + parseFloat(s.revenue), 0);

      return {
        bot,
        period: days,
        totalImpressions,
        totalRevenue,
        dailyStats: stats,
      };
    } catch (error) {
      logger.error('Get bot stats failed:', error);
      throw error;
    }
  }

  /**
   * Get bot ad serving history
   */
  async getBotAdHistory(botId) {
    try {
      const impressions = await prisma.impression.findMany({
        where: { botId },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          ad: {
            select: {
              title: true,
              text: true,
              mediaUrl: true,
            },
          },
        },
      });

      return impressions;
    } catch (error) {
      logger.error('Get bot ad history failed:', error);
      throw error;
    }
  }

  /**
   * Search bots for general targeting
   */
  async searchBots(query) {
    try {
      const bots = await prisma.bot.findMany({
        where: {
          status: 'ACTIVE',
          isPaused: false,
          monetized: true,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          avatarUrl: true,
          category: true,
          language: true,
          totalMembers: true,
          activeMembers: true,
        },
        take: 20,
      });

      // Enrich with active user count (last 30 days)
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);

      const enrichedBots = await Promise.all(bots.map(async (bot) => {
        const activeUsersCount = await prisma.botUser.count({
          where: { botId: bot.id, lastSeenAt: { gte: threshold } }
        });
        return { 
          ...bot, 
          activeUsers30d: activeUsersCount,
          broadcastPrice: activeUsersCount * 0.05 + 0.10 // Example dynamic price
        };
      }));

      return enrichedBots;
    } catch (error) {
      logger.error('Search bots failed:', error);
      throw error;
    }
  }

  /**
   * Get all active bots for broadcast selection
   */
  async getPublicBots() {
    try {
      const now = new Date();
      const threshold3d  = new Date(now); threshold3d.setDate(now.getDate() - 3);
      const threshold7d  = new Date(now); threshold7d.setDate(now.getDate() - 7);
      const threshold30d = new Date(now); threshold30d.setDate(now.getDate() - 30);

      const bots = await prisma.bot.findMany({
        where: { status: 'ACTIVE', isPaused: false, monetized: true },
        select: {
          id: true,
          username: true,
          firstName: true,
          avatarUrl: true,
          category: true,
          language: true,
          totalMembers: true,
        }
      });

      const enrichedBots = await Promise.all(bots.map(async (bot) => {
        const [c3d, c7d, c30d] = await Promise.all([
          prisma.botUser.count({ where: { botId: bot.id, lastSeenAt: { gte: threshold3d } } }),
          prisma.botUser.count({ where: { botId: bot.id, lastSeenAt: { gte: threshold7d } } }),
          prisma.botUser.count({ where: { botId: bot.id, lastSeenAt: { gte: threshold30d } } }),
        ]);
        return {
          ...bot,
          activeUsers3d: c3d,
          activeUsers7d: c7d,
          activeUsers30d: c30d,
          broadcastPricePerUser: 0.05,
        };
      }));

      return enrichedBots;
    } catch (error) {
      logger.error('Get public bots failed:', error);
      throw error;
    }
  }
}


const botService = new BotService();
export default botService;