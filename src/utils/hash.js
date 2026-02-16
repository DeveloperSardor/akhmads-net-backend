import crypto from 'crypto';
import logger from './logger.js';

/**
 * Hash and Code Generation Utility
 */
class Hash {
  /**
   * Generate a single 4-digit code
   */
  generateCode(length = 4) {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  }

  /**
   * ✅ Generate 4 unique codes (1 correct + 3 fake)
   * @returns {object} - { codes: string[], correctCode: string }
   */
  generateLoginCodes() {
    const codes = new Set();
    
    // Generate 4 unique codes
    while (codes.size < 4) {
      codes.add(this.generateCode(4));
    }
    
    const codesArray = Array.from(codes);
    
    // Pick random code as correct one
    const correctIndex = Math.floor(Math.random() * 4);
    const correctCode = codesArray[correctIndex];
    
    return {
      codes: codesArray,      // [1301, 5617, 6535, 8866]
      correctCode,            // 5617 (example)
    };
  }

  /**
   * Generate random string
   */
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

const hash = new Hash();
export default hash;