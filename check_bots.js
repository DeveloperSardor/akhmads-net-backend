import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bots = await prisma.bot.findMany({ select: { id: true, username: true, avatarUrl: true }, orderBy: { createdAt: 'desc' }, take: 5 });
  console.log(bots);
  await prisma.$disconnect();
}
main();
