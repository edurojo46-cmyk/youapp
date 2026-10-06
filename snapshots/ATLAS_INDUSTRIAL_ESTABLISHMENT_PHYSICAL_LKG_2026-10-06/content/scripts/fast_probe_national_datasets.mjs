/**
 * scripts/fast_probe_national_datasets.mjs
 * 
 * Concurrent probe of Argentine national open data person datasets.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

async function probeUrl(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AtlasRadarProbe/3.0',
        'Range': 'bytes=0-50000' // fetch first 50KB to inspect header and sample rows
      },
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok && res.status !== 206) return { ok: false, status: res.status };
    const text = await res.text();
    const contentRange = res.headers.get('content-range');
    const totalBytes = contentRange ? parseInt(contentRange.split('/')[1], 10) : 0;
    return { ok: true, status: res.status, totalBytes, sampleText: text };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, error: err.message };
  }
}

async function inspectCkanPortal(baseUrl, query) {
  const searchUrl = `${baseUrl}/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=15`;
  try {
    const res = await fetch(searchUrl, { timeout: 6000 });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !json.result || !json.result.results) return [];

    const resources = [];
    for (const pkg of json.result.results) {
      for (const r of (pkg.resources || [])) {
        if (r.url && (r.format?.toUpperCase().includes('CSV') || r.url.endsWith('.csv'))) {
          resources.push({
            pkg_id: pkg.id,
            pkg_title: pkg.title,
            pkg_name: pkg.name,
            org: pkg.organization?.title || 'Estado Nacional',
            name: r.name,
            url: r.url
          });
        }
      }
    }
    return resources;
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log('Searching CKAN packages on datos.gob.ar and datos.jus.gob.ar...');

  const queries = [
    'sociedades', 'directores', 'autoridades', 'magistrados', 'justicia',
    'profesionales', 'matriculas', 'salud', 'docentes', 'empleados', 'compras'
  ];

  const candidateMap = new Map();
  for (const q of queries) {
    const r1 = await inspectCkanPortal('https://datos.gob.ar', q);
    const r2 = await inspectCkanPortal('https://datos.jus.gob.ar', q);
    for (const r of [...r1, ...r2]) {
      if (!candidateMap.has(r.url)) {
        candidateMap.set(r.url, r);
      }
    }
  }

  console.log(`Discovered ${candidateMap.size} unique CSV candidate resources.`);

  const candidates = Array.from(candidateMap.values());
  const evaluated = [];

  // Concurrency pool of 10
  for (let i = 0; i < candidates.length; i += 10) {
    const batch = candidates.slice(i, i + 10);
    const results = await Promise.all(batch.map(async c => {
      const probe = await probeUrl(c.url);
      if (!probe.ok || !probe.sampleText) return null;

      const lines = probe.sampleText.split('\n');
      if (lines.length < 5) return null;
      const header = lines[0];

      // Check if header contains person indicators (nombre, apellido, persona, etc.)
      const hUpper = header.toUpperCase();
      const isPerson = hUpper.includes('NOMBRE') || hUpper.includes('APELLIDO') || hUpper.includes('AUTORIDAD') || hUpper.includes('JUEZ') || hUpper.includes('TITULAR') || hUpper.includes('DIRECTOR') || hUpper.includes('PROFESIONAL') || hUpper.includes('RAZON_SOCIAL');

      if (!isPerson) return null;

      // Sample first 20 rows for novelty against V4+Delta
      let sampleCount = 0;
      let netNewCount = 0;
      for (const line of lines.slice(1, 30)) {
        if (!line.trim()) continue;
        const parts = line.split(/[;,]/);
        // Find part that looks like a person name
        for (const p of parts) {
          const cleaned = p.replace(/^"|"$/g, '').trim();
          if (cleaned.length > 5 && cleaned.includes(' ') && !cleaned.includes('HTTP')) {
            const norm = normalizeName(cleaned);
            if (norm) {
              sampleCount++;
              if (!authority.has(norm)) {
                netNewCount++;
              }
              break;
            }
          }
        }
      }

      const noveltyRatio = sampleCount > 0 ? parseFloat((netNewCount / sampleCount).toFixed(4)) : 0;
      const estRows = probe.totalBytes > 0 ? Math.round(probe.totalBytes / 120) : lines.length * 100;
      const lowerBound = Math.round(estRows * noveltyRatio * 0.85);

      return {
        pkg_title: c.pkg_title,
        org: c.org,
        name: c.name,
        url: c.url,
        totalBytes: probe.totalBytes,
        estRows,
        sampleCount,
        netNewCount,
        noveltyRatio,
        lowerBound
      };
    }));

    for (const r of results) {
      if (r && r.lowerBound > 1000) {
        evaluated.push(r);
        console.log(`[FOUND CANDIDATE] ${r.pkg_title} | Est Rows: ${r.estRows} | Novelty: ${(r.noveltyRatio * 100).toFixed(1)}% | Lower Bound: ${r.lowerBound}`);
      }
    }
  }

  evaluated.sort((a, b) => b.lowerBound - a.lowerBound);

  fs.writeFileSync('scratch/fast_probe_evaluated_candidates.json', JSON.stringify({
    TIMESTAMP: new Date().toISOString(),
    TOTAL_FOUND: evaluated.length,
    CANDIDATES: evaluated
  }, null, 2), 'utf8');

  console.log(`\n✓ Evaluated ${evaluated.length} high-density person datasets. Saved to scratch/fast_probe_evaluated_candidates.json`);
}

main().catch(console.error);
