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

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('EXACT PHYSICAL ENUMERATION & CROSS-SOURCE DEDUPLICATION');
  console.log('════════════════════════════════════════════════════════════════');

  const authPath = path.resolve('scratch/global_identity_authority_v2.bin');
  const authority = GlobalIdentityAuthorityV2.loadFromFile(authPath);
  console.log(`Authority loaded: ${authority.count.toLocaleString()} immutable keys.`);

  const resources = [
    {
      id: 'RES_SSS_PRESTADORES_SALUD',
      name: 'Registro Nacional de Prestadores de Salud (SSS Nuevo Sistema)',
      files: ['scratch/physical_sources/registro_profesionales_sss.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 5) return null;
        return `${parts[1]} ${parts[0]}`; // nombre apellido
      }
    },
    {
      id: 'RES_SSS_PRESTADORES_HISTORICO',
      name: 'Registro Nacional de Prestadores de Salud (SSS Sistema Histórico)',
      files: ['scratch/physical_sources/registro_profesionales_historico_sss.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 2) return null;
        return `${parts[1]} ${parts[0]}`; // nombre apellido
      }
    },
    {
      id: 'RES_DDJJ_ANTERIORES_FUNCION_PUB',
      name: 'DDJJ Actividades Anteriores a la Función Pública',
      files: ['scratch/physical_sources/ddjj_actividades_anteriores_202606.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 6) return null;
        return parts[5]; // apellidos_nombres
      }
    },
    {
      id: 'RES_DDJJ_POSTERIORES_FUNCION_PUB',
      name: 'DDJJ Actividades Posteriores a la Función Pública',
      files: ['scratch/physical_sources/ddjj_actividades_posteriores_202606.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 6) return null;
        return parts[5];
      }
    },
    {
      id: 'RES_MAGISTRADOS_DESIGNACIONES',
      name: 'Designaciones de Magistrados Justicia Fed/Nac',
      files: ['scratch/physical_sources/magistrados_designaciones_202609.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 7) return null;
        return parts[6]; // magistrado_nombre
      }
    },
    {
      id: 'RES_MAGISTRADOS_JUECES',
      name: 'Jueces de la Justicia Federal y Nacional',
      files: ['scratch/physical_sources/magistrados_jueces.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 8) return null;
        return parts[7]; // magistrado_nombre
      }
    },
    {
      id: 'RES_MAGISTRADOS_RENUNCIAS',
      name: 'Renuncias de Magistrados Fed/Nac',
      files: ['scratch/physical_sources/magistrados_renuncias.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 7) return null;
        return parts[6];
      }
    },
    {
      id: 'RES_MAGISTRADOS_TRASLADOS',
      name: 'Traslados de Jueces Fed/Nac',
      files: ['scratch/physical_sources/magistrados_traslados.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 1) return null;
        return parts[0];
      }
    },
    {
      id: 'RES_MAGISTRADOS_TERNAS',
      name: 'Ternas para Selección de Magistrados (Consejo Magistratura)',
      files: ['scratch/physical_sources/ternas_magistrados_202605.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 10) return null;
        return parts[9]; // nombre_postulante
      }
    },
    {
      id: 'RES_MAGISTRADOS_CV',
      name: 'Curriculums Vitae de Magistrados Postulantes',
      files: ['scratch/physical_sources/cv_magistrados_202605.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 1) return null;
        return parts[0]; // nombre_magistrado
      }
    },
    {
      id: 'RES_AUTORIDADES_CORTES_TRIBUNALES',
      name: 'Autoridades Tribunales Superiores y Cortes Supremas Provincias',
      files: ['scratch/physical_sources/autoridades_tribunales_superiores.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 7) return null;
        return `${parts[5]} ${parts[6]}`; // autoridad_nombre autoridad_apellido
      }
    },
    {
      id: 'RES_REFGLO_GOBIERNOS_LOCALES',
      name: 'Registro Federal de Gobiernos Locales (ReFeGLo)',
      files: ['scratch/physical_sources/brgl_gobiernos_locales.csv'],
      delimiter: ';',
      parseFn: (parts) => {
        if (parts.length < 19) return null;
        return parts[18]; // apellido_y_nombre_de_la_maxima_autoridad
      }
    },
    {
      id: 'RES_PADRON_AUDITORIAS_ENERGIA',
      name: 'Resolución 318 - Control de Auditorías',
      files: ['scratch/physical_sources/resolucion_318_auditorias.csv'],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 4) return null;
        return `${parts[2]} ${parts[3]}`; // nombre apellido
      }
    },
    {
      id: 'RES_GCBA_ADMINISTRADORES_CONSORCIO',
      name: 'GCBA Registro Público de Administradores de Consorcios',
      files: ['scratch/physical_sources/gcba_administradores_consorcio.csv'],
      delimiter: ';',
      parseFn: (parts) => {
        if (parts.length < 2) return null;
        return parts[1]; // Nombre Administrador
      }
    },
    {
      id: 'RES_GCBA_AUTORIDADES_SUPERIORES',
      name: 'GCBA Autoridades Superiores y Funcionarios (2024-2026)',
      files: [
        'scratch/physical_sources/gcba_autoridades_2026.csv',
        'scratch/physical_sources/gcba_autoridades_2025.csv',
        'scratch/physical_sources/gcba_autoridades_2024.csv'
      ],
      delimiter: ',',
      parseFn: (parts) => {
        if (parts.length < 8) return null;
        return parts[7]; // ayn
      }
    }
  ];

  // Cross-resource tracking set
  const crossResourceSeen = new Set();
  const summary = [];

  for (const r of resources) {
    let rawRows = 0;
    let personRows = 0;
    let knownRejected = 0;
    let intraSourceDuplicates = 0;
    let crossSourceDuplicates = 0;
    let exactNetNew = 0;

    const inSourceSeen = new Set();

    for (const filePath of r.files) {
      if (!fs.existsSync(filePath)) {
        console.log(`[SKIP] Missing file: ${filePath}`);
        continue;
      }

      const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
      let fileRaw = 0;

      for await (const line of rl) {
        fileRaw++;
        rawRows++;
        if (fileRaw === 1) continue; // header
        if (!line.trim()) continue;

        const parts = parseCsvLine(line, r.delimiter);
        const rawName = r.parseFn(parts);
        if (!rawName) continue;

        const cleaned = cleanPersonName(rawName);
        if (!cleaned) continue;

        personRows++;
        const norm = normalizeName(cleaned);
        if (!norm) continue;

        // 1. Check against Authority V3 (Set A + Set B)
        if (authority.has(norm)) {
          knownRejected++;
          continue;
        }

        // 2. Check Intra-source duplication
        if (inSourceSeen.has(norm)) {
          intraSourceDuplicates++;
          continue;
        }
        inSourceSeen.add(norm);

        // 3. Check Cross-source duplication against prior resources in this pass
        if (crossResourceSeen.has(norm)) {
          crossSourceDuplicates++;
          continue;
        }
        crossResourceSeen.add(norm);

        exactNetNew++;
      }
    }

    const resObj = {
      RESOURCE_ID: r.id,
      RESOURCE_NAME: r.name,
      RAW_ROWS: rawRows,
      PERSON_ROWS: personRows,
      KNOWN_REJECTED: knownRejected,
      INTRA_SOURCE_DUPLICATES: intraSourceDuplicates,
      CROSS_SOURCE_DUPLICATES: crossSourceDuplicates,
      EXACT_NET_NEW: exactNetNew,
      NET_NEW_YIELD_PCT: personRows > 0 ? parseFloat(((exactNetNew / personRows) * 100).toFixed(2)) : 0
    };

    summary.push(resObj);
    console.log(`\n✓ [${r.id}] ${r.name}`);
    console.log(`  Raw: ${resObj.RAW_ROWS.toLocaleString()} | Persons: ${resObj.PERSON_ROWS.toLocaleString()} | Known Collisions: ${resObj.KNOWN_REJECTED.toLocaleString()} | Intra-Dups: ${resObj.INTRA_SOURCE_DUPLICATES.toLocaleString()} | Cross-Dups: ${resObj.CROSS_SOURCE_DUPLICATES.toLocaleString()} | EXACT NET-NEW: ${resObj.EXACT_NET_NEW.toLocaleString()} (${resObj.NET_NEW_YIELD_PCT}%)`);
  }

  // Also include the remaining unexhausted IGJ slice (lines 1,600,000 to 1,853,472)
  console.log('\nEnumerating unconsumed slice of SRC_PHYSICAL_IGJ_NAC...');
  const igjFile = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
  let igjRaw = 0;
  let igjPersons = 0;
  let igjKnown = 0;
  let igjIntra = 0;
  let igjCross = 0;
  let igjNetNew = 0;

  if (fs.existsSync(igjFile)) {
    const fileStream = fs.createReadStream(igjFile, { start: 179783996 });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    const inIgjSeen = new Set();

    for await (const line of rl) {
      igjRaw++;
      const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
      if (parts.length < 6) continue;
      const [correlativo, nombre] = parts;
      if (!nombre || nombre.startsWith('numero_correlativo')) continue;

      const cleaned = cleanPersonName(nombre);
      if (!cleaned) continue;

      igjPersons++;
      const norm = normalizeName(cleaned);
      if (!norm) continue;

      if (authority.has(norm)) {
        igjKnown++;
        continue;
      }
      if (inIgjSeen.has(norm)) {
        igjIntra++;
        continue;
      }
      inIgjSeen.add(norm);

      if (crossResourceSeen.has(norm)) {
        igjCross++;
        continue;
      }
      crossResourceSeen.add(norm);

      igjNetNew++;
    }

    const igjObj = {
      RESOURCE_ID: 'SRC_PHYSICAL_IGJ_NAC_UNCONSUMED_SLICE',
      RESOURCE_NAME: 'IGJ Sociedades y Directores (Unconsumed Slice Lines 1.6M-1.85M)',
      RAW_ROWS: igjRaw,
      PERSON_ROWS: igjPersons,
      KNOWN_REJECTED: igjKnown,
      INTRA_SOURCE_DUPLICATES: igjIntra,
      CROSS_SOURCE_DUPLICATES: igjCross,
      EXACT_NET_NEW: igjNetNew,
      NET_NEW_YIELD_PCT: igjPersons > 0 ? parseFloat(((igjNetNew / igjPersons) * 100).toFixed(2)) : 0
    };
    summary.push(igjObj);
    console.log(`✓ [${igjObj.RESOURCE_ID}]`);
    console.log(`  Raw: ${igjObj.RAW_ROWS.toLocaleString()} | Persons: ${igjObj.PERSON_ROWS.toLocaleString()} | Known Collisions: ${igjObj.KNOWN_REJECTED.toLocaleString()} | Intra-Dups: ${igjObj.INTRA_SOURCE_DUPLICATES.toLocaleString()} | Cross-Dups: ${igjObj.CROSS_SOURCE_DUPLICATES.toLocaleString()} | EXACT NET-NEW: ${igjObj.EXACT_NET_NEW.toLocaleString()} (${igjObj.NET_NEW_YIELD_PCT}%)`);
  }

  const totalExactNetNew = summary.reduce((sum, s) => sum + s.EXACT_NET_NEW, 0);
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`TOTAL EXACT ENUMERATED DEDUPLICATED NET-NEW: ${totalExactNetNew.toLocaleString()}`);
  console.log(`════════════════════════════════════════════════════════════════`);

  fs.writeFileSync('scratch/exact_bulk_resources_census.json', JSON.stringify({
    TOTAL_EXACT_NET_NEW: totalExactNetNew,
    RESOURCES: summary
  }, null, 2), 'utf8');
}

main().catch(console.error);
