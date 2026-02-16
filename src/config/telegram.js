import { Bot } from 'grammy';
import logger from '../utils/logger.js';

/**
 * Telegram Bot Configuration
 */
class TelegramBot {
  constructor() {
    this.bot = null;
    this.isRunning = false;
  }

  /**
   * Get bot instance
   */
  getInstance() {
    if (!this.bot) {
      const token = process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined');
      }

      this.bot = new Bot(token);

      // Error handling
      this.bot.catch((err) => {
        logger.error('Telegram bot error:', err);
      });

      logger.info('Telegram bot instance created');
    }

    return this.bot;
  }

  /**
   * Start bot (non-blocking)
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('Bot is already running');
        return;
      }

      this.bot = this.getInstance();

      // Get bot info
      const me = await this.bot.api.getMe();
      logger.info(`Bot started: @${me.username} (${me.first_name})`);

      // ✅ Start polling in background (don't await!)
      this.bot.start({
        onStart: (botInfo) => {
          logger.info(`Bot @${botInfo.username} is now running!`);
        },
      }).catch((error) => {
        logger.error('Bot polling error:', error);
        this.isRunning = false;
      });

      this.isRunning = true;
      
      // ✅ Give bot 500ms to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      logger.info('✅ Telegram bot launched successfully');
      
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Stop bot
   */
  async stop() {
    try {
      if (!this.isRunning || !this.bot) {
        return;
      }

      await this.bot.stop();
      this.isRunning = false;
      logger.info('Bot stopped');
    } catch (error) {
      logger.error('Failed to stop bot:', error);
      throw error;
    }
  }

  /**
   * Send message
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.api.sendMessage(chatId, text, options);
    } catch (error) {
      logger.error('Send message failed:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.bot) {
        return false;
      }

      await this.bot.api.getMe();
      return true;
    } catch (error) {
      logger.error('Bot health check failed:', error);
      return false;
    }
  }
}

const telegramBot = new TelegramBot();
export default telegramBot;