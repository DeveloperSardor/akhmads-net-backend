// src/utils/encryption.js
import CryptoJS from 'crypto-js';
import logger from './logger.js';

/**
 * AES-256-GCM Encryption Utility
 * Used for encrypting bot tokens and sensitive data
 */
class Encryption {
  constructor() {
    this.key = process.env.ENCRYPTION_KEY;
    this.iv = process.env.ENCRYPTION_IV;

    if (!this.key || !this.iv) {
      throw new Error('ENCRYPTION_KEY and ENCRYPTION_IV must be set');
    }

    if (this.key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 characters (32 bytes hex)');
    }

    if (this.iv.length !== 32) {
      throw new Error('ENCRYPTION_IV must be 32 characters (16 bytes hex)');
    }
  }

  /**
   * Encrypt data
   * @param {string} text - Plain text to encrypt
   * @returns {string} - Encrypted text (base64)
   */
  encrypt(text) {
    try {
      const key = CryptoJS.enc.Hex.parse(this.key);
      const iv = CryptoJS.enc.Hex.parse(this.iv);

      const encrypted = CryptoJS.AES.encrypt(text, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return encrypted.toString();
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data
   * @param {string} encryptedText - Encrypted text (base64)
   * @returns {string} - Decrypted plain text
   */
  decrypt(encryptedText) {
    try {
      const key = CryptoJS.enc.Hex.parse(this.key);
      const iv = CryptoJS.enc.Hex.parse(this.iv);

      const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash data (one-way, for API keys)
   * @param {string} text - Text to hash
   * @returns {string} - SHA256 hash
   */
  hash(text) {
    return CryptoJS.SHA256(text).toString();
  }
}

const encryption = new Encryption();
export default encryption;