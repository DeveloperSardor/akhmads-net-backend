import { describe, it, expect } from '@jest/globals';
import walletService from '../../../src/services/wallet/walletService.js';
import { createTestUser } from '../../helpers.js';

describe('Wallet Service', () => {
  describe('credit', () => {
    it('should credit wallet correctly', async () => {
      const user = await createTestUser();
      
      await walletService.credit(user.id, 100, 'DEPOSIT');
      
      const wallet = await walletService.getWallet(user.id);
      expect(parseFloat(wallet.available)).toBe(100);
    });

    it('should track total deposited', async () => {
      const user = await createTestUser();
      
      await walletService.credit(user.id, 50, 'DEPOSIT');
      await walletService.credit(user.id, 30, 'DEPOSIT');
      
      const wallet = await walletService.getWallet(user.id);
      expect(parseFloat(wallet.totalDeposited)).toBe(80);
    });
  });

  describe('debit', () => {
    it('should debit wallet correctly', async () => {
      const user = await createTestUser({ balance: 100 });
      
      await walletService.debit(user.id, 30, 'WITHDRAW');
      
      const wallet = await walletService.getWallet(user.id);
      expect(parseFloat(wallet.available)).toBe(70);
    });

    it('should reject insufficient balance', async () => {
      const user = await createTestUser({ balance: 10 });
      
      await expect(
        walletService.debit(user.id, 50, 'WITHDRAW')
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('reserve/release', () => {
    it('should reserve and release funds', async () => {
      const user = await createTestUser({ balance: 100 });
      
      await walletService.reserve(user.id, 40);
      
      let wallet = await walletService.getWallet(user.id);
      expect(parseFloat(wallet.available)).toBe(60);
      expect(parseFloat(wallet.reserved)).toBe(40);
      
      await walletService.releaseReserved(user.id, 40);
      
      wallet = await walletService.getWallet(user.id);
      expect(parseFloat(wallet.available)).toBe(100);
      expect(parseFloat(wallet.reserved)).toBe(0);
    });
  });
});