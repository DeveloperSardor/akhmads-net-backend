import { Router } from 'express';
import depositService from '../../services/payments/depositService.js';
import withdrawService from '../../services/payments/withdrawService.js';
import transactionService from '../../services/payments/transactionService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body, query } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

// Barcha routelar auth talab qiladi
router.use(authenticate);

// BEP-20 manzil validatsiya regex
const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;

// ==================== DEPOSIT ====================

/**
 * POST /api/v1/payments/deposit/initiate
 * Deposit boshlash
 * Click, Payme, Crypto (TRC-20 USDT) qabul qilinadi
 */
router.post(
  '/deposit/initiate',
  validate([
    body('provider')
      .isIn(['CLICK', 'PAYME', 'CRYPTO'])
      .withMessage('Provider: CLICK, PAYME yoki CRYPTO bo\'lishi kerak'),
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Miqdor 1 dan katta bo\'lishi kerak'),
    body('coin')
      .optional()
      .isString(),
    body('network')
      .optional()
      .isString(),
  ]),
  async (req, res, next) => {
    try {
      const transaction = await depositService.initiateDeposit(req.userId, req.body);
      response.created(res, { transaction }, 'Deposit boshlandi');
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

// ==================== WITHDRAW ====================

/**
 * GET /api/v1/payments/withdraw/info
 * Withdraw shartlari (fee, min, tarmoq)
 * Frontend bu ma'lumotni formada ko'rsatadi
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
 * Withdraw so'rovi
 *
 * FAQAT BEP-20 USDT qabul qilinadi!
 * Body: { amount: number, bep20Address: string }
 *
 * Misol:
 * {
 *   "amount": 50,
 *   "bep20Address": "0xAbCd1234..."
 * }
 *
 * Natija:
 *   - Fee: $3 yechiladi
 *   - User oladi: amount - $3
 *   - Admin tasdiqlaydi
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
 * Withdraw tarixi
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
 * Barcha tranzaksiyalar
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