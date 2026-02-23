// src/routes/v1/ai.routes.js
import { Router } from 'express';
import textOptimizationService from '../../services/ai/textOptimizationService.js';
import contentModerationService from '../../services/ai/contentModerationService.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body } from 'express-validator';
import response from '../../utils/response.js';
import adRecommendationsService from '../../services/ai/adRecommendationsService.js';


const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/ai/optimize-text
 * Optimize ad text using AI
 */
router.post(
  '/optimize-text',
  validate([
    body('text').isString().isLength({ min: 10, max: 1024 }),
    body('language').optional().isIn(['uz', 'ru', 'en']),
    body('targetAudience').optional().isString(),
    body('tone').optional().isIn(['professional', 'casual', 'friendly', 'urgent']),
  ]),
  async (req, res, next) => {
    try {
      const { text, language, targetAudience, tone } = req.body;

      const result = await textOptimizationService.optimizeAdText(text, {
        language,
        targetAudience,
        tone,
      });

      response.success(res, result, 'Text optimized');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/generate-variations
 * Generate text variations
 */
router.post(
  '/generate-variations',
  validate([
    body('text').isString().isLength({ min: 10, max: 1024 }),
    body('count').optional().isInt({ min: 1, max: 5 }),
  ]),
  async (req, res, next) => {
    try {
      const { text, count = 3 } = req.body;

      const variations = await textOptimizationService.generateVariations(text, count);

      response.success(res, { variations }, 'Variations generated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/suggest-emojis
 * Suggest emojis for ad text
 */
router.post(
  '/suggest-emojis',
  validate([
    body('text').isString().isLength({ min: 10 }),
    body('isPremium').optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const { text, isPremium = false } = req.body;

      const suggestions = await textOptimizationService.suggestEmojis(text, isPremium);

      response.success(res, suggestions, 'Emoji suggestions generated');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/optimize-button
 * Optimize button text
 */
router.post(
  '/optimize-button',
  validate([
    body('buttonText').isString().isLength({ min: 1, max: 50 }),
  ]),
  async (req, res, next) => {
    try {
      const { buttonText } = req.body;

      const optimized = await textOptimizationService.optimizeButtonText(buttonText);

      response.success(res, { original: buttonText, optimized }, 'Button text optimized');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/check-safety
 * Check content safety
 */
router.post(
  '/check-safety',
  validate([
    body('text').isString().isLength({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      const { text } = req.body;

      const result = await contentModerationService.checkContentSafety(text);

      response.success(res, result, 'Safety check completed');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/check-spam
 * Check for spam patterns
 */
router.post(
  '/check-spam',
  validate([
    body('text').isString().isLength({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      const { text } = req.body;

      const result = await contentModerationService.checkSpamPatterns(text);

      response.success(res, result, 'Spam check completed');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ai/comprehensive-check
 * Comprehensive ad safety check
 */
router.post(
  '/comprehensive-check',
  validate([
    body('text').isString().isLength({ min: 10 }),
    body('buttons').optional().isArray(),
    body('mediaUrl').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { text, buttons, mediaUrl } = req.body;

      const result = await contentModerationService.comprehensiveCheck({
        text,
        buttons,
        mediaUrl,
      });

      response.success(res, result, 'Comprehensive check completed');
    } catch (error) {
      next(error);
    }
  }
);


/**
 * POST /api/v1/ai/analyze-ad
 * Analyze ad and get recommendations
 */
router.post(
  '/analyze-ad',
  authenticate,
  validate([
    body('text').isString().isLength({ min: 1 }),
    body('mediaUrl').optional().isString(),
    body('buttons').optional().isArray(),
    body('targetAudience').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const { text, mediaUrl, buttons, targetAudience } = req.body;

      const analysis = await adRecommendationsService.analyzeAd({
        text,
        mediaUrl,
        buttons,
        targetAudience,
      });

      response.success(res, analysis, 'Ad analyzed successfully');
    } catch (error) {
      next(error);
    }
  }
);


export default router;