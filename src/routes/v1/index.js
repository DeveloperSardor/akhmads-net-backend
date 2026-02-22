import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import walletRoutes from './wallet.routes.js';
import paymentsRoutes from './payments.routes.js';
import botRoutes from './bot.routes.js';
import adRoutes from './ad.routes.js';
import analyticsRoutes from './analytics.routes.js';
import adminRoutes from './admin.routes.js';
import webhookRoutes from './webhook.routes.js';
import trackRoutes from './track.routes.js';
import uploadRoutes from './upload.routes.js';
import faqRoutes from './faq.routes.js';
import contactRoutes from './contact.routes.js';
import aiRoutes from './ai.routes.js'
import telegramRoutes from './telegram.routes.js'

const router = Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/wallet', walletRoutes);
router.use('/payments', paymentsRoutes);
router.use('/bots', botRoutes);
router.use('/ads', adRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/track', trackRoutes);
router.use('/upload', uploadRoutes);
router.use('/faq', faqRoutes);
router.use('/contact', contactRoutes);
router.use('/ai', aiRoutes); 
router.use('/telegram', telegramRoutes); 


export default router;