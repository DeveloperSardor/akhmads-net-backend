import { body, param, query, validationResult } from 'express-validator';
import response from './response.js';

/**
 * Common Validation Rules
 */
export const commonValidators = {
  // ID validation
  id: param('id').isString().notEmpty().withMessage('Invalid ID'),

  // Pagination
  page: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  // Date range
  startDate: query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  
  endDate: query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),

  // Language
  locale: body('locale')
    .optional()
    .isIn(['uz', 'ru', 'en'])
    .withMessage('Locale must be uz, ru, or en'),

  // Email
  email: body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),

  // URL
  url: body('url')
    .optional()
    .isURL()
    .withMessage('Invalid URL format'),

  // Amount
  amount: body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
    .toFloat(),
};

/**
 * Validation result handler middleware
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    return response.validationError(res, formattedErrors);
  }

  next();
};

/**
 * Sanitize input
 */
export const sanitize = {
  trim: (value) => (typeof value === 'string' ? value.trim() : value),
  escape: (value) => {
    if (typeof value !== 'string') return value;
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },
};

/**
 * Check if value is valid ObjectId (CUID in our case)
 */
export const isValidId = (id) => {
  return typeof id === 'string' && id.length > 0;
};

/**
 * Check if telegram user ID is valid
 */
export const isValidTelegramId = (id) => {
  return /^\d+$/.test(id) && id.length >= 5 && id.length <= 15;
};

/**
 * Check if URL is valid
 */
export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};