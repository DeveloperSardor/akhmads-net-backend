import storageClient from '../../config/s3.js';
import sharp from 'sharp';
import logger from '../../utils/logger.js';

/**
 * Storage Service
 * Handles file uploads and management
 */
class StorageService {
  /**
   * Upload image with optimization
   */
  async uploadImage(fileBuffer, fileName, options = {}) {
    try {
      const { maxWidth = 1200, quality = 80 } = options;

      // Optimize image
      const optimizedBuffer = await sharp(fileBuffer)
        .resize(maxWidth, null, { withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

      // Upload to S3
      const url = await storageClient.uploadFile({
        fileBuffer: optimizedBuffer,
        fileName,
        contentType: 'image/jpeg',
        folder: 'ads/images',
      });

      logger.info(`Image uploaded: ${fileName}`);
      return url;
    } catch (error) {
      logger.error('Upload image failed:', error);
      throw error;
    }
  }

  /**
   * Upload video
   */
  async uploadVideo(fileBuffer, fileName) {
    try {
      const url = await storageClient.uploadFile({
        fileBuffer,
        fileName,
        contentType: 'video/mp4',
        folder: 'ads/videos',
      });

      logger.info(`Video uploaded: ${fileName}`);
      return url;
    } catch (error) {
      logger.error('Upload video failed:', error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(url) {
    try {
      const key = storageClient.extractKeyFromUrl(url);
      await storageClient.deleteFile(key);
      logger.info(`File deleted: ${key}`);
    } catch (error) {
      logger.error('Delete file failed:', error);
    }
  }
}

const storageService = new StorageService();
export default storageService;