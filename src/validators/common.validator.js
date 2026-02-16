import { body, param, query } from 'express-validator';

/**
 * Common Validators
 * Reusable validation schemas
 */

export const commonValidators = {
  // ID validation
  id: param('id').isString().notEmpty().withMessage('Invalid ID'),

  // Pagination
  page: query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
  limit: query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  offset: query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be at least 0'),

  // Dates
  startDate: query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  endDate: query('endDate').optional().isISO8601().withMessage('Invalid end date'),

  // Locale
  locale: body('locale').optional().isIn(['uz', 'ru', 'en']).withMessage('Locale must be uz, ru, or en'),

  // Email
  email: body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),

  // URL
  url: body('url').isURL().withMessage('Invalid URL'),

  // Amount
  amount: body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),

  // Search
  search: query('search').optional().isString().trim().isLength({ min: 1, max: 100 }),

  // Status
  status: query('status').optional().isString().trim(),

  // Boolean
  boolean: (field) => body(field).optional().isBoolean().withMessage(`${field} must be boolean`),
};

export default commonValidators;