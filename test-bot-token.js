// test-bot-token.js
import { config } from 'dotenv';
config();

import prisma from './src/config/database.js';
import encryption from './src/utils/encryption.js';
import axios from 'axios';
import logger from './src/utils/logger.js';

async function testBotToken() {
  try {
    logger.info('🔍 Checking database for active bots...');
    
    // Get bot from database
    const bot = await prisma.bot.findFirst({
      where: { 
        status: 'ACTIVE',
        monetized: true,
        apiKeyRevoked: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!bot) {
      logger.error('❌ No active bot found in database');
      logger.info('Available bots:');
      
      const allBots = await prisma.bot.findMany({
        select: { username: true, status: true, monetized: true },
      });
      
      console.table(allBots);
      return;
    }
    
    logger.info(`✅ Bot found: @${bot.username}`);
    logger.info(`   Status: ${bot.status}`);
    logger.info(`   Monetized: ${bot.monetized}`);
    logger.info(`   ID: ${bot.id}`);
    
    // Decrypt token
    logger.info('🔓 Decrypting bot token...');
    let token;
    
    try {
      token = encryption.decrypt(bot.tokenEncrypted);
      logger.info(`✅ Token decrypted successfully`);
      logger.info(`   Token length: ${token.length}`);
      logger.info(`   Token preview: ${token.substring(0, 15)}...`);
    } catch (error) {
      logger.error('❌ Failed to decrypt token:', error.message);
      return;
    }
    
    // Verify token with Telegram
    logger.info('📡 Verifying token with Telegram API...');
    
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${token}/getMe`,
        { timeout: 10000 }
      );
      
      if (response.data.ok) {
        logger.info('✅ Bot verified with Telegram:');
        console.log({
          username: response.data.result.username,
          id: response.data.result.id,
          first_name: response.data.result.first_name,
          can_join_groups: response.data.result.can_join_groups,
          can_read_all_group_messages: response.data.result.can_read_all_group_messages,
        });
      } else {
        logger.error('❌ Telegram verification failed:', response.data);
      }
    } catch (error) {
      logger.error('❌ Telegram API error:', error.message);
      if (error.response) {
        logger.error('Response data:', error.response.data);
      }
    }
    
    // Test sending a message to yourself
    logger.info('\n📨 Testing message send...');
    logger.info('Enter your Telegram user ID (get from @userinfobot):');
    
    // For now, just show the command to run
    logger.info('\nTo test sending a message, run:');
    logger.info(`curl -X POST https://api.telegram.org/bot${token.substring(0, 20)}... \\`);
    logger.info(`  -d chat_id=YOUR_TELEGRAM_ID \\`);
    logger.info(`  -d text="Test message"`);
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBotToken();