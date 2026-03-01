// src/services/payments/withdrawService.js
import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import telegramBot from '../../config/telegram.js';
import logger from '../../utils/logger.js';
import { InsufficientFundsError, ValidationError } from '../../utils/errors.js';

// BEP-20 manzil formati: 0x + 40 hex belgi
const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Withdraw Service
 * LOGIKA:
 *  - Faqat BEP-20 USDT qabul qilinadi
 *  - Fee: $3 FIXED (foiz emas!)
 *  - User so'ragan miqdor: amount
 *  - Hisobdan yechiladi: amount + $3 (fee)
 *  - User oladi: amount - $3 (netAmount)
 *  - Admin qo'lda USDT jo'natadi
 *  - Approve/Reject → User ga Telegram xabar
 */
class WithdrawService {

  // ─────────────────────────────────────────────
  // USER: Withdraw so'rovi
  // ─────────────────────────────────────────────

  async requestWithdrawal(userId, data) {
    const { amount, bep20Address } = data;

    // 1. BEP-20 manzil validatsiya
    if (!bep20Address || !BEP20_REGEX.test(bep20Address)) {
      throw new ValidationError(
        'To\'g\'ri BEP-20 manzil kiriting (0x bilan boshlanuvchi 42 belgili)'
      );
    }

    // 2. Sozlamalarni olish
    const settings = await this.getWithdrawalSettings();

    // 3. Miqdor tekshirish
    if (amount < settings.minWithdraw) {
      throw new ValidationError(`Minimal yechish miqdori: $${settings.minWithdraw}`);
    }
    if (amount > settings.maxDailyWithdraw) {
      throw new ValidationError(`Kunlik maksimal: $${settings.maxDailyWithdraw}`);
    }

    // 4. Kunlik limit tekshirish
    const todayTotal = await this.getTodayWithdrawals(userId);
    if (todayTotal + amount > settings.maxDailyWithdraw) {
      throw new ValidationError('Kunlik yechish limiti to\'ldi');
    }

    // 5. Fee hisoblash — FIXED $3
    const fee = settings.withdrawalFeeFixed;   // 3
    const totalRequired = amount + fee;         // hisobdan yechiladi
    const netAmount = amount - fee;             // user oladi

    if (netAmount <= 0) {
      throw new ValidationError(`Yechish miqdori fee dan katta bo'lishi kerak ($${fee})`);
    }

    // 6. Pulni rezerv qilish (available → reserved)
    // walletService.reserve ichida balans tekshiriladi va xatolik otiladi
    await walletService.reserve(userId, totalRequired);

    // 7. Withdraw so'rovi yaratish
    const withdrawal = await prisma.withdrawRequest.create({
      data: {
        userId,
        method: 'CRYPTO',
        provider: 'CRYPTO',
        coin: 'USDT',
        network: 'BEP20',
        address: bep20Address,
        amount,           // user so'ragan
        fee,              // $3
        netAmount,        // user oladi
        status: 'REQUESTED',
      },
    });

    // 9. Admin larga Telegram xabar
    await this.notifyAdminsNewWithdrawal(withdrawal, userId);

    logger.info(`Withdraw so'rovi: ${withdrawal.id}, user: ${userId}, amount: $${amount}, fee: $${fee}`);
    return withdrawal;
  }

  // ─────────────────────────────────────────────
  // ADMIN: Tasdiqlash
  // ─────────────────────────────────────────────

  async approveWithdrawal(withdrawalId, adminId) {
    const withdrawal = await prisma.withdrawRequest.findUnique({
      where: { id: withdrawalId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            username: true, telegramId: true,
          },
        },
      },
    });

    if (!withdrawal) throw new ValidationError('Withdraw topilmadi');
    if (!['REQUESTED', 'PENDING_REVIEW'].includes(withdrawal.status)) {
      throw new ValidationError('Bu withdraw allaqachon qayta ishlangan');
    }

    const totalAmount = parseFloat(withdrawal.amount) + parseFloat(withdrawal.fee);

    // Reserved pulni tizimdan chiqarish (reserved → exit)
    await walletService.confirmReserved(withdrawal.userId, totalAmount);

    // Tranzaksiya yozuvi
    await prisma.transaction.create({
      data: {
        userId: withdrawal.userId,
        type: 'WITHDRAW',
        provider: 'CRYPTO',
        coin: 'USDT',
        network: 'BEP20',
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        status: 'SUCCESS',
        address: withdrawal.address,
        metadata: JSON.stringify({ withdrawalId, approvedBy: adminId }),
      },
    });

    // Status yangilash
    const updated = await prisma.withdrawRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'COMPLETED',
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'WITHDRAWAL_APPROVED',
        entityType: 'withdrawal',
        entityId: withdrawalId,
        metadata: JSON.stringify({
          amount: withdrawal.amount,
          netAmount: withdrawal.netAmount,
          address: withdrawal.address,
          userId: withdrawal.userId,
        }),
      },
    });

    // User ga Telegram xabar
    await this.notifyUserApproved(withdrawal);

    logger.info(`Withdraw tasdiqlandi: ${withdrawalId} by admin ${adminId}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ADMIN: Rad etish
  // ─────────────────────────────────────────────

  async rejectWithdrawal(withdrawalId, adminId, reason) {
    const withdrawal = await prisma.withdrawRequest.findUnique({
      where: { id: withdrawalId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            username: true, telegramId: true,
          },
        },
      },
    });

    if (!withdrawal) throw new ValidationError('Withdraw topilmadi');
    if (!['REQUESTED', 'PENDING_REVIEW'].includes(withdrawal.status)) {
      throw new ValidationError('Bu withdraw allaqachon qayta ishlangan');
    }

    const totalAmount = parseFloat(withdrawal.amount) + parseFloat(withdrawal.fee);

    // Reserved pulni qaytarish (reserved → available)
    await walletService.releaseReserved(withdrawal.userId, totalAmount);

    // Status yangilash
    const updated = await prisma.withdrawRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'REJECTED',
        reason,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'WITHDRAWAL_REJECTED',
        entityType: 'withdrawal',
        entityId: withdrawalId,
        metadata: JSON.stringify({
          amount: withdrawal.amount,
          userId: withdrawal.userId,
          reason,
        }),
      },
    });

    // User ga Telegram xabar
    await this.notifyUserRejected(withdrawal, reason);

    logger.info(`Withdraw rad etildi: ${withdrawalId}, sabab: ${reason}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Kutayotgan withdrawlar (admin uchun)
  // ─────────────────────────────────────────────

  async getPendingWithdrawals(limit = 20, offset = 0) {
    const withdrawals = await prisma.withdrawRequest.findMany({
      where: { status: { in: ['REQUESTED', 'PENDING_REVIEW'] } },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            username: true, telegramId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.withdrawRequest.count({
      where: { status: { in: ['REQUESTED', 'PENDING_REVIEW'] } },
    });

    return { withdrawals, total };
  }

  // ─────────────────────────────────────────────
  // User tarixi
  // ─────────────────────────────────────────────

  async getUserWithdrawals(userId, limit = 20, offset = 0) {
    const withdrawals = await prisma.withdrawRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.withdrawRequest.count({ where: { userId } });
    return { withdrawals, total };
  }

  // ─────────────────────────────────────────────
  // Withdraw ma'lumotlari (user uchun)
  // ─────────────────────────────────────────────

  async getWithdrawInfo() {
    const settings = await this.getWithdrawalSettings();
    return {
      method: 'CRYPTO',
      network: 'BEP-20 (BSC)',
      coin: 'USDT',
      feeType: 'fixed',
      feeAmount: settings.withdrawalFeeFixed,
      feeDescription: `$${settings.withdrawalFeeFixed} fixed fee`,
      minWithdraw: settings.minWithdraw,
      maxDailyWithdraw: settings.maxDailyWithdraw,
      processingTime: '1-24 soat (qo\'lda tasdiqlash)',
      example: {
        request: 50,
        fee: settings.withdrawalFeeFixed,
        youReceive: 50 - settings.withdrawalFeeFixed,
      },
    };
  }

  // ─────────────────────────────────────────────
  // Kunlik yechishlar summasi
  // ─────────────────────────────────────────────

  async getTodayWithdrawals(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.withdrawRequest.aggregate({
      where: {
        userId,
        createdAt: { gte: today },
        status: { in: ['REQUESTED', 'PENDING_REVIEW', 'COMPLETED'] },
      },
      _sum: { amount: true },
    });

    return parseFloat(result._sum.amount || 0);
  }

  // ─────────────────────────────────────────────
  // Sozlamalar
  // ─────────────────────────────────────────────

  async getWithdrawalSettings() {
    try {
      const settings = await prisma.platformSettings.findMany({
        where: {
          key: { in: ['min_withdraw_usd', 'max_daily_withdraw_usd', 'withdrawal_fee_fixed_usd'] },
        },
      });

      const map = Object.fromEntries(settings.map(s => [s.key, parseFloat(s.value)]));

      return {
        minWithdraw: map.min_withdraw_usd || 10,
        maxDailyWithdraw: map.max_daily_withdraw_usd || 5000,
        withdrawalFeeFixed: map.withdrawal_fee_fixed_usd || 3,  // $3 FIXED
      };
    } catch {
      return { minWithdraw: 10, maxDailyWithdraw: 5000, withdrawalFeeFixed: 3 };
    }
  }

  // ─────────────────────────────────────────────
  // Telegram xabarlar
  // ─────────────────────────────────────────────

  async notifyAdminsNewWithdrawal(withdrawal, userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, username: true, telegramId: true },
      });

      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
        select: { telegramId: true },
      });

      const userName = `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
      const userHandle = user.username ? `@${user.username}` : `ID: ${user.telegramId}`;

      const message =
        `💸 <b>Yangi Withdraw So'rovi</b>\n\n` +
        `👤 Foydalanuvchi: ${userName} (${userHandle})\n` +
        `💰 So'rov: $${withdrawal.amount} USDT\n` +
        `💳 Fee: $${withdrawal.fee}\n` +
        `📤 <b>Jo'natish kerak: $${withdrawal.netAmount} USDT</b>\n` +
        `🔗 Manzil: <code>${withdrawal.address}</code>\n` +
        `🌐 Tarmoq: BEP-20 (BSC)\n` +
        `🆔 ID: <code>${withdrawal.id}</code>\n\n` +
        `⚠️ USDT jo'nating, keyin tasdiqlang!`;

      for (const admin of admins) {
        if (admin.telegramId) {
          await telegramBot.sendMessage(admin.telegramId, message, { parse_mode: 'HTML' })
            .catch(e => logger.warn(`Admin ${admin.telegramId} ga xabar yuborilmadi: ${e.message}`));
        }
      }
    } catch (e) {
      logger.error('Admin notification xatosi:', e);
    }
  }

  async notifyUserApproved(withdrawal) {
    try {
      if (!withdrawal.user?.telegramId) return;

      const message =
        `✅ <b>Withdraw Tasdiqlandi!</b>\n\n` +
        `💰 Miqdor: <b>$${withdrawal.netAmount} USDT</b>\n` +
        `🔗 Manzil: <code>${withdrawal.address}</code>\n` +
        `🌐 Tarmoq: BEP-20 (BSC)\n\n` +
        `USDT hisobingizga tushdi. BSCScan orqali tekshirishingiz mumkin.`;

      await telegramBot.sendMessage(withdrawal.user.telegramId, message, { parse_mode: 'HTML' });
    } catch (e) {
      logger.error('User approve notification xatosi:', e);
    }
  }

  async notifyUserRejected(withdrawal, reason) {
    try {
      if (!withdrawal.user?.telegramId) return;

      const message =
        `❌ <b>Withdraw Rad Etildi</b>\n\n` +
        `💰 So'rov miqdori: $${withdrawal.amount} USDT\n` +
        `📋 Sabab: ${reason}\n\n` +
        `💚 <b>$${totalReturned} hisobingizga qaytarildi.</b>`;

      await telegramBot.sendMessage(withdrawal.user.telegramId, message, { parse_mode: 'HTML' });
    } catch (e) {
      logger.error('User reject notification xatosi:', e);
    }
  }
}

const withdrawService = new WithdrawService();
export default withdrawService;