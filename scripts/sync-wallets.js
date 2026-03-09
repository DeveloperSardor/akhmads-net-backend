// scripts/sync-wallets.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function sync() {
  console.log('🚀 Starting wallet synchronization...');
  
  // 1. Get all users who own bots
  const users = await prisma.user.findMany({
    where: {
      bots: { some: {} }
    },
    include: {
      wallet: true,
      bots: true
    }
  });

  console.log(`Found ${users.length} bot owners to check.`);

  for (const user of users) {
    try {
      // 2. Calculate total earnings from impressions for ALL bots of this user
      const botIds = user.bots.map(b => b.id);
      
      const earningsAggregate = await prisma.impression.aggregate({
        where: {
          botId: { in: botIds }
        },
        _sum: {
          botOwnerEarns: true
        }
      });

      const actualTotalEarned = parseFloat(earningsAggregate._sum.botOwnerEarns || 0);
      
      if (actualTotalEarned > 0) {
        console.log(`User: ${user.username || user.telegramId} | Calculated: ${actualTotalEarned}`);
        
        // 3. Update Wallet - we overwrite the balance to match the truth from impressions
        await prisma.wallet.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            available: actualTotalEarned,
            totalEarned: actualTotalEarned,
            reserved: 0,
            pending: 0
          },
          update: {
            available: actualTotalEarned,
            totalEarned: actualTotalEarned
          }
        });

        // 4. Also update bot's internal counters
        for (const bot of user.bots) {
          const botStats = await prisma.impression.aggregate({
            where: { botId: bot.id },
            _sum: { botOwnerEarns: true }
          });
          
          await prisma.bot.update({
            where: { id: bot.id },
            data: {
              totalEarnings: parseFloat(botStats._sum.botOwnerEarns || 0),
              pendingEarnings: parseFloat(botStats._sum.botOwnerEarns || 0)
            }
          });
        }

        console.log(`✅ Synced user ${user.username || user.telegramId}: $${actualTotalEarned}`);
      }
    } catch (err) {
      console.error(`❌ Failed to sync user ${user.id}:`, err.message);
    }
  }

  console.log('🏁 Sync completed.');
  await prisma.$disconnect();
}

sync();
