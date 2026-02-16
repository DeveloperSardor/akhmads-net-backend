import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger.js';

/**
 * S3/MinIO Storage Configuration
 * For storing media files (images, videos)
 */
class StorageClient {
  constructor() {
    this.client = null;
    this.bucket = process.env.S3_BUCKET || 'akhmads-media';
    this.publicUrl = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT;
  }

  getInstance() {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
        forcePathStyle: true, // Required for MinIO
      });

      logger.info('✅ S3/MinIO client initialized');
    }

    return this.client;
  }

  /**
   * Upload file to storage
   * @param {object} params - Upload parameters
   * @param {Buffer} params.fileBuffer - File buffer
   * @param {string} params.fileName - File name
   * @param {string} params.contentType - MIME type
   * @param {string} params.folder - Folder path (optional)
   * @returns {Promise<string>} - Public URL
   */
  async uploadFile({ fileBuffer, fileName, contentType, folder = 'uploads' }) {
    try {
      const key = `${folder}/${Date.now()}-${fileName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read',
      });

      await this.getInstance().send(command);

      const publicUrl = `${this.publicUrl}/${key}`;
      
      logger.info(`File uploaded: ${key}`);
      return publicUrl;
    } catch (error) {
      logger.error('S3 upload error:', error);
      throw new Error('Failed to upload file');
    }
  }

  /**
   * Get signed URL for private files
   * @param {string} key - File key
   * @param {number} expiresIn - Expiration in seconds
   * @returns {Promise<string>} - Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.getInstance(), command, { expiresIn });
      return url;
    } catch (error) {
      logger.error('S3 signed URL error:', error);
      throw new Error('Failed to generate signed URL');
    }
  }

  /**
   * Delete file from storage
   * @param {string} key - File key
   * @returns {Promise<boolean>}
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.getInstance().send(command);
      
      logger.info(`File deleted: ${key}`);
      return true;
    } catch (error) {
      logger.error('S3 delete error:', error);
      return false;
    }
  }

  /**
   * Extract key from public URL
   * @param {string} url - Public URL
   * @returns {string} - File key
   */
  extractKeyFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      return url;
    }
  }

  /**
   * Health check - FIXED
   */
  async healthCheck() {
    try {
      const command = new ListBucketsCommand({});
      await this.getInstance().send(command);
      logger.info('✅ S3 health check passed');
      return true;
    } catch (error) {
      logger.warn('⚠️ S3 health check failed (non-critical):', error.message);
      // Don't throw - S3 is optional, server can work without it
      return false;
    }
  }
}

const storageClient = new StorageClient();
export default storageClient;