
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const botId = 'cmmgrw3vo007tbwtur2w2cixe'; // SongFastBot
  const adId = 'cmmn3a0kf0kb379m02yuxzbpr'; // Current Running Ad

  const count = await prisma.impression.count({
    where: { botId, adId }
  });

  console.log(`Impressions for current ad cmmn3a0kf on SongFastBot: ${count}`);

  const totalUsers = await prisma.botUser.count({
    where: { botId }
  });

  console.log(`Total users in SongFastBot: ${totalUsers}`);

  const usersWhoSawAd = await prisma.impression.findMany({
    where: { botId, adId },
    select: { telegramUserId: true }
  });

  const uniqueUsersWhoSawAd = new Set(usersWhoSawAd.map(u => u.telegramUserId)).size;
  console.log(`Unique users who saw current ad: ${uniqueUsersWhoSawAd}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
