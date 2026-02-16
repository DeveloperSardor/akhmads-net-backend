import { nanoid } from 'nanoid';
import prisma from './setup.js';
import hash from '../src/utils/hash.js';
import jwtUtil from '../src/utils/jwt.js';

/**
 * Create test user
 */
export async function createTestUser(data = {}) {
  const user = await prisma.user.create({
    data: {
      telegramId: data.telegramId || nanoid(),
      email: data.email || `test-${nanoid()}@test.com`,
      username: data.username || `user_${nanoid()}`,
      firstName: data.firstName || 'Test',
      lastName: data.lastName || 'User',
      role: data.role || 'ADVERTISER',
      isActive: data.isActive !== false,
      isBanned: data.isBanned || false,
    },
  });

  // Create wallet
  await prisma.wallet.create({
    data: {
      userId: user.id,
      available: data.balance || 0,
    },
  });

  return user;
}

/**
 * Generate auth token for user
 */
export function generateAuthToken(user) {
  return jwtUtil.generateAccessToken(user);
}

/**
 * Create test bot
 */
export async function createTestBot(ownerId, data = {}) {
  const bot = await prisma.bot.create({
    data: {
      ownerId,
      telegramBotId: data.telegramBotId || nanoid(),
      username: data.username || `bot_${nanoid()}`,
      firstName: data.firstName || 'Test Bot',
      tokenEncrypted: data.tokenEncrypted || 'encrypted_token',
      apiKey: data.apiKey || `api_key_${nanoid()}`,
      apiKeyHash: data.apiKeyHash || 'hash',
      status: data.status || 'ACTIVE',
      category: data.category || 'general',
      language: data.language || 'uz',
    },
  });

  return bot;
}

/**
 * Create test ad
 */
export async function createTestAd(advertiserId, data = {}) {
  const ad = await prisma.ad.create({
    data: {
      advertiserId,
      contentType: data.contentType || 'TEXT',
      title: data.title || 'Test Ad',
      text: data.text || 'Test ad content',
      targetImpressions: data.targetImpressions || 1000,
      baseCpm: data.baseCpm || 2.0,
      finalCpm: data.finalCpm || 2.0,
      totalCost: data.totalCost || 2.0,
      platformFee: data.platformFee || 0.2,
      botOwnerRevenue: data.botOwnerRevenue || 1.8,
      remainingBudget: data.remainingBudget || 2.0,
      status: data.status || 'DRAFT',
    },
  });

  return ad;
}

export { prisma };