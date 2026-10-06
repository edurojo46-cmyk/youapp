/**
 * probe_oai_pmh.mjs
 * Minimal profiling of Argentine OAI-PMH endpoints:
 * - Identify
 * - ListMetadataFormats
 * - ListSets (optional)
 * Validates protocol adherence, resumptionToken capability, and metadata structure.
 */
import https from 'https';
import http from 'http';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'AtlasOAIProfiler/1.0 (mailto:discovery@youapp.internal)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow 1 redirect
          fetchText(res.headers.location).then(resolve).catch(reject);
        } else {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', err => resolve({ statusCode: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 408, error: 'TIMEOUT' });
    });
  });
}

const ENDPOINTS = [
  {
    name: 'SEDICI UNLP',
    base: 'http://sedici.unlp.edu.ar/oai/request',
    source_id: 'sedici_unlp'
  },
  {
    name: 'CONICET Digital',
    base: 'https://ri.conicet.gov.ar/oai/request',
    source_id: 'ri_conicet'
  },
  {
    name: 'Repositorio Digital UNC',
    base: 'https://rdu.unc.edu.ar/oai/request',
    source_id: 'rdu_unc'
  },
  {
    name: 'Repositorio Digital UBA (Filo)',
    base: 'http://repositorio.filo.uba.ar/oai/request',
    source_id: 'rdu_uba_filo'
  }
];

async function main() {
  console.log('=== TRACK OAI-PMH: MINIMAL PROFILING AUDIT ===\n');

  for (const ep of ENDPOINTS) {
    console.log(`[PROBING] ${ep.name} (${ep.base})`);
    
    // 1. Identify
    const idUrl = `${ep.base}?verb=Identify`;
    const idRes = await fetchText(idUrl);
    const hasIdentify = idRes.body && idRes.body.includes('<Identify>');
    const repoNameMatch = idRes.body ? idRes.body.match(/<repositoryName>([^<]+)<\/repositoryName>/) : null;
    const repoName = repoNameMatch ? repoNameMatch[1] : 'N/A';
    const protocolMatch = idRes.body ? idRes.body.match(/<protocolVersion>([^<]+)<\/protocolVersion>/) : null;
    const protocolVer = protocolMatch ? protocolMatch[1] : 'N/A';
    const adminEmailMatch = idRes.body ? idRes.body.match(/<adminEmail>([^<]+)<\/adminEmail>/) : null;
    const adminEmail = adminEmailMatch ? adminEmailMatch[1] : 'N/A';

    // 2. ListMetadataFormats
    const mfUrl = `${ep.base}?verb=ListMetadataFormats`;
    const mfRes = await fetchText(mfUrl);
    const supportsOaiDc = mfRes.body && mfRes.body.includes('<metadataPrefix>oai_dc</metadataPrefix>');
    const supportsDriver = mfRes.body && (mfRes.body.includes('<metadataPrefix>driver</metadataPrefix>') || mfRes.body.includes('<metadataPrefix>mods</metadataPrefix>'));

    // 3. Check resumptionToken support via ListRecords request sample
    const sampleUrl = `${ep.base}?verb=ListRecords&metadataPrefix=oai_dc`;
    // We only fetch the header/first chunk, do not consume
    const sampleRes = await fetchText(sampleUrl);
    const hasRecords = sampleRes.body && sampleRes.body.includes('<record>');
    const hasResumptionToken = sampleRes.body && sampleRes.body.includes('<resumptionToken');

    const result = {
      name: ep.name,
      base: ep.base,
      httpStatus: idRes.statusCode,
      valid_endpoint: hasIdentify,
      repositoryName: repoName,
      protocolVersion: protocolVer,
      adminEmail: adminEmail,
      supports_oai_dc: Boolean(supportsOaiDc),
      supports_driver_mods: Boolean(supportsDriver),
      has_records: Boolean(hasRecords),
      supports_resumption_token: Boolean(hasResumptionToken),
      template_available: Boolean(hasIdentify && supportsOaiDc && hasResumptionToken)
    };

    console.log(`  - Valid OAI-PMH:          ${result.valid_endpoint ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  - Repository Name:        ${result.repositoryName}`);
    console.log(`  - Protocol Version:       ${result.protocolVersion}`);
    console.log(`  - Supports oai_dc:        ${result.supports_oai_dc ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  - ResumptionToken:        ${result.supports_resumption_token ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  - MOTOR_TEMPLATE_AVAIL:   ${result.template_available ? 'READY ✅' : 'NOT READY ❌'}\n`);
  }
}

main().catch(console.error);
