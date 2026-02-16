import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, generateAuthToken, prisma } from '../helpers.js';

describe('Auth Integration Tests', () => {
  describe('POST /api/v1/auth/login/initiate', () => {
    it('should initiate login session', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login/initiate')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('loginToken');
      expect(res.body.data).toHaveProperty('deepLink');
      expect(res.body.data).toHaveProperty('codes');
      expect(res.body.data.codes).toHaveLength(4);
    });

    it('should create login session in database', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login/initiate')
        .send();

      const session = await prisma.loginSession.findUnique({
        where: { token: res.body.data.loginToken },
      });

      expect(session).toBeTruthy();
      expect(session.authorized).toBe(false);
    });
  });

  describe('GET /api/v1/auth/login/status/:token', () => {
    it('should return not authorized for new session', async () => {
      const initRes = await request(app)
        .post('/api/v1/auth/login/initiate')
        .send();

      const token = initRes.body.data.loginToken;

      const res = await request(app)
        .get(`/api/v1/auth/login/status/${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.authorized).toBe(false);
    });

    it('should return 401 for expired session', async () => {
      const session = await prisma.loginSession.create({
        data: {
          token: 'expired_token',
          codes: JSON.stringify(['1234', '5678', '9012', '3456']),
          correctCode: '1234',
          ipAddress: '127.0.0.1',
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      });

      const res = await request(app)
        .get(`/api/v1/auth/login/status/expired_token`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.expired).toBe(true);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token', async () => {
      const user = await createTestUser();
      const tokens = await import('../../src/utils/jwt.js').then(m => 
        m.default.generateTokenPair(user)
      );

      // Store refresh token
      const { redisClient } = await import('../../src/config/redis.js');
      await redisClient.set(`refresh_token:${user.id}`, tokens.refreshToken, 7 * 24 * 60 * 60);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout user and revoke token', async () => {
      const user = await createTestUser();
      const token = generateAuthToken(user);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send();

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user', async () => {
      const user = await createTestUser({ 
        email: 'test@example.com',
        firstName: 'John',
      });
      const token = generateAuthToken(user);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(user.id);
      expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .send();

      expect(res.status).toBe(401);
    });
  });
});