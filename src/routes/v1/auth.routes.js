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

export default router;