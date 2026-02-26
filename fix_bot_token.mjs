import { PrismaClient } from '@prisma/client';
import jwtUtil from './src/utils/jwt.js';

const prisma = new PrismaClient();

async function main() {
  const bot = await prisma.bot.findFirst({ where: { telegramBotId: '7899542405' }});
  if (!bot) return console.log('Bot not found');

  const newApiKey = jwtUtil.generateBotApiKey(bot);
  
  await prisma.bot.update({
    where: { id: bot.id },
    data: { apiKey: newApiKey }
  });

  console.log('NEW_API_KEY:', newApiKey);
}
main().catch(console.error).finally(() => prisma.$disconnect());
