// src/services/payments/providers/cryptoPayService.js
import crypto from 'crypto';
import logger from '../../../utils/logger.js';
import { PaymentError } from '../../../utils/errors.js';

/**
 * CryptoPay Service
 * Telegram's @CryptoBot payment gateway
 * Docs: https://help.crypt.bot/crypto-pay-api
 * 
 * Supports: USDT, TON, BTC, ETH, LTC, BNB, TRX, USDC
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
   */
  async makeRequest(method, params = {}) {
    try {
      const url = `${this.baseUrl}/${method}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Crypto-Pay-API-Token': this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.ok) {
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
   * Returns payment URL user should open
   */
  async createInvoice(transactionId, amountUsd) {
    try {
      const invoice = await this.makeRequest('createInvoice', {
        currency_type: 'fiat',
        fiat: 'USD',
        amount: amountUsd.toString(),
        description: `Deposit to Akhmads.net - $${amountUsd}`,
        payload: transactionId, // Our transaction ID
        accepted_assets: 'USDT,TON,BTC,ETH', // Which cryptos to accept
        expires_in: 3600, // 1 hour
      });

      logger.info(`CryptoPay invoice created: ${invoice.invoice_id} for transaction: ${transactionId}`);

      return {
        invoiceId: invoice.invoice_id,
        paymentUrl: invoice.bot_invoice_url, // User opens this
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
   * Get invoice status
   */
  async getInvoice(invoiceId) {
    try {
      const invoices = await this.makeRequest('getInvoices', {
        invoice_ids: invoiceId,
      });

      if (!invoices || invoices.length === 0) {
        throw new PaymentError('Invoice not found');
      }

      return invoices[0];
    } catch (error) {
      logger.error('CryptoPay get invoice failed:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * CryptoPay signs webhooks with HMAC-SHA256
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!signature) {
        logger.warn('CryptoPay webhook missing signature');
        return false;
      }

      // Create secret from API token (SHA256 hash)
      const secret = crypto
        .createHash('sha256')
        .update(this.apiToken)
        .digest();

      // Calculate HMAC
      const bodyString = JSON.stringify(body);
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const isValid = hmac === signature;

      if (!isValid) {
        logger.warn('CryptoPay webhook signature mismatch');
      }

      return isValid;
    } catch (error) {
      logger.error('CryptoPay verify signature failed:', error);
      return false;
    }
  }

  /**
   * Process webhook update
   */
  async processWebhook(signature, body) {
    try {
      // Verify signature
      if (!this.verifyWebhookSignature(body, signature)) {
        throw new PaymentError('Invalid webhook signature');
      }

      const { update_type, payload } = body;

      if (update_type !== 'invoice_paid') {
        logger.info(`CryptoPay webhook: ${update_type} - ignored`);
        return null;
      }

      // Extract invoice data
      const invoice = payload;

      logger.info(`CryptoPay invoice paid: ${invoice.invoice_id}`);

      return {
        transactionId: invoice.payload, // Our transaction ID
        invoiceId: invoice.invoice_id,
        amount: parseFloat(invoice.amount),
        paidAsset: invoice.paid_asset,
        paidAmount: parseFloat(invoice.paid_amount),
        fee: parseFloat(invoice.fee_amount || 0),
        status: 'SUCCESS',
        paidAt: invoice.paid_at,
        metadata: {
          invoice_id: invoice.invoice_id,
          hash: invoice.hash,
          paid_asset: invoice.paid_asset,
          paid_amount: invoice.paid_amount,
          paid_usd_rate: invoice.paid_usd_rate,
          fee_asset: invoice.fee_asset,
          fee_amount: invoice.fee_amount,
        },
      };
    } catch (error) {
      logger.error('CryptoPay process webhook failed:', error);
      throw error;
    }
  }

  /**
   * Get exchange rates
   */
  async getExchangeRates() {
    try {
      return await this.makeRequest('getExchangeRates');
    } catch (error) {
      logger.error('CryptoPay get rates failed:', error);
      throw error;
    }
  }

  /**
   * Get app balance
   */
  async getBalance() {
    try {
      return await this.makeRequest('getBalance');
    } catch (error) {
      logger.error('CryptoPay get balance failed:', error);
      throw error;
    }
  }

  /**
   * Get supported currencies
   */
  async getCurrencies() {
    try {
      return await this.makeRequest('getCurrencies');
    } catch (error) {
      logger.error('CryptoPay get currencies failed:', error);
      throw error;
    }
  }
}

const cryptoPayService = new CryptoPayService();
export default cryptoPayService;