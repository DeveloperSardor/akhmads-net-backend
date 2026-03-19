
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const songFastBot = await prisma.bot.findUnique({
    where: { username: 'SongFastBot' }
  });

  if (!songFastBot) {
    console.log('SongFastBot not found');
    return;
  }

  console.log('--- SongFastBot Status ---');
  console.log('ID:', songFastBot.id);
  console.log('Status:', songFastBot.status);
  console.log('Integration Mode:', songFastBot.integrationMode);
  console.log('Auto Accept Ads:', songFastBot.autoAcceptAds);
  console.log('Total Earnings:', songFastBot.totalEarnings);

  const stats = await prisma.botStatistics.findMany({
    where: { botId: songFastBot.id },
    orderBy: { date: 'desc' },
    take: 10
  });

  console.log('\n--- Daily Stats (Last 10 entries) ---');
  console.table(stats.map(s => ({
    date: s.date.toISOString().split('T')[0],
    impressions: s.impressions,
    clicks: s.clicks,
    revenue: s.revenue.toString()
  })));

  const recentImpressions = await prisma.impression.count({
    where: { 
      botId: songFastBot.id,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  console.log('\nImpressions in last 24h:', recentImpressions);

  const runningAds = await prisma.ad.findMany({
    where: { status: 'RUNNING' }
  });

  console.log('\n--- Analyzing Running Ads Matching ---');
  for (const ad of runningAds) {
    const targeting = typeof ad.targeting === 'string' ? JSON.parse(ad.targeting) : ad.targeting;
    console.log(`Ad: ${ad.title}`);
    console.log(`Targeting: ${JSON.stringify(targeting)}`);
    console.log(`Bot Language: ${songFastBot.language}`);
    
    const langMatch = !targeting.languages || targeting.languages.length === 0 || targeting.languages.includes(songFastBot.language);
    console.log(`Language Match: ${langMatch}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
