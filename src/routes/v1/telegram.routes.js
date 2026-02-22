// src/routes/v1/telegram.routes.js - NEW FILE
import { Router } from 'express';
import telegramPremiumService from '../../services/telegram/telegramPremiumService.js';
import telegramPreviewService from '../../services/telegram/telegramPreviewService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/telegram/premium/check
 * Check if current user has Telegram Premium
 */
router.get('/premium/check', async (req, res, next) => {
  try {
    const result = await telegramPremiumService.getCustomEmojiLimit(req.userId);

    response.success(res, result, 'Premium status checked');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/telegram/premium/bot/:botId
 * Check if bot owner has Telegram Premium
 */
router.get('/premium/bot/:botId', async (req, res, next) => {
  try {
    const hasPremium = await telegramPremiumService.checkBotOwnerPremium(req.params.botId);

    response.success(res, { hasPremium }, 'Bot owner Premium status checked');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/telegram/preview
 * Send ad preview to user's Telegram
 */
router.post(
  '/preview',
  validate([
    body('text').isString().isLength({ min: 1, max: 4096 }),
    body('mediaUrl').optional().isString(),
    body('buttons').optional().isArray(),
  ]),
  async (req, res, next) => {
    try {
      const { text, mediaUrl, buttons } = req.body;

      const result = await telegramPreviewService.sendAdPreview(req.userId, {
        text,
        mediaUrl,
        buttons,
      });

      response.success(res, result, 'Preview sent to your Telegram');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/telegram/preview/bot/:botId
 * Send test ad via specific bot
 */
router.post(
  '/preview/bot/:botId',
  validate([
    body('text').isString().isLength({ min: 1, max: 4096 }),
    body('mediaUrl').optional().isString(),
    body('buttons').optional().isArray(),
  ]),
  async (req, res, next) => {
    try {
      const { text, mediaUrl, buttons } = req.body;

      const result = await telegramPreviewService.sendTestAdViaBot(
        req.params.botId,
        req.userId,
        { text, mediaUrl, buttons }
      );

      response.success(res, result, 'Test ad sent via bot');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/telegram/preview/:messageId
 * Delete preview message
 */
router.delete('/preview/:messageId', async (req, res, next) => {
  try {
    await telegramPreviewService.deletePreviewMessage(req.userId, parseInt(req.params.messageId));

    response.success(res, {}, 'Preview message deleted');
  } catch (error) {
    next(error);
  }
});

export default router;