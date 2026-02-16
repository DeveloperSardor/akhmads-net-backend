import { describe, it, expect } from '@jest/globals';
import encryption from '../../../src/utils/encryption.js';

describe('Encryption Utils', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const text = 'secret_bot_token_12345';
      const encrypted = encryption.encrypt(text);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted).toBe(text);
      expect(encrypted).not.toBe(text);
    });

    it('should produce different ciphertext for same input', () => {
      const text = 'test';
      const encrypted1 = encryption.encrypt(text);
      const encrypted2 = encryption.encrypt(text);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('hash', () => {
    it('should hash text consistently', () => {
      const text = 'api_key_12345';
      const hash1 = encryption.hash(text);
      const hash2 = encryption.hash(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex
    });
  });
});