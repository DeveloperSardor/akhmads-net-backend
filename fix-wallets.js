import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixNegativeWalletBalances() {
  try {
    console.log('Fixing negative wallet balances...');
    
    // Find all wallets with negative reserved
    const negativeReservedWallets = await prisma.wallet.findMany({
      where: {
        reserved: { lt: 0 }
      }
    });
    
    console.log(`Found ${negativeReservedWallets.length} wallets with negative reserved.`);
    
    for (const wallet of negativeReservedWallets) {
      console.log(`Fixing wallet for user ${wallet.userId} (reserved: ${wallet.reserved})`);
      
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { reserved: 0 }
      });
      
      console.log(`Fixed wallet ${wallet.id}`);
    }
    
    console.log('Done.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixNegativeWalletBalances();
