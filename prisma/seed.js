import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // ── PricingTiers ────────────────────────────────────────────────
    const tiers = [
        { name: 'Starter', impressions: 1000, priceUsd: 5.00, sortOrder: 1 },
        { name: 'Basic', impressions: 5000, priceUsd: 20.00, sortOrder: 2 },
        { name: 'Standard', impressions: 10000, priceUsd: 35.00, sortOrder: 3 },
        { name: 'Growth', impressions: 25000, priceUsd: 75.00, sortOrder: 4 },
        { name: 'Pro', impressions: 50000, priceUsd: 130.00, sortOrder: 5 },
        { name: 'Business', impressions: 100000, priceUsd: 220.00, sortOrder: 6 },
        { name: 'Enterprise', impressions: 250000, priceUsd: 500.00, sortOrder: 7 },
    ];

    for (const tier of tiers) {
        await prisma.pricingTier.upsert({
            where: { impressions: tier.impressions },
            update: { name: tier.name, priceUsd: tier.priceUsd, sortOrder: tier.sortOrder, isActive: true },
            create: { ...tier, isActive: true },
        });
    }
    console.log(`✅ ${tiers.length} pricing tiers seeded`);

    // ── PlatformSettings ────────────────────────────────────────────
    const settings = [
        { key: 'platform_fee_percentage', value: '10', description: 'Platform commission %' },
        { key: 'min_impressions', value: '1000', description: 'Min impressions per ad' },
        { key: 'max_impressions', value: '1000000', description: 'Max impressions per ad' },
        { key: 'usd_to_uzs_rate', value: '12700', description: 'USD to UZS rate' },
    ];

    for (const s of settings) {
        await prisma.platformSettings.upsert({
            where: { key: s.key },
            update: { value: s.value, description: s.description },
            create: s,
        });
    }
    console.log(`✅ ${settings.length} platform settings seeded`);

    console.log('🎉 Seeding completed!');
}

main()
    .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
