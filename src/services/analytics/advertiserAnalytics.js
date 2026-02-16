// src/services/analytics/advertiserAnalytics.js
import prisma from '../../config/database.js';
import ExcelJS from 'exceljs';
import logger from '../../utils/logger.js';

/**
 * Advertiser Analytics Service
 * Provides dashboard data and reports for advertisers
 */
class AdvertiserAnalytics {
  /**
   * Get advertiser dashboard overview
   */
  async getOverview(advertiserId) {
    try {
      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId: advertiserId },
      });

      // Get ad stats
      const adStats = await prisma.ad.aggregate({
        where: { advertiserId },
        _count: { id: true },
        _sum: {
          deliveredImpressions: true,
          clicks: true,
          totalCost: true,
        },
      });

      // Get active ads count
      const activeAds = await prisma.ad.count({
        where: {
          advertiserId,
          status: { in: ['RUNNING', 'APPROVED'] },
        },
      });

      // Calculate average CTR
      const avgCtr = adStats._sum.deliveredImpressions
        ? (adStats._sum.clicks / adStats._sum.deliveredImpressions) * 100
        : 0;

      return {
        wallet: {
          available: wallet?.available || 0,
          reserved: wallet?.reserved || 0,
          totalSpent: wallet?.totalSpent || 0,
        },
        ads: {
          total: adStats._count.id || 0,
          active: activeAds,
          totalImpressions: adStats._sum.deliveredImpressions || 0,
          totalClicks: adStats._sum.clicks || 0,
          averageCtr: parseFloat(avgCtr.toFixed(2)),
          totalSpent: adStats._sum.totalCost || 0,
        },
      };
    } catch (error) {
      logger.error('Get advertiser overview failed:', error);
      throw error;
    }
  }

  /**
   * Get ad performance details
   */
  async getAdPerformance(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        return null;
      }

      // Get impressions by bot
      const impressionsByBot = await prisma.impression.groupBy({
        by: ['botId'],
        where: { adId },
        _count: { id: true },
        _sum: { revenue: true },
      });

      // Get bot details
      const botIds = impressionsByBot.map(i => i.botId);
      const bots = await prisma.bot.findMany({
        where: { id: { in: botIds } },
        select: {
          id: true,
          username: true,
          firstName: true,
          totalMembers: true,
        },
      });

      const botsMap = Object.fromEntries(bots.map(b => [b.id, b]));

      const breakdown = impressionsByBot.map(item => ({
        bot: botsMap[item.botId],
        impressions: item._count.id,
        revenue: parseFloat(item._sum.revenue || 0),
      }));

      // Get clicks
      const totalClicks = await prisma.clickEvent.count({
        where: { adId, clicked: true },
      });

      return {
        ad: {
          id: ad.id,
          title: ad.title,
          status: ad.status,
          targetImpressions: ad.targetImpressions,
          deliveredImpressions: ad.deliveredImpressions,
          clicks: ad.clicks,
          ctr: parseFloat(ad.ctr),
          totalCost: parseFloat(ad.totalCost),
          remainingBudget: parseFloat(ad.remainingBudget),
        },
        botBreakdown: breakdown,
        totalClicks,
      };
    } catch (error) {
      logger.error('Get ad performance failed:', error);
      throw error;
    }
  }

  /**
   * Export impressions to Excel
   */
  async exportImpressions(adId, advertiserId) {
    try {
      // Verify ownership
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new Error('Ad not found');
      }

      // Get impressions with bot info
      const impressions = await prisma.impression.findMany({
        where: { adId },
        include: {
          bot: {
            select: { username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Impressions');

      // Add headers
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Дата и время', key: 'datetime', width: 20 },
        { header: 'Бот', key: 'bot', width: 20 },
        { header: 'Пользователь', key: 'userId', width: 15 },
        { header: 'Имя', key: 'firstName', width: 15 },
        { header: 'Фамилия', key: 'lastName', width: 15 },
        { header: 'Username', key: 'username', width: 20 },
        { header: 'Язык', key: 'language', width: 10 },
      ];

      // Add data
      impressions.forEach((impression, index) => {
        worksheet.addRow({
          id: index + 1,
          datetime: impression.createdAt.toLocaleString('ru-RU'),
          bot: `@${impression.bot.username}`,
          userId: impression.telegramUserId || '',
          firstName: impression.firstName || '',
          lastName: impression.lastName || '',
          username: impression.username ? `@${impression.username}` : '',
          language: impression.languageCode || '',
        });
      });

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      logger.info(`Impressions exported: ${adId}`);
      return buffer;
    } catch (error) {
      logger.error('Export impressions failed:', error);
      throw error;
    }
  }
}

const advertiserAnalytics = new AdvertiserAnalytics();
export default advertiserAnalytics;