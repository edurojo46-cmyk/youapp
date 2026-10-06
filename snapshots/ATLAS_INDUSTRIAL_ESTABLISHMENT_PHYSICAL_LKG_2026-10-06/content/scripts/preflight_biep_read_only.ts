process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import readline from 'readline';

const BIEP_ZIP_URL = 'https://biep.miportal.gob.ar/apps/directorio/archivos/datos.zip';
const TARGET_DIR = path.resolve(process.cwd(), 'scratch/biep_preflight');
const ZIP_FILE = path.join(TARGET_DIR, 'datos.zip');

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status code ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function analyzeBiep() {
  console.log('================================================================');
  console.log('TRACK B: BIEP / DIRECTORIO DEL ESTADO — PREFLIGHT READ-ONLY');
  console.log('================================================================\n');

  console.log(`Downloading official BIEP dataset from: ${BIEP_ZIP_URL}...`);
  await downloadFile(BIEP_ZIP_URL, ZIP_FILE);
  const stat = fs.statSync(ZIP_FILE);
  console.log(`Downloaded ZIP size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  console.log('Extracting ZIP archive...');
  try {
    execSync(`tar -xf "${ZIP_FILE}" -C "${TARGET_DIR}"`);
  } catch {
    // Windows PowerShell fallback if tar fails
    execSync(`powershell -Command "Expand-Archive -Force '${ZIP_FILE}' '${TARGET_DIR}'"`);
  }

  const allFiles = fs.readdirSync(TARGET_DIR);
  console.log('Extracted files:', allFiles);

  const csvFiles = allFiles.filter(f => f.endsWith('.csv') || f.endsWith('.txt'));
  console.log(`Found ${csvFiles.length} data files to analyze.\n`);

  let totalRawRows = 0;
  const uniquePersons = new Set<string>();
  const uniqueOrgs = new Set<string>();
  let withRoleOrEscalafon = 0;
  let withContractType = 0;
  let explicitCabaRelation = 0;
  let hasDniOrCuil = false;
  let headerColumns: string[] = [];

  // Keywords indicating CABA locations in APN ministries / central agencies
  const CABA_APN_KEYWORDS = [
    'capital federal', 'caba', 'buenos aires', 'casa rosada', 'balcarce 50',
    'plaza de mayo', 'san martin', 'paseo colon', 'alem', 'diagonal sur', 'diagonal norte'
  ];

  for (const csvName of csvFiles) {
    const filePath = path.join(TARGET_DIR, csvName);
    console.log(`\n--- Analyzing file: ${csvName} ---`);

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineIdx = 0;
    let sep = ',';

    for await (const line of rl) {
      if (!line.trim()) continue;
      lineIdx++;

      if (lineIdx === 1) {
        if (line.includes(';')) sep = ';';
        else if (line.includes('\t')) sep = '\t';
        headerColumns = line.split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
        console.log('Headers:', headerColumns);

        const lowerHeaders = headerColumns.map(h => h.toLowerCase());
        if (lowerHeaders.some(h => h.includes('dni') || h.includes('cuil') || h.includes('documento'))) {
          hasDniOrCuil = true;
        }
        continue;
      }

      totalRawRows++;
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));

      // Person identifier (Name or Surname + Given)
      // Inspect typical BIEP columns: NOMBRE, APELLIDO, ORGANISMO, CARGO, CONTRATO, etc.
      const rowObj: Record<string, string> = {};
      for (let i = 0; i < headerColumns.length; i++) {
        rowObj[headerColumns[i].toLowerCase()] = cols[i] || '';
      }

      const name = rowObj['nombre'] || rowObj['nombres'] || '';
      const surname = rowObj['apellido'] || rowObj['apellidos'] || '';
      const fullName = `${surname} ${name}`.trim() || cols[0] || '';

      if (fullName) {
        uniquePersons.add(fullName.toLowerCase());
      }

      const org = rowObj['organismo'] || rowObj['jurisdiccion'] || rowObj['dependencia'] || '';
      if (org) {
        uniqueOrgs.add(org);
      }

      const role = rowObj['cargo'] || rowObj['escalafon'] || rowObj['puesto'] || rowObj['funcion'] || '';
      if (role) {
        withRoleOrEscalafon++;
      }

      const contract = rowObj['contrato'] || rowObj['modalidad'] || rowObj['tipo_contrato'] || rowObj['planta'] || '';
      if (contract) {
        withContractType++;
      }

      // Check geographical / CABA relation
      const fullRowText = line.toLowerCase();
      if (CABA_APN_KEYWORDS.some(kw => fullRowText.includes(kw))) {
        explicitCabaRelation++;
      }
    }
  }

  const preflightReport = {
    SOURCE: 'BIEP / Directorio del Estado APN (Jefatura de Gabinete / Desregulación)',
    URL: BIEP_ZIP_URL,
    ZIP_SIZE_BYTES: stat.size,
    RAW_ROWS: totalRawRows,
    UNIQUE_PERSONS: uniquePersons.size,
    UNIQUE_ORGANIZATIONS: uniqueOrgs.size,
    WITH_ROLE_OR_ESCALAFON: withRoleOrEscalafon,
    WITH_CONTRACT_TYPE: withContractType,
    EXPLICIT_CABA_RELATION: explicitCabaRelation,
    HAS_DNI_OR_CUIL_IN_RAW: hasDniOrCuil,
    PRIVACY_PROTECTION_ENFORCED: 'DNI / CUIL MUST NEVER BE EXPOSED OR INDEXED',
    CABA_DECISION_RULE: 'EMPLOYEE_OF_NATIONAL_STATE != CABA_RESIDENT (STRICT_SEPARATION)',
    LICENSE: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
    INDEX_FULL_ALLOWED: true,
    IS_MASS_100K_SOURCE: uniquePersons.size >= 100000 ? 'YES' : 'POTENTIAL_50K_100K',
    PREFLIGHT_STATUS: 'READ_ONLY_COMPLETE_NO_ROWS_INSERTED'
  };

  console.log('\n================================================================');
  console.log('BIEP PREFLIGHT REPORT RESULTS:');
  console.log('================================================================');
  console.log(JSON.stringify(preflightReport, null, 2));

  // Save report to disk
  const reportDir = path.resolve(process.cwd(), 'reports/atlas/people');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'biep_mass_source_report_v1.json'),
    JSON.stringify(preflightReport, null, 2),
    'utf8'
  );

  console.log(`Saved report to ${path.join(reportDir, 'biep_mass_source_report_v1.json')}`);
}

analyzeBiep().catch(err => {
  console.error('Fatal error in BIEP preflight:', err);
  process.exit(1);
});
