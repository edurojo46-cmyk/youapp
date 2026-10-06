/**
 * probe_openalex_expansion.mjs
 * Queries OpenAlex API directly to physically verify institution RORs and exact author counts.
 */
import https from 'https';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'AtlasTeslaWheel/1.0 (mailto:discovery@atlas.youapp.internal)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function probe() {
  console.log('Fetching top Argentine institutions from OpenAlex...');
  const instUrl = 'https://api.openalex.org/institutions?filter=country_code:AR&per_page=30&sort=works_count:desc&mailto=discovery@youapp.com';
  const instData = await fetchJson(instUrl);

  console.log(`Found ${instData.meta.count} total institutions in Argentina.`);
  console.log('Verifying top 20 institutions...\n');

  const results = [];
  for (const inst of instData.results.slice(0, 20)) {
    const ror = inst.ror ? inst.ror.replace('https://ror.org/', '') : null;
    const authorUrl = `https://api.openalex.org/authors?filter=last_known_institution.id:${inst.id}&per_page=1&mailto=discovery@youapp.com`;
    let authorCount = 0;
    try {
      const aData = await fetchJson(authorUrl);
      authorCount = aData.meta.count;
    } catch (e) {
      console.warn(`Could not fetch author count for ${inst.display_name}:`, e.message);
    }

    results.push({
      id: inst.id,
      name: inst.display_name,
      ror: inst.ror,
      works_count: inst.works_count,
      author_count: authorCount
    });

    console.log(`- [${inst.display_name}] ROR: ${inst.ror || 'N/A'} | Works: ${inst.works_count} | Authors: ${authorCount}`);
    await new Promise(r => setTimeout(r, 200)); // polite rate limit
  }

  console.log('\nPROBE_RESULTS_COUNT:', results.length);
}

probe().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});
