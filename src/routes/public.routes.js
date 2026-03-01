import { Router } from 'express';
import distributionService from '../services/distribution/distributionService.js';
import { authenticateBotApiKey } from '../middleware/auth.js';
import { botApiRateLimiter } from '../middleware/rateLimiter.js';
import { publicApiCors } from '../middleware/cors.js';
import { validate } from '../middleware/validate.js';
import { body } from 'express-validator';
import logger from '../utils/logger.js';
import categoryService from '../services/category/categoryService.js';

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
  body('LanguageCode')
    .optional()
    .isString()
    .isIn(['uz', 'ru', 'en'])
    .withMessage('LanguageCode must be uz, ru or en'),
  validate,  // ✅ Just reference it, don't call it
  async (req, res) => {
    try {
      const { SendToChatId, LanguageCode } = req.body;
      const botId = req.botId;

      logger.info(`SendPost request: botId=${botId}, chatId=${SendToChatId}, lang=${LanguageCode}`);

      // Deliver ad to user
      const result = await distributionService.deliverAd(
        botId,
        SendToChatId.toString(),
        SendToChatId,
        LanguageCode || null
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


/**
 * GET /api/categories
 * Public - Get all active categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await categoryService.getAll();
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
});

export default router;