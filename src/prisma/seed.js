import { PrismaClient } from '@prisma/client';
import hash from '../utils/hash.js';
import encryption from '../utils/encryption.js';
import logger from '../utils/logger.js';
import { DEFAULT_PLATFORM_SETTINGS } from '../config/constants.js';

const prisma = new PrismaClient();

/**
 * Seed Database with Test Data
 * Run: npm run prisma:seed
 */
async function main() {
  logger.info('🌱 Starting database seed...');

  try {
    // ==================== PLATFORM SETTINGS ====================
    logger.info('⚙️  Creating platform settings...');

    for (const [key, value] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
      await prisma.platformSettings.upsert({
        where: { key },
        update: { value },
        create: {
          key,
          value,
          description: getSettingDescription(key),
          valueType: getSettingType(key),
          category: getSettingCategory(key),
        },
      });
    }

    logger.info('✅ Platform settings created');

    // ==================== PRICING TIERS ====================
    // ==================== PRICING TIERS ====================
    logger.info('💰 Creating pricing tiers...');

    const pricingTiers = [
      { id: 'tier_100', name: '100 Views', impressions: 100, priceUsd: 0.5, sortOrder: 1 },
      { id: 'tier_500', name: '500 Views', impressions: 500, priceUsd: 2, sortOrder: 2 },
      { id: 'tier_1k', name: '1K Views', impressions: 1000, priceUsd: 3, sortOrder: 3 },
      { id: 'tier_5k', name: '5K Views', impressions: 5000, priceUsd: 12, sortOrder: 4 },
      { id: 'tier_10k', name: '10K Views', impressions: 10000, priceUsd: 20, sortOrder: 5 },
      { id: 'tier_25k', name: '25K Views', impressions: 25000, priceUsd: 45, sortOrder: 6 },
      { id: 'tier_50k', name: '50K Views', impressions: 50000, priceUsd: 85, sortOrder: 7 },
      { id: 'tier_100k', name: '100K Views', impressions: 100000, priceUsd: 160, sortOrder: 8 },
    ];

    for (const tier of pricingTiers) {
      await prisma.pricingTier.upsert({
        where: { id: tier.id }, // ✅ Use ID instead of impressions
        update: tier,
        create: tier,
      });
    }

    logger.info('✅ Pricing tiers created');

    // ==================== USERS ====================
    logger.info('👥 Creating test users...');

    // Super Admin
    const superAdmin = await prisma.user.upsert({
      where: { telegramId: '111111111' },
      update: {},
      create: {
        telegramId: '111111111',
        email: 'superadmin@akhmads.net',
        username: 'superadmin',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        locale: 'uz',
        isActive: true,
      },
    });

    // Create wallet for super admin
    await prisma.wallet.upsert({
      where: { userId: superAdmin.id },
      update: {},
      create: {
        userId: superAdmin.id,
        available: 10000,
      },
    });

    logger.info(`✅ Super Admin created: ${superAdmin.email}`);

    // Admin
    const admin = await prisma.user.upsert({
      where: { telegramId: '222222222' },
      update: {},
      create: {
        telegramId: '222222222',
        email: 'admin@akhmads.net',
        username: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        locale: 'uz',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: admin.id },
      update: {},
      create: {
        userId: admin.id,
        available: 5000,
      },
    });

    logger.info(`✅ Admin created: ${admin.email}`);

    // Moderator
    const moderator = await prisma.user.upsert({
      where: { telegramId: '333333333' },
      update: {},
      create: {
        telegramId: '333333333',
        email: 'moderator@akhmads.net',
        username: 'moderator',
        firstName: 'Moderator',
        lastName: 'User',
        role: 'MODERATOR',
        locale: 'uz',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: moderator.id },
      update: {},
      create: { userId: moderator.id },
    });

    logger.info(`✅ Moderator created: ${moderator.email}`);

    // Advertiser (3 test advertisers)
    const advertiser1 = await prisma.user.upsert({
      where: { telegramId: '444444444' },
      update: {},
      create: {
        telegramId: '444444444',
        email: 'advertiser1@test.com',
        username: 'advertiser1',
        firstName: 'John',
        lastName: 'Advertiser',
        role: 'ADVERTISER',
        locale: 'en',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: advertiser1.id },
      update: {},
      create: {
        userId: advertiser1.id,
        available: 500,
        totalDeposited: 500,
      },
    });

    logger.info(`✅ Advertiser 1 created: ${advertiser1.email}`);

    const advertiser2 = await prisma.user.upsert({
      where: { telegramId: '555555555' },
      update: {},
      create: {
        telegramId: '555555555',
        email: 'advertiser2@test.com',
        username: 'advertiser2',
        firstName: 'Jane',
        lastName: 'Marketer',
        role: 'ADVERTISER',
        locale: 'ru',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: advertiser2.id },
      update: {},
      create: {
        userId: advertiser2.id,
        available: 300,
        totalDeposited: 300,
      },
    });

    logger.info(`✅ Advertiser 2 created: ${advertiser2.email}`);

    // Bot Owner (3 test bot owners)
    const botOwner1 = await prisma.user.upsert({
      where: { telegramId: '666666666' },
      update: {},
      create: {
        telegramId: '666666666',
        email: 'botowner1@test.com',
        username: 'botowner1',
        firstName: 'Alex',
        lastName: 'BotMaster',
        role: 'BOT_OWNER',
        locale: 'uz',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: botOwner1.id },
      update: {},
      create: {
        userId: botOwner1.id,
        available: 125.50,
        totalEarned: 125.50,
      },
    });

    logger.info(`✅ Bot Owner 1 created: ${botOwner1.email}`);

    const botOwner2 = await prisma.user.upsert({
      where: { telegramId: '777777777' },
      update: {},
      create: {
        telegramId: '777777777',
        email: 'botowner2@test.com',
        username: 'botowner2',
        firstName: 'Maria',
        lastName: 'Developer',
        role: 'BOT_OWNER',
        locale: 'ru',
        isActive: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: botOwner2.id },
      update: {},
      create: {
        userId: botOwner2.id,
        available: 89.30,
        totalEarned: 89.30,
      },
    });

    logger.info(`✅ Bot Owner 2 created: ${botOwner2.email}`);

    // ==================== PROMO CODES ====================
    logger.info('🎟️  Creating promo codes...');

    const promoCodes = [
      {
        code: 'WELCOME10',
        discount: 10,
        type: 'percentage',
        maxUses: 1000,
        usedCount: 23,
        validFrom: new Date('2024-01-01'),
        expiresAt: new Date('2026-12-31'),
        isActive: true,
        description: 'Welcome bonus - 10% off',
      },
      {
        code: 'LAUNCH50',
        discount: 50,
        type: 'percentage',
        maxUses: 100,
        usedCount: 87,
        validFrom: new Date('2024-01-01'),
        expiresAt: new Date('2024-03-31'),
        isActive: false,
        description: 'Launch promotion - 50% off',
      },
      {
        code: 'FIXED5',
        discount: 5,
        type: 'fixed',
        maxUses: 500,
        usedCount: 145,
        validFrom: new Date('2024-01-01'),
        expiresAt: new Date('2026-12-31'),
        isActive: true,
        description: 'Fixed $5 discount',
      },
    ];

    for (const promo of promoCodes) {
      await prisma.promoCode.upsert({
        where: { code: promo.code },
        update: promo,
        create: promo,
      });
    }

    logger.info('✅ Promo codes created');

    // ==================== BOTS ====================
    logger.info('🤖 Creating test bots...');

    // Bot 1 - Active
    const bot1Token = 'fake_token_for_test_bot_1_replace_with_real';
    const bot1ApiKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJib3RJZCI6ImJvdDEiLCJvd25lcklkIjoiJHtib3RPd25lcjEuaWR9IiwidGVsZWdyYW1Cb3RJZCI6Ijk5OTk5OTk5OSIsInVzZXJuYW1lIjoidGVzdGJvdCJ9.test`;

    const bot1 = await prisma.bot.upsert({
      where: { telegramBotId: '999999999' },
      update: {},
      create: {
        ownerId: botOwner1.id,
        telegramBotId: '999999999',
        username: 'testbot',
        firstName: 'Test Bot',
        tokenEncrypted: encryption.encrypt(bot1Token),
        apiKey: bot1ApiKey,
        apiKeyHash: encryption.hash(bot1ApiKey),
        shortDescription: 'A test bot for development',
        category: 'technology',
        language: 'uz',
        totalMembers: 15420,
        activeMembers: 8930,
        monetized: true,
        status: 'ACTIVE',
        postFilter: 'all',
        allowedCategories: JSON.stringify(['technology', 'education', 'news']),
        frequencyMinutes: 5,
        totalEarnings: 125.50,
        currentEcpm: 19.68,
        verifiedAt: new Date(),
      },
    });

    logger.info(`✅ Bot 1 created: @${bot1.username}`);

    // Bot 2 - Active
    const bot2Token = 'fake_token_for_test_bot_2_replace_with_real';
    const bot2ApiKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJib3RJZCI6ImJvdDIiLCJvd25lcklkIjoiJHtib3RPd25lcjIuaWR9IiwidGVsZWdyYW1Cb3RJZCI6Ijg4ODg4ODg4OCIsInVzZXJuYW1lIjoibmV3c2JvdCJ9.test`;

    const bot2 = await prisma.bot.upsert({
      where: { telegramBotId: '888888888' },
      update: {},
      create: {
        ownerId: botOwner2.id,
        telegramBotId: '888888888',
        username: 'newsbot',
        firstName: 'News Bot',
        tokenEncrypted: encryption.encrypt(bot2Token),
        apiKey: bot2ApiKey,
        apiKeyHash: encryption.hash(bot2ApiKey),
        shortDescription: 'Latest news and updates',
        category: 'news',
        language: 'ru',
        totalMembers: 23450,
        activeMembers: 12890,
        monetized: true,
        status: 'ACTIVE',
        postFilter: 'all',
        allowedCategories: JSON.stringify(['news', 'entertainment']),
        frequencyMinutes: 10,
        totalEarnings: 89.30,
        currentEcpm: 15.42,
        verifiedAt: new Date(),
      },
    });

    logger.info(`✅ Bot 2 created: @${bot2.username}`);

    // Bot 3 - Pending approval
    const bot3Token = 'fake_token_for_test_bot_3_replace_with_real';
    const bot3ApiKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJib3RJZCI6ImJvdDMiLCJvd25lcklkIjoiJHtib3RPd25lcjEuaWR9IiwidGVsZWdyYW1Cb3RJZCI6Ijc3Nzc3Nzc3NyIsInVzZXJuYW1lIjoic2hvcGJvdCJ9.test`;

    const bot3 = await prisma.bot.upsert({
      where: { telegramBotId: '777777777' },
      update: {},
      create: {
        ownerId: botOwner1.id,
        telegramBotId: '777777777',
        username: 'shopbot',
        firstName: 'Shop Bot',
        tokenEncrypted: encryption.encrypt(bot3Token),
        apiKey: bot3ApiKey,
        apiKeyHash: encryption.hash(bot3ApiKey),
        shortDescription: 'Shopping deals and offers',
        category: 'shopping',
        language: 'uz',
        totalMembers: 5670,
        activeMembers: 2340,
        monetized: false,
        status: 'PENDING',
        postFilter: 'all',
        allowedCategories: JSON.stringify(['shopping', 'technology']),
        frequencyMinutes: 5,
      },
    });

    logger.info(`✅ Bot 3 created: @${bot3.username} (Pending)`);

    // ==================== ADS ====================
    logger.info('📢 Creating test ads...');

    // Ad 1 - Running
    const ad1 = await prisma.ad.create({
      data: {
        advertiserId: advertiser1.id,
        contentType: 'HTML',
        title: 'Tech Course Promo',
        text: '<b>🚀 New Programming Course!</b>\n\nLearn full-stack development in 3 months.\n\n👉 Click to enroll now!',
        htmlContent: '<b>🚀 New Programming Course!</b>\n\nLearn full-stack development in 3 months.\n\n👉 Click to enroll now!',
        buttons: JSON.stringify([
          { text: 'Enroll Now', url: 'https://example.com/course' },
          { text: 'Learn More', url: 'https://example.com/info' },
        ]),
        trackingEnabled: true,
        selectedTierId: pricingTiers[3].name,
        targetImpressions: 5000,
        baseCpm: 2.4,
        cpmBid: 0.5,
        finalCpm: 3.36,
        totalCost: 16.80,
        platformFee: 1.68,
        botOwnerRevenue: 15.12,
        remainingBudget: 8.40,
        status: 'RUNNING',
        deliveredImpressions: 2500,
        uniqueViews: 2180,
        clicks: 105,
        ctr: 4.2,
        targeting: JSON.stringify({
          categories: ['technology', 'education'],
          languages: ['uz', 'ru', 'en'],
          aiSegments: ['tech_enthusiasts'],
        }),
        startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
    });

    logger.info(`✅ Ad 1 created: ${ad1.title} (Running)`);

    // Ad 2 - Completed
    const ad2 = await prisma.ad.create({
      data: {
        advertiserId: advertiser2.id,
        contentType: 'TEXT',
        title: 'Shopping Sale',
        text: '🛍️ Mega Sale! Up to 70% off on all items!\n\nLimited time offer. Shop now!',
        buttons: JSON.stringify([
          { text: 'Shop Now', url: 'https://example.com/sale' },
        ]),
        trackingEnabled: true,
        selectedTierId: pricingTiers[2].name,
        targetImpressions: 1000,
        baseCpm: 3.0,
        cpmBid: 0,
        finalCpm: 3.0,
        totalCost: 3.00,
        platformFee: 0.30,
        botOwnerRevenue: 2.70,
        remainingBudget: 0,
        status: 'COMPLETED',
        deliveredImpressions: 1000,
        uniqueViews: 892,
        clicks: 38,
        ctr: 3.8,
        targeting: JSON.stringify({
          categories: ['shopping'],
          languages: ['ru'],
        }),
        startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info(`✅ Ad 2 created: ${ad2.title} (Completed)`);

    // Ad 3 - Pending approval
    const ad3 = await prisma.ad.create({
      data: {
        advertiserId: advertiser1.id,
        contentType: 'MARKDOWN',
        title: 'Crypto Trading Guide',
        text: '**Learn Crypto Trading**\n\nFree guide for beginners.\n\nStart trading today!',
        markdownContent: '**Learn Crypto Trading**\n\nFree guide for beginners.\n\nStart trading today!',
        buttons: JSON.stringify([
          { text: 'Download Guide', url: 'https://example.com/guide' },
        ]),
        trackingEnabled: true,
        selectedTierId: pricingTiers[4].name,
        targetImpressions: 10000,
        baseCpm: 2.0,
        cpmBid: 0.3,
        finalCpm: 3.22,
        totalCost: 32.20,
        platformFee: 3.22,
        botOwnerRevenue: 28.98,
        remainingBudget: 32.20,
        status: 'SUBMITTED',
        targeting: JSON.stringify({
          categories: ['crypto', 'finance'],
          languages: ['en'],
          aiSegments: ['crypto_traders'],
        }),
      },
    });

    logger.info(`✅ Ad 3 created: ${ad3.title} (Pending)`);

    // ==================== SAMPLE IMPRESSIONS ====================
    logger.info('👁️  Creating sample impressions...');

    // Create 50 sample impressions for running ad
    const sampleUsers = [
      { id: '100001', firstName: 'John', lastName: 'Doe', username: 'johndoe', lang: 'en' },
      { id: '100002', firstName: 'Jane', lastName: 'Smith', username: 'janesmith', lang: 'ru' },
      { id: '100003', firstName: 'Alex', lastName: 'Brown', username: 'alexb', lang: 'uz' },
      { id: '100004', firstName: 'Maria', lastName: 'Garcia', username: 'mariag', lang: 'en' },
      { id: '100005', firstName: 'Ahmed', lastName: 'Ali', username: 'ahmeda', lang: 'uz' },
    ];

    for (let i = 0; i < 50; i++) {
      const user = sampleUsers[i % sampleUsers.length];
      const bot = i % 2 === 0 ? bot1 : bot2;

      await prisma.impression.create({
        data: {
          adId: ad1.id,
          botId: bot.id,
          telegramUserId: `${parseInt(user.id) + i}`,
          firstName: user.firstName,
          lastName: user.lastName,
          username: `${user.username}_${i}`,
          languageCode: user.lang,
          revenue: 0.00336,
          platformFee: 0.000336,
          botOwnerEarns: 0.003024,
          messageId: `msg_${Date.now()}_${i}`,
          createdAt: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000),
        },
      });
    }

    logger.info('✅ Sample impressions created');

    // ==================== FAQ ====================
    logger.info('❓ Creating FAQ entries...');

    const faqs = [
      {
        category: 'general',
        question: JSON.stringify({
          uz: 'AKHMADS.NET nima?',
          ru: 'Что такое AKHMADS.NET?',
          en: 'What is AKHMADS.NET?',
        }),
        answer: JSON.stringify({
          uz: 'AKHMADS.NET - Telegram botlar orqali reklama tarqatish platformasi.',
          ru: 'AKHMADS.NET - платформа для распространения рекламы через Telegram боты.',
          en: 'AKHMADS.NET is a platform for distributing ads through Telegram bots.',
        }),
        sortOrder: 1,
      },
      {
        category: 'advertisement',
        question: JSON.stringify({
          uz: 'Reklama qanday yaratiladi?',
          ru: 'Как создать рекламу?',
          en: 'How to create an ad?',
        }),
        answer: JSON.stringify({
          uz: 'Dashboardga kiring, "Reklama yaratish" tugmasini bosing va ko\'rsatmalarga amal qiling.',
          ru: 'Войдите в панель управления, нажмите "Создать рекламу" и следуйте инструкциям.',
          en: 'Log in to your dashboard, click "Create Ad" and follow the instructions.',
        }),
        sortOrder: 1,
      },
      {
        category: 'bot',
        question: JSON.stringify({
          uz: 'Botni qanday ulash mumkin?',
          ru: 'Как подключить бота?',
          en: 'How to connect a bot?',
        }),
        answer: JSON.stringify({
          uz: 'Bot token kiriting va verifikatsiyadan o\'ting.',
          ru: 'Введите токен бота и пройдите верификацию.',
          en: 'Enter your bot token and complete verification.',
        }),
        sortOrder: 1,
      },
      {
        category: 'payment',
        question: JSON.stringify({
          uz: 'Qanday to\'lov usullari mavjud?',
          ru: 'Какие методы оплаты доступны?',
          en: 'What payment methods are available?',
        }),
        answer: JSON.stringify({
          uz: 'Click, Payme, Visa/Mastercard va kriptovalyutalar (BTC, USDT, ETH va boshqalar).',
          ru: 'Click, Payme, Visa/Mastercard и криптовалюты (BTC, USDT, ETH и другие).',
          en: 'Click, Payme, Visa/Mastercard and cryptocurrencies (BTC, USDT, ETH, etc.).',
        }),
        sortOrder: 1,
      },
    ];

    for (const faq of faqs) {
      await prisma.faq.create({ data: faq });
    }

    logger.info('✅ FAQ entries created');

    // ==================== SUMMARY ====================
    logger.info('\n╔════════════════════════════════════════╗');
    logger.info('║     Database Seed Complete! ✅         ║');
    logger.info('╠════════════════════════════════════════╣');
    logger.info('║ Users:                                 ║');
    logger.info('║   - 1 Super Admin                      ║');
    logger.info('║   - 1 Admin                            ║');
    logger.info('║   - 1 Moderator                        ║');
    logger.info('║   - 2 Advertisers                      ║');
    logger.info('║   - 2 Bot Owners                       ║');
    logger.info('╠════════════════════════════════════════╣');
    logger.info('║ Bots: 3 (2 Active, 1 Pending)         ║');
    logger.info('║ Ads: 3 (1 Running, 1 Complete, 1 Pend)║');
    logger.info('║ Pricing Tiers: 8                       ║');
    logger.info('║ Promo Codes: 3                         ║');
    logger.info('║ FAQ: 4 entries                         ║');
    logger.info('║ Impressions: 50 sample                 ║');
    logger.info('╠════════════════════════════════════════╣');
    logger.info('║ Test Credentials:                      ║');
    logger.info('║ superadmin@akhmads.net (Super Admin)   ║');
    logger.info('║ admin@akhmads.net (Admin)              ║');
    logger.info('║ advertiser1@test.com (Advertiser)      ║');
    logger.info('║ botowner1@test.com (Bot Owner)         ║');
    logger.info('╚════════════════════════════════════════╝');

  } catch (error) {
    logger.error('❌ Seed failed:', error);
    throw error;
  }
}

/**
 * Helper: Get setting description
 */
function getSettingDescription(key) {
  const descriptions = {
    platform_fee_percentage: 'Platform service fee percentage',
    min_deposit_usd: 'Minimum deposit amount in USD',
    min_withdraw_usd: 'Minimum withdrawal amount in USD',
    max_daily_withdraw_usd: 'Maximum daily withdrawal limit per user',
    withdrawal_fee_percentage: 'Withdrawal processing fee percentage',
    auto_approve_ads: 'Auto-approve ads without moderation',
    ai_moderation_enabled: 'Enable AI-powered content moderation',
    default_cpm_usd: 'Default CPM in USD',
    ai_segment_multiplier: 'AI segment targeting multiplier',
    category_multiplier_betting: 'Betting category price multiplier',
    category_multiplier_gambling: 'Gambling category price multiplier',
    category_multiplier_crypto: 'Crypto category price multiplier',
  };
  return descriptions[key] || '';
}

/**
 * Helper: Get setting type
 */
function getSettingType(key) {
  if (key.includes('enabled') || key.includes('auto_approve')) {
    return 'boolean';
  }
  return 'number';
}

/**
 * Helper: Get setting category
 */
function getSettingCategory(key) {
  if (key.includes('fee') || key.includes('withdraw') || key.includes('deposit')) {
    return 'payment';
  }
  if (key.includes('multiplier') || key.includes('cpm')) {
    return 'pricing';
  }
  if (key.includes('ai') || key.includes('moderation')) {
    return 'moderation';
  }
  return 'general';
}

// Run seed
main()
  .catch((e) => {
    logger.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });