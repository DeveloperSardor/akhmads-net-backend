import helmet from 'helmet';
// import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import compression from 'compression';

/**
 * Security Middleware Configuration
 */

/**
 * Helmet - Security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http:', 'blob:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true, 
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

/**
 * CORS Configuration
 */
// export const corsConfig = cors({
//   origin: (origin, callback) => {
//     const allowedOrigins = process.env.ALLOWED_ORIGINS
//       ? process.env.ALLOWED_ORIGINS.split(',')
//       : ['http://localhost:5173', 'http://localhost:3000'];

//     // Allow requests with no origin (mobile apps, Postman, etc.)
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
//   maxAge: 86400, // 24 hours
// });

/**
 * MongoDB Sanitization
 * Prevents NoSQL injection
 */
export const sanitize = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized ${key} in ${req.path}`);
  },
});

/**
 * HTTP Parameter Pollution Protection
 */
export const hppProtection = hpp({
  whitelist: [
    'page',
    'limit',
    'sort',
    'fields',
    'status',
    'category',
    'language',
  ],
});

/**
 * Response Compression
 */
export const compressionConfig = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
});

/**
 * Prevent clickjacking
 */
export const preventClickjacking = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

/**
 * Prevent MIME type sniffing
 */
export const preventMimeSniffing = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

/**
 * Add security headers manually
 */
export const addSecurityHeaders = (req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
};