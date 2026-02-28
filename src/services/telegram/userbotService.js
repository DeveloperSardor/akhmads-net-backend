// src/services/telegram/userbotService.js
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import logger from '../../utils/logger.js';

let _client = null;

async function getClient() {
  if (_client?.connected) return _client;

  const session = process.env.TELEGRAM_USER_SESSION || '';
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!session || !apiId || !apiHash) {
    throw new Error('Userbot env vars (TELEGRAM_USER_SESSION, TELEGRAM_API_ID, TELEGRAM_API_HASH) not configured');
  }

  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    { connectionRetries: 5, useWSS: false }
  );

  await client.connect();
  _client = client;
  logger.info('Userbot MTProto client connected');
  return client;
}

function buildButtons(replyMarkup) {
  if (!replyMarkup?.inline_keyboard?.length) return undefined;
  return replyMarkup.inline_keyboard.map(row =>
    row.map(btn => new Api.KeyboardButtonUrl({ text: btn.text, url: btn.url }))
  );
}

class UserbotService {
  isConfigured() {
    return !!(
      process.env.TELEGRAM_USER_SESSION &&
      process.env.TELEGRAM_API_ID &&
      process.env.TELEGRAM_API_HASH
    );
  }

  /** Returns true if the HTML content contains premium emoji tags */
  hasPremiumEmoji(htmlContent) {
    return typeof htmlContent === 'string' && htmlContent.includes('<tg-emoji');
  }

  /**
   * Send a text message via the userbot (MTProto).
   * chatId can be a numeric Telegram user ID.
   */
  async sendTextMessage(chatId, text, replyMarkup = null) {
    const client = await getClient();
    const buttons = buildButtons(replyMarkup);

    const result = await client.sendMessage(chatId, {
      message: text,
      parseMode: 'html',
      ...(buttons ? { buttons } : {}),
    });

    return result;
  }

  /**
   * Send a photo with caption via the userbot.
   * photoUrl can be a public URL or local file path.
   */
  async sendPhotoMessage(chatId, photoUrl, caption, replyMarkup = null) {
    const client = await getClient();
    const buttons = buildButtons(replyMarkup);

    const result = await client.sendFile(chatId, {
      file: photoUrl,
      caption: caption || '',
      parseMode: 'html',
      ...(buttons ? { buttons } : {}),
    });

    return result;
  }

  /**
   * Send a video with caption via the userbot.
   */
  async sendVideoMessage(chatId, videoUrl, caption, replyMarkup = null) {
    const client = await getClient();
    const buttons = buildButtons(replyMarkup);

    const result = await client.sendFile(chatId, {
      file: videoUrl,
      caption: caption || '',
      parseMode: 'html',
      ...(buttons ? { buttons } : {}),
    });

    return result;
  }
}

const userbotService = new UserbotService();
export default userbotService;
