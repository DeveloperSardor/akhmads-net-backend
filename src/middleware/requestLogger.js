import morgan from 'morgan';
import logger from '../utils/logger.js';

/**
 * Request Logging Middleware
 * Uses Morgan with Winston
 */

// Create stream for Morgan
const stream = {
  write: (message) => logger.http(message.trim()),
};

// Skip logging in test environment
const skip = () => process.env.NODE_ENV === 'test';

// Custom token for user ID
morgan.token('user-id', (req) => req.userId || 'anonymous');

// Custom token for response time in ms
morgan.token('response-time-ms', (req, res) => {
  if (!req._startAt || !res._startAt) {
    return '0';
  }

  const ms = (res._startAt[0] - req._startAt[0]) * 1e3 +
    (res._startAt[1] - req._startAt[1]) * 1e-6;

  return ms.toFixed(2);
});

// Development format (colorized, detailed)
const developmentFormat = ':method :url :status :response-time-ms ms - :user-id';

// Production format (JSON)
const productionFormat = JSON.stringify({
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time-ms ms',
  userId: ':user-id',
  ip: ':remote-addr',
  userAgent: ':user-agent',
});

/**
 * Request logger
 */
export const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  { stream, skip }
);

/**
 * Detailed logger for debugging
 */
export const detailedLogger = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Request Details:', {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      headers: req.headers,
      ip: req.ip,
    });
  }
  next();
};