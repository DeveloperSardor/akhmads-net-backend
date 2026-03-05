import nodeCron from 'node-cron';
import botStatsService from '../services/bot/botStatsService.js';
import broadcastService from '../services/admin/broadcastService.js';
import prisma from '../config/database.js';
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

  // 3. Process Scheduled Broadcasts
  // Every minute
  nodeCron.schedule('* * * * *', async () => {
    try {
      const pendingBroadcasts = await prisma.broadcast.findMany({
        where: {
          status: 'APPROVED',
          scheduledAt: { lte: new Date() },
          startedAt: null
        }
      });

      if (pendingBroadcasts.length > 0) {
        logger.info(`⏰ Starting ${pendingBroadcasts.length} scheduled broadcasts...`);
        for (const b of pendingBroadcasts) {
          broadcastService.processBroadcast(b.id).catch(err => {
            logger.error(`Scheduled broadcast ${b.id} fatal error:`, err);
          });
        }
      }
    } catch (error) {
       logger.error('❌ Scheduled broadcast cron failed:', error);
    }
  });

  // 4. Finalize PDP Broadcasts and send reports
  // Every 4 hours
  nodeCron.schedule('0 */4 * * *', async () => {
    try {
      // Find PDP broadcasts completed > 48h ago but not yet reported
      // (Using a custom property or checking for recent click activity)
      // Actually the user wants 48h report.
      const threshold = new Date();
      threshold.setHours(threshold.getHours() - 48);

      const toReport = await prisma.broadcast.findMany({
        where: {
          type: 'PDP',
          status: 'COMPLETED',
          completedAt: { lte: threshold },
          // We could add a field 'reported' but for now we'll just log
        }
      });

      for (const b of toReport) {
        logger.info(`Generating 48h report for PDP broadcast ${b.id}`);
        // TODO: Generate and send report
      }

    } catch (error) {
      logger.error('❌ Broadcast report cron failed:', error);
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
