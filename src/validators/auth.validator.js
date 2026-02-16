import { body, param } from 'express-validator';

/**
 * Auth Validators
 */

export const authValidators = {
  /**
   * Initiate login
   */
  initiateLogin: [
    // No body params required - uses IP and user agent from request
  ],

  /**
   * Check login status
   */
  checkLoginStatus: [
    param('token').isString().notEmpty().withMessage('Login token is required'),
  ],

  /**
   * Verify login
   */
  verifyLogin: [
    body('loginToken').isString().notEmpty().withMessage('Login token is required'),
    body('telegramId').isString().notEmpty().withMessage('Telegram ID is required'),
    body('code').optional().isString().isLength({ min: 4, max: 4 }).withMessage('Code must be 4 digits'),
  ],

  /**
   * Refresh token
   */
  refreshToken: [
    body('refreshToken').isString().notEmpty().withMessage('Refresh token is required'),
  ],

  /**
   * Logout (no validation needed - uses auth middleware)
   */
  logout: [],
};

export default authValidators;