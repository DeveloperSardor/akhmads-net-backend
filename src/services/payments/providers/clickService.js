import crypto from 'crypto';
import axios from 'axios';
import logger from '../../../utils/logger.js';
import { PaymentError } from '../../../utils/errors.js';

/**
 * Click Payment Provider
 * Uzbekistan's leading payment system
 * Docs: https://docs.click.uz
 */
class ClickService {
  constructor() {
    this.merchantId = process.env.CLICK_MERCHANT_ID;
    this.secretKey = process.env.CLICK_SECRET_KEY;
    this.serviceId = process.env.CLICK_SERVICE_ID;
    this.baseUrl = 'https://api.click.uz/v2';
  }

  /**
   * Generate payment URL
   */
  async createPayment(data) {
    try {
      const { userId, amount, transactionId } = data;

      // Create payment URL
      const params = new URLSearchParams({
        service_id: this.serviceId,
        merchant_id: this.merchantId,
        amount: amount,
        transaction_param: transactionId,
        return_url: `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      });

      const paymentUrl = `https://my.click.uz/services/pay?${params.toString()}`;

      logger.info(`Click payment created: ${transactionId}`);

      return {
        paymentUrl,
        transactionId,
      };
    } catch (error) {
      logger.error('Click create payment failed:', error);
      throw new PaymentError('Failed to create Click payment');
    }
  }

  /**
   * Verify webhook signature
   */
  verifySignature(params) {
    try {
      const {
        click_trans_id,
        service_id,
        merchant_trans_id,
        amount,
        action,
        sign_time,
        sign_string,
      } = params;

      // Build sign string
      const signString = `${click_trans_id}${service_id}${this.secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;

      // Generate MD5 hash
      const hash = crypto.createHash('md5').update(signString).digest('hex');

      return hash === sign_string;
    } catch (error) {
      logger.error('Click signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process webhook - Prepare
   */
  async processPrepare(params) {
    try {
      const {
        click_trans_id,
        merchant_trans_id,
        amount,
        action,
        error,
        error_note,
      } = params;

      // Verify signature
      if (!this.verifySignature(params)) {
        return {
          error: -1,
          error_note: 'Invalid signature',
        };
      }

      // Check if transaction exists
      const prisma = (await import('../../../config/database.js')).default;
      const transaction = await prisma.transaction.findUnique({
        where: { id: merchant_trans_id },
      });

      if (!transaction) {
        return {
          error: -5,
          error_note: 'Transaction not found',
        };
      }

      // Check if already processed
      if (transaction.status === 'SUCCESS') {
        return {
          error: -4,
          error_note: 'Already paid',
        };
      }

      // Check amount
      if (parseFloat(amount) !== parseFloat(transaction.amount)) {
        return {
          error: -2,
          error_note: 'Incorrect amount',
        };
      }

      // Success response
      return {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: transaction.id,
        error: 0,
        error_note: 'Success',
      };
    } catch (error) {
      logger.error('Click prepare failed:', error);
      return {
        error: -9,
        error_note: 'System error',
      };
    }
  }

  /**
   * Process webhook - Complete
   */
  async processComplete(params) {
    try {
      const {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        amount,
        action,
        error,
      } = params;

      // Verify signature
      if (!this.verifySignature(params)) {
        return {
          error: -1,
          error_note: 'Invalid signature',
        };
      }

      const prisma = (await import('../../../config/database.js')).default;
      
      // Get transaction
      const transaction = await prisma.transaction.findUnique({
        where: { id: merchant_trans_id },
      });

      if (!transaction) {
        return {
          error: -5,
          error_note: 'Transaction not found',
        };
      }

      // If payment failed
      if (error < 0) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'FAILED',
            providerTxId: click_trans_id,
          },
        });

        return {
          error: -9,
          error_note: 'Payment failed',
        };
      }

      // Update transaction
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          providerTxId: click_trans_id,
        },
      });

      // Credit wallet
      const walletService = (await import('../walletService.js')).default;
      await walletService.credit(transaction.userId, parseFloat(amount), 'DEPOSIT', transaction.id);

      logger.info(`Click payment completed: ${merchant_trans_id}`);

      return {
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: transaction.id,
        error: 0,
        error_note: 'Success',
      };
    } catch (error) {
      logger.error('Click complete failed:', error);
      return {
        error: -9,
        error_note: 'System error',
      };
    }
  }
}

const clickService = new ClickService();
export default clickService;