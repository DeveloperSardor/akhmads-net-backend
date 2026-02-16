import axios from 'axios';
import crypto from 'crypto';
import logger from '../../../utils/logger.js';
import { PaymentError } from '../../../utils/errors.js';

/**
 * NOWPayments Service
 * Cryptocurrency payment gateway
 * Docs: https://documenter.getpostman.com/view/7907941/S1a32n38
 */
class NowPaymentsService {
  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY;
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    this.isSandbox = process.env.NOWPAYMENTS_SANDBOX === 'true';
    this.baseUrl = this.isSandbox
      ? 'https://api-sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';
  }

  /**
   * Get available currencies
   */
  async getAvailableCurrencies() {
    try {
      const response = await axios.get(`${this.baseUrl}/currencies`, {
        headers: { 'x-api-key': this.apiKey },
      });

      return response.data.currencies;
    } catch (error) {
      logger.error('Get currencies failed:', error);
      throw new PaymentError('Failed to get available currencies');
    }
  }

  /**
   * Get minimum payment amount
   */
  async getMinimumAmount(currency) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/min-amount?currency_from=${currency}&currency_to=usd`,
        {
          headers: { 'x-api-key': this.apiKey },
        }
      );

      return response.data.min_amount;
    } catch (error) {
      logger.error('Get minimum amount failed:', error);
      return null;
    }
  }

  /**
   * Create payment
   */
  async createPayment(data) {
    try {
      const { userId, amount, coin, network, transactionId } = data;

      const response = await axios.post(
        `${this.baseUrl}/payment`,
        {
          price_amount: amount,
          price_currency: 'usd',
          pay_currency: coin.toLowerCase(),
          ipn_callback_url: `${process.env.APP_URL}/api/v1/webhooks/nowpayments`,
          order_id: transactionId,
          order_description: `Deposit $${amount}`,
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const payment = response.data;

      logger.info(`NOWPayments payment created: ${payment.payment_id}`);

      return {
        paymentId: payment.payment_id,
        paymentUrl: payment.invoice_url || `https://nowpayments.io/payment/?iid=${payment.payment_id}`,
        address: payment.pay_address,
        amount: payment.pay_amount,
        currency: payment.pay_currency,
        expiresAt: payment.expiration_estimate_date,
      };
    } catch (error) {
      logger.error('NOWPayments create payment failed:', error);
      throw new PaymentError('Failed to create crypto payment');
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
        headers: { 'x-api-key': this.apiKey },
      });

      return response.data;
    } catch (error) {
      logger.error('Get payment status failed:', error);
      return null;
    }
  }

  /**
   * Verify IPN signature
   */
  verifyIpnSignature(body, signature) {
    try {
      const hmac = crypto
        .createHmac('sha512', this.ipnSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      return hmac === signature;
    } catch (error) {
      logger.error('IPN signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process IPN webhook
   */
  async processIpn(signature, body) {
    try {
      // Verify signature
      if (!this.verifyIpnSignature(body, signature)) {
        logger.warn('Invalid IPN signature');
        return { success: false, error: 'Invalid signature' };
      }

      const {
        payment_id,
        payment_status,
        pay_amount,
        actually_paid,
        price_amount,
        order_id,
        outcome_amount,
      } = body;

      const prisma = (await import('../../../config/database.js')).default;

      // Find transaction
      const transaction = await prisma.transaction.findUnique({
        where: { id: order_id },
      });

      if (!transaction) {
        logger.warn(`Transaction not found: ${order_id}`);
        return { success: false, error: 'Transaction not found' };
      }

      // Update transaction
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          providerTxId: payment_id.toString(),
          amountCrypto: actually_paid || pay_amount,
          metadata: JSON.stringify(body),
        },
      });

      // Handle payment status
      if (payment_status === 'finished' || payment_status === 'confirmed') {
        // Mark as success
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'SUCCESS' },
        });

        // Credit wallet
        const walletService = (await import('../../wallet/walletService.js')).default;
        await walletService.credit(
          transaction.userId,
          parseFloat(price_amount),
          'DEPOSIT',
          transaction.id
        );

        logger.info(`Crypto payment completed: ${order_id}`);
      } else if (
        payment_status === 'failed' ||
        payment_status === 'expired' ||
        payment_status === 'refunded'
      ) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });

        logger.info(`Crypto payment failed: ${order_id}, status: ${payment_status}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('Process IPN failed:', error);
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Create payout (for withdrawals)
   */
  async createPayout(data) {
    try {
      const { address, amount, coin, withdrawalId } = data;

      const response = await axios.post(
        `${this.baseUrl}/payout`,
        {
          withdrawals: [
            {
              address,
              currency: coin.toLowerCase(),
              amount,
              extra_id: withdrawalId,
            },
          ],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`Crypto payout created: ${withdrawalId}`);

      return response.data;
    } catch (error) {
      logger.error('Create payout failed:', error);
      throw new PaymentError('Failed to create crypto payout');
    }
  }
}

const nowpaymentsService = new NowPaymentsService();
export default nowpaymentsService;