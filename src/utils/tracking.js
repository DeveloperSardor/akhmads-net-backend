import CryptoJS from 'crypto-js';
import { nanoid } from 'nanoid';
import logger from './logger.js';

/**
 * Click Tracking Token Generator
 * Creates encrypted tracking URLs for click analytics
 */
class Tracking {
  constructor() {
    this.secret = process.env.JWT_SECRET;
  }

  /**
   * Generate encrypted tracking token
   * @param {object} data - Tracking data
   * @param {string} data.adId - Ad ID
   * @param {string} data.botId - Bot ID
   * @param {string} data.originalUrl - Original destination URL
   * @param {string} data.telegramUserId - User's Telegram ID (optional)
   * @returns {string} - Encrypted token
   */
  generateToken(data) {
    try {
      const payload = {
        adId: data.adId,
        botId: data.botId,
        originalUrl: data.originalUrl,
        telegramUserId: data.telegramUserId || null,
        timestamp: Date.now(),
        nonce: nanoid(8),
      };

      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(payload),
        this.secret,
      ).toString();

      // URL-safe base64
      return encrypted
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } catch (error) {
      logger.error('Tracking token generation error:', error);
      throw new Error('Failed to generate tracking token');
    }
  }

  /**
   * Decrypt tracking token
   * @param {string} token - Encrypted token
   * @returns {object} - Decrypted data
   */
  decryptToken(token) {
    try {
      // Restore original base64
      const base64 = token
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        + '='.repeat((4 - (token.length % 4)) % 4);

      const decrypted = CryptoJS.AES.decrypt(base64, this.secret);
      const payload = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));

      return payload;
    } catch (error) {
      logger.error('Tracking token decryption error:', error);
      throw new Error('Invalid tracking token');
    }
  }

  /**
   * Generate tracking URL
   * @param {string} token - Encrypted token
   * @param {string} baseUrl - Base URL (e.g., https://akhmads.net)
   * @returns {string} - Full tracking URL
   */
  generateTrackingUrl(token, baseUrl = process.env.APP_URL) {
    return `${baseUrl}/t/${token}`;
  }

  /**
   * Wrap button URLs with tracking
   * @param {array} buttons - Array of button objects
   * @param {string} adId - Ad ID
   * @param {string} botId - Bot ID
   * @param {string} telegramUserId - Telegram user ID (optional)
   * @returns {array} - Buttons with tracking URLs
   */
  wrapButtonsWithTracking(buttons, adId, botId, telegramUserId = null) {
    if (!buttons || !Array.isArray(buttons)) {
      return [];
    }

    return buttons.map((button) => {
      if (!button.url) return button;

      const token = this.generateToken({
        adId,
        botId,
        originalUrl: button.url,
        telegramUserId,
      });

      return {
        ...button,
        url: this.generateTrackingUrl(token),
      };
    });
  }
}

const tracking = new Tracking();
export default tracking;