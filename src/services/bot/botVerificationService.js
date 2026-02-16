import telegramAPI from '../../utils/telegram-api.js';
import logger from '../../utils/logger.js';
import { ExternalServiceError } from '../../utils/errors.js';

/**
 * Bot Verification Service
 * Verifies bot tokens with Telegram
 */
class BotVerificationService {
  /**
   * Verify bot token
   */
  async verifyToken(token) {
    try {
      const botInfo = await telegramAPI.getMe(token);

      return {
        isValid: true,
        botInfo: {
          telegramBotId: botInfo.id.toString(),
          username: botInfo.username,
          firstName: botInfo.first_name,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries,
        },
      };
    } catch (error) {
      logger.error('Bot token verification failed:', error);
      return {
        isValid: false,
        error: 'Invalid bot token',
      };
    }
  }

  /**
   * Check bot permissions
   */
  async checkBotPermissions(token, chatId) {
    try {
      const memberCount = await telegramAPI.getChatMemberCount(token, chatId);
      return {
        hasAccess: true,
        memberCount,
      };
    } catch (error) {
      logger.error('Check bot permissions failed:', error);
      return {
        hasAccess: false,
        memberCount: 0,
      };
    }
  }

  /**
   * Validate bot for monetization
   */
  async validateForMonetization(token) {
    try {
      const botInfo = await this.verifyToken(token);

      if (!botInfo.isValid) {
        return {
          eligible: false,
          reasons: ['Invalid bot token'],
        };
      }

      const reasons = [];

      // Check if bot can join groups (optional requirement)
      if (!botInfo.botInfo.canJoinGroups) {
        reasons.push('Bot cannot join groups');
      }

      return {
        eligible: reasons.length === 0,
        reasons,
        botInfo: botInfo.botInfo,
      };
    } catch (error) {
      logger.error('Validate for monetization failed:', error);
      return {
        eligible: false,
        reasons: ['Verification failed'],
      };
    }
  }
}

const botVerificationService = new BotVerificationService();
export default botVerificationService;