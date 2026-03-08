import prisma from '../../config/database.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';
import walletService from '../wallet/walletService.js';
import redis from '../../config/redis.js';
import { MINIMUM_FREQUENCY_MINUTES, MAX_IMPRESSIONS_PER_BOT_HOUR } from '../../config/constants.js';
import socketService from '../socket/socketService.js';

/**
 * Distribution Service
 * Handles ad distribution logic and delivery
 */
class DistributionService {
  /**
   * Select best ads for bot/user combination
   */
  async selectAdsForUser(botId, telegramUserId, userLanguageCode = null, limit = 2) {
    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        include: { owner: true }
      });

      if (!bot || bot.status !== 'ACTIVE' || bot.isPaused) {
        return [];
      }

      // Bot sozlamalari
      const allowedCategories = bot.allowedCategories || [];
      const blockedCategories = bot.blockedCategories || [];

      // Frequency cap: bu bot orqali bu userga oxirgi reklama qachon ko'rsatilgan
      const lastImpression = await prisma.impression.findFirst({
        where: { botId, telegramUserId },
        orderBy: { createdAt: 'desc' },
      });

      if (lastImpression) {
        const timeSince = Date.now() - lastImpression.createdAt.getTime();
        // Enforce absolute minimum gap regardless of bot's frequencyMinutes setting
        const effectiveMinutes = Math.max(bot.frequencyMinutes, MINIMUM_FREQUENCY_MINUTES);
        const minInterval = effectiveMinutes * 60 * 1000;
        if (timeSince < minInterval) {
          return []; // Hali erta
        }
      }

      // Per-bot hourly impression cap (anti-abuse)
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourlyCount = await prisma.impression.count({
        where: { botId, createdAt: { gte: hourAgo } },
      });
      if (hourlyCount >= MAX_IMPRESSIONS_PER_BOT_HOUR) {
        return [];
      }

      const where = {
        status: 'RUNNING',
        remainingBudget: { gt: 0 },
      };

      // postFilter sozlamasi
      if (bot.postFilter === 'not_mine' && bot.ownerId) {
        where.advertiserId = { not: bot.ownerId };
      } else if (bot.postFilter === 'only_mine' && bot.ownerId) {
        where.advertiserId = bot.ownerId;
      }

      const ads = await prisma.ad.findMany({
        where,
        include: { advertiser: true },
        orderBy: [
          { finalCpm: 'desc' },
          { deliveredImpressions: 'asc' },
          { createdAt: 'asc' },
        ],
        take: 50,
      });

      const selectedAds = [];
      for (const ad of ads) {
        // deliveredImpressions < targetImpressions tekshiruvi
        if (ad.deliveredImpressions >= ad.targetImpressions) {
          continue;
        }

        // Excluded userlar
        const excludedUsers = ad.excludedUserIds ? JSON.parse(ad.excludedUserIds) : [];
        if (excludedUsers.includes(telegramUserId)) {
          continue;
        }

        // Kategoriya filtri
        const targeting = typeof ad.targeting === 'string' ? JSON.parse(ad.targeting) : (ad.targeting || {});
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

        // Language filtri: reklama muayyan tillarga mo'ljallangan bo'lsa
        const adLanguages = targeting.languages || [];
        
        if (adLanguages.length > 0) {
          if (!userLanguageCode) {
            continue; // Til noma'lum bo'lsa, maqsadli reklamani ko'rsatmaymiz
          }
          const normalizedUserLang = userLanguageCode.split('-')[0].toLowerCase();
          if (!adLanguages.some(lang => lang.toLowerCase() === normalizedUserLang)) {
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

        selectedAds.push(ad);
        if (selectedAds.length >= limit) break;
      }

      return selectedAds;
    } catch (error) {
      logger.error('Select ads for user failed:', error);
      return [];
    }
  }

  /**
   * Deliver ads to user
   */
  async deliverAd(botId, telegramUserId, chatId, userLanguageCode = null, userInfo = {}) {
    try {
      // Select best ad for user (limit back to 1 as requested)
      const ads = await this.selectAdsForUser(botId, telegramUserId, userLanguageCode, 1);

      if (!ads || ads.length === 0) {
        return { success: false, code: 0 }; // No ads available
      }

      // Get bot
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      // Decrypt bot token
      const botToken = encryption.decrypt(bot.tokenEncrypted);
      let successCount = 0;

      for (const ad of ads) {
        try {
          // Prepare message
          const message = await this.prepareAdMessage(ad, botId, telegramUserId);
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
              reply_markup: message.replyMarkup || undefined,
            });
          }

          // Record impression
          await this.recordImpression(ad.id, botId, telegramUserId, sentMessage.message_id, userInfo, userLanguageCode, botToken);
          
          socketService.terminalLog(`Ad delivered: ${ad.title || ad.id} via @${bot.username} to ${telegramUserId}`, 'ad');
          successCount++;
        } catch (itemError) {
          logger.error(`Failed to deliver individual ad ${ad.id}:`, itemError.message);
          if (itemError.message === 'USER_BLOCKED_BOT') {
             return { success: false, code: 3 };
          }
        }
      }

      return { success: successCount > 0, code: successCount > 0 ? 1 : 5 };
    } catch (error) {
      logger.error('Deliver ads failed:', error);
      return { success: false, code: 6 };
    }
  }

  /**
   * Prepare ad message with tracking
   */
  async prepareAdMessage(ad, botId, telegramUserId = null) {
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

      if (!text) throw new Error('AD_TEXT_EMPTY');

      // Prepare buttons with tracking
      let replyMarkup = null;
      if (ad.buttons) {
        let buttons = ad.buttons;

        // Ensure buttons is an array even if stored as string
        if (typeof buttons === 'string') {
          try {
            buttons = JSON.parse(buttons);
          } catch (e) {
            buttons = [];
          }
        }

        // Enable tracking if ad has it enabled
        const processedButtons = ad.trackingEnabled && telegramUserId
          ? tracking.wrapButtonsWithTracking(buttons, { adId: ad.id, botId }, telegramUserId)
          : buttons;

        if (Array.isArray(processedButtons)) {
          replyMarkup = {
            inline_keyboard: [
              processedButtons.map(btn => {
                const button = { text: btn.text, url: btn.url };
                // Map color to Telegram button style (primary/danger/success)
                const colorToStyle = {
                  green: 'success',
                  red: 'danger',
                  blue: 'primary',
                  purple: 'primary',
                  orange: 'primary',
                };
                const style = btn.style || colorToStyle[btn.color];
                if (style) button.style = style;
                if (btn.icon_custom_emoji_id) button.icon_custom_emoji_id = btn.icon_custom_emoji_id;
                return button;
              }),
            ],
          };
        }
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
  async recordImpression(adId, botId, telegramUserId, messageId, userInfo = {}, languageCode = null, botToken = null) {
    try {
      // Fetch ad with advertiser and bot with owner to check roles
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
        include: { advertiser: true }
      });

      const bot = await prisma.bot.findUnique({
        where: { id: botId },
        include: { owner: true }
      });

      if (!ad || !bot) return { success: false };

      // Skip impression + earnings for bot owner or superadmin (test/preview mode)
      const viewingUser = await prisma.user.findUnique({
        where: { telegramId: telegramUserId.toString() },
        select: { role: true, roles: true }
      });
      const isViewerSuperAdmin = viewingUser?.role === 'SUPER_ADMIN' || viewingUser?.roles?.includes('SUPER_ADMIN');
      const isViewerBotOwner = bot.owner.telegramId === telegramUserId.toString();

      if (isViewerBotOwner || isViewerSuperAdmin) {
        logger.info(`Preview mode: Skipping impression record for ${isViewerSuperAdmin ? 'superadmin' : 'bot owner'} (${telegramUserId})`);
        return { success: true, skipped: true };
      }

      // Check if advertiser is Superadmin (for free admin ads rule)
      const isAdvertiserSuperAdmin = ad.advertiser.role === 'SUPER_ADMIN' || ad.advertiser.roles?.includes('SUPER_ADMIN');

      // Calculate revenue (70/30 split)
      const cpm = parseFloat(ad.finalCpm) || 0;
      const revenuePerImpression = cpm / 1000;
      const platformFee = revenuePerImpression * 0.30; // 30% platform
      const botOwnerEarns = revenuePerImpression * 0.70; // 70% bot owner

      // Look up existing BotUser first to enrich user data (fallback for missing fields)
      let existingBotUser = null;
      try {
        existingBotUser = await prisma.botUser.findUnique({
          where: { botId_telegramUserId: { botId, telegramUserId } },
        });
      } catch (_) {}

      // If user info is still missing, fetch from Telegram API (best-effort, no throw)
      let tgInfo = null;
      const needsFetch = !userInfo.firstName && !userInfo.username && !existingBotUser?.firstName && !existingBotUser?.username;
      if (needsFetch && botToken) {
        tgInfo = await telegramAPI.getChat(botToken, telegramUserId).catch(() => null);
      }

      // Enrich: incoming data → BotUser cache → Telegram API fetch
      const rawCountry = userInfo.country || existingBotUser?.country || null;
      const finalCountry = rawCountry && rawCountry.length <= 10 ? rawCountry.toUpperCase() : null;
      const finalUsername = userInfo.username || existingBotUser?.username || tgInfo?.username || null;
      const finalFirstName = userInfo.firstName || existingBotUser?.firstName || tgInfo?.firstName || null;
      const finalLastName = userInfo.lastName || existingBotUser?.lastName || tgInfo?.lastName || null;
      const finalLangCode = languageCode || existingBotUser?.languageCode || null;
      const finalCity = userInfo.city || existingBotUser?.city || null;

      // Create impression with enriched data
      await prisma.impression.create({
        data: {
          adId,
          botId,
          telegramUserId,
          firstName: finalFirstName,
          lastName: finalLastName,
          username: finalUsername,
          country: finalCountry,
          city: finalCity,
          languageCode: finalLangCode,
          revenue: revenuePerImpression,
          platformFee,
          botOwnerEarns,
          messageId: messageId?.toString(),
        },
      });

      // Upsert BotUser with enriched data
      try {
        await prisma.botUser.upsert({
          where: { botId_telegramUserId: { botId, telegramUserId } },
          create: {
            botId,
            telegramUserId,
            firstName: finalFirstName,
            lastName: finalLastName,
            username: finalUsername,
            country: finalCountry,
            city: finalCity,
            languageCode: finalLangCode,
            lastSeenAt: new Date(),
          },
          update: {
            firstName: finalFirstName || undefined,
            lastName: finalLastName || undefined,
            username: finalUsername || undefined,
            country: finalCountry || undefined,
            city: finalCity || undefined,
            languageCode: finalLangCode || undefined,
            lastSeenAt: new Date(),
          },
        });
      } catch (userErr) {
        logger.error('Failed to update bot user:', userErr);
      }

      // If this is a new user for this bot, increment the bot's member count
      if (!existingBotUser) {
        try {
          await prisma.bot.update({
            where: { id: botId },
            data: {
              totalMembers: { increment: 1 },
              activeMembers: { increment: 1 },
            },
          });
          logger.info(`Bot @${bot.username} member count incremented (+1 new user: ${telegramUserId})`);
        } catch (botUpdateErr) {
          logger.error('Failed to increment bot member count:', botUpdateErr);
        }
      }

      // Update ad stats
      await prisma.ad.update({
        where: { id: adId },
        data: {
          deliveredImpressions: { increment: 1 },
          // Skip budget decrement for SuperAdmin ads (tekinga tushishi kerak)
          remainingBudget: isAdvertiserSuperAdmin ? undefined : { decrement: revenuePerImpression },
        },
      });

      // Update bot earnings (if any)
      if (botOwnerEarns > 0) {
        await prisma.bot.update({
          where: { id: botId },
          data: {
            totalEarnings: { increment: botOwnerEarns },
            pendingEarnings: { increment: botOwnerEarns },
          },
        });
      }

      // Check if ad completed
      const updatedAd = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (
        updatedAd.deliveredImpressions >= updatedAd.targetImpressions ||
        (!isAdvertiserSuperAdmin && updatedAd.remainingBudget <= 0)
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

      // Credit bot owner's wallet (if any)
      // Note: Bot owner gets paid even if it's an admin ad (to keep them happy)
      if (botOwnerEarns > 0) {
        try {
          if (bot && bot.ownerId) {
            await walletService.credit(bot.ownerId, botOwnerEarns, 'EARNINGS', adId);
          }
        } catch (creditErr) {
          logger.error('Failed to credit bot owner wallet:', creditErr);
        }
      }

      return { success: true, skipped: false };
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
