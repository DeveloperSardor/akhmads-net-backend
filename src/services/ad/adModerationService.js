import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Ad Moderation Service
 * Handles ad approval/rejection workflow
 */
class AdModerationService {
  /**
   * Get pending ads for moderation
   */
  async getPendingAds(limit = 20, offset = 0) {
    try {
      const ads = await prisma.ad.findMany({
        where: { status: { in: ['SUBMITTED', 'PENDING_REVIEW'] } },
        include: {
          advertiser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.ad.count({
        where: { status: { in: ['SUBMITTED', 'PENDING_REVIEW'] } },
      });

      return { ads, total };
    } catch (error) {
      logger.error('Get pending ads failed:', error);
      throw error;
    }
  }

  /**
   * Approve ad
   */
  async approveAd(adId, moderatorId) {
    try {
      const admin = await prisma.user.findUnique({
        where: { id: moderatorId },
        select: { firstName: true, username: true }
      });

      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'SUBMITTED' && ad.status !== 'PENDING_REVIEW') {
        throw new ValidationError('Only submitted/pending ads can be approved');
      }

      // Run AI safety check if enabled
      // const aiResult = await aiModerationService.moderateAd(ad); // Commented out if not available

      // Confirm reserved funds (reserved → totalSpent)
      const cost = parseFloat(ad.totalCost);
      if (cost > 0) {
        await walletService.confirmAdReserve(ad.advertiserId, adId, cost);
      }

      // Update ad to APPROVED and start running
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'APPROVED',
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
        },
      });

      await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: moderatorId,
          action: 'AD_APPROVED',
          entityType: 'ad',
          entityId: adId,
          metadata: { adTitle: ad.title },
        },
      });

      // ✅ Telegram dagi xabarni yangilash
      const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
      const resolverName = admin?.username || admin?.firstName || 'Admin';
      adminNotificationService.markAsResolved('ad', adId, resolverName, '✅ TASDIQLANDI (SAYT)').catch(() => {});

      logger.info(`Ad approved: ${adId} by ${moderatorId}`);
      return updated;
    } catch (error) {
      logger.error('Approve ad failed:', error);
      throw error;
    }
  }

  /**
   * Reject ad
   */
  async rejectAd(adId, moderatorId, reason) {
    try {
      const admin = await prisma.user.findUnique({
        where: { id: moderatorId },
        select: { firstName: true, username: true }
      });

      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'SUBMITTED' && ad.status !== 'PENDING_REVIEW') {
        throw new ValidationError('Only submitted/pending ads can be rejected');
      }

      // Refund reserved funds (reserved → available)
      const cost = parseFloat(ad.totalCost);
      if (cost > 0) {
        await walletService.refundAdReserve(ad.advertiserId, adId, cost);
      }

      // Update ad status
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: moderatorId,
          action: 'AD_REJECTED',
          entityType: 'ad',
          entityId: adId,
          metadata: {
            adTitle: ad.title,
            reason,
          },
        },
      });

      // ✅ Telegram dagi xabarni yangilash
      const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
      const resolverName = admin?.username || admin?.firstName || 'Admin';
      adminNotificationService.markAsResolved('ad', adId, resolverName, '❌ RAD ETILDI (SAYT)').catch(() => {});

      logger.info(`Ad rejected: ${adId} by ${moderatorId}`);
      return updated;
    } catch (error) {
      logger.error('Reject ad failed:', error);
      throw error;
    }
  }

  /**
   * Request ad edit
   */
  async requestEdit(adId, moderatorId, feedback) {
    try {
      const admin = await prisma.user.findUnique({
        where: { id: moderatorId },
        select: { firstName: true, username: true }
      });

      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      if (!ad) {
        throw new NotFoundError('Ad not found');
      }

      if (ad.status !== 'PENDING_REVIEW') {
        throw new ValidationError('Only pending ads can have edits requested');
      }

      // Refund reserved funds (reserved → available)
      const cost = parseFloat(ad.totalCost);
      if (cost > 0) {
        await walletService.refundAdReserve(ad.advertiserId, adId, cost);
      }

      // Update ad to draft with feedback
      const updated = await prisma.ad.update({
        where: { id: adId },
        data: {
          status: 'DRAFT',
          rejectionReason: `Edit requested: ${feedback}`,
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
        },
      });

      // ✅ Telegram dagi xabarni yangilash
      const { default: adminNotificationService } = await import('../telegram/adminNotificationService.js');
      const resolverName = admin?.username || admin?.firstName || 'Admin';
      adminNotificationService.markAsResolved('ad', adId, resolverName, '✏️ EDIT SO\'RALDI (SAYT)').catch(() => {});

      logger.info(`Ad edit requested: ${adId}`);
      return updated;
    } catch (error) {
      logger.error('Request edit failed:', error);
      throw error;
    }
  }

  /**
   * AI safety check (placeholder for future AI integration)
   */
  async runAiSafetyCheck(adId) {
    try {
      const ad = await prisma.ad.findUnique({
        where: { id: adId },
      });

      // TODO: Integrate with AI moderation API
      // For now, just basic keyword check
      const forbiddenWords = ['scam', 'hack', 'fraud'];
      const textLower = ad.text.toLowerCase();

      const flagged = forbiddenWords.some(word => textLower.includes(word));

      const result = {
        passed: !flagged,
        confidence: flagged ? 0.8 : 0.95,
        flags: flagged ? ['suspicious_content'] : [],
        checkedAt: new Date(),
      };

      await prisma.ad.update({
        where: { id: adId },
        data: {
          aiSafetyCheck: JSON.stringify(result),
        },
      });

      return result;
    } catch (error) {
      logger.error('AI safety check failed:', error);
      throw error;
    }
  }
}

const adModerationService = new AdModerationService();
export default adModerationService;