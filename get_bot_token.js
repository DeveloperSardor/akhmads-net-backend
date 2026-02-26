import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bot = await prisma.bot.findFirst({
    where: { telegramBotId: '7899542405' },
    select: { id: true, username: true, apiKey: true }
  });
  console.log('Bot:', bot);
}
main().catch(console.error).finally(() => prisma.$disconnect());
