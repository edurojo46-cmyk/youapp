/**
 * scripts/probe_caba_person_datasets.mjs
 * 
 * Searches data.buenosaires.gob.ar CKAN API for person-level datasets.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

async function probeUrl(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AtlasRadarProbe/3.0',
        'Range': 'bytes=0-50000'
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

async function searchCaba() {
  console.log('Fetching all datasets from data.buenosaires.gob.ar...');
  const res = await fetch('https://data.buenosaires.gob.ar/api/3/action/package_search?rows=500');
  const json = await res.json();
  if (!json.success || !json.result || !json.result.results) return [];

  console.log(`Total packages returned: ${json.result.results.length}`);

  const personDatasets = [];
  const keywords = ['autoridad', 'funcionario', 'personal', 'docente', 'empleado', 'matricul', 'profesional', 'consorcio', 'salud', 'medico', 'enfermer', 'inspector', 'proveedor', 'beneficiario', 'subsidio', 'declaracion'];

  for (const pkg of json.result.results) {
    const titleUpper = pkg.title.toUpperCase();
    const descUpper = (pkg.notes || '').toUpperCase();

    const matchesKeyword = keywords.some(k => titleUpper.includes(k.toUpperCase()) || descUpper.includes(k.toUpperCase()));
    if (!matchesKeyword) continue;

    for (const r of (pkg.resources || [])) {
      if (r.url && (r.format?.toUpperCase().includes('CSV') || r.url.endsWith('.csv'))) {
        personDatasets.push({
          pkg_title: pkg.title,
          pkg_name: pkg.name,
          resource_name: r.name,
          format: r.format,
          url: r.url
        });
      }
    }
  }

  console.log(`Found ${personDatasets.length} candidate person CSV resources on CABA.`);

  const evaluated = [];
  for (const c of personDatasets) {
    const probe = await probeUrl(c.url);
    if (!probe.ok || !probe.sampleText) continue;

    const lines = probe.sampleText.split('\n');
    if (lines.length < 5) continue;
    const header = lines[0].toUpperCase();

    // Check if header contains person name column
    const hasNameCol = header.includes('NOMBRE') || header.includes('APELLIDO') || header.includes('FUNCIONARIO') || header.includes('AGENTE') || header.includes('TITULAR') || header.includes('AUTORIDAD');
    if (!hasNameCol) continue;

    let sampleCount = 0;
    let netNewCount = 0;
    for (const line of lines.slice(1, 40)) {
      if (!line.trim()) continue;
      const parts = line.split(/[;,]/);
      for (const p of parts) {
        const cleaned = p.replace(/^"|"$/g, '').trim();
        if (cleaned.length > 5 && cleaned.includes(' ') && !cleaned.includes('HTTP')) {
          const norm = normalizeName(cleaned);
          if (norm) {
            sampleCount++;
            if (!authority.has(norm)) netNewCount++;
            break;
          }
        }
      }
    }

    const noveltyRatio = sampleCount > 0 ? parseFloat((netNewCount / sampleCount).toFixed(4)) : 0;
    const estRows = probe.totalBytes > 0 ? Math.round(probe.totalBytes / 120) : lines.length * 100;
    const lowerBound = Math.round(estRows * noveltyRatio * 0.85);

    evaluated.push({
      pkg_title: c.pkg_title,
      resource_name: c.resource_name,
      url: c.url,
      totalBytes: probe.totalBytes,
      estRows,
      sampleCount,
      netNewCount,
      noveltyRatio,
      lowerBound
    });

    console.log(`✓ [CABA] ${c.pkg_title} | Est Rows: ${estRows} | Novelty: ${(noveltyRatio * 100).toFixed(1)}% | Lower Bound: ${lowerBound}`);
  }

  evaluated.sort((a, b) => b.lowerBound - a.lowerBound);

  fs.writeFileSync('scratch/caba_evaluated_person_resources.json', JSON.stringify({
    TIMESTAMP: new Date().toISOString(),
    TOTAL_EVALUATED: evaluated.length,
    RESOURCES: evaluated
  }, null, 2), 'utf8');

  console.log(`\n✓ Saved ${evaluated.length} evaluated CABA resources to scratch/caba_evaluated_person_resources.json`);
}

searchCaba().catch(console.error);
