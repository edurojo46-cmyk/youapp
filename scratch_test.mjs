const url = 'https://jtnurafmngaxdwlzpvxv.supabase.co/functions/v1/external-search';
const anonKey = 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`
  },
  body: JSON.stringify({
    provider: 'youtube',
    query: 'arqueología de roma'
  })
}).then(res => res.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(err => console.error(err));
