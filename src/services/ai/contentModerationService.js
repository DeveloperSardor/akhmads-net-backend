// src/services/ai/contentModerationService.js
import { geminiChat } from '../../config/gemini.js';
import logger from '../../utils/logger.js';

/**
 * AI Content Moderation Service
 * Uses Google Gemini (free tier) for safety checks
 */
class ContentModerationService {
  /**
   * Check content safety
   */
  async checkContentSafety(text) {
    try {
      const detailedAnalysis = await this.getDetailedAnalysis(text);
      const spamResult = await this.checkSpamPatterns(text);

      // Basic keyword check
      const forbidden = ['scam', 'hack', 'fraud', 'ponzi', 'pyramid', 'illegal', 'drugs', 'weapon', 'terror', 'nazi'];
      const textLower = text.toLowerCase();
      const foundKeywords = forbidden.filter(w => textLower.includes(w));
      const isSafe = foundKeywords.length === 0 && !spamResult.isSpam;

      logger.info(`Content moderation: ${isSafe ? 'SAFE' : 'FLAGGED'}`);

      return {
        safe: isSafe,
        flagged: !isSafe,
        categories: foundKeywords.length > 0 ? ['suspicious_keywords'] : [],
        scores: {},
        detailedAnalysis,
        recommendations: isSafe ? [] : this.generateRecommendations(foundKeywords),
      };
    } catch (error) {
      logger.error('Content moderation failed:', error);
      return {
        safe: true,
        flagged: false,
        categories: [],
        scores: {},
        detailedAnalysis: 'Moderation service unavailable',
        recommendations: [],
      };
    }
  }

  /**
   * Get detailed AI analysis of content
   */
  async getDetailedAnalysis(text) {
    try {
      const result = await geminiChat({
        system: `You are a content safety analyst. Analyze this advertisement text for:
- Compliance with advertising standards
- Potential misleading claims
- Appropriateness for general audience
- Cultural sensitivity

Return a brief analysis (2-3 sentences) in English.`,
        user: text,
        maxTokens: 150,
        temperature: 0.3,
      });

      return result.trim();
    } catch (error) {
      logger.error('Detailed analysis failed:', error);
      return 'Analysis unavailable';
    }
  }

  /**
   * Generate recommendations for flagged content
   */
  generateRecommendations(categories) {
    const recommendations = [];

    if (categories.includes('hate') || categories.includes('harassment')) {
      recommendations.push('Remove offensive or discriminatory language');
    }
    if (categories.includes('sexual')) {
      recommendations.push('Remove sexual or adult content');
    }
    if (categories.includes('violence')) {
      recommendations.push('Remove violent or graphic content');
    }

    recommendations.push('Ensure content is appropriate for general audience');
    recommendations.push('Review advertising guidelines before resubmitting');

    return recommendations;
  }

  /**
   * Check for spam patterns
   */
  async checkSpamPatterns(text) {
    try {
      const result = await geminiChat({
        system: `You are a spam detector. Analyze if this text looks like spam. Look for:
- Excessive capitalization
- Too many emojis
- Repetitive text
- Suspicious links
- Scam patterns

Return ONLY a JSON object, no markdown: {"isSpam": boolean, "confidence": 0-1, "reason": "string"}`,
        user: text,
        maxTokens: 100,
        temperature: 0.2,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      logger.info(`Spam check: ${parsed.isSpam ? 'SPAM' : 'OK'} (${parsed.confidence})`);

      return parsed;
    } catch (error) {
      logger.error('Spam check failed:', error);
      return { isSpam: false, confidence: 0, reason: 'Check unavailable' };
    }
  }

  /**
   * Comprehensive ad safety check
   */
  async comprehensiveCheck(adData) {
    try {
      const { text, buttons, mediaUrl } = adData;

      const textSafety = await this.checkContentSafety(text);
      const spamCheck = await this.checkSpamPatterns(text);
      const buttonSafety = buttons ? await this.checkButtonURLs(buttons) : { safe: true, issues: [] };

      const isSafe = textSafety.safe && !spamCheck.isSpam && buttonSafety.safe;

      return {
        safe: isSafe,
        textSafety,
        spamCheck,
        buttonSafety,
        overallScore: this.calculateOverallScore(textSafety, spamCheck, buttonSafety),
        action: isSafe ? 'APPROVE' : 'REJECT',
        reason: this.buildRejectionReason(textSafety, spamCheck, buttonSafety),
      };
    } catch (error) {
      logger.error('Comprehensive check failed:', error);
      throw error;
    }
  }

  /**
   * Check button URLs for safety
   */
  async checkButtonURLs(buttons) {
    try {
      const urls = buttons.map(btn => btn.url).filter(Boolean);

      if (urls.length === 0) return { safe: true, issues: [] };

      const result = await geminiChat({
        system: `You are a URL safety checker. Analyze these URLs for suspicious domains, phishing patterns, known scam sites, malware indicators.
Return ONLY a JSON object, no markdown: {"safe": boolean, "issues": ["issue1"]}`,
        user: JSON.stringify(urls),
        maxTokens: 150,
        temperature: 0.2,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error('Button URL check failed:', error);
      return { safe: true, issues: [] };
    }
  }

  calculateOverallScore(textSafety, spamCheck, buttonSafety) {
    let score = 100;
    if (!textSafety.safe) score -= 50;
    if (spamCheck.isSpam) score -= 30;
    if (!buttonSafety.safe) score -= 20;
    return Math.max(0, score);
  }

  buildRejectionReason(textSafety, spamCheck, buttonSafety) {
    const reasons = [];
    if (!textSafety.safe) reasons.push(`Content flagged: ${textSafety.categories.join(', ')}`);
    if (spamCheck.isSpam) reasons.push(`Spam detected: ${spamCheck.reason}`);
    if (!buttonSafety.safe) reasons.push(`Unsafe URLs: ${buttonSafety.issues.join(', ')}`);
    return reasons.length > 0 ? reasons.join('; ') : null;
  }
}

const contentModerationService = new ContentModerationService();
export default contentModerationService;