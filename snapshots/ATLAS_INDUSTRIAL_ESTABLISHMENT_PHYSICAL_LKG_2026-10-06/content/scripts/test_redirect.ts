import fetch from 'node-fetch';

async function testRedirect() {
  const rssLink = 'https://news.google.com/rss/articles/CBMiswFBVV95cUxQdXZ6ejdldVNRZDh5d0JpZ2dyWjg4MmVnNGhHTS1VMFM1MUdHSTJWUTFBX0FBMk9jcXotVldFOXluTmNBdkJ3YXIyQVhzTjZqQmFoQklWSHBLUm13QlNkTmxTeGtiM0lxUE5OdEJGQmRLQ2RhZjRsZTNvN2p1NHRTNERVcGtPbUR2Rmo2UTdFWUxiWlFsNTBkcVBMT0N2Y0J4X2FwWmIydWZYNGc5b20yeWhsMA?oc=5';
  
  console.log('Testing redirect for Google News link...');
  const res = await fetch(rssLink, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  console.log('Final URL:', res.url);
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);
  // Extract meta title and og:description
  const ogTitle = (html.match(/<meta\s+property="og:title"\s+content="(.*?)"/i) || html.match(/<title>(.*?)<\/title>/i) || [])[1];
  const ogDesc = (html.match(/<meta\s+property="og:description"\s+content="(.*?)"/i) || [])[1];
  console.log('OG Title:', ogTitle);
  console.log('OG Description:', ogDesc);
}

testRedirect().catch(console.error);
