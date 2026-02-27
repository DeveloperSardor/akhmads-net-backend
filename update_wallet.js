import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = 'SardorDeveloper';
  
  // Find user by username (case-insensitive search just in case)
  const user = await prisma.user.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive'
      }
    },
    include: {
      wallet: true
    }
  });

  if (!user) {
    console.error(`User with username @${username} not found.`);
    process.exit(1);
  }

  console.log(`Found user: ${user.username} (ID: ${user.id})`);

  if (!user.wallet) {
    console.log('User has no wallet. Creating one...');
    const newWallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        available: 100.00
      }
    });
    console.log(`Wallet created with $100.00 balance:`, JSON.stringify(newWallet, null, 2));
  } else {
    console.log(`Current wallet balance: ${user.wallet.available}`);
    const updatedWallet = await prisma.wallet.update({
      where: { id: user.wallet.id },
      data: {
        available: 100.00
      }
    });
    console.log(`Wallet updated to $100.00:`, JSON.stringify(updatedWallet, null, 2));
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
