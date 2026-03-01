// src/routes/v1/ad.routes.js
import { Router } from "express";
import adService from "../../services/ad/adService.js";
import adCreationService from "../../services/ad/adCreationService.js";
import adPricingService from "../../services/ad/adPricingService.js";
import adTargetingService from "../../services/ad/adTargetingService.js";
import adTrackingService from "../../services/ad/adTrackingService.js";
import advertiserAnalytics from "../../services/analytics/advertiserAnalytics.js";
import exportService from "../../services/analytics/exportService.js";
import distributionService from "../../services/distribution/distributionService.js";
import adSchedulingService from "../../services/ad/adSchedulingService.js";
import dailyStatsService from "../../services/analytics/dailyStatsService.js";
import { authenticate, authenticateBotApiKey } from "../../middleware/auth.js";
import { requireAdvertiser } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { body, param, query } from "express-validator";
import { botApiRateLimiter } from "../../middleware/rateLimiter.js";
import response from "../../utils/response.js";
import prisma from "../../config/database.js";
import multer from "multer";
import adMediaService from "../../services/ad/adMediaService.js";
import adminNotificationService from "../../services/telegram/adminNotificationService.js";

const router = Router();

// ✅ ADD MULTER CONFIG (before routes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/**
 * POST /api/v1/ad/SendPost
 * Bot API - Get ad for user (PUBLIC)
 */
router.post(
  "/SendPost",
  authenticateBotApiKey,
  botApiRateLimiter,
  validate([body("SendToChatId").isInt()]),
  async (req, res, next) => {
    try {
      const { SendToChatId } = req.body;
      const botId = req.botId;

      const result = await distributionService.deliverAd(
        botId,
        SendToChatId.toString(),
        SendToChatId,
      );

      res.json({
        SendPostResult: result.code,
      });
    } catch (error) {
      res.json({ SendPostResult: 6 }); // Error code
    }
  },
);

// All other routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/ads/pricing
 * Get pricing tiers
 */
router.get("/pricing", async (req, res, next) => {
  try {
    const tiers = await adPricingService.getPricingTiers();

    response.success(res, { tiers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/ads/pricing/estimate
 * Get pricing estimate
 */
router.post(
  "/pricing/estimate",
  validate([
    body("impressions").isInt({ min: 100 }),
    body("category").optional().isString(),
    body("targeting").optional().isObject(),
    body("cpmBid").optional().isFloat({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const estimate = await adPricingService.getPricingEstimate(req.body);

      response.success(res, { estimate });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/targeting/options
 * Get targeting options
 */
router.get("/targeting/options", async (req, res, next) => {
  try {
    const options = await adTargetingService.getTargetingOptions();

    response.success(res, { options });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/ads/public/search
 * Search active ads for blocking UI
 */
router.get(
  "/public/search",
  validate([query("q").isString().notEmpty()]),
  async (req, res, next) => {
    try {
      const ads = await adService.searchActiveAds(req.query.q);
      response.success(res, { ads });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ads
 * Create ad
 */
router.post(
  "/",
  requireAdvertiser,
  validate([
    body("contentType").isIn(["TEXT", "HTML", "MARKDOWN", "MEDIA", "POLL"]),
    body("title").optional({ checkFalsy: true }).isString().isLength({ min: 3, max: 100 }),
    body("text").isString().isLength({ min: 10, max: 4096 }),
    body("htmlContent").optional().isString(),
    body("markdownContent").optional().isString(),
    body("mediaUrl").optional().isString(),
    body("mediaType").optional().isString(),
    body("buttons").optional().isArray(),
    body("poll").optional().isObject(),
    body("targetImpressions").isInt({ min: 100 }),
    body("cpmBid").optional().isFloat({ min: 0 }),
    body("targeting").optional().isObject(),
    body("specificBotIds").optional().isArray(),
    body("excludedBotIds").optional().isArray(),
    body("promoCode").optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const ad = await adCreationService.createAdWithValidation(
        req.userId,
        req.body,
      );

      response.created(res, { ad }, "Ad created");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/preview
 * Generate ad preview
 */
router.post(
  "/preview",
  validate([
    body("contentType").isIn(["TEXT", "HTML", "MARKDOWN", "MEDIA", "POLL"]),
    body("text").isString(),
    body("buttons").optional().isArray(),
    body("poll").optional().isObject(),
  ]),
  async (req, res, next) => {
    try {
      const preview = await adCreationService.generatePreview(req.body);

      response.success(res, { preview });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads
 * Get user's ads
 */
router.get(
  "/",
  validate([
    query("status").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;

      const result = await adService.getUserAds(req.userId, {
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      // ✅ ENRICH WITH isSaved
      const adsWithSaved = await Promise.all(
        result.ads.map(async (ad) => {
          const savedAd = await prisma.savedAd.findUnique({
            where: {
              userId_adId: {
                userId: req.userId,
                adId: ad.id,
              },
            },
          });

          return {
            ...ad,
            isSaved: !!savedAd, // ✅ ADD THIS
          };
        }),
      );

      response.paginated(res, adsWithSaved, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/:id
 * Get ad details
 */
router.get(
  "/:id",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.getAdById(req.params.id);

      // Check ownership
      if (
        ad.advertiserId !== req.userId &&
        !["ADMIN", "SUPER_ADMIN", "MODERATOR"].includes(req.userRole)
      ) {
        return response.forbidden(res, "Access denied");
      }

      response.success(res, { ad });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/ads/:id
 * Update ad
 */
router.put(
  "/:id",
  validate([
    param("id").isString(),
    body("title").optional({ checkFalsy: true }).isString().isLength({ min: 3, max: 100 }),
    body("text").optional().isString().isLength({ min: 10, max: 4096 }),
    body("buttons").optional().isArray(),
    body("targeting").optional().isObject(),
    body("specificBotIds").optional().isArray(),
    body("excludedBotIds").optional().isArray(),
  ]),
  async (req, res, next) => {
    try {
      const ad = await adService.updateAd(req.params.id, req.userId, req.body);

      response.success(res, { ad }, "Ad updated");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/submit
 * Submit ad for moderation
 */
router.post(
  "/:id/submit",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.submitAd(req.params.id, req.userId);

      // ✅ Adminlarga Telegram xabari + inline tugmalar
      const advertiser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { username: true, firstName: true, telegramId: true },
      });
      adminNotificationService.notifyNewAd(ad, advertiser).catch(() => {});

      response.success(res, { ad }, "Ad submitted for review");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/pause
 * Pause ad
 */
router.post(
  "/:id/pause",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.pauseAd(req.params.id, req.userId);

      response.success(res, { ad }, "Ad paused");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/resume
 * Resume ad
 */
router.post(
  "/:id/resume",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.resumeAd(req.params.id, req.userId);

      response.success(res, { ad }, "Ad resumed");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/duplicate
 * Duplicate ad
 */
router.post(
  "/:id/duplicate",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.duplicateAd(req.params.id, req.userId);

      response.created(res, { ad }, "Ad duplicated");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/ads/:id
 * Delete ad
 */
router.delete(
  "/:id",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      await adService.deleteAd(req.params.id, req.userId);

      response.noContent(res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/:id/performance
 * Get ad performance
 */
router.get(
  "/:id/performance",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const performance = await advertiserAnalytics.getAdPerformance(
        req.params.id,
        req.userId,
      );

      response.success(res, { performance });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/:id/export
 * Export impressions to Excel
 */
router.get(
  "/:id/export",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const buffer = await advertiserAnalytics.exportImpressions(
        req.params.id,
        req.userId,
      );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=impressions-${req.params.id}.xlsx`,
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/:id/clicks
 * Get ad clicks
 */
router.get(
  "/:id/clicks",
  validate([
    param("id").isString(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const result = await adTrackingService.getAdClicks(
        req.params.id,
        parseInt(limit),
        parseInt(offset),
      );

      response.paginated(res, result.clicks, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/schedule
 * Set ad schedule
 */
router.post(
  "/:id/schedule",
  validate([
    param("id").isString(),
    body("startDate").isISO8601(),
    body("endDate").isISO8601(),
    body("timezone").optional().isString(),
    body("activeDays").optional().isArray(),
    body("activeHours").optional().isArray(),
  ]),
  async (req, res, next) => {
    try {
      const ad = await adSchedulingService.setSchedule(
        req.params.id,
        req.userId,
        req.body,
      );

      response.success(res, { ad }, "Schedule set successfully");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/ads/:id/schedule
 * Remove ad schedule
 */
router.delete(
  "/:id/schedule",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adSchedulingService.removeSchedule(
        req.params.id,
        req.userId,
      );

      response.success(res, { ad }, "Schedule removed");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/save
 * Toggle save/favorite ad
 */
router.post(
  "/:id/save",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const result = await adService.toggleSaveAd(req.params.id, req.userId);

      response.success(res, result, result.saved ? "Ad saved" : "Ad unsaved");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/archive
 * Archive ad
 */
router.post(
  "/:id/archive",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.archiveAd(req.params.id, req.userId);

      response.success(res, { ad }, "Ad archived");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/unarchive
 * Unarchive ad
 */
router.post(
  "/:id/unarchive",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const ad = await adService.unarchiveAd(req.params.id, req.userId);

      response.success(res, { ad }, "Ad unarchived");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/saved
 * Get saved ads
 */
router.get("/saved", async (req, res, next) => {
  try {
    const ads = await adService.getSavedAds(req.userId);

    response.success(res, { ads });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/ads/:id/stats/daily
 * Get daily statistics for ad
 */
router.get(
  "/:id/stats/daily",
  validate([
    param("id").isString(),
    query("days").optional().isInt({ min: 1, max: 90 }),
  ]),
  async (req, res, next) => {
    try {
      const days = parseInt(req.query.days || 30);
      const stats = await dailyStatsService.getAdDailyStats(
        req.params.id,
        days,
      );

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/:id/stats/hourly
 * Get hourly distribution
 */
router.get(
  "/:id/stats/hourly",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const stats = await dailyStatsService.getHourlyDistribution(
        req.params.id,
      );

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/ads/stats/overview
 * Get advertiser daily stats
 */
router.get(
  "/stats/overview",
  validate([query("days").optional().isInt({ min: 1, max: 90 })]),
  async (req, res, next) => {
    try {
      const days = parseInt(req.query.days || 30);
      const stats = await dailyStatsService.getAdvertiserDailyStats(
        req.userId,
        days,
      );

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/:id/test
 * Send test ad to user's Telegram
 */
router.post(
  "/:id/test",
  validate([param("id").isString(), body("telegramUserId").isString()]),
  async (req, res, next) => {
    try {
      const result = await adService.sendTestAd(
        req.params.id,
        req.userId,
        req.body.telegramUserId,
      );

      response.success(res, result, "Test ad sent");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/upload-media
 * Upload ad media (image/video)
 */
router.post(
  "/upload-media",
  requireAdvertiser,
  upload.single("media"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return response.error(res, "No file uploaded", 400);
      }

      const result = await adMediaService.uploadAdMedia(req.file, req.userId);

      response.success(res, result, "Media uploaded successfully");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/ads/upload-base64
 * Upload base64 image
 */
router.post(
  "/upload-base64",
  requireAdvertiser,
  validate([body("base64Data").isString()]),
  async (req, res, next) => {
    try {
      const { base64Data } = req.body;

      const result = await adMediaService.uploadBase64Image(
        base64Data,
        req.userId,
      );

      response.success(res, result, "Image uploaded successfully");
    } catch (error) {
      next(error);
    }
  },
);

export default router;
