import { nanoid } from 'nanoid';
import prisma from '../../config/database.js';
import redis from '../../config/redis.js';
import hash from '../../utils/hash.js';
import jwtUtil from '../../utils/jwt.js';
import logger from '../../utils/logger.js';
import { AuthenticationError, NotFoundError } from '../../utils/errors.js';

/**
 * Telegram Authentication Service
 * ✅ Generates 1 correct code + 3 fake codes (total 4 codes)
 * ✅ Saves firstName, lastName, username, avatarUrl from Telegram
 */
class TelegramAuthService {
  /**
   * Initiate login session
   */
  async initiateLogin(ipAddress, userAgent) {
    try {
      const loginToken = nanoid(32);
      const { codes, correctCode } = hash.generateLoginCodes();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      console.log('🔍 Creating session:', { loginToken, correctCode, codes });

      // ✅ Store codes in database
      const session = await prisma.loginSession.create({
        data: {
          token: loginToken,
          correctCode,
          codes: JSON.stringify(codes),
          ipAddress,
          userAgent,
          expiresAt,
        },
      });

      // ✅ CRITICAL: Store codes in Redis for bot handler (5 minutes TTL)
      await redis.set(
        `login_codes:${loginToken}`,
        JSON.stringify(codes),
        300 // 5 minutes
      );

      console.log('✅ Session created:', session);
      console.log('✅ Codes stored in Redis:', `login_codes:${loginToken}`);

      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'akhmadsnetbot';
      const deepLink = `https://t.me/${botUsername}?start=login_${loginToken}`;

      logger.info(`Login session initiated: ${loginToken}`);

      return {
        loginToken,
        deepLink,
        code: correctCode,
        codes,
        expiresAt,
        expiresIn: 300,
      };
    } catch (error) {
      logger.error('Failed to initiate login:', error);
      throw error;
    }
  }

  /**
   * Verify login code
   * ✅ NOW accepts telegramUser data including avatar
   */
  async verifyLogin(loginToken, telegramId, code, telegramUser = {}) {
    try {
      // Find login session
      const session = await prisma.loginSession.findUnique({
        where: { token: loginToken },
      });

      if (!session) {
        throw new NotFoundError('Login session not found');
      }

      // Check if expired
      if (new Date() > session.expiresAt) {
        throw new AuthenticationError('Login session expired');
      }

      // Check if already authorized
      if (session.authorized) {
        throw new AuthenticationError('Login session already used');
      }

      // ✅ Verify code
      if (code !== session.correctCode) {
        logger.warn(`Wrong code entered for session ${loginToken}`);
        throw new AuthenticationError('Incorrect code');
      }

      // Update session
      await prisma.loginSession.update({
        where: { token: loginToken },
        data: {
          telegramId,
          authorized: true,
        },
      });

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user) {
        // ✅ CREATE USER WITH TELEGRAM DATA + AVATAR
        user = await prisma.user.create({
          data: {
            telegramId,
            firstName: telegramUser.first_name || null,
            lastName: telegramUser.last_name || null,
            username: telegramUser.username || null,
            avatarUrl: telegramUser.photo_url || null,  // ✅ AVATAR
            locale: telegramUser.language_code || 'en',
            role: 'ADVERTISER',
            roles: ['ADVERTISER', 'BOT_OWNER'],  // ✅ Fixed typo: ADVERTISER
            isActive: true,
          },
        });

        await prisma.wallet.create({
          data: { userId: user.id },
        });

        logger.info(`New user created: ${user.id} (${user.firstName} ${user.lastName})`);
      } else {
        // ✅ UPDATE EXISTING USER if Telegram data changed
        const needsUpdate =
          telegramUser.first_name !== user.firstName ||
          telegramUser.last_name !== user.lastName ||
          telegramUser.username !== user.username ||
          telegramUser.photo_url !== user.avatarUrl;  // ✅ Check avatar changes

        if (needsUpdate) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              firstName: telegramUser.first_name || user.firstName,
              lastName: telegramUser.last_name || user.lastName,
              username: telegramUser.username || user.username,
              avatarUrl: telegramUser.photo_url || user.avatarUrl,  // ✅ UPDATE AVATAR
            },
          });
          logger.info(`User data updated: ${user.id}`);
        }
      }

      if (user.isBanned) {
        throw new AuthenticationError('Your account has been banned');
      }

      if (!user.isActive) {
        throw new AuthenticationError('Your account is inactive');
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: session.ipAddress,
        },
      });

      // Generate JWT tokens
      const tokens = jwtUtil.generateTokenPair(user);

      // Store refresh token in Redis
      await redis.set(
        `refresh_token:${user.id}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      // ✅ Clean up login codes from Redis
      await redis.del(`login_codes:${loginToken}`);

      logger.info(`User logged in: ${user.id}`);

      return {
        user: {
          id: user.id,
          telegramId: user.telegramId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          roles: user.roles,  // ✅ Include roles array
          avatarUrl: user.avatarUrl,  // ✅ Include avatar
          locale: user.locale,
        },
        tokens,
      };
    } catch (error) {
      logger.error('Login verification failed:', error);
      throw error;
    }
  }

  /**
   * Verify Widget Login (from bot URL button)
   * Finds or creates user, returns JWT tokens directly
   */
  async verifyWidgetLogin(telegramId, telegramUser = {}) {
    try {
      let user = await prisma.user.findUnique({
        where: { telegramId },
        include: { wallet: true },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId,
            firstName: telegramUser.first_name || null,
            lastName: telegramUser.last_name || null,
            username: telegramUser.username || null,
            avatarUrl: telegramUser.photo_url || null,
            locale: telegramUser.language_code || 'en',
            role: 'ADVERTISER',
            roles: ['ADVERTISER'],
            isActive: true,
          },
        });
        await prisma.wallet.create({ data: { userId: user.id } });
        logger.info(`New user via widget login: ${user.id}`);
      } else {
        const needsUpdate =
          telegramUser.first_name !== user.firstName ||
          telegramUser.last_name !== user.lastName ||
          telegramUser.username !== user.username ||
          (telegramUser.photo_url && telegramUser.photo_url !== user.avatarUrl);

        if (needsUpdate) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              firstName: telegramUser.first_name || user.firstName,
              lastName: telegramUser.last_name || user.lastName,
              username: telegramUser.username || user.username,
              avatarUrl: telegramUser.photo_url || user.avatarUrl,
            },
          });
        }
      }

      if (user.isBanned) throw new AuthenticationError('Account is banned');
      if (!user.isActive) throw new AuthenticationError('Account is inactive');

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const tokens = jwtUtil.generateTokenPair(user);
      await redis.set(`refresh_token:${user.id}`, tokens.refreshToken, 7 * 24 * 60 * 60);

      logger.info(`Widget login success: ${user.id}`);

      return {
        user: {
          id: user.id,
          telegramId: user.telegramId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          roles: user.roles,
          avatarUrl: user.avatarUrl,
          locale: user.locale,
        },
        tokens,
      };
    } catch (error) {
      logger.error('Widget login failed:', error);
      throw error;
    }
  }

  /**
   * Check login status (for polling)
   */
  async checkLoginStatus(loginToken) {
    try {
      const session = await prisma.loginSession.findUnique({
        where: { token: loginToken },
      });

      if (!session) {
        throw new NotFoundError('Login session not found');
      }

      // Check if expired
      if (new Date() > session.expiresAt) {
        return { authorized: false, expired: true };
      }

      // If not authorized yet
      if (!session.authorized) {
        return { authorized: false, expired: false };
      }

      // If authorized, get user and tokens
      const user = await prisma.user.findUnique({
        where: { telegramId: session.telegramId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Generate tokens
      const tokens = jwtUtil.generateTokenPair(user);

      // Store refresh token
      await redis.set(
        `refresh_token:${user.id}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      return {
        authorized: true,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          roles: user.roles,  // ✅ Include roles array
          avatarUrl: user.avatarUrl,  // ✅ Include avatar
          locale: user.locale,
        },
        tokens,
      };
    } catch (error) {
      logger.error('Check login status failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwtUtil.verify(refreshToken);

      // Check if token exists in Redis
      const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

      if (!storedToken || storedToken !== refreshToken) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || user.isBanned || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Generate new tokens
      const tokens = jwtUtil.generateTokenPair(user);

      // Update refresh token in Redis
      await redis.set(
        `refresh_token:${user.id}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      logger.info(`Token refreshed for user: ${user.id}`);

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(userId) {
    try {
      // Delete refresh token from Redis
      await redis.del(`refresh_token:${userId}`);

      logger.info(`User logged out: ${userId}`);

      return true;
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }
}

const telegramAuthService = new TelegramAuthService();
export default telegramAuthService;