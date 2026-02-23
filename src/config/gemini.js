// src/config/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get Gemini model instance
 * @param {string} modelName - Model to use
 */
export function getModel(modelName = 'gemini-2.0-flash') {
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Simple chat completion (OpenAI-compatible wrapper)
 * @param {object} options
 * @param {string} options.system - System prompt
 * @param {string} options.user - User message
 * @param {number} options.maxTokens - Max output tokens
 * @param {number} options.temperature - Temperature (0-1)
 */
export async function geminiChat({ system = '', user, maxTokens = 500, temperature = 0.7 }) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
    systemInstruction: system,
  });

  const result = await model.generateContent(user);
  return result.response.text();
}

/**
 * Test Gemini connection
 */
export async function testGemini() {
  try {
    const text = await geminiChat({ user: 'Hello!', maxTokens: 10 });
    logger.info('✅ Gemini connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ Gemini connection failed:', error.message);
    return false;
  }
}

export default genAI;