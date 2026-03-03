import { Router } from "express";
import botService from "../../services/bot/botService.js";
import botStatsService from "../../services/bot/botStatsService.js";
import botIntegrationService from "../../services/bot/botIntegrationService.js";
import { authenticate } from "../../middleware/auth.js";
import { requireBotOwner } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { body, param, query } from "express-validator";
import response from "../../utils/response.js";
import prisma from "../../config/database.js";
import redis from "../../config/redis.js";
import axios from "axios";
import adminNotificationService from "../../services/telegram/adminNotificationService.js";
import detailedStatsService from "../../services/admin/detailedStatsService.js";
import broadcastService from "../../services/admin/broadcastService.js"; // Added broadcastService

const router = Router();

/**
 * @route GET /api/v1/bots/avatar/:username
 * @desc Dynamically fetch and proxy bot's real-time telegram profile avatar picture
 */
router.get("/avatar/:username", async (req, res, next) => {
  try {
    const username = req.params.username.replace("@", "");
    const fallbackImage = `https://ui-avatars.com/api/?name=${username}&background=random&color=fff&size=128`;

    // 1. Check Redis for a cached target URL string (O(1) Memory & Speed)
    const cacheKey = `avatar:url:${username}`;
    let targetUrl = await redis.get(cacheKey);

    // 2. If valid string not in Redis, discover it
    if (!targetUrl) {
      // 2a. Check if Bot exists in our Postgres DB and has an uploaded CDN avatar
      const dbBot = await prisma.bot.findFirst({
        where: { username },
        select: { avatarUrl: true },
      });

      if (dbBot && dbBot.avatarUrl) {
        // If relative path, convert to full internal local URL
        targetUrl = dbBot.avatarUrl.startsWith('http') 
          ? dbBot.avatarUrl 
          : `http://localhost:${process.env.PORT || 3000}${dbBot.avatarUrl}`;
        await redis.set(cacheKey, targetUrl, 86400); 
      } else {
        // 2b. If legacy bot or missing avatar, scrape its public Telegram page
        try {
          const cleanUser = username.replace(/^@/, '');
          const htmlResponse = await axios.get(`https://t.me/${cleanUser}`, {
            timeout: 5000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });

          // Flexible regex for Telegram's og:image meta tag
          const match = htmlResponse.data.match(/<meta[^>]*?property=["']og:image["'][^>]*?content=["']([^"'>]+?)["']/i) || 
                        htmlResponse.data.match(/<meta[^>]*?content=["']([^"'>]+?)["'][^>]*?property=["']og:image["']/i);

          if (match && match[1] && match[1].includes("cdn")) {
            targetUrl = match[1];
            await redis.set(cacheKey, targetUrl, 43200); // 12h cache
          } else {
            targetUrl = fallbackImage;
            await redis.set(cacheKey, targetUrl, 86400);
          }
        } catch (scrapeErr) {
          console.warn(`[AvatarProxy] Scrape failed for ${username}: ${scrapeErr.message}`);
          targetUrl = fallbackImage;
        }
      }
    }

    // 3. Optimized: Internal redirect for storage URLs to bypass loopback issues
    let fetchUrl = targetUrl;
    const publicIp = '176.222.52.47';
    const cdnUrl = process.env.CDN_URL || '';

    // Handle internal routing for Minio/Storage
    if (fetchUrl.includes(publicIp) || (cdnUrl && fetchUrl.includes(cdnUrl))) {
       // regex to match IP/storage or simply IP/
       const storagePattern = new RegExp(`http(s)?://${publicIp}(/storage)?/`, 'i');
       if (storagePattern.test(fetchUrl)) {
          // Point to internal minio container (stripping /storage prefix if present)
          fetchUrl = fetchUrl.replace(storagePattern, 'http://localhost:9000/');
       }
       
       if (cdnUrl && fetchUrl.includes(cdnUrl)) {
         fetchUrl = fetchUrl.replace(new RegExp(cdnUrl, 'i'), 'http://localhost:9000');
       }
    }

    // 4. Stream the target image pipeline directly back to the client
    try {
      console.log(`[AvatarProxy] Fetching: ${fetchUrl} (Original: ${targetUrl})`);
      const sourceResponse = await axios.get(fetchUrl, {
        responseType: "stream",
        timeout: 10000,
      });
      
      let contentType = sourceResponse.headers["content-type"] || sourceResponse.headers["Content-Type"];
      
      // Guess content type if it's missing or generic
      if (!contentType || contentType === 'application/octet-stream') {
        if (targetUrl.toLowerCase().endsWith('.jpg') || targetUrl.toLowerCase().endsWith('.jpeg')) {
          contentType = 'image/jpeg';
        } else if (targetUrl.toLowerCase().endsWith('.png')) {
          contentType = 'image/png';
        } else if (targetUrl.toLowerCase().endsWith('.webp')) {
          contentType = 'image/webp';
        } else if (targetUrl.toLowerCase().endsWith('.gif')) {
          contentType = 'image/gif';
        }
      }

      console.log(`[AvatarProxy] Success: ${username}, Content-Type: ${contentType}`);
      res.set("Content-Type", contentType || 'image/jpeg');
      res.set("Cache-Control", "public, max-age=86400");
      return sourceResponse.data.pipe(res);
    } catch (fetchErr) {
       console.error(`[AvatarProxy] Fetch Error for ${username}:`, fetchErr.message);
       // If internal/proxy fetch failed, try the original public target one last time
       if (fetchUrl !== targetUrl) {
          try {
            const retryResponse = await axios.get(targetUrl, { responseType: "stream", timeout: 5000 });
            res.set("Content-Type", retryResponse.headers["content-type"] || 'image/jpeg');
            res.set("Cache-Control", "public, max-age=86400");
            return retryResponse.data.pipe(res);
          } catch (retryErr) {
            console.error(`[AvatarProxy] Retry failed for ${username}`);
          }
       }
       throw fetchErr;
    }

  } catch (error) {
    console.warn(`[AvatarProxy] Ultimate fallback to ui-avatars for @${req.params.username}`);
    // Ultimate fallback if the eventual target stream link is dead or blocks us
    const fallbackImage = `https://ui-avatars.com/api/?name=${req.params.username.replace("@", "")}&background=random&color=fff&size=128`;
    try {
      const fallbackResponse = await axios.get(fallbackImage, {
        responseType: "stream",
        timeout: 3000,
      });
      res.set("Content-Type", fallbackResponse.headers["content-type"]);
      res.set("Cache-Control", "public, max-age=86400");
      return fallbackResponse.data.pipe(res);
    } catch (innerError) {
      return res.status(404).send("Avatar not found");
    }
  }
});

// All other routes require authentication
// ✅ PUBLIC: Frequency limits
router.get("/frequency-limits", async (req, res, next) => {
  try {
    const settings = await prisma.platformSettings.findMany({
      where: { key: { in: ['min_frequency_minutes', 'max_frequency_minutes'] } },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, parseInt(s.value)]));
    response.success(res, {
      min: map.min_frequency_minutes ?? 0,
      max: map.max_frequency_minutes ?? 10080,
    }, "Frequency limits");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/public/search",
  validate([query("q").isString().notEmpty()]),
  async (req, res, next) => {
    try {
      const bots = await botService.searchBots(req.query.q);
      response.success(res, { bots });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/bots/public
 * @desc Get all active public bots for broadcast/targeting
 */
router.get(
  "/public",
  async (req, res, next) => {
    try {
      const bots = await botService.getPublicBots();
      response.success(res, { bots });
    } catch (error) {
      next(error);
    }
  }
);

router.use(authenticate);

/**
 * @route GET /api/v1/bots/verify-token
 * @desc Verify bot token and get info before registration
 */
router.post(
  "/verify-token",
  validate([
    body("token").isString().notEmpty().withMessage("Bot token is required"),
  ]),
  async (req, res, next) => {
    try {
      const info = await botService.verifyTokenWithAvatar(req.body.token);
      response.success(res, info, "Bot verified successfully");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/bots
 * Register new bot
 * ✅ Returns bot + apiKey
 */
router.post(
  "/",
  requireBotOwner,
  validate([
    body("token").isString().notEmpty(),
    body("shortDescription").optional().isString().isLength({ max: 500 }),
    body("category").isString().notEmpty(),
    body("language").optional().isIn(["uz", "ru", "en"]),
    body("monetized").optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.registerBot(req.userId, req.body);

      // ✅ Adminlarga Telegram xabari + inline tugmalar
      const owner = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { username: true, firstName: true, telegramId: true },
      });
      adminNotificationService.notifyNewBot(bot, owner).catch(() => {});

      // ✅ Return both bot and apiKey
      response.created(
        res,
        { bot, apiKey: bot.apiKey },
        "Bot registered successfully",
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/bots
 * Get user's bots WITH stats
 * ✅ Enhanced with impressions, CTR, spent data
 */
router.get("/", requireBotOwner, async (req, res, next) => {
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
        const ctr =
          impressionsCount > 0
            ? ((clicksCount / impressionsCount) * 100).toFixed(2)
            : "0.00";

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
      }),
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
  "/:id",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      // Check ownership
      if (
        bot.ownerId !== req.userId &&
        !["ADMIN", "SUPER_ADMIN"].includes(req.userRole)
      ) {
        return response.forbidden(res, "Access denied");
      }

      response.success(res, { bot });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/bots/:id
 * Update bot settings
 */
router.put(
  "/:id",
  validate([
    param("id").isString(),
    body("shortDescription").optional().isString().isLength({ max: 500 }),
    body("category").optional().isString(),
    body("language").optional().isIn(["uz", "ru", "en"]),
    body("postFilter").optional().isIn(["all", "not_mine", "only_mine"]),
    body("allowedCategories").optional().isArray(),
    body("blockedCategories").optional().isArray(),
    body("frequencyMinutes").optional().isInt({ min: 0, max: 10080 }),
    body("monetized").optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      // ✅ Admin belgilagan frequency limitlarini tekshirish
      if (req.body.frequencyMinutes !== undefined) {
        const freqSettings = await prisma.platformSettings.findMany({
          where: { key: { in: ['min_frequency_minutes', 'max_frequency_minutes'] } },
        });
        const freqMap = Object.fromEntries(freqSettings.map(s => [s.key, parseInt(s.value)]));
        const minFreq = freqMap.min_frequency_minutes ?? 0;
        const maxFreq = freqMap.max_frequency_minutes ?? 10080;

        if (req.body.frequencyMinutes < minFreq || req.body.frequencyMinutes > maxFreq) {
          return response.error(res, `Chastota ${minFreq} dan ${maxFreq} minutgacha bo'lishi kerak`, 400);
        }
      }

      const bot = await botService.updateBot(
        req.params.id,
        req.userId,
        req.body,
      );

      response.success(res, { bot }, "Bot updated");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/bots/:id/pause
 * Pause/resume bot
 * ✅ POST (not PATCH)
 */
router.post(
  "/:id/pause",
  validate([param("id").isString(), body("isPaused").isBoolean()]),
  async (req, res, next) => {
    try {
      const bot = await botService.togglePause(
        req.params.id,
        req.userId,
        req.body.isPaused,
      );

      response.success(
        res,
        { bot },
        `Bot ${req.body.isPaused ? "paused" : "resumed"}`,
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/bots/:id/regenerate-api-key
 * Regenerate API key
 */
router.post(
  "/:id/regenerate-api-key",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const result = await botService.regenerateApiKey(
        req.params.id,
        req.userId,
      );

      response.success(
        res,
        { apiKey: result.newApiKey },
        "API key regenerated",
      );
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/bots/:id/token
 * Update bot token
 */
router.put(
  "/:id/token",
  validate([param("id").isString(), body("newToken").isString().notEmpty()]),
  async (req, res, next) => {
    try {
      const bot = await botService.updateBotToken(
        req.params.id,
        req.userId,
        req.body.newToken,
      );

      response.success(res, { bot }, "Bot token updated");
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/bots/:id
 * Delete bot
 */
router.delete(
  "/:id",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      await botService.deleteBot(req.params.id, req.userId);

      response.noContent(res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/bots/:id/stats
 * Get bot statistics
 */
router.get(
  "/:id/stats",
  validate([
    param("id").isString(),
    query("period").optional().isIn(["7d", "30d", "90d"]),
  ]),
  async (req, res, next) => {
    try {
      const { period = "7d" } = req.query;

      const stats = await botService.getBotStats(req.params.id, period);

      response.success(res, { stats });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/bots/:id/integration
 * Get integration code
 */
router.get(
  "/:id/integration",
  validate([
    param("id").isString(),
    query("language")
      .optional()
      .isIn(["python", "javascript", "typescript", "php", "csharp"]),
  ]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      if (bot.ownerId !== req.userId) {
        return response.forbidden(res, "Access denied");
      }

      const { language = "python" } = req.query;

      const code = botIntegrationService.getIntegrationCode(
        bot.apiKey,
        language,
      );
      const docs = botIntegrationService.getDocumentation();

      response.success(res, { code, docs });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/bots/:id/history
 * Get bot ad serving history
 */
router.get(
  "/:id/history",
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      // Check ownership
      if (
        bot.ownerId !== req.userId &&
        !["ADMIN", "SUPER_ADMIN"].includes(req.userRole)
      ) {
        return response.forbidden(res, "Access denied");
      }

      const history = await botService.getBotAdHistory(req.params.id);

      response.success(res, { history });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/bots/:id/active-users
 * Get list of active users for own bot
 */
router.get(
  "/:id/active-users",
  requireBotOwner,
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      if (bot.ownerId !== req.userId) {
        return response.forbidden(res, "Access denied");
      }

      const result = await detailedStatsService.getBotUsers(req.params.id, req.query);
      response.paginated(res, result.users, {
        page: Math.floor((req.query.offset || 0) / (req.query.limit || 50)) + 1,
        limit: parseInt(req.query.limit || 50),
        total: result.total,
        stats: result.stats
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/bots/:id/export
 * Export bot users for own bot
 */
router.get(
  "/:id/export",
  requireBotOwner,
  validate([param("id").isString()]),
  async (req, res, next) => {
    try {
      const bot = await botService.getBotById(req.params.id);

      if (bot.ownerId !== req.userId) {
        return response.forbidden(res, "Access denied");
      }

      const data = await detailedStatsService.getExportData(req.params.id, req.query);
      response.success(res, data, "Export data generated");
    } catch (error) {
      next(error);
    }
  }
);

export default router;
