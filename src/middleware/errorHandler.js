import logger from '../utils/logger.js';
import response from '../utils/response.js';
import { AppError } from '../utils/errors.js';

/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent responses
 */

/**
 * Error handler
 */
export const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.userId,
  });

  // Operational errors (known errors)
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors || null,
      timestamp: new Date().toISOString(),
    });
  }

  // Prisma errors
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, res);
  }

  // Validation errors (express-validator)
  if (err.array && typeof err.array === 'function') {
    return response.validationError(res, err.array());
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return response.unauthorized(res, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return response.unauthorized(res, 'Token expired');
  }

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    return handleMulterError(err, res);
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return response.forbidden(res, 'CORS policy violation');
  } 

  // Default to 500 server error
  if (process.env.NODE_ENV === 'production') {
    return response.serverError(res, 'Something went wrong');
  } else {
    return res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Handle Prisma errors
 */
const handlePrismaError = (err, res) => {
  switch (err.code) {
    case 'P2002': // Unique constraint violation
      return response.error(
        res,
        `A record with this ${err.meta?.target?.[0] || 'value'} already exists`,
        409
      );

    case 'P2025': // Record not found
      return response.notFound(res, 'Record not found');

    case 'P2003': // Foreign key constraint violation
      return response.error(res, 'Invalid reference to related record', 400);

    case 'P2014': // Invalid relation
      return response.error(res, 'Invalid relation constraint', 400);

    default:
      logger.error('Unhandled Prisma error:', err);
      return response.serverError(res, 'Database error occurred');
  }
};

/**
 * Handle Multer errors (file upload)
 */
const handleMulterError = (err, res) => {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return response.error(res, 'File size exceeds maximum allowed size', 400);

    case 'LIMIT_FILE_COUNT':
      return response.error(res, 'Too many files uploaded', 400);

    case 'LIMIT_UNEXPECTED_FILE':
      return response.error(res, 'Unexpected file field', 400);

    default:
      return response.error(res, 'File upload error', 400);
  }
};

/**
 * 404 Not Found Handler
 */
export const notFoundHandler = (req, res) => {
  response.notFound(res, `Route ${req.method} ${req.path} not found`);
};

/**
 * Async error wrapper
 * Catches async errors in route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 