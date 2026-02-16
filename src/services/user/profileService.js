import userService from './userService.js';
import logger from '../../utils/logger.js';

/**
 * Profile Service
 * User profile management
 */
class ProfileService {
  /**
   * Update user profile
   */
  async updateProfile(userId, data) {
    return await userService.updateProfile(userId, data);
  }

  /**
   * Update locale
   */
  async updateLocale(userId, locale) {
    try {
      const user = await userService.getUserById(userId);
      return await userService.updateProfile(userId, { locale });
    } catch (error) {
      logger.error('Update locale failed:', error);
      throw error;
    }
  }
}

const profileService = new ProfileService();
export default profileService;