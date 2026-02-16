import { Router } from 'express';
import multer from 'multer';
import storageService from '../../services/storage/storageService.js';
import { authenticate } from '../../middleware/auth.js';
import { validateFileUpload } from '../../middleware/validate.js';
import response from '../../utils/response.js';

const router = Router();

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/upload/image
 * Upload image
 */
router.post(
  '/image',
  upload.single('file'),
  validateFileUpload({ 
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] 
  }),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return response.validationError(res, [{ field: 'file', message: 'File is required' }]);
      }

      const url = await storageService.uploadImage(req.file.buffer, req.file.originalname);

      response.success(res, { url }, 'Image uploaded');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/upload/video
 * Upload video
 */
router.post(
  '/video',
  upload.single('file'),
  validateFileUpload({ 
    maxSize: 20 * 1024 * 1024, // 20MB
    allowedTypes: ['video/mp4'] 
  }),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return response.validationError(res, [{ field: 'file', message: 'File is required' }]);
      }

      const url = await storageService.uploadVideo(req.file.buffer, req.file.originalname);

      response.success(res, { url }, 'Video uploaded');
    } catch (error) {
      next(error);
    }
  }
);

export default router;