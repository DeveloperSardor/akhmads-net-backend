import { Router } from 'express';
import contactService from '../../services/contact/contactService.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { body, query } from 'express-validator';
import response from '../../utils/response.js';

const router = Router();

/**
 * POST /api/v1/contact
 * Submit contact message
 */
router.post(
  '/',
  optionalAuthenticate,
  validate([
    body('name').isString().notEmpty(),
    body('email').isEmail(),
    body('subject').optional().isString(),
    body('message').isString().isLength({ min: 10, max: 5000 }),
  ]),
  async (req, res, next) => {
    try {
      const message = await contactService.submitMessage({
        ...req.body,
        userId: req.userId,
      });

      response.created(res, { message }, 'Message sent');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/contact/messages
 * Get contact messages (admin only)
 */
router.get(
  '/messages',
  authenticate,
  requireAdmin,
  validate([
    query('status').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      const result = await contactService.getMessages({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      response.paginated(res, result.messages, {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;