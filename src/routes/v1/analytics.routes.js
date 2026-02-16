import { Router } from 'express';
import advertiserAnalytics from '../../services/analytics/advertiserAnalytics.js';
import ownerAnalytics from '../../services/analytics/ownerAnalytics.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { param, query } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/analytics/advertiser/overview
 * Get advertiser dashboard overview
 */
router.get('/advertiser/overview', async (req, res, next) => {
  try {
    const overview = await advertiserAnalytics.getOverview(req.userId);

    response.success(res, { overview });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analytics/owner/overview
 * Get bot owner dashboard overview
 */
router.get('/owner/overview', async (req, res, next) => {
  try {
    const overview = await ownerAnalytics.getOverview(req.userId);

    response.success(res, { overview });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/analytics/owner/bot/:botId
 * Get bot detailed statistics
 */
router.get(
  '/owner/bot/:botId',
  validate([
    param('botId').isString(),
    query('period').optional().isIn(['7d', '30d', '90d']),
  ]),
  async (req, res, next) => {
    try {
      const { period = '7d' } = req.query;

      const stats = await ownerAnalytics.getBotStats(req.params.botId, req.userId, period);

      if (!stats) {
        return response.notFound(res, 'Bot not found');
      }

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  }
);

export default router;