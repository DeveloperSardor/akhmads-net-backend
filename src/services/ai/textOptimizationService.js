// src/services/ai/textOptimizationService.js
import openai from '../../config/openai.js';
import logger from '../../utils/logger.js';

/**
 * AI Text Optimization Service
 * Uses OpenAI GPT-4 to improve ad text
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

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const optimizedText = response.choices[0].message.content.trim();

      logger.info('✅ Ad text optimized');

      return {
        original: text,
        optimized: optimizedText,
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

Return ONLY a JSON array of variations, no other text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.9,
        max_tokens: 1000,
      });

      const variations = JSON.parse(response.choices[0].message.content);

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
      
      const systemPrompt = `You are an emoji expert. Suggest 5-10 relevant ${emojiType} for the following advertisement text. Return ONLY a JSON object with this format:
{
  "emojis": ["😊", "🎉", "✨"],
  "placements": [
    {"position": "start", "emoji": "🎉"},
    {"position": "end", "emoji": "✨"}
  ]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.5,
        max_tokens: 200,
      });

      const suggestions = JSON.parse(response.choices[0].message.content);

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

    return `You are an expert advertisement copywriter specializing in ${languageMap[language]} language.

Your task: Optimize the advertisement text to maximize engagement and conversions.

Guidelines:
- Language: ${languageMap[language]}
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
   * Improve button text
   */
  async optimizeButtonText(buttonText) {
    try {
      const systemPrompt = `You are a UX copywriter. Make this button text more compelling and action-oriented. Keep it SHORT (max 20 characters). Return ONLY the optimized button text.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buttonText },
        ],
        temperature: 0.7,
        max_tokens: 30,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Optimize button text failed:', error);
      return buttonText;
    }
  }
}

const textOptimizationService = new TextOptimizationService();
export default textOptimizationService;