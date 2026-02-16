// src/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';
import redis from '../config/redis.js';
import { RATE_LIMITS } from '../config/constants.js';
import response from '../utils/response.js';
import logger from '../utils/logger.js';

/**
 * Rate Limiting Middleware
 * Compatible with redis v4+
 */

/**
 * Redis Store for express-rate-limit
 */
class RedisStore {
  constructor(options) {
    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
  }

  async increment(key) {
    const redisKey = `${this.prefix}${key}`;
    
    try {
      // Use multi for atomic operations
      const multi = this.client.multi();
      multi.incr(redisKey);
      multi.pExpire(redisKey, 60000); // 60 seconds
      
      const results = await multi.exec();
      const totalHits = results[0]; // First result is from incr
      
      return {
        totalHits,
        resetTime: new Date(Date.now() + 60000),
      };
    } catch (error) {
      logger.error('RedisStore increment error:', error);
      // Fail open - allow request if Redis fails
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  }

  async decrement(key) {
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.client.decr(redisKey);
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
      prefix: 'rl:',
    }),
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, endpoint: ${req.path}`);
      response.error(res, options.message || 'Too many requests, please try again later', 429);
    },
    skip: (req) => {
      // Skip rate limiting for super admins
      return req.userRole === 'SUPER_ADMIN';
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.userId || req.ip;
    },
  });
};

/**
 * Auth endpoints rate limiter (strict)
 */
/**
 * Auth endpoints rate limiter (strict)
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // ✅ 1 minute (was 15 minutes)
  max: 100, // ✅ 100 requests (was very low)
  message: 'Too many login attempts, please try again after 1 minute',
});

/**
 * General API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // ✅ 1 minute
  max: 1000, // ✅ 1000 requests
  skip: (req) => {
    // ✅ Skip rate limiting for login endpoints in development
    if (process.env.NODE_ENV === 'development') {
      if (req.path.includes('/auth/login/status/') || req.path.includes('/auth/login/initiate')) {
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
});

/**
 * Bot API rate limiter (/api/ad/SendPost)
 */
export const botApiRateLimiter = createRateLimiter({
  windowMs: RATE_LIMITS.BOT_API.windowMs,
  max: RATE_LIMITS.BOT_API.max,
  message: 'Too many ad requests from this bot',
});

/**
 * Custom rate limiter for specific actions
 */
export const customRateLimiter = (windowMs, max, message) => {
  return createRateLimiter({ windowMs, max, message });
};

/**
 * Sliding window rate limiter (more accurate, uses Redis sorted sets)
 */
export const slidingWindowRateLimiter = (options) => {
  const { windowMs, max, identifier = 'action' } = options;

  return async (req, res, next) => {
    try {
      const key = `sw:${req.userId || req.ip}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries
      await redis.zremrangebyscore(key, 0, windowStart);

      // Count requests in window
      const count = await redis.zcard(key);

      if (count >= max) {
        logger.warn(`Sliding window rate limit exceeded for key: ${key}`);
        return response.error(res, 'Rate limit exceeded', 429);
      }

      // Add current request
      await redis.zadd(key, now, `${now}:${Math.random()}`);
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
          `You can only perform this action ${max} times per ${windowSeconds / 60} minutes`,
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