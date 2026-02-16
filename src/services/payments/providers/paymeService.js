import crypto from 'crypto';
import logger from '../../../utils/logger.js';
import { PaymentError } from '../../../utils/errors.js';

/**
 * Payme Payment Provider
 * Uzbekistan's popular payment gateway
 * Docs: https://developer.help.paycom.uz
 */
class PaymeService {
  constructor() {
    this.merchantId = process.env.PAYME_MERCHANT_ID;
    this.secretKey = process.env.PAYME_SECRET_KEY;
    this.baseUrl = 'https://checkout.paycom.uz';
  }

  /**
   * Generate payment URL
   */
  async createPayment(data) {
    try {
      const { userId, amount, transactionId } = data;

      // Amount in tiyin (1 UZS = 100 tiyin)
      const amountTiyin = Math.round(amount * 100);

      // Encode merchant data
      const params = btoa(
        `m=${this.merchantId};ac.order_id=${transactionId};a=${amountTiyin}`
      );

      const paymentUrl = `${this.baseUrl}/${params}`;

      logger.info(`Payme payment created: ${transactionId}`);

      return {
        paymentUrl,
        transactionId,
      };
    } catch (error) {
      logger.error('Payme create payment failed:', error);
      throw new PaymentError('Failed to create Payme payment');
    }
  }

  /**
   * Verify authorization header
   */
  verifyAuth(authHeader) {
    try {
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return false;
      }

      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      return username === 'Paycom' && password === this.secretKey;
    } catch (error) {
      logger.error('Payme auth verification failed:', error);
      return false;
    }
  }

  /**
   * Process JSON-RPC request
   */
  async processRequest(authHeader, body) {
    try {
      // Verify auth
      if (!this.verifyAuth(authHeader)) {
        return this.errorResponse(body.id, -32504, 'Unauthorized');
      }

      const { method, params } = body;

      // Route to appropriate handler
      switch (method) {
        case 'CheckPerformTransaction':
          return await this.checkPerformTransaction(body.id, params);
        case 'CreateTransaction':
          return await this.createTransaction(body.id, params);
        case 'PerformTransaction':
          return await this.performTransaction(body.id, params);
        case 'CancelTransaction':
          return await this.cancelTransaction(body.id, params);
        case 'CheckTransaction':
          return await this.checkTransaction(body.id, params);
        default:
          return this.errorResponse(body.id, -32601, 'Method not found');
      }
    } catch (error) {
      logger.error('Payme process request failed:', error);
      return this.errorResponse(body.id, -32400, 'Internal error');
    }
  }

  /**
   * Check perform transaction
   */
  async checkPerformTransaction(id, params) {
    try {
      const { amount, account } = params;
      const transactionId = account.order_id;

      const prisma = (await import('../../../config/database.js')).default;
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        return this.errorResponse(id, -31050, 'Order not found');
      }

      const amountUsd = amount / 100; // Convert from tiyin
      if (parseFloat(transaction.amount) !== amountUsd) {
        return this.errorResponse(id, -31001, 'Incorrect amount');
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          allow: true,
        },
      };
    } catch (error) {
      logger.error('Payme check perform failed:', error);
      return this.errorResponse(id, -31008, 'Error checking transaction');
    }
  }

  /**
   * Create transaction
   */
  async createTransaction(id, params) {
    try {
      const { amount, account, time } = params;
      const transactionId = account.order_id;

      const prisma = (await import('../../../config/database.js')).default;
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        return this.errorResponse(id, -31050, 'Order not found');
      }

      // Update transaction
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          providerTxId: params.id,
          status: 'PENDING',
        },
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          create_time: time,
          transaction: params.id,
          state: 1,
        },
      };
    } catch (error) {
      logger.error('Payme create transaction failed:', error);
      return this.errorResponse(id, -31008, 'Error creating transaction');
    }
  }

  /**
   * Perform transaction
   */
  async performTransaction(id, params) {
    try {
      const prisma = (await import('../../../config/database.js')).default;
      
      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      // Update status
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'SUCCESS' },
      });

      // Credit wallet
      const walletService = (await import('../walletService.js')).default;
      await walletService.credit(
        transaction.userId,
        parseFloat(transaction.amount),
        'DEPOSIT',
        transaction.id
      );

      logger.info(`Payme payment completed: ${transaction.id}`);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: params.id,
          perform_time: Date.now(),
          state: 2,
        },
      };
    } catch (error) {
      logger.error('Payme perform transaction failed:', error);
      return this.errorResponse(id, -31008, 'Error performing transaction');
    }
  }

  /**
   * Cancel transaction
   */
  async cancelTransaction(id, params) {
    try {
      const prisma = (await import('../../../config/database.js')).default;
      
      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: params.id,
          cancel_time: Date.now(),
          state: -1,
        },
      };
    } catch (error) {
      logger.error('Payme cancel transaction failed:', error);
      return this.errorResponse(id, -31008, 'Error canceling transaction');
    }
  }

  /**
   * Check transaction
   */
  async checkTransaction(id, params) {
    try {
      const prisma = (await import('../../../config/database.js')).default;
      
      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      const state = transaction.status === 'SUCCESS' ? 2 : transaction.status === 'FAILED' ? -1 : 1;

      return {
        jsonrpc: '2.0',
        id,
        result: {
          create_time: transaction.createdAt.getTime(),
          perform_time: transaction.updatedAt.getTime(),
          transaction: params.id,
          state,
        },
      };
    } catch (error) {
      logger.error('Payme check transaction failed:', error);
      return this.errorResponse(id, -31008, 'Error checking transaction');
    }
  }

  /**
   * Error response helper
   */
  errorResponse(id, code, message) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data: null,
      },
    };
  }
}

const paymeService = new PaymeService();
export default paymeService; 