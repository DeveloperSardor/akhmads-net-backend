// src/services/wallet/walletService.js
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { InsufficientFundsError, NotFoundError } from '../../utils/errors.js';

/**
 * Wallet Service
 *
 * Balans holatlari:
 *   available  — foydalanish mumkin
 *   reserved   — to'xtatib qo'yilgan (withdraw yoki ad uchun)
 *   pending    — Payme'dan kutilayotgan (processing)
 *
 * Ad Reserve workflow:
 *   1. User creates ad (DRAFT) - no charge
 *   2. User submits ad → reserveForAd() → available -= X, reserved += X
 *   3. Moderator approves → confirmAdReserve() → reserved -= X, totalSpent += X
 *   4. Moderator rejects → refundAdReserve() → reserved -= X, available += X
 *   5. Ad runs → chargeImpression() → remainingBudget -= Y
 *
 * Withdraw workflow:
 *   requestWithdrawal  → reserve()         available -= X, reserved += X
 *   approveWithdrawal  → confirmReserved() reserved -= X, totalWithdrawn += X
 *   rejectWithdrawal   → releaseReserved() reserved -= X, available += X
 */
class WalletService {

  // ─────────────────────────────────────────────
  // Wallet olish / yaratish
  // ─────────────────────────────────────────────

  async getWallet(userId) {
    let wallet = await prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          available: 0,
          reserved: 0,
          pending: 0,
          totalDeposited: 0,
          totalWithdrawn: 0,
          totalEarned: 0,
          totalSpent: 0,
        },
      });
    }

    return wallet;
  }

  // ─────────────────────────────────────────────
  // Deposit — pul kirim (Payme webhook'dan)
  // ─────────────────────────────────────────────

  async credit(userId, amount, type = 'DEPOSIT', referenceId = null) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    const isEarnings = type === 'EARNINGS';

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        available: { increment: amount },
        totalDeposited: isEarnings ? undefined : { increment: amount },
        totalEarned: isEarnings ? { increment: amount } : undefined,
      },
    });

    // Ledger yozuvi
    await this.addLedgerEntry(userId, type, amount, referenceId,
      `available: ${parseFloat(wallet.available)} → ${parseFloat(wallet.available) + amount}`
    );

    logger.info(`✅ Wallet credit: user=${userId}, amount=${amount}, type=${type}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Debit — to'g'ridan-to'g'ri yechish (faqat earnings uchun)
  // ─────────────────────────────────────────────

  async debit(userId, amount, type = 'SPEND', referenceId = null) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.available) < amount) {
      throw new InsufficientFundsError('Yetarli mablag\' yo\'q');
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        available: { decrement: amount },
        totalSpent: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, type, -amount, referenceId,
      `available: ${parseFloat(wallet.available)} → ${parseFloat(wallet.available) - amount}`
    );

    logger.info(`💸 Wallet debit: user=${userId}, amount=${amount}, type=${type}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Reserve for Ad (submit ad uchun)
  // ─────────────────────────────────────────────

  async reserveForAd(userId, adId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.available) < amount) {
      throw new InsufficientFundsError(
        `Yetarli mablag' yo'q. Mavjud: $${parseFloat(wallet.available).toFixed(2)}, kerak: $${amount.toFixed(2)}`
      );
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        available: { decrement: amount },
        reserved: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'AD_RESERVE', -amount, adId,
      `Ad reserve: available -$${amount}, reserved +$${amount} (adId: ${adId})`
    );

    logger.info(`🔒 Ad reserve: user=${userId}, ad=${adId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Confirm Ad Reserve (approve ad uchun)
  // ─────────────────────────────────────────────

  async confirmAdReserve(userId, adId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.reserved) < amount) {
      logger.warn(`⚠️ Reserved (${wallet.reserved}) < amount (${amount}) for user ${userId}, ad ${adId}`);
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        reserved: { decrement: amount },
        totalSpent: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'AD_SPEND', -amount, adId,
      `Ad approved: reserved -$${amount}, totalSpent +$${amount} (adId: ${adId})`
    );

    logger.info(`✅ Ad confirmed: user=${userId}, ad=${adId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Refund Ad Reserve (reject ad uchun)
  // ─────────────────────────────────────────────

  async refundAdReserve(userId, adId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.reserved) < amount) {
      logger.warn(`⚠️ Reserved (${wallet.reserved}) < amount (${amount}) for user ${userId}, ad ${adId}`);
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        reserved: { decrement: amount },
        available: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'AD_REFUND', amount, adId,
      `Ad rejected: reserved -$${amount}, available +$${amount} (adId: ${adId})`
    );

    logger.info(`🔄 Ad refunded: user=${userId}, ad=${adId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Withdraw - Reserve (withdraw so'rov uchun)
  // ─────────────────────────────────────────────

  async reserve(userId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.available) < amount) {
      throw new InsufficientFundsError(
        `Yetarli mablag' yo'q. Mavjud: $${parseFloat(wallet.available).toFixed(2)}, kerak: $${amount.toFixed(2)}`
      );
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        available: { decrement: amount },
        reserved: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'RESERVE', -amount, null,
      `Withdraw reserve: available -$${amount}, reserved +$${amount}`
    );

    logger.info(`🔒 Withdraw reserve: user=${userId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Release Reserved — withdraw reject
  // ─────────────────────────────────────────────

  async releaseReserved(userId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.reserved) < amount) {
      logger.warn(`⚠️ releaseReserved: reserved (${wallet.reserved}) < amount (${amount}) for user ${userId}`);
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        reserved: { decrement: amount },
        available: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'RESERVE_RELEASE', amount, null,
      `Withdraw release: reserved -$${amount}, available +$${amount}`
    );

    logger.info(`🔄 Withdraw released: user=${userId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Confirm Reserved — withdraw approve
  // ─────────────────────────────────────────────

  async confirmReserved(userId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        reserved: { decrement: amount },
        totalWithdrawn: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'WITHDRAW', -amount, null,
      `Withdraw confirm: reserved -$${amount}, totalWithdrawn +$${amount}`
    );

    logger.info(`✅ Withdraw confirmed: user=${userId}, amount=$${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Pending deposit (Payme'dan kutish)
  // ─────────────────────────────────────────────

  async addPending(userId, amount, transactionId) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        pending: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'DEPOSIT_PENDING', amount, transactionId,
      `Pending deposit: +$${amount} (waiting confirmation)`
    );

    logger.info(`⏳ Pending deposit: user=${userId}, amount=$${amount}, tx=${transactionId}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Confirm pending deposit
  // ─────────────────────────────────────────────

  async confirmPending(userId, amount, transactionId) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        pending: { decrement: amount },
        available: { increment: amount },
        totalDeposited: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'DEPOSIT', amount, transactionId,
      `Deposit confirmed: pending -$${amount}, available +$${amount}`
    );

    logger.info(`✅ Deposit confirmed: user=${userId}, amount=$${amount}, tx=${transactionId}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // ✅ NEW - Cancel pending deposit
  // ─────────────────────────────────────────────

  async cancelPending(userId, amount, transactionId) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        pending: { decrement: amount },
      },
    });

    await this.addLedgerEntry(userId, 'DEPOSIT_CANCELLED', -amount, transactionId,
      `Deposit cancelled: pending -$${amount}`
    );

    logger.info(`❌ Deposit cancelled: user=${userId}, amount=$${amount}, tx=${transactionId}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Transaction tarixi
  // ─────────────────────────────────────────────

  async getTransactionHistory(userId, limit = 50, offset = 0) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.ledgerEntry.count({ where: { userId } });
    return { entries, total };
  }

  // ─────────────────────────────────────────────
  // Balans tekshirish (audit)
  // ─────────────────────────────────────────────

  async verifyBalance(userId) {
    const wallet = await this.getWallet(userId);

    const ledgerSum = await prisma.ledgerEntry.aggregate({
      where: { userId },
      _sum: { amount: true },
    });

    const expectedBalance = parseFloat(ledgerSum._sum.amount || 0);
    const actualBalance = parseFloat(wallet.available) + parseFloat(wallet.reserved) + parseFloat(wallet.pending);

    return {
      available: parseFloat(wallet.available),
      reserved: parseFloat(wallet.reserved),
      pending: parseFloat(wallet.pending),
      total: actualBalance,
      ledgerSum: expectedBalance,
      isBalanced: Math.abs(actualBalance - expectedBalance) < 0.001,
    };
  }

  // ─────────────────────────────────────────────
  // Ledger yozuvi (ichki)
  // ─────────────────────────────────────────────

  async addLedgerEntry(userId, type, amount, referenceId = null, note = '') {
    try {
      const wallet = await this.getWallet(userId);
      const balance = parseFloat(wallet.available) + parseFloat(wallet.reserved) + parseFloat(wallet.pending);

      await prisma.ledgerEntry.create({
        data: {
          userId,
          type,
          amount,
          balance,
          refId: referenceId,
          refType: referenceId ? 'AD' : null,
          description: note,
        },
      });
    } catch (e) {
      logger.warn(`Ledger yozuvi amalga oshmadi: ${e.message}`);
    }
  }
}

const walletService = new WalletService();
export default walletService;