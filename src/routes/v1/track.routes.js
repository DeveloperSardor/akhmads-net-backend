import { Router } from 'express';
import adTrackingService from '../../services/ad/adTrackingService.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/track/:token
 * Click tracking redirect
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');
    const referer = req.get('referer');

    const result = await adTrackingService.recordClick(token, ipAddress, userAgent, referer);

    // Redirect to original URL
    res.redirect(result.redirectUrl);
  } catch (error) {
    logger.error('Click tracking error:', error);
    res.status(404).send('Link not found');
  }
});

export default router;