import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tiers = await prisma.pricingTier.findMany();
  console.log('Current Pricing Tiers:', JSON.stringify(tiers, null, 2));

  if (tiers.length === 0) {
    console.log('No tiers found. Seeding defaults...');
    await prisma.pricingTier.createMany({
      data: [
        { name: 'Starter', impressions: 1000, priceUsd: 5.0, sortOrder: 1 },
        { name: 'Growth', impressions: 10000, priceUsd: 45.0, sortOrder: 2 },
        { name: 'Pro', impressions: 100000, priceUsd: 400.0, sortOrder: 3 },
      ],
    });
    console.log('Seeded 3 default tiers.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
