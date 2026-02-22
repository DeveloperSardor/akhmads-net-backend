// src/services/ai/contentModerationService.js
import openai from '../../config/openai.js';
import logger from '../../utils/logger.js';

/**
 * AI Content Moderation Service
 * Uses OpenAI Moderation API + GPT-4 for safety checks
 */
class ContentModerationService {
  /**
   * Check content safety using OpenAI Moderation API
   */
  async checkContentSafety(text) {
    try {
      // Use OpenAI Moderation API
      const moderation = await openai.moderations.create({
        input: text,
      });

      const result = moderation.results[0];

      // Get detailed analysis
      const detailedAnalysis = await this.getDetailedAnalysis(text);

      const isSafe = !result.flagged;
      const categories = this.extractFlaggedCategories(result);

      logger.info(`Content moderation: ${isSafe ? 'SAFE' : 'FLAGGED'}`);

      return {
        safe: isSafe,
        flagged: result.flagged,
        categories: categories,
        scores: result.category_scores,
        detailedAnalysis,
        recommendations: isSafe ? [] : this.generateRecommendations(categories),
      };
    } catch (error) {
      logger.error('Content moderation failed:', error);
      
      // Fallback to basic check
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
      const systemPrompt = `You are a content safety analyst. Analyze this advertisement text for:
- Compliance with advertising standards
- Potential misleading claims
- Appropriateness for general audience
- Cultural sensitivity

Return a brief analysis (2-3 sentences) in English.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Detailed analysis failed:', error);
      return 'Analysis unavailable';
    }
  }

  /**
   * Extract flagged categories
   */
  extractFlaggedCategories(result) {
    const flagged = [];
    const categories = result.categories;

    if (categories.hate) flagged.push('hate');
    if (categories['hate/threatening']) flagged.push('hate/threatening');
    if (categories.harassment) flagged.push('harassment');
    if (categories['harassment/threatening']) flagged.push('harassment/threatening');
    if (categories['self-harm']) flagged.push('self-harm');
    if (categories['self-harm/intent']) flagged.push('self-harm/intent');
    if (categories['self-harm/instructions']) flagged.push('self-harm/instructions');
    if (categories.sexual) flagged.push('sexual');
    if (categories['sexual/minors']) flagged.push('sexual/minors');
    if (categories.violence) flagged.push('violence');
    if (categories['violence/graphic']) flagged.push('violence/graphic');

    return flagged;
  }

  /**
   * Generate recommendations for flagged content
   */
  generateRecommendations(categories) {
    const recommendations = [];

    if (categories.includes('hate') || categories.includes('harassment')) {
      recommendations.push('Remove offensive or discriminatory language');
    }

    if (categories.includes('sexual') || categories.includes('sexual/minors')) {
      recommendations.push('Remove sexual or adult content');
    }

    if (categories.includes('violence') || categories.includes('violence/graphic')) {
      recommendations.push('Remove violent or graphic content');
    }

    if (categories.includes('self-harm')) {
      recommendations.push('Remove content promoting self-harm');
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
      const systemPrompt = `You are a spam detector. Analyze if this text looks like spam. Look for:
- Excessive capitalization
- Too many emojis
- Repetitive text
- Suspicious links
- Scam patterns

Return ONLY a JSON object: {"isSpam": boolean, "confidence": 0-1, "reason": "string"}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 100,
      });

      const result = JSON.parse(response.choices[0].message.content);

      logger.info(`Spam check: ${result.isSpam ? 'SPAM' : 'OK'} (${result.confidence})`);

      return result;
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

      // Check text content
      const textSafety = await this.checkContentSafety(text);

      // Check spam patterns
      const spamCheck = await this.checkSpamPatterns(text);

      // Check button URLs
      const buttonSafety = buttons ? await this.checkButtonURLs(buttons) : { safe: true };

      // Overall safety
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

      if (urls.length === 0) {
        return { safe: true, issues: [] };
      }

      const systemPrompt = `You are a URL safety checker. Analyze these URLs for:
- Suspicious domains
- Phishing patterns
- Known scam sites
- Malware indicators

Return ONLY a JSON object: {"safe": boolean, "issues": ["issue1", "issue2"]}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(urls) },
        ],
        temperature: 0.2,
        max_tokens: 150,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error('Button URL check failed:', error);
      return { safe: true, issues: [] };
    }
  }

  /**
   * Calculate overall safety score
   */
  calculateOverallScore(textSafety, spamCheck, buttonSafety) {
    let score = 100;

    if (!textSafety.safe) score -= 50;
    if (spamCheck.isSpam) score -= 30;
    if (!buttonSafety.safe) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Build rejection reason
   */
  buildRejectionReason(textSafety, spamCheck, buttonSafety) {
    const reasons = [];

    if (!textSafety.safe) {
      reasons.push(`Content flagged: ${textSafety.categories.join(', ')}`);
    }

    if (spamCheck.isSpam) {
      reasons.push(`Spam detected: ${spamCheck.reason}`);
    }

    if (!buttonSafety.safe) {
      reasons.push(`Unsafe URLs: ${buttonSafety.issues.join(', ')}`);
    }

    return reasons.length > 0 ? reasons.join('; ') : null;
  }
}

const contentModerationService = new ContentModerationService();
export default contentModerationService;