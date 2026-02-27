import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Seed initial data if missing
 */
export const seedInitialData = async () => {
  try {
    // 1. Check pricing tiers
    const tiersCount = await prisma.pricingTier.count();
    if (tiersCount === 0) {
      logger.info('🌱 No pricing tiers found. Seeding defaults...');
      await prisma.pricingTier.createMany({
        data: [
          { name: 'Starter', impressions: 1000, priceUsd: 5.0, sortOrder: 1 },
          { name: 'Growth', impressions: 10000, priceUsd: 45.0, sortOrder: 2 },
          { name: 'Pro', impressions: 100000, priceUsd: 400.0, sortOrder: 3 },
        ],
      });
      logger.info('✅ Seeded default pricing tiers');
    }

    // 2. Check platform settings
    const feeSetting = await prisma.platformSettings.findUnique({
      where: { key: 'platform_fee_percentage' }
    });
    
    if (!feeSetting) {
      logger.info('🌱 Platform fee setting missing. Seeding default (10%)...');
      await prisma.platformSettings.create({
        data: {
          key: 'platform_fee_percentage',
          value: '10',
          description: 'Default platform fee percentage',
          category: 'pricing'
        }
      });
      logger.info('✅ Seeded default platform fee setting');
    }
  } catch (error) {
    logger.error('❌ Data seeding failed:', error.message);
  }
};
