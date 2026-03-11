
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const adCount = await prisma.ad.count();
  const botCount = await prisma.bot.count();
  const userCount = await prisma.user.count();

  console.log(`Totals: Ads=${adCount}, Bots=${botCount}, Users=${userCount}`);

  if (botCount > 0) {
    const sampleBots = await prisma.bot.findMany({ take: 5 });
    console.log('Sample Bots:', sampleBots.map(b => b.username));
  }

  if (adCount > 0) {
    const ads = await prisma.ad.findMany({ select: { id: true, title: true, status: true } });
    console.log('Ads:', ads);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
