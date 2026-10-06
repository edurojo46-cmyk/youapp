import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { GlobalIdentityAuthorityV2, normalizeName } from '../scratch/build_global_identity_authority_v2.mjs';

function cleanPersonName(name) {
  if (!name) return null;
  let n = name.replace(/^"|"$/g, '').trim();
  if (n.includes(',')) {
    const parts = n.split(',');
    n = `${parts[1].trim()} ${parts[0].trim()}`.trim();
  }
  n = n.replace(/[\(\)\[\]\{\}\<\>\"\'\*\_\#\@\$\%\^\&\=\+\~\`\|\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter(w => w.length > 1);
  if (words.length < 2 || words.length > 5) return null;
  const upper = n.toUpperCase();
  const rejectTokens = [
    'INSTITUTO', 'UNIVERSIDAD', 'FACULTAD', 'HOSPITAL', 'MINISTERIO', 'SECRETARIA',
    'DIRECCION', 'DEPARTAMENTO', 'CENTRO', 'LABORATORIO', 'COLEGIO', 'SOCIEDAD',
    'GRUPO', 'CONSEJO', 'FUNDACION', 'ASOCIACION', 'PROVINCIA', 'MUNICIPALIDAD',
    'GOBIERNO', 'EDITORIAL', 'REPOSITORIO', 'BIBLIOTECA', 'EDICIONES', 'AUTOR',
    'UNKNOWN', 'ANONIMO', 'REDACCION', 'REGISTRO', 'EXPEDIENTE', 'COMISION', 'CONGRESO', 'SIN INFORMACION'
  ];
  for (const tok of rejectTokens) {
    if (upper.includes(tok)) return null;
  }
  return n;
}

function parseCsvLine(line, delimiter = ',') {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result.map(s => s.replace(/^"|"$/g, '').trim());
}

async function testRemoteOaiCrossPool(authority, exactPoolKeys, id, name, baseUrl, sampleCount = 500) {
  try {
    const url = `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasCrossPoolValidator/2.0' } });
    if (!res.ok) return { id, error: `HTTP ${res.status}` };
    const xml = await res.text();
    const creatorMatches = xml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi) || [];

    let samplePersons = 0;
    let knownAuthority = 0;
    let exactPoolIntersect = 0;
    let netNew = 0;
    const seen = new Set();

    for (const m of creatorMatches) {
      const val = m.replace(/<\/?dc:creator[^>]*>/gi, '').trim();
      const cleaned = cleanPersonName(val);
      if (!cleaned) continue;
      samplePersons++;
      const norm = normalizeName(cleaned);
      if (!norm) continue;

      if (authority.has(norm)) {
        knownAuthority++;
        continue;
      }
      if (seen.has(norm)) continue;
      seen.add(norm);

      if (exactPoolKeys.has(norm)) {
        exactPoolIntersect++;
        continue;
      }

      netNew++;
    }

    const overlapRate = samplePersons > 0 ? (exactPoolIntersect / samplePersons) : 0;
    return {
      id,
      name,
      sample_persons: samplePersons,
      known_authority_v3: knownAuthority,
      exact_pool_intersect: exactPoolIntersect,
      disjoint_net_new: netNew,
      exact_pool_overlap_pct: parseFloat((overlapRate * 100).toFixed(2))
    };
  } catch (err) {
    return { id, error: err.message };
  }
}

async function run() {
  console.log('Loading Authority V3...');
  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);

  // Populate exactPoolKeys
  const exactPoolKeys = new Set();
  const exactFiles = [
    { file: 'scratch/physical_sources/registro_profesionales_sss.csv', delim: ',', pFn: p => p.length >= 2 ? `${p[1]} ${p[0]}` : null },
    { file: 'scratch/physical_sources/registro_profesionales_historico_sss.csv', delim: ',', pFn: p => p.length >= 2 ? `${p[1]} ${p[0]}` : null },
    { file: 'scratch/physical_sources/ddjj_actividades_anteriores_202606.csv', delim: ',', pFn: p => p[5] },
    { file: 'scratch/physical_sources/magistrados_designaciones_202609.csv', delim: ',', pFn: p => p[6] },
    { file: 'scratch/physical_sources/gcba_administradores_consorcio.csv', delim: ';', pFn: p => p[1] }
  ];

  for (const ef of exactFiles) {
    if (!fs.existsSync(ef.file)) continue;
    const rl = readline.createInterface({ input: fs.createReadStream(ef.file), crlfDelay: Infinity });
    let count = 0;
    for await (const line of rl) {
      count++;
      if (count === 1) continue;
      const parts = parseCsvLine(line, ef.delim);
      const rawName = ef.pFn(parts);
      if (!rawName) continue;
      const cleaned = cleanPersonName(rawName);
      if (!cleaned) continue;
      const norm = normalizeName(cleaned);
      if (norm && !authority.has(norm)) {
        exactPoolKeys.add(norm);
      }
    }
  }
  console.log(`Exact pool sample populated: ${exactPoolKeys.size.toLocaleString()} keys.`);

  const oaiEndpoints = [
    { id: 'SRC_OAI_CONICET_DIGITAL', name: 'CONICET Digital', url: 'https://ri.conicet.gov.ar/oai/request' },
    { id: 'SRC_OAI_UNLP_SEDICI', name: 'SEDICI UNLP', url: 'http://sedici.unlp.edu.ar/oai/request' },
    { id: 'SRC_OAI_UNCOMA_NAC', name: 'UNComa RDI', url: 'https://rdi.uncoma.edu.ar/oai/request' },
    { id: 'SRC_OAI_UNS_NAC', name: 'UNS Digital', url: 'https://repositoriodigital.uns.edu.ar/oai/request' }
  ];

  const results = [];
  for (const ep of oaiEndpoints) {
    console.log(`Probing cross-pool overlap for ${ep.name}...`);
    const r = await testRemoteOaiCrossPool(authority, exactPoolKeys, ep.id, ep.name, ep.url);
    results.push(r);
    console.log(`  Sample Persons: ${r.sample_persons} | Exact Intersect: ${r.exact_pool_intersect} (${r.exact_pool_overlap_pct}%) | Disjoint Net New: ${r.disjoint_net_new}`);
  }

  fs.writeFileSync('scratch/academic_crosspool_audit.json', JSON.stringify(results, null, 2), 'utf8');
}

run().catch(console.error);
