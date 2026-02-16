import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Transaction Service
 * Transaction management
 */
class TransactionService {
  /**
   * Get user transactions
   */
  async getUserTransactions(userId, filters = {}) {
    try {
      const { type, status, limit = 50, offset = 0 } = filters;

      const where = { userId };
      if (type) where.type = type;
      if (status) where.status = status;

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.transaction.count({ where });

      return { transactions, total };
    } catch (error) {
      logger.error('Get user transactions failed:', error);
      throw error;
    }
  }
}

const transactionService = new TransactionService();
export default transactionService;