import jwtUtil from '../../utils/jwt.js';
import encryption from '../../utils/encryption.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { NotFoundError, AuthenticationError } from '../../utils/errors.js';

/**
 * Bot API Key Service
 * Manages bot API keys
 */
class BotApiKeyService {
  /**
   * Generate API key for bot
   */
  generateApiKey(bot) {
    const apiKey = jwtUtil.generateBotApiKey(bot);
    const apiKeyHash = encryption.hash(apiKey);

    return {
      apiKey,
      apiKeyHash,
    };
  }

  /**
   * Verify API key
   */
  async verifyApiKey(apiKey) {
    try {
      const decoded = jwtUtil.verifyBotApiKey(apiKey);

      // Get bot
      const bot = await prisma.bot.findUnique({
        where: { id: decoded.botId },
        include: { owner: true },
      });

      if (!bot) {
        throw new NotFoundError('Bot not found');
      }

      // Check if API key is revoked
      if (bot.apiKeyRevoked) {
        throw new AuthenticationError('API key has been revoked');
      }

      // Check bot status
      if (bot.status !== 'ACTIVE') {
        throw new AuthenticationError('Bot is not active');
      }

      // Check if paused
      if (bot.isPaused) {
        throw new AuthenticationError('Bot is paused');
      }

      // Check owner status
      if (bot.owner.isBanned || !bot.owner.isActive) {
        throw new AuthenticationError('Bot owner account is inactive');
      }

      return {
        valid: true,
        bot,
      };
    } catch (error) {
      logger.error('Verify API key failed:', error);
      throw error;
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(botId) {
    try {
      await prisma.bot.update({
        where: { id: botId },
        data: { apiKeyRevoked: true },
      });

      logger.info(`API key revoked for bot: ${botId}`);
      return true;
    } catch (error) {
      logger.error('Revoke API key failed:', error);
      throw error;
    }
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(botId, ownerId) {
    try {
      const bot = await prisma.bot.findFirst({
        where: { id: botId, ownerId },
      });

      if (!bot) {
        throw new NotFoundError('Bot not found');
      }

      const { apiKey, apiKeyHash } = this.generateApiKey(bot);

      await prisma.bot.update({
        where: { id: botId },
        data: {
          apiKey,
          apiKeyHash,
          apiKeyRevoked: false,
        },
      });

      logger.info(`API key regenerated for bot: ${botId}`);
      return apiKey;
    } catch (error) {
      logger.error('Regenerate API key failed:', error);
      throw error;
    }
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(botId) {
    try {
      await prisma.bot.update({
        where: { id: botId },
        data: { apiKeyLastUsed: new Date() },
      });
    } catch (error) {
      logger.error('Update last used failed:', error);
    }
  }
}

const botApiKeyService = new BotApiKeyService();
export default botApiKeyService;