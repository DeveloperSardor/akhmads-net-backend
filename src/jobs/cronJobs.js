import nodeCron from 'node-cron';
import botStatsService from '../services/bot/botStatsService.js';
import logger from '../utils/logger.js';

/**
 * Initialize all cron jobs
 */
export const initCronJobs = () => {
  logger.info('⏰ Initializing periodic maintenance jobs...');

  // 1. Sync bot member counts from BotStat.io
  // Every 12 hours at minute 0 (0 0,12 * * *)
  nodeCron.schedule('0 0,12 * * *', async () => {
    logger.info('🔄 Starting scheduled bot member count sync...');
    try {
      await botStatsService.syncAllBots();
    } catch (error) {
      logger.error('❌ Scheduled bot sync failed:', error);
    }
  });

  // 2. Aggregate daily statistics
  // Every day at 00:05 AM
  nodeCron.schedule('5 0 * * *', async () => {
    logger.info('🔄 Starting daily stats aggregation...');
    // This could iterate through all bots or use a more efficient batch process
    // For now, let's keep it simple
    try {
      // Placeholder for future aggregation logic if needed beyond real-time
    } catch (error) {
       logger.error('❌ Daily stats aggregation failed:', error);
    }
  });

  logger.info('✅ Maintenance jobs scheduled successfully');

  // Trigger an immediate sync on startup after a small delay
  setTimeout(async () => {
    logger.info('🚀 Triggering initial startup bot member count sync...');
    try {
      await botStatsService.syncAllBots();
    } catch (error) {
      logger.error('❌ Startup bot sync failed:', error);
    }
  }, 5000); 
};
