// src/routes/v1/admin.routes.js
import { Router } from 'express';
import adService from '../../services/ad/adService.js';  // ✅ NEW - Use main adService
import adModerationService from '../../services/ad/adModerationService.js';
import moderationService from '../../services/admin/moderationService.js';
import userManagementService from '../../services/admin/userManagementService.js';
import pricingService from '../../services/admin/pricingService.js';
import settingsService from '../../services/admin/settingsService.js';
import withdrawService from '../../services/payments/withdrawService.js';
import adminAnalytics from '../../services/analytics/adminAnalytics.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin, requireModerator, requireSuperAdmin } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { body, param, query } from 'express-validator';
import response from '../../utils/response.js';
import prisma from '../../config/database.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ==================== MODERATION - ADS ====================

/**
 * GET /api/v1/admin/moderation/ads/all
 * All ads with filters (for history/search)
 */
router.get(
  '/moderation/ads/all',
  requireModerator,
  validate([
    query('status').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;

      const where = {};
      if (status) where.status = status;

      const ads = await prisma.ad.findMany({
        where,
        include: {
          advertiser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          moderator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.ad.count({ where });

      response.paginated(res, ads, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/moderation/ads/pending
 * Pending review ads (PENDING_REVIEW status)
 */
router.get(
  '/moderation/ads/pending',
  requireModerator,
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      // Get ads with PENDING_REVIEW status
      const ads = await prisma.ad.findMany({
        where: { status: 'PENDING_REVIEW' },
        include: {
          advertiser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              email: true,
              telegramId: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' }, // Oldest first
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.ad.count({
        where: { status: 'PENDING_REVIEW' },
      });

      response.paginated(res, ads, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/moderation/ads/:id
 * Get ad details for review
 */
router.get(
  '/moderation/ads/:id',
  requireModerator,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.getAdById(req.params.id);
      response.success(res, { ad });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/moderation/ads/:id/approve
 * Approve ad - confirms wallet reserve and activates ad
 */
router.post(
  '/moderation/ads/:id/approve',
  requireModerator,
  validate([
    param('id').isString(),
    body('scheduledStart').optional().isISO8601(),
  ]),
  async (req, res, next) => {
    try {
      const scheduledStart = req.body.scheduledStart
        ? new Date(req.body.scheduledStart)
        : null;

      const ad = await adService.approveAd(
        req.params.id,
        req.userId,
        scheduledStart
      );

      response.success(res, { ad }, 'Ad approved successfully');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/moderation/ads/:id/reject
 * Reject ad - refunds wallet reserve
 */
router.post(
  '/moderation/ads/:id/reject',
  requireModerator,
  validate([
    param('id').isString(),
    body('reason').isString().notEmpty().withMessage('Rejection reason is required'),
  ]),
  async (req, res, next) => {
    try {
      const ad = await adService.rejectAd(
        req.params.id,
        req.userId,
        req.body.reason
      );

      response.success(res, { ad }, 'Ad rejected successfully');
    } catch (error) {
      next(error);
    }
  }
);

// ==================== LEGACY MODERATION ROUTES (Keep for compatibility) ====================

router.get('/moderation/queue', requireModerator, async (req, res, next) => {
  try {
    const queue = await moderationService.getModerationQueue();
    response.success(res, { queue });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/moderation/ads',
  requireModerator,
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const result = await adModerationService.getPendingAds(parseInt(limit), parseInt(offset));
      response.paginated(res, result.ads, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/moderation/ads/:id/request-edit',
  requireModerator,
  validate([
    param('id').isString(),
    body('feedback').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const ad = await adModerationService.requestEdit(req.params.id, req.userId, req.body.feedback);
      response.success(res, { ad }, 'Edit requested');
    } catch (error) {
      next(error);
    }
  }
);

// ==================== MODERATION - BOTS ====================

/**
 * GET /api/v1/admin/moderation/bots/all
 * All bots with status filtering
 */
router.get(
  '/moderation/bots/all',
  requireModerator,
  validate([
    query('status').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;
      const result = await moderationService.getAllBots(
        { status },
        parseInt(limit),
        parseInt(offset)
      );

      response.paginated(res, result.bots, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/moderation/bots',
  requireModerator,
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const result = await moderationService.getPendingBots(parseInt(limit), parseInt(offset));
      response.paginated(res, result.bots, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/moderation/bots/:id/approve',
  requireModerator,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const bot = await moderationService.approveBot(req.params.id, req.userId);
      response.success(res, { bot }, 'Bot approved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/moderation/bots/:id/reject',
  requireModerator,
  validate([
    param('id').isString(),
    body('reason').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await moderationService.rejectBot(req.params.id, req.userId, req.body.reason);
      response.success(res, { bot }, 'Bot rejected');
    } catch (error) {
      next(error);
    }
  }
);

// ==================== WITHDRAWALS ====================

/**
 * GET /api/v1/admin/withdrawals/pending
 * Kutayotgan withdraw so'rovlari
 */
router.get(
  '/withdrawals/pending',
  requireAdmin,
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const result = await withdrawService.getPendingWithdrawals(
        parseInt(limit),
        parseInt(offset)
      );

      const enriched = result.withdrawals.map(w => ({
        id: w.id,
        status: w.status,
        createdAt: w.createdAt,

        user: {
          id: w.user.id,
          name: `${w.user.firstName}${w.user.lastName ? ' ' + w.user.lastName : ''}`,
          username: w.user.username ? `@${w.user.username}` : null,
          telegramId: w.user.telegramId,
        },

        payment: {
          network: 'BEP-20 (BSC)',
          coin: 'USDT',
          address: w.address,
          amountRequested: parseFloat(w.amount),
          fee: parseFloat(w.fee),
          amountToSend: parseFloat(w.netAmount),
        },
      }));

      response.paginated(res, enriched, {
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
 * GET /api/v1/admin/withdrawals/all
 * Barcha withdraw tarixi
 */
router.get(
  '/withdrawals/all',
  requireAdmin,
  validate([
    query('status').optional().isIn(['REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'CONFIRMED', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      const where = {};
      if (status) where.status = status;

      const withdrawals = await prisma.withdrawRequest.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              telegramId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      const total = await prisma.withdrawRequest.count({ where });

      response.paginated(res, withdrawals, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/withdrawals/:id/approve
 */
router.post(
  '/withdrawals/:id/approve',
  requireAdmin,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const withdrawal = await withdrawService.approveWithdrawal(req.params.id, req.userId);
      response.success(res, { withdrawal }, 'Withdraw approved');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/withdrawals/:id/reject
 */
router.post(
  '/withdrawals/:id/reject',
  requireAdmin,
  validate([
    param('id').isString(),
    body('reason').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const withdrawal = await withdrawService.rejectWithdrawal(
        req.params.id,
        req.userId,
        req.body.reason
      );
      response.success(res, { withdrawal }, 'Withdraw rejected');
    } catch (error) {
      next(error);
    }
  }
);

// ==================== USER MANAGEMENT ====================

router.get(
  '/users',
  requireAdmin,
  validate([
    query('role').optional().isString(),
    query('isActive').optional().isBoolean(),
    query('isBanned').optional().isBoolean(),
    query('search').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { role, isActive, isBanned, search, limit = 50, offset = 0 } = req.query;
      const result = await userManagementService.getUsers({
        role,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        isBanned: isBanned !== undefined ? isBanned === 'true' : undefined,
        search,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
      response.paginated(res, result.users, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/users/:id',
  requireAdmin,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const user = await userManagementService.getUserDetails(req.params.id);
      response.success(res, { user });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/users/:id/role',
  requireSuperAdmin,
  validate([
    param('id').isString(),
    body('roles').optional().isArray(),
    body('roles.*').optional().isIn(['ADVERTISER', 'BOT_OWNER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
    body('role').optional().isIn(['ADVERTISER', 'BOT_OWNER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
  ]),
  async (req, res, next) => {
    try {
      const rolesInput = req.body.roles || req.body.role;
      if (!rolesInput || (Array.isArray(rolesInput) && rolesInput.length === 0)) {
        return res.status(400).json({ success: false, error: 'Role or roles array is required' });
      }

      const user = await userManagementService.updateUserRole(req.params.id, rolesInput, req.userId);
      response.success(res, { user }, 'User role updated');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/users/:id/ban',
  requireAdmin,
  validate([
    param('id').isString(),
    body('reason').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const user = await userManagementService.banUser(req.params.id, req.body.reason, req.userId);
      response.success(res, { user }, 'User banned');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/users/:id/unban',
  requireAdmin,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      const user = await userManagementService.unbanUser(req.params.id, req.userId);
      response.success(res, { user }, 'User unbanned');
    } catch (error) {
      next(error);
    }
  }
);

// PRICING MANAGEMENT SECTION - Add to existing admin.routes.js

// ==================== PRICING MANAGEMENT ====================

/**
 * GET /api/v1/admin/pricing/tiers
 * Get all pricing tiers with CPM calculation
 */
router.get('/pricing/tiers', requireAdmin, async (req, res, next) => {
  try {
    const tiers = await pricingService.getAllTiers();
    response.success(res, { tiers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/pricing/tiers/active
 * Get active pricing tiers (public endpoint - no auth needed)
 */
router.get('/pricing/tiers/active', async (req, res, next) => {
  try {
    const tiers = await pricingService.getActiveTiers();
    response.success(res, { tiers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/pricing/tiers
 * Create new pricing tier
 * 
 * Body: { name, impressions, priceUsd, isActive?, sortOrder? }
 */
router.post(
  '/pricing/tiers',
  requireAdmin,
  validate([
    body('name').isString().notEmpty().withMessage('Tier name is required'),
    body('impressions').isInt({ min: 100 }).withMessage('Minimum 100 impressions'),
    body('priceUsd').isFloat({ min: 0.01 }).withMessage('Price must be greater than 0'),
    body('isActive').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const tier = await pricingService.createTier(req.body);
      response.created(res, { tier }, 'Pricing tier created');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/admin/pricing/tiers/:id
 * Update pricing tier
 */
router.put(
  '/pricing/tiers/:id',
  requireAdmin,
  validate([
    param('id').isString(),
    body('name').optional().isString(),
    body('priceUsd').optional().isFloat({ min: 0.01 }),
    body('isActive').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const tier = await pricingService.updateTier(req.params.id, req.body);
      response.success(res, { tier }, 'Pricing tier updated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/admin/pricing/tiers/:id
 * Delete pricing tier (only if not in use)
 */
router.delete(
  '/pricing/tiers/:id',
  requireAdmin,
  validate([param('id').isString()]),
  async (req, res, next) => {
    try {
      await pricingService.deleteTier(req.params.id);
      response.success(res, null, 'Pricing tier deleted');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/pricing/tiers/bulk
 * Bulk create pricing tiers
 * 
 * Body: { tiers: [{ name, impressions, priceUsd }] }
 */
router.post(
  '/pricing/tiers/bulk',
  requireSuperAdmin,
  validate([
    body('tiers').isArray({ min: 1 }),
    body('tiers.*.name').isString().notEmpty(),
    body('tiers.*.impressions').isInt({ min: 100 }),
    body('tiers.*.priceUsd').isFloat({ min: 0.01 }),
  ]),
  async (req, res, next) => {
    try {
      const tiers = await pricingService.bulkCreateTiers(req.body.tiers);
      response.created(res, { tiers, count: tiers.length }, 'Pricing tiers created');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/pricing/platform-fee
 * Get current platform fee percentage
 */
router.get('/pricing/platform-fee', requireAdmin, async (req, res, next) => {
  try {
    const percentage = await pricingService.getPlatformFee();
    response.success(res, {
      platformFeePercentage: percentage,
      description: 'Platform fee charged on all ad revenue'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/admin/pricing/platform-fee
 * Update platform fee percentage
 * 
 * Body: { percentage: 15 }
 */
router.put(
  '/pricing/platform-fee',
  requireSuperAdmin,
  validate([
    body('percentage')
      .isFloat({ min: 0, max: 50 })
      .withMessage('Platform fee must be between 0% and 50%'),
  ]),
  async (req, res, next) => {
    try {
      const setting = await pricingService.updatePlatformFee(
        parseFloat(req.body.percentage),
        req.userId
      );
      response.success(res, {
        platformFeePercentage: parseFloat(setting.value),
        message: `Platform fee updated to ${setting.value}%`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/pricing/calculate
 * Calculate price preview (for testing)
 * 
 * Body: { impressions, category?, targeting?, cpmBid? }
 */
router.post(
  '/pricing/calculate',
  requireAdmin,
  validate([
    body('impressions').isInt({ min: 100 }),
    body('category').optional().isString(),
    body('targeting').optional().isObject(),
    body('cpmBid').optional().isFloat({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const preview = await pricingService.calculatePricePreview(req.body);
      response.success(res, preview);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/pricing/stats
 * Get pricing statistics (revenue, avg cost, etc)
 */
router.get('/pricing/stats', requireAdmin, async (req, res, next) => {
  try {
    const stats = await pricingService.getPricingStats();
    response.success(res, { stats });
  } catch (error) {
    next(error);
  }
});

// ==================== PUBLIC PRICING ENDPOINTS (NO AUTH) ====================

/**
 * POST /api/v1/pricing/preview
 * Calculate ad price preview (public - for ad creation form)
 * 
 * Body: { impressions, category?, targeting?, cpmBid? }
 */
router.post(
  '/pricing/preview',
  validate([
    body('impressions').isInt({ min: 100 }),
    body('category').optional().isString(),
    body('targeting').optional().isObject(),
    body('cpmBid').optional().isFloat({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const preview = await pricingService.calculatePricePreview(req.body);
      response.success(res, preview);
    } catch (error) {
      next(error);
    }
  }
);


export default router;