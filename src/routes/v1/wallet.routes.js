// src/routes/wallet.routes.js
import { Router } from 'express';
import walletService from '../../services/wallet/walletService.js';
import ledgerService from '../../services/wallet/ledgerService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { query } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/wallet
 * Get wallet
 */
router.get('/', async (req, res, next) => {
  try {
    const wallet = await walletService.getWallet(req.userId);

    response.success(res, { wallet });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/wallet/transactions
 * Get transaction history
 */
router.get(
  '/transactions',
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const result = await walletService.getTransactionHistory(
        req.userId,
        parseInt(limit),
        parseInt(offset)
      );

      response.paginated(res, result.entries, {
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
 * GET /api/v1/wallet/ledger
 * Get ledger entries
 */
router.get(
  '/ledger',
  validate([
    query('type').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { type, limit = 50, offset = 0 } = req.query;

      const result = await ledgerService.getUserLedger(req.userId, {
        type,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      response.paginated(res, result.entries, {
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
 * GET /api/v1/wallet/balance-check
 * Verify balance integrity
 */
router.get('/balance-check', async (req, res, next) => {
  try {
    const verification = await ledgerService.verifyBalance(req.userId);

    response.success(res, { verification });
  } catch (error) {
    next(error);
  }
});

export default router;