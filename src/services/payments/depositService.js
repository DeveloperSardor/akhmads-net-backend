// src/services/payments/depositService.js
import prisma from '../../config/database.js';
import walletService from '../wallet/walletService.js';
import paymeService from './providers/paymeService.js';
import cryptoPayService from './providers/cryptoPayService.js';
import logger from '../../utils/logger.js';
import { PaymentError, ValidationError } from '../../utils/errors.js';

/**
 * Deposit Service
 * Handles deposit workflow for multiple providers
 */
class DepositService {
  /**
   * Initiate deposit
   * Creates transaction and returns payment URL
   */
  async initiateDeposit(userId, data) {
    try {
      const { provider, amount, coin, network } = data;

      // Validate provider
      if (!['PAYME', 'CRYPTO'].includes(provider)) {
        throw new ValidationError('Invalid provider. Use PAYME or CRYPTO');
      }

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
          coin: coin || null,
          network: network || null,
          amount,
          status: 'PENDING',
        },
      });

      logger.info(`Deposit transaction created: ${transaction.id}, provider: ${provider}, amount: $${amount}`);

      // Generate payment URL based on provider
      let paymentData = {};

      if (provider === 'PAYME') {
        // Payme checkout URL
        const paymentUrl = paymeService.createPaymentUrl(transaction.id, amount);
        paymentData = {
          paymentUrl,
          provider: 'PAYME',
          description: 'To\'lov Payme orqali amalga oshiriladi',
        };
      } else if (provider === 'CRYPTO') {
        // CryptoPay invoice
        const invoice = await cryptoPayService.createInvoice(transaction.id, amount);
        
        // Update transaction with invoice ID
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            providerTxId: invoice.invoiceId.toString(),
            metadata: {
              invoice_id: invoice.invoiceId,
              expires_at: invoice.expiresAt,
            },
          },
        });

        paymentData = {
          paymentUrl: invoice.paymentUrl,
          miniAppUrl: invoice.miniAppUrl,
          webAppUrl: invoice.webAppUrl,
          provider: 'CRYPTO',
          invoiceId: invoice.invoiceId,
          expiresAt: invoice.expiresAt,
          acceptedAssets: ['USDT', 'TON', 'BTC', 'ETH'],
          description: 'Pay with cryptocurrency via @CryptoBot',
        };
      }

      return {
        transaction: {
          id: transaction.id,
          amount: parseFloat(transaction.amount),
          provider: transaction.provider,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
        payment: paymentData,
      };
    } catch (error) {
      logger.error('Initiate deposit failed:', error);
      throw error;
    }
  }

  /**
   * Process CryptoPay webhook
   * Called when user completes payment
   */
  async processCryptoPayWebhook(signature, body) {
    try {
      // Verify and extract data
      const webhookData = await cryptoPayService.processWebhook(signature, body);

      if (!webhookData) {
        return null; // Not a payment webhook
      }

      const { transactionId, amount, status, metadata } = webhookData;

      // Find transaction
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        logger.error(`CryptoPay webhook: Transaction not found: ${transactionId}`);
        throw new PaymentError('Transaction not found');
      }

      if (transaction.status !== 'PENDING') {
        logger.warn(`CryptoPay webhook: Duplicate for transaction: ${transactionId}`);
        return transaction;
      }

      // Update transaction
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'SUCCESS',
          metadata: metadata,
        },
      });

      // Credit wallet
      await walletService.credit(
        transaction.userId,
        parseFloat(transaction.amount),
        'DEPOSIT',
        transaction.id
      );

      logger.info(`✅ CryptoPay deposit completed: ${transactionId}, amount: $${amount}`);

      return updated;
    } catch (error) {
      logger.error('Process CryptoPay webhook failed:', error);
      throw error;
    }
  }

  /**
   * Get minimum deposit amount
   */
  async getMinDeposit(provider) {
    const key = provider === 'CRYPTO' ? 'min_deposit_crypto_usd' : 'min_deposit_usd';
    
    const settings = await prisma.platformSettings.findUnique({
      where: { key },
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

  /**
   * Check deposit status
   */
  async checkDepositStatus(transactionId, userId) {
    try {
      const transaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          type: 'DEPOSIT',
        },
      });

      if (!transaction) {
        throw new PaymentError('Transaction not found');
      }

      // If CryptoPay and still pending, check invoice status
      if (transaction.provider === 'CRYPTO' && transaction.status === 'PENDING' && transaction.providerTxId) {
        try {
          const invoice = await cryptoPayService.getInvoice(transaction.providerTxId);
          
          if (invoice.status === 'paid') {
            // Update and credit wallet
            await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: 'SUCCESS' },
            });

            await walletService.credit(
              userId,
              parseFloat(transaction.amount),
              'DEPOSIT',
              transactionId
            );

            return { ...transaction, status: 'SUCCESS' };
          }
        } catch (error) {
          logger.error('Check CryptoPay invoice failed:', error);
        }
      }

      return transaction;
    } catch (error) {
      logger.error('Check deposit status failed:', error);
      throw error;
    }
  }
}

const depositService = new DepositService();
export default depositService;