// src/services/distribution/distributionService.js
import prisma from '../../config/database.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';
import walletService from '../wallet/walletService.js';

/**
 * Distribution Service
 * Handles ad distribution logic and delivery
 */
class DistributionService {
  /**
   * Select best ad for bot/user combination
   */
  async selectAdForUser(botId, telegramUserId) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot || bot.status !== 'ACTIVE' || bot.isPaused) {
        return null;
      }

      // Parse bot settings
      const allowedCategories = bot.allowedCategories || [];
      const blockedCategories = bot.blockedCategories || [];

      // Build query
      const where = {
        status: 'RUNNING',
        remainingBudget: { gt: 0 },
        deliveredImpressions: { lt: prisma.ad.fields.targetImpressions },
      };

      // Category filter
      if (allowedCategories.length > 0) {
        where.targeting = {
          path: ['categories'],
          array_contains: allowedCategories,
        };
      }

      // Post filter
      if (bot.postFilter === 'not_mine') {
        where.advertiserId = { not: bot.ownerId };
      } else if (bot.postFilter === 'only_mine') {
        where.advertiserId = bot.ownerId;
      }

      // Check frequency cap
      const lastImpression = await prisma.impression.findFirst({
        where: {
          adId: where.id,
          botId,
          telegramUserId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastImpression) {
        const timeSince = Date.now() - lastImpression.createdAt.getTime();
        const minInterval = bot.frequencyMinutes * 60 * 1000;

        if (timeSince < minInterval) {
          return null; // Too soon
        }
      }

      // Get eligible ads
      const ads = await prisma.ad.findMany({
        where,
        orderBy: [
          { cpmBid: 'desc' }, // Higher bid = higher priority
          { createdAt: 'asc' }, // FIFO for same bid
        ],
        take: 10,
      });

      // Filter by excluded users
      for (const ad of ads) {
        const excludedUsers = ad.excludedUserIds || [];
        if (excludedUsers.includes(telegramUserId)) {
          continue;
        }

        // Check if already shown (unique frequency)
        const targeting = ad.targeting || {};
        if (targeting.frequency === 'unique') {
          const alreadyShown = await prisma.impression.findFirst({
            where: {
              adId: ad.id,
              telegramUserId,
            },
          });

          if (alreadyShown) {
            continue;
          }
        }

        return ad;
      }

      return null;
    } catch (error) {
      logger.error('Select ad for user failed:', error);
      return null;
    }
  }

  /**
   * Deliver ad to user
   */
  async deliverAd(botId, telegramUserId, chatId) {
    try {
      // Select ad
      const ad = await this.selectAdForUser(botId, telegramUserId);

      if (!ad) {
        return { success: false, code: 0 }; // No ads available
      }

      // Get bot
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      // Decrypt bot token
      const botToken = encryption.decrypt(bot.tokenEncrypted);

      // Prepare message
      const message = await this.prepareAdMessage(ad, botId);

      // Send via Telegram
      try {
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
          sentMessage = await telegramAPI.sendMessage(botToken, {
            chat_id: chatId,
            text: message.text,
            parse_mode: message.parseMode,
            reply_markup: message.replyMarkup
              ? JSON.stringify(message.replyMarkup)
              : undefined,
          });
        }

        // Record impression
        await this.recordImpression(ad.id, botId, telegramUserId, sentMessage.message_id);

        return { success: true, code: 1 };
      } catch (error) {
        if (error.message === 'USER_BLOCKED_BOT') {
          return { success: false, code: 3 };
        }
        if (error.message === 'RATE_LIMITED') {
          return { success: false, code: 4 };
        }

        logger.error('Telegram send error:', error);
        return { success: false, code: 5 };
      }
    } catch (error) {
      logger.error('Deliver ad failed:', error);
      return { success: false, code: 6 };
    }
  }

  /**
   * Prepare ad message with tracking
   */
  async prepareAdMessage(ad, botId) {
    try {
      let text = ad.text;

      // Parse mode
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
        const buttons = ad.buttons;
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

      return {
        text,
        parseMode,
        replyMarkup,
      };
    } catch (error) {
      logger.error('Prepare ad message failed:', error);
      throw error;
    }
  }

  /**
   * Record impression
   */
  async recordImpression(adId, botId, telegramUserId, messageId) {
    try {
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      // Calculate revenue (70/30 split)
      const revenuePerImpression = parseFloat(ad.finalCpm) / 1000;
      const platformFee = revenuePerImpression * 0.30; // 30% platform
      const botOwnerEarns = revenuePerImpression * 0.70; // 70% bot owner

      // Create impression
      await prisma.impression.create({
        data: {
          adId,
          botId,
          telegramUserId,
          revenue: revenuePerImpression,
          platformFee,
          botOwnerEarns,
          messageId: messageId?.toString(),
        },
      });

      // Update ad stats
      await prisma.ad.update({
        where: { id: adId },
        data: {
          deliveredImpressions: { increment: 1 },
          remainingBudget: { decrement: revenuePerImpression },
        },
      });

      // Update bot earnings
      await prisma.bot.update({
        where: { id: botId },
        data: {
          totalEarnings: { increment: botOwnerEarns },
          pendingEarnings: { increment: botOwnerEarns },
        },
      });

      // Check if ad completed
      const updatedAd = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (
        updatedAd.deliveredImpressions >= updatedAd.targetImpressions ||
        updatedAd.remainingBudget <= 0
      ) {
        await prisma.ad.update({
          where: { id: adId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        logger.info(`Ad completed: ${adId}`);
      }

      logger.info(`Impression recorded: ad=${adId}, bot=${botId}, user=${telegramUserId}`);

      // Credit bot owner's wallet
      try {
        const bot = await prisma.bot.findUnique({ where: { id: botId } });
        if (bot && bot.ownerId) {
          await walletService.credit(bot.ownerId, botOwnerEarns, 'AD_REVENUE', adId);
        }
      } catch (creditErr) {
        logger.error('Failed to credit bot owner wallet:', creditErr);
      }
    } catch (error) {
      logger.error('Record impression failed:', error);
      throw error;
    }
  }

  /**
   * Get running ads count
   */
  async getRunningAdsCount() {
    try {
      return await prisma.ad.count({
        where: { status: 'RUNNING' },
      });
    } catch (error) {
      logger.error('Get running ads count failed:', error);
      return 0;
    }
  }
}

const distributionService = new DistributionService();
export default distributionService;