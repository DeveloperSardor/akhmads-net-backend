import express from 'express';
import 'dotenv/config';

// Middleware imports
import { getCorsMiddleware, corsErrorHandler, logCorsConfig, validateOrigins } from './middleware/cors.js';
import { 
  helmetConfig, 
  compressionConfig, 
  sanitize, 
  hppProtection, 
  addSecurityHeaders 
} from './middleware/security.js';
import { requestLogger, detailedLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';

// Config imports
import { validateEnv } from './config/env.js';
import logger from './utils/logger.js';

// Route imports
import publicRoutes from './routes/public.routes.js';
import apiV1Routes from './routes/v1/index.js';

// Validate environment variables
validateEnv();

// Validate and log CORS configuration
validateOrigins();
logCorsConfig();

// Create Express app
const app = express();

// Trust proxy (for rate limiting, IP detection behind reverse proxy)
app.set('trust proxy', 1);

// ==================== SECURITY MIDDLEWARE ====================
app.use(helmetConfig);
app.use(getCorsMiddleware());
app.use(corsErrorHandler);
app.use(addSecurityHeaders);

// ==================== BODY PARSING ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== SECURITY PROTECTION ====================
app.use(sanitize);
app.use(hppProtection);
app.use(compressionConfig);

// ==================== LOGGING ====================
if (process.env.NODE_ENV === 'development') {
  app.use(detailedLogger);
}
app.use(requestLogger);

// ==================== HEALTH CHECK ====================
// ==================== HEALTH CHECK ====================
app.get('/health', async (req, res) => {
  try {
    // Check database
    const { database } = await import('./config/database.js');
    const dbHealthy = await database.healthCheck();

    // Check Redis - ✅ redis wrapper'dan healthCheck chaqiring
    const { redis } = await import('./config/redis.js');
    const redisHealthy = await redis.healthCheck();

    // Check Telegram bot
    const telegramBot = (await import('./config/telegram.js')).default;
    const telegramHealthy = await telegramBot.healthCheck();

    // Check S3
    const storageClient = (await import('./config/s3.js')).default;
    const storageHealthy = await storageClient.healthCheck();

    const allHealthy = dbHealthy && redisHealthy && telegramHealthy && storageHealthy;

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        telegram: telegramHealthy ? 'healthy' : 'unhealthy',
        storage: storageHealthy ? 'healthy' : 'unhealthy',
      },
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ==================== PUBLIC API ROUTES ====================
// Mount public routes (bot SendPost endpoint)
app.use('/api', publicRoutes);

// ==================== API ROUTES ====================
// Apply rate limiting to all API routes
app.use('/api', apiRateLimiter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'AKHMADS.NET API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    endpoints: {
      health: '/health',
      api: '/api/v1',
      docs: '/api/docs',
      botApi: '/api/ad/SendPost',
    },
    timestamp: new Date().toISOString(),
  });
});

// API documentation placeholder
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    version: 'v1',
    baseUrl: '/api/v1',
    endpoints: {
      auth: {
        'POST /api/v1/auth/login/initiate': 'Initiate Telegram login',
        'GET /api/v1/auth/login/status/:token': 'Check login status',
        'POST /api/v1/auth/refresh': 'Refresh access token',
        'POST /api/v1/auth/logout': 'Logout user',
        'GET /api/v1/auth/me': 'Get current user',
      },
      ads: {
        'POST /api/v1/ads': 'Create new ad',
        'GET /api/v1/ads': 'Get user ads',
        'GET /api/v1/ads/:id': 'Get ad details',
        'PUT /api/v1/ads/:id': 'Update ad',
        'POST /api/v1/ads/:id/submit': 'Submit ad for review',
        'DELETE /api/v1/ads/:id': 'Delete ad',
      },
      bots: {
        'POST /api/v1/bots': 'Register new bot',
        'GET /api/v1/bots': 'Get user bots',
        'GET /api/v1/bots/:id': 'Get bot details',
        'PUT /api/v1/bots/:id': 'Update bot settings',
        'DELETE /api/v1/bots/:id': 'Delete bot',
      },
      botApi: {
        'POST /api/ad/SendPost': 'Get ad for user (requires bot API key)',
      },
    },
    documentation: 'https://docs.akhmads.net',
  });
});

// API v1 routes
app.use('/api/v1', apiV1Routes);

// ==================== ERROR HANDLING ====================
// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ==================== PROCESS ERROR HANDLERS ====================
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, but log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  // Exit gracefully
  process.exit(1);
});

export default app;