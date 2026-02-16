import { describe, it, expect } from '@jest/globals';
import pricingCalculator from '../../../src/utils/pricing.js';
import { AD_CATEGORIES } from '../../../src/config/constants.js';

describe('Pricing Calculator', () => {
  const mockTier = {
    impressions: 1000,
    priceUsd: 2.0,
  };

  describe('calculateAdCost', () => {
    it('should calculate base cost correctly', () => {
      const result = pricingCalculator.calculateAdCost({
        tier: mockTier,
        impressions: 1000,
        category: 'general',
        targeting: {},
        cpmBid: 0,
        platformFeePercentage: 10,
      });

      expect(result.baseCPM).toBe(2.0);
      expect(result.categoryMultiplier).toBe(1);
      expect(result.targetingMultiplier).toBe(1);
      expect(result.totalCost).toBe(2.0);
    });

    it('should apply category multiplier for betting', () => {
      const result = pricingCalculator.calculateAdCost({
        tier: mockTier,
        impressions: 1000,
        category: 'betting',
        targeting: {},
        cpmBid: 0,
        platformFeePercentage: 10,
      });

      expect(result.categoryMultiplier).toBe(2);
      expect(result.totalCost).toBeGreaterThan(2.0);
    });

    it('should apply targeting multiplier', () => {
      const result = pricingCalculator.calculateAdCost({
        tier: mockTier,
        impressions: 1000,
        category: 'general',
        targeting: { aiSegments: ['tech_enthusiasts'] },
        cpmBid: 0,
        platformFeePercentage: 10,
      });

      expect(result.targetingMultiplier).toBeGreaterThan(1);
    });

    it('should add CPM bid correctly', () => {
      const result = pricingCalculator.calculateAdCost({
        tier: mockTier,
        impressions: 1000,
        category: 'general',
        targeting: {},
        cpmBid: 0.5,
        platformFeePercentage: 10,
      });

      expect(result.cpmBid).toBe(0.5);
      expect(result.finalCPM).toBeGreaterThan(result.baseCPM);
    });
  });

  describe('calculateImpressionRevenue', () => {
    it('should calculate revenue breakdown correctly', () => {
      const result = pricingCalculator.calculateImpressionRevenue(3.0, 10);

      expect(result.revenuePerImpression).toBe(0.003);
      expect(result.platformFee).toBeCloseTo(0.0003, 6);
      expect(result.botOwnerEarns).toBeCloseTo(0.0027, 6);
    });
  });
});