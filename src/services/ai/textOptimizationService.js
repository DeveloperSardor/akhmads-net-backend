// src/services/ai/textOptimizationService.js
import { geminiChat } from '../../config/gemini.js';
import logger from '../../utils/logger.js';

/**
 * AI Text Optimization Service
 * Uses Google Gemini (free tier) to improve ad text
 */
class TextOptimizationService {
  /**
   * Optimize ad text for better engagement
   */
  async optimizeAdText(text, options = {}) {
    try {
      const {
        language = 'uz',
        targetAudience = 'general',
        tone = 'professional',
        maxLength = 1024,
      } = options;

      const systemPrompt = this.buildSystemPrompt(language, targetAudience, tone, maxLength);

      const optimizedText = await geminiChat({
        system: systemPrompt,
        user: text,
        maxTokens: 500,
        temperature: 0.7,
      });

      logger.info('✅ Ad text optimized with Gemini');

      return {
        original: text,
        optimized: optimizedText.trim(),
        suggestions: this.extractSuggestions(text, optimizedText),
        improvements: [
          'Clarity improved',
          'Engagement enhanced',
          'Call-to-action strengthened',
        ],
      };
    } catch (error) {
      logger.error('AI optimization failed:', error);
      throw new Error('Failed to optimize text');
    }
  }

  /**
   * Generate ad variations
   */
  async generateVariations(text, count = 3) {
    try {
      const systemPrompt = `You are an expert copywriter. Generate ${count} different variations of the following advertisement text. Each variation should:
- Maintain the core message
- Use different wording and structure
- Be engaging and persuasive
- Be under 1024 characters

Return ONLY a JSON array of strings (variations), no other text, no markdown.`;

      const result = await geminiChat({
        system: systemPrompt,
        user: text,
        maxTokens: 1000,
        temperature: 0.9,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      const variations = JSON.parse(cleaned);

      logger.info(`✅ Generated ${variations.length} variations`);

      return variations;
    } catch (error) {
      logger.error('Generate variations failed:', error);
      throw new Error('Failed to generate variations');
    }
  }

  /**
   * Suggest emojis for ad text
   */
  async suggestEmojis(text, isPremium = false) {
    try {
      const emojiType = isPremium ? 'premium animated emojis' : 'standard emojis';

      const systemPrompt = `You are an emoji expert. Suggest 5-10 relevant ${emojiType} for the following advertisement text. Return ONLY a JSON object with this exact format, no markdown:
{
  "emojis": ["😊", "🎉", "✨"],
  "placements": [
    {"position": "start", "emoji": "🎉"},
    {"position": "end", "emoji": "✨"}
  ]
}`;

      const result = await geminiChat({
        system: systemPrompt,
        user: text,
        maxTokens: 200,
        temperature: 0.5,
      });

      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      const suggestions = JSON.parse(cleaned);

      logger.info('✅ Emoji suggestions generated');

      return suggestions;
    } catch (error) {
      logger.error('Suggest emojis failed:', error);
      return { emojis: [], placements: [] };
    }
  }

  /**
   * Build system prompt based on options
   */
  buildSystemPrompt(language, targetAudience, tone, maxLength) {
    const languageMap = {
      uz: 'Uzbek',
      ru: 'Russian',
      en: 'English',
    };

    return `You are an expert advertisement copywriter specializing in ${languageMap[language] || 'Uzbek'} language.

Your task: Optimize the advertisement text to maximize engagement and conversions.

Guidelines:
- Language: ${languageMap[language] || 'Uzbek'}
- Target Audience: ${targetAudience}
- Tone: ${tone}
- Maximum length: ${maxLength} characters
- Keep the core message intact
- Make it more engaging and persuasive
- Add a strong call-to-action if missing
- Use emojis appropriately (2-4 emojis)
- Ensure proper grammar and spelling

Return ONLY the optimized text, nothing else.`;
  }

  /**
   * Extract improvement suggestions
   */
  extractSuggestions(original, optimized) {
    const suggestions = [];

    if (optimized.length < original.length) {
      suggestions.push('Text made more concise');
    }

    if (optimized.match(/[!?]/g)?.length > original.match(/[!?]/g)?.length) {
      suggestions.push('Added more excitement');
    }

    if (optimized.includes('👉') || optimized.includes('✅') || optimized.includes('🎯')) {
      suggestions.push('Added visual elements');
    }

    return suggestions;
  }

  /**
   * Optimize button text
   */
  async optimizeButtonText(buttonText) {
    try {
      const result = await geminiChat({
        system: `You are a UX copywriter. Make this button text more compelling and action-oriented. Keep it SHORT (max 20 characters). Return ONLY the optimized button text, nothing else.`,
        user: buttonText,
        maxTokens: 30,
        temperature: 0.7,
      });

      return result.trim();
    } catch (error) {
      logger.error('Optimize button text failed:', error);
      return buttonText;
    }
  }
}

const textOptimizationService = new TextOptimizationService();
export default textOptimizationService;