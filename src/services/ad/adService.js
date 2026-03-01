// src/services/ad/adService.js
import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import pricingCalculator from '../../utils/pricing.js';
import logger from '../../utils/logger.js';
import { NotFoundError, InsufficientFundsError, ValidationError } from '../../utils/errors.js';
import encryption from '../../utils/encryption.js';
import telegramAPI from '../../utils/telegram-api.js';
import telegramPreviewService from '../telegram/telegramPreviewService.js';

/**
 * Ad Service
 * Handles ad creation, management, and lifecycle with moderation workflow
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
      const platformSettings = await prisma.platformSettings.findMany({
        where: { key: { in: ['platform_fee_percentage', 'ad_base_cpm'] } },
      });

      const feeSetting = platformSettings.find(s => s.key === 'platform_fee_percentage');
      const cpmSetting = platformSettings.find(s => s.key === 'ad_base_cpm');

      const platformFeePercentage = parseFloat(feeSetting?.value || '20');
      const baseCpm = cpmSetting ? parseFloat(cpmSetting.value) : 1.5;

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
        baseCpm,
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
   * Create new ad (DRAFT status - no charge yet)
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

      // Create ad in DRAFT status
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
          status: 'DRAFT', // ✅ Start as DRAFT
          targeting: data.targeting ? JSON.stringify(data.targeting) : null,
          excludedUserIds: data.excludedUserIds ? JSON.stringify(data.excludedUserIds) : null,
          specificBotIds: data.specificBotIds ? JSON.stringify(data.specificBotIds) : null,
          promoCodeUsed: promoCode?.code,
          discount: pricing.discount,
        },
      });

      logger.info(`✅ Ad created (DRAFT): ${ad.id}`);
      return ad;
    } catch (error) {
      logger.error('Create ad failed:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW - Submit ad for moderation
   * Reserves funds from wallet and changes status to PENDING_REVIEW
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
        throw new ValidationError('Only draft ads can be submitted');
      }

      // Check wallet balance
      const wallet = await walletService.getWallet(advertiserId);
      const available = parseFloat(wallet.available);
      const cost = parseFloat(ad.totalCost);

      if (available < cost) {
        throw new InsufficientFundsError(
          `Insufficient balance. Available: $${available.toFixed(2)}, Required: $${cost.toFixed(2)}`
        );
      }

      // Reserve funds
      await walletService.reserveForAd(advertiserId, adId, cost);

      // Update ad status to PENDING_REVIEW and clear rejection reason
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'PENDING_REVIEW',
          rejectionReason: null,
        },
      });

      // Increment promo code usage
      if (ad.promoCodeUsed) {
        await prisma.promoCode.update({
          where: { code: ad.promoCodeUsed },
          data: { usedCount: { increment: 1 } },
        });
      }

      logger.info(`📤 Ad submitted for review: ${adId}, cost=$${cost}`);
      return updated;
    } catch (error) {
      logger.error('Submit ad failed:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW - Approve ad (moderator action)
   * Confirms reserved funds and activates ad
   */
  async approveAd(adId, moderatorId, scheduledStart = null) {
    try {
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
        include: { advertiser: true },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'PENDING_REVIEW') {
        throw new ValidationError('Only pending ads can be approved');
      }

      const cost = parseFloat(ad.totalCost);

      // Confirm reserved funds (reserved → totalSpent)
      await walletService.confirmAdReserve(ad.advertiserId, adId, cost);

      // Update ad status
      const newStatus = scheduledStart ? 'SCHEDULED' : 'RUNNING';

      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: newStatus,
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
          startedAt: newStatus === 'RUNNING' ? new Date() : null,
          scheduledAt: scheduledStart || null,
        },
      });

      logger.info(`✅ Ad approved: ${adId}, status=${newStatus}`);

      // TODO: Send notification to advertiser
      // await notificationService.send(ad.advertiserId, 'AD_APPROVED', { adId, title: ad.title });

      return updated;
    } catch (error) {
      logger.error('Approve ad failed:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW - Reject ad (moderator action)
   * Refunds reserved funds and marks ad as rejected
   */
  async rejectAd(adId, moderatorId, reason) {
    try {
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
        include: { advertiser: true },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'PENDING_REVIEW') {
        throw new ValidationError('Only pending ads can be rejected');
      }

      const cost = parseFloat(ad.totalCost);

      // Refund reserved funds (reserved → available)
      await walletService.refundAdReserve(ad.advertiserId, adId, cost);

      // Update ad status
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'REJECTED',
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
          rejectionReason: reason,
        },
      });

      logger.info(`❌ Ad rejected: ${adId}, reason: ${reason}`);

      // TODO: Send notification to advertiser
      // await notificationService.send(ad.advertiserId, 'AD_REJECTED', { adId, title: ad.title, reason });

      return updated;
    } catch (error) {
      logger.error('Reject ad failed:', error);
      throw error;
    }
  }

  /**
   * Get user's ads
   */
  async getUserAds(advertiserId, filters = {}) {
    try {
      const { status, limit = 20, offset = 0, onlyArchived = false } = filters;
      console.log('getUserAds called with filters:', filters);

      const where = {
        advertiserId,
        isArchived: onlyArchived,
      };

      if (status) where.status = status;
      console.log('getUserAds Prisma where clause:', where);

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
          moderator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
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
   * Update ad (only in DRAFT or REJECTED status)
   */
  async updateAd(adId, advertiserId, data) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (!['DRAFT', 'REJECTED'].includes(ad.status)) {
        throw new ValidationError('Only draft or rejected ads can be edited');
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
          excludedBotIds: data.excludedBotIds ? JSON.stringify(data.excludedBotIds) : undefined,
          status: ad.status === 'REJECTED' ? 'DRAFT' : undefined, // Reset to DRAFT if was rejected
          rejectionReason: null, // Always clear rejection reason when user edits
        },
      });

      logger.info(`📝 Ad updated: ${adId}`);
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

      logger.info(`⏸️ Ad paused: ${adId}`);
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

      logger.info(`▶️ Ad resumed: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Resume ad failed:', error);
      throw error;
    }
  }

  /**
   * ✅ UPDATED - Delete ad with proper refund handling
   */
  async deleteAd(adId, advertiserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      // Can delete: DRAFT, REJECTED, COMPLETED, PAUSED
      const deletableStatuses = ['DRAFT', 'REJECTED', 'COMPLETED', 'PAUSED'];

      if (!deletableStatuses.includes(ad.status)) {
        throw new ValidationError(`Cannot delete ad with status: ${ad.status}`);
      }

      // Refund if in PENDING_REVIEW (funds still reserved)
      if (ad.status === 'PENDING_REVIEW') {
        const cost = parseFloat(ad.totalCost);
        await walletService.refundAdReserve(advertiserId, adId, cost);
        logger.info(`💰 Refunded $${cost} for deleted ad ${adId}`);
      }

      await prisma.ad.delete({
        where: { id: adId },
      });

      logger.info(`🗑️ Ad deleted: ${adId}`);
      return true;
    } catch (error) {
      logger.error('Delete ad failed:', error);
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

      logger.info(`📋 Ad duplicated: ${adId} → ${duplicate.id}`);
      return duplicate;
    } catch (error) {
      logger.error('Duplicate ad failed:', error);
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

      logger.info(`📦 Ad archived: ${adId}`);
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

      logger.info(`📂 Ad unarchived: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Unarchive ad failed:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW - Get user's saved ads
   */
  async getSavedAds(advertiserId) {
    try {
      const savedAds = await prisma.savedAd.findMany({
        where: { userId: advertiserId },
        include: {
          ad: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Extract the Ad objects and attach isSaved=true
      const ads = savedAds.map(saved => ({
        ...saved.ad,
        isSaved: true
      }));

      return ads;
    } catch (error) {
      logger.error('Get saved ads failed:', error);
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
   * Send test ad via user's own registered bot (falls back to platform bot)
   */
  async sendTestAd(adId, advertiserId, telegramUserId) {
    try {
      const ad = await prisma.ad.findFirst({
        where: { id: adId, advertiserId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      // Try to find the user's own active bot first
      const userBot = await prisma.bot.findFirst({
        where: {
          ownerId: advertiserId,
          status: 'ACTIVE',
          isPaused: false,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (userBot) {
        // Send via the user's own registered bot
        logger.info(`Sending test ad via user's own bot ${userBot.id}`);
        const adData = {
          text: ad.text || '',
          mediaUrl: ad.mediaUrl || null,
          buttons: ad.buttons ? (typeof ad.buttons === 'string' ? JSON.parse(ad.buttons) : ad.buttons) : [],
          contentType: ad.contentType,
        };
        await telegramPreviewService.sendTestAdViaBot(userBot.id, advertiserId, adData);
        return {
          success: true,
          message: 'Test ad sent to your Telegram via your bot!',
          botUsername: userBot.username,
        };
      }

      // Fallback: use platform bot token
      const user = await prisma.user.findUnique({
        where: { id: advertiserId },
        select: { telegramId: true, username: true, firstName: true }
      });

      const targetUserId = user?.telegramId || telegramUserId;

      if (!targetUserId) {
        throw new ValidationError('Telegram ID not found');
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured');
      }

      logger.info(`Sending test ad to user ${targetUserId} via platform bot`);

      const message = await this.prepareTestMessage(ad);

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

        logger.info(`✅ Test ad sent successfully via platform bot`);

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

  /**
   * Toggle save ad (save/unsave)
   */
  async toggleSaveAd(adId, userId) {
    try {
      const ad = await prisma.ad.findUnique({ where: { id: adId } });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      // Check if already saved
      const existing = await prisma.savedAd.findUnique({
        where: { userId_adId: { userId, adId } },
      });

      if (existing) {
        // Unsave
        await prisma.savedAd.delete({
          where: { userId_adId: { userId, adId } },
        });
        logger.info(`🔖 Ad unsaved: ${adId} by ${userId}`);
        return { saved: false };
      } else {
        // Save
        await prisma.savedAd.create({
          data: { userId, adId },
        });
        logger.info(`🔖 Ad saved: ${adId} by ${userId}`);
        return { saved: true };
      }
    } catch (error) {
      logger.error('Toggle save ad failed:', error);
      throw error;
    }
  }

  /**
   * Get user's saved ads
   */
  async getSavedAds(userId, limit = 20, offset = 0) {
    try {
      const savedAds = await prisma.savedAd.findMany({
        where: { userId },
        include: { ad: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.savedAd.count({ where: { userId } });

      return {
        ads: savedAds.map(s => s.ad),
        total,
      };
    } catch (error) {
      logger.error('Get saved ads failed:', error);
      throw error;
    }
  }

  /**
   * Search active ads for blocking UI
   */
  async searchActiveAds(query) {
    try {
      const ads = await prisma.ad.findMany({
        where: {
          status: 'RUNNING',
          isArchived: false,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { text: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          title: true,
          text: true,
          mediaUrl: true,
          status: true
        },
        take: 20
      });
      return ads;
    } catch (error) {
      logger.error('Search active ads failed:', error);
      throw error;
    }
  }
}

const adService = new AdService();
export default adService;