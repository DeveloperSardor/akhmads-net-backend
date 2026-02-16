import { describe, it, expect } from '@jest/globals';
import tracking from '../../../src/utils/tracking.js';

describe('Tracking Utils', () => {
  describe('generateToken/decryptToken', () => {
    it('should generate and decrypt token correctly', () => {
      const payload = {
        adId: 'ad123',
        botId: 'bot456',
        originalUrl: 'https://example.com',
        telegramUserId: '789',
      };

      const token = tracking.generateToken(payload);
      const decrypted = tracking.decryptToken(token);

      expect(decrypted.adId).toBe(payload.adId);
      expect(decrypted.botId).toBe(payload.botId);
      expect(decrypted.originalUrl).toBe(payload.originalUrl);
      expect(decrypted.telegramUserId).toBe(payload.telegramUserId);
    });
  });

  describe('wrapButtonsWithTracking', () => {
    it('should wrap buttons with tracking URLs', () => {
      const buttons = [
        { text: 'Click Me', url: 'https://example.com' },
        { text: 'Learn More', url: 'https://example.com/learn' },
      ];

      const wrapped = tracking.wrapButtonsWithTracking(buttons, 'ad123', 'bot456');

      expect(wrapped).toHaveLength(2);
      expect(wrapped[0].url).toContain('/t/');
      expect(wrapped[0].url).not.toBe(buttons[0].url);
    });
  });
});