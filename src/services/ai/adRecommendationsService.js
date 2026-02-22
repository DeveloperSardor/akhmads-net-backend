// src/services/ai/adRecommendationsService.js
import openai from '../../config/openai.js';
import logger from '../../utils/logger.js';

/**
 * AI Ad Recommendations Service
 * Real GPT-4 powered analysis
 */
class AdRecommendationsService {
  /**
   * Analyze ad and get recommendations
   */
  async analyzeAd(adData) {
    try {
      const { text, mediaUrl, buttons, targetAudience } = adData;

      // Calculate base score
      let score = this.calculateBaseScore(text, mediaUrl, buttons);

      // Get GPT-4 recommendations
      const aiRecommendations = await this.getGPT4Recommendations(text, targetAudience);

      // Combine with rule-based recommendations
      const ruleBasedRecs = this.getRuleBasedRecommendations(text, mediaUrl, buttons);

      return {
        score,
        recommendations: [...aiRecommendations, ...ruleBasedRecs],
        analysis: {
          textLength: text?.length || 0,
          hasEmojis: this.countEmojis(text) > 0,
          hasCallToAction: this.hasCallToAction(text),
          hasButtons: (buttons?.length || 0) > 0,
          hasImage: !!mediaUrl,
          hasUrgency: this.hasUrgency(text),
        },
      };
    } catch (error) {
      logger.error('Ad analysis failed:', error);
      // Fallback to rule-based
      return this.getFallbackAnalysis(adData);
    }
  }

  /**
   * Get GPT-4 powered recommendations
   */
  async getGPT4Recommendations(text, targetAudience = 'general') {
    try {
      const prompt = `Analyze this Telegram ad and provide 2-3 specific, actionable recommendations to improve engagement.

Ad text: "${text}"
Target audience: ${targetAudience}

Focus on:
1. Emotional impact and persuasion
2. Clarity and conciseness
3. Call-to-action effectiveness
4. Target audience fit

Return ONLY a JSON array of recommendations:
[
  {"title": "...", "description": "...", "type": "suggestion|warning|tip"},
  ...
]`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = response.choices[0].message.content.trim();
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      const recommendations = JSON.parse(cleaned);

      return recommendations.map(rec => ({
        ...rec,
        icon: this.getIconForType(rec.type),
      }));
    } catch (error) {
      logger.error('GPT-4 recommendations failed:', error);
      return [];
    }
  }

  /**
   * Rule-based recommendations
   */
  getRuleBasedRecommendations(text, mediaUrl, buttons) {
    const recommendations = [];

    // Length check
    if (text && text.length < 50) {
      recommendations.push({
        icon: 'TrendingUp',
        title: 'Expand Your Message',
        description: 'Ads with 80-200 characters perform 34% better',
        type: 'warning',
      });
    }

    // Emoji check
    const emojiCount = this.countEmojis(text);
    if (emojiCount === 0) {
      recommendations.push({
        icon: 'Sparkles',
        title: 'Add Emojis',
        description: 'Ads with 2-4 emojis get 48% more clicks',
        type: 'suggestion',
      });
    }

    // Button check
    if (!buttons || buttons.length === 0) {
      recommendations.push({
        icon: 'Target',
        title: 'Add Call-to-Action Button',
        description: 'Buttons increase CTR by 2.5x',
        type: 'suggestion',
      });
    }

    // Image check
    if (!mediaUrl) {
      recommendations.push({
        icon: 'TrendingUp',
        title: 'Add Visual Content',
        description: 'Ads with images get 65% more engagement',
        type: 'info',
      });
    }

    return recommendations;
  }

  /**
   * Calculate base score
   */
  calculateBaseScore(text, mediaUrl, buttons) {
    let score = 50;

    // Text length (0-15 points)
    if (text) {
      if (text.length >= 80 && text.length <= 200) score += 15;
      else if (text.length >= 50) score += 10;
      else if (text.length >= 20) score += 5;
    }

    // Emojis (0-10 points)
    const emojiCount = this.countEmojis(text);
    if (emojiCount >= 2 && emojiCount <= 4) score += 10;
    else if (emojiCount >= 1 && emojiCount <= 6) score += 5;

    // Call to action (0-10 points)
    if (this.hasCallToAction(text)) score += 10;

    // Buttons (0-10 points)
    if (buttons && buttons.length > 0) score += 10;

    // Image (0-10 points)
    if (mediaUrl) score += 10;

    // Urgency (0-5 points)
    if (this.hasUrgency(text)) score += 5;

    return Math.min(100, score);
  }

  /**
   * Count emojis
   */
  countEmojis(text) {
    if (!text) return 0;
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    return (text.match(emojiRegex) || []).length;
  }

  /**
   * Check for call to action
   */
  hasCallToAction(text) {
    if (!text) return false;
    const ctaWords = /click|buy|order|visit|get|try|download|subscribe|join|learn|discover|shop|grab|claim/i;
    return ctaWords.test(text);
  }

  /**
   * Check for urgency
   */
  hasUrgency(text) {
    if (!text) return false;
    const urgencyWords = /limited|today|now|hurry|offer|sale|discount|%|off|ends|expires|last chance/i;
    return urgencyWords.test(text);
  }

  /**
   * Get icon for recommendation type
   */
  getIconForType(type) {
    const iconMap = {
      suggestion: 'Sparkles',
      warning: 'TrendingUp',
      tip: 'Target',
      info: 'Users',
    };
    return iconMap[type] || 'Sparkles';
  }

  /**
   * Fallback analysis (no AI)
   */
  getFallbackAnalysis(adData) {
    const { text, mediaUrl, buttons } = adData;
    const score = this.calculateBaseScore(text, mediaUrl, buttons);
    const recommendations = this.getRuleBasedRecommendations(text, mediaUrl, buttons);

    return {
      score,
      recommendations,
      analysis: {
        textLength: text?.length || 0,
        hasEmojis: this.countEmojis(text) > 0,
        hasCallToAction: this.hasCallToAction(text),
        hasButtons: (buttons?.length || 0) > 0,
        hasImage: !!mediaUrl,
        hasUrgency: this.hasUrgency(text),
      },
    };
  }
}

const adRecommendationsService = new AdRecommendationsService();
export default adRecommendationsService;