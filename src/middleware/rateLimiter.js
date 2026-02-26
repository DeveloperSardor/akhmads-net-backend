// src/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';
import redis from '../config/redis.js';
import { RATE_LIMITS } from '../config/constants.js';
import response from '../utils/response.js';
import logger from '../utils/logger.js';

/**
 * Rate Limiting Middleware
 * Compatible with redis v4+ and express-rate-limit v7+
 */

/**
 * Redis Store for express-rate-limit
 * FIXED: Proper return format to prevent double counting
 */
class RedisStore {
  constructor(options) {
    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs || 60000;
  }

  async increment(key) {
    const redisKey = `${this.prefix}${key}`;

    try {
      // Get current count
      const current = await this.client.get(redisKey);

      if (current === null) {
        // First request - set to 1 with expiry
        await this.client.set(redisKey, '1', Math.ceil(this.windowMs / 1000));

        return {
          totalHits: 1,
          resetTime: new Date(Date.now() + this.windowMs),
        };
      } else {
        // Increment existing count
        const totalHits = await this.client.incr(redisKey);

        return {
          totalHits,
          resetTime: new Date(Date.now() + this.windowMs),
        };
      }
    } catch (error) {
      logger.error('RedisStore increment error:', error);
      // Fail open - allow request if Redis fails
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key) {
    const redisKey = `${this.prefix}${key}`;
    try {
      const current = await this.client.get(redisKey);
      if (current && parseInt(current) > 0) {
        await this.client.decr(redisKey);
      }
    } catch (error) {
      logger.error('RedisStore decrement error:', error);
    }
  }

  async resetKey(key) {
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.client.del(redisKey);
    } catch (error) {
      logger.error('RedisStore resetKey error:', error);
    }
  }
}

/**
 * Create rate limiter with Redis store
 */
const createRateLimiter = (options) => {
  return rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: options.prefix || 'rl:',
      windowMs: options.windowMs,
    }),
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // ✅ Count all requests
    skipFailedRequests: false,     // ✅ Count all requests
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, endpoint: ${req.path}`);
      response.error(res, options.message || 'Too many requests, please try again later', 429);
    },
    skip: options.skip || ((req) => {
      // Skip rate limiting for super admins
      return req.userRole === 'SUPER_ADMIN';
    }),
    keyGenerator: (req) => {
      // 1. Use user ID if authenticated
      if (req.userId) return req.userId;
      
      // 2. Check for Cloudflare IP
      if (req.headers['cf-connecting-ip']) {
        return req.headers['cf-connecting-ip'];
      }
      
      // 3. Check for standard Nginx/Proxy Forwarded IP
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor) {
        // x-forwarded-for can be a comma separated list, take the first one (original client)
        return forwardedFor.split(',')[0].trim();
      }
      
      // 4. Check real-ip
      if (req.headers['x-real-ip']) {
         return req.headers['x-real-ip'];
      }

      // 5. Fallback to Express req.ip (which relies on trust proxy)
      return req.ip;
    },
  });
};

/**
 * Auth endpoints rate limiter (strict)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many login attempts, please try again after 1 minute',
  prefix: 'rl:auth:',
});

/**
 * General API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  prefix: 'rl:api:',
  skip: (req) => {
    // Skip rate limiting for super admins
    if (req.userRole === 'SUPER_ADMIN') return true;

    // Skip avatar fetching (public proxy, heavily hit)
    if (req.path.includes('/bots/avatar/')) return true;

    // Skip in development for specific endpoints
    if (process.env.NODE_ENV === 'development') {
      if (req.path.includes('/auth/login/status/') ||
        req.path.includes('/auth/login/initiate')) {
        return true;
      }
    }
    return false;
  },
});

/**
 * Webhook rate limiter
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: RATE_LIMITS.WEBHOOK.windowMs,
  max: RATE_LIMITS.WEBHOOK.max,
  prefix: 'rl:webhook:',
});

/**
 * Bot API rate limiter (/api/ad/SendPost)
 */
export const botApiRateLimiter = createRateLimiter({
  windowMs: RATE_LIMITS.BOT_API.windowMs,
  max: RATE_LIMITS.BOT_API.max,
  message: 'Too many ad requests from this bot',
  prefix: 'rl:bot:',
});

/**
 * Custom rate limiter for specific actions
 */
export const customRateLimiter = (windowMs, max, message) => {
  return createRateLimiter({
    windowMs,
    max,
    message,
    prefix: 'rl:custom:',
  });
};

/**
 * Sliding window rate limiter (more accurate, uses Redis sorted sets)
 */
export const slidingWindowRateLimiter = (options) => {
  const { windowMs, max, identifier = 'action' } = options;

  return async (req, res, next) => {
    try {
      let clientIp = req.userId;
      if (!clientIp) {
        if (req.headers['cf-connecting-ip']) clientIp = req.headers['cf-connecting-ip'];
        else if (req.headers['x-forwarded-for']) clientIp = req.headers['x-forwarded-for'].split(',')[0].trim();
        else if (req.headers['x-real-ip']) clientIp = req.headers['x-real-ip'];
        else clientIp = req.ip;
      }
      const key = `sw:${clientIp}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries
      await redis.zRemRangeByScore(key, 0, windowStart);

      // Count requests in window
      const count = await redis.zCard(key);

      if (count >= max) {
        logger.warn(`Sliding window rate limit exceeded for key: ${key}`);
        return response.error(res, 'Rate limit exceeded', 429);
      }

      // Add current request
      await redis.zAdd(key, [{ score: now, value: `${now}:${Math.random()}` }]);
      await redis.expire(key, Math.ceil(windowMs / 1000));

      next();
    } catch (error) {
      logger.error('Sliding window rate limiter error:', error);
      next(); // Fail open (allow request if Redis fails)
    }
  };
};

/**
 * Per-action rate limiter
 * Example: Limit ad creation to 10 per hour
 */
export const actionRateLimiter = (action, max, windowSeconds) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(); // Skip if not authenticated
      }

      const key = `action:${req.userId}:${action}`;

      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (count > max) {
        logger.warn(`Action rate limit exceeded for user ${req.userId}, action: ${action}`);
        return response.error(
          res,
          `You can only perform this action ${max} times per ${Math.ceil(windowSeconds / 60)} minutes`,
          429
        );
      }

      next();
    } catch (error) {
      logger.error('Action rate limiter error:', error);
      next(); // Fail open
    }
  };
};

export default {
  authRateLimiter,
  apiRateLimiter,
  webhookRateLimiter,
  botApiRateLimiter,
  customRateLimiter,
  slidingWindowRateLimiter,
  actionRateLimiter,
};