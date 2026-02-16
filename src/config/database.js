// src/config/databasejs
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

/**
 * Prisma Client Singleton
 * Prevents multiple instances in development (hot reload)
 */
class Database {
  constructor() {
    this.prisma = null;
  }

  getInstance() {
    if (!this.prisma) {
      this.prisma = new PrismaClient({
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
        errorFormat: 'minimal',
      });

      // Log queries in development
      if (process.env.NODE_ENV === 'development') {
        this.prisma.$on('query', (e) => {
          logger.debug(`Query: ${e.query}`);
          logger.debug(`Duration: ${e.duration}ms`);
        });
      }

      // Log errors
      this.prisma.$on('error', (e) => {
        logger.error('Prisma Error:', e);
      });

      // Graceful shutdown
      process.on('beforeExit', async () => {
        await this.disconnect();
      });

      logger.info('✅ Database connected');
    }

    return this.prisma;
  }

  async connect() {
    try {
      await this.getInstance().$connect();
      logger.info('✅ Database connection established');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      logger.info('❌ Database disconnected');
    }
  }

  async healthCheck() {
    try {
      await this.getInstance().$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

const database = new Database();
export default database.getInstance();
export { database };