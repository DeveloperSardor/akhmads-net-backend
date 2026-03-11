
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bots = await prisma.bot.findMany({
    where: {
      username: {
        in: ['SongFastBot', 'SomgFastBot']
      }
    },
    include: {
      owner: {
        select: {
          telegramId: true,
          username: true
        }
      }
    }
  });

  console.log('--- Bots Info ---');
  console.log(JSON.stringify(bots, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));

  const runningAds = await prisma.ad.findMany({
    where: {
      status: 'RUNNING',
      remainingBudget: { gt: 0 }
    }
  });

  console.log('\n--- Running Ads Info ---');
  console.log('Total Running Ads:', runningAds.length);
  
  const adsWithTargeting = runningAds.map(ad => ({
    id: ad.id,
    title: ad.title,
    targeting: typeof ad.targeting === 'string' ? JSON.parse(ad.targeting) : ad.targeting,
    delivered: ad.deliveredImpressions,
    target: ad.targetImpressions
  }));

  console.log(JSON.stringify(adsWithTargeting, null, 2));

  // Check recent impressions for SongFastBot
  const recentImpressions = await prisma.impression.findMany({
    where: { bot: { username: 'SongFastBot' } },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('\n--- Recent Impressions for SongFastBot ---');
  console.log(JSON.stringify(recentImpressions, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
