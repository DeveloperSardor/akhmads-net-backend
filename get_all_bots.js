
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bots = await prisma.bot.findMany({
    select: {
      id: true,
      username: true,
      frequencyMinutes: true,
      status: true,
      category: true,
      owner: {
        select: {
          telegramId: true,
          username: true
        }
      }
    }
  });

  console.log('--- All Bots ---');
  console.log(JSON.stringify(bots, null, 2));

  const count = await prisma.bot.count();
  console.log('Total bots in DB:', count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
