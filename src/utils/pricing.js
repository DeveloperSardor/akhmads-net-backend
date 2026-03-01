// src/utils/pricing.js
import { AD_CATEGORIES, AI_SEGMENTS } from '../config/constants.js';
import logger from './logger.js';

/**
 * Dynamic Pricing Calculator
 * Calculates ad costs based on tiers, targeting, categories, bids
 */
class PricingCalculator {
  /**
   * Find pricing tier for given impressions
   */
  findTier(tiers, impressions) {
    if (!tiers || tiers.length === 0) return null;

    const sortedTiers = tiers
      .filter((t) => t.isActive)
      .sort((a, b) => a.impressions - b.impressions);

    if (sortedTiers.length === 0) return null;

    let matchedTier = sortedTiers[0];
    
    for (const tier of sortedTiers) {
      if (impressions >= tier.impressions) {
        matchedTier = tier;
      } else {
        break;
      }
    }

    return matchedTier;
  }

  /**
   * Calculate base CPM
   */
  calculateBaseCPM(params) {
    // If baseCpm is explicitly provided (e.g. from PlatformSettings)
    if (params.baseCpm !== undefined && params.baseCpm !== null) {
      return parseFloat(params.baseCpm);
    }
    
    // Fallback to tier-based or default
    const tier = params.tier;
    if (!tier) {
      logger.warn('No tier or baseCpm provided, using default CPM');
      return 1.5; // Default $1.5 CPM
    }

    const priceUsd = parseFloat(tier.priceUsd?.toString() || tier.priceUsd || 1.5);
    const tierImpressions = parseInt(tier.impressions || 1000);
    return (priceUsd / tierImpressions) * 1000;
  }

  /**
   * Get category multiplier
   */
  getCategoryMultiplier(categoryId) {
    if (!categoryId || categoryId === 'general') {
      return 1.0;
    }

    const category = AD_CATEGORIES.find((c) => c.id === categoryId);
    return category ? category.multiplier : 1.0;
  }

  /**
   * Calculate targeting multiplier
   */
  calculateTargetingMultiplier(targeting) {
    if (!targeting || typeof targeting !== 'object') {
      return 1.0;
    }

    let multiplier = 1.0;

    // AI segments
    if (targeting.aiSegments && Array.isArray(targeting.aiSegments) && targeting.aiSegments.length > 0) {
      const segmentMultipliers = targeting.aiSegments.map((segmentId) => {
        const segment = AI_SEGMENTS.find((s) => s.id === segmentId);
        return segment ? segment.multiplier : 1.0;
      });
      
      multiplier *= Math.max(...segmentMultipliers, 1.0);
    }

    // Specific bots
    if (targeting.specificBots && Array.isArray(targeting.specificBots) && targeting.specificBots.length > 0) {
      multiplier *= 1.2;
    }

    // Language targeting
    if (targeting.languages && Array.isArray(targeting.languages) && targeting.languages.length < 3) {
      multiplier *= 1.1;
    }

    return multiplier;
  }

  /**
   * Calculate total ad cost
   * ✅ FIXED - Proper Decimal handling throughout
   */
  calculateAdCost(params) {
    const {
      tier,
      impressions,
      category,
      targeting = {},
      cpmBid = 0,
      platformFeePercentage = 20, // Default to 20%
      promoCode = null,
      baseCpm = null,
    } = params;

    try {
      // ✅ VALIDATION
      if (!impressions || impressions < 100) {
        throw new Error('Invalid impressions count');
      }

      // 1. Base CPM
      const baseCPM = this.calculateBaseCPM({ tier, impressions, baseCpm });

      // 2. Category multiplier
      const categoryMultiplier = this.getCategoryMultiplier(category);

      // 3. Targeting multiplier
      const targetingMultiplier = this.calculateTargetingMultiplier(targeting);

      // 4. Calculate adjusted CPM
      const adjustedCPM = baseCPM * categoryMultiplier * targetingMultiplier;

      // 5. Add bid
      const finalCPM = adjustedCPM + parseFloat(cpmBid || 0);

      // 6. Calculate base cost
      const baseCost = (finalCPM * impressions) / 1000;

      // 7. Apply promo code discount
      let discount = 0;
      let finalCost = baseCost;

      if (promoCode && promoCode.isActive) {
        if (promoCode.type === 'percentage') {
          discount = (baseCost * parseFloat(promoCode.discount)) / 100;
        } else if (promoCode.type === 'fixed') {
          discount = parseFloat(promoCode.discount);
        }
        finalCost = Math.max(0, baseCost - discount);
      }

      // 8. Calculate platform fee
      const platformFee = (finalCost * platformFeePercentage) / 100;

      // 9. Calculate bot owner revenue
      const botOwnerRevenue = finalCost - platformFee;

      // 10. Total cost to advertiser
      const totalCost = finalCost;

      return {
        baseCPM: parseFloat(baseCPM.toFixed(4)),
        categoryMultiplier: parseFloat(categoryMultiplier.toFixed(2)),
        targetingMultiplier: parseFloat(targetingMultiplier.toFixed(2)),
        cpmBid: parseFloat(cpmBid || 0),
        finalCPM: parseFloat(finalCPM.toFixed(4)),
        impressions,
        baseCost: parseFloat(baseCost.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        platformFee: parseFloat(platformFee.toFixed(2)),
        platformFeePercentage,
        botOwnerRevenue: parseFloat(botOwnerRevenue.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
      };
    } catch (error) {
      logger.error('Pricing calculation error:', error);
      throw new Error(`Failed to calculate pricing: ${error.message}`);
    }
  }

  /**
   * Calculate revenue per impression
   */
  calculateImpressionRevenue(finalCPM, platformFeePercentage = 20) {
    const revenuePerImpression = finalCPM / 1000;
    const platformFee = (revenuePerImpression * platformFeePercentage) / 100;
    const botOwnerEarns = revenuePerImpression - platformFee;

    return {
      revenuePerImpression: parseFloat(revenuePerImpression.toFixed(6)),
      platformFee: parseFloat(platformFee.toFixed(6)),
      botOwnerEarns: parseFloat(botOwnerEarns.toFixed(6)),
    };
  }
}

const pricingCalculator = new PricingCalculator();
export default pricingCalculator;