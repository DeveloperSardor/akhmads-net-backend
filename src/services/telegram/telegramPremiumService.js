// src/services/telegram/telegramPremiumService.js
import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';
import { Bot } from 'grammy';

/**
 * Telegram Premium Service
 * Check if user/bot owner has Telegram Premium
 */
class TelegramPremiumService {
  /**
   * Check if bot owner has Telegram Premium
   */
  async checkBotOwnerPremium(botId) {
    try {
      // Get bot from database
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        include: { owner: true },
      });

      if (!bot) {
        logger.warn(`Bot not found: ${botId}`);
        return false;
      }

      // Decrypt bot token
      const decryptedToken = this.decryptBotToken(bot.tokenEncrypted);
      
      if (!decryptedToken) {
        logger.warn(`Failed to decrypt bot token: ${botId}`);
        return false;
      }

      // Create Telegram Bot instance
      const telegramBot = new Bot(decryptedToken);

      try {
        // Get bot owner's chat info
        const chat = await telegramBot.api.getChat(bot.owner.telegramId);

        // Check if user has Premium
        const hasPremium = chat.is_premium === true;

        logger.info(`Bot owner ${bot.owner.telegramId} Premium: ${hasPremium}`);

        return hasPremium;
      } catch (error) {
        logger.error('Failed to check Premium status:', error);
        return false;
      }
    } catch (error) {
      logger.error('Check bot owner Premium failed:', error);
      return false;
    }
  }

  /**
   * Check if user has Telegram Premium
   */
  async checkUserPremium(userId) {
    try {
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.telegramId) {
        return false;
      }

      // Use platform bot to check
      const platformBotToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!platformBotToken) {
        logger.warn('Platform bot token not configured');
        return false;
      }

      const bot = new Bot(platformBotToken);

      try {
        const chat = await bot.api.getChat(user.telegramId);
        const hasPremium = chat.is_premium === true;

        logger.info(`User ${user.telegramId} Premium: ${hasPremium}`);

        return hasPremium;
      } catch (error) {
        logger.error('Failed to check user Premium:', error);
        return false;
      }
    } catch (error) {
      logger.error('Check user Premium failed:', error);
      return false;
    }
  }

  /**
   * Get user's custom emoji limit
   */
  async getCustomEmojiLimit(userId) {
    try {
      const hasPremium = await this.checkUserPremium(userId);
      
      // Premium users can use custom emojis
      // Regular users cannot
      return {
        hasPremium,
        canUseCustomEmojis: hasPremium,
        customEmojiLimit: hasPremium ? 100 : 0,
      };
    } catch (error) {
      logger.error('Get custom emoji limit failed:', error);
      return {
        hasPremium: false,
        canUseCustomEmojis: false,
        customEmojiLimit: 0,
      };
    }
  }

  /**
   * Decrypt bot token (implement based on your encryption method)
   */
  decryptBotToken(encryptedToken) {
    try {
      // TODO: Implement decryption based on your encryption.js
      // For now, assuming token is stored in plain text or use your encryption service
      const encryption = require('../../utils/encryption.js').default;
      return encryption.decrypt(encryptedToken);
    } catch (error) {
      logger.error('Decrypt bot token failed:', error);
      return null;
    }
  }
}

const telegramPremiumService = new TelegramPremiumService();
export default telegramPremiumService;