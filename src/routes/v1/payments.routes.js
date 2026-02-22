// src/routes/v1/payments.routes.js
import { Router } from 'express';
import depositService from '../../services/payments/depositService.js';
import withdrawService from '../../services/payments/withdrawService.js';
import transactionService from '../../services/payments/transactionService.js';
import paymeService from '../../services/payments/providers/paymeService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body, query, param } from 'express-validator';
import response from '../../utils/response.js';
import logger from '../../utils/logger.js';

const router = Router();

// BEP-20 manzil validatsiya regex
const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;

// ==================== WEBHOOKS (NO AUTH) ====================

/**
 * POST /api/v1/payments/payme/callback
 * Payme JSON-RPC webhook
 */
router.post('/payme/callback', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const body = req.body;

    logger.info(`Payme request: ${body?.method}`, { 
      method: body?.method,
      id: body?.id 
    });

    const result = await paymeService.processRequest(authHeader, body);
    
    return res.json(result);
  } catch (error) {
    logger.error('Payme callback error:', error);
    return res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32400,
        message: 'Internal error',
        data: null,
      },
    });
  }
});

/**
 * POST /api/v1/payments/cryptopay/webhook
 * CryptoPay webhook (invoice_paid events)
 * 
 * Webhook URL: https://api.akhmads.net/api/v1/payments/cryptopay/webhook
 */
router.post('/cryptopay/webhook', async (req, res) => {
  try {
    const signature = req.headers['crypto-pay-api-signature'];
    const body = req.body;

    logger.info('CryptoPay webhook received', {
      update_type: body?.update_type,
      update_id: body?.update_id,
    });

    await depositService.processCryptoPayWebhook(signature, body);
    
    // Always return 200 OK for webhooks
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('CryptoPay webhook error:', error);
    // Still return 200 to prevent retries
    return res.status(200).json({ ok: true });
  }
});

// ==================== AUTH REQUIRED ROUTES ====================

router.use(authenticate);

// ==================== DEPOSIT ====================

/**
 * POST /api/v1/payments/deposit/initiate
 * Deposit boshlash
 * 
 * Body: 
 *   - provider: 'PAYME' | 'CRYPTO'
 *   - amount: number (USD)
 * 
 * Response: { transaction, payment: { paymentUrl, ... } }
 */
router.post(
  '/deposit/initiate',
  validate([
    body('provider')
      .isIn(['PAYME', 'CRYPTO'])
      .withMessage('Provider: PAYME yoki CRYPTO bo\'lishi kerak'),
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Miqdor 1 dan katta bo\'lishi kerak'),
  ]),
  async (req, res, next) => {
    try {
      const result = await depositService.initiateDeposit(req.userId, req.body);
      response.created(res, result, 'Deposit boshlandi');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/payments/deposit/history
 * Deposit tarixi
 */
router.get(
  '/deposit/history',
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const result = await depositService.getDepositHistory(
        req.userId,
        parseInt(limit),
        parseInt(offset)
      );

      response.paginated(res, result.transactions, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/payments/deposit/:transactionId/status
 * Check deposit status
 */
router.get(
  '/deposit/:transactionId/status',
  validate([param('transactionId').isString()]),
  async (req, res, next) => {
    try {
      const transaction = await depositService.checkDepositStatus(
        req.params.transactionId,
        req.userId
      );
      response.success(res, { transaction });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== WITHDRAW ====================

/**
 * GET /api/v1/payments/withdraw/info
 */
router.get('/withdraw/info', async (req, res, next) => {
  try {
    const info = await withdrawService.getWithdrawInfo();
    response.success(res, { info });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/payments/withdraw/request
 */
router.post(
  '/withdraw/request',
  validate([
    body('amount')
      .isFloat({ min: 10 })
      .withMessage('Minimal yechish: $10'),
    body('bep20Address')
      .notEmpty()
      .withMessage('BEP-20 manzil kiritilishi shart')
      .matches(BEP20_REGEX)
      .withMessage('To\'g\'ri BEP-20 manzil kiriting (0x bilan boshlanuvchi, 42 belgi)'),
  ]),
  async (req, res, next) => {
    try {
      const { amount, bep20Address } = req.body;

      const withdrawal = await withdrawService.requestWithdrawal(req.userId, {
        amount: parseFloat(amount),
        bep20Address,
      });

      response.created(res, { withdrawal }, 'Withdraw so\'rovi yuborildi. Admin tasdiqlashini kuting.');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/payments/withdraw/history
 */
router.get(
  '/withdraw/history',
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const result = await withdrawService.getUserWithdrawals(
        req.userId,
        parseInt(limit),
        parseInt(offset)
      );

      response.paginated(res, result.withdrawals, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== TRANSACTIONS ====================

/**
 * GET /api/v1/payments/transactions
 */
router.get(
  '/transactions',
  validate([
    query('type').optional().isString(),
    query('status').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { type, status, limit = 50, offset = 0 } = req.query;

      const result = await transactionService.getUserTransactions(req.userId, {
        type,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      response.paginated(res, result.transactions, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;