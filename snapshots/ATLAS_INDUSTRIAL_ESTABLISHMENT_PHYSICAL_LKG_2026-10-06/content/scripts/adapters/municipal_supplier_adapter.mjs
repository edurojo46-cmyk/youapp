/**
 * scripts/adapters/municipal_supplier_adapter.mjs
 * 
 * MUNICIPAL_SUPPLIER_ADAPTER
 * Generalized adapter for discovering, fetching, parsing, classifying,
 * validating, and deduplicating public municipal procurement and supplier records.
 * 
 * Supported protocols: REST, CSV, JSON, XLSX, CKAN, Static Feeds.
 */

import crypto from 'crypto';
import fetch from 'node-fetch';
import { normalizeName } from '../build_global_identity_authority_v4.mjs';

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
  return ['20', '23', '24', '27'].includes(prefix);
}

const CORPORATE_REJECT_TOKENS = [
  'S.A.', ' S.A', 'SA ', 'S.R.L.', ' SRL', ' S.A.S', 'S.C.', 'S.H.', ' SOCIEDAD',
  'COOPERATIVA', 'ASOCIACION', 'FUNDACION', 'CONSORCIO', 'EMPRESA', 'COMERCIAL',
  'DISTRIBUIDORA', 'TRANSPORTES', 'SERVICIOS', 'CONSTRUCTORA', 'FARMACIA',
  'CLINICA', 'INSTITUTO', 'CENTRO', 'TALLER', 'LIBRERIA', 'CORRALON', 'METALURGICA',
  'MUNICIPALIDAD', 'SECRETARIA', 'HOSPITAL', 'BANCO', 'SEGUROS'
];

export function isLikelyCorporateEntity(name) {
  if (!name) return true;
  const up = name.toUpperCase();
  for (const tok of CORPORATE_REJECT_TOKENS) {
    if (up.includes(tok)) return true;
  }
  return false;
}

export function cleanSupplierName(rawName) {
  if (!rawName) return null;
  let n = rawName.replace(/^"|"$/g, '').trim();
  if (n.includes(',')) {
    const parts = n.split(',');
    n = `${parts[1].trim()} ${parts[0].trim()}`.trim();
  }
  n = n.replace(/[\(\)\[\]\{\}\<\>\"\'\*\_\#\@\$\%\^\&\=\+\~\`\|\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter(w => w.length > 1);
  if (words.length < 2 || words.length > 5) return null;
  if (!isNaN(Number(n))) return null;
  if (isLikelyCorporateEntity(n)) return null;
  return n;
}

export function redactCuit(cuit) {
  if (!cuit) return '';
  const digits = String(cuit).replace(/\D/g, '');
  if (digits.length !== 11) return '***';
  return `${digits.slice(0, 2)}-******${digits.slice(8, 10)}-${digits.slice(10)}`;
}

export function redactDni(dni) {
  if (!dni) return '';
  const s = String(dni).trim();
  if (s.length <= 4) return '***';
  return s.substring(0, 2) + '*'.repeat(s.length - 4) + s.substring(s.length - 2);
}

export class MunicipalSupplierAdapter {
  constructor(config = {}) {
    this.municipality = config.municipality || 'UNKNOWN_MUNI';
    this.jurisdiction = config.jurisdiction || 'MUNICIPAL';
    this.protocol = config.protocol || 'REST';
    this.sourceId = config.sourceId || `MUNI_SUPPLIERS_${this.municipality.toUpperCase()}`;
  }

  parseCsvLine(line, delimiter = ';') {
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

  async fetchAndClassify(fetchUrl, options = {}) {
    const delimiter = options.delimiter || ';';
    const cuitCol = options.cuitCol ?? 2;
    const nameCol = options.nameCol ?? 1;

    console.log(`[MUNICIPAL_SUPPLIER_ADAPTER] Fetching ${this.municipality} suppliers from ${fetchUrl}...`);
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fetchUrl}`);
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const validPhysicalPersons = [];
    let corporateRejected = 0;
    let checksumRejected = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = this.parseCsvLine(line, delimiter);
      if (parts.length <= Math.max(cuitCol, nameCol)) continue;

      const rawCuit = parts[cuitCol].replace(/\D/g, '');
      const rawName = parts[nameCol];

      if (!isPhysicalPersonCuit(rawCuit)) {
        corporateRejected++;
        continue;
      }

      if (!isValidCuitChecksum(rawCuit)) {
        checksumRejected++;
        continue;
      }

      const cleanName = cleanSupplierName(rawName);
      if (!cleanName) {
        corporateRejected++;
        continue;
      }

      const dni = rawCuit.slice(2, 10);
      validPhysicalPersons.push({
        cuit: rawCuit,
        dni,
        name: cleanName,
        rawName,
        sourceId: this.sourceId,
        municipality: this.municipality,
        jurisdiction: this.jurisdiction,
        populationClass: 'Municipal Procurement Suppliers'
      });
    }

    console.log(`[MUNICIPAL_SUPPLIER_ADAPTER] ${this.municipality}: Total rows: ${lines.length - 1}, Valid natural persons: ${validPhysicalPersons.length}, Corporate rejected: ${corporateRejected}, Checksum rejected: ${checksumRejected}`);
    return validPhysicalPersons;
  }
}
