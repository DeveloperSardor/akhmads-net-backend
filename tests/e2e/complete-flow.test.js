import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../helpers.js';

describe('E2E: Complete User Journey', () => {
  let advertiserToken, botOwnerToken;
  let advertiserId, botOwnerId, botId, adId;

  beforeAll(async () => {
    // Create pricing tier
    await prisma.pricingTier.create({
      data: {
        name: '1K Views',
        impressions: 1000,
        priceUsd: 2.0,
        isActive: true,
        sortOrder: 1,
      },
    });

    // Create platform settings
    const settings = [
      { key: 'platform_fee_percentage', value: '10' },
      { key: 'min_deposit_usd', value: '5' },
      { key: 'min_withdraw_usd', value: '10' },
      { key: 'withdrawal_fee_percentage', value: '2' },
    ];

    for (const setting of settings) {
      await prisma.platformSettings.upsert({
        where: { key: setting.key },
        create: {
          key: setting.key,
          value: setting.value,
          valueType: 'number',
          category: 'general',
        },
        update: { value: setting.value },
      });
    }
  });

  describe('1. User Registration & Login', () => {
    it('should initiate advertiser login', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login/initiate')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('loginToken');
      expect(res.body.data).toHaveProperty('deepLink');
    });

    it('should create advertiser account after login', async () => {
      // Simulate successful login
      const user = await prisma.user.create({
        data: {
          telegramId: '111111111',
          email: 'advertiser@test.com',
          username: 'advertiser_test',
          firstName: 'John',
          lastName: 'Advertiser',
          role: 'ADVERTISER',
          isActive: true,
        },
      });

      await prisma.wallet.create({
        data: {
          userId: user.id,
          available: 1000, // Starting balance
        },
      });

      advertiserId = user.id;

      // Generate token
      const jwtUtil = await import('../../src/utils/jwt.js');
      advertiserToken = jwtUtil.default.generateAccessToken(user);

      expect(advertiserToken).toBeTruthy();
    });

    it('should create bot owner account', async () => {
      const user = await prisma.user.create({
        data: {
          telegramId: '222222222',
          email: 'botowner@test.com',
          username: 'botowner_test',
          firstName: 'Jane',
          lastName: 'BotOwner',
          role: 'BOT_OWNER',
          isActive: true,
        },
      });

      await prisma.wallet.create({
        data: { userId: user.id },
      });

      botOwnerId = user.id;

      const jwtUtil = await import('../../src/utils/jwt.js');
      botOwnerToken = jwtUtil.default.generateAccessToken(user);

      expect(botOwnerToken).toBeTruthy();
    });
  });

  describe('2. Bot Owner Registers Bot', () => {
    it('should register bot successfully', async () => {
      const res = await request(app)
        .post('/api/v1/bots')
        .set('Authorization', `Bearer ${botOwnerToken}`)
        .send({
          token: 'fake_bot_token_e2e_test',
          shortDescription: 'E2E test bot for integration testing',
          category: 'technology',
          language: 'uz',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.bot.status).toBe('PENDING');
      botId = res.body.data.bot.id;
    });

    it('should approve bot (admin action)', async () => {
      // Simulate admin approval
      await prisma.bot.update({
        where: { id: botId },
        data: {
          status: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });

      const bot = await prisma.bot.findUnique({ where: { id: botId } });
      expect(bot.status).toBe('ACTIVE');
    });

    it('should get bot integration code', async () => {
      const res = await request(app)
        .get(`/api/v1/bots/${botId}/integration`)
        .set('Authorization', `Bearer ${botOwnerToken}`)
        .query({ language: 'python' })
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.code).toContain('AkhmadsAdClient');
    });
  });

  describe('3. Advertiser Creates Campaign', () => {
    it('should check pricing', async () => {
      const res = await request(app)
        .get('/api/v1/ads/pricing')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.tiers.length).toBeGreaterThan(0);
    });

    it('should get pricing estimate', async () => {
      const res = await request(app)
        .post('/api/v1/ads/pricing/estimate')
        .send({
          impressions: 1000,
          category: 'technology',
          targeting: { languages: ['uz'] },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.estimate.pricing).toHaveProperty('totalCost');
    });

    it('should create ad campaign', async () => {
      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send({
          contentType: 'TEXT',
          title: 'E2E Test Campaign',
          text: 'This is a complete end-to-end test campaign for AKHMADS.NET platform.',
          targetImpressions: 1000,
          buttons: [
            { text: 'Visit Website', url: 'https://example.com' },
          ],
          targeting: {
            languages: ['uz'],
            categories: ['technology'],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ad.status).toBe('DRAFT');
      adId = res.body.data.ad.id;
    });

    it('should submit ad for moderation', async () => {
      const res = await request(app)
        .post(`/api/v1/ads/${adId}/submit`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.ad.status).toBe('SUBMITTED');
    });

    it('should approve ad (moderator action)', async () => {
      // Simulate moderator approval
      await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      const ad = await prisma.ad.findUnique({ where: { id: adId } });
      expect(ad.status).toBe('RUNNING');
    });
  });

  describe('4. Ad Distribution & Tracking', () => {
    it('should deliver ad via bot API', async () => {
      const bot = await prisma.bot.findUnique({ where: { id: botId } });

      const res = await request(app)
        .post('/api/v1/ad/SendPost')
        .set('Authorization', `Bearer ${bot.apiKey}`)
        .send({ SendToChatId: 123456789 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('SendPostResult');
    });

    it('should record impression', async () => {
      const impressions = await prisma.impression.findMany({
        where: { adId },
      });

      expect(impressions.length).toBeGreaterThan(0);
    });

    it('should track click', async () => {
      const tracking = await import('../../src/utils/tracking.js');
      const token = tracking.default.generateToken({
        adId,
        botId,
        originalUrl: 'https://example.com',
        telegramUserId: '987654321',
      });

      const res = await request(app)
        .get(`/api/v1/track/${token}`)
        .send();

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://example.com');
    });
  });

  describe('5. Analytics & Reporting', () => {
    it('should get advertiser dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/advertiser/overview')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.overview).toHaveProperty('ads');
      expect(res.body.data.overview).toHaveProperty('wallet');
    });

    it('should get ad performance', async () => {
      const res = await request(app)
        .get(`/api/v1/ads/${adId}/performance`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.performance).toHaveProperty('ad');
    });

    it('should get bot owner dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/owner/overview')
        .set('Authorization', `Bearer ${botOwnerToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.overview).toHaveProperty('bots');
      expect(res.body.data.overview).toHaveProperty('wallet');
    });

    it('should export impressions to Excel', async () => {
      const res = await request(app)
        .get(`/api/v1/ads/${adId}/export`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('spreadsheet');
    });
  });

  describe('6. Withdrawal', () => {
    it('bot owner should request withdrawal', async () => {
      // First, add some earnings
      await prisma.wallet.update({
        where: { userId: botOwnerId },
        data: { available: 100 },
      });

      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${botOwnerToken}`)
        .send({
          method: 'CARD',
          provider: 'CLICK',
          amount: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.withdrawal.status).toBe('REQUESTED');
    });
  });

  describe('7. Platform Health', () => {
    it('should return healthy status', async () => {
      const res = await request(app)
        .get('/health')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.services.database).toBe('healthy');
    });
  });
});