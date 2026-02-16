// src/services/ad/adSchedulingService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Ad Scheduling Service
 * Manages ad scheduling and time-based delivery
 */
class AdSchedulingService {
  /**
   * Set schedule for ad
   */
  async setSchedule(adId, userId, scheduleData) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId: userId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (!['DRAFT', 'APPROVED'].includes(ad.status)) {
        throw new ValidationError('Can only schedule draft or approved ads');
      }

      // Validate schedule
      const { startDate, endDate, timezone, activeDays, activeHours } = scheduleData;

      if (new Date(startDate) < new Date()) {
        throw new ValidationError('Start date cannot be in the past');
      }

      if (new Date(endDate) <= new Date(startDate)) {
        throw new ValidationError('End date must be after start date');
      }

      // Update ad with schedule
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          scheduleStartDate: new Date(startDate),
          scheduleEndDate: new Date(endDate),
          scheduleTimezone: timezone || 'Asia/Tashkent',
          scheduleActiveDays: activeDays ? JSON.stringify(activeDays) : null,
          scheduleActiveHours: activeHours ? JSON.stringify(activeHours) : null,
          status: ad.status === 'DRAFT' ? 'SCHEDULED' : ad.status,
        },
      });

      logger.info(`Ad scheduled: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Set schedule failed:', error);
      throw error;
    }
  }

  /**
   * Check if ad should run at current time
   */
  isAdActive(ad) {
    try {
      const now = new Date();

      // Check date range
      if (ad.scheduleStartDate && now < ad.scheduleStartDate) {
        return false;
      }

      if (ad.scheduleEndDate && now > ad.scheduleEndDate) {
        return false;
      }

      // Check active days
      if (ad.scheduleActiveDays) {
        const activeDays = JSON.parse(ad.scheduleActiveDays);
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
        
        if (!activeDays.includes(currentDay)) {
          return false;
        }
      }

      // Check active hours
      if (ad.scheduleActiveHours) {
        const activeHours = JSON.parse(ad.scheduleActiveHours);
        const currentHour = now.getHours();
        
        const isInActiveHours = activeHours.some(range => {
          return currentHour >= range.start && currentHour < range.end;
        });

        if (!isInActiveHours) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Check ad active failed:', error);
      return true; // Fail open
    }
  }

  /**
   * Get scheduled ads
   */
  async getScheduledAds(userId) {
    try {
      return await prisma.ad.findMany({
        where: {
          advertiserId: userId,
          status: 'SCHEDULED',
        },
        orderBy: { scheduleStartDate: 'asc' },
      });
    } catch (error) {
      logger.error('Get scheduled ads failed:', error);
      throw error;
    }
  }

  /**
   * Remove schedule
   */
  async removeSchedule(adId, userId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId: userId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          scheduleStartDate: null,
          scheduleEndDate: null,
          scheduleTimezone: null,
          scheduleActiveDays: null,
          scheduleActiveHours: null,
          status: ad.status === 'SCHEDULED' ? 'DRAFT' : ad.status,
        },
      });

      logger.info(`Schedule removed: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Remove schedule failed:', error);
      throw error;
    }
  }
}

const adSchedulingService = new AdSchedulingService();
export default adSchedulingService;