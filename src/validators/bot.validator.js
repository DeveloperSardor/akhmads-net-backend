import { body, param } from 'express-validator';
import { AD_CATEGORIES } from '../config/constants.js';

/**
 * Bot Validators
 */

const validCategories = AD_CATEGORIES.map(c => c.id);

export const botValidators = {
  /**
   * Register bot
   */
  registerBot: [
    body('token')
      .isString()
      .notEmpty()
      .withMessage('Bot token is required'),
    
    body('shortDescription')
      .isString()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be between 10 and 500 characters'),
    
    body('category')
      .isString()
      .isIn(validCategories)
      .withMessage('Invalid category'),
    
    body('language')
      .optional()
      .isIn(['uz', 'ru', 'en'])
      .withMessage('Language must be uz, ru, or en'),
  ],

  /**
   * Update bot
   */
  updateBot: [
    param('id').isString().notEmpty(),
    
    body('shortDescription')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be between 10 and 500 characters'),
    
    body('category')
      .optional()
      .isString()
      .isIn(validCategories)
      .withMessage('Invalid category'),
    
    body('language')
      .optional()
      .isIn(['uz', 'ru', 'en'])
      .withMessage('Language must be uz, ru, or en'),
    
    body('postFilter')
      .optional()
      .isIn(['all', 'not_mine', 'only_mine'])
      .withMessage('Invalid post filter'),
    
    body('allowedCategories')
      .optional()
      .isArray()
      .withMessage('Allowed categories must be an array'),
    
    body('blockedCategories')
      .optional()
      .isArray()
      .withMessage('Blocked categories must be an array'),
    
    body('frequencyMinutes')
      .optional()
      .isInt({ min: 1, max: 1440 })
      .withMessage('Frequency must be between 1 and 1440 minutes'),
  ],

  /**
   * Pause/resume bot
   */
  togglePause: [
    param('id').isString().notEmpty(),
    body('isPaused').isBoolean().withMessage('isPaused must be boolean'),
  ],

  /**
   * Update bot token
   */
  updateToken: [
    param('id').isString().notEmpty(),
    body('newToken').isString().notEmpty().withMessage('New token is required'),
  ],
};

export default botValidators;