import { GlobalIdentityAuthorityV2, normalizeName } from '../scratch/build_global_identity_authority_v2.mjs';
import path from 'path';

async function testOpenAlex() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('TESTING OPENALEX UNDER PERMITTED ZERO-COST PUBLIC ACCESS');
  console.log('════════════════════════════════════════════════════════════════');

  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);

  const testConfigs = [
    {
      desc: 'Standard User-Agent with polite email',
      url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per-page=25&mailto=research@atlas.ar',
      headers: { 'User-Agent': 'AtlasRadar/2.0 (mailto:research@atlas.ar)' }
    },
    {
      desc: 'Minimal public request without custom params',
      url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR&per-page=10',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    },
    {
      desc: 'Works endpoint sample',
      url: 'https://api.openalex.org/works?filter=institutions.country_code:AR&per-page=10&mailto=research@atlas.ar',
      headers: { 'User-Agent': 'AtlasRadar/2.0 (mailto:research@atlas.ar)' }
    }
  ];

  const results = [];

  for (const cfg of testConfigs) {
    console.log(`\nTesting config: ${cfg.desc}`);
    console.log(`URL: ${cfg.url}`);
    const t0 = performance.now();
    try {
      const res = await fetch(cfg.url, { headers: cfg.headers });
      const lat = performance.now() - t0;
      console.log(`Status: ${res.status} (${lat.toFixed(1)}ms)`);
      console.log('Headers:', {
        rateRemaining: res.headers.get('x-ratelimit-remaining'),
        rateLimit: res.headers.get('x-ratelimit-limit'),
        retryAfter: res.headers.get('retry-after')
      });

      if (res.ok) {
        const json = await res.json();
        const items = json.results || [];
        console.log(`Fetched ${items.length} records. Meta count: ${json.meta?.count}`);
        let netNew = 0;
        for (const it of items) {
          const name = it.display_name;
          if (name) {
            const norm = normalizeName(name);
            if (norm && !authority.has(norm)) netNew++;
          }
        }
        console.log(`Net-new in sample: ${netNew}/${items.length}`);
        results.push({
          config: cfg.desc,
          status: res.status,
          accessible: true,
          records: items.length,
          netNew,
          totalMeta: json.meta?.count
        });
      } else {
        const errText = await res.text().catch(() => '');
        console.log(`Error body sample: ${errText.slice(0, 150)}`);
        results.push({
          config: cfg.desc,
          status: res.status,
          accessible: false,
          error: errText.slice(0, 150)
        });
      }
    } catch (err) {
      console.error('Fetch error:', err.message);
      results.push({
        config: cfg.desc,
        status: 0,
        accessible: false,
        error: err.message
      });
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('OPENALEX TEST VERDICT');
  console.log('════════════════════════════════════════════════════════════════');
  const anyAccessible = results.some(r => r.accessible);
  console.log(`ACCESSIBLE UNDER ZERO COST: ${anyAccessible}`);
  console.log(`POLICY CLASSIFICATION:     ${anyAccessible ? 'READY_REAL' : 'RATE_LIMITED'}`);

  return results;
}

testOpenAlex().catch(console.error);
