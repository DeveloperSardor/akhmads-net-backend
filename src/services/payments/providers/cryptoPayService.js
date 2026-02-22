// src/services/payments/providers/cryptoPayService.js
import crypto from 'crypto';
import logger from '../../../utils/logger.js';
import { PaymentError } from '../../../utils/errors.js';

/**
 * CryptoPay Service
 * Telegram's @CryptoBot payment gateway
 * Docs: https://help.crypt.bot/crypto-pay-api
 */
class CryptoPayService {
  constructor() {
    this.apiToken = process.env.CRYPTOPAY_API_TOKEN;
    this.isTestnet = process.env.CRYPTOPAY_TESTNET === 'true';
    
    this.baseUrl = this.isTestnet
      ? 'https://testnet-pay.crypt.bot/api'
      : 'https://pay.crypt.bot/api';
  }

  /**
   * Make API request to CryptoPay
   * CryptoPay uses GET with query params
   */
  async makeRequest(method, params = {}) {
    try {
      // Build query string
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      }
      
      const queryString = queryParams.toString();
      const url = queryString 
        ? `${this.baseUrl}/${method}?${queryString}`
        : `${this.baseUrl}/${method}`;
      
      logger.info(`CryptoPay API call: ${method}`, { url: `${this.baseUrl}/${method}` });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Crypto-Pay-API-Token': this.apiToken,
        },
      });

      const data = await response.json();

      if (!data.ok) {
        logger.error(`CryptoPay ${method} error:`, data.error);
        throw new PaymentError(data.error?.name || 'CryptoPay API error');
      }

      return data.result;
    } catch (error) {
      logger.error(`CryptoPay ${method} failed:`, error);
      throw new PaymentError(`CryptoPay error: ${error.message}`);
    }
  }

  /**
   * Create invoice for deposit
   */
  async createInvoice(transactionId, amountUsd) {
    try {
      const invoice = await this.makeRequest('createInvoice', {
        currency_type: 'fiat',
        fiat: 'USD',
        amount: amountUsd.toString(),
        description: `Deposit to Akhmads.net - $${amountUsd}`,
        payload: transactionId,
        accepted_assets: 'USDT,TON,BTC,ETH',
        expires_in: 3600,
      });

      logger.info(`CryptoPay invoice created: ${invoice.invoice_id}`);

      return {
        invoiceId: invoice.invoice_id,
        paymentUrl: invoice.bot_invoice_url,
        miniAppUrl: invoice.mini_app_invoice_url,
        webAppUrl: invoice.web_app_invoice_url,
        amount: amountUsd,
        status: invoice.status,
        createdAt: invoice.created_at,
        expiresAt: invoice.expiration_date,
      };
    } catch (error) {
      logger.error('CryptoPay create invoice failed:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!signature) {
        logger.warn('CryptoPay webhook missing signature');
        return false;
      }

      const secret = crypto
        .createHash('sha256')
        .update(this.apiToken)
        .digest();

      const bodyString = JSON.stringify(body);
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      return hmac === signature;
    } catch (error) {
      logger.error('CryptoPay verify signature failed:', error);
      return false;
    }
  }

  /**
   * Process webhook
   */
  async processWebhook(signature, body) {
    try {
      if (!this.verifyWebhookSignature(body, signature)) {
        throw new PaymentError('Invalid webhook signature');
      }

      const { update_type, payload } = body;

      if (update_type !== 'invoice_paid') {
        return null;
      }

      const invoice = payload;

      return {
        transactionId: invoice.payload,
        invoiceId: invoice.invoice_id,
        amount: parseFloat(invoice.amount),
        paidAsset: invoice.paid_asset,
        paidAmount: parseFloat(invoice.paid_amount),
        status: 'SUCCESS',
        metadata: {
          invoice_id: invoice.invoice_id,
          paid_asset: invoice.paid_asset,
          paid_amount: invoice.paid_amount,
        },
      };
    } catch (error) {
      logger.error('CryptoPay process webhook failed:', error);
      throw error;
    }
  }
}

const cryptoPayService = new CryptoPayService();
export default cryptoPayService;