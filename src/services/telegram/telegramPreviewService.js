// src/services/telegram/telegramPreviewService.js
import { Bot, InputFile } from 'grammy';
import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Telegram Preview Service
 * Send real preview messages to Telegram
 */
class TelegramPreviewService {
  /**
   * Send ad preview to user's Telegram
   */
  async sendAdPreview(userId, adData) {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.telegramId) {
        throw new ValidationError('User not found or Telegram not linked');
      }

      // Use platform bot
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        throw new Error('Telegram bot token not configured');
      }

      const bot = new Bot(botToken);

      // Prepare message
      const { text, mediaUrl, buttons } = adData;

      // Prepare inline keyboard
      let replyMarkup = undefined;
      if (buttons && buttons.length > 0) {
        const keyboard = buttons.map(btn => [{
          text: btn.text,
          url: btn.url,
        }]);

        replyMarkup = {
          inline_keyboard: keyboard,
        };
      }

      // Send message
      let sentMessage;

      if (mediaUrl) {
        // Local URL bo'lsa (localhost/127.0.0.1) - buffer sifatida yuborish
        const isLocalUrl = mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1');
        let photoSource;

        if (isLocalUrl) {
          const response = await fetch(mediaUrl);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filename = mediaUrl.split('/').pop() || 'image.jpg';
          photoSource = new InputFile(buffer, filename);
        } else {
          photoSource = mediaUrl;
        }

        sentMessage = await bot.api.sendPhoto(user.telegramId, photoSource, {
          caption: `🧪 PREVIEW\n\n${text}`,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else {
        // Send text only
        sentMessage = await bot.api.sendMessage(user.telegramId, `🧪 PREVIEW\n\n${text}`, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }

      logger.info(`✅ Preview sent to ${user.telegramId}`);

      return {
        success: true,
        messageId: sentMessage.message_id,
        chatId: sentMessage.chat.id,
      };
    } catch (error) {
      logger.error('Send ad preview failed:', error);

      // Better error messages
      if (error.message?.includes('bot was blocked')) {
        throw new ValidationError('You have blocked the bot. Please unblock it first.');
      }

      if (error.message?.includes('user not found')) {
        throw new ValidationError('Telegram user not found');
      }

      throw error;
    }
  }

  /**
   * Send test ad via specific bot
   */
  async sendTestAdViaBot(botId, userId, adData) {
    try {
      // Get bot
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) {
        throw new ValidationError('Bot not found');
      }

      // Decrypt bot token
      const encryption = require('../../utils/encryption.js').default;
      const decryptedToken = encryption.decrypt(bot.tokenEncrypted);

      const telegramBot = new Bot(decryptedToken);

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.telegramId) {
        throw new ValidationError('User not found');
      }

      // Prepare message
      const { text, mediaUrl, buttons } = adData;

      let replyMarkup = undefined;
      if (buttons && buttons.length > 0) {
        const keyboard = buttons.map(btn => [{
          text: btn.text,
          url: btn.url,
        }]);

        replyMarkup = {
          inline_keyboard: keyboard,
        };
      }

      // Send
      let sentMessage;

      if (mediaUrl) {
        const isLocalUrl = mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1');
        let photoSource;

        if (isLocalUrl) {
          const response = await fetch(mediaUrl);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filename = mediaUrl.split('/').pop() || 'image.jpg';
          photoSource = new InputFile(buffer, filename);
        } else {
          photoSource = mediaUrl;
        }

        sentMessage = await telegramBot.api.sendPhoto(user.telegramId, photoSource, {
          caption: `🧪 TEST AD\n\n${text}`,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } else {
        sentMessage = await telegramBot.api.sendMessage(user.telegramId, `🧪 TEST AD\n\n${text}`, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }

      logger.info(`✅ Test ad sent via bot ${botId} to ${user.telegramId}`);

      return {
        success: true,
        messageId: sentMessage.message_id,
      };
    } catch (error) {
      logger.error('Send test ad via bot failed:', error);
      throw error;
    }
  }

  /**
   * Delete preview message
   */
  async deletePreviewMessage(userId, messageId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.telegramId) {
        return;
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const bot = new Bot(botToken);

      await bot.api.deleteMessage(user.telegramId, messageId);

      logger.info(`🗑️ Preview message deleted: ${messageId}`);
    } catch (error) {
      logger.error('Delete preview message failed:', error);
      // Don't throw - deletion errors shouldn't break flow
    }
  }
}

const telegramPreviewService = new TelegramPreviewService();
export default telegramPreviewService;