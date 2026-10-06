import 'dotenv/config';

async function test() {
  const url = `https://api.openalex.org/authors?search=Gisela+Eva+Cassiodoro&per_page=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'YouApp-Atlas-Research/2.0 (mailto:admin@youapp.com; contact: https://youapp.com)'
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.slice(0, 300));
}

test();
