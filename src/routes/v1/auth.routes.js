import { Router } from 'express';
import authService from '../../services/auth/authService.js';
import telegramAuthService from '../../services/auth/telegramAuthService.js';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import response from '../../utils/response.js';
import logger from '../../utils/logger.js';

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

export default router;