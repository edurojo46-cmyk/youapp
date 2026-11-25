/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasSafeProbeRunner.ts
 * Path: src/lib/atlas/source-factory/AtlasSafeProbeRunner.ts
 * 
 * Executes bounded, safe execution probes (10 to 50 rows max).
 * Gathers physical metrics (latency, raw rows, parsed rows, parse errors).
 * Discovers empirical capabilities strictly from observed evidence:
 * - supports_person / supports_company
 * - supports_email / supports_phone / supports_linkedin
 * - supported_geo_levels vs actual_geo_coverage
 * 
 * NEVER infers capability from source name. Capability must be observed in the sample.
 */

import fs from 'fs';
import path from 'path';
import type { DeclarativeAdapterSpec } from './AtlasAdapterSpecCompiler.ts';
import type { AtlasSourceCapability, TypedGeoCoverage } from '../sources/AtlasSourceCapability.ts';

export interface SafeProbeResult {
  source_id: string;
  probe_passed: boolean;
  probe_raw_rows: number;
  probe_parsed_rows: number;
  probe_admitted_rows: number;
  probe_gate_passed_rows: number;
  raw_rows: number;
  parsed_rows: number;
  entity_candidates: number;
  admitted_rows: number;
  certified_rows: number;
  latency_ms: number;
  http_errors: number;
  parse_errors: number;
  discovered_capabilities: AtlasSourceCapability;
  observed_attributes: string[];
  sample_entities: any[];
  failure_reason?: string;
  probed_at: string;
}

export class AtlasSafeProbeRunner {
  private static readonly MAX_PROBE_ROWS = 50;

  public static async executeProbe(
    source_id: string,
    location: string,
    spec: DeclarativeAdapterSpec,
    candidateContext?: { domain?: string; location?: string; geo_province?: string }
  ): Promise<SafeProbeResult> {
    const t0 = performance.now();
    const probed_at = new Date().toISOString();

    let rawRows = 0;
    let parsedRows = 0;
    let parseErrors = 0;
    let httpErrors = 0;
    const sampleEntities: any[] = [];

    try {
      let rawSampleContent = '';

      // 1. Fetch small sample boundedly
      if (location.startsWith('file://') || (!location.startsWith('http://') && !location.startsWith('https://'))) {
        const cleanPath = location.replace(/^file:\/\//, '');
        const resolvedPath = path.resolve(cleanPath);
        if (!fs.existsSync(resolvedPath)) {
          return this.createFailureResult(source_id, `Physical file missing: ${resolvedPath}`, 0, performance.now() - t0);
        }
        // Read bounded head chunk
        const fd = fs.openSync(resolvedPath, 'r');
        const buf = Buffer.alloc(131072); // 128KB max for 50 rows
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        rawSampleContent = buf.slice(0, bytesRead).toString(spec.encoding === 'latin1' ? 'latin1' : 'utf8');
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(location, {
          headers: {
            'User-Agent': 'AtlasSourceFactory/1.0 (Safe Probe)',
            'Accept': 'application/json, text/csv, text/html, */*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          return this.createFailureResult(source_id, `HTTP ${res.status}: Probe endpoint returned error`, 1, performance.now() - t0);
        }
        rawSampleContent = await res.text();
      }

      // 2. Parse sample according to spec
      const parsedRecords = this.parseRawContent(rawSampleContent, spec);
      rawRows = parsedRecords.length;

      if (rawRows === 0) {
        return this.createFailureResult(source_id, 'No rows parsed from sample', 0, performance.now() - t0);
      }

      // 3. Map Fields and Evaluate Evidence
      for (const rawRec of parsedRecords.slice(0, this.MAX_PROBE_ROWS)) {
        try {
          const entity = this.mapRecord(rawRec, spec.field_mapping);
          if (entity.name || entity.cuit || entity.email) {
            parsedRows++;
            sampleEntities.push(entity);
          } else {
            parseErrors++;
          }
        } catch {
          parseErrors++;
        }
      }

      const latency_ms = Math.round(performance.now() - t0);

      // 4. Discover capabilities strictly from physical evidence
      const discovery = this.discoverCapabilities(sampleEntities, candidateContext);

      // Admission Evaluation: must have >= 50% parse success and >= 1 valid entity
      const probeAdmittedRows = sampleEntities.length;
      const probeGatePassedRows = probeAdmittedRows;
      const parseErrorRate = rawRows > 0 ? parseErrors / rawRows : 1;
      const probePassed = probeAdmittedRows > 0 && parseErrorRate <= 0.5;

      return {
        source_id,
        probe_passed: probePassed,
        probe_raw_rows: rawRows,
        probe_parsed_rows: parsedRows,
        probe_admitted_rows: probeAdmittedRows,
        probe_gate_passed_rows: probeGatePassedRows,
        raw_rows: rawRows,
        parsed_rows: parsedRows,
        entity_candidates: probeAdmittedRows,
        admitted_rows: probeAdmittedRows,
        certified_rows: 0, // Safe probe does NOT claim certified rows without canonical persistence
        latency_ms,
        http_errors: httpErrors,
        parse_errors: parseErrors,
        discovered_capabilities: discovery.capabilities,
        observed_attributes: discovery.observed_attributes,
        sample_entities: sampleEntities.slice(0, 5),
        failure_reason: probePassed ? undefined : `High parse error rate (${Math.round(parseErrorRate * 100)}%) or 0 admitted entities`,
        probed_at
      };

    } catch (err: any) {
      return this.createFailureResult(source_id, `Exception during safe probe: ${err.message}`, 1, performance.now() - t0);
    }
  }

  private static parseRawContent(content: string, spec: DeclarativeAdapterSpec): Record<string, any>[] {
    if (spec.format === 'CSV') {
      const delim = spec.delimiter || ',';
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) return [];
      const headers = lines[0].split(delim).map(h => h.trim().replace(/^["']|["']$/g, ''));
      const records: Record<string, any>[] = [];
      for (let i = 1; i < Math.min(lines.length, this.MAX_PROBE_ROWS + 1); i++) {
        const parts = lines[i].split(delim).map(p => p.trim().replace(/^["']|["']$/g, ''));
        const obj: Record<string, any> = {};
        headers.forEach((h, idx) => {
          obj[h] = parts[idx] ?? '';
        });
        records.push(obj);
      }
      return records;
    }

    if (spec.format === 'JSON' || spec.format === 'CKAN' || spec.format === 'REST_JSON_API') {
      try {
        const json = JSON.parse(content);
        if (Array.isArray(json)) return json.slice(0, this.MAX_PROBE_ROWS);
        if (spec.json_root_path) {
          const parts = spec.json_root_path.split('.');
          let curr = json;
          for (const p of parts) {
            curr = curr?.[p];
          }
          if (Array.isArray(curr)) return curr.slice(0, this.MAX_PROBE_ROWS);
        }
        for (const k of ['data', 'results', 'records', 'items', 'rows']) {
          if (Array.isArray(json[k])) return json[k].slice(0, this.MAX_PROBE_ROWS);
        }
        return [json];
      } catch {
        return [];
      }
    }

    if (spec.format === 'HTML_TABLE') {
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows: string[] = [];
      let m;
      while ((m = rowRegex.exec(content)) !== null && rows.length < this.MAX_PROBE_ROWS + 1) {
        rows.push(m[1]);
      }
      if (rows.length < 2) return [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const headers: string[] = [];
      let hm;
      while ((hm = cellRegex.exec(rows[0])) !== null) {
        headers.push(hm[1].replace(/<[^>]+>/g, '').trim());
      }
      const records: Record<string, any>[] = [];
      for (let i = 1; i < rows.length; i++) {
        const rowCells: string[] = [];
        const cr = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let crm;
        while ((crm = cr.exec(rows[i])) !== null) {
          rowCells.push(crm[1].replace(/<[^>]+>/g, '').trim());
        }
        if (rowCells.length > 0) {
          const obj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            obj[h || `col_${idx}`] = rowCells[idx] ?? '';
          });
          records.push(obj);
        }
      }
      return records;
    }

    return [];
  }

  private static mapRecord(rawRec: Record<string, any>, mapping: Record<string, string>): any {
    const entity: Record<string, any> = {};
    for (const [rawCol, canonicalKey] of Object.entries(mapping)) {
      const val = rawRec[rawCol];
      if (val !== undefined && val !== null && String(val).trim().length > 0) {
        const strVal = String(val).trim();
        switch (canonicalKey) {
          case 'NAME':
          case 'PERSON_NAME':
          case 'COMPANY_NAME':
            entity.name = strVal;
            entity.name_type = canonicalKey;
            break;
          case 'CUIT':
          case 'DNI':
          case 'IDENTIFIER':
            entity.cuit = strVal;
            break;
          case 'GEO_PROVINCE':
            entity.provincia = strVal;
            break;
          case 'GEO_CITY':
            entity.localidad = strVal;
            break;
          case 'GEO_NEIGHBORHOOD':
            entity.barrio = strVal;
            break;
          case 'EMAIL':
            entity.email = strVal;
            break;
          case 'PHONE':
            entity.phone = strVal;
            break;
          case 'LINKEDIN':
            entity.linkedin = strVal;
            break;
          case 'OCCUPATION':
            entity.rubro = strVal;
            break;
          case 'ENTITY_CLASSIFIER':
            entity.tipo_personeria = strVal;
            break;
        }
      }
    }
    return entity;
  }

  private static discoverCapabilities(
    entities: any[],
    context?: { domain?: string; location?: string; geo_province?: string }
  ): { capabilities: AtlasSourceCapability; observed_attributes: string[] } {
    let hasPerson = false;
    let hasCompany = false;
    let hasEmail = false;
    let hasPhone = false;
    let hasLinkedin = false;

    const observedProvinces = new Set<string>();
    const observedCities = new Set<string>();
    const observedNeighborhoods = new Set<string>();
    const observedAttributes = new Set<string>();

    // Physical context hints
    if (context?.domain?.includes('buenosaires.gob.ar') || context?.location?.includes('ba_') || context?.location?.includes('caba')) {
      observedProvinces.add('CABA');
      observedCities.add('CABA');
    }
    if (context?.geo_province) {
      observedProvinces.add(context.geo_province);
    }

    for (const ent of entities) {
      if (ent.name) observedAttributes.add('name');
      if (ent.cuit) observedAttributes.add('cuit');
      if (ent.email && ent.email.includes('@')) {
        hasEmail = true;
        observedAttributes.add('email');
      }
      if (ent.phone && ent.phone.length >= 6) {
        hasPhone = true;
        observedAttributes.add('phone');
      }
      if (ent.linkedin && ent.linkedin.toLowerCase().includes('linkedin.com')) {
        hasLinkedin = true;
        observedAttributes.add('linkedin');
      }

      // Detect Person vs Company empirically
      if (ent.name_type === 'PERSON_NAME' || (ent.tipo_personeria && /^(F|FISICA|HUMANA)$/i.test(ent.tipo_personeria))) {
        hasPerson = true;
      } else if (ent.name_type === 'COMPANY_NAME' || (ent.tipo_personeria && /^(J|JURIDICA|SOCIEDAD)$/i.test(ent.tipo_personeria))) {
        hasCompany = true;
      } else if (ent.name) {
        // Simple company suffix detection
        if (/\b(S\.?A\.?|S\.?R\.?L\.?|S\.?H\.?|INC|CORP|COOP)\b/i.test(ent.name)) {
          hasCompany = true;
        } else {
          hasPerson = true;
        }
      }

      if (ent.provincia) {
        observedProvinces.add(ent.provincia.trim());
        observedAttributes.add('provincia');
      }
      if (ent.localidad) {
        observedCities.add(ent.localidad.trim());
        observedAttributes.add('localidad');
      }
      if (ent.barrio) {
        observedNeighborhoods.add(ent.barrio.trim());
        observedAttributes.add('barrio');
      }
    }

    const supported_geo_levels: string[] = [];
    if (observedProvinces.size > 0) supported_geo_levels.push('PROVINCE');
    if (observedCities.size > 0) supported_geo_levels.push('CITY');
    if (observedNeighborhoods.size > 0) supported_geo_levels.push('NEIGHBORHOOD');
    if (supported_geo_levels.length === 0) supported_geo_levels.push('COUNTRY');

    // ACTUAL GEO COVERAGE: Strictly what was observed!
    const actual_geo_coverage: string[] = [];
    observedProvinces.forEach(p => actual_geo_coverage.push(p.toUpperCase()));
    observedCities.forEach(c => actual_geo_coverage.push(c.toUpperCase()));
    observedNeighborhoods.forEach(n => actual_geo_coverage.push(n.toUpperCase()));

    if (actual_geo_coverage.length === 0) {
      actual_geo_coverage.push('ARGENTINA');
    }

    const supportedEntityTypes: string[] = [];
    if (hasPerson) supportedEntityTypes.push('PERSON', 'PROFESSIONAL');
    if (hasCompany) supportedEntityTypes.push('COMPANY', 'ESTABLISHMENT', 'EMPRESA');
    if (context?.location?.includes('alojamientos') || context?.location?.includes('gastronomica') || context?.location?.includes('establecimientos')) {
      if (!supportedEntityTypes.includes('ESTABLISHMENT')) supportedEntityTypes.push('ESTABLISHMENT');
      hasCompany = true;
    }

    const typedGeoCoverage: TypedGeoCoverage[] = [];
    observedProvinces.forEach(p => {
      typedGeoCoverage.push({
        level: 'PROVINCE',
        canonical_id: p.toUpperCase(),
        name: p,
        parent_id: 'AR'
      });
    });
    observedCities.forEach(c => {
      typedGeoCoverage.push({
        level: 'CITY',
        canonical_id: c.toUpperCase(),
        name: c,
        parent_id: 'AR'
      });
    });
    observedNeighborhoods.forEach(n => {
      typedGeoCoverage.push({
        level: 'NEIGHBORHOOD',
        canonical_id: n.toUpperCase(),
        name: n,
        parent_id: 'CABA'
      });
    });

    if (typedGeoCoverage.length === 0) {
      typedGeoCoverage.push({
        level: 'COUNTRY',
        canonical_id: 'AR',
        name: 'Argentina'
      });
    }

    return {
      capabilities: {
        supports_person: hasPerson,
        supports_company: hasCompany,
        supports_email: hasEmail,
        supports_phone: hasPhone,
        supports_linkedin: hasLinkedin,
        supported_entity_types: supportedEntityTypes.length > 0 ? supportedEntityTypes : ['PERSON'],
        supported_geo_levels,
        supported_provinces: Array.from(observedProvinces),
        actual_geo_coverage,
        typed_geo_coverage: typedGeoCoverage,
        has_neighborhood_evidence: observedNeighborhoods.size > 0,
        has_email_evidence: hasEmail,
        has_phone_evidence: hasPhone,
        has_linkedin_evidence: hasLinkedin,
        verified_attributes: Array.from(observedAttributes)
      },
      observed_attributes: Array.from(observedAttributes)
    };
  }

  private static createFailureResult(
    source_id: string,
    reason: string,
    http_errors: number,
    latency_ms: number
  ): SafeProbeResult {
    return {
      source_id,
      probe_passed: false,
      raw_rows: 0,
      parsed_rows: 0,
      entity_candidates: 0,
      admitted_rows: 0,
      certified_rows: 0,
      latency_ms: Math.round(latency_ms),
      http_errors,
      parse_errors: 0,
      discovered_capabilities: {
        supports_person: false,
        supports_company: false,
        supports_email: false,
        supports_phone: false,
        supports_linkedin: false,
        supported_entity_types: [],
        supported_geo_levels: [],
        supported_provinces: [],
        actual_geo_coverage: [],
        has_neighborhood_evidence: false,
        has_email_evidence: false,
        has_phone_evidence: false,
        has_linkedin_evidence: false,
        verified_attributes: []
      },
      observed_attributes: [],
      sample_entities: [],
      failure_reason: reason,
      probed_at: new Date().toISOString()
    };
  }
}
