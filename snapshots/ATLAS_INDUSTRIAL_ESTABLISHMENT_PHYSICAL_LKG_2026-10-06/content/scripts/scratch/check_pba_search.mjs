import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const req = http.request({
  hostname: '127.0.0.1',
  port: 7700,
  path: '/indexes/atlas_persons/search',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer masterKeyAtlas2026Secure'
  }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('MeiliSearch PBA response:', {
        estimatedTotalHits: data.estimatedTotalHits,
        totalHits: data.totalHits,
        sample: data.hits?.[0] ? {
          display_name: data.hits[0].display_name,
          target_region: data.hits[0].target_region,
          geography_id: data.hits[0].geography_id
        } : null
      });
    } catch(e) {
      console.log('Error parsing:', e.message, body);
    }
  });
});

req.on('error', e => console.error('Req error:', e.message));
req.write(JSON.stringify({
  q: '',
  filter: 'target_region = "PBA"',
  limit: 1
}));
req.end();
