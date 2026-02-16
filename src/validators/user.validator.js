import { body } from 'express-validator';

/**
 * User Validators
 */

export const userValidators = {
  /**
   * Update profile
   */
  updateProfile: [
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),
    
    body('firstName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be between 1 and 50 characters'),
    
    body('lastName')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Last name must not exceed 50 characters'),
    
    body('username')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 32 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-32 characters and contain only letters, numbers, and underscores'),
    
    body('locale')
      .optional()
      .isIn(['uz', 'ru', 'en'])
      .withMessage('Locale must be uz, ru, or en'),
    
    body('avatarUrl')
      .optional()
      .isURL()
      .withMessage('Invalid avatar URL'),
  ],

  /**
   * Update locale
   */
  updateLocale: [
    body('locale')
      .isIn(['uz', 'ru', 'en'])
      .withMessage('Locale must be uz, ru, or en'),
  ],
};

export default userValidators;