// src/services/admin/pricingService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import pricingCalculator from '../../utils/pricing.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';

/**
 * Pricing Management Service
 * Admin management of pricing tiers and platform fees
 */
class PricingService {
  /**
   * Get all pricing tiers (with CPM calculation)
   */
  async getAllTiers() {
    try {
      const tiers = await prisma.pricingTier.findMany({
        orderBy: { sortOrder: 'asc' },
      });

      // Add CPM calculation for each tier
      return tiers.map(tier => ({
        ...tier,
        cpm: pricingCalculator.calculateBaseCPM(tier, tier.impressions),
        pricePerImpression: (parseFloat(tier.priceUsd) / tier.impressions).toFixed(6),
      }));
    } catch (error) {
      logger.error('Get all tiers failed:', error);
      throw error;
    }
  }

  /**
   * Get active pricing tiers (public)
   */
  async getActiveTiers() {
    try {
      const tiers = await prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      return tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        impressions: tier.impressions,
        priceUsd: parseFloat(tier.priceUsd),
        cpm: pricingCalculator.calculateBaseCPM(tier, tier.impressions),
      }));
    } catch (error) {
      logger.error('Get active tiers failed:', error);
      throw error;
    }
  }

  /**
   * Create pricing tier
   */
  async createTier(data) {
    try {
      // Validate
      if (data.impressions < 100) {
        throw new ValidationError('Minimum impressions: 100');
      }

      if (data.priceUsd <= 0) {
        throw new ValidationError('Price must be greater than 0');
      }

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

      logger.info(`✅ Pricing tier created: ${tier.name} - ${tier.impressions} impressions = $${tier.priceUsd}`);
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

      // Validate price if provided
      if (data.priceUsd !== undefined && data.priceUsd <= 0) {
        throw new ValidationError('Price must be greater than 0');
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

      logger.info(`📝 Pricing tier updated: ${tierId}`);
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
        throw new ConflictError(`Cannot delete tier that is in use by ${adsUsingTier} ads`);
      }

      await prisma.pricingTier.delete({
        where: { id: tierId },
      });

      logger.info(`🗑️ Pricing tier deleted: ${tierId}`);
      return true;
    } catch (error) {
      logger.error('Delete tier failed:', error);
      throw error;
    }
  }

  /**
   * Bulk create tiers (useful for initial setup)
   */
  async bulkCreateTiers(tiers) {
    try {
      const created = await prisma.$transaction(
        tiers.map((tier, index) =>
          prisma.pricingTier.create({
            data: {
              name: tier.name,
              impressions: tier.impressions,
              priceUsd: tier.priceUsd,
              isActive: tier.isActive !== false,
              sortOrder: tier.sortOrder || index,
            },
          })
        )
      );

      logger.info(`✅ ${created.length} pricing tiers created`);
      return created;
    } catch (error) {
      logger.error('Bulk create tiers failed:', error);
      throw error;
    }
  }

  /**
   * Get platform fee percentage
   */
  async getPlatformFee() {
    try {
      const setting = await prisma.platformSettings.findUnique({
        where: { key: 'platform_fee_percentage' },
      });

      return parseFloat(setting?.value || '20');
    } catch (error) {
      logger.error('Get platform fee failed:', error);
      return 20; // Default
    }
  }

  /**
   * Update platform fee percentage
   */
  async updatePlatformFee(percentage, updatedBy) {
    try {
      if (percentage < 0 || percentage > 50) {
        throw new ValidationError('Platform fee must be between 0% and 50%');
      }

      const setting = await prisma.platformSettings.upsert({
        where: { key: 'platform_fee_percentage' },
        create: {
          key: 'platform_fee_percentage',
          value: percentage.toString(),
          description: 'Platform fee percentage charged on ad revenue',
          valueType: 'number',
          category: 'pricing',
          updatedBy,
        },
        update: {
          value: percentage.toString(),
          updatedBy,
        },
      });

      logger.info(`💰 Platform fee updated to ${percentage}% by ${updatedBy}`);
      return setting;
    } catch (error) {
      logger.error('Update platform fee failed:', error);
      throw error;
    }
  }

  /**
   * Calculate price preview (for frontend)
   */
  async calculatePricePreview(data) {
    try {
      const { impressions, category, targeting, cpmBid } = data;

      // Get tiers
      const tiers = await prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { impressions: 'asc' },
      });

      // Find tier
      const tier = pricingCalculator.findTier(tiers, impressions);

      if (!tier) {
        throw new ValidationError('No pricing tier found for this impression count');
      }

      // Get platform settings
      const platformSettings = await prisma.platformSettings.findMany({
        where: { key: { in: ['platform_fee_percentage', 'ad_base_cpm'] } },
      });

      const feeSetting = platformSettings.find(s => s.key === 'platform_fee_percentage');
      const cpmSetting = platformSettings.find(s => s.key === 'ad_base_cpm');

      const platformFeePercentage = parseFloat(feeSetting?.value || '20');
      const baseCpm = cpmSetting ? parseFloat(cpmSetting.value) : 1.5;

      // Calculate pricing
      const pricing = pricingCalculator.calculateAdCost({
        tier,
        impressions,
        category,
        targeting: targeting || {},
        cpmBid: cpmBid || 0,
        platformFeePercentage,
        baseCpm,
      });

      return {
        tier: {
          id: tier.id,
          name: tier.name,
          impressions: tier.impressions,
          basePrice: parseFloat(tier.priceUsd),
        },
        pricing,
        platformFeePercentage,
      };
    } catch (error) {
      logger.error('Calculate price preview failed:', error);
      throw error;
    }
  }

  /**
   * Get pricing statistics
   */
  async getPricingStats() {
    try {
      const [
        totalTiers,
        activeTiers,
        platformFee,
        avgAdCost,
        totalRevenue,
      ] = await Promise.all([
        prisma.pricingTier.count(),
        prisma.pricingTier.count({ where: { isActive: true } }),
        this.getPlatformFee(),
        prisma.ad.aggregate({
          where: { status: { in: ['RUNNING', 'COMPLETED'] } },
          _avg: { totalCost: true },
        }),
        prisma.ad.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { totalCost: true, platformFee: true },
        }),
      ]);

      return {
        totalTiers,
        activeTiers,
        platformFeePercentage: platformFee,
        averageAdCost: parseFloat(avgAdCost._avg.totalCost || 0).toFixed(2),
        totalRevenue: parseFloat(totalRevenue._sum.totalCost || 0).toFixed(2),
        platformEarnings: parseFloat(totalRevenue._sum.platformFee || 0).toFixed(2),
      };
    } catch (error) {
      logger.error('Get pricing stats failed:', error);
      throw error;
    }
  }
}

const pricingService = new PricingService();
export default pricingService;