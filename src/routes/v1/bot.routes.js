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
        targetUrl = dbBot.avatarUrl; // Will be minio / s3 url
        await redis.set(cacheKey, targetUrl, 86400); // 24h cache
      } else {
        // 2b. If legacy bot or missing avatar, scrape its public Telegram page
        try {
          const htmlResponse = await axios.get(`https://t.me/${username}`, {
            timeout: 3000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          });

          const match = htmlResponse.data.match(
            /<meta property="?og:image"? content="?([^">]+)"?/i,
          );

          if (match && match[1] && match[1].includes("cdn")) {
            targetUrl = match[1]; // Set to Telegram CDN URL
            await redis.set(cacheKey, targetUrl, 21600); // 6h cache (Telegram CDN links change)
          } else {
            targetUrl = fallbackImage;
            await redis.set(cacheKey, targetUrl, 86400); // 24h cache
          }
        } catch (scrapeErr) {
          // Scrape failed (e.g. timeout or deleted bot)
          targetUrl = fallbackImage;
        }
      }
    }

    // 3. Optimized: If the target url is our own local storage, fetch it internally
    // to avoid potential loopback/firewall issues with the public IP
    let fetchUrl = targetUrl;
    if (fetchUrl.includes(process.env.CDN_URL || '176.222.52.47')) {
       fetchUrl = fetchUrl.replace(/http:\/\/176.222.52.47\/storage/i, 'http://localhost:9000');
       // Minio internal use often needs to strip bucket from path if using path-style
       // but here it seems it might be Nginx proxied. 
       // Let's just try to fallback to a smarter fetch if public fails.
    }

    // 4. Stream the target image pipeline directly back to the client
    try {
      const sourceResponse = await axios.get(fetchUrl, {
        responseType: "stream",
        timeout: 5000,
      });
      res.set("Content-Type", sourceResponse.headers["content-type"]);
      res.set("Cache-Control", "public, max-age=86400");
      return sourceResponse.data.pipe(res);
    } catch (fetchErr) {
       // If internal/proxy fetch failed, try the original public target one last time
       if (fetchUrl !== targetUrl) {
          const retryResponse = await axios.get(targetUrl, { responseType: "stream", timeout: 3000 });
          res.set("Content-Type", retryResponse.headers["content-type"]);
          res.set("Cache-Control", "public, max-age=86400");
          return retryResponse.data.pipe(res);
       }
       throw fetchErr;
    }

  } catch (error) {
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
    body("frequencyMinutes").optional().isInt({ min: 1, max: 1440 }),
    body("monetized").optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
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

export default router;
