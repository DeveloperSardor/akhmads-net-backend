// src/services/ai/aiModerationService.js
import { geminiChat } from '../../config/gemini.js';
import logger from '../../utils/logger.js';

/**
 * AI Moderation Service
 * Uses Google Gemini (free tier) for content moderation
 */
class AiModerationService {
  constructor() {
    this.enabled = process.env.AI_MODERATION_ENABLED === 'true';
  }

  /**
   * Moderate content using Gemini
   */
  async moderateWithGemini(text) {
    try {
      const result = await geminiChat({
        user: `You are a content moderator. Analyze this text and determine if it contains:
1. Hate speech or discrimination
2. Violence or threats
3. Sexual content
4. Scams or fraud
5. Spam
6. Illegal content

Text: "${text}"

Respond ONLY with JSON, no markdown:
{
  "safe": true,
  "violations": [],
  "severity": "low",
  "explanation": "brief reason"
}`,
        maxTokens: 300,
        temperature: 0.1,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        passed: parsed.safe,
        confidence: parsed.severity === 'high' ? 0.95 : parsed.severity === 'medium' ? 0.8 : 0.6,
        flags: parsed.violations || [],
        provider: 'gemini',
        checkedAt: new Date(),
        rawResult: parsed,
      };
    } catch (error) {
      logger.error('Gemini moderation failed:', error);
      return this.getDefaultResult(true);
    }
  }

  /**
   * Moderate content (main entry point)
   */
  async moderateContent(text) {
    try {
      if (!this.enabled) {
        logger.info('AI moderation disabled, skipping');
        return this.getDefaultResult(true);
      }

      // Basic keyword filter first (fast)
      const basicCheck = this.basicKeywordFilter(text);
      if (!basicCheck.passed) {
        return basicCheck;
      }

      return await this.moderateWithGemini(text);
    } catch (error) {
      logger.error('AI moderation failed:', error);
      return this.getDefaultResult(true);
    }
  }

  /**
   * Basic keyword filter (fast check)
   */
  basicKeywordFilter(text) {
    const forbiddenWords = [
      'scam', 'hack', 'fraud', 'ponzi', 'pyramid',
      'illegal', 'drugs', 'weapon', 'terror', 'nazi',
    ];

    const textLower = text.toLowerCase();
    const foundWords = forbiddenWords.filter(word => textLower.includes(word));

    if (foundWords.length > 0) {
      return {
        passed: false,
        confidence: 0.9,
        flags: ['suspicious_keywords'],
        provider: 'keyword_filter',
        checkedAt: new Date(),
        foundKeywords: foundWords,
      };
    }

    return { passed: true, confidence: 0.7, flags: [] };
  }

  /**
   * Get default result (when AI unavailable)
   */
  getDefaultResult(passed) {
    return {
      passed,
      confidence: 0.5,
      flags: [],
      provider: 'fallback',
      checkedAt: new Date(),
    };
  }

  /**
   * Moderate ad content
   */
  async moderateAd(ad) {
    try {
      const textToCheck = `${ad.title || ''}\n\n${ad.text}`;
      const result = await this.moderateContent(textToCheck);

      const prisma = (await import('../../config/database.js')).default;
      await prisma.ad.update({
        where: { id: ad.id },
        data: {
          aiSafetyCheck: JSON.stringify(result),
        },
      });

      logger.info(`Ad moderated: ${ad.id}, passed: ${result.passed}`);

      return result;
    } catch (error) {
      logger.error('Moderate ad failed:', error);
      return this.getDefaultResult(true);
    }
  }
}

const aiModerationService = new AiModerationService();
export default aiModerationService;