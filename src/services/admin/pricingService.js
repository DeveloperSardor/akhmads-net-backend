import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';

/**
 * Pricing Management Service
 * Admin management of pricing tiers
 */
class PricingService {
  /**
   * Get all pricing tiers
   */
  async getAllTiers() {
    try {
      return await prisma.pricingTier.findMany({
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      logger.error('Get all tiers failed:', error);
      throw error;
    }
  }

  /**
   * Create pricing tier
   */
  async createTier(data) {
    try {
      // Check for duplicate impressions
      const existing = await prisma.pricingTier.findFirst({
        where: { impressions: data.impressions },
      });

      if (existing) {
        throw new ConflictError('Tier with this impression count already exists');
      }

      const tier = await prisma.pricingTier.create({
        data: {
          name: data.name,
          impressions: data.impressions,
          priceUsd: data.priceUsd,
          isActive: data.isActive !== false,
          sortOrder: data.sortOrder || 0,
        },
      });

      logger.info(`Pricing tier created: ${tier.id}`);
      return tier;
    } catch (error) {
      logger.error('Create tier failed:', error);
      throw error;
    }
  }

  /**
   * Update pricing tier
   */
  async updateTier(tierId, data) {
    try {
      const tier = await prisma.pricingTier.findUnique({
        where: { id: tierId },
      });

      if (!tier) {
        throw new NotFoundError('Pricing tier not found');
      }

      const updated = await prisma.pricingTier.update({
        where: { id: tierId },
        data: {
          name: data.name,
          priceUsd: data.priceUsd,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      });

      logger.info(`Pricing tier updated: ${tierId}`);
      return updated;
    } catch (error) {
      logger.error('Update tier failed:', error);
      throw error;
    }
  }

  /**
   * Delete pricing tier
   */
  async deleteTier(tierId) {
    try {
      // Check if tier is in use
      const adsUsingTier = await prisma.ad.count({
        where: { selectedTierId: tierId },
      });

      if (adsUsingTier > 0) {
        throw new ConflictError('Cannot delete tier that is in use');
      }

      await prisma.pricingTier.delete({
        where: { id: tierId },
      });

      logger.info(`Pricing tier deleted: ${tierId}`);
      return true;
    } catch (error) {
      logger.error('Delete tier failed:', error);
      throw error;
    }
  }

  /**
   * Reorder tiers
   */
  async reorderTiers(tierIds) {
    try {
      const updates = tierIds.map((tierId, index) =>
        prisma.pricingTier.update({
          where: { id: tierId },
          data: { sortOrder: index },
        })
      );

      await prisma.$transaction(updates);

      logger.info('Pricing tiers reordered');
      return true;
    } catch (error) {
      logger.error('Reorder tiers failed:', error);
      throw error;
    }
  }
}

const pricingService = new PricingService();
export default pricingService;