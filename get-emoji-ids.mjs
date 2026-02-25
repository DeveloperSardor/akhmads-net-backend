import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const SESSION = '1AgAOMTQ5LjE1NC4xNjcuNTABu1HClSUNRQcFpHjQyWDQl/M62MgX1k3e9xOdjG45cL5cSK+5zeL+xdpK818bM7jbPXz5DyWzdAjtfkvi2g9uu0x3wBUSUzmdKG6g8Dph27TF7T5lmxui7zebylNoi4KTzee2lT2T+VAHdZ9u4xmPHnTp1O6t4jSrwy3oSM/MxxkYTfp1AqeOVEdu4WiZoDV0HRTcUAgcgmU5tDvoNlbXL+J4dOrweuO5sBguhPNcMVyVEtg2mzrDDjDNJ9i2oSTDnt97M8g9CeK0gVOlTU1CYTUbhIiMAVLB12YqSdJxiP+ZZieJBRbhp5tR0aE+BdxAuP1fKlXwDij4borYwEhrZE4=';

const client = new TelegramClient(
  new StringSession(SESSION),
  26958019,
  'e7d6928fbacac10dd0283b9aa3e79fcf',
  { connectionRetries: 5 }
);

await client.connect();

// O'zingizga xabar yuboring va oxirgi xabarni o'qing
const messages = await client.getMessages('me', { limit: 5 });

for (const msg of messages) {
  if (msg.entities) {
    for (const entity of msg.entities) {
      console.log('Entity type:', entity.className);
      console.log('Entity:', JSON.stringify(entity, null, 2));
    }
  }
  console.log('---');
}

await client.disconnect();