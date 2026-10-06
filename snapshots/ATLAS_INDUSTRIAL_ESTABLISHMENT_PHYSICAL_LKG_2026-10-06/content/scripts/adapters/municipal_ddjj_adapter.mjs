/**
 * scripts/adapters/municipal_ddjj_adapter.mjs
 * 
 * MUNICIPAL_DDJJ_ADAPTER
 * Generalized adapter for discovering, fetching, parsing, classifying,
 * validating, and deduplicating public municipal declarations of assets (DDJJ)
 * and municipal executive/legislative public officials.
 * 
 * Supported protocols: REST, CSV, JSON, XLSX, CKAN, Static Feeds.
 */

import crypto from 'crypto';
import fetch from 'node-fetch';
import { normalizeName } from '../build_global_identity_authority_v4.mjs';
import { cleanPersonName } from '../replay_fuel_bank_v4.mjs';

export function cleanDni(dniStr) {
  if (!dniStr) return null;
  const digits = String(dniStr).replace(/\D/g, '');
  if (digits.length >= 7 && digits.length <= 8) {
    return digits;
  }
  return null;
}

export function redactDni(dni) {
  if (!dni) return '';
  const s = String(dni).trim();
  if (s.length <= 4) return '***';
  return s.substring(0, 2) + '*'.repeat(s.length - 4) + s.substring(s.length - 2);
}

export class MunicipalDdjjAdapter {
  constructor(config = {}) {
    this.municipality = config.municipality || 'UNKNOWN_MUNI';
    this.jurisdiction = config.jurisdiction || 'MUNICIPAL';
    this.protocol = config.protocol || 'REST';
    this.sourceId = config.sourceId || `MUNI_DDJJ_${this.municipality.toUpperCase()}`;
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
    const dniCol = options.dniCol ?? 5;
    const apellidoCol = options.apellidoCol ?? 3;
    const nombreCol = options.nombreCol ?? 4;
    const cargoCol = options.cargoCol ?? 8;
    const singleNameCol = options.singleNameCol ?? null;

    console.log(`[MUNICIPAL_DDJJ_ADAPTER] Fetching ${this.municipality} officials from ${fetchUrl}...`);
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fetchUrl}`);
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const validOfficials = new Map();
    let malformedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts = this.parseCsvLine(line, delimiter);

      let dni = null;
      let fullName = null;
      let cargo = 'Funcionario Municipal';

      if (dniCol !== null && parts.length > dniCol) {
        dni = cleanDni(parts[dniCol]);
      }

      if (singleNameCol !== null && parts.length > singleNameCol) {
        const cleaned = cleanPersonName(parts[singleNameCol]);
        if (cleaned) fullName = cleaned;
      } else if (apellidoCol !== null && nombreCol !== null && parts.length > Math.max(apellidoCol, nombreCol)) {
        const ap = parts[apellidoCol];
        const nom = parts[nombreCol];
        if (ap && nom) {
          const cleaned = cleanPersonName(`${nom} ${ap}`);
          if (cleaned) fullName = cleaned;
        }
      }

      if (cargoCol !== null && parts.length > cargoCol && parts[cargoCol]) {
        cargo = parts[cargoCol].trim();
      }

      if (!fullName) {
        malformedCount++;
        continue;
      }

      const dedupeKey = dni ? `DNI:${dni}` : `NAME:${normalizeName(fullName)}`;
      if (!validOfficials.has(dedupeKey)) {
        validOfficials.set(dedupeKey, {
          dni,
          fullName,
          cargo,
          sourceId: this.sourceId,
          municipality: this.municipality,
          jurisdiction: this.jurisdiction,
          populationClass: 'Municipal / Local Authorities'
        });
      }
    }

    const results = Array.from(validOfficials.values());
    console.log(`[MUNICIPAL_DDJJ_ADAPTER] ${this.municipality}: Total rows: ${lines.length - 1}, Valid distinct officials: ${results.length}, Malformed/skipped: ${malformedCount}`);
    return results;
  }
}
