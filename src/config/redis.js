import { createClient } from 'redis';
import logger from '../utils/logger.js';

/**
 * Redis Client Configuration (redis v4+)
 */
const redisConfig = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB, 10) || 0,
};

// Create client
const redisClient = createClient(redisConfig);

// Error handling
redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis client connecting...');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis client reconnecting...');
});

redisClient.on('end', () => {
  logger.info('Redis client connection closed');
});

/**
 * Connect to Redis
 */
async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('✅ Redis connected successfully');
    } else {
      logger.info('Redis already connected');
    }
    return true;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from Redis
 */
async function disconnectRedis() {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis disconnected successfully');
    }
  } catch (error) {
    logger.error('Redis disconnect failed:', error);
    throw error;
  }
}

/**
 * Redis wrapper with all needed methods
 * Compatible with rate limiter
 */
const redis = {
  // Direct access to client for multi/pipeline
  client: redisClient,

  // ✅ Health check
  async healthCheck() {
    try {
      if (!redisClient.isOpen) {
        return false;
      }
      await redisClient.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  },

  // Basic operations
  async get(key) {
    try {
      return await redisClient.get(key);
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  },

  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        await redisClient.setEx(key, ttl, value);
      } else {
        await redisClient.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  },

  async exists(key) {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', error);
      return false;
    }
  },

  async setex(key, seconds, value) {
    return await this.set(key, value, seconds);
  },

  async incr(key) {
    try {
      return await redisClient.incr(key);
    } catch (error) {
      logger.error('Redis INCR error:', error);
      return null;
    }
  },

  async decr(key) {
    try {
      return await redisClient.decr(key);
    } catch (error) {
      logger.error('Redis DECR error:', error);
      return null;
    }
  },

  async expire(key, seconds) {
    try {
      return await redisClient.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  },

  async pExpire(key, milliseconds) {
    try {
      return await redisClient.pExpire(key, milliseconds);
    } catch (error) {
      logger.error('Redis PEXPIRE error:', error);
      return false;
    }
  },

  // Sorted set operations (for sliding window rate limiter)
  async zadd(key, score, member) {
    try {
      return await redisClient.zAdd(key, { score, value: member });
    } catch (error) {
      logger.error('Redis ZADD error:', error);
      return null;
    }
  },

  async zcard(key) {
    try {
      return await redisClient.zCard(key);
    } catch (error) {
      logger.error('Redis ZCARD error:', error);
      return 0;
    }
  },

  async zremrangebyscore(key, min, max) {
    try {
      return await redisClient.zRemRangeByScore(key, min, max);
    } catch (error) {
      logger.error('Redis ZREMRANGEBYSCORE error:', error);
      return 0;
    }
  },

  // Multi/Pipeline support
  multi() {
    return redisClient.multi();
  },

  // Flush database
  async flushdb() {
    try {
      await redisClient.flushDb();
      return true;
    } catch (error) {
      logger.error('Redis FLUSHDB error:', error);
      return false;
    }
  },
};

export { redisClient, connectRedis, disconnectRedis, redis };
export default redis;