/**
 * scripts/radar_expand_national_fuel_v6.mjs
 * 
 * RADAR NATIONAL FUEL EXPANSION V6
 * Discovers and validates high-density public datasets in Argentina.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

console.log('Loading authority V4 + delta for live novelty sampling...');
const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

async function probeUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'AtlasRadarDiscovery/3.0 (Argentine National Open Data)',
        ...(options.headers || {})
      }
    });
    clearTimeout(t);
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), res };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, error: err.message };
  }
}

async function searchCkan(baseUrl, query) {
  console.log(`Searching CKAN ${baseUrl} for '${query}'...`);
  const url = `${baseUrl}/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=25`;
  const probe = await probeUrl(url);
  if (!probe.ok) {
    console.log(`CKAN search failed: HTTP ${probe.status}`);
    return [];
  }
  const json = await probe.res.json();
  if (!json.success || !json.result || !json.result.results) return [];

  const datasets = [];
  for (const pkg of json.result.results) {
    for (const r of (pkg.resources || [])) {
      if (r.format && (r.format.toUpperCase().includes('CSV') || r.format.toUpperCase().includes('ZIP') || r.format.toUpperCase().includes('JSON'))) {
        datasets.push({
          pkg_title: pkg.title,
          pkg_name: pkg.name,
          organization: pkg.organization?.title || pkg.author,
          resource_name: r.name,
          format: r.format,
          url: r.url,
          size: r.size || 0,
          description: r.description
        });
      }
    }
  }
  return datasets;
}

async function runDiscovery() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('SEARCHING NATIONAL OPEN DATA CATALOGS FOR PERSON FUEL');
  console.log('════════════════════════════════════════════════════════════════');

  const ckanQueries = ['profesionales', 'matriculas', 'autoridades', 'personal', 'docentes', 'beneficiarios', 'registro'];
  const allDiscovered = [];

  for (const q of ckanQueries) {
    const res = await searchCkan('https://datos.gob.ar', q);
    for (const d of res) {
      if (!allDiscovered.some(x => x.url === d.url)) {
        allDiscovered.push(d);
      }
    }
  }

  console.log(`Total unique candidate resources found on datos.gob.ar: ${allDiscovered.length}`);

  // Also query datos.jus.gob.ar packages
  const jusPackagesRes = await probeUrl('https://datos.jus.gob.ar/api/3/action/package_list');
  let jusDatasets = [];
  if (jusPackagesRes.ok) {
    const json = await jusPackagesRes.res.json();
    const pkgIds = json.result || [];
    console.log(`Found ${pkgIds.length} datasets on datos.jus.gob.ar`);

    for (const id of pkgIds.slice(0, 30)) {
      const showRes = await probeUrl(`https://datos.jus.gob.ar/api/3/action/package_show?id=${id}`);
      if (showRes.ok) {
        const pJson = await showRes.res.json();
        const p = pJson.result;
        for (const r of (p.resources || [])) {
          if (r.format && r.format.toUpperCase().includes('CSV')) {
            jusDatasets.push({
              pkg_title: p.title,
              pkg_name: p.name,
              organization: 'Ministerio de Justicia',
              resource_name: r.name,
              format: r.format,
              url: r.url,
              size: r.size
            });
          }
        }
      }
    }
  }

  console.log(`Found ${jusDatasets.length} CSV resources on datos.jus.gob.ar`);

  // Probe candidates for row count & person density
  const candidatesToProbe = [...jusDatasets, ...allDiscovered];
  const validatedResources = [];

  for (const c of candidatesToProbe) {
    if (!c.url || !c.url.startsWith('http')) continue;
    // Probe head or range
    const probe = await probeUrl(c.url, { method: 'HEAD' });
    if (probe.ok) {
      const cLength = parseInt(probe.headers['content-length'] || '0', 10);
      c.contentLength = cLength;
      c.status = probe.status;
      if (cLength > 100000) { // at least 100KB
        validatedResources.push(c);
      }
    }
  }

  console.log(`\nValidated large resources (>100KB): ${validatedResources.length}`);
  for (const v of validatedResources.slice(0, 20)) {
    console.log(`- [${(v.contentLength / 1024 / 1024).toFixed(2)} MB] ${v.pkg_title} | ${v.resource_name} | ${v.url}`);
  }

  fs.writeFileSync('scratch/radar_expansion_discovered_resources.json', JSON.stringify({
    TIMESTAMP: new Date().toISOString(),
    TOTAL_VALIDATED: validatedResources.length,
    RESOURCES: validatedResources
  }, null, 2), 'utf8');

  console.log('✓ Saved discovered resources to scratch/radar_expansion_discovered_resources.json');
}

runDiscovery().catch(console.error);
