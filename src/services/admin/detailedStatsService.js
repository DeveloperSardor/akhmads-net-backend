// src/services/admin/detailedStatsService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

class DetailedStatsService {
  /**
   * Get paginated impressions with detailed user info
   */
  async getImpressions(filters = {}) {
    try {
      const {
        botId,
        adId,
        telegramUserId,
        search,
        startDate,
        endDate,
        limit = 50,
        offset = 0,
      } = filters;

      const where = {};

      if (botId) where.botId = botId;
      if (adId) where.adId = adId;
      if (telegramUserId) where.telegramUserId = telegramUserId;

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { telegramUserId: { contains: search } },
        ];
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const impressions = await prisma.impression.findMany({
        where,
        include: {
          ad: {
            select: {
              id: true,
              title: true,
            },
          },
          bot: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.impression.count({ where });

      // Enrich impressions missing user data from BotUser cache
      const pairs0 = impressions.filter(imp => imp.botId && imp.telegramUserId && !imp.username && !imp.firstName).map(imp => ({ botId: imp.botId, telegramUserId: imp.telegramUserId }));
      if (pairs0.length > 0) {
        const botUsers = await prisma.botUser.findMany({
          where: { OR: pairs0 },
          select: { botId: true, telegramUserId: true, username: true, firstName: true, lastName: true, languageCode: true, country: true, city: true },
        });
        const buMap = Object.fromEntries(botUsers.map(bu => [`${bu.botId}:${bu.telegramUserId}`, bu]));
        for (const imp of impressions) {
          const bu = buMap[`${imp.botId}:${imp.telegramUserId}`];
          if (!bu) continue;
          if (!imp.username) imp.username = bu.username;
          if (!imp.firstName) imp.firstName = bu.firstName;
          if (!imp.lastName) imp.lastName = bu.lastName;
          if (!imp.languageCode) imp.languageCode = bu.languageCode;
          if (!imp.country || imp.country === 'Unknown') imp.country = bu.country;
          if (!imp.city || imp.city === 'Unknown') imp.city = bu.city;
        }
      }

      return {
        impressions,
        total,
      };
    } catch (error) {
      logger.error('Get detailed impressions failed:', error);
      throw error;
    }
  }

  /**
   * Get unique active users for a bot with filters
   */
  async getBotUsers(botId, filters = {}) {
    try {
      const {
        search,
        activeDays, // users active in last N days
        limit = 50,
        offset = 0,
      } = filters;

      const where = { botId };

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { telegramUserId: { contains: search } },
        ];
      }

      if (activeDays) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - parseInt(activeDays));
        where.lastSeenAt = { gte: threshold };
      }

      const users = await prisma.botUser.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.botUser.count({ where });

      // Get some stats
      const totalUnique = await prisma.botUser.count({ where: { botId } });
      
      const last3Days = new Date();
      last3Days.setDate(last3Days.getDate() - 3);
      const active3Days = await prisma.botUser.count({
        where: { botId, lastSeenAt: { gte: last3Days } }
      });

      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);
      const active7Days = await prisma.botUser.count({
        where: { botId, lastSeenAt: { gte: last7Days } }
      });

      return {
        users,
        total,
        stats: {
          totalUnique,
          active3Days,
          active7Days,
        }
      };
    } catch (error) {
      logger.error('Get bot users failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed clicks with user info
   */
  async getClicks(filters = {}) {
    try {
      const {
        botId,
        adId,
        search,
        limit = 50,
        offset = 0,
      } = filters;

      const where = { clicked: true };

      if (botId) where.botId = botId;
      if (adId) where.adId = adId;

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { telegramUserId: { contains: search } },
        ];
      }

      const clicks = await prisma.clickEvent.findMany({
        where,
        include: {
          ad: {
            select: { id: true, title: true },
          },
          bot: {
            select: { id: true, username: true },
          },
        },
        orderBy: { clickedAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.clickEvent.count({ where });

      // Enrich clicks missing user data from BotUser cache
      const pairs1 = clicks.filter(c => c.botId && c.telegramUserId && !c.username && !c.firstName).map(c => ({ botId: c.botId, telegramUserId: c.telegramUserId }));
      if (pairs1.length > 0) {
        const botUsers1 = await prisma.botUser.findMany({
          where: { OR: pairs1 },
          select: { botId: true, telegramUserId: true, username: true, firstName: true, lastName: true, languageCode: true, country: true, city: true },
        });
        const buMap1 = Object.fromEntries(botUsers1.map(bu => [`${bu.botId}:${bu.telegramUserId}`, bu]));
        for (const c of clicks) {
          const bu = buMap1[`${c.botId}:${c.telegramUserId}`];
          if (!bu) continue;
          if (!c.username) c.username = bu.username;
          if (!c.firstName) c.firstName = bu.firstName;
          if (!c.lastName) c.lastName = bu.lastName;
          if (!c.languageCode) c.languageCode = bu.languageCode;
          if (!c.country || c.country === 'Unknown') c.country = bu.country;
          if (!c.city || c.city === 'Unknown') c.city = bu.city;
        }
      }

      return {
        clicks,
        total,
      };
    } catch (error) {
      logger.error('Get detailed clicks failed:', error);
      throw error;
    }
  }

  /**
   * Export impressions as CSV data
   */
  async getImpressionsExport(filters = {}) {
    try {
      const { botId, adId, startDate, endDate } = filters;
      const where = {};
      if (botId) where.botId = botId;
      if (adId) where.adId = adId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const impressions = await prisma.impression.findMany({
        where,
        include: {
          ad: { select: { id: true, text: true } },
          bot: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });

      // Enrich from BotUser for missing fields
      const pairs2 = impressions.filter(i => i.botId && i.telegramUserId && !i.username && !i.firstName).map(i => ({ botId: i.botId, telegramUserId: i.telegramUserId }));
      if (pairs2.length > 0) {
        const bus = await prisma.botUser.findMany({
          where: { OR: pairs2 },
          select: { botId: true, telegramUserId: true, username: true, firstName: true, lastName: true, languageCode: true, country: true, city: true },
        });
        const buMap = Object.fromEntries(bus.map(b => [`${b.botId}:${b.telegramUserId}`, b]));
        for (const imp of impressions) {
          const bu = buMap[`${imp.botId}:${imp.telegramUserId}`];
          if (!bu) continue;
          if (!imp.username) imp.username = bu.username;
          if (!imp.firstName) imp.firstName = bu.firstName;
          if (!imp.lastName) imp.lastName = bu.lastName;
          if (!imp.languageCode) imp.languageCode = bu.languageCode;
          if (!imp.country || imp.country === 'Unknown') imp.country = bu.country;
          if (!imp.city || imp.city === 'Unknown') imp.city = bu.city;
        }
      }

      return impressions.map(imp => ({
        'ID': imp.id,
        'Telegram ID': imp.telegramUserId || '',
        'Username': imp.username ? `@${imp.username}` : '',
        'First Name': imp.firstName || '',
        'Last Name': imp.lastName || '',
        'Language': imp.languageCode || '',
        'Country': imp.country || '',
        'City': imp.city || '',
        'Bot': imp.bot?.username ? `@${imp.bot.username}` : '',
        'Ad Text': (imp.ad?.text || '').slice(0, 60),
        'Revenue': imp.revenue || 0,
        'Time': new Date(imp.createdAt).toISOString(),
      }));
    } catch (error) {
      logger.error('Get impressions export failed:', error);
      throw error;
    }
  }

  /**
   * Export clicks as CSV data
   */
  async getClicksExport(filters = {}) {
    try {
      const { botId, adId, startDate, endDate } = filters;
      const where = { clicked: true };
      if (botId) where.botId = botId;
      if (adId) where.adId = adId;
      if (startDate || endDate) {
        where.clickedAt = {};
        if (startDate) where.clickedAt.gte = new Date(startDate);
        if (endDate) where.clickedAt.lte = new Date(endDate);
      }

      const clicks = await prisma.clickEvent.findMany({
        where,
        include: {
          ad: { select: { id: true, text: true } },
          bot: { select: { id: true, username: true } },
        },
        orderBy: { clickedAt: 'desc' },
        take: 10000,
      });

      // Enrich from BotUser for missing fields
      const pairs3 = clicks.filter(c => c.botId && c.telegramUserId && !c.username && !c.firstName).map(c => ({ botId: c.botId, telegramUserId: c.telegramUserId }));
      if (pairs3.length > 0) {
        const bus = await prisma.botUser.findMany({
          where: { OR: pairs3 },
          select: { botId: true, telegramUserId: true, username: true, firstName: true, lastName: true, languageCode: true, country: true, city: true },
        });
        const buMap = Object.fromEntries(bus.map(b => [`${b.botId}:${b.telegramUserId}`, b]));
        for (const c of clicks) {
          const bu = buMap[`${c.botId}:${c.telegramUserId}`];
          if (!bu) continue;
          if (!c.username) c.username = bu.username;
          if (!c.firstName) c.firstName = bu.firstName;
          if (!c.lastName) c.lastName = bu.lastName;
          if (!c.languageCode) c.languageCode = bu.languageCode;
          if (!c.country || c.country === 'Unknown') c.country = bu.country;
          if (!c.city || c.city === 'Unknown') c.city = bu.city;
        }
      }

      return clicks.map(c => ({
        'ID': c.id,
        'Telegram ID': c.telegramUserId || '',
        'Username': c.username ? `@${c.username}` : '',
        'First Name': c.firstName || '',
        'Last Name': c.lastName || '',
        'Language': c.languageCode || '',
        'Country': c.country || '',
        'City': c.city || '',
        'IP Address': c.ipAddress || '',
        'Bot': c.bot?.username ? `@${c.bot.username}` : '',
        'Ad Text': (c.ad?.text || '').slice(0, 60),
        'URL': c.originalUrl || '',
        'Clicked At': c.clickedAt ? new Date(c.clickedAt).toISOString() : '',
      }));
    } catch (error) {
      logger.error('Get clicks export failed:', error);
      throw error;
    }
  }

  /**
   * Get data for export (Excel)
   */
  async getExportData(botId, filters = {}) {
    try {
      const { activeDays } = filters;
      const where = { botId };

      if (activeDays) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - parseInt(activeDays));
        where.lastSeenAt = { gte: threshold };
      }

      const users = await prisma.botUser.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
      });

      return users.map(u => ({
        'Telegram ID': u.telegramUserId,
        'Username': u.username ? `@${u.username}` : '',
        'First Name': u.firstName || '',
        'Last Name': u.lastName || '',
        'Language': u.languageCode || '',
        'Country': u.country || '',
        'City': u.city || '',
        'Last Active': u.lastSeenAt.toISOString(),
        'Joined Date': u.createdAt.toISOString(),
      }));
    } catch (error) {
      logger.error('Get export data failed:', error);
      throw error;
    }
  }
}

export default new DetailedStatsService();
