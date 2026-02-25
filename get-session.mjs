import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';

const API_ID = 26958019;
const API_HASH = 'e7d6928fbacac10dd0283b9aa3e79fcf';

const client = new TelegramClient(
  new StringSession(''), 
  API_ID, 
  API_HASH, 
  { connectionRetries: 5 }
);

await client.start({
  phoneNumber: async () => await input.text('📱 Phone number (+998...): '),
  password: async () => await input.text('🔑 2FA Password: '),
  phoneCode: async () => await input.text('📨 Code from Telegram: '),
  onError: (err) => console.log(err),
});

console.log('\n✅ SESSION STRING:');
console.log(client.session.save());
console.log('\nShu session ni .env ga saqlang!');

await client.disconnect();