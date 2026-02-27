
import prisma from '../src/config/database.js';
import jwtUtil from '../src/utils/jwt.js';
import encryption from '../src/utils/encryption.js';
import logger from '../src/utils/logger.js';

async function fixBrokenTokens() {
  console.log('🚀 Starting broken token migration...');
  
  try {
    const bots = await prisma.bot.findMany();
    console.log(`Found ${bots.length} total bots.`);
    
    let fixCount = 0;
    
    for (const bot of bots) {
      try {
        // Decode token without verification to check current structure
        const decoded = jwtUtil.decode(bot.apiKey);
        
        if (!decoded) {
            console.warn(`⚠️ Could not decode token for bot ${bot.username} (${bot.id})`);
            continue;
        }

        if (decoded.botId === 'temp') {
          console.log(`🔧 Fixing broken token for bot: @${bot.username} (${bot.id})`);
          
          const newApiKey = jwtUtil.generateBotApiKey({
            id: bot.id,
            ownerId: bot.ownerId,
            telegramBotId: bot.telegramBotId,
            username: bot.username,
          });
          
          await prisma.bot.update({
            where: { id: bot.id },
            data: {
              apiKey: newApiKey,
              apiKeyHash: encryption.hash(newApiKey),
            },
          });
          
          fixCount++;
        }
      } catch (err) {
        console.error(`❌ Error processing bot ${bot.id}:`, err.message);
      }
    }
    
    console.log(`✅ Migration finished. Fixed ${fixCount} bots.`);
  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixBrokenTokens();
