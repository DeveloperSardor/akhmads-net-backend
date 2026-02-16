import telegramBot from '../../config/telegram.js';
import loginBotHandler from './loginBotHandler.js';
import logger from '../../utils/logger.js';

/**
 * Telegram Bot Service
 * Main bot logic orchestration
 */
class TelegramBotService {
  constructor() {
    this.bot = null;
  }

  /**
   * Initialize bot handlers
   */
  async initialize() {
    try {
      this.bot = telegramBot.getInstance();

      // Setup login handler
      loginBotHandler.setup(this.bot);

      logger.info('Telegram bot handlers initialized');
    } catch (error) {
      logger.error('Initialize bot handlers failed:', error);
      throw error;
    }
  }

  /**
   * Start bot (non-blocking)
   */
  async start() {
    try {
      await this.initialize();
      
      // ✅ Start bot in background (non-blocking)
      telegramBot.start().catch((error) => {
        logger.error('Telegram bot runtime error:', error);
      });
      
      // ✅ Give bot a moment to start, then return
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('✅ Telegram bot started (background)');
    } catch (error) {
      logger.error('Start bot failed:', error);
      throw error;
    }
  }

  /**
   * Stop bot
   */
  async stop() {
    try {
      await telegramBot.stop();
      logger.info('Telegram bot stopped');
    } catch (error) {
      logger.error('Stop bot failed:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const botInfo = await this.bot.getMe();
      return !!botInfo;
    } catch (error) {
      logger.error('Bot health check failed:', error);
      return false;
    }
  }
}

const telegramBotService = new TelegramBotService();
export default telegramBotService;