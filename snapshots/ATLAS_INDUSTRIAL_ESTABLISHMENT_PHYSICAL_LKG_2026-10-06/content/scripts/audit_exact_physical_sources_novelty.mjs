/**
 * scripts/audit_exact_physical_sources_novelty.mjs
 * 
 * Tests every unconsumed physical source file in scratch/physical_sources/
 * against scratch/global_identity_authority_v4_plus_delta.bin
 * to determine exact unconsumed novel human count!
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
const authority = GlobalIdentityAuthorityV4.loadFromFile(authPath);
console.log(`✓ Authority loaded: ${authority.count.toLocaleString()} keys.`);

function cleanPersonName(name) {
  if (!name) return null;
  let n = name.trim();
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
    'UNKNOWN', 'ANONIMO', 'REDACCION', 'REGISTRO', 'EXPEDIENTE', 'COMISION', 'CONGRESO', 'SIN INFORMACION',
    'S.A.', ' S.A', ' S.R.L', ' SRL', ' S.A.S', ' LTDA', ' SOCIEDAD', 'BANCO'
  ];
  for (const tok of rejectTokens) {
    if (upper.includes(tok)) return null;
  }
  return n;
}

async function auditFile(filePath, nameCol, delimiter = ',') {
  if (!fs.existsSync(filePath)) return null;
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let rawRows = 0;
  let personRows = 0;
  let knownCount = 0;
  let netNewCount = 0;
  const seenInFile = new Set();

  for await (const line of rl) {
    rawRows++;
    if (rawRows === 1) continue; // skip header
    const parts = line.split(delimiter).map(s => s.replace(/^"|"$/g, '').trim());
    const rawName = parts[nameCol];
    if (!rawName) continue;

    const cleaned = cleanPersonName(rawName);
    if (!cleaned) continue;

    const norm = normalizeName(cleaned);
    if (!norm) continue;

    personRows++;
    if (seenInFile.has(norm)) continue;
    seenInFile.add(norm);

    if (authority.has(norm)) {
      knownCount++;
    } else {
      netNewCount++;
    }
  }

  return {
    filePath: path.basename(filePath),
    rawRows,
    personRows,
    uniquePersons: seenInFile.size,
    knownCount,
    netNewCount,
    noveltyYieldPct: seenInFile.size > 0 ? parseFloat(((netNewCount / seenInFile.size) * 100).toFixed(2)) : 0
  };
}

async function run() {
  console.log('Auditing physical sources against Global Authority V4 + Delta...');

  const sources = [
    { file: 'scratch/physical_sources/proveedores_sistema_legacy.csv', col: 1, delim: ',' },
    { file: 'scratch/physical_sources/derecho_autor_2025.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/compras_adjudicaciones.csv', col: 1, delim: ',' },
    { file: 'scratch/physical_sources/ddjj_actividades_anteriores_202606.csv', col: 3, delim: ',' },
    { file: 'scratch/physical_sources/ddjj_actividades_posteriores_202606.csv', col: 3, delim: ',' },
    { file: 'scratch/physical_sources/audiencias_2024.csv', col: 4, delim: ';' },
    { file: 'scratch/physical_sources/audiencias_2023.csv', col: 4, delim: ';' },
    { file: 'scratch/physical_sources/audiencias_2022.csv', col: 4, delim: ';' },
    { file: 'scratch/physical_sources/ternas_magistrados_202605.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/cv_magistrados_202605.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/magistrados_jueces.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/magistrados_renuncias.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/autoridades_tribunales_superiores.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/resolucion_318_auditorias.csv', col: 2, delim: ',' },
    { file: 'scratch/physical_sources/gcba_autoridades_2026.csv', col: 1, delim: ';' },
    { file: 'scratch/physical_sources/gcba_autoridades_2025.csv', col: 1, delim: ';' },
    { file: 'scratch/physical_sources/gcba_autoridades_2024.csv', col: 1, delim: ';' }
  ];

  const results = [];
  let totalPhysicalNetNew = 0;

  for (const s of sources) {
    const res = await auditFile(s.file, s.col, s.delim);
    if (res) {
      results.push(res);
      totalPhysicalNetNew += res.netNewCount;
      console.log(`✓ [${res.filePath}] Unique: ${res.uniquePersons.toLocaleString()} | Net-New: ${res.netNewCount.toLocaleString()} (${res.noveltyYieldPct}%)`);
    }
  }

  console.log(`\nTOTAL PHYSICAL UNCONSUMED NET-NEW FROM AUDITED FILES: ${totalPhysicalNetNew.toLocaleString()}`);

  fs.writeFileSync('scratch/exact_physical_sources_audit_v6.json', JSON.stringify({
    TIMESTAMP: new Date().toISOString(),
    TOTAL_PHYSICAL_NET_NEW: totalPhysicalNetNew,
    RESULTS: results
  }, null, 2), 'utf8');
}

run().catch(console.error);
