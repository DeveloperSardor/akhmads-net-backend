import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, generateAuthToken, prisma } from '../helpers.js';

describe('Payment Integration Tests', () => {
  let user, userToken;

  beforeAll(async () => {
    user = await createTestUser({ balance: 500 });
    userToken = generateAuthToken(user);

    // Create platform settings
    await prisma.platformSettings.upsert({
      where: { key: 'min_deposit_usd' },
      create: {
        key: 'min_deposit_usd',
        value: '5',
        description: 'Minimum deposit',
        valueType: 'number',
        category: 'payment',
      },
      update: { value: '5' },
    });

    await prisma.platformSettings.upsert({
      where: { key: 'min_withdraw_usd' },
      create: {
        key: 'min_withdraw_usd',
        value: '10',
        description: 'Minimum withdrawal',
        valueType: 'number',
        category: 'payment',
      },
      update: { value: '10' },
    });

    await prisma.platformSettings.upsert({
      where: { key: 'withdrawal_fee_percentage' },
      create: {
        key: 'withdrawal_fee_percentage',
        value: '2',
        description: 'Withdrawal fee',
        valueType: 'number',
        category: 'payment',
      },
      update: { value: '2' },
    });
  });

  describe('POST /api/v1/payments/deposit/initiate', () => {
    it('should initiate deposit', async () => {
      const res = await request(app)
        .post('/api/v1/payments/deposit/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          provider: 'CLICK',
          amount: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.transaction).toHaveProperty('id');
      expect(res.body.data.transaction.type).toBe('DEPOSIT');
      expect(res.body.data.transaction.status).toBe('PENDING');
      expect(parseFloat(res.body.data.transaction.amount)).toBe(50);
    });

    it('should reject deposit below minimum', async () => {
      const res = await request(app)
        .post('/api/v1/payments/deposit/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          provider: 'CLICK',
          amount: 2, // Below minimum
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Minimum deposit');
    });

    it('should validate provider', async () => {
      const res = await request(app)
        .post('/api/v1/payments/deposit/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          provider: 'INVALID',
          amount: 50,
        });

      expect(res.status).toBe(422);
    });

    it('should support crypto deposits', async () => {
      const res = await request(app)
        .post('/api/v1/payments/deposit/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          provider: 'CRYPTO',
          amount: 100,
          coin: 'USDT',
          network: 'TRC20',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.transaction.coin).toBe('USDT');
      expect(res.body.data.transaction.network).toBe('TRC20');
    });
  });

  describe('GET /api/v1/payments/deposit/history', () => {
    it('should return deposit history', async () => {
      // Create some deposits
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'DEPOSIT',
          provider: 'CLICK',
          amount: 100,
          status: 'SUCCESS',
        },
      });

      const res = await request(app)
        .get('/api/v1/payments/deposit/history')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/v1/payments/deposit/history')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ limit: 5, offset: 0 })
        .send();

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  describe('POST /api/v1/payments/withdraw/request', () => {
    it('should request withdrawal', async () => {
      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'CARD',
          provider: 'CLICK',
          amount: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.withdrawal).toHaveProperty('id');
      expect(res.body.data.withdrawal.status).toBe('REQUESTED');
      expect(parseFloat(res.body.data.withdrawal.amount)).toBe(100);
      expect(res.body.data.withdrawal.fee).toBeDefined();
    });

    it('should reject withdrawal below minimum', async () => {
      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'CARD',
          provider: 'CLICK',
          amount: 5, // Below minimum
        });

      expect(res.status).toBe(422);
    });

    it('should reject if insufficient balance', async () => {
      const poorUser = await createTestUser({ balance: 5 });
      const token = generateAuthToken(poorUser);

      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          method: 'CARD',
          provider: 'CLICK',
          amount: 100,
        });

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient');
    });

    it('should calculate withdrawal fee correctly', async () => {
      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'CARD',
          provider: 'CLICK',
          amount: 100,
        });

      expect(res.status).toBe(201);
      const fee = parseFloat(res.body.data.withdrawal.fee);
      expect(fee).toBe(2); // 2% of 100
      const netAmount = parseFloat(res.body.data.withdrawal.netAmount);
      expect(netAmount).toBe(98);
    });

    it('should support crypto withdrawals', async () => {
      const res = await request(app)
        .post('/api/v1/payments/withdraw/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'CRYPTO',
          provider: 'CRYPTO',
          amount: 50,
          coin: 'USDT',
          network: 'TRC20',
          address: 'TXn4JK8rZ5qQ...',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.withdrawal.coin).toBe('USDT');
      expect(res.body.data.withdrawal.address).toBe('TXn4JK8rZ5qQ...');
    });
  });

  describe('GET /api/v1/payments/withdraw/history', () => {
    it('should return withdrawal history', async () => {
      await prisma.withdrawRequest.create({
        data: {
          userId: user.id,
          method: 'CARD',
          provider: 'CLICK',
          amount: 50,
          fee: 1,
          netAmount: 49,
          status: 'REQUESTED',
        },
      });

      const res = await request(app)
        .get('/api/v1/payments/withdraw/history')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/payments/transactions', () => {
    it('should return all transactions', async () => {
      const res = await request(app)
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should filter by type', async () => {
      const res = await request(app)
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ type: 'DEPOSIT' })
        .send();

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data.every(tx => tx.type === 'DEPOSIT')).toBe(true);
      }
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/payments/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ status: 'SUCCESS' })
        .send();

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data.every(tx => tx.status === 'SUCCESS')).toBe(true);
      }
    });
  });
});