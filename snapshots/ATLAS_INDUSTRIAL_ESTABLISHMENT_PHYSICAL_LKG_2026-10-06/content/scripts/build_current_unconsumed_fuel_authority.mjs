import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { GlobalIdentityAuthorityV4, normalizeName, hash64 } from './build_global_identity_authority_v4.mjs';
import { cleanCuit, cleanDni, cleanPersonName, parseCsvLine } from './replay_fuel_bank_v4.mjs';
import { UnconsumedFuelAuthority } from '../scratch/unconsumed_fuel_authority.mjs';

// CUIT Checksum Verification (modulo 11)
export function isValidCuitChecksum(cuitStr) {
  if (!cuitStr) return false;
  const clean = cuitStr.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }
  const mod = sum % 11;
  const expectedCheckDigit = mod === 0 ? 0 : (mod === 1 ? 9 : 11 - mod);
  return parseInt(clean[10], 10) === expectedCheckDigit;
}

export function isPhysicalPersonCuit(cuitStr) {
  if (!cuitStr) return false;
  const clean = cuitStr.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  const prefix = clean.substring(0, 2);
  // Physical person prefixes in Argentina: 20 (male), 27 (female), 23/24 (shared/special)
  return ['20', '23', '24', '27'].includes(prefix);
}

export function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

export function redactIdentifier(id) {
  if (!id) return '';
  const s = String(id).trim();
  if (s.length <= 4) return '***';
  return s.substring(0, 2) + '*'.repeat(s.length - 4) + s.substring(s.length - 2);
}

async function run() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BUILD CURRENT UNCONSUMED FUEL AUTHORITY & GLOBAL DEDUPLICATION');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. Initialize Fuel Authority
  const fuelAuthority = new UnconsumedFuelAuthority(8000000);

  // 2. Exact physical resources from scratch/physical_sources
  const exactResources = [
    {
      id: 'RES_SSS_PRESTADORES_SALUD',
      files: ['scratch/physical_sources/registro_profesionales_sss.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_SALUD',
      parse: (parts) => {
        if (parts.length < 2) return null;
        const name = cleanPersonName(`${parts[1]} ${parts[0]}`);
        const dni = cleanDni(parts[2]);
        return { name, dni, cuit: null };
      }
    },
    {
      id: 'RES_SSS_PRESTADORES_HISTORICO',
      files: ['scratch/physical_sources/registro_profesionales_historico_sss.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_SALUD',
      parse: (parts) => {
        if (parts.length < 2) return null;
        const name = cleanPersonName(`${parts[1]} ${parts[0]}`);
        const dni = cleanDni(parts[2]);
        return { name, dni, cuit: null };
      }
    },
    {
      id: 'RES_SIPRO_PROVEEDORES_ESTADO',
      files: ['scratch/physical_sources/sipro_proveedores.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_PROVEEDORES',
      parse: (parts) => {
        if (parts.length < 3) return null;
        const cuit = cleanCuit(parts[0]);
        if (!cuit && !parts[2]?.includes('Persona Fisica')) return null;
        const name = cleanPersonName(parts[1]);
        const dni = cuit ? cuit.slice(2, 10) : null;
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_COMPRAS_ADJUDICACIONES',
      files: ['scratch/physical_sources/compras_adjudicaciones.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_COMPRAS',
      parse: (parts) => {
        if (parts.length < 14) return null;
        const cuit = cleanCuit(parts[12]);
        if (!cuit) return null;
        const name = cleanPersonName(parts[13]);
        const dni = cuit.slice(2, 10);
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_SIPRO_PROVEEDORES_LEGACY',
      files: [
        'scratch/physical_sources/proveedores_sistema_legacy.csv',
        'scratch/physical_sources/proveedores_modernizacion.csv'
      ],
      delimiter: ',',
      jurisdiction: 'NACIONAL_PROVEEDORES',
      parse: (parts) => {
        if (parts.length < 2) return null;
        const cuit = cleanCuit(parts[0]);
        const name = cleanPersonName(parts[1]);
        const dni = cuit ? cuit.slice(2, 10) : null;
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_SSN_PRODUCTORES_ASESORES_SEGUROS',
      files: ['scratch/physical_sources/productores_asesores_ssn.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_SEGUROS',
      parse: (parts) => {
        if (parts.length < 4) return null;
        const cuit = cleanCuit(parts[2]);
        if (!cuit) return null;
        const name = cleanPersonName(parts[3]);
        const dni = cuit.slice(2, 10);
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_DDJJ_PATRIMONIALES_INTEGRALES',
      files: ['scratch/physical_sources/ddjj_patrimoniales_2024.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_DDJJ',
      parse: (parts) => {
        if (parts.length < 7) return null;
        const cuit = cleanCuit(parts[1]);
        if (!cuit) return null;
        const name = cleanPersonName(parts[6]);
        const dni = cuit.slice(2, 10);
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_DDJJ_ANTERIORES_FUNCION_PUB',
      files: ['scratch/physical_sources/ddjj_actividades_anteriores_202606.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_DDJJ',
      parse: (parts) => {
        if (parts.length < 6) return null;
        const name = cleanPersonName(parts[5]);
        const cuit = cleanCuit(parts[6]);
        const dni = cuit ? cuit.slice(2, 10) : null;
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_DDJJ_POSTERIORES_FUNCION_PUB',
      files: ['scratch/physical_sources/ddjj_actividades_posteriores_202606.csv'],
      delimiter: ',',
      jurisdiction: 'NACIONAL_DDJJ',
      parse: (parts) => {
        if (parts.length < 6) return null;
        const name = cleanPersonName(parts[5]);
        const cuit = cleanCuit(parts[6]);
        const dni = cuit ? cuit.slice(2, 10) : null;
        return { name, dni, cuit };
      }
    },
    {
      id: 'RES_GCBA_ADMINISTRADORES_CONSORCIO',
      files: ['scratch/physical_sources/gcba_administradores_consorcio.csv'],
      delimiter: ';',
      jurisdiction: 'CABA',
      parse: (parts) => {
        if (parts.length < 2) return null;
        const name = cleanPersonName(parts[1]);
        return { name, dni: null, cuit: null };
      }
    },
    {
      id: 'RES_GCBA_AUTORIDADES_SUPERIORES',
      files: [
        'scratch/physical_sources/gcba_autoridades_2026.csv',
        'scratch/physical_sources/gcba_autoridades_2025.csv',
        'scratch/physical_sources/gcba_autoridades_2024.csv'
      ],
      delimiter: ',',
      jurisdiction: 'CABA',
      parse: (parts) => {
        if (parts.length < 8) return null;
        const name = cleanPersonName(parts[7]);
        return { name, dni: null, cuit: null };
      }
    },
    {
      id: 'RES_MENDOZA_COMERCIOS',
      files: ['scratch/mendoza_comercios.csv'],
      delimiter: ',',
      jurisdiction: 'MENDOZA',
      parse: (parts) => {
        if (parts.length < 5) return null;
        const cuit = cleanCuit(parts[1]);
        const name = cleanPersonName(parts[3] || parts[4]);
        const dni = cuit ? cuit.slice(2, 10) : null;
        return { name, dni, cuit };
      }
    }
  ];

  console.log('[1/4] Ingesting exact physical fuel records into Unconsumed Fuel Authority...');
  let totalIndexedRecords = 0;

  for (const res of exactResources) {
    for (const filePath of res.files) {
      if (!fs.existsSync(filePath)) {
        console.log(`  File missing: ${filePath}`);
        continue;
      }
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      let lineIndex = 0;
      for await (const line of rl) {
        lineIndex++;
        if (lineIndex === 1) continue; // Skip header
        if (!line.trim()) continue;

        const parts = parseCsvLine(line, res.delimiter);
        const parsed = res.parse(parts);
        if (!parsed) continue;

        totalIndexedRecords++;

        // Add CUIT key
        if (parsed.cuit) {
          fuelAuthority.addKey(`CUIT:${parsed.cuit}`);
        }
        // Add DNI key
        if (parsed.dni) {
          fuelAuthority.addKey(`DNI:${parsed.dni}`);
        }
        // Add Canonical source ID key
        fuelAuthority.addKey(`SRC:${res.id}:${lineIndex}`);

        // Add Normalized Name + Jurisdiction key (Do NOT collapse homonyms by name only)
        if (parsed.name) {
          const norm = normalizeName(parsed.name);
          if (norm.length > 5) {
            fuelAuthority.addKey(`NAME_JUR:${norm}:${res.jurisdiction}`);
          }
        }
      }
      console.log(`  ✓ Processed ${filePath} (Source: ${res.id})`);
    }
  }

  // Also index holdout academic/gazette representations
  console.log('[2/4] Indexing Holdout and Empirical Partitions canonical identity keys...');
  const academicHoldouts = [
    { id: 'SRC_OAI_CONICET_REMAINING', count: 45898, jur: 'ACADEMIC_CONICET' },
    { id: 'SRC_OAI_UNC_REMAINING', count: 39157, jur: 'ACADEMIC_UNC' },
    { id: 'SRC_OAI_UNS_REMAINING', count: 14780, jur: 'ACADEMIC_UNS' },
    { id: 'SRC_OAI_INTA_REMAINING', count: 29838, jur: 'ACADEMIC_INTA' },
    { id: 'SRC_OAI_SEDICI_REMAINING', count: 107865, jur: 'ACADEMIC_SEDICI' },
    { id: 'HOLDOUT_SRC_BOLETIN_OFICIAL_NAC', count: 212500, jur: 'BORA_2DA' },
    { id: 'HOLDOUT_SRC_DATOS_GOB_AR_RESIDUAL', count: 58448, jur: 'DATOS_GOB' },
    { id: 'HOLDOUT_SRC_OAI_UNL_LITORAL', count: 26000, jur: 'ACADEMIC_UNL' },
    { id: 'HOLDOUT_SRC_OAI_UNMDP_NULAN', count: 16044, jur: 'ACADEMIC_UNMDP' },
    { id: 'HOLDOUT_SRC_OAI_UNGS_SARMIENTO', count: 8402, jur: 'ACADEMIC_UNGS' },
    { id: 'HOLDOUT_SRC_OAI_UNQ_QUILMES', count: 9010, jur: 'ACADEMIC_UNQ' },
    { id: 'HOLDOUT_SRC_OAI_UNRN_RIO_NEGRO', count: 6248, jur: 'ACADEMIC_UNRN' },
    { id: 'HOLDOUT_SRC_OAI_UNNOBA', count: 4083, jur: 'ACADEMIC_UNNOBA' },
    { id: 'HOLDOUT_SRC_OAI_SEGEMAR', count: 4139, jur: 'ACADEMIC_SEGEMAR' },
    { id: 'HOLDOUT_SRC_CNEA', count: 8191, jur: 'ACADEMIC_CNEA' }
  ];

  for (const h of academicHoldouts) {
    for (let i = 1; i <= Math.min(h.count, 20000); i++) {
      fuelAuthority.addKey(`SRC:${h.id}:${i}`);
    }
  }

  // Build the unconsumed fuel authority index
  fuelAuthority.build();
  const fuelAuthPath = path.resolve('scratch/current_unconsumed_fuel_authority.bin');
  fuelAuthority.saveToFile(fuelAuthPath);

  // 3. Load Authority V4 + Delta
  console.log('\n[3/4] Loading Authority V4 + Delta for Global Deduplication...');
  const authPath = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
  const authorityV4 = GlobalIdentityAuthorityV4.loadFromFile(authPath);
  console.log(`✓ Authority V4+Delta loaded: ${authorityV4.count.toLocaleString()} keys.`);

  // 4. Recheck the 3,081 Provisional V15 Humans (Bahía Blanca)
  console.log('\n[4/4] RECHECKING THE 3,081 PROVISIONAL V15 HUMANS...');

  // Download / Load Bahía Blanca data directly
  console.log('  Fetching Bahía Blanca Proveedores (WS 2318)...');
  const provRes = await fetch('https://gobiernoabierto.bahia.gob.ar/WS/2318');
  const provText = await provRes.text();
  const provLines = provText.split('\n').filter(l => l.trim().length > 0);

  const physicalSuppliers = new Map();
  for (let i = 1; i < provLines.length; i++) {
    const line = provLines[i];
    const parts = line.split(';').map(p => p.replace(/"/g, '').trim());
    if (parts.length >= 3) {
      const razon = parts[1];
      const rawCuit = parts[2].replace(/-/g, '').trim();
      if (isPhysicalPersonCuit(rawCuit) && isValidCuitChecksum(rawCuit)) {
        if (razon.length > 5 && !razon.includes('S.A.') && !razon.includes('SRL') && !razon.includes('SH') && isNaN(Number(razon))) {
          physicalSuppliers.set(rawCuit, { razon, cuit: rawCuit });
        }
      }
    }
  }

  console.log('  Fetching Bahía Blanca DDJJ (WS 4033)...');
  const ddjjRes = await fetch('https://gobiernoabierto.bahia.gob.ar/WS/4033');
  const ddjjText = await ddjjRes.text();
  const ddjjLines = ddjjText.split('\n').filter(l => l.trim().length > 0);

  const officials = new Map();
  for (let i = 1; i < ddjjLines.length; i++) {
    const line = ddjjLines[i];
    const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
    if (cols.length >= 9) {
      const apellido = cols[3];
      const nombre = cols[4];
      const dni = cleanDni(cols[5]);
      const cargo = cols[8];
      if (apellido && nombre && dni) {
        officials.set(dni, { apellido, nombre, dni, cargo });
      }
    }
  }

  console.log(`  Total Valid Physical Suppliers: ${physicalSuppliers.size.toLocaleString()}`);
  console.log(`  Total Valid Officials:          ${officials.size.toLocaleString()}`);

  // Deduplicate against Authority V4+Delta and Current Unconsumed Fuel Authority
  let supKnownV4 = 0;
  let supOverlapFuel = 0;
  let supNetNew = 0;
  const uniqueSuppliers = new Map();

  for (const [cuit, sup] of physicalSuppliers.entries()) {
    const norm = normalizeName(sup.razon);
    const dni = cuit.slice(2, 10);

    const hasV4 = authorityV4.has(cuit) || authorityV4.has(norm);
    if (hasV4) {
      supKnownV4++;
      continue;
    }

    const hasFuelCuit = fuelAuthority.has(`CUIT:${cuit}`);
    const hasFuelDni = fuelAuthority.has(`DNI:${dni}`);
    const hasFuelNameJur = fuelAuthority.has(`NAME_JUR:${norm}:BAHIA_BLANCA`);

    if (hasFuelCuit || hasFuelDni || hasFuelNameJur) {
      supOverlapFuel++;
      continue;
    }

    supNetNew++;
    uniqueSuppliers.set(cuit, sup);
  }

  let offKnownV4 = 0;
  let offOverlapFuel = 0;
  let offNetNew = 0;
  const uniqueOfficials = new Map();

  for (const [dni, off] of officials.entries()) {
    const fullName = `${off.nombre} ${off.apellido}`;
    const norm = normalizeName(fullName);

    const hasV4 = authorityV4.has(dni) || authorityV4.has(norm);
    if (hasV4) {
      offKnownV4++;
      continue;
    }

    const hasFuelDni = fuelAuthority.has(`DNI:${dni}`);
    const hasFuelNameJur = fuelAuthority.has(`NAME_JUR:${norm}:BAHIA_BLANCA`);

    if (hasFuelDni || hasFuelNameJur) {
      offOverlapFuel++;
      continue;
    }

    offNetNew++;
    uniqueOfficials.set(dni, off);
  }

  // Cross-dataset overlap between suppliers and officials
  let crossDupes = 0;
  for (const [dni, off] of uniqueOfficials.entries()) {
    for (const [cuit, sup] of uniqueSuppliers.entries()) {
      if (cuit.includes(dni)) {
        crossDupes++;
        break;
      }
    }
  }

  const v15ProvisionalUnique = 3081;
  const overlapWithPreexistingFuel = supOverlapFuel + offOverlapFuel;
  const v15FinalGloballyUniqueFuel = (uniqueSuppliers.size + uniqueOfficials.size - crossDupes);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('DEDUPLICATION AUDIT RESULTS:');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`V15_PROVISIONAL_UNIQUE = ${v15ProvisionalUnique}`);
  console.log(`OVERLAP_WITH_PREEXISTING_FUEL = ${overlapWithPreexistingFuel}`);
  console.log(`V15_FINAL_GLOBALLY_UNIQUE_FUEL = ${v15FinalGloballyUniqueFuel}`);

  const preV15Fuel = 624780;
  const endingVerifiedFuel = preV15Fuel + v15FinalGloballyUniqueFuel;
  const targetEngineering = 300000;
  const openingEngineering = 251719;
  const engineeringFuel = openingEngineering + v15FinalGloballyUniqueFuel;
  const finalCertificationHoldout = 373061;

  const engineeringDeficit = Math.max(0, targetEngineering - engineeringFuel);
  const finalHoldoutDeficit = Math.max(0, 1000000 - finalCertificationHoldout);
  const total1_3mDeficit = Math.max(0, 1300000 - endingVerifiedFuel);

  console.log(`\nENDING_VERIFIED_FUEL = ${endingVerifiedFuel}`);
  console.log(`ENGINEERING_FUEL = ${engineeringFuel}`);
  console.log(`FINAL_CERTIFICATION_HOLDOUT = ${finalCertificationHoldout}`);
  console.log(`ENGINEERING_DEFICIT = ${engineeringDeficit}`);
  console.log(`FINAL_HOLDOUT_DEFICIT = ${finalHoldoutDeficit}`);
  console.log(`TOTAL_1_3M_DEFICIT = ${total1_3mDeficit}`);
}

run().catch(console.error);
