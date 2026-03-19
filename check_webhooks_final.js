
import prisma from './src/config/database.js';
import encryption from './src/utils/encryption.js';
import { Bot } from 'grammy';
import logger from './src/utils/logger.js';

// Disable verbose logging
logger.level = 'error';

async function main() {
  const bots = await prisma.bot.findMany({
    where: { username: { in: ['SongFastBot', 'SomgFastBot'] } }
  });

  for (const botData of bots) {
    console.log(`\n--- Checking Bot: @${botData.username} ---`);
    try {
      const token = encryption.decrypt(botData.tokenEncrypted);
      const bot = new Bot(token);
      const me = await bot.api.getMe();
      const webhook = await bot.api.getWebhookInfo();
      
      console.log('Bot Me:', me.username);
      console.log('Webhook Info:', JSON.stringify(webhook, null, 2));
      
      if (webhook.url) {
        console.log(`⚠️ Bot @${botData.username} has a WEBHOOK set. Long-polling will NOT work.`);
      } else {
        console.log(`✅ Bot @${botData.username} has no webhook. Long-polling should work.`);
      }
    } catch (err) {
      console.error(`Error checking bot @${botData.username}:`, err.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
