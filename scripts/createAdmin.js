import { PrismaClient } from '@prisma/client';
import readline from 'readline';

const prisma = new PrismaClient();

/**
 * Create super admin user
 * Run: npm run create-admin
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  try {
    console.log('╔════════════════════════════════════════╗');
    console.log('║    Create Super Admin Account         ║');
    console.log('╚════════════════════════════════════════╝\n');

    const telegramId = await question('Telegram ID: ');
    const email = await question('Email: ');
    const username = await question('Username: ');
    const firstName = await question('First Name: ');
    const lastName = await question('Last Name: ');

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (existing) {
      console.log('\n⚠️  User already exists. Updating role to SUPER_ADMIN...');
      
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'SUPER_ADMIN' },
      });

      console.log('✅ User updated to SUPER_ADMIN');
    } else {
      const user = await prisma.user.create({
        data: {
          telegramId,
          email,
          username,
          firstName,
          lastName,
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });

      // Create wallet
      await prisma.wallet.create({
        data: {
          userId: user.id,
          available: 0,
        },
      });

      console.log('\n✅ Super Admin created successfully!');
      console.log('\nDetails:');
      console.log(`  ID: ${user.id}`);
      console.log(`  Telegram ID: ${user.telegramId}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Username: @${user.username}`);
      console.log(`  Role: ${user.role}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

createAdmin();