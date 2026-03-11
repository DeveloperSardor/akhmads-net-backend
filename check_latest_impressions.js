
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const latestImpressions = await prisma.impression.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      bot: { select: { username: true } },
      ad: { select: { title: true } }
    }
  });

  console.log(JSON.stringify(latestImpressions, (key, value) =>
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
