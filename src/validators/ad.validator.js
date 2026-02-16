import { body, param } from 'express-validator';
import { LIMITS } from '../config/constants.js';

/**
 * Ad Validators
 */

export const adValidators = {
  /**
   * Create ad
   */
  createAd: [
    body('contentType')
      .isIn(['TEXT', 'HTML', 'MARKDOWN', 'MEDIA', 'POLL'])
      .withMessage('Invalid content type'),
    
    body('title')
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Title must be between 3 and 100 characters'),
    
    body('text')
      .isString()
      .trim()
      .isLength({ min: 10, max: LIMITS.MAX_AD_TEXT_LENGTH })
      .withMessage(`Text must be between 10 and ${LIMITS.MAX_AD_TEXT_LENGTH} characters`),
    
    body('htmlContent')
      .optional()
      .isString()
      .withMessage('HTML content must be a string'),
    
    body('markdownContent')
      .optional()
      .isString()
      .withMessage('Markdown content must be a string'),
    
    body('mediaUrl')
      .optional()
      .isURL()
      .withMessage('Invalid media URL'),
    
    body('mediaType')
      .optional()
      .isString()
      .withMessage('Media type must be a string'),
    
    body('buttons')
      .optional()
      .isArray()
      .custom((buttons) => {
        if (buttons.length > LIMITS.MAX_BUTTONS_PER_AD) {
          throw new Error(`Maximum ${LIMITS.MAX_BUTTONS_PER_AD} buttons allowed`);
        }
        return true;
      }),
    
    body('buttons.*.text')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Button text must be between 1 and 50 characters'),
    
    body('buttons.*.url')
      .optional()
      .isURL()
      .withMessage('Invalid button URL'),
    
    body('poll')
      .optional()
      .isObject()
      .withMessage('Poll must be an object'),
    
    body('poll.question')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 255 })
      .withMessage('Poll question must be between 3 and 255 characters'),
    
    body('poll.options')
      .optional()
      .isArray()
      .custom((options) => {
        if (options.length < 2) {
          throw new Error('Poll must have at least 2 options');
        }
        if (options.length > LIMITS.MAX_POLL_OPTIONS) {
          throw new Error(`Maximum ${LIMITS.MAX_POLL_OPTIONS} poll options allowed`);
        }
        return true;
      }),
    
    body('targetImpressions')
      .isInt({ min: LIMITS.MIN_AD_IMPRESSIONS, max: LIMITS.MAX_AD_IMPRESSIONS })
      .withMessage(`Impressions must be between ${LIMITS.MIN_AD_IMPRESSIONS} and ${LIMITS.MAX_AD_IMPRESSIONS}`),
    
    body('cpmBid')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('CPM bid must be a positive number'),
    
    body('targeting')
      .optional()
      .isObject()
      .withMessage('Targeting must be an object'),
    
    body('specificBotIds')
      .optional()
      .isArray()
      .withMessage('Specific bot IDs must be an array'),
    
    body('excludedUserIds')
      .optional()
      .isArray()
      .withMessage('Excluded user IDs must be an array'),
    
    body('promoCode')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Invalid promo code'),
  ],

  /**
   * Update ad
   */
  updateAd: [
    param('id').isString().notEmpty(),
    
    body('title')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Title must be between 3 and 100 characters'),
    
    body('text')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 10, max: LIMITS.MAX_AD_TEXT_LENGTH })
      .withMessage(`Text must be between 10 and ${LIMITS.MAX_AD_TEXT_LENGTH} characters`),
    
    body('buttons')
      .optional()
      .isArray()
      .custom((buttons) => {
        if (buttons.length > LIMITS.MAX_BUTTONS_PER_AD) {
          throw new Error(`Maximum ${LIMITS.MAX_BUTTONS_PER_AD} buttons allowed`);
        }
        return true;
      }),
    
    body('targeting')
      .optional()
      .isObject()
      .withMessage('Targeting must be an object'),
  ],

  /**
   * Pricing estimate
   */
  pricingEstimate: [
    body('impressions')
      .isInt({ min: LIMITS.MIN_AD_IMPRESSIONS })
      .withMessage(`Impressions must be at least ${LIMITS.MIN_AD_IMPRESSIONS}`),
    
    body('category')
      .optional()
      .isString()
      .withMessage('Category must be a string'),
    
    body('targeting')
      .optional()
      .isObject()
      .withMessage('Targeting must be an object'),
    
    body('cpmBid')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('CPM bid must be a positive number'),
  ],

  /**
   * Preview ad
   */
  previewAd: [
    body('contentType')
      .isIn(['TEXT', 'HTML', 'MARKDOWN', 'MEDIA', 'POLL'])
      .withMessage('Invalid content type'),
    
    body('text')
      .isString()
      .withMessage('Text is required'),
    
    body('buttons')
      .optional()
      .isArray()
      .withMessage('Buttons must be an array'),
    
    body('poll')
      .optional()
      .isObject()
      .withMessage('Poll must be an object'),
  ],

  /**
   * Submit ad
   */
  submitAd: [
    param('id').isString().notEmpty(),
  ],
};

export default adValidators;