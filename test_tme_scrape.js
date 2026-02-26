import axios from 'axios';
async function test() {
  try {
     const res = await axios.get('https://t.me/PremiumLabBot');
     const match = res.data.match(/<meta property="og:image" content="([^"]+)"/);
     console.log(match ? match[1] : "No match");
  } catch(e) { console.error(e.message); }
}
test();
