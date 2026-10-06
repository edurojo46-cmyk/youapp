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
    'UNKNOWN', 'ANONIMO', 'REDACCION', 'REGISTRO', 'EXPEDIENTE', 'COMISION', 'CONGRESO', 'SIN INFORMACION',
    'S.A.', 'S.R.L.', 'S.A.S.', 'S.C.', 'S.E.', 'SOCIEDAD ANONIMA', 'RESPONSABILIDAD LIMITADA'
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

async function testAllDisjoint() {
  console.log('Loading Authority V3...');
  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);

  // 1. Build Exact Pool Key Set from already enumerated exact files
  console.log('Building Exact Pool Hash Set from 16 previously enumerated files...');
  const exactPoolKeys = new Set();
  const exactFiles = [
    { file: 'scratch/physical_sources/registro_profesionales_sss.csv', delim: ',', pFn: p => p.length >= 2 ? `${p[1]} ${p[0]}` : null },
    { file: 'scratch/physical_sources/registro_profesionales_historico_sss.csv', delim: ',', pFn: p => p.length >= 2 ? `${p[1]} ${p[0]}` : null },
    { file: 'scratch/physical_sources/ddjj_actividades_anteriores_202606.csv', delim: ',', pFn: p => p[5] },
    { file: 'scratch/physical_sources/ddjj_actividades_posteriores_202606.csv', delim: ',', pFn: p => p[5] },
    { file: 'scratch/physical_sources/magistrados_designaciones_202609.csv', delim: ',', pFn: p => p[6] },
    { file: 'scratch/physical_sources/magistrados_jueces.csv', delim: ',', pFn: p => p[7] },
    { file: 'scratch/physical_sources/magistrados_renuncias.csv', delim: ',', pFn: p => p[6] },
    { file: 'scratch/physical_sources/magistrados_traslados.csv', delim: ',', pFn: p => p[0] },
    { file: 'scratch/physical_sources/ternas_magistrados_202605.csv', delim: ',', pFn: p => p[9] },
    { file: 'scratch/physical_sources/cv_magistrados_202605.csv', delim: ',', pFn: p => p[0] },
    { file: 'scratch/physical_sources/autoridades_tribunales_superiores.csv', delim: ',', pFn: p => `${p[5]} ${p[6]}` },
    { file: 'scratch/physical_sources/brgl_gobiernos_locales.csv', delim: ';', pFn: p => p[18] },
    { file: 'scratch/physical_sources/resolucion_318_auditorias.csv', delim: ',', pFn: p => `${p[2]} ${p[3]}` },
    { file: 'scratch/physical_sources/gcba_administradores_consorcio.csv', delim: ';', pFn: p => p[1] },
    { file: 'scratch/physical_sources/gcba_autoridades_2026.csv', delim: ',', pFn: p => p[7] }
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

  // Also include the unconsumed slice of IGJ
  const igjFile = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
  if (fs.existsSync(igjFile)) {
    const fileStream = fs.createReadStream(igjFile, { start: 179783996 });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
      if (parts.length < 2) continue;
      const name = parts[1];
      if (!name || name.startsWith('numero_correlativo')) continue;
      const cleaned = cleanPersonName(name);
      if (!cleaned) continue;
      const norm = normalizeName(cleaned);
      if (norm && !authority.has(norm)) {
        exactPoolKeys.add(norm);
      }
    }
  }

  console.log(`✓ Exact Pool Set populated: ${exactPoolKeys.size.toLocaleString()} unique keys.`);

  // 2. Enumerate Audiencias (MinInterior) against Authority AND against Exact Pool
  const audienciasFiles = [
    'scratch/physical_sources/audiencias_2024.csv',
    'scratch/physical_sources/audiencias_2023.csv',
    'scratch/physical_sources/audiencias_2022.csv'
  ];

  let audRaw = 0;
  let audPersons = 0;
  let audKnown = 0;
  let audIntra = 0;
  let audExactIntersect = 0;
  let audNetNew = 0;
  const audSeen = new Set();

  for (const af of audienciasFiles) {
    if (!fs.existsSync(af)) continue;
    const rl = readline.createInterface({ input: fs.createReadStream(af), crlfDelay: Infinity });
    let lCount = 0;
    for await (const line of rl) {
      lCount++;
      audRaw++;
      if (lCount === 1) continue;
      const parts = parseCsvLine(line, ';');
      // Extract sujeto_obligado (index 11) and solicitante (index 17)
      const names = [parts[11], parts[17]].filter(Boolean);
      for (const rawName of names) {
        const cleaned = cleanPersonName(rawName);
        if (!cleaned) continue;
        audPersons++;
        const norm = normalizeName(cleaned);
        if (!norm) continue;

        if (authority.has(norm)) {
          audKnown++;
          continue;
        }
        if (audSeen.has(norm)) {
          audIntra++;
          continue;
        }
        audSeen.add(norm);

        // Check intersection with Exact Pool!
        if (exactPoolKeys.has(norm)) {
          audExactIntersect++;
          continue;
        }

        audNetNew++;
      }
    }
  }

  console.log('\nAudiencias de Intereses (2022-2024):');
  console.log(`  Raw lines: ${audRaw.toLocaleString()}`);
  console.log(`  Extracted persons: ${audPersons.toLocaleString()}`);
  console.log(`  Known collisions (Authority V3): ${audKnown.toLocaleString()}`);
  console.log(`  Intra-source duplicates: ${audIntra.toLocaleString()}`);
  console.log(`  Exact Pool Intersections: ${audExactIntersect.toLocaleString()}`);
  console.log(`  PROVEN DISJOINT NET NEW: ${audNetNew.toLocaleString()}`);

  // 3. Enumerate SiPRO against Authority AND Exact Pool
  const siproPath = 'scratch/physical_sources/sipro_proveedores.csv';
  let siproRaw = 0;
  let siproFisica = 0;
  let siproPersons = 0;
  let siproKnown = 0;
  let siproIntra = 0;
  let siproExactIntersect = 0;
  let siproNetNew = 0;
  const siproSeen = new Set();

  const rlSipro = readline.createInterface({ input: fs.createReadStream(siproPath), crlfDelay: Infinity });
  for await (const line of rlSipro) {
    siproRaw++;
    if (siproRaw === 1) continue;
    if (!line.includes('Persona Fisica')) continue;
    siproFisica++;

    const parts = parseCsvLine(line, ',');
    const name = parts[1];
    const cleaned = cleanPersonName(name);
    if (!cleaned) continue;
    siproPersons++;
    const norm = normalizeName(cleaned);
    if (!norm) continue;

    if (authority.has(norm)) {
      siproKnown++;
      continue;
    }
    if (siproSeen.has(norm)) {
      siproIntra++;
      continue;
    }
    siproSeen.add(norm);

    if (exactPoolKeys.has(norm)) {
      siproExactIntersect++;
      continue;
    }

    siproNetNew++;
  }

  console.log('\nSiPRO Proveedores del Estado:');
  console.log(`  Raw lines: ${siproRaw.toLocaleString()}`);
  console.log(`  Persona Fisica: ${siproFisica.toLocaleString()}`);
  console.log(`  Known collisions (Authority V3): ${siproKnown.toLocaleString()}`);
  console.log(`  Intra-source duplicates: ${siproIntra.toLocaleString()}`);
  console.log(`  Exact Pool Intersections: ${siproExactIntersect.toLocaleString()}`);
  console.log(`  PROVEN DISJOINT NET NEW: ${siproNetNew.toLocaleString()}`);

  // 4. Enumerate Compras Adjudicaciones against Authority AND Exact Pool
  const adjPath = 'scratch/physical_sources/compras_adjudicaciones.csv';
  let adjRaw = 0;
  let adjPersons = 0;
  let adjKnown = 0;
  let adjIntra = 0;
  let adjExactIntersect = 0;
  let adjNetNew = 0;
  const adjSeen = new Set();

  const rlAdj = readline.createInterface({ input: fs.createReadStream(adjPath), crlfDelay: Infinity });
  for await (const line of rlAdj) {
    adjRaw++;
    if (adjRaw === 1) continue;
    const parts = parseCsvLine(line, ',');
    const name = parts[13]; // Descripcion_Proveedor
    const cuit = parts[12];
    if (!name || (!cuit.startsWith('20-') && !cuit.startsWith('27-') && !cuit.startsWith('23-') && !cuit.startsWith('24-'))) continue; // only physical persons (CUIT 20/27/23/24)

    const cleaned = cleanPersonName(name);
    if (!cleaned) continue;
    adjPersons++;
    const norm = normalizeName(cleaned);
    if (!norm) continue;

    if (authority.has(norm)) {
      adjKnown++;
      continue;
    }
    if (adjSeen.has(norm)) {
      adjIntra++;
      continue;
    }
    adjSeen.add(norm);

    if (exactPoolKeys.has(norm)) {
      adjExactIntersect++;
      continue;
    }

    adjNetNew++;
  }

  console.log('\nCompras Adjudicaciones Contractuales:');
  console.log(`  Raw lines: ${adjRaw.toLocaleString()}`);
  console.log(`  Sole-proprietor contractors: ${adjPersons.toLocaleString()}`);
  console.log(`  Known collisions (Authority V3): ${adjKnown.toLocaleString()}`);
  console.log(`  Intra-source duplicates: ${adjIntra.toLocaleString()}`);
  console.log(`  Exact Pool Intersections: ${adjExactIntersect.toLocaleString()}`);
  console.log(`  PROVEN DISJOINT NET NEW: ${adjNetNew.toLocaleString()}`);

  fs.writeFileSync('scratch/exact_vs_empirical_crosspool_audit.json', JSON.stringify({
    EXACT_POOL_PERSON_KEYS: exactPoolKeys.size,
    AUDIENCIAS: {
      RAW: audRaw,
      VALID_PERSONS: audPersons,
      KNOWN_COLLISIONS: audKnown,
      INTRA_DUPLICATES: audIntra,
      EXACT_POOL_INTERSECT: audExactIntersect,
      NET_NEW_DISJOINT: audNetNew,
      EXACT_INTERSECT_RATE_PCT: audPersons > 0 ? parseFloat(((audExactIntersect / audPersons) * 100).toFixed(2)) : 0
    },
    SIPRO: {
      RAW: siproRaw,
      VALID_PERSONS: siproPersons,
      KNOWN_COLLISIONS: siproKnown,
      INTRA_DUPLICATES: siproIntra,
      EXACT_POOL_INTERSECT: siproExactIntersect,
      NET_NEW_DISJOINT: siproNetNew,
      EXACT_INTERSECT_RATE_PCT: siproPersons > 0 ? parseFloat(((siproExactIntersect / siproPersons) * 100).toFixed(2)) : 0
    },
    ADJUDICACIONES: {
      RAW: adjRaw,
      VALID_PERSONS: adjPersons,
      KNOWN_COLLISIONS: adjKnown,
      INTRA_DUPLICATES: adjIntra,
      EXACT_POOL_INTERSECT: adjExactIntersect,
      NET_NEW_DISJOINT: adjNetNew,
      EXACT_INTERSECT_RATE_PCT: adjPersons > 0 ? parseFloat(((adjExactIntersect / adjPersons) * 100).toFixed(2)) : 0
    }
  }, null, 2), 'utf8');
}

testAllDisjoint().catch(console.error);
