// src/middleware/auth.js
import jwtUtil from '../utils/jwt.js';
import response from '../utils/response.js';
import { AuthenticationError, TokenExpiredError } from '../utils/errors.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user to request
 * ✅ FIXED: Now includes roles array
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // Verify token
    let decoded;
    try {
      decoded = jwtUtil.verify(token);
    } catch (error) {
      if (error.message === 'Token expired') {
        throw new TokenExpiredError('Access token expired');
      }
      throw new AuthenticationError('Invalid token');
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        telegramId: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        roles : true,
        avatarUrl: true,
        locale: true,
        isActive: true,
        isBanned: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.isBanned) {
      return response.forbidden(res, 'Your account has been banned');
    }

    if (!user.isActive) {
      return response.forbidden(res, 'Your account is inactive');
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role;
    req.userRoles = user.roles || [];

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error instanceof AuthenticationError || error instanceof TokenExpiredError) {
      return response.unauthorized(res, error.message);
    }

    return response.serverError(res, 'Authentication failed');
  }
};

/**
 * Optional authentication
 * Attaches user if token is valid, but doesn't fail if not
 * ✅ FIXED: Now includes roles array
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwtUtil.verify(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          telegramId: true,
          email: true,
          role: true,
          roles: true,  // ✅ CRITICAL FIX - Add this line!
          isActive: true,
          isBanned: true,
        },
      });

      if (user && !user.isBanned && user.isActive) {
        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;
      }
    } catch (error) {
      // Token invalid or expired, just continue without user
      logger.debug('Optional auth failed:', error.message);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next();
  }
};

/**
 * Bot API Key Authentication
 * For /api/ad/SendPost endpoint
 */
export const authenticateBotApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.error(res, 'No API key provided', 401);
    }

    const apiKey = authHeader.substring(7);

    // Verify API key (JWT)
    let decoded;
    try {
      decoded = jwtUtil.verifyBotApiKey(apiKey);
    } catch (error) {
      return response.error(res, 'Invalid or expired API key', 401);
    }

    // Fetch bot from database
    const bot = await prisma.bot.findUnique({
      where: { id: decoded.botId },
      include: {
        owner: {
          select: {
            id: true,
            isActive: true,
            isBanned: true,
          },
        },
      },
    });

    if (!bot) {
      return response.error(res, 'Bot not found', 404);
    }

    // Check if API key is revoked
    if (bot.apiKeyRevoked) {
      return response.error(res, 'API key has been revoked', 401);
    }

    // Check bot status
    if (bot.status !== 'ACTIVE') {
      return response.error(res, 'Bot is not active', 403);
    }

    // Check if paused
    if (bot.isPaused) {
      return response.error(res, 'Bot is paused', 403);
    }

    // Check owner status
    if (bot.owner.isBanned || !bot.owner.isActive) {
      return response.error(res, 'Bot owner account is inactive', 403);
    }

    // Update last used timestamp
    await prisma.bot.update({
      where: { id: bot.id },
      data: { apiKeyLastUsed: new Date() },
    });

    // Attach bot to request
    req.bot = bot;
    req.botId = bot.id;
    req.botOwnerId = bot.ownerId;

    next();
  } catch (error) {
    logger.error('Bot API key authentication error:', error);
    return response.serverError(res, 'Authentication failed');
  }
};
