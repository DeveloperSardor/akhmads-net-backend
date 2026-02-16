import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import logger from '../../utils/logger.js';
import { PaymentError } from '../../utils/errors.js';

/**
 * Deposit Service
 * Handles deposit workflow
 */
class DepositService {
  /**
   * Initiate deposit
   */
  async initiateDeposit(userId, data) {
    try {
      const { provider, amount, coin, network, metadata } = data;

      // Validate minimum deposit
      const minDeposit = await this.getMinDeposit(provider);
      if (amount < minDeposit) {
        throw new PaymentError(`Minimum deposit is $${minDeposit}`);
      }

      // Create transaction
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          provider,
          coin,
          network,
          amount,
          status: 'PENDING',
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      logger.info(`Deposit initiated: ${transaction.id}`);
      return transaction;
    } catch (error) {
      logger.error('Initiate deposit failed:', error);
      throw error;
    }
  }

  /**
   * Process deposit webhook
   */
  async processDepositWebhook(data) {
    try {
      const { providerTxId, amount, status, metadata } = data;

      // Find transaction
      const transaction = await prisma.transaction.findUnique({
        where: { providerTxId },
      });

      if (!transaction) {
        throw new PaymentError('Transaction not found');
      }

      if (transaction.status !== 'PENDING') {
        logger.warn(`Duplicate webhook for transaction: ${transaction.id}`);
        return transaction;
      }

      // Update transaction
      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        },
      });

      // If successful, credit wallet
      if (status === 'SUCCESS') {
        await walletService.credit(
          transaction.userId,
          amount,
          'DEPOSIT',
          transaction.id
        );

        logger.info(`Deposit successful: ${transaction.id}`);
      }

      return updated;
    } catch (error) {
      logger.error('Process deposit webhook failed:', error);
      throw error;
    }
  }

  /**
   * Get minimum deposit amount
   */
  async getMinDeposit(provider) {
    const settings = await prisma.platformSettings.findUnique({
      where: { key: 'min_deposit_usd' },
    });

    return parseFloat(settings?.value || '5');
  }

  /**
   * Get deposit history
   */
  async getDepositHistory(userId, limit = 20, offset = 0) {
    try {
      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: 'DEPOSIT',
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.transaction.count({
        where: { userId, type: 'DEPOSIT' },
      });

      return { transactions, total };
    } catch (error) {
      logger.error('Get deposit history failed:', error);
      throw error;
    }
  }
}

const depositService = new DepositService();
export default depositService;