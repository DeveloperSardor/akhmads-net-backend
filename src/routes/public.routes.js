import { Router } from 'express';
import distributionService from '../services/distribution/distributionService.js';
import { authenticateBotApiKey } from '../middleware/auth.js';
import { botApiRateLimiter } from '../middleware/rateLimiter.js';
import { publicApiCors } from '../middleware/cors.js';
import { validate } from '../middleware/validate.js';
import { body } from 'express-validator';
import logger from '../utils/logger.js';

const router = Router();

// Apply public API CORS
router.use(publicApiCors);

/**
 * POST /api/ad/SendPost
 * Bot API - Get and send ad to user
 * This is the main public endpoint for bots to request ads
 */
router.post(
  '/ad/SendPost',
  authenticateBotApiKey,
  botApiRateLimiter,
  body('SendToChatId')
    .isInt()
    .withMessage('SendToChatId must be an integer'),
  validate,  // ✅ Just reference it, don't call it
  async (req, res) => {
    try {
      const { SendToChatId } = req.body;
      const botId = req.botId;

      logger.info(`SendPost request: botId=${botId}, chatId=${SendToChatId}`);

      // Deliver ad to user
      const result = await distributionService.deliverAd(
        botId,
        SendToChatId.toString(),
        SendToChatId
      );

      // Return result code
      res.json({
        SendPostResult: result.code,
      });

      logger.info(`SendPost response: code=${result.code}`);
    } catch (error) {
      logger.error('SendPost error:', error);
      res.json({ SendPostResult: 6 }); // Error code
    }
  }
);

/**
 * GET /api/health
 * Public health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;