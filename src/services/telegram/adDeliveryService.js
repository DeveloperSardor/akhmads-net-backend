import telegramAPI from '../../utils/telegram-api.js';
import encryption from '../../utils/encryption.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';

/**
 * Ad Delivery Service
 * Sends ads via Telegram Bot API
 */
class AdDeliveryService {
  /**
   * Prepare ad message
   */
  prepareMessage(ad, botId) {
    let text = ad.text;
    let parseMode = 'HTML';

    if (ad.contentType === 'MARKDOWN') {
      parseMode = 'Markdown';
      text = ad.markdownContent;
    } else if (ad.contentType === 'HTML') {
      text = ad.htmlContent;
    }

    // Prepare buttons with tracking
    let replyMarkup = null;
    if (ad.buttons) {
      const buttons = JSON.parse(ad.buttons);
      const processedButtons = ad.trackingEnabled 
        ? tracking.wrapButtonsWithTracking(buttons, ad.id, botId)
        : buttons;

      replyMarkup = {
        inline_keyboard: [
          processedButtons.map(btn => {
            // Map color names to Telegram styles
            let style = btn.style;
            if (btn.color === 'green') style = 'success';
            if (btn.color === 'red') style = 'danger';
            if (btn.color === 'blue') style = 'primary';
            // Default to primary for other colors since TG only supports 3 styles + default
            if (!style && (btn.color === 'purple' || btn.color === 'orange')) style = 'primary';

            return {
              text: btn.text,
              url: btn.url,
              style: style,
              icon_custom_emoji_id: btn.icon_custom_emoji_id,
            };
          }),
        ],
      };
    }

    return { text, parseMode, replyMarkup };
  }

  /**
   * Send ad to user
   */
  async sendAd(bot, ad, chatId) {
    try {
      const botToken = encryption.decrypt(bot.tokenEncrypted);
      const message = this.prepareMessage(ad, bot.id);

      let sentMessage;

      if (ad.contentType === 'MEDIA' && ad.mediaUrl) {
        if (ad.mediaType?.startsWith('image')) {
          sentMessage = await telegramAPI.sendPhoto(botToken, {
            chat_id: chatId,
            photo: ad.mediaUrl,
            caption: message.text,
            parse_mode: message.parseMode,
            reply_markup: message.replyMarkup,
          });
        } else if (ad.mediaType?.startsWith('video')) {
          sentMessage = await telegramAPI.sendVideo(botToken, {
            chat_id: chatId,
            video: ad.mediaUrl,
            caption: message.text,
            parse_mode: message.parseMode,
            reply_markup: message.replyMarkup,
          });
        }
      } else if (ad.contentType === 'POLL' && ad.poll) {
        const poll = JSON.parse(ad.poll);
        sentMessage = await telegramAPI.sendPoll(botToken, {
          chat_id: chatId,
          question: poll.question,
          options: poll.options,
        });
      } else {
        sentMessage = await telegramAPI.sendMessage(
          botToken,
          chatId,
          message.text,
          {
            parse_mode: message.parseMode,
            reply_markup: message.replyMarkup,
          }
        );
      }

      return sentMessage;
    } catch (error) {
      logger.error('Send ad failed:', error);
      throw error;
    }
  }
}

const adDeliveryService = new AdDeliveryService();
export default adDeliveryService;