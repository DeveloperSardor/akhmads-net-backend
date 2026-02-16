import { Router } from 'express';
import faqService from '../../services/faq/faqService.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { body, query } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

/**
 * GET /api/v1/faq
 * Get FAQs (public)
 */
router.get(
  '/',
  validate([query('category').optional().isString()]),
  async (req, res, next) => {
    try {
      const { category } = req.query;

      const faqs = await faqService.getFaqs(category);

      response.success(res, { faqs });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/faq
 * Create FAQ (admin only)
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  validate([
    body('category').isString().notEmpty(),
    body('question').isObject(),
    body('answer').isObject(),
    body('sortOrder').optional().isInt(),
  ]),
  async (req, res, next) => {
    try {
      const faq = await faqService.createFaq(req.body);

      response.created(res, { faq }, 'FAQ created');
    } catch (error) {
      next(error);
    }
  }
);

export default router;