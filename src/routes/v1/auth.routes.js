import { Router } from 'express';
import authService from '../../services/auth/authService.js';
import telegramAuthService from '../../services/auth/telegramAuthService.js';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import response from '../../utils/response.js';
import logger from '../../utils/logger.js';
import twoFactorService from '../../services/auth/twoFactorService.js';
import redis from '../../config/redis.js';
import prisma from '../../config/database.js';
import jwtUtil from '../../utils/jwt.js';

const router = Router();

/**
 * POST /api/v1/auth/login/initiate
 * Initiate Telegram login
 */
router.post('/login/initiate',
  authRateLimiter,
  async (req, res, next) => {
    try {
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      const result = await telegramAuthService.initiateLogin(ipAddress, userAgent);

      // ✅ Return both code (for browser) and codes (for bot)
      response.success(res, result, 'Login session initiated');
    } catch (error) {
      next(error);
    }
  });

/**
 * GET /api/v1/auth/login/status/:token
 * Check login status (for polling)
 */
router.get('/login/status/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const result = await telegramAuthService.checkLoginStatus(token);

    if (result.authorized) {
      response.success(res, result, 'Login successful');
    } else if (result.expired) {
      response.error(res, 'Login session expired', 401);
    } else {
      response.success(res, { authorized: false }, 'Waiting for authorization');
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return response.validationError(res, [{ field: 'refreshToken', message: 'Required' }]);
    }

    const tokens = await authService.refreshAccessToken(refreshToken);

    response.success(res, { tokens }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.userId);

    response.success(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await req.user;

    response.success(res, { user });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/telegram-widget
 * Login via Telegram auth URL (from bot button)
 * Verifies HMAC hash and returns JWT tokens
 */
router.post('/telegram-widget', async (req, res, next) => {
  try {
    const { id, first_name, last_name, username, photo_url, auth_date, hash: receivedHash } = req.body;

    if (!id || !auth_date || !receivedHash) {
      return response.validationError(res, [{ field: 'hash', message: 'Missing required fields' }]);
    }

    // Check auth_date freshness (max 24 hours)
    const now = Math.floor(Date.now() / 1000);
    if (now - parseInt(auth_date) > 86400) {
      return response.error(res, 'Auth data expired', 401);
    }

    // Verify hash
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const { default: hashUtil } = await import('../../utils/hash.js');
    const isValid = hashUtil.verifyTelegramHash(
      { id, first_name, last_name, username, photo_url, auth_date },
      botToken
    );

    if (!isValid) {
      return response.error(res, 'Invalid auth data', 401);
    }

    const telegramId = id.toString();

    // Find or create user and generate tokens
    const result = await telegramAuthService.verifyWidgetLogin(telegramId, {
      first_name,
      last_name,
      username,
      photo_url,
      language_code: 'en',
    });

    response.success(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/2fa/setup
 * Initialize 2FA setup
 */
router.post('/2fa/setup', authenticate, async (req, res, next) => {
  try {
    const result = await twoFactorService.setup(req.userId);
    response.success(res, result, '2FA setup initiated');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/2fa/confirm
 * Confirm 2FA setup
 */
router.post('/2fa/confirm', authenticate, async (req, res, next) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !code) {
      return response.validationError(res, [{ field: 'code', message: 'Secret and code are required' }]);
    }
    await twoFactorService.confirm(req.userId, secret, code);
    response.success(res, null, '2FA enabled successfully');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/2fa/verify
 * Verify 2FA code during login
 */
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { twoFaToken, code } = req.body;
    if (!twoFaToken || !code) {
      return response.validationError(res, [{ field: 'code', message: 'Token and code are required' }]);
    }

    const preAuthData = await redis.get(`pre_auth_2fa:${twoFaToken}`);
    if (!preAuthData) {
      return response.error(res, '2FA session expired or invalid', 401);
    }

    const { userId } = JSON.parse(preAuthData);
    
    // Verify 2FA code
    await twoFactorService.verify(userId, code);

    // Get full user for tokens
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    // Generate tokens
    const tokens = jwtUtil.generateTokenPair(user);

    // Store refresh token
    const isAdmin = user.role === 'ADMIN' || (user.roles && user.roles.includes('ADMIN'));
    await redis.set(
      `refresh_token:${user.id}`,
      tokens.refreshToken,
      isAdmin ? 1 * 24 * 60 * 60 : 2 * 24 * 60 * 60
    );

    // Clean up
    await redis.del(`pre_auth_2fa:${twoFaToken}`);

    response.success(res, {
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        role: user.role,
        roles: user.roles,
        avatarUrl: user.avatarUrl,
        locale: user.locale
      },
      tokens
    }, '2FA verification successful');
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/auth/2fa
 * Disable 2FA
 */
router.delete('/2fa', authenticate, async (req, res, next) => {
  try {
    await twoFactorService.disable(req.userId);
    response.success(res, null, '2FA disabled successfully');
  } catch (error) {
    next(error);
  }
});

export default router;