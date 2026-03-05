import axios from 'axios';
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
    this.apiToken = (process.env.CRYPTOPAY_API_TOKEN || '').trim();
    this.isTestnet = process.env.CRYPTOPAY_TESTNET === 'true';
    
    this.baseUrl = this.isTestnet
      ? 'https://testnet-pay.crypt.bot/api'
      : 'https://pay.crypt.bot/api';

    if (!this.apiToken) {
      logger.error('❌ CRYPTOPAY_API_TOKEN is missing in .env');
    } else {
      const masked = `${this.apiToken.substring(0, 6)}...${this.apiToken.substring(this.apiToken.length - 4)}`;
      logger.info(`✅ CryptoPayService initialized (${this.isTestnet ? 'TESTNET' : 'MAINNET'}), Token: ${masked}`);
      
      // Perform background health check
      this.validateToken();
    }
  }

  /**
   * Validate API Token
   */
  async validateToken() {
    try {
      const result = await this.makeRequest('getMe');
      logger.info(`✅ CryptoPay Token is valid. Bot: ${result.name} (@${result.username})`);
    } catch (error) {
      logger.error('❌ CryptoPay Token validation failed:', error.message);
    }
  }

  /**
   * Make API request to CryptoPay
   */
  async makeRequest(method, params = {}) {
    try {
      // CryptoPay supports both GET and POST. 
      // For createInvoice and similar, POST with JSON body is more reliable.
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/${method}`,
        data: params,
        headers: {
          'Crypto-Pay-API-Token': this.apiToken,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const data = response.data;

      if (!data.ok) {
        logger.error(`CryptoPay API Error (${method}):`, data.error);
        
        if (data.error?.name === 'UNAUTHORIZED') {
          throw new PaymentError('CryptoPay error: UNAUTHORIZED. Please verify your CRYPTOPAY_API_TOKEN in .env and ensure CRYPTOPAY_TESTNET matches your token type.');
        }
        
        throw new PaymentError(`CryptoPay error: ${data.error?.name || 'Unknown Error'}`);
      }

      return data.result;
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        logger.error(`CryptoPay ${method} Failed (${error.response.status}):`, errorData);
        
        if (errorData?.error?.name === 'UNAUTHORIZED' || error.response.status === 401) {
          throw new PaymentError('CryptoPay error: UNAUTHORIZED. Check your API Token and TESTNET setting.');
        }
        
        throw new PaymentError(`CryptoPay error: ${errorData?.error?.name || error.message}`);
      }
      
      logger.error(`CryptoPay ${method} network/system failed:`, error.message);
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