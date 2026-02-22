// src/services/storage/storageService.js - MinIO Integration
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * Storage Service - MinIO/S3 Compatible
 * Professional image storage with CDN support
 */
class StorageService {
  constructor() {
    this.client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: process.env.MINIO_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || '',
        secretAccessKey: process.env.MINIO_SECRET_KEY || '',
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.bucket = process.env.MINIO_BUCKET || 'akhmads-ads';
    this.cdnUrl = process.env.CDN_URL || process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
  }

  /**
   * Upload file to MinIO/S3
   */
  async uploadFile({ buffer, filename, mimetype, bucket = null }) {
    try {
      const bucketName = bucket || this.bucket;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read', // Public access
      });

      await this.client.send(command);

      // Generate public URL
      const url = `${this.cdnUrl}/${bucketName}/${filename}`;

      logger.info(`✅ File uploaded to MinIO: ${filename}`);

      return {
        url,
        filename,
        bucket: bucketName,
      };
    } catch (error) {
      logger.error('MinIO upload failed:', error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from MinIO/S3
   */
  async deleteFile(filename, bucket = null) {
    try {
      const bucketName = bucket || this.bucket;

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: filename,
      });

      await this.client.send(command);

      logger.info(`🗑️ File deleted from MinIO: ${filename}`);
    } catch (error) {
      logger.error('MinIO delete failed:', error);
      // Don't throw - deletion errors shouldn't break flow
    }
  }

  /**
   * Generate unique filename
   */
  generateFilename(originalName, userId) {
    const ext = originalName.split('.').pop().toLowerCase();
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${userId}/${timestamp}_${random}.${ext}`;
  }
}

const storageService = new StorageService();
export default storageService;