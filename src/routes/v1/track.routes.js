import { Router } from 'express';
import adTrackingService from '../../services/ad/adTrackingService.js';
import tracking from '../../utils/tracking.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/track/:token
 * Click tracking redirect
 */
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await adTrackingService.recordClick(
      token,
      req.ip,
      req.get('user-agent'),
      req.get('referer')
    );
    return res.redirect(result.redirectUrl);
  } catch (error) {
    logger.error('Click tracking error:', error.message);
    // Even if recording fails, still redirect the user to the original URL
    try {
      const data = tracking.decryptToken(token);
      if (data?.originalUrl) {
        return res.redirect(data.originalUrl);
      }
    } catch (_) {
      // ignore decrypt error
    }
    return res.status(404).send('Link not found');
  }
});

export default router;