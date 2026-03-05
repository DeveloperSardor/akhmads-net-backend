// src/services/auth/twoFactorService.js
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { AuthenticationError, NotFoundError } from '../../utils/errors.js';

class TwoFactorService {
  /**
   * Initialize 2FA for a user
   * Returns a secret and a QR code data URL
   */
  async setup(userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError('User not found');

      // Generate a new secret
      const secret = speakeasy.generateSecret({
        name: `Akhmads (${user.username || user.firstName || 'Admin'})`,
        issuer: 'Akhmads.net'
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      return {
        secret: secret.base32,
        qrCodeUrl
      };
    } catch (error) {
      logger.error('2FA setup failed:', error);
      throw error;
    }
  }

  /**
   * Confirm 2FA setup by verifying a code
   */
  async confirm(userId, secret, code) {
    try {
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1 // Allow 1-step window (30-60 secs)
      });

      if (!verified) {
        throw new AuthenticationError('Invalid 2FA code');
      }

      // Update user record
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: secret
        }
      });

      logger.info(`2FA enabled for user: ${userId}`);
      return true;
    } catch (error) {
      if (error.name === 'AuthenticationError') throw error;
      logger.error('2FA confirmation failed:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code during login
   */
  async verify(userId, code) {
    try {
      const user = await prisma.user.findUnique({ 
        where: { id: userId },
        select: { twoFactorEnabled: true, twoFactorSecret: true }
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        // If 2FA is not enabled, this check shouldn't have been called
        return true; 
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 1
      });

      if (!verified) {
        throw new AuthenticationError('Invalid 2FA code');
      }

      return true;
    } catch (error) {
       if (error.name === 'AuthenticationError') throw error;
      logger.error('2FA verification failed:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA
   */
  async disable(userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null
        }
      });
      logger.info(`2FA disabled for user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('2FA disable failed:', error);
      throw error;
    }
  }
}

export default new TwoFactorService();
