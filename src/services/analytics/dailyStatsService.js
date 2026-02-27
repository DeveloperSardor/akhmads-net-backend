// src/services/analytics/dailyStatsService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Daily Statistics Service
 * Generates and retrieves daily performance statistics
 */
class DailyStatsService {
  /**
   * Get daily stats for ad
   */
  async getAdDailyStats(adId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get impressions by day
      const impressionsByDay = await prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as impressions,
          SUM(revenue) as revenue
        FROM impressions
        WHERE ad_id = ${adId} 
          AND created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;

      // Get clicks by day
      const clicksByDay = await prisma.$queryRaw`
        SELECT 
          DATE(clicked_at) as date,
          COUNT(*) as clicks
        FROM click_events
        WHERE ad_id = ${adId} 
          AND clicked = true
          AND clicked_at >= ${startDate}
        GROUP BY DATE(clicked_at)
        ORDER BY date ASC
      `;

      // Merge data
      const statsMap = new Map();

      impressionsByDay.forEach(row => {
        statsMap.set(row.date.toISOString().split('T')[0], {
          date: row.date,
          impressions: parseInt(row.impressions),
          clicks: 0,
          revenue: parseFloat(row.revenue || 0),
          ctr: 0,
        });
      });

      clicksByDay.forEach(row => {
        const dateKey = row.date.toISOString().split('T')[0];
        const existing = statsMap.get(dateKey);
        
        if (existing) {
          existing.clicks = parseInt(row.clicks);
          existing.ctr = (existing.clicks / existing.impressions * 100).toFixed(2);
        }
      });

      return Array.from(statsMap.values());
    } catch (error) {
      logger.error('Get ad daily stats failed:', error);
      throw error;
    }
  }

  /**
   * Get advertiser daily stats
   */
  async getAdvertiserDailyStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get impressions and spending by day
      const impressionsData = await prisma.$queryRaw`
        SELECT 
          CAST(created_at AS DATE) as date,
          COUNT(DISTINCT ad_id) as active_ads,
          COUNT(*) as impressions,
          SUM(revenue) as spent
        FROM impressions
        WHERE ad_id IN (
          SELECT id FROM ads WHERE advertiser_id = ${userId}
        )
          AND created_at >= ${startDate}
        GROUP BY CAST(created_at AS DATE)
        ORDER BY date ASC
      `;

      // Get clicks by day
      const clicksData = await prisma.$queryRaw`
        SELECT 
          CAST(clicked_at AS DATE) as date,
          COUNT(*) as clicks
        FROM click_events
        WHERE ad_id IN (
          SELECT id FROM ads WHERE advertiser_id = ${userId}
        )
          AND clicked = true
          AND clicked_at >= ${startDate}
        GROUP BY CAST(clicked_at AS DATE)
        ORDER BY date ASC
      `;

      // Merge data
      const statsMap = new Map();

      impressionsData.forEach(row => {
        const dateKey = row.date.toISOString().split('T')[0];
        statsMap.set(dateKey, {
          date: row.date,
          activeAds: Number(row.active_ads),
          impressions: Number(row.impressions),
          clicks: 0,
          spent: parseFloat(row.spent || 0),
          ctr: 0,
        });
      });

      clicksData.forEach(row => {
        const dateKey = row.date.toISOString().split('T')[0];
        const existing = statsMap.get(dateKey);
        
        if (existing) {
          existing.clicks = Number(row.clicks);
          existing.ctr = existing.impressions > 0 
            ? ((existing.clicks / existing.impressions) * 100).toFixed(2)
            : 0;
        } else {
          statsMap.set(dateKey, {
            date: row.date,
            activeAds: 0,
            impressions: 0,
            clicks: Number(row.clicks),
            spent: 0,
            ctr: 0
          });
        }
      });

      return Array.from(statsMap.values()).sort((a, b) => a.date - b.date);
    } catch (error) {
      logger.error('Get advertiser daily stats failed:', error);
      throw error;
    }
  }

  /**
   * Get hourly distribution
   */
  async getHourlyDistribution(adId) {
    try {
      const hourlyData = await prisma.$queryRaw`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as impressions
        FROM impressions
        WHERE ad_id = ${adId}
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour ASC
      `;

      // Fill missing hours with 0
      const result = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        impressions: 0,
      }));

      hourlyData.forEach(row => {
        result[parseInt(row.hour)].impressions = parseInt(row.impressions);
      });

      return result;
    } catch (error) {
      logger.error('Get hourly distribution failed:', error);
      throw error;
    }
  }
}

const dailyStatsService = new DailyStatsService();
export default dailyStatsService;