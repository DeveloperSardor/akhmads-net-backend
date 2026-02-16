// src/servicees/ad/adService.js
import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import pricingCalculator from '../../utils/pricing.js';
import logger from '../../utils/logger.js';
import { NotFoundError, InsufficientFundsError, ValidationError } from '../../utils/errors.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';



/**
 * Ad Service
 * Handles ad creation, management, and lifecycle
 */
class AdService {
  /**
   * Calculate ad pricing
   */
  async calculatePricing(data) {
    try {
      // Get pricing tiers
      const tiers = await prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { impressions: 'asc' },
      });

      // Find appropriate tier
      const tier = pricingCalculator.findTier(tiers, data.impressions);

      // Get platform settings
      const platformFeeSettings = await prisma.platformSettings.findUnique({
        where: { key: 'platform_fee_percentage' },
      });

      const platformFeePercentage = parseFloat(platformFeeSettings?.value || '10');

      // Get promo code if provided
      let promoCode = null;
      if (data.promoCode) {
        promoCode = await prisma.promoCode.findFirst({
          where: {
            code: data.promoCode,
            isActive: true,
            expiresAt: { gte: new Date() },
          },
        });

        if (promoCode && promoCode.usedCount >= promoCode.maxUses) {
          promoCode = null;
        }
      }

      // Calculate pricing
      const pricing = pricingCalculator.calculateAdCost({
        tier,
        impressions: data.impressions,
        category: data.category,
        targeting: data.targeting || {},
        cpmBid: data.cpmBid || 0,
        platformFeePercentage,
        promoCode,
      });

      return {
        tier,
        pricing,
        promoCode,
      };
    } catch (error) {
      logger.error('Calculate pricing failed:', error);
      throw error;
    }
  }

  /**
   * Create new ad
   */
  async createAd(advertiserId, data) {
    try {
      // Calculate pricing
      const { tier, pricing, promoCode } = await this.calculatePricing({
        impressions: data.targetImpressions,
        category: data.category,
        targeting: data.targeting,
        cpmBid: data.cpmBid,
        promoCode: data.promoCode,
      });

      // Create ad
      const ad = await prisma.ad.create({
        data: {
          advertiserId,
          contentType: data.contentType,
          title: data.title,
          text: data.text,
          htmlContent: data.htmlContent,
          markdownContent: data.markdownContent,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          buttons: data.buttons ? JSON.stringify(data.buttons) : null,
          trackingEnabled: data.trackingEnabled !== false,
          poll: data.poll ? JSON.stringify(data.poll) : null,
          selectedTierId: tier.id,
          targetImpressions: data.targetImpressions,
          baseCpm: pricing.baseCPM,
          cpmBid: pricing.cpmBid,
          finalCpm: pricing.finalCPM,
          totalCost: pricing.totalCost,
          platformFee: pricing.platformFee,
          botOwnerRevenue: pricing.botOwnerRevenue,
          remainingBudget: pricing.totalCost,
          status: 'DRAFT',
          targeting: data.targeting ? JSON.stringify(data.targeting) : null,
          excludedUserIds: data.excludedUserIds ? JSON.stringify(data.excludedUserIds) : null,
          specificBotIds: data.specificBotIds ? JSON.stringify(data.specificBotIds) : null,
          promoCodeUsed: promoCode?.code,
          discount: pricing.discount,
        },
      });

      logger.info(`Ad created: ${ad.id}`);
      return ad;
    } catch (error) {
      logger.error('Create ad failed:', error);
      throw error;
    }
  }

  /**
   * Submit ad for moderation
   */
  async submitAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'DRAFT') {
        throw new ValidationError('Ad is not in draft status');
      }

      // Check wallet balance
      const wallet = await walletService.getWallet(advertiserId);
      if (wallet.available < ad.totalCost) {
        throw new InsufficientFundsError('Insufficient balance to submit ad');
      }

      // Reserve funds
      await walletService.reserve(advertiserId, ad.totalCost, ad.id);

      // Update ad status
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: { status: 'SUBMITTED' },
      });

      // Increment promo code usage
      if (ad.promoCodeUsed) {
        await prisma.promoCode.update({
          where: { code: ad.promoCodeUsed },
          data: { usedCount: { increment: 1 } },
        });
      }

      logger.info(`Ad submitted: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Submit ad failed:', error);
      throw error;
    }
  }

  /**
   * Get user's ads
   */
  async getUserAds(advertiserId, filters = {}) {
    try {
      const { status, limit = 20, offset = 0 } = filters;

      const where = { advertiserId };
      if (status) where.status = status;

      const ads = await prisma.ad.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.ad.count({ where });

      return { ads, total };
    } catch (error) {
      logger.error('Get user ads failed:', error);
      throw error;
    }
  }

  /**
   * Get ad by ID
   */
  async getAdById(adId) {
    try {
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
        include: {
          advertiser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      return ad;
    } catch (error) {
      logger.error('Get ad failed:', error);
      throw error;
    }
  }

  /**
   * Update ad (only in DRAFT status)
   */
  async updateAd(adId, advertiserId, data) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'DRAFT') {
        throw new ValidationError('Only draft ads can be edited');
      }

      // Recalculate pricing if impressions/targeting changed
      let pricing = null;
      if (data.targetImpressions || data.targeting || data.cpmBid) {
        const result = await this.calculatePricing({
          impressions: data.targetImpressions || ad.targetImpressions,
          category: ad.category,
          targeting: data.targeting || JSON.parse(ad.targeting || '{}'),
          cpmBid: data.cpmBid !== undefined ? data.cpmBid : ad.cpmBid,
        });
        pricing = result.pricing;
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          title: data.title,
          text: data.text,
          htmlContent: data.htmlContent,
          markdownContent: data.markdownContent,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          buttons: data.buttons ? JSON.stringify(data.buttons) : undefined,
          poll: data.poll ? JSON.stringify(data.poll) : undefined,
          targetImpressions: data.targetImpressions,
          cpmBid: pricing?.cpmBid,
          finalCpm: pricing?.finalCPM,
          totalCost: pricing?.totalCost,
          platformFee: pricing?.platformFee,
          botOwnerRevenue: pricing?.botOwnerRevenue,
          remainingBudget: pricing?.totalCost,
          targeting: data.targeting ? JSON.stringify(data.targeting) : undefined,
          excludedUserIds: data.excludedUserIds ? JSON.stringify(data.excludedUserIds) : undefined,
          specificBotIds: data.specificBotIds ? JSON.stringify(data.specificBotIds) : undefined,
        },
      });

      logger.info(`Ad updated: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Update ad failed:', error);
      throw error;
    }
  }

  /**
   * Pause ad
   */
  async pauseAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'RUNNING') {
        throw new ValidationError('Only running ads can be paused');
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: { status: 'PAUSED' },
      });

      logger.info(`Ad paused: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Pause ad failed:', error);
      throw error;
    }
  }

  /**
   * Resume ad
   */
  async resumeAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'PAUSED') {
        throw new ValidationError('Only paused ads can be resumed');
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: { status: 'RUNNING' },
      });

      logger.info(`Ad resumed: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Resume ad failed:', error);
      throw error;
    }
  }

  /**
   * Duplicate ad
   */
  async duplicateAd(adId, advertiserId) {
    try {
      const original = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!original) {
        throw new NotFoundError('Ad not found');
      }

      const duplicate = await prisma.ad.create({
        data: {
          advertiserId,
          contentType: original.contentType,
          title: `${original.title} (Copy)`,
          text: original.text,
          htmlContent: original.htmlContent,
          markdownContent: original.markdownContent,
          mediaUrl: original.mediaUrl,
          mediaType: original.mediaType,
          buttons: original.buttons,
          trackingEnabled: original.trackingEnabled,
          poll: original.poll,
          selectedTierId: original.selectedTierId,
          targetImpressions: original.targetImpressions,
          baseCpm: original.baseCpm,
          cpmBid: original.cpmBid,
          finalCpm: original.finalCpm,
          totalCost: original.totalCost,
          platformFee: original.platformFee,
          botOwnerRevenue: original.botOwnerRevenue,
          remainingBudget: original.totalCost,
          status: 'DRAFT',
          targeting: original.targeting,
          excludedUserIds: original.excludedUserIds,
          specificBotIds: original.specificBotIds,
        },
      });

      logger.info(`Ad duplicated: ${adId} -> ${duplicate.id}`);
      return duplicate;
    } catch (error) {
      logger.error('Duplicate ad failed:', error);
      throw error;
    }
  }

  /**
   * Save/unsave ad
   */
  async toggleSaveAd(adId, userId) {
    try {
      const existing = await prisma.savedAd.findUnique({
        where: {
          userId_adId: {
            userId,
            adId,
          },
        },
      });

      if (existing) {
        await prisma.savedAd.delete({
          where: { id: existing.id },
        });
        logger.info(`Ad unsaved: ${adId}`);
        return { saved: false };
      } else {
        await prisma.savedAd.create({
          data: { userId, adId },
        });
        logger.info(`Ad saved: ${adId}`);
        return { saved: true };
      }
    } catch (error) {
      logger.error('Toggle save ad failed:', error);
      throw error;
    }
  }

  /**
   * Delete ad
   */
  async deleteAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      // Can only delete DRAFT, REJECTED, or COMPLETED ads
      if (!['DRAFT', 'REJECTED', 'COMPLETED'].includes(ad.status)) {
        throw new ValidationError('Cannot delete active ad');
      }

      // If funds were reserved, release them
      if (['SUBMITTED', 'APPROVED'].includes(ad.status) && ad.remainingBudget > 0) {
        await walletService.releaseReserved(advertiserId, ad.remainingBudget);
      }

      await prisma.ad.delete({
        where: { id: adId },
      });

      logger.info(`Ad deleted: ${adId}`);
      return true;
    } catch (error) {
      logger.error('Delete ad failed:', error);
      throw error;
    }
  }

  /**
   * Get ad performance
   */
  async getAdPerformance(adId) {
    try {
      const ad = await this.getAdById(adId);

      // Get impressions breakdown by bot
      const impressionsByBot = await prisma.impression.groupBy({
        by: ['botId'],
        where: { adId },
        _count: { id: true },
        _sum: { revenue: true },
      });

      // Get bot details
      const botIds = impressionsByBot.map(i => i.botId);
      const bots = await prisma.bot.findMany({
        where: { id: { in: botIds } },
        select: { id: true, username: true, firstName: true },
      });

      const botsMap = Object.fromEntries(bots.map(b => [b.id, b]));

      const breakdown = impressionsByBot.map(item => ({
        bot: botsMap[item.botId],
        impressions: item._count.id,
        revenue: item._sum.revenue,
      }));

      // Get clicks
      const clicks = await prisma.clickEvent.count({
        where: { adId, clicked: true },
      });

      return {
        ad: {
          id: ad.id,
          title: ad.title,
          status: ad.status,
          targetImpressions: ad.targetImpressions,
          deliveredImpressions: ad.deliveredImpressions,
          clicks: ad.clicks,
          ctr: ad.ctr,
          totalCost: ad.totalCost,
          remainingBudget: ad.remainingBudget,
        },
        breakdown,
        totalClicks: clicks,
      };
    } catch (error) {
      logger.error('Get ad performance failed:', error);
      throw error;
    }
  }




  /**
 * Archive ad
 */
  async archiveAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (!['COMPLETED', 'REJECTED', 'PAUSED'].includes(ad.status)) {
        throw new ValidationError('Can only archive completed, rejected, or paused ads');
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: { isArchived: true },
      });

      logger.info(`Ad archived: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Archive ad failed:', error);
      throw error;
    }
  }

  /**
   * Unarchive ad
   */
  async unarchiveAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: { isArchived: false },
      });

      logger.info(`Ad unarchived: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Unarchive ad failed:', error);
      throw error;
    }
  }

  /**
   * Get saved ads
   */
  async getSavedAds(userId) {
    try {
      const saved = await prisma.savedAd.findMany({
        where: { userId },
        include: {
          ad: {
            include: {
              advertiser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return saved.map(s => s.ad);
    } catch (error) {
      logger.error('Get saved ads failed:', error);
      throw error;
    }
  }




/**

/**
 * Send test ad via platform bot (@akhmadsnetbot)
 */
async sendTestAd(adId, advertiserId, telegramUserId) {
  try {
    const ad = await prisma.ad.findFirst({
      where: { id: adId, advertiserId },
    });

    if (!ad) {
      throw new NotFoundError('Ad not found');
    }

    // ✅ GET USER'S TELEGRAM ID
    const user = await prisma.user.findUnique({
      where: { id: advertiserId },
      select: { telegramId: true, username: true, firstName: true }
    });

    const targetUserId = user?.telegramId || telegramUserId;

    if (!targetUserId) {
      throw new ValidationError('Telegram ID not found');
    }

    // ✅ USE PLATFORM BOT TOKEN FROM ENV
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured in .env');
    }

    logger.info(`Sending test ad to user ${targetUserId} via platform bot`);

    // ✅ PREPARE MESSAGE
    const message = await this.prepareTestMessage(ad);

    // ✅ SEND MESSAGE
    try {
      if (ad.contentType === 'MEDIA' && ad.mediaUrl) {
        await telegramAPI.sendPhoto(botToken, {
          chat_id: targetUserId,
          photo: ad.mediaUrl,
          caption: `🧪 TEST AD\n\n${message.text}`,
          parse_mode: message.parseMode,
          reply_markup: message.replyMarkup,
        });
      } else {
        await telegramAPI.sendMessage(botToken, {
          chat_id: targetUserId,
          text: `🧪 TEST AD\n\n${message.text}`,
          parse_mode: message.parseMode,
          reply_markup: message.replyMarkup,
        });
      }

      logger.info(`✅ Test ad sent successfully`);
      
      return {
        success: true,
        message: 'Test ad sent to your Telegram!',
      };
    } catch (error) {
      logger.error('Telegram API error:', error);
      
      const errorMsg = error.message || '';
      
      if (errorMsg === 'USER_BLOCKED_BOT') {
        throw new ValidationError('You blocked the bot. Please unblock and try again.');
      }
      
      if (errorMsg === 'CHAT_NOT_FOUND') {
        throw new ValidationError('Invalid Telegram ID');
      }
      
      throw new ValidationError(`Failed to send: ${errorMsg}`);
    }
  } catch (error) {
    logger.error('Send test ad failed:', error);
    throw error;
  }
}

/**
 * Prepare test message
 */
async prepareTestMessage(ad) {
  try {
    let text = ad.text || '';
    let parseMode = 'HTML';

    if (ad.contentType === 'MARKDOWN') {
      parseMode = 'Markdown';
      text = ad.markdownContent || text;
    } else if (ad.contentType === 'HTML') {
      text = ad.htmlContent || text;
    }

    // Prepare buttons
    let replyMarkup = null;
    if (ad.buttons) {
      const buttons = typeof ad.buttons === 'string' 
        ? JSON.parse(ad.buttons) 
        : ad.buttons;
      
      if (buttons && buttons.length > 0) {
        replyMarkup = {
          inline_keyboard: [
            buttons.map(btn => ({
              text: btn.text,
              url: btn.url,
            })),
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
    logger.error('Prepare test message failed:', error);
    throw new ValidationError('Failed to prepare test message');
  }
}
}

const adService = new AdService();
export default adService;