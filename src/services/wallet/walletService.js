import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { InsufficientFundsError, NotFoundError } from '../../utils/errors.js';

/**
 * Wallet Service
 *
 * Balans holatlari:
 *   available  — foydalanish mumkin
 *   reserved   — to'xtatib qo'yilgan (withdraw yoki reklama uchun)
 *
 * Withdraw oqimi:
 *   requestWithdrawal  → reserve()         available -= X, reserved += X
 *   approveWithdrawal  → confirmReserved() reserved -= X  (pul chiqib ketdi)
 *   rejectWithdrawal   → releaseReserved() reserved -= X, available += X  (qaytdi)
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
          totalDeposited: 0,
          totalWithdrawn: 0,
          totalEarned: 0,
          totalSpent: 0,
          currency: 'USD',
        },
      });
    }

    return wallet;
  }

  // ─────────────────────────────────────────────
  // Deposit — pul kirim
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

    logger.info(`Wallet credit: user=${userId}, amount=${amount}, type=${type}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Debit — to'g'ridan-to'g'ri yechish (reklama narxi)
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

    logger.info(`Wallet debit: user=${userId}, amount=${amount}, type=${type}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Reserve — pul "muzlatish" (available → reserved)
  // Withdraw so'rov yuborilganda chaqiriladi
  // ─────────────────────────────────────────────

  async reserve(userId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.available) < amount) {
      throw new InsufficientFundsError(
        `Yetarli mablag' yo'q. Mavjud: $${parseFloat(wallet.available).toFixed(2)}, kerak: $${amount}`
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
      `reserved: available $${parseFloat(wallet.available)} → $${parseFloat(wallet.available) - amount}, reserved +$${amount}`
    );

    logger.info(`Wallet reserve: user=${userId}, amount=${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Release Reserved — "muzlatilgan" pulni qaytarish
  // Withdraw RAD ETILganda chaqiriladi
  // ─────────────────────────────────────────────

  async releaseReserved(userId, amount) {
    if (amount <= 0) throw new Error('Miqdor 0 dan katta bo\'lishi kerak');

    const wallet = await this.getWallet(userId);

    if (parseFloat(wallet.reserved) < amount) {
      logger.warn(`releaseReserved: reserved (${wallet.reserved}) < amount (${amount}) for user ${userId}`);
    }

    const updated = await prisma.wallet.update({
      where: { userId },
      data: {
        reserved: { decrement: amount },
        available: { increment: amount },
      },
    });

    await this.addLedgerEntry(userId, 'RESERVE_RELEASE', amount, null,
      `release: reserved -$${amount}, available +$${amount}`
    );

    logger.info(`Wallet releaseReserved: user=${userId}, amount=${amount}`);
    return updated;
  }

  // ─────────────────────────────────────────────
  // Confirm Reserved — pul tizimdan chiqishi
  // Withdraw TASFIQLANganda chaqiriladi
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
      `confirm: reserved -$${amount}, totalWithdrawn +$${amount}`
    );

    logger.info(`Wallet confirmReserved: user=${userId}, amount=${amount}`);
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
    const actualBalance = parseFloat(wallet.available) + parseFloat(wallet.reserved);

    return {
      available: parseFloat(wallet.available),
      reserved: parseFloat(wallet.reserved),
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
      await prisma.ledgerEntry.create({
        data: {
          userId,
          type,
          amount,
          referenceId,
          note,
        },
      });
    } catch (e) {
      // Ledger jadval mavjud bo'lmasa ham xatolik chiqarmasin
      logger.warn(`Ledger yozuvi amalga oshmadi: ${e.message}`);
    }
  }
}

const walletService = new WalletService();
export default walletService;