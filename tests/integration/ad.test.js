import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, createTestAd, generateAuthToken, prisma } from '../helpers.js';

describe('Ad Integration Tests', () => {
  let advertiser, advertiserToken;

  beforeAll(async () => {
    advertiser = await createTestUser({ role: 'ADVERTISER', balance: 1000 });
    advertiserToken = generateAuthToken(advertiser);

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
  });

  describe('GET /api/v1/ads/pricing', () => {
    it('should return pricing tiers', async () => {
      const res = await request(app)
        .get('/api/v1/ads/pricing')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.tiers).toBeInstanceOf(Array);
      expect(res.body.data.tiers.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/ads/pricing/estimate', () => {
    it('should return pricing estimate', async () => {
      const res = await request(app)
        .post('/api/v1/ads/pricing/estimate')
        .send({
          impressions: 1000,
          category: 'general',
          targeting: {},
        });

      expect(res.status).toBe(200);
      expect(res.body.data.estimate).toHaveProperty('pricing');
      expect(res.body.data.estimate.pricing).toHaveProperty('totalCost');
    });

    it('should apply category multiplier', async () => {
      const res = await request(app)
        .post('/api/v1/ads/pricing/estimate')
        .send({
          impressions: 1000,
          category: 'betting',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.estimate.pricing.categoryMultiplier).toBe(2);
    });
  });

  describe('POST /api/v1/ads', () => {
    it('should create new ad', async () => {
      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send({
          contentType: 'TEXT',
          title: 'Test Ad Campaign',
          text: 'This is a test ad for integration testing purposes.',
          targetImpressions: 1000,
          buttons: [
            { text: 'Click Here', url: 'https://example.com' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ad).toHaveProperty('id');
      expect(res.body.data.ad.status).toBe('DRAFT');
      expect(res.body.data.ad.title).toBe('Test Ad Campaign');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send({
          contentType: 'TEXT',
          title: 'No text',
        });

      expect(res.status).toBe(422);
    });

    it('should reject non-advertiser', async () => {
      const botOwner = await createTestUser({ role: 'BOT_OWNER' });
      const token = generateAuthToken(botOwner);

      const res = await request(app)
        .post('/api/v1/ads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          contentType: 'TEXT',
          title: 'Test',
          text: 'Test ad',
          targetImpressions: 1000,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/ads', () => {
    it('should return user ads', async () => {
      await createTestAd(advertiser.id, { title: 'Ad 1' });
      await createTestAd(advertiser.id, { title: 'Ad 2' });

      const res = await request(app)
        .get('/api/v1/ads')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      await createTestAd(advertiser.id, { status: 'RUNNING' });
      await createTestAd(advertiser.id, { status: 'DRAFT' });

      const res = await request(app)
        .get('/api/v1/ads')
        .set('Authorization', `Bearer ${advertiserToken}`)
        .query({ status: 'RUNNING' })
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.every(ad => ad.status === 'RUNNING')).toBe(true);
    });
  });

  describe('GET /api/v1/ads/:id', () => {
    it('should return ad details', async () => {
      const ad = await createTestAd(advertiser.id, { title: 'Detail Test' });

      const res = await request(app)
        .get(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.ad.id).toBe(ad.id);
      expect(res.body.data.ad.title).toBe('Detail Test');
    });

    it('should reject access from non-owner', async () => {
      const otherUser = await createTestUser({ role: 'ADVERTISER' });
      const ad = await createTestAd(otherUser.id);
      
      const res = await request(app)
        .get(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/ads/:id', () => {
    it('should update draft ad', async () => {
      const ad = await createTestAd(advertiser.id, { status: 'DRAFT' });

      const res = await request(app)
        .put(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send({
          title: 'Updated Title',
          text: 'Updated text content for the ad',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ad.title).toBe('Updated Title');
    });

    it('should reject update for non-draft ad', async () => {
      const ad = await createTestAd(advertiser.id, { status: 'RUNNING' });

      const res = await request(app)
        .put(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/ads/:id/submit', () => {
    it('should submit ad for moderation', async () => {
      const ad = await createTestAd(advertiser.id, { 
        status: 'DRAFT',
        totalCost: 10,
      });

      const res = await request(app)
        .post(`/api/v1/ads/${ad.id}/submit`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.ad.status).toBe('SUBMITTED');
    });

    it('should reject if insufficient balance', async () => {
      const poorUser = await createTestUser({ role: 'ADVERTISER', balance: 1 });
      const token = generateAuthToken(poorUser);
      const ad = await createTestAd(poorUser.id, { 
        status: 'DRAFT',
        totalCost: 100,
      });

      const res = await request(app)
        .post(`/api/v1/ads/${ad.id}/submit`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(402);
    });
  });

  describe('POST /api/v1/ads/:id/pause', () => {
    it('should pause running ad', async () => {
      const ad = await createTestAd(advertiser.id, { status: 'RUNNING' });

      const res = await request(app)
        .post(`/api/v1/ads/${ad.id}/pause`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.ad.status).toBe('PAUSED');
    });
  });

  describe('POST /api/v1/ads/:id/duplicate', () => {
    it('should duplicate ad', async () => {
      const original = await createTestAd(advertiser.id, { title: 'Original Ad' });

      const res = await request(app)
        .post(`/api/v1/ads/${original.id}/duplicate`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(201);
      expect(res.body.data.ad.id).not.toBe(original.id);
      expect(res.body.data.ad.title).toContain('Copy');
      expect(res.body.data.ad.status).toBe('DRAFT');
    });
  });

  describe('DELETE /api/v1/ads/:id', () => {
    it('should delete draft ad', async () => {
      const ad = await createTestAd(advertiser.id, { status: 'DRAFT' });

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(204);

      const deleted = await prisma.ad.findUnique({ where: { id: ad.id } });
      expect(deleted).toBeNull();
    });

    it('should reject delete for running ad', async () => {
      const ad = await createTestAd(advertiser.id, { status: 'RUNNING' });

      const res = await request(app)
        .delete(`/api/v1/ads/${ad.id}`)
        .set('Authorization', `Bearer ${advertiserToken}`)
        .send();

      expect(res.status).toBe(422);
    });
  });
});