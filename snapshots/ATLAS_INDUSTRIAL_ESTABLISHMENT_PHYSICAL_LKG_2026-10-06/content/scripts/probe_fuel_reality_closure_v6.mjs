/**
 * scripts/probe_fuel_reality_closure_v6.mjs
 * 
 * Live probing script to verify:
 * 1. SRC_PBA_BOLETIN_OFICIAL
 * 2. SRC_INAES_COOP_MUTUAL
 * 3. 10 Regional Academic OAI endpoints
 * 4. Radar Expansion candidate endpoints
 */

import fetch from 'node-fetch';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

// Load authority V4 + delta for live sample testing
console.log('Loading authority V4 + delta for live novelty sampling...');
const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

async function probeUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'AtlasRadarProbe/3.0 (Government & Academic Audit)',
        ...(options.headers || {})
      }
    });
    clearTimeout(t);
    const latency = Date.now() - start;
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      latency,
      tlsValid: true,
      error: null,
      res
    };
  } catch (err) {
    clearTimeout(t);
    const latency = Date.now() - start;
    const isTls = err.code && (err.code.includes('CERT') || err.code.includes('TLS') || err.message.includes('certificate'));
    return {
      ok: false,
      status: 0,
      statusText: err.code || 'FETCH_ERROR',
      headers: {},
      latency,
      tlsValid: !isTls,
      error: err.message,
      isTlsError: isTls
    };
  }
}

async function probeOai(name, baseUrl) {
  console.log(`\nProbing Academic OAI: ${name} (${baseUrl})...`);
  const identifyUrl = `${baseUrl}?verb=Identify`;
  const listUrl = `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;

  const idRes = await probeUrl(identifyUrl);
  if (!idRes.ok) {
    return {
      name,
      host: new URL(baseUrl).hostname,
      status: idRes.status,
      tlsValid: idRes.tlsValid,
      identifyPass: false,
      listRecordsPass: false,
      sampleSize: 0,
      netNewRatio: 0,
      error: idRes.error || `HTTP ${idRes.status}`
    };
  }

  const listRes = await probeUrl(listUrl);
  if (!listRes.ok) {
    return {
      name,
      host: new URL(baseUrl).hostname,
      status: listRes.status,
      tlsValid: listRes.tlsValid,
      identifyPass: true,
      listRecordsPass: false,
      sampleSize: 0,
      netNewRatio: 0,
      error: listRes.error || `HTTP ${listRes.status}`
    };
  }

  const xml = await listRes.res.text();
  const records = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/gi)];
  const creators = [...xml.matchAll(/<dc:creator>([^<]+)<\/dc:creator>/gi)].map(m => m[1].trim());

  let netNewCount = 0;
  for (const c of creators) {
    const norm = normalizeName(c);
    if (norm && !authority.has(norm)) {
      netNewCount++;
    }
  }

  const sampleSize = creators.length;
  const netNewRatio = sampleSize > 0 ? parseFloat((netNewCount / sampleSize).toFixed(4)) : 0;

  return {
    name,
    host: new URL(baseUrl).hostname,
    status: listRes.status,
    tlsValid: true,
    identifyPass: true,
    listRecordsPass: records.length > 0,
    recordsFound: records.length,
    sampleSize,
    netNewCount,
    netNewRatio,
    error: null
  };
}

async function runAudit() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('AUDITING CONTROVERSIAL & INELIGIBLE SOURCES');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. PBA Boletin Oficial
  console.log('\n[1] Probing PBA Boletín Oficial (boletinoficial.gba.gob.ar)...');
  const pbaRes = await probeUrl('https://boletinoficial.gba.gob.ar');
  console.log('PBA Result:', {
    status: pbaRes.status,
    tlsValid: pbaRes.tlsValid,
    isTlsError: pbaRes.isTlsError,
    error: pbaRes.error
  });

  // 2. INAES Coop Mutual
  console.log('\n[2] Probing INAES Cooperativas y Mutuales...');
  const inaesRes1 = await probeUrl('https://datos.gob.ar/api/3/action/package_search?q=cooperativas&rows=5');
  console.log('INAES API Result:', {
    status: inaesRes1.status,
    ok: inaesRes1.ok,
    error: inaesRes1.error
  });
  if (inaesRes1.ok) {
    const json = await inaesRes1.res.json();
    console.log('INAES Packages Count:', json.result ? json.result.count : 0);
  }

  // 3. Probing the 10 Academic Sources from Holdout V5
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('AUDITING 10 REGIONAL ACADEMIC SOURCES');
  console.log('════════════════════════════════════════════════════════════════');

  const academicSources = [
    { id: 'HOLDOUT_SRC_OAI_UNL_LITORAL', name: 'UNL Litoral', url: 'https://bibliotecavirtual.unl.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNR_ROSARIO', name: 'UNR Rosario', url: 'https://rephip.unr.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNT_TUCUMAN', name: 'UNT Tucumán', url: 'https://riunt.unt.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_CIC_GBA', name: 'CIC PBA', url: 'https://digital.cic.gba.gob.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNNE_CORRIENTES', name: 'UNNE Corrientes', url: 'https://repositorio.unne.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNMDP_NULAN', name: 'UNMDP Nulan', url: 'https://nulan.mdp.edu.ar/cgi/oai2' },
    { id: 'HOLDOUT_SRC_OAI_UBA_FCE', name: 'UBA Económicas', url: 'https://bibliotecadigital.econ.uba.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNGS_SARMIENTO', name: 'UNGS Sarmiento', url: 'https://repositorio.ungs.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNSAM_DIGITAL', name: 'UNSAM Digital', url: 'https://ri.unsam.edu.ar/oai/request' },
    { id: 'HOLDOUT_SRC_OAI_UNJU_JUJUY', name: 'UNJu Jujuy', url: 'https://di.unju.edu.ar/oai/request' }
  ];

  const academicResults = [];
  for (const ac of academicSources) {
    const res = await probeOai(ac.name, ac.url);
    res.source_id = ac.id;
    academicResults.push(res);
  }

  // Also test other high-capacity university repos
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('PROBING RADAR EXPANSION CANDIDATES (NEW INDEPENDENT HOSTS)');
  console.log('════════════════════════════════════════════════════════════════');
  const expansionCandidates = [
    { id: 'SRC_OAI_UNCUYO', name: 'UNCuyo BIDA', url: 'https://bida.uncu.edu.ar/oai/request' },
    { id: 'SRC_OAI_UNER', name: 'UNER Ciencia Abierta', url: 'https://cienciaabierta.uner.edu.ar/oai/request' },
    { id: 'SRC_OAI_UTN', name: 'UTN RIA', url: 'https://ria.utn.edu.ar/oai/request' },
    { id: 'SRC_OAI_UBA_EXACTAS', name: 'UBA Exactas', url: 'https://bibliotecadigital.exactas.uba.ar/oai/request' }
  ];

  const candidateResults = [];
  for (const c of expansionCandidates) {
    const res = await probeOai(c.name, c.url);
    res.source_id = c.id;
    candidateResults.push(res);
  }

  // 4. Test IGJ Range Streamer Capacity (bytes 260M - 450M)
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('PROBING IGJ DATASET TOTAL REMAINING REMOTE CAPACITY');
  console.log('════════════════════════════════════════════════════════════════');
  const igjUrl = 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv';
  const igjHead = await probeUrl(igjUrl, { method: 'HEAD' });
  console.log('IGJ HEAD result:', {
    status: igjHead.status,
    contentLength: igjHead.headers['content-length'],
    acceptRanges: igjHead.headers['accept-ranges']
  });

  // Probe a slice from 260MB to 260.5MB to measure density and novelty against V4+Delta
  const igjRange = await probeUrl(igjUrl, {
    headers: { 'Range': 'bytes=260000000-260500000' }
  });
  if (igjRange.status === 206) {
    const text = await igjRange.res.text();
    const lines = text.split('\n');
    let samplePersons = 0;
    let sampleNetNew = 0;
    for (const l of lines) {
      const parts = l.split('","').map(s => s.replace(/^"|"$/g, '').trim());
      if (parts.length >= 6 && parts[1]) {
        samplePersons++;
        const norm = normalizeName(parts[1]);
        if (norm && !authority.has(norm)) {
          sampleNetNew++;
        }
      }
    }
    console.log('IGJ Extension Range (260MB+) Sample:', {
      linesFound: lines.length,
      samplePersons,
      sampleNetNew,
      noveltyRatio: samplePersons > 0 ? (sampleNetNew / samplePersons).toFixed(4) : 0
    });
  }

  // 5. Test Boletin Oficial Nacional
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('PROBING BOLETIN OFICIAL DE LA REPUBLICA ARGENTINA');
  console.log('════════════════════════════════════════════════════════════════');
  const boRes = await probeUrl('https://www.boletinoficial.gob.ar');
  console.log('Boletin Oficial Nac Result:', {
    status: boRes.status,
    tlsValid: boRes.tlsValid,
    error: boRes.error
  });

  // Save all probe results
  const probeAuditReport = {
    TIMESTAMP: new Date().toISOString(),
    PBA_BOLETIN: {
      status: pbaRes.status,
      tlsValid: pbaRes.tlsValid,
      isTlsError: pbaRes.isTlsError,
      error: pbaRes.error
    },
    INAES: {
      status: inaesRes1.status,
      ok: inaesRes1.ok,
      error: inaesRes1.error
    },
    ACADEMIC_10_SOURCES: academicResults,
    EXPANSION_CANDIDATES: candidateResults,
    IGJ_CAPACITY: {
      contentLength: igjHead.headers['content-length'],
      acceptRanges: igjHead.headers['accept-ranges']
    }
  };

  fs.writeFileSync('scratch/fuel_reality_closure_v6_probes.json', JSON.stringify(probeAuditReport, null, 2), 'utf8');
  console.log('\n✓ Saved audit results to scratch/fuel_reality_closure_v6_probes.json');
}

runAudit().catch(console.error);
