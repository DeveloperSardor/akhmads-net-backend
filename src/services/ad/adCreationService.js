// src/services/ad/adCreationService.js
import prisma from '../../config/database.js';
import adService from './adService.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { LIMITS } from '../../config/constants.js';

/**
 * Ad Creation Service
 * Handles ad creation workflow with validation
 */
class AdCreationService {
  /**
   * Validate ad content
   */
  validateAdContent(data) {
    const errors = [];

    // ✅ Title validation - OPTIONAL (will auto-generate if empty)
    if (data.title && data.title.length > 0 && data.title.length < 3) {
      errors.push('Title must be at least 3 characters if provided');
    }
    if (data.title?.length > 100) {
      errors.push('Title must not exceed 100 characters');
    }

    // Text validation
    if (!data.text || data.text.length < 10) {
      errors.push('Text must be at least 10 characters');
    }
    if (data.text?.length > LIMITS.MAX_AD_TEXT_LENGTH) {
      errors.push(`Text must not exceed ${LIMITS.MAX_AD_TEXT_LENGTH} characters`);
    }

    // Button validation
    if (data.buttons && data.buttons.length > LIMITS.MAX_BUTTONS_PER_AD) {
      errors.push(`Maximum ${LIMITS.MAX_BUTTONS_PER_AD} buttons allowed`);
    }

    // Poll validation
    if (data.poll) {
      if (!data.poll.question || data.poll.question.length < 3) {
        errors.push('Poll question is required');
      }
      if (!data.poll.options || data.poll.options.length < 2) {
        errors.push('Poll must have at least 2 options');
      }
      if (data.poll.options?.length > LIMITS.MAX_POLL_OPTIONS) {
        errors.push(`Poll can have maximum ${LIMITS.MAX_POLL_OPTIONS} options`);
      }
    }

    // Impressions validation
    if (data.targetImpressions < LIMITS.MIN_AD_IMPRESSIONS) {
      errors.push(`Minimum ${LIMITS.MIN_AD_IMPRESSIONS} impressions required`);
    }
    if (data.targetImpressions > LIMITS.MAX_AD_IMPRESSIONS) {
      errors.push(`Maximum ${LIMITS.MAX_AD_IMPRESSIONS} impressions allowed`);
    }

    return errors;
  }

  /**
   * Auto-generate title from text
   */
  generateTitle(text) {
    if (!text) return 'New Advertisement';
    
    // Remove emojis and special chars
    let cleanText = text.replace(/[^\w\s]/g, '').trim();
    
    // Take first 50 chars
    let title = cleanText.slice(0, 50).trim();
    
    // If empty after cleaning, use default
    if (!title) {
      title = 'New Advertisement';
    }
    
    return title;
  }

  /**
   * Create ad with full validation
   */
  async createAdWithValidation(advertiserId, data) {
    try {
      // ✅ Auto-generate title if not provided
      if (!data.title || data.title.trim().length === 0) {
        data.title = this.generateTitle(data.text);
      }

      // Validate content
      const validationErrors = this.validateAdContent(data);
      if (validationErrors.length > 0) {
        throw new ValidationError(validationErrors.join(', '));
      }

      // Create ad using main service
      const ad = await adService.createAd(advertiserId, data);

      logger.info(`Ad created with validation: ${ad.id}`);
      return ad;
    } catch (error) {
      logger.error('Create ad with validation failed:', error);
      throw error;
    }
  }

  /**
   * Generate preview data
   */
  async generatePreview(data) {
    try {
      // Prepare message preview
      let text = data.text;

      // Replace variables
      text = text.replace(/{username}/g, '@example_user');
      text = text.replace(/{first_name}/g, 'John');
      text = text.replace(/{user_id}/g, '123456789');

      // Add buttons preview
      let buttons = [];
      if (data.buttons) {
        buttons = data.buttons.map(btn => ({
          text: btn.text,
          url: btn.url,
        }));
      }

      return {
        text,
        buttons,
        contentType: data.contentType,
        mediaUrl: data.mediaUrl,
        poll: data.poll,
      };
    } catch (error) {
      logger.error('Generate preview failed:', error);
      throw error;
    }
  }
}

const adCreationService = new AdCreationService();
export default adCreationService;