// src/services/ad/adMediaService.js - PROFESSIONAL VERSION
import storageService from '../storage/storageService.js';
import logger from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Ad Media Service - Professional
 * Handles image uploads to MinIO/S3
 */
class AdMediaService {
  /**
   * Upload base64 image
   */
  async uploadBase64Image(base64Data, advertiserId) {
    try {
      // Extract base64 content
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      
      if (!matches || matches.length !== 3) {
        throw new ValidationError('Invalid base64 image data');
      }

      const mimetype = matches[1];
      const base64Content = matches[2];
      const buffer = Buffer.from(base64Content, 'base64');

      // Validate size (5MB max)
      if (buffer.length > 5 * 1024 * 1024) {
        throw new ValidationError('Image size must be less than 5MB');
      }

      // Validate mimetype
      const validMimetypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validMimetypes.includes(mimetype)) {
        throw new ValidationError('Invalid image type. Only JPG, PNG, GIF, WEBP allowed');
      }

      // Get extension
      const ext = this.mimetypeToExtension(mimetype);
      
      // Generate filename with path: ads/userId/timestamp_random.ext
      const filename = storageService.generateFilename(`image.${ext}`, `ads/${advertiserId}`);

      // Upload to MinIO
      const result = await storageService.uploadFile({
        buffer,
        filename,
        mimetype,
      });

      logger.info(`✅ Base64 image uploaded: ${result.filename}`);

      return {
        url: result.url,
        filename: result.filename,
        size: buffer.length,
        mimetype,
      };
    } catch (error) {
      logger.error('Upload base64 image failed:', error);
      throw error;
    }
  }

  /**
   * Upload file (multipart)
   */
  async uploadAdMedia(file, advertiserId) {
    try {
      // Validate
      this.validateMediaFile(file);

      // Generate filename
      const filename = storageService.generateFilename(file.originalname, `ads/${advertiserId}`);

      // Upload to MinIO
      const result = await storageService.uploadFile({
        buffer: file.buffer,
        filename,
        mimetype: file.mimetype,
      });

      logger.info(`✅ Media uploaded: ${result.filename}`);

      return {
        url: result.url,
        filename: result.filename,
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch (error) {
      logger.error('Upload ad media failed:', error);
      throw error;
    }
  }

  /**
   * Validate media file
   */
  validateMediaFile(file) {
    const validMimetypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (!validMimetypes.includes(file.mimetype)) {
      throw new ValidationError('Invalid file type. Only JPG, PNG, GIF, WEBP allowed');
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new ValidationError('File size must be less than 5MB');
    }
  }

  /**
   * Convert mimetype to extension
   */
  mimetypeToExtension(mimetype) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return map[mimetype] || 'jpg';
  }

  /**
   * Delete ad media
   */
  async deleteAdMedia(filename) {
    try {
      await storageService.deleteFile(filename);
      logger.info(`🗑️ Ad media deleted: ${filename}`);
    } catch (error) {
      logger.error('Delete ad media failed:', error);
    }
  }
}

const adMediaService = new AdMediaService();
export default adMediaService;