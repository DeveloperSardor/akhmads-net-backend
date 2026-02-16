import { PrismaClient } from '@prisma/client';
import { connectRedis, disconnectRedis, redis } from '../src/config/redis.js';

const prisma = new PrismaClient();

// Setup before all tests
beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
  
  // Connect to Redis
  await connectRedis();
  
  // Clear Redis
  await redis.flushdb();
});

// Cleanup after all tests
afterAll(async () => {
  await prisma.$disconnect();
  await disconnectRedis();
});

// Clear database between tests
beforeEach(async () => {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;
  
  for (const { tablename } of tables) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
    }
  }
});

export { prisma };