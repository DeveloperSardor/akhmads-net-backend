import { Router } from 'express';
import userService from '../../services/user/userService.js';
import profileService from '../../services/user/profileService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/user/profile
 * Get user profile WITH wallet AND stats
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.userId);
    const stats = await userService.getUserStats(req.userId);

    // ✅ Format roles for display
    const roles = user.roles || [user.role];
    const displayRole = roles.length > 1
      ? roles.map(r => {
        if (r === 'ADVERTISER') return 'Advertiser';
        if (r === 'BOT_OWNER') return 'Bot Owner';
        if (r === 'MODERATOR') return 'Moderator';
        if (r === 'ADMIN') return 'Admin';
        return r;
      }).join(' & ')
      : (user.role === 'ADVERTISER' ? 'Advertiser' :
        user.role === 'BOT_OWNER' ? 'Bot Owner' : user.role);

    response.success(res, {
      user: {
        ...user,
        roles: user.roles || [], // Explicitly include the roles array 
        displayRole, // ✅ Frontend uchun tayyor format
      },
      wallet: user.wallet,
      stats: {
        totalImpressions: stats.totalImpressions || 0,
        totalClicks: stats.totalClicks || 0,
        averageCtr: stats.averageCtr || 0,
        totalConversions: stats.totalConversions || 0,
        totalSpent: parseFloat(user.wallet?.totalSpent || 0),
        totalEarned: parseFloat(user.wallet?.totalEarned || 0),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/user/profile
 * Update user profile
 */
router.put(
  '/profile',
  validate([
    body('email').optional().isEmail(),
    body('firstName').optional().isString().isLength({ min: 1, max: 50 }),
    body('lastName').optional().isString().isLength({ max: 50 }),
    body('username').optional().isString().isLength({ min: 3, max: 32 }),
    body('locale').optional().isIn(['uz', 'ru', 'en']),
  ]),
  async (req, res, next) => {
    try {
      const user = await profileService.updateProfile(req.userId, req.body);

      response.success(res, { user }, 'Profile updated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/user/stats
 * Get user statistics (detailed)
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await userService.getUserStats(req.userId);

    response.success(res, { stats });
  } catch (error) {
    next(error);
  }
});

export default router;