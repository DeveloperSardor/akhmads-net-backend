
import { Bot } from 'grammy';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// Minimal decryption since I don't want to import the whole project config
function decrypt(text, key, iv) {
  const [ivPart, encryptedText, authTag] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(ivPart, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const prisma = new PrismaClient();

async function main() {
  const bots = await prisma.bot.findMany({
    where: { username: { in: ['SongFastBot', 'SomgFastBot'] } }
  });

  const ENCRYPTION_KEY = '381ed0f2708b029543b614cfb5ad916c732295eaeeefd9a43c23aa5cadf8ed8f';
  const ENCRYPTION_IV = '0123456789abcdef0123456789abcdef';

  for (const botData of bots) {
    console.log(`\n--- Checking Bot: @${botData.username} ---`);
    try {
      const token = decrypt(botData.tokenEncrypted, ENCRYPTION_KEY, ENCRYPTION_IV);
      const bot = new Bot(token);
      const me = await bot.api.getMe();
      const webhook = await bot.api.getWebhookInfo();
      
      console.log('Bot Me:', me.username);
      console.log('Webhook Info:', JSON.stringify(webhook, null, 2));
      
      if (webhook.url) {
        console.log(`⚠️ Bot @${botData.username} has a WEBHOOK set. Long-polling will NOT work.`);
      } else {
        console.log(`✅ Bot @${botData.username} has no webhook. Long-polling should work.`);
      }
    } catch (err) {
      console.error(`Error checking bot @${botData.username}:`, err.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
