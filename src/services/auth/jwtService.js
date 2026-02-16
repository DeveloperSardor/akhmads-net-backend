import jwtUtil from '../../utils/jwt.js';
import redis, { redisClient } from '../../config/redis.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { AuthenticationError } from '../../utils/errors.js';

/**
 * JWT Service
 * Token generation and validation
 */
class JwtService {
  /**
   * Generate token pair
   */
  generateTokens(user) {
    return jwtUtil.generateTokenPair(user);
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token) {
    try {
      const decoded = jwtUtil.verify(token);
      
      // Check if user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || user.isBanned || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      return decoded;
    } catch (error) {
      logger.error('Verify access token failed:', error);
      throw error;
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwtUtil.verify(refreshToken);

      // Check if refresh token exists in Redis
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
      const tokens = this.generateTokens(user);

      // Store new refresh token
      await redis.set(
        `refresh_token:${user.id}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      logger.info(`Token refreshed for user: ${user.id}`);
      return tokens;
    } catch (error) {
      logger.error('Refresh token failed:', error);
      throw error;
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(userId) {
    try {
      await redis.del(`refresh_token:${userId}`);
      logger.info(`Refresh token revoked for user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Revoke refresh token failed:', error);
      throw error;
    }
  }
}

const jwtService = new JwtService();
export default jwtService;