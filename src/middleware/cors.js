import cors from 'cors';
import logger from '../utils/logger.js';

/**
 * CORS Middleware Configuration
 * Handles Cross-Origin Resource Sharing with security
 */

/**
 * Parse allowed origins from environment
 */
const getAllowedOrigins = () => {
  const originsEnv = process.env.ALLOWED_ORIGINS || '';
  
  // Default origins for development
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
  ];

  if (!originsEnv) {
    return defaultOrigins;
  }

  const configuredOrigins = originsEnv.split(',').map(origin => origin.trim());
  
  // In production, only use configured origins
  if (process.env.NODE_ENV === 'production') {
    return configuredOrigins;
  }

  // In development, merge with defaults
  return [...new Set([...defaultOrigins, ...configuredOrigins])];
};

/**
 * CORS options
 */
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    }
  },

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-HTTP-Method-Override',
    'Accept',
    'Origin',
  ],

  // Exposed headers (accessible to client)
  exposedHeaders: [
    'X-Total-Count',
    'X-Page',
    'X-Per-Page',
    'X-Total-Pages',
    'Content-Range',
    'Content-Disposition',
  ],

  // Preflight cache duration (24 hours)
  maxAge: 86400,

  // Pass the CORS preflight response to the next handler
  preflightContinue: false,

  // Provide a successful status code for OPTIONS requests
  optionsSuccessStatus: 204,
};

/**
 * Main CORS middleware
 */
export const corsMiddleware = cors(corsOptions);

/**
 * CORS error handler
 */
export const corsErrorHandler = (err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    logger.error(`CORS Error: ${err.message}`, {
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
  next(err);
};

/**
 * Permissive CORS for webhooks
 * Payment providers need to send webhooks from various IPs
 */
export const webhookCors = cors({
  origin: true, // Allow all origins for webhooks
  credentials: false,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Signature', 'X-Merchant-Id'],
  optionsSuccessStatus: 204,
});

/**
 * Strict CORS for public API (bot SendPost endpoint)
 * Only allow requests with valid API key
 */
export const publicApiCors = cors({
  origin: (origin, callback) => {
    // Allow all origins but will be validated by API key
    callback(null, true);
  },
  credentials: false,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
  optionsSuccessStatus: 204,
});

/**
 * Admin panel CORS (stricter)
 */
export const adminCors = cors({
  origin: (origin, callback) => {
    const adminOrigins = process.env.ADMIN_ORIGINS
      ? process.env.ADMIN_ORIGINS.split(',').map(o => o.trim())
      : getAllowedOrigins();

    if (!origin || adminOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`Admin CORS blocked: ${origin}`);
      callback(new Error('Admin access denied'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
});

/**
 * Development CORS (permissive)
 * Only for development environment
 */
export const devCors = cors({
  origin: true, // Allow all
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: '*',
  exposedHeaders: '*',
  maxAge: 86400,
  optionsSuccessStatus: 204,
});

/**
 * Get CORS middleware based on environment
 */
export const getCorsMiddleware = () => {
  if (process.env.NODE_ENV === 'development') {
    logger.info('🌐 CORS: Development mode (permissive)');
    return devCors;
  }

  logger.info('🌐 CORS: Production mode (strict)');
  logger.info(`Allowed origins: ${getAllowedOrigins().join(', ')}`);
  return corsMiddleware;
};

/**
 * Log CORS configuration on startup
 */
export const logCorsConfig = () => {
  const allowedOrigins = getAllowedOrigins();
  
  logger.info('╔════════════════════════════════════════╗');
  logger.info('║       CORS Configuration              ║');
  logger.info('╠════════════════════════════════════════╣');
  logger.info(`║ Environment: ${process.env.NODE_ENV?.padEnd(23)} ║`);
  logger.info(`║ Allowed Origins: ${allowedOrigins.length.toString().padEnd(18)} ║`);
  logger.info('╠════════════════════════════════════════╣');
  
  allowedOrigins.forEach((origin, index) => {
    const num = (index + 1).toString().padStart(2, '0');
    logger.info(`║ ${num}. ${origin.padEnd(34)} ║`);
  });
  
  logger.info('╚════════════════════════════════════════╝');
};

/**
 * Validate origin format
 */
export const validateOrigins = () => {
  const origins = getAllowedOrigins();
  const invalidOrigins = [];

  origins.forEach((origin) => {
    try {
      new URL(origin);
    } catch (error) {
      invalidOrigins.push(origin);
    }
  });

  if (invalidOrigins.length > 0) {
    logger.error('❌ Invalid origins detected:');
    invalidOrigins.forEach((origin) => {
      logger.error(`   - ${origin}`);
    });
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid CORS origins in production');
    }
  }

  return invalidOrigins.length === 0;
};
