import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Ledger Service
 * Double-entry accounting for all transactions
 */
class LedgerService {
  /**
   * Create ledger entry
   */
  async createEntry(data) {
    try {
      const entry = await prisma.ledgerEntry.create({
        data: {
          userId: data.userId,
          type: data.type,
          amount: data.amount,
          balance: data.balance,
          refId: data.refId,
          refType: data.refType,
          description: data.description,
          metadata: data.metadata,
        },
      });

      logger.info(`Ledger entry created: ${entry.id}`);
      return entry;
    } catch (error) {
      logger.error('Create ledger entry failed:', error);
      throw error;
    }
  }

  /**
   * Get user ledger
   */
  async getUserLedger(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, type, startDate, endDate } = options;

      const where = { userId };
      if (type) where.type = type;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const entries = await prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.ledgerEntry.count({ where });

      return { entries, total };
    } catch (error) {
      logger.error('Get user ledger failed:', error);
      throw error;
    }
  }

  /**
   * Verify balance integrity
   */
  async verifyBalance(userId) {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      const ledgerSum = await prisma.ledgerEntry.aggregate({
        where: { userId },
        _sum: { amount: true },
      });

      const calculatedBalance = ledgerSum._sum.amount || 0;
      const actualBalance = wallet.available;

      const isValid = Math.abs(calculatedBalance - actualBalance) < 0.01;

      return {
        isValid,
        calculatedBalance,
        actualBalance,
        difference: actualBalance - calculatedBalance,
      };
    } catch (error) {
      logger.error('Verify balance failed:', error);
      throw error;
    }
  }
}

const ledgerService = new LedgerService();
export default ledgerService;