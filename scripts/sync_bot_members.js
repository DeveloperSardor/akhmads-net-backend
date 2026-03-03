// scripts/sync_bot_members.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function syncAllBots() {
  console.log('--- Starting Bot Member Sync ---');
  
  const bots = await prisma.bot.findMany();
  console.log(`Found ${bots.length} bots to sync.`);

  for (const bot of bots) {
    const userCount = await prisma.botUser.count({
      where: { botId: bot.id }
    });
    
    console.log(`Bot @${bot.username}: Found ${userCount} unique users. Updating...`);
    
    await prisma.bot.update({
      where: { id: bot.id },
      data: {
        totalMembers: userCount,
        activeMembers: userCount
      }
    });
  }

  console.log('--- Sync Completed ---');
}

syncAllBots()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
