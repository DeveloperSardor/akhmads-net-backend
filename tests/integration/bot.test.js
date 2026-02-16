import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, createTestBot, generateAuthToken, prisma } from '../helpers.js';

describe('Bot Integration Tests', () => {
  let botOwner, ownerToken;

  beforeAll(async () => {
    botOwner = await createTestUser({ role: 'BOT_OWNER' });
    ownerToken = generateAuthToken(botOwner);
  });

  describe('POST /api/v1/bots', () => {
    it('should register new bot', async () => {
      const res = await request(app)
        .post('/api/v1/bots')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          token: 'fake_bot_token_123',
          shortDescription: 'Test bot for integration testing',
          category: 'technology',
          language: 'uz',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.bot).toHaveProperty('id');
      expect(res.body.data.bot.status).toBe('PENDING');
    });

    it('should reject non-bot-owner', async () => {
      const advertiser = await createTestUser({ role: 'ADVERTISER' });
      const token = generateAuthToken(advertiser);

      const res = await request(app)
        .post('/api/v1/bots')
        .set('Authorization', `Bearer ${token}`)
        .send({
          token: 'fake_token',
          shortDescription: 'Test',
          category: 'tech',
        });

      expect(res.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/bots')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          shortDescription: 'Missing token',
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/bots', () => {
    it('should return user bots', async () => {
      await createTestBot(botOwner.id, { username: 'test_bot_1' });
      await createTestBot(botOwner.id, { username: 'test_bot_2' });

      const res = await request(app)
        .get('/api/v1/bots')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.bots).toBeInstanceOf(Array);
      expect(res.body.data.bots.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/bots/:id', () => {
    it('should return bot details for owner', async () => {
      const bot = await createTestBot(botOwner.id, { username: 'detail_bot' });

      const res = await request(app)
        .get(`/api/v1/bots/${bot.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.bot.id).toBe(bot.id);
      expect(res.body.data.bot.username).toBe('detail_bot');
    });

    it('should reject access from non-owner', async () => {
      const otherOwner = await createTestUser({ role: 'BOT_OWNER' });
      const bot = await createTestBot(otherOwner.id);

      const res = await request(app)
        .get(`/api/v1/bots/${bot.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send();

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/bots/:id', () => {
    it('should update bot settings', async () => {
      const bot = await createTestBot(botOwner.id);

      const res = await request(app)
        .put(`/api/v1/bots/${bot.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          shortDescription: 'Updated description',
          frequencyMinutes: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.bot.shortDescription).toBe('Updated description');
    });
  });

  describe('POST /api/v1/bots/:id/pause', () => {
    it('should pause bot', async () => {
      const bot = await createTestBot(botOwner.id);

      const res = await request(app)
        .post(`/api/v1/bots/${bot.id}/pause`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isPaused: true });

      expect(res.status).toBe(200);
      expect(res.body.data.bot.isPaused).toBe(true);
    });

    it('should resume bot', async () => {
      const bot = await createTestBot(botOwner.id, { isPaused: true });

      const res = await request(app)
        .post(`/api/v1/bots/${bot.id}/pause`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isPaused: false });

      expect(res.status).toBe(200);
      expect(res.body.data.bot.isPaused).toBe(false);
    });
  });

  describe('POST /api/v1/bots/:id/regenerate-api-key', () => {
    it('should regenerate API key', async () => {
      const bot = await createTestBot(botOwner.id);
      const oldApiKey = bot.apiKey;

      const res = await request(app)
        .post(`/api/v1/bots/${bot.id}/regenerate-api-key`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.apiKey).toBeTruthy();
      expect(res.body.data.apiKey).not.toBe(oldApiKey);
    });
  });

  describe('DELETE /api/v1/bots/:id', () => {
    it('should delete bot', async () => {
      const bot = await createTestBot(botOwner.id);

      const res = await request(app)
        .delete(`/api/v1/bots/${bot.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send();

      expect(res.status).toBe(204);

      const deleted = await prisma.bot.findUnique({ where: { id: bot.id } });
      expect(deleted).toBeNull();
    });
  });

  describe('GET /api/v1/bots/:id/integration', () => {
    it('should return integration code', async () => {
      const bot = await createTestBot(botOwner.id);

      const res = await request(app)
        .get(`/api/v1/bots/${bot.id}/integration`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ language: 'python' })
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.code).toContain('class AkhmadsAdClient');
      expect(res.body.data.docs).toBeTruthy();
    });
  });
});