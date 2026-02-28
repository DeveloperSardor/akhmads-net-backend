// src/services/distribution/distributionService.js
import prisma from '../../config/database.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';
import walletService from '../wallet/walletService.js';
import userbotService from '../telegram/userbotService.js';

/**
 * Distribution Service
 * Handles ad distribution logic and delivery
 */
class DistributionService {
  /**
   * Select best ad for bot/user combination
   */
  async selectAdForUser(botId, telegramUserId, userLanguageCode = null) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot || bot.status !== 'ACTIVE' || bot.isPaused) {
        return null;
      }

      // Bot sozlamalari (Json? fieldlar Prisma tomonidan avtomatik parse qilinadi)
      const allowedCategories = bot.allowedCategories || [];
      const blockedCategories = bot.blockedCategories || [];

      // Frequency cap: bu bot orqali bu userga oxirgi reklama qachon ko'rsatilgan
      const lastImpression = await prisma.impression.findFirst({
        where: { botId, telegramUserId },
        orderBy: { createdAt: 'desc' },
      });

      if (lastImpression) {
        const timeSince = Date.now() - lastImpression.createdAt.getTime();
        const minInterval = bot.frequencyMinutes * 60 * 1000;
        if (timeSince < minInterval) {
          return null; // Hali erta
        }
      }

      // Asosiy query — deliveredImpressions < targetImpressions ni Prisma field
      // comparison qilib bo'lmaydi, shuning uchun loop ichida tekshiramiz
      const where = {
        status: 'RUNNING',
        remainingBudget: { gt: 0 },
      };

      // postFilter sozlamasi
      if (bot.postFilter === 'not_mine') {
        where.advertiserId = { not: bot.ownerId };
      } else if (bot.postFilter === 'only_mine') {
        where.advertiserId = bot.ownerId;
      }

      // Reklamalarni olish:
      // - finalCpm bo'yicha (cpmBid emas, chunki default 0 bo'lishi mumkin)
      // - Teng CPM'larda deliveredImpressions ASC: kamroq ko'rsatilgan reklama avval chiqadi (fair rotation)
      const ads = await prisma.ad.findMany({
        where,
        orderBy: [
          { finalCpm: 'desc' },
          { deliveredImpressions: 'asc' },
          { createdAt: 'asc' },
        ],
        take: 50,
      });

      for (const ad of ads) {
        // deliveredImpressions < targetImpressions tekshiruvi
        if (ad.deliveredImpressions >= ad.targetImpressions) {
          continue;
        }

        // Excluded userlar
        const excludedUsers = ad.excludedUserIds || [];
        if (excludedUsers.includes(telegramUserId)) {
          continue;
        }

        // Kategoriya filtri
        const targeting = ad.targeting || {};
        const adCategories = targeting.categories || [];

        // Bot faqat muayyan kategoriyalarga ruxsat bergan bo'lsa
        if (allowedCategories.length > 0) {
          const hasAllowedCategory = adCategories.some(cat =>
            allowedCategories.includes(cat)
          );
          if (!hasAllowedCategory) continue;
        }

        // Bot ba'zi kategoriyalarni bloklagan bo'lsa
        if (blockedCategories.length > 0) {
          const hasBlockedCategory = adCategories.some(cat =>
            blockedCategories.includes(cat)
          );
          if (hasBlockedCategory) continue;
        }

        // Language filtri: reklama muayyan tillarga mo'ljallangan bo'lsa,
        // faqat shu tildagi userlarga ko'rsatiladi.
        // LanguageCode yuborilmagan bo'lsa (eski botlar) — o'tkazib yuboriladi.
        const adLanguages = targeting.languages || [];
        if (adLanguages.length > 0 && userLanguageCode) {
          if (!adLanguages.includes(userLanguageCode)) {
            continue;
          }
        }

        // Muayyan botlarga mo'ljallangan reklama tekshiruvi
        const specificBotIds = ad.specificBotIds || [];
        if (specificBotIds.length > 0 && !specificBotIds.includes(botId)) {
          continue;
        }

        // Unique frequency: bu userga bu reklama ilgari ko'rsatilganmi
        if (targeting.frequency === 'unique') {
          const alreadyShown = await prisma.impression.findFirst({
            where: { adId: ad.id, telegramUserId },
          });
          if (alreadyShown) continue;
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
  async deliverAd(botId, telegramUserId, chatId, userLanguageCode = null) {
    try {
      // Select ad
      const ad = await this.selectAdForUser(botId, telegramUserId, userLanguageCode);

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

        // Use userbot (MTProto) when ad contains premium emoji so they render correctly
        const hasPremiumEmoji =
          userbotService.isConfigured() &&
          userbotService.hasPremiumEmoji(message.text);

        if (hasPremiumEmoji) {
          try {
            const numericChatId = parseInt(chatId, 10);
            if (ad.contentType === 'MEDIA' && ad.mediaUrl) {
              if (ad.mediaType?.startsWith('image')) {
                await userbotService.sendPhotoMessage(
                  numericChatId,
                  ad.mediaUrl,
                  message.text,
                  message.replyMarkup
                );
              } else if (ad.mediaType?.startsWith('video')) {
                await userbotService.sendVideoMessage(
                  numericChatId,
                  ad.mediaUrl,
                  message.text,
                  message.replyMarkup
                );
              }
            } else {
              await userbotService.sendTextMessage(
                numericChatId,
                message.text,
                message.replyMarkup
              );
            }
            // Impression without messageId (userbot messages don't return bot message_id)
            await this.recordImpression(ad.id, botId, telegramUserId, null);
            return { success: true, code: 1 };
          } catch (userbotError) {
            logger.warn('Userbot send failed, falling back to bot API:', userbotError.message);
            // Fall through to regular bot API delivery below
          }
        }

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
          await walletService.credit(bot.ownerId, botOwnerEarns, 'EARNINGS', adId);
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