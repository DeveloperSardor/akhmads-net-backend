// src/middleware/validate.js
import { validationResult } from 'express-validator';
import response from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Validation Middleware
 * Handles express-validator results
 */

/**
 * Main validation handler - validation qoidalarini qabul qiladi
 */
export const validate = (rules = []) => {
  return async (req, res, next) => {
    try {
      // Barcha validation qoidalarini ishga tushirish
      await Promise.all(rules.map((rule) => rule.run(req)));
      
      // Validation xatolarini tekshirish
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location,
        }));
        
        return response.validationError(res, formattedErrors);
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Async validation wrapper
 * Catches async validation errors
 */
export const asyncValidate = (validations) => {
  return async (req, res, next) => {
    try {
      await Promise.all(validations.map((validation) => validation.run(req)));
      
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((err) => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
        }));

        return response.validationError(res, formattedErrors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Sanitize request body
 */
export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
};

/**
 * Sanitize query params
 */
export const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }
  next();
};

/**
 * File upload validation
 */
export const validateFileUpload = (options = {}) => {
  const {
    maxSize = 20 * 1024 * 1024, // 20 MB
    allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
  } = options;

  return (req, res, next) => {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files || [req.file];

    for (const file of files) {
      if (!file) continue;

      // Check file size
      if (file.size > maxSize) {
        return response.error(
          res,
          `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)} MB`,
          400
        );
      }

      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return response.error(
          res,
          `File type ${file.mimetype} is not allowed`,
          400
        );
      }
    }

    next();
  };
};