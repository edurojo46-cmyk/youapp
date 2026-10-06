import fs from 'fs';
import readline from 'readline';
import { AtlasFuelIdentityLedger } from './atlas_fuel_identity_ledger.mjs';

function cleanPersonName(name) {
  if (!name) return null;
  let n = name.trim();
  n = n.replace(/\bx_ape\b/gi, '').trim();
  if (n.includes(',')) {
    const parts = n.split(',').map(p => p.trim());
    n = parts.reverse().join(' ');
  }
  n = n.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter(w => w.length > 1);
  if (words.length < 2 || words.length > 5) return null;
  const upper = n.toUpperCase();
  const reject = [
    'INSTITUTO', 'UNIVERSIDAD', 'FACULTAD', 'HOSPITAL', 'MINISTERIO', 'SECRETARIA',
    'DIRECCION', 'DEPARTAMENTO', 'S.A.', 'S.R.L.', 'SRL', 'S.A', 'CENTRO', 'LABORATORIO',
    'GOBIERNO', 'MUNICIPALIDAD', 'PROVINCIA', 'FUNDACION', 'ASOCIACION', 'COLEGIO',
    'CONSEJO', 'SOCIEDAD', 'EDITORIAL', 'REPOSITORIO', 'BIBLIOTECA', 'EXPEDIENTE',
    'UNKNOWN', 'ANONIMO', 'REDACCION', 'REGISTRO', 'COMISION', 'CONGRESO', 'SIN INFORMACION',
    'S.A.S', 'SAS', 'LTDA', 'BANCO', 'PROVEEDOR PRUEBA', 'SR.', 'SRA.', 'ESC.', 'DR.', 'DRA.', 'ING.',
    'SIN DATOS', 'NO POSEE', 'AUTOR VARIOS', 'VARIOS AUTORES'
  ];
  for (const r of reject) if (upper.includes(r)) return null;
  return n;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ';' || c === ',') {
      if (inQuotes) {
        current += c;
      } else {
        result.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  const ledger = new AtlasFuelIdentityLedger();
  await ledger.initialize();

  const years = [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013];

  let cumulativeCredits = 0;

  for (const yr of years) {
    const filePath = `scratch/physical_sources/dnda_by_year/derecho-autor-${yr}.csv`;
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${filePath}, does not exist.`);
      continue;
    }

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    let rowNum = 0;
    let candidates = 0;
    let credited = 0;

    for await (const line of rl) {
      rowNum++;
      if (rowNum === 1) continue;
      const cols = parseCSVLine(line);
      const rawName = cols[6]?.replace(/["']/g, '').trim() || cols[5]?.replace(/["']/g, '').trim();
      const cleaned = cleanPersonName(rawName);
      if (!cleaned) continue;
      candidates++;

      const res = ledger.evaluateAndCredit({
        name: cleaned,
        jurisdiction: 'ARG',
        sourceId: `DNDA_DERECHO_AUTOR_${yr}`,
        populationClass: 'Authors, Writers and Intellectual Property Creators',
        cuit: null,
        dni: null
      });

      if (res.credited) {
        credited++;
        cumulativeCredits++;
      }
    }
    console.log(`DNDA ${yr}: rows=${rowNum}, candidates=${candidates}, credited=${credited}, cumulative=${cumulativeCredits}`);
    if (cumulativeCredits >= 61014) {
      console.log(`★ Reached target! Total cumulative = ${cumulativeCredits}`);
      break;
    }
  }
}

main().catch(console.error);
