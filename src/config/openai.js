// src/config/openai.js
import OpenAI from 'openai';
import logger from '../utils/logger.js';

/**
 * OpenAI Configuration
 * For AI text optimization and content moderation
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Test OpenAI connection
 */
export async function testOpenAI() {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello!' }],
      max_tokens: 10,
    });
    
    logger.info('✅ OpenAI connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ OpenAI connection failed:', error.message);
    return false;
  }
}

export default openai;