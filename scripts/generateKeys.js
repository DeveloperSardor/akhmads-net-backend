import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generate secure encryption keys
 * Run: npm run generate-keys
 */

console.log('🔐 Generating encryption keys...\n');

// Generate AES-256 key (32 bytes = 64 hex characters)
const encryptionKey = crypto.randomBytes(32).toString('hex');

// Generate IV (16 bytes = 32 hex characters)
const encryptionIv = crypto.randomBytes(16).toString('hex');

// Generate JWT secret (64 bytes = very secure)
const jwtSecret = crypto.randomBytes(64).toString('hex');

// Generate session secret
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('✅ Keys generated successfully!\n');
console.log('Add these to your .env file:\n');
console.log('# ==================== SECURITY KEYS ====================');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`ENCRYPTION_IV=${encryptionIv}`);
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log('\n⚠️  IMPORTANT: Keep these keys secret and never commit them to git!\n');

// Optionally save to file
const keysFile = path.join(process.cwd(), '.env.keys');

try {
  const content = `# Generated on ${new Date().toISOString()}
# IMPORTANT: Copy these to your .env file and delete this file!

JWT_SECRET=${jwtSecret}
ENCRYPTION_KEY=${encryptionKey}
ENCRYPTION_IV=${encryptionIv}
SESSION_SECRET=${sessionSecret}
`; 

  fs.writeFileSync(keysFile, content);
  console.log(`💾 Keys also saved to: ${keysFile}`);
  console.log('   Copy them to .env and delete this file!\n');
} catch (error) {
  console.error('Failed to save keys file:', error.message);
}