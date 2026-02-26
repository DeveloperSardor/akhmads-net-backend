import { Router } from 'express';
import botService from '../../services/bot/botService.js';
import botStatsService from '../../services/bot/botStatsService.js';
import botIntegrationService from '../../services/bot/botIntegrationService.js';
import { authenticate } from '../../middleware/auth.js';
import { requireBotOwner } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { body, param, query } from 'express-validator';
import response from '../../utils/response.js';
import prisma from '../../config/database.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/bots
 * Register new bot
 * ✅ Returns bot + apiKey
 */
router.post(
  '/',
  requireBotOwner,
  validate([
    body('token').isString().notEmpty(),
    body('shortDescription').optional().isString().isLength({ max: 500 }),
    body('category').isString().notEmpty(),
    body('language').optional().isIn(['uz', 'ru', 'en']),
    body('monetized').optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.registerBot(req.userId, req.body);
      
      // ✅ Return both bot and apiKey
      response.created(res, { bot, apiKey: bot.apiKey }, 'Bot registered successfully');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/bots/verify-token
 * Verify bot token and preview its basic info and avatar
 */
router.post(
  '/verify-token',
  validate([
    body('token').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const info = await botService.verifyTokenWithAvatar(req.body.token);
      response.success(res, info, 'Bot verified successfully');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/bots
 * Get user's bots WITH stats
 * ✅ Enhanced with impressions, CTR, spent data
 */
router.get('/', requireBotOwner, async (req, res, next) => {
  try {
    const bots = await botService.getUserBots(req.userId);
    
    // ✅ Enrich each bot with stats
    const botsWithStats = await Promise.all(
      bots.map(async (bot) => {
        // Get impressions count
        const impressionsCount = await prisma.impression.count({
          where: { botId: bot.id },
        });

        // Get clicks count
        const clicksCount = await prisma.clickEvent.count({
          where: { botId: bot.id, clicked: true },
        });

        // Calculate CTR
        const ctr = impressionsCount > 0 
          ? ((clicksCount / impressionsCount) * 100).toFixed(2)
          : '0.00';

        // Get total spent (ads delivered through this bot)
        const totalSpent = await prisma.impression.aggregate({
          where: { botId: bot.id },
          _sum: { revenue: true },
        });

        return {
          ...bot,
          // ✅ Add calculated stats
          impressionsServed: impressionsCount,
          clicks: clicksCount,
          ctr: parseFloat(ctr),
          spent: parseFloat(totalSpent._sum.revenue || 0),
        };
      })
    );

    response.success(res, { bots: botsWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/bots/:id
 * Get bot details
 */
router.get(
  '/:id',
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      // Check ownership
      if (bot.ownerId !== req.userId && !['ADMIN', 'SUPER_ADMIN'].includes(req.userRole)) {
        return response.forbidden(res, 'Access denied');
      }

      response.success(res, { bot });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/bots/:id
 * Update bot settings
 */
router.put(
  '/:id',
  validate([
    param('id').isString(),
    body('shortDescription').optional().isString().isLength({ max: 500 }),
    body('category').optional().isString(),
    body('language').optional().isIn(['uz', 'ru', 'en']),
    body('postFilter').optional().isIn(['all', 'not_mine', 'only_mine']),
    body('allowedCategories').optional().isArray(),
    body('blockedCategories').optional().isArray(),
    body('frequencyMinutes').optional().isInt({ min: 1, max: 1440 }),
    body('monetized').optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.updateBot(req.params.id, req.userId, req.body);

      response.success(res, { bot }, 'Bot updated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/bots/:id/pause
 * Pause/resume bot
 * ✅ POST (not PATCH)
 */
router.post(
  '/:id/pause',
  validate([
    param('id').isString(),
    body('isPaused').isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.togglePause(req.params.id, req.userId, req.body.isPaused);

      response.success(res, { bot }, `Bot ${req.body.isPaused ? 'paused' : 'resumed'}`);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/bots/:id/regenerate-api-key
 * Regenerate API key
 */
router.post(
  '/:id/regenerate-api-key',
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const result = await botService.regenerateApiKey(req.params.id, req.userId);

      response.success(res, { apiKey: result.newApiKey }, 'API key regenerated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/bots/:id/token
 * Update bot token
 */
router.put(
  '/:id/token',
  validate([
    param('id').isString(),
    body('newToken').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.updateBotToken(req.params.id, req.userId, req.body.newToken);

      response.success(res, { bot }, 'Bot token updated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/bots/:id
 * Delete bot
 */
router.delete(
  '/:id',
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      await botService.deleteBot(req.params.id, req.userId);

      response.noContent(res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/bots/:id/stats
 * Get bot statistics
 */
router.get(
  '/:id/stats',
  validate([
    param('id').isString(),
    query('period').optional().isIn(['7d', '30d', '90d']),
  ]),
  async (req, res, next) => {
    try {
      const { period = '7d' } = req.query;

      const stats = await botService.getBotStats(req.params.id, period);

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/bots/:id/integration
 * Get integration code
 */
router.get(
  '/:id/integration',
  validate([
    param('id').isString(),
    query('language').optional().isIn(['python', 'javascript', 'typescript', 'php', 'csharp']),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      if (bot.ownerId !== req.userId) {
        return response.forbidden(res, 'Access denied');
      }

      const { language = 'python' } = req.query;

      const code = botIntegrationService.getIntegrationCode(bot.apiKey, language);
      const docs = botIntegrationService.getDocumentation();

      response.success(res, { code, docs });
    } catch (error) {
      next(error);
    }
  }
);

export default router;