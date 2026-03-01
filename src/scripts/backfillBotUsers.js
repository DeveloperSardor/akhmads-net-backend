/**
 * Backfill BotUser table from existing Impression records.
 *
 * Run once:
 *   node src/scripts/backfillBotUsers.js
 *
 * Logic:
 *   - Groups all Impressions by (botId, telegramUserId)
 *   - For each unique pair, picks the most recent impression
 *   - Upserts BotUser with all available fields; fills defaults for missing ones
 */

import prisma from '../config/database.js';

async function main() {
  console.log('🚀  Starting BotUser backfill...\n');

  // 1. Fetch all impressions that have a telegramUserId
  const impressions = await prisma.impression.findMany({
    where: { telegramUserId: { not: null } },
    select: {
      botId: true,
      telegramUserId: true,
      firstName: true,
      lastName: true,
      username: true,
      languageCode: true,
      country: true,
      city: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' }, // asc so the last one we process = most recent
  });

  console.log(`📋  Found ${impressions.length} impressions to process.\n`);

  if (impressions.length === 0) {
    console.log('Nothing to backfill. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // 2. Group by (botId + telegramUserId) — keep the most recent row per pair
  const userMap = new Map();

  for (const imp of impressions) {
    const key = `${imp.botId}::${imp.telegramUserId}`;
    const existing = userMap.get(key);

    // Later (more recent) impressions overwrite earlier ones
    if (!existing || imp.createdAt > existing.createdAt) {
      userMap.set(key, imp);
    }
  }

  console.log(`👥  Unique (bot, user) pairs: ${userMap.size}\n`);

  // 3. Upsert each unique pair
  let created = 0;
  let updated = 0;
  let failed  = 0;

  for (const [key, imp] of userMap) {
    try {
      const result = await prisma.botUser.upsert({
        where: {
          botId_telegramUserId: {
            botId: imp.botId,
            telegramUserId: imp.telegramUserId,
          },
        },
        create: {
          botId:         imp.botId,
          telegramUserId: imp.telegramUserId,
          firstName:     imp.firstName     ?? null,
          lastName:      imp.lastName      ?? null,
          username:      imp.username      ?? null,
          languageCode:  imp.languageCode  ?? null,
          country:       imp.country       ?? 'Unknown',
          city:          imp.city          ?? 'Unknown',
          isBot:         false,
          lastSeenIp:    null,
          lastSeenAt:    imp.createdAt,
          createdAt:     imp.createdAt,
        },
        update: {
          // Only overwrite if we have a real value
          firstName:    imp.firstName    ?? undefined,
          lastName:     imp.lastName     ?? undefined,
          username:     imp.username     ?? undefined,
          languageCode: imp.languageCode ?? undefined,
          country:      imp.country      ?? undefined,
          city:         imp.city         ?? undefined,
          lastSeenAt:   imp.createdAt,
        },
      });

      // Prisma upsert doesn't tell us create vs update directly,
      // so we track via a secondary count query workaround — just log both
      console.log(`  ✅  ${imp.telegramUserId} @ bot ${imp.botId}`);
      created++; // We count all as processed
    } catch (err) {
      console.error(`  ❌  Failed for ${key}:`, err.message);
      failed++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Processed : ${created}
❌  Failed    : ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
