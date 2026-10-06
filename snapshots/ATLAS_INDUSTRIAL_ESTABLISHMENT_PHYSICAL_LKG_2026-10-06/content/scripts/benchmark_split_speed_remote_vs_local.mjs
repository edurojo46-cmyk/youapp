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

async function benchmarkSplit(authority, id, name, remoteUrl, rangeBytes, localFilePath, delimiter, parseFn) {
  console.log(`\nBenchmarking [${id}] ${name}...`);

  // 1. Remote download stage
  let remoteBytes = 0;
  let remoteRows = 0;
  let remoteDurationSec = 0;
  let remoteOk = false;

  const t0Remote = performance.now();
  try {
    const res = await fetch(remoteUrl, {
      headers: {
        'User-Agent': 'AtlasSpeedBenchmark/2.0',
        'Range': `bytes=0-${rangeBytes}`
      }
    });
    if (res.ok || res.status === 206) {
      const text = await res.text();
      remoteDurationSec = (performance.now() - t0Remote) / 1000;
      remoteBytes = Buffer.byteLength(text, 'utf8');
      const lines = text.split('\n');
      remoteRows = lines.length;
      remoteOk = true;
    } else {
      remoteDurationSec = (performance.now() - t0Remote) / 1000;
    }
  } catch (e) {
    remoteDurationSec = (performance.now() - t0Remote) / 1000;
  }

  const remoteDownloadBytesSec = remoteDurationSec > 0 && remoteOk ? (remoteBytes / remoteDurationSec) : 0;
  const remoteDownloadRowsSec = remoteDurationSec > 0 && remoteOk ? (remoteRows / remoteDurationSec) : 0;

  // 2. Local parse & filter stage on a controlled batch
  if (!fs.existsSync(localFilePath)) {
    return {
      id,
      name,
      remote_ok: remoteOk,
      remote_download_bytes_sec: parseFloat(remoteDownloadBytesSec.toFixed(2)),
      remote_download_rows_sec: parseFloat(remoteDownloadRowsSec.toFixed(2)),
      local_parse_rows_sec: 0,
      identity_filter_rows_sec: 0,
      end_to_end_remote_true_net_new_sec: 0
    };
  }

  const rawLines = [];
  const rl = readline.createInterface({ input: fs.createReadStream(localFilePath), crlfDelay: Infinity });
  let lCount = 0;
  for await (const l of rl) {
    lCount++;
    if (lCount === 1) continue;
    rawLines.push(l);
    if (rawLines.length >= 10000) break;
  }

  // Measure parse time
  const t0Parse = performance.now();
  const parsedPersons = [];
  for (const l of rawLines) {
    const parts = parseCsvLine(l, delimiter);
    const rawName = parseFn(parts);
    if (!rawName) continue;
    const cleaned = cleanPersonName(rawName);
    if (cleaned) parsedPersons.push(cleaned);
  }
  const parseDurationSec = (performance.now() - t0Parse) / 1000;
  const localParseRowsSec = parseDurationSec > 0 ? (rawLines.length / parseDurationSec) : 0;

  // Measure identity filter time against Authority V3
  const t0Filter = performance.now();
  let trueNetNew = 0;
  const seen = new Set();
  for (const p of parsedPersons) {
    const norm = normalizeName(p);
    if (!norm) continue;
    if (!authority.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      trueNetNew++;
    }
  }
  const filterDurationSec = (performance.now() - t0Filter) / 1000;
  const identityFilterRowsSec = filterDurationSec > 0 ? (parsedPersons.length / filterDurationSec) : 0;

  // 3. Compute End-to-End Remote Net New / Sec
  // Time per 10k rows = (10k / remoteDownloadRowsSec) + parseDurationSec + filterDurationSec
  const netNewYieldRatio = rawLines.length > 0 ? (trueNetNew / rawLines.length) : 0;
  let endToEndRemoteNetNewSec = 0;
  if (remoteDownloadRowsSec > 0) {
    const remoteTimeForBatch = rawLines.length / remoteDownloadRowsSec;
    const totalPipelineTime = remoteTimeForBatch + parseDurationSec + filterDurationSec;
    endToEndRemoteNetNewSec = trueNetNew / totalPipelineTime;
  }

  const result = {
    source_id: id,
    source_name: name,
    remote_download_bytes_sec: parseFloat(remoteDownloadBytesSec.toFixed(2)),
    remote_download_rows_sec: parseFloat(remoteDownloadRowsSec.toFixed(2)),
    local_parse_rows_sec: parseFloat(localParseRowsSec.toFixed(2)),
    identity_filter_rows_sec: parseFloat(identityFilterRowsSec.toFixed(2)),
    end_to_end_remote_true_net_new_sec: parseFloat(endToEndRemoteNetNewSec.toFixed(2)),
    local_processing_net_new_sec: parseFloat((trueNetNew / (parseDurationSec + filterDurationSec)).toFixed(2))
  };

  console.log(`  REMOTE_DOWNLOAD_BYTES_SEC:          ${result.remote_download_bytes_sec.toLocaleString()} B/s (${(result.remote_download_bytes_sec / (1024 * 1024)).toFixed(2)} MB/s)`);
  console.log(`  REMOTE_DOWNLOAD_ROWS_SEC:           ${result.remote_download_rows_sec.toLocaleString()} rows/s`);
  console.log(`  LOCAL_PARSE_ROWS_SEC:               ${result.local_parse_rows_sec.toLocaleString()} rows/s`);
  console.log(`  IDENTITY_FILTER_ROWS_SEC:           ${result.identity_filter_rows_sec.toLocaleString()} rows/s`);
  console.log(`  END_TO_END_REMOTE_TRUE_NET_NEW_SEC: ${result.end_to_end_remote_true_net_new_sec.toLocaleString()} net-new/s`);
  console.log(`  LOCAL_PROCESSING_NET_NEW_SEC:       ${result.local_processing_net_new_sec.toLocaleString()} net-new/s`);

  return result;
}

async function main() {
  console.log('Loading Authority V3...');
  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);

  const testList = [
    {
      id: 'RES_SIPRO_PROVEEDORES_ESTADO',
      name: 'SiPRO Proveedores del Estado (infra.datos.gob.ar)',
      remoteUrl: 'https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution/4.23/download/SiPRO.csv',
      rangeBytes: 500000,
      localFile: 'scratch/physical_sources/sipro_proveedores.csv',
      delim: ',',
      pFn: p => p[1]
    },
    {
      id: 'RES_COMPRAS_ADJUDICACIONES',
      name: 'Compras Adjudicaciones Contractuales (infra.datos.gob.ar)',
      remoteUrl: 'https://infra.datos.gob.ar/catalog/jgm/dataset/4/distribution/4.22/download/Adjudicaciones.csv',
      rangeBytes: 1000000,
      localFile: 'scratch/physical_sources/compras_adjudicaciones.csv',
      delim: ',',
      pFn: p => p[13]
    },
    {
      id: 'RES_GCBA_ADMINISTRADORES_CONSORCIO',
      name: 'GCBA Administradores Consorcio (cdn.buenosaires.gob.ar)',
      remoteUrl: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/registro-administradores-consorcio/registro-administradores-de-consorcio.csv',
      rangeBytes: 300000,
      localFile: 'scratch/physical_sources/gcba_administradores_consorcio.csv',
      delim: ';',
      pFn: p => p[1]
    },
    {
      id: 'RES_MININTERIOR_AUDIENCIAS',
      name: 'Audiencias Gestión de Intereses (datos.mininterior.gob.ar)',
      remoteUrl: 'http://datos.mininterior.gob.ar/dataset/f9fcd62a-3656-4bb9-ba83-7544b4b156b8/resource/8fa4823d-0f38-419d-9518-499792d826dd/download/2024.csv',
      rangeBytes: 500000,
      localFile: 'scratch/physical_sources/audiencias_2024.csv',
      delim: ';',
      pFn: p => p[17]
    },
    {
      id: 'SRC_PHYSICAL_IGJ_NAC',
      name: 'IGJ Sociedades y Directores (datos.jus.gob.ar)',
      remoteUrl: 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv',
      rangeBytes: 1000000,
      localFile: 'scratch/physical_sources/igj_autoridades_genero_202603.csv',
      delim: ',',
      pFn: p => p[1]
    }
  ];

  const results = [];
  for (const item of testList) {
    const r = await benchmarkSplit(authority, item.id, item.name, item.remoteUrl, item.rangeBytes, item.localFile, item.delim, item.pFn);
    results.push(r);
  }

  fs.writeFileSync('scratch/remote_vs_local_speed_split.json', JSON.stringify(results, null, 2), 'utf8');
}

main().catch(console.error);
