import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, createTestBot, createTestAd, generateAuthToken, prisma } from '../helpers.js';
import tracking from '../../src/utils/tracking.js';

describe('Tracking Integration Tests', () => {
  let advertiser, bot, ad;

  beforeAll(async () => {
    advertiser = await createTestUser({ role: 'ADVERTISER' });
    const botOwner = await createTestUser({ role: 'BOT_OWNER' });
    
    bot = await createTestBot(botOwner.id, {
      status: 'ACTIVE',
      username: 'tracking_test_bot',
    });

    ad = await createTestAd(advertiser.id, {
      status: 'RUNNING',
      title: 'Tracking Test Ad',
      trackingEnabled: true,
    });
  });

  describe('Click Tracking', () => {
    it('should generate valid tracking token', () => {
      const payload = {
        adId: ad.id,
        botId: bot.id,
        originalUrl: 'https://example.com',
        telegramUserId: '123456789',
      };

      const token = tracking.generateToken(payload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      const decrypted = tracking.decryptToken(token);
      expect(decrypted.adId).toBe(ad.id);
      expect(decrypted.botId).toBe(bot.id);
      expect(decrypted.originalUrl).toBe('https://example.com');
    });

    it('should wrap buttons with tracking', () => {
      const buttons = [
        { text: 'Visit', url: 'https://example.com' },
        { text: 'Learn More', url: 'https://example.com/learn' },
      ];

      const wrapped = tracking.wrapButtonsWithTracking(buttons, ad.id, bot.id);

      expect(wrapped).toHaveLength(2);
      expect(wrapped[0].text).toBe('Visit');
      expect(wrapped[0].url).toContain('/t/');
      expect(wrapped[0].url).not.toBe(buttons[0].url);
    });
  });

  describe('GET /api/v1/track/:token', () => {
    it('should record click and redirect', async () => {
      const token = tracking.generateToken({
        adId: ad.id,
        botId: bot.id,
        originalUrl: 'https://example.com/destination',
        telegramUserId: '999888777',
      });

      const res = await request(app)
        .get(`/api/v1/track/${token}`)
        .set('User-Agent', 'Mozilla/5.0')
        .send();

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://example.com/destination');

      // Verify click was recorded
      const clickEvent = await prisma.clickEvent.findFirst({
        where: {
          trackingToken: token,
        },
      });

      expect(clickEvent).toBeTruthy();
      expect(clickEvent.clicked).toBe(true);
      expect(clickEvent.adId).toBe(ad.id);
      expect(clickEvent.botId).toBe(bot.id);
    });

    it('should handle invalid token gracefully', async () => {
      const res = await request(app)
        .get('/api/v1/track/invalid_token_12345')
        .send();

      expect(res.status).toBe(404);
    });

    it('should not record duplicate clicks', async () => {
      const token = tracking.generateToken({
        adId: ad.id,
        botId: bot.id,
        originalUrl: 'https://example.com',
        telegramUserId: '111222333',
      });

      // First click
      await request(app).get(`/api/v1/track/${token}`).send();

      // Second click
      await request(app).get(`/api/v1/track/${token}`).send();

      // Should only have one click event
      const clicks = await prisma.clickEvent.findMany({
        where: { trackingToken: token },
      });

      expect(clicks).toHaveLength(1);
    });

    it('should update ad click count', async () => {
      const token = tracking.generateToken({
        adId: ad.id,
        botId: bot.id,
        originalUrl: 'https://example.com',
        telegramUserId: '444555666',
      });

      const beforeAd = await prisma.ad.findUnique({ where: { id: ad.id } });
      const clicksBefore = beforeAd.clicks;

      await request(app).get(`/api/v1/track/${token}`).send();

      const afterAd = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(afterAd.clicks).toBe(clicksBefore + 1);
    });
  });

  describe('GET /api/v1/ads/:id/clicks', () => {
    it('should return ad clicks', async () => {
      const token = generateAuthToken(advertiser);

      // Create some clicks
      await prisma.clickEvent.createMany({
        data: [
          {
            adId: ad.id,
            botId: bot.id,
            trackingToken: 'token1',
            originalUrl: 'https://example.com',
            clicked: true,
            clickedAt: new Date(),
          },
          {
            adId: ad.id,
            botId: bot.id,
            trackingToken: 'token2',
            originalUrl: 'https://example.com',
            clicked: true,
            clickedAt: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get(`/api/v1/ads/${ad.id}/clicks`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should paginate clicks', async () => {
      const token = generateAuthToken(advertiser);

      const res = await request(app)
        .get(`/api/v1/ads/${ad.id}/clicks`)
        .set('Authorization', `Bearer ${token}`)
        .query({ limit: 5 })
        .send();

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });
  });
});