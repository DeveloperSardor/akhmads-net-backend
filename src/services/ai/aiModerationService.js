import axios from 'axios';
import logger from '../../utils/logger.js';

/**
 * AI Moderation Service
 * Uses OpenAI Moderation API or Claude for content moderation
 */
class AiModerationService {
  constructor() {
    this.provider = process.env.AI_MODERATION_PROVIDER || 'openai'; // 'openai' or 'anthropic'
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.anthropicKey = process.env.ANTHROPIC_API_KEY;
    this.enabled = process.env.AI_MODERATION_ENABLED === 'true';
  }

  /**
   * Moderate content using OpenAI
   */
  async moderateWithOpenAI(text) {
    try {
      if (!this.openaiKey) {
        logger.warn('OpenAI API key not configured');
        return this.getDefaultResult(true);
      }

      const response = await axios.post(
        'https://api.openai.com/v1/moderations',
        { input: text },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openaiKey}`,
          },
        }
      );

      const result = response.data.results[0];

      const flags = [];
      if (result.categories.hate) flags.push('hate_speech');
      if (result.categories.violence) flags.push('violence');
      if (result.categories.sexual) flags.push('sexual_content');
      if (result.categories['self-harm']) flags.push('self_harm');
      if (result.categories['hate/threatening']) flags.push('threatening');
      if (result.categories['violence/graphic']) flags.push('graphic_violence');

      return {
        passed: !result.flagged,
        confidence: this.calculateConfidence(result.category_scores),
        flags,
        provider: 'openai',
        checkedAt: new Date(),
        rawResult: result,
      };
    } catch (error) {
      logger.error('OpenAI moderation failed:', error);
      return this.getDefaultResult(true); // Fail open
    }
  }

  /**
   * Moderate content using Anthropic Claude
   */
  async moderateWithAnthropic(text) {
    try {
      if (!this.anthropicKey) {
        logger.warn('Anthropic API key not configured');
        return this.getDefaultResult(true);
      }

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: `You are a content moderator. Analyze this text and determine if it contains:
1. Hate speech or discrimination
2. Violence or threats
3. Sexual content
4. Scams or fraud
5. Spam
6. Illegal content

Text: "${text}"

Respond ONLY with JSON:
{
  "safe": true/false,
  "violations": ["category1", "category2"],
  "severity": "low/medium/high",
  "explanation": "brief reason"
}`,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
        }
      );

      const result = JSON.parse(response.data.content[0].text);

      return {
        passed: result.safe,
        confidence: result.severity === 'high' ? 0.95 : result.severity === 'medium' ? 0.8 : 0.6,
        flags: result.violations || [],
        provider: 'anthropic',
        checkedAt: new Date(),
        rawResult: result,
      };
    } catch (error) {
      logger.error('Anthropic moderation failed:', error);
      return this.getDefaultResult(true); // Fail open
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

      // Use AI provider
      if (this.provider === 'anthropic') {
        return await this.moderateWithAnthropic(text);
      } else {
        return await this.moderateWithOpenAI(text);
      }
    } catch (error) {
      logger.error('AI moderation failed:', error);
      return this.getDefaultResult(true); // Fail open
    }
  }

  /**
   * Basic keyword filter (fast check)
   */
  basicKeywordFilter(text) {
    const forbiddenWords = [
      'scam',
      'hack',
      'fraud',
      'ponzi',
      'pyramid',
      'illegal',
      'drugs',
      'weapon',
      'terror',
      'nazi',
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
   * Calculate confidence from OpenAI scores
   */
  calculateConfidence(scores) {
    const maxScore = Math.max(...Object.values(scores));
    return maxScore > 0.8 ? 0.95 : maxScore > 0.5 ? 0.8 : 0.6;
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
      const textToCheck = `${ad.title}\n\n${ad.text}`;
      const result = await this.moderateContent(textToCheck);

      // Store result in database
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