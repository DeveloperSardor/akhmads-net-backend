// src/services/ai/adRecommendationsService.js
import { geminiChat } from '../../config/gemini.js';
import logger from '../../utils/logger.js';

// Simple in-memory cache (5 daqiqa)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

class AdRecommendationsService {
  async analyzeAd(adData) {
    try {
      const { text, mediaUrl, buttons, targetAudience } = adData;

      const score = this.calculateBaseScore(text, mediaUrl, buttons);
      const aiRecommendations = await this.getGeminiRecommendations(text, targetAudience);
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
      return this.getFallbackAnalysis(adData);
    }
  }

  async getGeminiRecommendations(text, targetAudience = 'general') {
    // Cache tekshirish
    const cacheKey = `${text.slice(0, 100)}-${targetAudience}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      logger.info('✅ Returning cached recommendations');
      return cached.data;
    }

    try {
      const prompt = `Analyze this Telegram ad and provide 2-3 specific, actionable recommendations to improve engagement.

Ad text: "${text}"
Target audience: ${targetAudience}

Return ONLY a JSON array, no markdown, no extra text:
[
  {"title": "...", "description": "...", "type": "suggestion|warning|tip"},
  ...
]`;

      const result = await geminiChat({
        user: prompt,
        maxTokens: 500,
        temperature: 0.7,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      const recommendations = JSON.parse(cleaned);

      const mapped = recommendations.map(rec => ({
        ...rec,
        icon: this.getIconForType(rec.type),
      }));

      // Cache ga saqlash
      cache.set(cacheKey, { data: mapped, time: Date.now() });

      return mapped;
    } catch (error) {
      logger.error('Gemini recommendations failed:', error);
      return [];
    }
  }

  getRuleBasedRecommendations(text, mediaUrl, buttons) {
    const recommendations = [];

    if (text && text.length < 50) {
      recommendations.push({
        icon: 'TrendingUp',
        title: 'Expand Your Message',
        description: 'Ads with 80-200 characters perform 34% better',
        type: 'warning',
      });
    }

    if (this.countEmojis(text) === 0) {
      recommendations.push({
        icon: 'Sparkles',
        title: 'Add Emojis',
        description: 'Ads with 2-4 emojis get 48% more clicks',
        type: 'suggestion',
      });
    }

    if (!buttons || buttons.length === 0) {
      recommendations.push({
        icon: 'Target',
        title: 'Add Call-to-Action Button',
        description: 'Buttons increase CTR by 2.5x',
        type: 'suggestion',
      });
    }

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

  calculateBaseScore(text, mediaUrl, buttons) {
    let score = 50;
    if (text) {
      if (text.length >= 80 && text.length <= 200) score += 15;
      else if (text.length >= 50) score += 10;
      else if (text.length >= 20) score += 5;
    }
    const emojiCount = this.countEmojis(text);
    if (emojiCount >= 2 && emojiCount <= 4) score += 10;
    else if (emojiCount >= 1 && emojiCount <= 6) score += 5;
    if (this.hasCallToAction(text)) score += 10;
    if (buttons && buttons.length > 0) score += 10;
    if (mediaUrl) score += 10;
    if (this.hasUrgency(text)) score += 5;
    return Math.min(100, score);
  }

  countEmojis(text) {
    if (!text) return 0;
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    return (text.match(emojiRegex) || []).length;
  }

  hasCallToAction(text) {
    if (!text) return false;
    return /click|buy|order|visit|get|try|download|subscribe|join|learn|discover|shop|grab|claim/i.test(text);
  }

  hasUrgency(text) {
    if (!text) return false;
    return /limited|today|now|hurry|offer|sale|discount|%|off|ends|expires|last chance/i.test(text);
  }

  getIconForType(type) {
    return { suggestion: 'Sparkles', warning: 'TrendingUp', tip: 'Target', info: 'Users' }[type] || 'Sparkles';
  }

  getFallbackAnalysis(adData) {
    const { text, mediaUrl, buttons } = adData;
    return {
      score: this.calculateBaseScore(text, mediaUrl, buttons),
      recommendations: this.getRuleBasedRecommendations(text, mediaUrl, buttons),
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