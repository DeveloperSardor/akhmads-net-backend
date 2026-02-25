// src/services/telegram/telegramPreviewService.js
import { Bot, InputFile } from 'grammy';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import logger from '../../utils/logger.js';
import prisma from '../../config/database.js';
import { ValidationError } from '../../utils/errors.js';
import encryption from '../../utils/encryption.js';

// Userbot client (singleton)
let userbotClient = null;

const getUserbotClient = async () => {
  if (userbotClient && userbotClient.connected) return userbotClient;

  const session = process.env.TELEGRAM_USER_SESSION || '';
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    { connectionRetries: 5, useWSS: false }
  );

  await client.connect();
  userbotClient = client;
  return client;
};

class TelegramPreviewService {
  async sendAdPreview(userId, adData) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.telegramId) {
        throw new ValidationError('User not found or Telegram not linked');
      }

      const { text, mediaUrl, buttons } = adData;

      // Inline keyboard
      let buttons_markup = undefined;
      if (buttons && buttons.length > 0) {
        buttons_markup = buttons.map(btn => [{ text: btn.text, url: btn.url }]);
      }

      const client = await getUserbotClient();

      let sentMessage;

      if (mediaUrl) {
        // Fetch image as buffer
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        sentMessage = await client.sendFile(user.telegramId.toString(), {
          file: buffer,
          caption: `🧪 PREVIEW\n\n${text}`,
          parseMode: 'html',
          buttons: buttons_markup ? buttons_markup.map(row =>
            row.map(btn => client.buildReplyMarkup?.({}) || { text: btn.text, url: btn.url })
          ) : undefined,
          forceDocument: false,
          attributes: [],
        });
      } else {
        const { Api } = await import('telegram');
        sentMessage = await client.sendMessage(user.telegramId.toString(), {
          message: `🧪 PREVIEW\n\n${text}`,
          parseMode: 'html',
        });
      }

      logger.info(`✅ Preview sent to ${user.telegramId}`);

      return {
        success: true,
        messageId: sentMessage.id,
        chatId: user.telegramId,
      };
    } catch (error) {
      logger.error('Telegram preview yuborishda xato:', { message: error.message, stack: error.stack });

      if (error.message?.includes('bot was blocked')) {
        throw new ValidationError('Siz botni blokladingiz.');
      }

      throw new Error(`Telegram preview yuborishda xato: ${error.message}`);
    }
  }

  async sendTestAdViaBot(botId, userId, adData) {
    try {
      const bot = await prisma.bot.findUnique({ where: { id: botId } });
      if (!bot) throw new ValidationError('Bot not found');

      const decryptedToken = encryption.decrypt(bot.tokenEncrypted);
      const telegramBot = new Bot(decryptedToken);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.telegramId) throw new ValidationError('User not found');

      const { text, mediaUrl, buttons } = adData;

      let replyMarkup = undefined;
      if (buttons && buttons.length > 0) {
        replyMarkup = { inline_keyboard: buttons.map(btn => [{ text: btn.text, url: btn.url }]) };
      }

      let sentMessage;

      if (mediaUrl) {
        const isLocalUrl = mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1') || mediaUrl.includes('176.222.52.47');
        let photoSource;

        if (isLocalUrl) {
          const response = await fetch(mediaUrl);
          if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          photoSource = new InputFile(Buffer.from(arrayBuffer), 'image.jpg');
        } else {
          photoSource = mediaUrl;
        }

        sentMessage = await telegramBot.api.sendPhoto(user.telegramId, photoSource, {
          caption: `🧪 TEST AD\n\n${text}`,
          reply_markup: replyMarkup,
        });
      } else {
        sentMessage = await telegramBot.api.sendMessage(user.telegramId, `🧪 TEST AD\n\n${text}`, {
          reply_markup: replyMarkup,
        });
      }

      return { success: true, messageId: sentMessage.message_id };
    } catch (error) {
      logger.error('Send test ad via bot failed:', error);
      throw error;
    }
  }

  async deletePreviewMessage(userId, messageId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.telegramId) return;

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const bot = new Bot(botToken);
      await bot.api.deleteMessage(user.telegramId, messageId);
    } catch (error) {
      logger.error('Delete preview message failed:', error);
    }
  }
}

const telegramPreviewService = new TelegramPreviewService();
export default telegramPreviewService;