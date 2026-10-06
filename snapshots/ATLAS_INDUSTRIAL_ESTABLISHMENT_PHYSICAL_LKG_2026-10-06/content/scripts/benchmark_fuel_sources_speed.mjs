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

async function benchmarkLocalFile(authority, id, name, filePath, delimiter, parseFn, maxLines = 15000) {
  if (!fs.existsSync(filePath)) return null;
  const t0 = performance.now();
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

  let rawRows = 0;
  let personRows = 0;
  let trueNetNew = 0;
  const seen = new Set();

  for await (const line of rl) {
    rawRows++;
    if (rawRows === 1) continue;
    if (!line.trim()) continue;

    const parts = parseCsvLine(line, delimiter);
    const rawName = parseFn(parts);
    if (!rawName) continue;

    const cleaned = cleanPersonName(rawName);
    if (!cleaned) continue;

    personRows++;
    const norm = normalizeName(cleaned);
    if (!norm) continue;

    if (!authority.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      trueNetNew++;
    }

    if (rawRows >= maxLines) break;
  }

  const durationSec = (performance.now() - t0) / 1000;
  return {
    source_id: id,
    source_name: name,
    type: 'LOCAL_STREAM',
    sample_duration_sec: parseFloat(durationSec.toFixed(3)),
    sample_raw_rows: rawRows,
    sample_person_rows: personRows,
    sample_net_new: trueNetNew,
    real_rows_sec: parseFloat((rawRows / durationSec).toFixed(2)),
    persons_sec: parseFloat((personRows / durationSec).toFixed(2)),
    true_net_new_sec: parseFloat((trueNetNew / durationSec).toFixed(2))
  };
}

async function benchmarkRemoteOai(authority, id, name, baseUrl) {
  const t0 = performance.now();
  try {
    const url = `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AtlasFuelBenchmark/2.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const durationSec = (performance.now() - t0) / 1000;

    // Count creator / contributor tags
    const creatorMatches = xml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi) || [];
    const rawRows = creatorMatches.length;
    let personRows = 0;
    let trueNetNew = 0;
    const seen = new Set();

    for (const m of creatorMatches) {
      const val = m.replace(/<\/?dc:creator[^>]*>/gi, '').trim();
      const cleaned = cleanPersonName(val);
      if (!cleaned) continue;
      personRows++;
      const norm = normalizeName(cleaned);
      if (!norm) continue;
      if (!authority.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        trueNetNew++;
      }
    }

    return {
      source_id: id,
      source_name: name,
      type: 'REMOTE_OAI_PMH',
      sample_duration_sec: parseFloat(durationSec.toFixed(3)),
      sample_raw_rows: rawRows,
      sample_person_rows: personRows,
      sample_net_new: trueNetNew,
      real_rows_sec: parseFloat((rawRows / durationSec).toFixed(2)),
      persons_sec: parseFloat((personRows / durationSec).toFixed(2)),
      true_net_new_sec: parseFloat((trueNetNew / durationSec).toFixed(2))
    };
  } catch (err) {
    return {
      source_id: id,
      source_name: name,
      type: 'REMOTE_OAI_PMH',
      error: err.message,
      real_rows_sec: 0,
      persons_sec: 0,
      true_net_new_sec: 0
    };
  }
}

async function benchmarkRemoteCkan(authority, id, name, apiUrl) {
  const t0 = performance.now();
  try {
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'AtlasFuelBenchmark/2.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const durationSec = (performance.now() - t0) / 1000;

    const results = data.result?.results || [];
    let rawRows = results.length;
    let personRows = 0;
    let trueNetNew = 0;
    const seen = new Set();

    for (const it of results) {
      const title = it.author || it.maintainer || it.organization?.title || '';
      const cleaned = cleanPersonName(title);
      if (!cleaned) continue;
      personRows++;
      const norm = normalizeName(cleaned);
      if (!norm) continue;
      if (!authority.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        trueNetNew++;
      }
    }

    return {
      source_id: id,
      source_name: name,
      type: 'REMOTE_CKAN',
      sample_duration_sec: parseFloat(durationSec.toFixed(3)),
      sample_raw_rows: rawRows,
      sample_person_rows: personRows,
      sample_net_new: trueNetNew,
      real_rows_sec: parseFloat((rawRows / durationSec).toFixed(2)),
      persons_sec: parseFloat((personRows / durationSec).toFixed(2)),
      true_net_new_sec: parseFloat((trueNetNew / durationSec).toFixed(2))
    };
  } catch (err) {
    return {
      source_id: id,
      source_name: name,
      type: 'REMOTE_CKAN',
      error: err.message,
      real_rows_sec: 0,
      persons_sec: 0,
      true_net_new_sec: 0
    };
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BENCHMARKING FUEL SOURCES SPEED POTENTIAL');
  console.log('════════════════════════════════════════════════════════════════');

  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);
  console.log(`Authority loaded: ${authority.count.toLocaleString()} keys.`);

  const benchmarks = [];

  // 1. SSS Prestadores Salud
  const sss = await benchmarkLocalFile(
    authority,
    'RES_SSS_PRESTADORES_SALUD',
    'Registro Nacional de Prestadores de Salud (SSS)',
    'scratch/physical_sources/registro_profesionales_historico_sss.csv',
    ',',
    (p) => (p.length >= 2 ? `${p[1]} ${p[0]}` : null),
    15000
  );
  if (sss) benchmarks.push(sss);

  // 2. IGJ Sociedades y Directores (unconsumed slice)
  const igj = await benchmarkLocalFile(
    authority,
    'SRC_PHYSICAL_IGJ_NAC',
    'IGJ Sociedades y Directores (Slice)',
    'scratch/physical_sources/igj_autoridades_genero_202603.csv',
    ',',
    (p) => (p.length >= 2 ? p[1] : null),
    15000
  );
  if (igj) benchmarks.push(igj);

  // 3. GCBA Administradores Consorcio
  const gcbaAdm = await benchmarkLocalFile(
    authority,
    'RES_GCBA_ADMINISTRADORES_CONSORCIO',
    'GCBA Administradores de Consorcios',
    'scratch/physical_sources/gcba_administradores_consorcio.csv',
    ';',
    (p) => (p.length >= 2 ? p[1] : null),
    8500
  );
  if (gcbaAdm) benchmarks.push(gcbaAdm);

  // 4. Magistrados Ternas
  const ternas = await benchmarkLocalFile(
    authority,
    'RES_MAGISTRADOS_TERNAS',
    'Ternas Selección Magistrados Fed/Nac',
    'scratch/physical_sources/ternas_magistrados_202605.csv',
    ',',
    (p) => (p.length >= 10 ? p[9] : null),
    4400
  );
  if (ternas) benchmarks.push(ternas);

  // 5. Remote OAI CONICET
  const conicet = await benchmarkRemoteOai(
    authority,
    'SRC_OAI_CONICET_DIGITAL',
    'CONICET Digital Repositorio Institucional',
    'https://ri.conicet.gov.ar/oai/request'
  );
  benchmarks.push(conicet);

  // 6. Remote OAI UNLP
  const unlp = await benchmarkRemoteOai(
    authority,
    'SRC_OAI_UNLP_SEDICI',
    'SEDICI UNLP Repositorio Institucional',
    'http://sedici.unlp.edu.ar/oai/request'
  );
  benchmarks.push(unlp);

  // 7. Remote OAI UNComa
  const uncoma = await benchmarkRemoteOai(
    authority,
    'SRC_OAI_UNCOMA_NAC',
    'UNComa Repositorio Digital RDI',
    'https://rdi.uncoma.edu.ar/oai/request'
  );
  benchmarks.push(uncoma);

  // 8. Remote OAI UNS
  const uns = await benchmarkRemoteOai(
    authority,
    'SRC_OAI_UNS_NAC',
    'Universidad Nacional del Sur (UNS)',
    'https://repositoriodigital.uns.edu.ar/oai/request'
  );
  benchmarks.push(uns);

  // 9. Remote CKAN Datos Gob Ar
  const datosGob = await benchmarkRemoteCkan(
    authority,
    'SRC_CKAN_DATOS_GOB_AR',
    'Portal Nacional de Datos Abiertos (datos.gob.ar)',
    'https://datos.gob.ar/api/3/action/package_search?q=personas&rows=50'
  );
  benchmarks.push(datosGob);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('THROUGHPUT BENCHMARK RESULTS');
  console.log('════════════════════════════════════════════════════════════════');

  for (const b of benchmarks) {
    console.log(`\n• [${b.source_id}] ${b.source_name} (${b.type})`);
    console.log(`  Duration: ${b.sample_duration_sec}s | Sample Rows: ${b.sample_raw_rows}`);
    console.log(`  REAL_ROWS_SEC:       ${b.real_rows_sec.toLocaleString()}/sec`);
    console.log(`  PERSONS_SEC:         ${b.persons_sec.toLocaleString()}/sec`);
    console.log(`  TRUE_NET_NEW_SEC:    ${b.true_net_new_sec.toLocaleString()}/sec`);
  }

  // Tiers
  const gt500 = benchmarks.filter(b => b.true_net_new_sec > 500);
  const gt250 = benchmarks.filter(b => b.true_net_new_sec > 250);
  const gt100 = benchmarks.filter(b => b.true_net_new_sec > 100);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`TIER > 500/sec (${gt500.length} sources): ${gt500.map(s => s.source_id).join(', ')}`);
  console.log(`TIER > 250/sec (${gt250.length} sources): ${gt250.map(s => s.source_id).join(', ')}`);
  console.log(`TIER > 100/sec (${gt100.length} sources): ${gt100.map(s => s.source_id).join(', ')}`);
  console.log('════════════════════════════════════════════════════════════════');

  fs.writeFileSync('scratch/fuel_sources_speed_benchmark.json', JSON.stringify({
    benchmarks,
    tiers: {
      gt500: gt500.map(s => s.source_id),
      gt250: gt250.map(s => s.source_id),
      gt100: gt100.map(s => s.source_id)
    }
  }, null, 2), 'utf8');
}

main().catch(console.error);
