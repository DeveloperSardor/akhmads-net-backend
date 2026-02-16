import nodemailer from 'nodemailer';
import logger from '../../utils/logger.js';
import adApprovedTemplate from './templates/adApproved.js';
import adRejectedTemplate from './templates/adRejected.js';
import botApprovedTemplate from './templates/botApproved.js';
import withdrawalCompleteTemplate from './templates/withdrawalComplete.js';

/**
 * Notification Service
 * Handles email and push notifications
 */
class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      logger.info('Email transporter initialized');
    } else {
      logger.warn('SMTP not configured, emails will not be sent');
    }
  }

  /**
   * Send email
   */
  async sendEmail(to, subject, html) {
    try {
      if (!this.transporter) {
        logger.warn('Email not sent - transporter not configured');
        return false;
      }

      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@akhmads.net',
        to,
        subject,
        html,
      });

      logger.info(`Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Send email failed:', error);
      return false;
    }
  }

  /**
   * Send ad approved notification
   */
  async notifyAdApproved(user, ad) {
    try {
      const html = adApprovedTemplate(user, ad);
      await this.sendEmail(
        user.email,
        'Your Ad Has Been Approved! 🎉',
        html
      );

      logger.info(`Ad approved notification sent to ${user.email}`);
    } catch (error) {
      logger.error('Notify ad approved failed:', error);
    }
  }

  /**
   * Send ad rejected notification
   */
  async notifyAdRejected(user, ad, reason) {
    try {
      const html = adRejectedTemplate(user, ad, reason);
      await this.sendEmail(
        user.email,
        'Ad Review Update',
        html
      );

      logger.info(`Ad rejected notification sent to ${user.email}`);
    } catch (error) {
      logger.error('Notify ad rejected failed:', error);
    }
  }

  /**
   * Send bot approved notification
   */
  async notifyBotApproved(user, bot) {
    try {
      const html = botApprovedTemplate(user, bot);
      await this.sendEmail(
        user.email,
        'Your Bot Has Been Approved! 🤖',
        html
      );

      logger.info(`Bot approved notification sent to ${user.email}`);
    } catch (error) {
      logger.error('Notify bot approved failed:', error);
    }
  }

  /**
   * Send withdrawal complete notification
   */
  async notifyWithdrawalComplete(user, withdrawal) {
    try {
      const html = withdrawalCompleteTemplate(user, withdrawal);
      await this.sendEmail(
        user.email,
        'Withdrawal Processed Successfully 💰',
        html
      );

      logger.info(`Withdrawal complete notification sent to ${user.email}`);
    } catch (error) {
      logger.error('Notify withdrawal complete failed:', error);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to AKHMADS.NET! 🎉</h1>
          <p>Hi ${user.firstName},</p>
          <p>Thank you for joining AKHMADS.NET - the leading Telegram ad distribution platform!</p>
          <p>Here's what you can do:</p>
          <ul>
            <li>Create and run targeted ad campaigns</li>
            <li>Monetize your Telegram bots</li>
            <li>Track performance in real-time</li>
            <li>Withdraw earnings easily</li>
          </ul>
          <p>Get started by visiting your <a href="${process.env.FRONTEND_URL}/dashboard">dashboard</a>.</p>
          <p>Best regards,<br>AKHMADS.NET Team</p>
        </div>
      `;

      await this.sendEmail(user.email, 'Welcome to AKHMADS.NET! 🎉', html);
    } catch (error) {
      logger.error('Send welcome email failed:', error);
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;