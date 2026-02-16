import telegramAuthService from './telegramAuthService.js';
import jwtService from './jwtService.js';
import logger from '../../utils/logger.js';

/**
 * Main Auth Service
 * Orchestrates authentication flows
 */
class AuthService {
  /**
   * Login with Telegram
   */
  async loginWithTelegram(ipAddress, userAgent) {
    return await telegramAuthService.initiateLogin(ipAddress, userAgent);
  }

  /**
   * Verify login
   */
  async verifyLogin(loginToken, telegramId, code = null) {
    return await telegramAuthService.verifyLogin(loginToken, telegramId, code);
  }

  /**
   * Check login status
   */
  async checkLoginStatus(loginToken) {
    return await telegramAuthService.checkLoginStatus(loginToken);
  }

  /**
   * Refresh token
   */
  async refreshAccessToken(refreshToken) {
    return await jwtService.refreshToken(refreshToken);
  }

  /**
   * Logout
   */
  async logout(userId) {
    return await jwtService.revokeRefreshToken(userId);
  }

  /**
   * Validate access token
   */
  async validateToken(token) {
    return await jwtService.verifyAccessToken(token);
  }
}

const authService = new AuthService();
export default authService;