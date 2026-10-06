import fs from 'fs';
import path from 'path';
import type pg from 'pg';

export type AdminLevel = 'NATIONAL' | 'PROVINCE' | 'CITY_PROVINCE' | 'DEPARTMENT' | 'MUNICIPALITY' | 'LOCALITY';

export interface CanonicalGeography {
  geography_id: string;
  canonical_name: string;
  display_name: string;
  country: string;
  province: string | null;
  department: string | null;
  municipality: string | null;
  locality: string | null;
  admin_level: AdminLevel;
  aliases: string[];
  normalized_aliases: string[];
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
    clause: string;
  };
  boundary_source: string;
  boundary_id: string | null;
  boundary_geometry_ref: string | null;
  parent_geography_id: string | null;
  confidence: number;
  provenance: string;
  validation_state: 'VALIDATED' | 'LEARNED';
  updated_at?: string;
}

export interface AmbiguityResolution {
  is_ambiguous: boolean;
  prompt?: string;
  candidates?: string[];
  detected_term?: string;
}

export interface UnifiedGeographyResult {
  pass: boolean;
  canonicalGeo: CanonicalGeography | null;
  conflict: boolean;
  ambiguity: boolean;
  prompt?: string;
  candidates?: string[];
  reason?: string;
}

export class AtlasGeographyRegistry {
  private static instance: AtlasGeographyRegistry;
  private dbPool: pg.Pool | null = null;
  private geographies: Map<string, CanonicalGeography> = new Map();
  private isInitialized = false;

  private constructor() {
    this.seedBaselineDiskCache();
  }

  public static getInstance(): AtlasGeographyRegistry {
    if (!this.instance) {
      this.instance = new AtlasGeographyRegistry();
    }
    return this.instance;
  }

  public setDbPool(pool: pg.Pool): void {
    this.dbPool = pool;
  }

  /**
   * Loads baseline disk cache from server/data/geography/argentina_geographies.json
   */
  private seedBaselineDiskCache(): void {
    try {
      const candidates = [
        path.resolve('server/data/geography/argentina_geographies.json'),
        path.join(process.cwd(), 'server', 'data', 'geography', 'argentina_geographies.json')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const list: CanonicalGeography[] = JSON.parse(raw);
          for (const item of list) {
            this.geographies.set(item.geography_id, item);
          }
          break;
        }
      }
    } catch (e: any) {
      console.warn('[AtlasGeographyRegistry] Could not load disk cache:', e.message);
    }
  }

  /**
   * Initializes PostgreSQL schema and ingests official geography dataset
   */
  public async ensureSchema(): Promise<void> {
    if (!this.dbPool) {
      console.warn('[AtlasGeographyRegistry] No DB pool configured; using in-memory cache.');
      return;
    }

    try {
      await this.dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_geography_registry (
          geography_id VARCHAR(100) PRIMARY KEY,
          canonical_name VARCHAR(255) NOT NULL,
          display_name VARCHAR(255) NOT NULL,
          country VARCHAR(50) NOT NULL DEFAULT 'ARG',
          province VARCHAR(150),
          department VARCHAR(150),
          municipality VARCHAR(150),
          locality VARCHAR(150),
          admin_level VARCHAR(50) NOT NULL,
          aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
          normalized_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
          bbox JSONB NOT NULL,
          boundary_source VARCHAR(100) NOT NULL DEFAULT 'IGN_ARGENTINA',
          boundary_id VARCHAR(100),
          boundary_geometry_ref TEXT,
          parent_geography_id VARCHAR(100),
          confidence NUMERIC NOT NULL DEFAULT 1.0,
          provenance VARCHAR(100) NOT NULL DEFAULT 'IGN_INDEC_OFFICIAL',
          validation_state VARCHAR(50) NOT NULL DEFAULT 'VALIDATED',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_geo_admin_level ON public.atlas_geography_registry(admin_level);
        CREATE INDEX IF NOT EXISTS idx_geo_parent ON public.atlas_geography_registry(parent_geography_id);
      `);

      // Seed all disk cache entries into DB with ON CONFLICT DO UPDATE
      const allGeos = Array.from(this.geographies.values());
      for (const geo of allGeos) {
        await this.dbPool.query(`
          INSERT INTO public.atlas_geography_registry (
            geography_id, canonical_name, display_name, country, province, department,
            municipality, locality, admin_level, aliases, normalized_aliases, bbox,
            boundary_source, boundary_id, boundary_geometry_ref, parent_geography_id,
            confidence, provenance, validation_state, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
            $13, $14, $15, $16,
            $17, $18, $19, NOW(), NOW()
          )
          ON CONFLICT (geography_id) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            display_name = EXCLUDED.display_name,
            country = EXCLUDED.country,
            province = EXCLUDED.province,
            department = EXCLUDED.department,
            municipality = EXCLUDED.municipality,
            locality = EXCLUDED.locality,
            admin_level = EXCLUDED.admin_level,
            aliases = EXCLUDED.aliases,
            normalized_aliases = EXCLUDED.normalized_aliases,
            bbox = EXCLUDED.bbox,
            boundary_source = EXCLUDED.boundary_source,
            boundary_id = EXCLUDED.boundary_id,
            boundary_geometry_ref = EXCLUDED.boundary_geometry_ref,
            parent_geography_id = EXCLUDED.parent_geography_id,
            confidence = EXCLUDED.confidence,
            provenance = EXCLUDED.provenance,
            validation_state = EXCLUDED.validation_state,
            updated_at = NOW();
        `, [
          geo.geography_id,
          geo.canonical_name,
          geo.display_name,
          geo.country || 'ARG',
          geo.province,
          geo.department,
          geo.municipality,
          geo.locality,
          geo.admin_level,
          JSON.stringify(geo.aliases || []),
          JSON.stringify(geo.normalized_aliases || []),
          JSON.stringify(geo.bbox),
          geo.boundary_source || 'IGN_ARGENTINA',
          geo.boundary_id,
          geo.boundary_geometry_ref,
          geo.parent_geography_id,
          geo.confidence || 1.0,
          geo.provenance || 'IGN_INDEC_OFFICIAL',
          geo.validation_state || 'VALIDATED'
        ]);
      }

      await this.loadFromDb();
      this.isInitialized = true;
    } catch (err: any) {
      console.error('[AtlasGeographyRegistry] Error ensuring schema:', err.message);
    }
  }

  /**
   * Loads all active geographies from PostgreSQL into memory map
   */
  public async loadFromDb(): Promise<void> {
    if (!this.dbPool) return;
    try {
      const res = await this.dbPool.query(`
        SELECT * FROM public.atlas_geography_registry
        WHERE validation_state = 'VALIDATED'
        ORDER BY admin_level ASC, geography_id ASC;
      `);
      this.geographies.clear();
      for (const row of res.rows) {
        const item: CanonicalGeography = {
          geography_id: row.geography_id,
          canonical_name: row.canonical_name,
          display_name: row.display_name,
          country: row.country,
          province: row.province,
          department: row.department,
          municipality: row.municipality,
          locality: row.locality,
          admin_level: row.admin_level,
          aliases: Array.isArray(row.aliases) ? row.aliases : [],
          normalized_aliases: Array.isArray(row.normalized_aliases) ? row.normalized_aliases : [],
          bbox: row.bbox,
          boundary_source: row.boundary_source,
          boundary_id: row.boundary_id,
          boundary_geometry_ref: row.boundary_geometry_ref,
          parent_geography_id: row.parent_geography_id,
          confidence: Number(row.confidence) || 1.0,
          provenance: row.provenance,
          validation_state: row.validation_state,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
        };
        this.geographies.set(item.geography_id, item);
      }
      console.log(`[AtlasGeographyRegistry] Ingested ${this.geographies.size} canonical geographies from database.`);
    } catch (e: any) {
      console.error('[AtlasGeographyRegistry] Error loading from DB:', e.message);
    }
  }

  public getAllGeographies(): CanonicalGeography[] {
    return Array.from(this.geographies.values());
  }

  public getGeography(id: string): CanonicalGeography | null {
    if (!id) return null;
    return this.geographies.get(id) || null;
  }

  /**
   * Helper to normalize text: lowercase, remove accents, trim
   */
  private normalize(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Detects polysemic / ambiguous geographic terms (e.g. "Córdoba", "Santa Fe", "Mendoza", "San Juan")
   */
  public detectAmbiguity(text: string, selectorId?: string | null): AmbiguityResolution {
    const norm = this.normalize(text);

    // If an explicit disambiguating selector is provided, no ambiguity
    if (selectorId && selectorId !== 'ARG_NACIONAL') {
      const selGeo = this.getGeography(selectorId);
      if (selGeo) return { is_ambiguous: false };
    }

    // Ambiguity models for dual jurisdictions (Capital vs Provincia)
    const ambiguityModels: Array<{
      token: RegExp;
      qualifierPattern: RegExp;
      capitalId: string;
      provinciaId: string;
      term: string;
      displayName: string;
    }> = [
      {
        token: /\b(cordoba|cba)\b/i,
        qualifierPattern: /\b(capital|ciudad|provincia)\b/i,
        capitalId: 'ARG_CORDOBA_CAPITAL',
        provinciaId: 'ARG_PROV_CORDOBA',
        term: 'Córdoba',
        displayName: 'Córdoba'
      },
      {
        token: /\b(santa fe)\b/i,
        qualifierPattern: /\b(capital|ciudad|provincia)\b/i,
        capitalId: 'ARG_SANTA_FE_CAPITAL',
        provinciaId: 'ARG_PROV_SANTA_FE',
        term: 'Santa Fe',
        displayName: 'Santa Fe'
      },
      {
        token: /\b(mendoza)\b/i,
        qualifierPattern: /\b(capital|ciudad|provincia)\b/i,
        capitalId: 'ARG_MENDOZA_CAPITAL',
        provinciaId: 'ARG_PROV_MENDOZA',
        term: 'Mendoza',
        displayName: 'Mendoza'
      },
      {
        token: /\b(san juan)\b/i,
        qualifierPattern: /\b(capital|ciudad|provincia)\b/i,
        capitalId: 'ARG_SAN_JUAN_CAPITAL',
        provinciaId: 'ARG_PROV_SAN_JUAN',
        term: 'San Juan',
        displayName: 'San Juan'
      },
      {
        token: /\b(buenos aires|bs as|bsas)\b/i,
        qualifierPattern: /\b(capital|caba|provincia|pba)\b/i,
        capitalId: 'ARG_CABA',
        provinciaId: 'ARG_PROV_BUENOS_AIRES',
        term: 'Buenos Aires',
        displayName: 'Buenos Aires'
      }
    ];

    for (const m of ambiguityModels) {
      if (m.token.test(norm)) {
        // If the query lacks "capital", "ciudad", or "provincia", it is ambiguous
        if (!m.qualifierPattern.test(norm)) {
          return {
            is_ambiguous: true,
            detected_term: m.term,
            prompt: `¿Dónde querés buscar? [ Ciudad de ${m.displayName} ] [ Provincia de ${m.displayName} ]`,
            candidates: [m.capitalId, m.provinciaId]
          };
        }
      }
    }

    return { is_ambiguous: false };
  }

  /**
   * Data-Driven Canonical Geography Resolution
   * Matches geography_id, canonical_name, display_name, or normalized aliases
   */
  public resolveCanonicalGeography(
    input?: string | null,
    options?: { defaultToNational?: boolean }
  ): CanonicalGeography | null {
    if (!input || !input.trim()) {
      return options?.defaultToNational ? (this.geographies.get('ARG_NACIONAL') || null) : null;
    }

    const raw = input.trim();
    const norm = this.normalize(raw);

    // 1. Direct geography_id match
    const directMatch = this.geographies.get(raw) || this.geographies.get(norm.toUpperCase());
    if (directMatch) return directMatch;

    for (const [id, geo] of this.geographies.entries()) {
      if (id.toLowerCase() === norm) return geo;
    }

    // 2. Exact match against display_name, canonical_name
    for (const geo of this.geographies.values()) {
      if (this.normalize(geo.display_name) === norm || this.normalize(geo.canonical_name) === norm) {
        return geo;
      }
    }

    // 3. Length-sorted alias matching (Longest alias first to avoid premature partial matches)
    const allAliases: Array<{ aliasNorm: string; geo: CanonicalGeography; isExact: boolean }> = [];
    for (const geo of this.geographies.values()) {
      for (const alias of geo.normalized_aliases) {
        if (!alias) continue;
        allAliases.push({
          aliasNorm: alias,
          geo,
          isExact: alias === norm
        });
      }
    }

    // Exact alias match first
    const exact = allAliases.find(a => a.isExact);
    if (exact) return exact.geo;

    // Substring alias match: sort descending by length
    allAliases.sort((a, b) => b.aliasNorm.length - a.aliasNorm.length);

    // Clean input search string: remove leading prepositions
    const cleanSearch = norm.replace(/^(?:en|de|para|desde)\s+/i, '');

    for (const item of allAliases) {
      if (item.aliasNorm.length >= 3) {
        const wordBoundary = new RegExp(`\\b${item.aliasNorm}\\b`, 'i');
        if (wordBoundary.test(cleanSearch) || wordBoundary.test(norm)) {
          return item.geo;
        }
      }
    }

    // 4. Default fallback if requested
    if (options?.defaultToNational) {
      return this.geographies.get('ARG_NACIONAL') || null;
    }

    return null;
  }

  /**
   * Text + Selector Unification with Contradiction Gate
   */
  public unifyGeographyIntent(
    textObjective: string,
    selectorGeography?: string | null
  ): UnifiedGeographyResult {
    const textGeo = this.resolveCanonicalGeography(textObjective);
    const selectorGeo = selectorGeography ? this.resolveCanonicalGeography(selectorGeography) : null;

    // Check ambiguity on text if not clarified by selector
    const ambiguityCheck = this.detectAmbiguity(textObjective, selectorGeo?.geography_id);
    if (ambiguityCheck.is_ambiguous && (!selectorGeo || selectorGeo.geography_id === 'ARG_NACIONAL')) {
      return {
        pass: false,
        canonicalGeo: null,
        conflict: false,
        ambiguity: true,
        prompt: ambiguityCheck.prompt,
        candidates: ambiguityCheck.candidates,
        reason: `Ambiguous geography '${ambiguityCheck.detected_term}'. Clarification required between capital and province.`
      };
    }

    // Case 1: Both empty
    if (!textGeo && !selectorGeo) {
      const national = this.geographies.get('ARG_NACIONAL') || null;
      return { pass: true, canonicalGeo: national, conflict: false, ambiguity: false };
    }

    // Case 2: Only selector specified
    if (!textGeo && selectorGeo) {
      return { pass: true, canonicalGeo: selectorGeo, conflict: false, ambiguity: false };
    }

    // Case 3: Only text specified (selector is empty or default ARG_NACIONAL)
    if (textGeo && (!selectorGeo || selectorGeo.geography_id === 'ARG_NACIONAL')) {
      return { pass: true, canonicalGeo: textGeo, conflict: false, ambiguity: false };
    }

    // Case 4: Both specified -> check agreement or conflict
    if (textGeo && selectorGeo) {
      // Exact agreement
      if (textGeo.geography_id === selectorGeo.geography_id) {
        return { pass: true, canonicalGeo: textGeo, conflict: false, ambiguity: false };
      }

      // Hierarchy compatibility (e.g. text mentions Salta Capital and selector is Salta Province or vice versa)
      if (textGeo.parent_geography_id === selectorGeo.geography_id || selectorGeo.parent_geography_id === textGeo.geography_id) {
        // More specific one wins (municipality over province)
        const moreSpecific = textGeo.admin_level === 'MUNICIPALITY' ? textGeo : selectorGeo;
        return { pass: true, canonicalGeo: moreSpecific, conflict: false, ambiguity: false };
      }

      // Explicit CONTRADICTION! (e.g. text says "en Salta" but selector says "ARG_CABA")
      return {
        pass: false,
        canonicalGeo: null,
        conflict: true,
        ambiguity: false,
        prompt: `Conflicto de geografía: el texto indica "${textGeo.display_name}" pero el selector indica "${selectorGeo.display_name}". Por favor confirma la ubicación deseada.`,
        candidates: [textGeo.geography_id, selectorGeo.geography_id],
        reason: `GEOGRAPHY_CONFLICT: Text specifies '${textGeo.display_name}' while selector specifies '${selectorGeo.display_name}'`
      };
    }

    const fallbackNational = this.geographies.get('ARG_NACIONAL') || null;
    return { pass: true, canonicalGeo: fallbackNational, conflict: false, ambiguity: false };
  }

  /**
   * Generic Candidate Geography Gate: Validates candidate coordinates and attributes against requested jurisdiction
   */
  public validateCandidateJurisdiction(
    geo: CanonicalGeography,
    candidate: {
      latitude?: number | string | null;
      longitude?: number | string | null;
      address?: string | null;
      city?: string | null;
      province?: string | null;
    }
  ): { pass: boolean; reason?: string } {
    if (geo.geography_id === 'ARG_NACIONAL') {
      return { pass: true };
    }

    // 1. Coordinate spatial check
    const lat = candidate.latitude !== null && candidate.latitude !== undefined ? Number(candidate.latitude) : null;
    const lon = candidate.longitude !== null && candidate.longitude !== undefined ? Number(candidate.longitude) : null;

    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
      const { south, north, west, east } = geo.bbox;
      // Tolerance envelope: 0.05 deg for municipalities (~5km), 0.1 deg for provinces (~10km)
      const margin = geo.admin_level === 'PROVINCE' ? 0.10 : 0.05;
      const inLat = lat >= (south - margin) && lat <= (north + margin);
      const inLon = lon >= (west - margin) && lon <= (east + margin);

      if (!inLat || !inLon) {
        return {
          pass: false,
          reason: `COORDINATE_OUTSIDE_JURISDICTION: Point (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside ${geo.canonical_name} bounding box (${south},${west},${north},${east})`
        };
      }
    }

    // 2. Generic administrative province & city conflict check
    const candProvNorm = this.normalize(candidate.province || '');
    const candCityNorm = this.normalize(candidate.city || '');
    const candAddrNorm = this.normalize(candidate.address || '');

    if (geo.province) {
      const targetProvNorm = this.normalize(geo.province);

      // Collect other provinces from the registry
      const otherProvinces = Array.from(this.geographies.values())
        .filter(g => g.admin_level === 'PROVINCE' || g.admin_level === 'CITY_PROVINCE')
        .map(g => ({
          nameNorm: this.normalize(g.province || g.display_name),
          aliases: g.normalized_aliases,
          disp: g.display_name
        }))
        .filter(p => p.nameNorm !== targetProvNorm && !targetProvNorm.includes(p.nameNorm));

      // RULE A: If candidate has explicit administrative province or city matching a DIFFERENT province, reject immediately!
      for (const op of otherProvinces) {
        const matchesOtherAdmin = (
          (candProvNorm && (candProvNorm === op.nameNorm || op.aliases.some(a => candProvNorm.includes(a)))) ||
          (candCityNorm && (candCityNorm === op.nameNorm || op.aliases.some(a => candCityNorm.includes(a))))
        );

        if (matchesOtherAdmin && !candProvNorm.includes(targetProvNorm) && !candCityNorm.includes(targetProvNorm)) {
          return {
            pass: false,
            reason: `CROSS_JURISDICTION_CONFLICT: Candidate administrative jurisdiction is '${candidate.province || candidate.city}' while mission requested '${geo.canonical_name}'`
          };
        }
      }

      // RULE B: If candidate has NO coordinates, administrative city or province MUST match target jurisdiction
      if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
        const isCaba = geo.geography_id === 'ARG_CABA';
        const matchesCaba = isCaba && (
          candProvNorm.includes('buenos aires') ||
          candProvNorm.includes('caba') ||
          candProvNorm.includes('capital federal') ||
          candCityNorm.includes('buenos aires') ||
          candCityNorm.includes('caba') ||
          candCityNorm.includes('capital federal')
        );
        const hasTargetProv = candProvNorm.includes(targetProvNorm) || candCityNorm.includes(targetProvNorm) || matchesCaba;
        if (!hasTargetProv) {
          return {
            pass: false,
            reason: `NO_COORDINATES_AND_NO_ADMIN_MATCH: Candidate lacks coordinates and administrative jurisdiction '${candidate.city || candidate.province || 'EMPTY'}' does not match '${geo.province}'`
          };
        }
      }
    }

    return { pass: true };
  }
}
