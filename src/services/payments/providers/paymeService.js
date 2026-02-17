import logger from '../../utils/logger.js';
import { PaymentError } from '../../utils/errors.js';

/**
 * Payme Payment Provider
 * Docs: https://developer.help.paycom.uz
 * 
 * FLOW:
 * 1. Frontend: POST /deposit/initiate → get paymentUrl
 * 2. User: Opens paymentUrl → pays on Payme
 * 3. Payme: CheckPerformTransaction → CreateTransaction → PerformTransaction
 * 4. Wallet: credited automatically on PerformTransaction
 */
class PaymeService {
  constructor() {
    this.merchantId = process.env.PAYME_MERCHANT_ID;
    this.secretKey = process.env.PAYME_SECRET_KEY;
    this.testSecretKey = process.env.PAYME_TEST_SECRET_KEY;
    this.isTest = process.env.PAYME_TEST_MODE === 'true';
    this.baseUrl = this.isTest 
      ? 'https://test.paycom.uz' 
      : 'https://checkout.paycom.uz';
    
    // 1 USD = UZS (update this or get from API)
    this.usdToUzs = parseFloat(process.env.USD_TO_UZS_RATE || '12700');
  }

  /**
   * Convert USD to tiyin (1 UZS = 100 tiyin)
   */
  usdToTiyin(usd) {
    return Math.round(usd * this.usdToUzs * 100);
  }

  /**
   * Convert tiyin to USD
   */
  tiyinToUsd(tiyin) {
    return tiyin / 100 / this.usdToUzs;
  }

  /**
   * Generate Payme checkout URL
   * User opens this URL to pay
   */
  createPaymentUrl(transactionId, amountUsd) {
    try {
      const amountTiyin = this.usdToTiyin(amountUsd);

      // Encode merchant data as Base64
      const params = Buffer.from(
        `m=${this.merchantId};ac.order_id=${transactionId};a=${amountTiyin}`
      ).toString('base64');

      const paymentUrl = `${this.baseUrl}/${params}`;

      logger.info(`Payme URL created: ${transactionId}, amount=${amountUsd}USD (${amountTiyin} tiyin)`);

      return paymentUrl;
    } catch (error) {
      logger.error('Payme create URL failed:', error);
      throw new PaymentError('Failed to create Payme payment URL');
    }
  }

  /**
   * Verify Payme Basic Auth header
   * Format: "Basic base64(Paycom:SECRET_KEY)"
   */
  verifyAuth(authHeader) {
    try {
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return false;
      }

      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      // Check test or production key
      const validKey = this.isTest ? this.testSecretKey : this.secretKey;
      
      return username === 'Paycom' && password === validKey;
    } catch (error) {
      logger.error('Payme auth verification failed:', error);
      return false;
    }
  }

  /**
   * Process Payme JSON-RPC request
   * Main entry point for all Payme callbacks
   */
  async processRequest(authHeader, body) {
    try {
      // Verify authorization
      if (!this.verifyAuth(authHeader)) {
        logger.warn('Payme unauthorized request');
        return this.errorResponse(body?.id, -32504, 'Unauthorized');
      }

      const { method, params, id } = body;

      logger.info(`Payme method: ${method}`);

      switch (method) {
        case 'CheckPerformTransaction':
          return await this.checkPerformTransaction(id, params);
        case 'CreateTransaction':
          return await this.createTransaction(id, params);
        case 'PerformTransaction':
          return await this.performTransaction(id, params);
        case 'CancelTransaction':
          return await this.cancelTransaction(id, params);
        case 'CheckTransaction':
          return await this.checkTransaction(id, params);
        case 'GetStatement':
          return await this.getStatement(id, params);
        default:
          return this.errorResponse(id, -32601, 'Method not found');
      }
    } catch (error) {
      logger.error('Payme process request failed:', error);
      return this.errorResponse(body?.id, -32400, 'Internal error');
    }
  }

  /**
   * CheckPerformTransaction
   * Payme asks: "Can I create this transaction?"
   * We check: order exists, amount matches
   */
  async checkPerformTransaction(id, params) {
    try {
      const { amount, account } = params;
      const transactionId = account.order_id;

      const prisma = (await import('../../config/database.js')).default;
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        logger.warn(`Payme: Order not found: ${transactionId}`);
        return this.errorResponse(id, -31050, 'Order not found');
      }

      if (transaction.status === 'SUCCESS') {
        return this.errorResponse(id, -31050, 'Order already paid');
      }

      // Verify amount (convert tiyin → USD and compare)
      const amountUsd = this.tiyinToUsd(amount);
      const expectedUsd = parseFloat(transaction.amount);
      const diff = Math.abs(amountUsd - expectedUsd);

      // Allow 1 cent tolerance for rounding
      if (diff > 0.01) {
        logger.warn(`Payme: Amount mismatch. Expected: ${expectedUsd}, Got: ${amountUsd}`);
        return this.errorResponse(id, -31001, 'Incorrect amount');
      }

      return {
        jsonrpc: '2.0',
        id,
        result: { allow: true },
      };
    } catch (error) {
      logger.error('Payme checkPerformTransaction failed:', error);
      return this.errorResponse(id, -31008, 'Error checking transaction');
    }
  }

  /**
   * CreateTransaction
   * Payme says: "I'm creating a transaction, save it"
   */
  async createTransaction(id, params) {
    try {
      const { amount, account, time } = params;
      const transactionId = account.order_id;

      const prisma = (await import('../../config/database.js')).default;
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        return this.errorResponse(id, -31050, 'Order not found');
      }

      // If already has providerTxId (duplicate request)
      if (transaction.providerTxId) {
        if (transaction.providerTxId !== params.id) {
          return this.errorResponse(id, -31050, 'Order already has transaction');
        }
        // Same transaction - idempotent response
        return {
          jsonrpc: '2.0',
          id,
          result: {
            create_time: transaction.createdAt.getTime(),
            transaction: params.id,
            state: 1,
          },
        };
      }

      // Save Payme transaction ID
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          providerTxId: params.id,
          status: 'PENDING',
          metadata: {
            payme_time: time,
            payme_amount: amount,
          },
        },
      });

      logger.info(`Payme transaction created: ${params.id} for order: ${transactionId}`);

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
      logger.error('Payme createTransaction failed:', error);
      return this.errorResponse(id, -31008, 'Error creating transaction');
    }
  }

  /**
   * PerformTransaction
   * Payme says: "Payment confirmed! Credit the user."
   */
  async performTransaction(id, params) {
    try {
      const prisma = (await import('../../config/database.js')).default;

      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      // Idempotent - already performed
      if (transaction.status === 'SUCCESS') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            transaction: params.id,
            perform_time: transaction.updatedAt.getTime(),
            state: 2,
          },
        };
      }

      const performTime = Date.now();

      // Update transaction status
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { 
          status: 'SUCCESS',
          metadata: {
            ...(transaction.metadata || {}),
            perform_time: performTime,
          },
        },
      });

      // ✅ CREDIT WALLET - Add funds to user's available balance
      const walletService = (await import('../wallet/walletService.js')).default;
      await walletService.credit(
        transaction.userId,
        parseFloat(transaction.amount),
        'DEPOSIT',
        transaction.id
      );

      logger.info(`✅ Payme payment completed: ${params.id}, amount=$${transaction.amount}, user=${transaction.userId}`);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: params.id,
          perform_time: performTime,
          state: 2,
        },
      };
    } catch (error) {
      logger.error('Payme performTransaction failed:', error);
      return this.errorResponse(id, -31008, 'Error performing transaction');
    }
  }

  /**
   * CancelTransaction
   * Payme says: "Payment cancelled/failed"
   */
  async cancelTransaction(id, params) {
    try {
      const prisma = (await import('../../config/database.js')).default;

      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      // Cannot cancel already performed transaction
      if (transaction.status === 'SUCCESS') {
        return this.errorResponse(id, -31007, 'Cannot cancel completed transaction');
      }

      const cancelTime = Date.now();

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { 
          status: 'FAILED',
          metadata: {
            ...(transaction.metadata || {}),
            cancel_time: cancelTime,
            cancel_reason: params.reason,
          },
        },
      });

      logger.info(`Payme transaction cancelled: ${params.id}, reason: ${params.reason}`);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          transaction: params.id,
          cancel_time: cancelTime,
          state: -1,
        },
      };
    } catch (error) {
      logger.error('Payme cancelTransaction failed:', error);
      return this.errorResponse(id, -31008, 'Error canceling transaction');
    }
  }

  /**
   * CheckTransaction
   * Payme asks: "What's the status of this transaction?"
   */
  async checkTransaction(id, params) {
    try {
      const prisma = (await import('../../config/database.js')).default;

      const transaction = await prisma.transaction.findFirst({
        where: { providerTxId: params.id },
      });

      if (!transaction) {
        return this.errorResponse(id, -31003, 'Transaction not found');
      }

      // State: 1=pending, 2=success, -1=cancelled
      let state = 1;
      let performTime = 0;
      let cancelTime = 0;

      if (transaction.status === 'SUCCESS') {
        state = 2;
        performTime = transaction.updatedAt.getTime();
      } else if (transaction.status === 'FAILED') {
        state = -1;
        cancelTime = transaction.updatedAt.getTime();
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          create_time: transaction.createdAt.getTime(),
          perform_time: performTime,
          cancel_time: cancelTime,
          transaction: params.id,
          state,
          reason: state === -1 ? 1 : null,
        },
      };
    } catch (error) {
      logger.error('Payme checkTransaction failed:', error);
      return this.errorResponse(id, -31008, 'Error checking transaction');
    }
  }

  /**
   * GetStatement
   * Payme asks: "Give me all transactions in this time range"
   */
  async getStatement(id, params) {
    try {
      const { from, to } = params;

      const prisma = (await import('../../config/database.js')).default;

      const transactions = await prisma.transaction.findMany({
        where: {
          provider: 'PAYME',
          providerTxId: { not: null },
          createdAt: {
            gte: new Date(from),
            lte: new Date(to),
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const statement = transactions.map(tx => {
        let state = 1;
        let performTime = 0;
        let cancelTime = 0;

        if (tx.status === 'SUCCESS') {
          state = 2;
          performTime = tx.updatedAt.getTime();
        } else if (tx.status === 'FAILED') {
          state = -1;
          cancelTime = tx.updatedAt.getTime();
        }

        return {
          id: tx.providerTxId,
          time: tx.createdAt.getTime(),
          amount: this.usdToTiyin(parseFloat(tx.amount)),
          account: { order_id: tx.id },
          create_time: tx.createdAt.getTime(),
          perform_time: performTime,
          cancel_time: cancelTime,
          transaction: tx.providerTxId,
          state,
          reason: state === -1 ? 1 : null,
        };
      });

      return {
        jsonrpc: '2.0',
        id,
        result: { transactions: statement },
      };
    } catch (error) {
      logger.error('Payme getStatement failed:', error);
      return this.errorResponse(id, -31008, 'Error getting statement');
    }
  }

  /**
   * Error response helper
   */
  errorResponse(id, code, message) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code,
        message: { uz: message, ru: message, en: message },
        data: null,
      },
    };
  }
}

const paymeService = new PaymeService();
export default paymeService;