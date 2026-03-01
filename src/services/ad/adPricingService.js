// src/services/ad/adPricingService.js
import prisma from '../../config/database.js';
import pricingCalculator from '../../utils/pricing.js';
import logger from '../../utils/logger.js';

/**
 * Ad Pricing Service
 * Dedicated pricing calculations and estimates
 */
class AdPricingService {
  /**
   * Get pricing estimate
   */
  async getPricingEstimate(data) {
    try {
      const tiers = await prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { impressions: 'asc' },
      });

      const tier = pricingCalculator.findTier(tiers, data.impressions);

      const platformSettings = await prisma.platformSettings.findMany({
        where: { key: { in: ['platform_fee_percentage', 'ad_base_cpm'] } },
      });

      const feeSetting = platformSettings.find(s => s.key === 'platform_fee_percentage');
      const cpmSetting = platformSettings.find(s => s.key === 'ad_base_cpm');

      const platformFeePercentage = parseFloat(feeSetting?.value || '20');
      const baseCpm = cpmSetting ? parseFloat(cpmSetting.value) : 1.5;

      const pricing = pricingCalculator.calculateAdCost({
        tier,
        impressions: data.impressions,
        category: data.category || 'general',
        targeting: data.targeting || {},
        cpmBid: data.cpmBid || 0,
        platformFeePercentage,
        baseCpm,
      });

      return {
        tier,
        pricing,
        breakdown: {
          baseCPM: pricing.baseCPM,
          categoryMultiplier: pricing.categoryMultiplier,
          targetingMultiplier: pricing.targetingMultiplier,
          finalCPM: pricing.finalCPM,
          platformFee: pricing.platformFee,
          totalCost: pricing.totalCost,
        },
      };
    } catch (error) {
      logger.error('Get pricing estimate failed:', error);
      throw error;
    }
  }

  /**
   * Get all pricing tiers
   */
  async getPricingTiers() {
    try {
      return await prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      logger.error('Get pricing tiers failed:', error);
      throw error;
    }
  }

  /**
   * Calculate custom impressions price
   */
  async calculateCustomPrice(impressions, targeting = {}) {
    try {
      const estimate = await this.getPricingEstimate({
        impressions,
        targeting,
      });

      return estimate.pricing.totalCost;
    } catch (error) {
      logger.error('Calculate custom price failed:', error);
      throw error;
    }
  }
}

const adPricingService = new AdPricingService();
export default adPricingService;