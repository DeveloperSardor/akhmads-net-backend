import app from './src/app.js';
import prisma from './src/config/database.js';
import { connectRedis, disconnectRedis } from './src/config/redis.js';
import telegramBotService from './src/services/telegram/telegramBotService.js';
import storageClient from './src/config/s3.js';
import { initCronJobs } from './src/jobs/cronJobs.js';
import { seedInitialData } from './src/jobs/seedData.js';
import autoBotManager from './src/services/bot/autoBotManager.js';
import socketService from './src/services/socket/socketService.js';
import logger from './src/utils/logger.js';

const PORT = process.env.PORT || 3000;

let server;

/**
 * Start server
 */
async function startServer() {
  try {
    logger.info('🚀 Starting AKHMADS.NET Backend...');

    // 1. Connect to database
    try {
      await prisma.$connect();
      logger.info('✅ Database connected');
      
      // Seed initial data
      await seedInitialData();
    } catch (error) {
      logger.error('❌ Database connection failed:', error.message);
      logger.warn('⚠️ Continuing without database...');
    }

    // 2. Connect to Redis
    try {
      await connectRedis();
      logger.info('✅ Redis connected');
    } catch (error) {
      logger.error('❌ Redis connection failed:', error.message);
      logger.warn('⚠️ Continuing without Redis...');
    }

    // 3. Initialize Telegram bot
    try {
      await telegramBotService.start();
      logger.info('✅ Telegram bot started');
    } catch (error) {
      logger.warn('⚠️ Telegram bot failed to start:', error.message);
      // Don't stop server if bot fails
    }

    // 4. Initialize S3
    try {
      await storageClient.healthCheck();
      logger.info('✅ S3 client initialized');
    } catch (error) {
      logger.warn('⚠️ S3 client failed:', error.message);
      // Don't stop server if S3 fails
    }

    // 5. Initialize Cron Jobs
    try {
      initCronJobs();
    } catch (error) {
      logger.warn('⚠️ Cron jobs failed to initialize:', error.message);
    }
    
    // 6. Initialize Auto Bot Manager
    try {
      await autoBotManager.init();
      logger.info('✅ Auto Bot Manager initialized');
    } catch (error) {
      logger.error('❌ Auto Bot Manager failed to initialize:', error.message);
    }

    // 6. Start HTTP server - THIS IS CRITICAL!
    server = app.listen(PORT, '0.0.0.0', () => {
      // 7. Initialize Socket.io after server started
      socketService.init(server);

      logger.info(`
╔════════════════════════════════════════╗
║   🚀 AKHMADS.NET API Server Started   ║
║                                        ║
║   Port: ${PORT}                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   Local: http://localhost:${PORT}        ║
║   Network: http://0.0.0.0:${PORT}        ║
║                                        ║
║   Health: http://localhost:${PORT}/health ║
║   API: http://localhost:${PORT}/api/v1   ║
╚════════════════════════════════════════╝
      `);
      
      logger.info('✅ Server is ready to accept connections!');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`);
        logger.info('💡 Run: lsof -ti:3000 | xargs kill');
      } else {
        logger.error('❌ Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Stop Telegram bot
        try {
          await telegramBotService.stop();
          logger.info('Telegram bot stopped');
        } catch (error) {
          logger.warn('Telegram bot stop error:', error.message);
        }

        // Stop Auto Bot Manager
        try {
          await autoBotManager.stopAll();
          logger.info('Auto Bot Manager stopped');
        } catch (error) {
          logger.warn('Auto Bot Manager stop error:', error.message);
        }

        // Disconnect database
        await prisma.$disconnect();
        logger.info('Database disconnected');

        // Disconnect Redis
        await disconnectRedis();
        logger.info('Redis disconnected');

        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('⚠️ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  logger.error('Stack:', error.stack);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't shut down the whole server for unhandled rejections in production
  // as it might be a single bot error or intermittent issue.
  if (process.env.NODE_ENV !== 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

// Start server
startServer();