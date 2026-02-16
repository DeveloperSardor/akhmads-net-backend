import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Platform Settings Service
 * Admin management of system settings
 */
class SettingsService {
  /**
   * Get all settings
   */
  async getAllSettings() {
    try {
      const settings = await prisma.platformSettings.findMany({
        orderBy: { category: 'asc' },
      });

      // Group by category
      const grouped = settings.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push(setting);
        return acc;
      }, {});

      return grouped;
    } catch (error) {
      logger.error('Get all settings failed:', error);
      throw error;
    }
  }

  /**
   * Get setting by key
   */
  async getSetting(key) {
    try {
      const setting = await prisma.platformSettings.findUnique({
        where: { key },
      });

      if (!setting) {
        throw new NotFoundError(`Setting ${key} not found`);
      }

      return setting;
    } catch (error) {
      logger.error('Get setting failed:', error);
      throw error;
    }
  }

  /**
   * Update setting
   */
  async updateSetting(key, value, adminId) {
    try {
      const setting = await prisma.platformSettings.update({
        where: { key },
        data: {
          value: value.toString(),
          updatedBy: adminId,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'SETTINGS_UPDATED',
          entityType: 'setting',
          entityId: key,
          metadata: { key, value },
        },
      });

      logger.info(`Setting updated: ${key} = ${value}`);
      return setting;
    } catch (error) {
      logger.error('Update setting failed:', error);
      throw error;
    }
  }

  /**
   * Bulk update settings
   */
  async bulkUpdateSettings(settings, adminId) {
    try {
      const updates = Object.entries(settings).map(([key, value]) =>
        prisma.platformSettings.update({
          where: { key },
          data: {
            value: value.toString(),
            updatedBy: adminId,
          },
        })
      );

      await prisma.$transaction(updates);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'SETTINGS_BULK_UPDATED',
          entityType: 'settings',
          metadata: { settings },
        },
      });

      logger.info('Settings bulk updated');
      return true;
    } catch (error) {
      logger.error('Bulk update settings failed:', error);
      throw error;
    }
  }

  /**
   * Get setting value (typed)
   */
  async getSettingValue(key, defaultValue = null) {
    try {
      const setting = await prisma.platformSettings.findUnique({
        where: { key },
      });

      if (!setting) {
        return defaultValue;
      }

      // Convert based on type
      switch (setting.valueType) {
        case 'number':
          return parseFloat(setting.value);
        case 'boolean':
          return setting.value === 'true';
        default:
          return setting.value;
      }
    } catch (error) {
      logger.error('Get setting value failed:', error);
      return defaultValue;
    }
  }
}

const settingsService = new SettingsService();
export default settingsService;