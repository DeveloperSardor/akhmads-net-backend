import { Router } from 'express';
import clickService from '../../services/payments/providers/clickService.js';
import paymeService from '../../services/payments/providers/paymeService.js';
import nowpaymentsService from '../../services/payments/providers/nowpaymentService.js';
import { webhookRateLimiter } from '../../middleware/rateLimiter.js';
import { webhookCors } from '../../middleware/cors.js';
import logger from '../../utils/logger.js';

const router = Router();

// Webhook uchun alohida CORS
router.use(webhookCors);

// ==================== CLICK ====================

/**
 * POST /api/v1/webhooks/click/prepare
 * Click to'lov tizimi — Prepare bosqich
 * Click serveridan keladi, to'lov tayyormi tekshiradi
 */
router.post('/click/prepare', webhookRateLimiter, async (req, res) => {
  try {
    logger.info('Click prepare webhook:', req.body);
    const result = await clickService.processPrepare(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Click prepare xatosi:', error);
    res.json({ error: -9, error_note: 'System error' });
  }
});

/**
 * POST /api/v1/webhooks/click/complete
 * Click to'lov tizimi — Complete bosqich
 * To'lov yakunlanganda keladi, pul hisobga o'tkaziladi
 */
router.post('/click/complete', webhookRateLimiter, async (req, res) => {
  try {
    logger.info('Click complete webhook:', req.body);
    const result = await clickService.processComplete(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Click complete xatosi:', error);
    res.json({ error: -9, error_note: 'System error' });
  }
});

// ==================== PAYME ====================

/**
 * POST /api/v1/webhooks/payme
 * Payme JSON-RPC endpoint
 * Barcha Payme metodlari shu yerdan o'tadi:
 *   CheckPerformTransaction
 *   CreateTransaction
 *   PerformTransaction
 *   CancelTransaction
 *   CheckTransaction
 */
router.post('/payme', webhookRateLimiter, async (req, res) => {
  try {
    logger.info('Payme webhook:', { method: req.body?.method, id: req.body?.id });
    const authHeader = req.get('Authorization');
    const result = await paymeService.processRequest(authHeader, req.body);
    res.json(result);
  } catch (error) {
    logger.error('Payme webhook xatosi:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: { code: -32400, message: 'Internal error', data: null },
    });
  }
});

// ==================== NOWPAYMENTS (CRYPTO) ====================

/**
 * POST /api/v1/webhooks/nowpayments
 * NOWPayments IPN (Instant Payment Notification)
 * Crypto to'lov holati o'zgarganda keladi
 * Headerda: x-nowpayments-sig (HMAC-SHA512 imzosi)
 */
router.post('/nowpayments', webhookRateLimiter, async (req, res) => {
  try {
    logger.info('NOWPayments IPN:', {
      paymentId: req.body?.payment_id,
      status: req.body?.payment_status,
      orderId: req.body?.order_id,
    });

    const signature = req.get('x-nowpayments-sig');

    if (!signature) {
      logger.warn('NOWPayments: imzo yo\'q');
      return res.status(401).json({ success: false, error: 'Missing signature' });
    }

    const result = await nowpaymentsService.processIpn(signature, req.body);

    if (result.success) {
      res.json({ success: true });
    } else {
      logger.warn('NOWPayments IPN xatosi:', result.error);
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('NOWPayments webhook xatosi:', error);
    res.status(500).json({ success: false });
  }
});

export default router;