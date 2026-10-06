import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { GlobalIdentityAuthorityV2, normalizeName } from '../scratch/build_global_identity_authority_v2.mjs';

function cleanPersonName(name) {
  if (!name) return null;
  let n = name.replace(/^"|"$/g, '').trim();
  n = n.replace(/[\(\)\[\]\{\}\<\>\"\'\*\_\#\@\$\%\^\&\=\+\~\`\|\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter(w => w.length > 1);
  if (words.length < 2 || words.length > 5) return null;
  return n;
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result.map(s => s.replace(/^"|"$/g, '').trim());
}

async function enumerateSSS() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('EXACT PHYSICAL ENUMERATION: SSS HEALTH PROFESSIONALS REGISTRY');
  console.log('════════════════════════════════════════════════════════════════');

  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);
  console.log(`Authority loaded: ${authority.count.toLocaleString()} keys.`);

  const sssFile = path.resolve('scratch/physical_sources/registro_profesionales_sss.csv');
  const rl = readline.createInterface({ input: fs.createReadStream(sssFile), crlfDelay: Infinity });

  let rawRows = 0;
  let validPersonRows = 0;
  let knownCollisions = 0;
  let duplicates = 0;
  let exactNetNew = 0;

  const inResourceSeen = new Set();

  for await (const line of rl) {
    rawRows++;
    if (rawRows === 1) continue; // header
    if (!line.trim()) continue;

    const parts = parseCsvLine(line);
    if (parts.length < 5) continue;

    const [apellido, nombre, nrodoc, m_codigo, profesion] = parts;
    const fullName = cleanPersonName(`${nombre} ${apellido}`);
    if (!fullName) continue;

    validPersonRows++;

    const norm = normalizeName(fullName);
    if (!norm) continue;

    // Check against Authority V3 (29.5M keys)
    if (authority.has(norm)) {
      knownCollisions++;
      continue;
    }

    // Intra-resource deduplication
    if (inResourceSeen.has(norm)) {
      duplicates++;
      continue;
    }

    inResourceSeen.add(norm);
    exactNetNew++;
  }

  const result = {
    RESOURCE_ID: 'RES_SSS_PRESTADORES_SALUD',
    DATASET_TITLE: 'Registro Nacional de Prestadores Profesionales Inscriptos en la SSS',
    RAW_ROWS: rawRows - 1,
    VALID_PERSON_ROWS: validPersonRows,
    KNOWN_COLLISIONS: knownCollisions,
    DUPLICATES: duplicates,
    EXACT_NET_NEW: exactNetNew,
    NET_NEW_RATIO: parseFloat((exactNetNew / validPersonRows).toFixed(4))
  };

  console.log('RAW_ROWS:           ', result.RAW_ROWS.toLocaleString());
  console.log('VALID_PERSON_ROWS:  ', result.VALID_PERSON_ROWS.toLocaleString());
  console.log('KNOWN_COLLISIONS:   ', result.KNOWN_COLLISIONS.toLocaleString());
  console.log('DUPLICATES:         ', result.DUPLICATES.toLocaleString());
  console.log('EXACT_NET_NEW:      ', result.EXACT_NET_NEW.toLocaleString());
  console.log('NET_NEW_RATIO:      ', (result.NET_NEW_RATIO * 100).toFixed(2) + '%');

  fs.writeFileSync('scratch/sss_enumeration_result.json', JSON.stringify(result, null, 2), 'utf8');
}

enumerateSSS().catch(console.error);
