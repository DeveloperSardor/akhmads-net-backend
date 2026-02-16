// src/services/ad/adTrackingService.js
import prisma from '../../config/database.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Ad Tracking Service
 * Manages click tracking and analytics
 */
class AdTrackingService {
  /**
   * Create tracking links for buttons
   */
  createTrackingLinks(buttons, adId, botId) {
    try {
      return tracking.wrapButtonsWithTracking(buttons, adId, botId);
    } catch (error) {
      logger.error('Create tracking links failed:', error);
      throw error;
    }
  }

  /**
   * Record click event
   */
  async recordClick(trackingToken, ipAddress, userAgent, referer) {
    try {
      // Decrypt token
      const data = tracking.decryptToken(trackingToken);

      // Find or create click event
      let clickEvent = await prisma.clickEvent.findUnique({
        where: { trackingToken },
      });

      if (!clickEvent) {
        clickEvent = await prisma.clickEvent.create({
          data: {
            adId: data.adId,
            botId: data.botId,
            telegramUserId: data.telegramUserId,
            trackingToken,
            originalUrl: data.originalUrl,
            ipAddress,
            userAgent,
            referer,
            clicked: true,
            clickedAt: new Date(),
          },
        });

        // Update ad click count
        await prisma.ad.update({
          where: { id: data.adId },
          data: {
            clicks: { increment: 1 },
          },
        });

        // Recalculate CTR
        const ad = await prisma.ad.findUnique({
          where: { id: data.adId },
        });

        if (ad.deliveredImpressions > 0) {
          const ctr = (ad.clicks / ad.deliveredImpressions) * 100;
          await prisma.ad.update({
            where: { id: data.adId },
            data: { ctr: parseFloat(ctr.toFixed(2)) },
          });
        }
      } else if (!clickEvent.clicked) {
        // Update existing event
        await prisma.clickEvent.update({
          where: { id: clickEvent.id },
          data: {
            clicked: true,
            clickedAt: new Date(),
            ipAddress,
            userAgent,
            referer,
          },
        });
      }

      return {
        redirectUrl: data.originalUrl,
        clickEvent,
      };
    } catch (error) {
      logger.error('Record click failed:', error);
      throw error;
    }
  }

  /**
   * Get ad clicks
   */
  async getAdClicks(adId, limit = 100, offset = 0) {
    try {
      const clicks = await prisma.clickEvent.findMany({
        where: {
          adId,
          clicked: true,
        },
        include: {
          bot: {
            select: { username: true, firstName: true },
          },
        },
        orderBy: { clickedAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.clickEvent.count({
        where: { adId, clicked: true },
      });

      return { clicks, total };
    } catch (error) {
      logger.error('Get ad clicks failed:', error);
      throw error;
    }
  }

  /**
   * Get click details
   */
  async getClickDetails(adId) {
    try {
      // Group by date
      const clicksByDate = await prisma.$queryRaw`
        SELECT DATE(clicked_at) as date, COUNT(*) as count
        FROM click_events
        WHERE ad_id = ${adId} AND clicked = true
        GROUP BY DATE(clicked_at)
        ORDER BY date DESC
        LIMIT 30
      `;

      // Group by bot
      const clicksByBot = await prisma.clickEvent.groupBy({
        by: ['botId'],
        where: { adId, clicked: true },
        _count: { id: true },
      });

      const botIds = clicksByBot.map(c => c.botId);
      const bots = await prisma.bot.findMany({
        where: { id: { in: botIds } },
        select: { id: true, username: true },
      });

      const botsMap = Object.fromEntries(bots.map(b => [b.id, b]));

      return {
        byDate: clicksByDate,
        byBot: clicksByBot.map(c => ({
          bot: botsMap[c.botId],
          clicks: c._count.id,
        })),
      };
    } catch (error) {
      logger.error('Get click details failed:', error);
      throw error;
    }
  }
}

const adTrackingService = new AdTrackingService();
export default adTrackingService;