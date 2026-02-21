// scripts/seedPricingTiers.js
import prisma from '../src/config/database.js';
import logger from '../src/utils/logger.js';

/**
 * Seed default pricing tiers
 * Run: node scripts/seedPricingTiers.js
 */

const defaultTiers = [
  {
    name: 'Starter',
    impressions: 1000,
    priceUsd: 5.00,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Basic',
    impressions: 5000,
    priceUsd: 20.00,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Growth',
    impressions: 10000,
    priceUsd: 35.00,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Professional',
    impressions: 25000,
    priceUsd: 80.00,
    isActive: true,
    sortOrder: 3,
  },
  {
    name: 'Business',
    impressions: 50000,
    priceUsd: 150.00,
    isActive: true,
    sortOrder: 4,
  },
  {
    name: 'Enterprise',
    impressions: 100000,
    priceUsd: 280.00,
    isActive: true,
    sortOrder: 5,
  },
];

async function seedPricingTiers() {
  try {
    logger.info('🌱 Seeding pricing tiers...');

    // Clear existing tiers (optional - comment out if you want to keep existing)
    // await prisma.pricingTier.deleteMany({});
    // logger.info('Cleared existing pricing tiers');

    // Create tiers
    for (const tier of defaultTiers) {
      const existing = await prisma.pricingTier.findFirst({
        where: { impressions: tier.impressions },
      });

      if (existing) {
        logger.info(`⏭️  Skipping ${tier.name} - already exists`);
        continue;
      }

      await prisma.pricingTier.create({
        data: tier,
      });

      const cpm = (tier.priceUsd / tier.impressions * 1000).toFixed(4);
      logger.info(`✅ Created ${tier.name}: ${tier.impressions.toLocaleString()} impressions = $${tier.priceUsd} (CPM: $${cpm})`);
    }

    // Set platform fee if not exists
    const platformFee = await prisma.platformSettings.findUnique({
      where: { key: 'platform_fee_percentage' },
    });

    if (!platformFee) {
      await prisma.platformSettings.create({
        data: {
          key: 'platform_fee_percentage',
          value: '10',
          description: 'Platform fee percentage charged on ad revenue',
          valueType: 'number',
          category: 'pricing',
        },
      });
      logger.info('✅ Platform fee set to 10%');
    } else {
      logger.info(`⏭️  Platform fee already set: ${platformFee.value}%`);
    }

    logger.info('✅ Pricing tiers seeded successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedPricingTiers();