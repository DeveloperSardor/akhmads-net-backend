
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bots = await prisma.bot.findMany({
    where: {
      username: {
        contains: 'Song',
        mode: 'insensitive'
      }
    },
    include: {
      owner: {
        select: {
          telegramId: true,
          role: true,
          roles: true,
          username: true
        }
      }
    }
  });

  console.log(JSON.stringify(bots, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
