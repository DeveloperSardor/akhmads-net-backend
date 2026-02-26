import axios from 'axios';
import logger from './logger.js';
import { ExternalServiceError } from './errors.js';

/**
 * Telegram Bot API Helper
 * Wrapper for Telegram Bot API calls
 */
class TelegramAPI {
  constructor() {
    this.baseURL = 'https://api.telegram.org';
  }

  /**
   * Get bot info
   * @param {string} token - Bot token
   * @returns {Promise<object>} - Bot info
   */
  async getMe(token) {
    try {
      const response = await axios.get(
        `${this.baseURL}/bot${token}/getMe`,
        { timeout: 10000 }
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to get bot info');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram getMe error:', error.message);
      throw new ExternalServiceError(
        'Failed to verify bot token with Telegram',
        'telegram'
      );
    }
  }

  /**
   * Get bot profile photo URL
   * @param {string} token - Bot token
   * @param {string} botId - Bot ID (usually extracted from getMe)
   * @returns {Promise<string|null>} - URL of the bot's profile photo or null
   */
  async getBotProfilePhotoUrl(token) {
    try {
      // 1. Get the bot's profile photos using getMe and getUserProfilePhotos
      const botMe = await this.getMe(token);
      
      const photosResponse = await axios.get(
        `${this.baseURL}/bot${token}/getUserProfilePhotos`,
        { 
          params: { user_id: botMe.id, limit: 1 },
          timeout: 10000 
        }
      );

      if (!photosResponse.data.ok) {
        throw new Error(photosResponse.data.description || 'Failed to get user profile photos');
      }

      const photos = photosResponse.data.result.photos;
      if (!photos || photos.length === 0 || photos[0].length === 0) {
        return null; // No profile photo found
      }

      // Get the highest resolution photo (usually the last in the array)
      const fileId = photos[0][photos[0].length - 1].file_id;

      // 2. Get the file path
      const fileResponse = await axios.get(
        `${this.baseURL}/bot${token}/getFile`,
        { 
          params: { file_id: fileId },
          timeout: 10000 
        }
      );

      if (!fileResponse.data.ok) {
        throw new Error(fileResponse.data.description || 'Failed to get file info');
      }

      const filePath = fileResponse.data.result.file_path;

      // 3. Construct the full URL
      return `https://api.telegram.org/file/bot${token}/${filePath}`;
    } catch (error) {
      logger.error('Telegram getBotProfilePhotoUrl error:', error.message);
      return null; // Fail gracefully, don't break registration if picture fetch fails
    }
  }

  /**
   * Send message
   * @param {string} token - Bot token
   * @param {object} params - Message parameters
   * @returns {Promise<object>} - Sent message
   */
  async sendMessage(token, params) {
    try {
      const response = await axios.post(
        `${this.baseURL}/bot${token}/sendMessage`,
        params,
        { timeout: 15000 }
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send message');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram sendMessage error:', error.message);
      
      // Check for specific errors
      if (error.response?.data?.description) {
        const description = error.response.data.description;
        
        if (description.includes('bot was blocked')) {
          throw new Error('USER_BLOCKED_BOT');
        }
        if (description.includes('chat not found')) {
          throw new Error('CHAT_NOT_FOUND');
        }
        if (description.includes('Too Many Requests')) {
          throw new Error('RATE_LIMITED');
        }
      }

      throw new ExternalServiceError(
        'Failed to send message via Telegram',
        'telegram'
      );
    }
  }

  /**
   * Send photo
   * @param {string} token - Bot token
   * @param {object} params - Photo parameters
   * @returns {Promise<object>} - Sent message
   */
  async sendPhoto(token, params) {
    try {
      const response = await axios.post(
        `${this.baseURL}/bot${token}/sendPhoto`,
        params,
        { timeout: 30000 } // Longer timeout for media
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send photo');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram sendPhoto error:', error.message);
      throw new ExternalServiceError(
        'Failed to send photo via Telegram',
        'telegram'
      );
    }
  }

  /**
   * Send video
   * @param {string} token - Bot token
   * @param {object} params - Video parameters
   * @returns {Promise<object>} - Sent message
   */
  async sendVideo(token, params) {
    try {
      const response = await axios.post(
        `${this.baseURL}/bot${token}/sendVideo`,
        params,
        { timeout: 60000 } // Even longer for videos
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send video');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram sendVideo error:', error.message);
      throw new ExternalServiceError(
        'Failed to send video via Telegram',
        'telegram'
      );
    }
  }

  /**
   * Send poll
   * @param {string} token - Bot token
   * @param {object} params - Poll parameters
   * @returns {Promise<object>} - Sent message
   */
  async sendPoll(token, params) {
    try {
      const response = await axios.post(
        `${this.baseURL}/bot${token}/sendPoll`,
        params,
        { timeout: 15000 }
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to send poll');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram sendPoll error:', error.message);
      throw new ExternalServiceError(
        'Failed to send poll via Telegram',
        'telegram'
      );
    }
  }

  /**
   * Get chat member count
   * @param {string} token - Bot token
   * @param {string} chatId - Chat ID
   * @returns {Promise<number>} - Member count
   */
  async getChatMemberCount(token, chatId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/bot${token}/getChatMemberCount`,
        { 
          params: { chat_id: chatId },
          timeout: 10000 
        }
      );

      if (!response.data.ok) {
        throw new Error(response.data.description || 'Failed to get member count');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Telegram getChatMemberCount error:', error.message);
      return 0; // Return 0 if can't get count
    }
  }

  /**
   * Parse user info from Telegram user object
   * @param {object} user - Telegram user object
   * @returns {object} - Parsed user info
   */
  parseUserInfo(user) {
    return {
      telegramUserId: user.id.toString(),
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      languageCode: user.language_code || 'uz',
    };
  }
}

const telegramAPI = new TelegramAPI();
export default telegramAPI;