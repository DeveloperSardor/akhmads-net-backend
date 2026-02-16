import { config } from 'dotenv';
config();

import telegramBotService from './src/services/telegram/telegramBotService.js';
import logger from './src/utils/logger.js';

async function testBot() {
  try {
    logger.info('Testing Telegram bot...');
    
    await telegramBotService.start();
    
    logger.info('Bot is running! Try sending /start to the bot');
    logger.info('Press Ctrl+C to stop');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

testBot();