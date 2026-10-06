/**
 * ATLAS SOURCE SUITABILITY GATE & PROBE V1
 * @server/services/industrial/SourceSuitabilityGate.ts
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - Source selection happens ONLY AFTER Universal Semantic Spec is known.
 * - Compares MISSION REQUIREMENT vs SOURCE CAPABILITY.
 * - Calculates ENTITY_FIT, CATEGORY_FIT, RELATION_FIT, PRODUCT_FIT, GEOGRAPHY_FIT, EVIDENCE_CAPABILITY.
 * - Suitability classification: STRONG | SUPPORTED | WEAK | REJECTED.
 * - Only STRONG and SUPPORTED may feed acquisition.
 * - SOURCE PROBE: Runs probe on <= 20 candidates and checks MISSION_FIT_RATE before scaling.
 * - UNKNOWN != PASS. WEAK != PASS.
 */

import fs from 'fs';
import path from 'path';
import type { UniversalSemanticSpec, EvidenceStrength } from './UniversalSemanticResolver.ts';
import { RoleEvidenceGate } from '../../../src/lib/atlasIntelligence/RoleEvidenceGate.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';

export interface SourceCapabilityDeclaration {
  source_id: string;
  source_name: string;
  source_url: string;
  source_class: 'OPEN_DATA' | 'OFFICIAL_REGISTRY' | 'GOVERNMENT_PORTAL';
  
  entity_types_supported: string[];
  categories_supported: string[];
  relations_supported: string[];
  products_supported: string[];
  geographies_supported: string[];
  evidence_types_supported: string[];
  evidence_strength: EvidenceStrength;
  
  filename: string;
  parser_type: 'CSV' | 'JSON' | 'GEOJSON';
}

export interface SourceSuitabilityScore {
  source_id: string;
  source_name: string;
  entity_fit: number;
  category_fit: number;
  relation_fit: number;
  product_fit: number;
  geography_fit: number;
  evidence_capability: number;
  overall_score: number;
  suitability: 'STRONG' | 'SUPPORTED' | 'WEAK' | 'REJECTED';
  rejection_reason?: string;
}

export interface SourceProbeResult {
  source_id: string;
  probed_count: number;
  valid_count: number;
  rejected_count: number;
  mission_fit_rate: number;
  pass_probe: boolean;
  probe_reason: string;
  candidates_sample: any[];
}

export class SourceSuitabilityGate {
  private static instance: SourceSuitabilityGate;
  private registry: Map<string, SourceCapabilityDeclaration> = new Map();

  private constructor() {
    this.registerDeclaredSources();
  }

  public static getInstance(): SourceSuitabilityGate {
    if (!this.instance) {
      this.instance = new SourceSuitabilityGate();
    }
    return this.instance;
  }

  private registerDeclaredSources(): void {
    // 1. REFAR (Farmacias Oficiales SISA MinSalud)
    this.registry.set('SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS', {
      source_id: 'SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS',
      source_name: 'Registro Federal de Establecimientos de Salud (REFAR / MinSalud)',
      source_url: 'https://sisa.msal.gov.ar/sisa/#sisa',
      source_class: 'OFFICIAL_REGISTRY',
      entity_types_supported: ['ESTABLISHMENT', 'COMPANY'],
      categories_supported: ['PHARMACY', 'HEALTH'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SELLER'],
      products_supported: ['MEDICAMENTOS', 'SALUD'],
      geographies_supported: ['ARG / BUENOS AIRES', 'ARG / CABA'],
      evidence_types_supported: ['ESTABLISHMENT_IDENTITY', 'PHARMACY_ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'],
      evidence_strength: 'EXPLICIT',
      filename: 'refar_establecimientos_farmacias.csv',
      parser_type: 'CSV'
    });

    // 2. IDECOR (Veterinarias Habilitadas Córdoba)
    this.registry.set('SRC_IDECOR_STOCK_VETERINARIA', {
      source_id: 'SRC_IDECOR_STOCK_VETERINARIA',
      source_name: 'Registro Oficial de Establecimientos Veterinarios y Zooterápicos (IDECOR / MinGanadería Córdoba)',
      source_url: 'https://idecor.cba.gov.ar/geoserver/idecor/wfs',
      source_class: 'OFFICIAL_REGISTRY',
      entity_types_supported: ['ESTABLISHMENT', 'COMPANY'],
      categories_supported: ['VETERINARY', 'ZOOTERAPICOS'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SERVICE_PROVIDER'],
      products_supported: ['ZOOTERAPICOS', 'MEDICAMENTOS_VETERINARIOS'],
      geographies_supported: ['ARG / CORDOBA'],
      evidence_types_supported: ['ESTABLISHMENT_IDENTITY', 'VETERINARY_ACTIVITY_EVIDENCE', 'GEOGRAPHY_EVIDENCE'],
      evidence_strength: 'EXPLICIT',
      filename: 'cordoba_veterinarias_idecor.json',
      parser_type: 'GEOJSON'
    });

    // 3. CAFABYT (Fabricantes Industriales de Bulones, Tornillos y Tuercas ADIMRA)
    this.registry.set('SRC_CAFABYT_FABRICANTES_BULONES', {
      source_id: 'SRC_CAFABYT_FABRICANTES_BULONES',
      source_name: 'Cámara de Fabricantes de Bulones, Tornillos, Tuercas y Afines (CAFABYT / ADIMRA)',
      source_url: 'https://cafabyt.com.ar/empresas/',
      source_class: 'OFFICIAL_REGISTRY',
      entity_types_supported: ['COMPANY'],
      categories_supported: ['FASTENERS_MANUFACTURING', 'METALURGICA'],
      relations_supported: ['MANUFACTURER'],
      products_supported: ['BULONES', 'TORNILLOS', 'TUERCAS', 'FIJACIONES'],
      geographies_supported: ['ARG / NACIONAL', 'ARG / BUENOS AIRES', 'ARG / SANTA FE', 'ARG / CORDOBA'],
      evidence_types_supported: ['COMPANY_IDENTITY', 'MANUFACTURING_EVIDENCE', 'BULON_PRODUCT_EVIDENCE'],
      evidence_strength: 'EXPLICIT',
      filename: 'cafabyt_fabricantes_bulones.json',
      parser_type: 'JSON'
    });

    // 4. SIPRO MUEBLES (Fabricantes de Mobiliario Verificados)
    this.registry.set('SRC_SIPRO_MUEBLES_FABRICANTES', {
      source_id: 'SRC_SIPRO_MUEBLES_FABRICANTES',
      source_name: 'Registro Oficial de Fabricantes de Muebles y Madera (SIPRO)',
      source_url: 'https://datos.gob.ar/dataset/modernizacion-proveedores-del-estado-sipro',
      source_class: 'OPEN_DATA',
      entity_types_supported: ['COMPANY'],
      categories_supported: ['FURNITURE_MANUFACTURING', 'MADERA'],
      relations_supported: ['MANUFACTURER'],
      products_supported: ['MUEBLES', 'CARPINTERIA', 'MADERA'],
      geographies_supported: ['ARG / NACIONAL', 'ARG / BUENOS AIRES'],
      evidence_types_supported: ['COMPANY_IDENTITY', 'MANUFACTURING_EVIDENCE', 'FURNITURE_PRODUCT_EVIDENCE'],
      evidence_strength: 'SUPPORTED',
      filename: 'sipro_proveedores.csv',
      parser_type: 'CSV'
    });

    // 5. BA GASTRO (Locales Gastronómicos Habilitados GCBA)
    this.registry.set('SRC_BA_GASTRO_ESTABLECIMIENTOS', {
      source_id: 'SRC_BA_GASTRO_ESTABLECIMIENTOS',
      source_name: 'Registro Oficial de Establecimientos Gastronómicos Habilitados GCBA',
      source_url: 'https://data.buenosaires.gob.ar/dataset/establecimientos-gastronomicos',
      source_class: 'OPEN_DATA',
      entity_types_supported: ['ESTABLISHMENT'],
      categories_supported: ['GASTRONOMY', 'ALIMENTOS'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SELLER'],
      products_supported: ['ALIMENTOS', 'GASTRONOMIA'],
      geographies_supported: ['ARG / CABA', 'ARG / BUENOS AIRES'],
      evidence_types_supported: ['ESTABLISHMENT_IDENTITY', 'GASTRONOMY_EVIDENCE'],
      evidence_strength: 'EXPLICIT',
      filename: 'ba_establecimientos_gastronomicos.csv',
      parser_type: 'CSV'
    });

    // 6. GCBA PRENSA (Periodistas de Redacción y Cobertura Pública)
    this.registry.set('SRC_GCBA_PRENSA_PERIODISTAS', {
      source_id: 'SRC_GCBA_PRENSA_PERIODISTAS',
      source_name: 'Nómina Oficial de Redacción y Divulgación Periodística',
      source_url: 'https://datos.gob.ar/dataset/modernizacion-autoridades-prensa',
      source_class: 'OPEN_DATA',
      entity_types_supported: ['PERSON'],
      categories_supported: ['JOURNALISM_ECONOMICS', 'PRENSA'],
      relations_supported: ['MEDIA_ROLE'],
      products_supported: ['PRENSA', 'DIVULGACION'],
      geographies_supported: ['ARG / CABA', 'ARG / BUENOS AIRES', 'ARG / NACIONAL'],
      evidence_types_supported: ['PERSON_IDENTITY', 'JOURNALISM_EVIDENCE'],
      evidence_strength: 'SUPPORTED',
      filename: 'gcba_autoridades_2026.csv',
      parser_type: 'CSV'
    });

    // 7. BA ALOJAMIENTOS EMAIL (Contactos Públicos Autorizados)
    this.registry.set('SRC_BA_ALOJAMIENTOS_PUBLIC_EMAIL', {
      source_id: 'SRC_BA_ALOJAMIENTOS_PUBLIC_EMAIL',
      source_name: 'Directorio Oficial de Empresas Registradas con Email Público GCBA',
      source_url: 'https://data.buenosaires.gob.ar/dataset/alojamientos-turisticos',
      source_class: 'OPEN_DATA',
      entity_types_supported: ['COMPANY', 'CONTACT'],
      categories_supported: ['PUBLIC_EMAIL_CONTACT', 'ALOJAMIENTO'],
      relations_supported: ['GENERAL_ENTITY'],
      products_supported: [],
      geographies_supported: ['ARG / CABA', 'ARG / BUENOS AIRES', 'ARG / NACIONAL'],
      evidence_types_supported: ['PUBLIC_EMAIL_EVIDENCE', 'COMPANY_IDENTITY'],
      evidence_strength: 'EXPLICIT',
      filename: 'ba_alojamientos_turisticos.csv',
      parser_type: 'CSV'
    });

    // 8. OVERPASS OSM (Directorio Público Abierto de Comercios y Establecimientos)
    this.registry.set('SRC_OSM_PUBLIC_ESTABLISHMENTS', {
      source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
      source_name: 'Directorio Público Abierto de Comercios y Establecimientos (OSM / Overpass Registry)',
      source_url: 'https://overpass-api.de/api/interpreter',
      source_class: 'OPEN_DATA',
      entity_types_supported: ['ESTABLISHMENT', 'COMPANY', 'ORGANIZATION'],
      categories_supported: ['PERSONAL_CARE_SERVICE', 'HAIR_SALON'],
      relations_supported: ['ESTABLISHMENT_SERVICE', 'SERVICE_PROVIDER'],
      products_supported: [],
      geographies_supported: ['ARG / CABA', 'ARG / BUENOS AIRES', 'ARG / CORDOBA', 'ARG / NACIONAL'],
      evidence_types_supported: ['ESTABLISHMENT_IDENTITY', 'PERSONAL_CARE_SERVICE_ESTABLISHMENT_SERVICE_EVIDENCE', 'GEOGRAPHY_EVIDENCE'],
      evidence_strength: 'EXPLICIT',
      filename: 'osm_public_establishments.json',
      parser_type: 'JSON'
    });
  }

  private memoryCache = new Map<string, any[]>();

  public registerLearnedCapability(sourceId: string, category: string, relation: string, candidates?: any[]) {
    const decl = this.registry.get(sourceId);
    if (decl) {
      if (!decl.categories_supported.includes(category)) {
        decl.categories_supported.push(category);
      }
      if (!decl.relations_supported.includes(relation)) {
        decl.relations_supported.push(relation);
      }
      if (candidates && candidates.length > 0) {
        this.memoryCache.set(`${sourceId}:${category}`, candidates);
      }
    }
  }

  /**
   * Evaluates suitability of all registered sources for a given UniversalSemanticSpec
   */
  public evaluateSuitability(spec: UniversalSemanticSpec): SourceSuitabilityScore[] {
    const scores: SourceSuitabilityScore[] = [];

    for (const source of this.registry.values()) {
      // 1. ENTITY_FIT
      const entityMatch = source.entity_types_supported.includes(spec.row_unit) ||
        source.entity_types_supported.includes(spec.entity_type);
      const entity_fit = entityMatch ? 1.0 : 0.0;

      // 2. CATEGORY_FIT
      let category_fit = 0.0;
      const qualifiers = Array.isArray(spec.qualifiers) ? spec.qualifiers : [];
      if (source.categories_supported.includes(spec.category)) {
        category_fit = 1.0;
      } else if (source.categories_supported.some(c => qualifiers.map(q => q.toUpperCase()).includes(c))) {
        category_fit = 0.7;
      }

      // 3. RELATION_FIT
      const specRelation = spec.relation || (spec as any).relation_type;
      let relation_fit = 0.0;
      if (source.relations_supported.includes(specRelation)) {
        relation_fit = 1.0;
      } else if (specRelation === 'GENERAL_ENTITY' || source.relations_supported.includes('GENERAL_ENTITY')) {
        relation_fit = 0.5;
      }

      // 4. PRODUCT_FIT
      let product_fit = 0.5; // neutral if mission doesn't specify product
      if (spec.product) {
        if (source.products_supported.includes(spec.product)) {
          product_fit = 1.0;
        } else if (source.products_supported.length === 0) {
          product_fit = 0.2;
        } else {
          product_fit = 0.0;
        }
      }

      // 5. GEOGRAPHY_FIT
      let geography_fit = 0.5; // neutral if no geography specified
      if (spec.geography) {
        const specGeo = spec.geography.toUpperCase();
        if (source.geographies_supported.some(g => specGeo.includes(g) || g.includes(specGeo) || g === 'ARG / NACIONAL')) {
          geography_fit = 1.0;
        } else {
          geography_fit = 0.1;
        }
      }

      // 6. EVIDENCE_CAPABILITY
      const requiredTypes: string[] = Array.isArray(spec.required_evidence)
        ? spec.required_evidence
        : (Array.isArray(spec.required_evidence?.required_evidence_types)
          ? spec.required_evidence.required_evidence_types
          : []);
      let matchedEvidence = 0;
      for (const req of requiredTypes) {
        if (source.evidence_types_supported.some(sup => sup.includes(req) || req.includes(sup) || (sup.includes('IDENTITY') && req.includes('IDENTITY')))) {
          matchedEvidence++;
        }
      }
      const evidence_capability = requiredTypes.length > 0 ? (matchedEvidence / requiredTypes.length) : 0.5;

      // Overall Score calculation (weighted)
      // If entity_fit or category_fit is 0, score cannot be strong
      const overall_score = (
        entity_fit * 0.25 +
        category_fit * 0.30 +
        relation_fit * 0.20 +
        product_fit * 0.10 +
        geography_fit * 0.05 +
        evidence_capability * 0.10
      );

      let suitability: 'STRONG' | 'SUPPORTED' | 'WEAK' | 'REJECTED' = 'REJECTED';
      let rejection_reason: string | undefined;

      if (entity_fit < 0.5) {
        suitability = 'REJECTED';
        rejection_reason = `La fuente soporta [${source.entity_types_supported.join(', ')}] pero la misión exige [${spec.row_unit}].`;
      } else if (category_fit < 0.5) {
        suitability = 'REJECTED';
        rejection_reason = `La fuente no cubre la categoría [${spec.category}].`;
      } else if (relation_fit < 0.5) {
        suitability = 'REJECTED';
        rejection_reason = `La fuente no certifica la relación [${specRelation}].`;
      } else if (spec.product && product_fit < 0.5) {
        suitability = 'REJECTED';
        rejection_reason = `La fuente no provee evidencia sobre el producto [${spec.product}].`;
      } else if (evidence_capability < 0.60) {
        suitability = 'REJECTED';
        rejection_reason = `La fuente no tiene capacidad para aportar la evidencia requerida: [${requiredTypes.join(', ')}].`;
      } else if (overall_score >= 0.80) {
        suitability = 'STRONG';
      } else if (overall_score >= 0.60) {
        suitability = 'SUPPORTED';
      } else if (overall_score >= 0.35) {
        suitability = 'WEAK';
        rejection_reason = 'Calidad y cobertura de evidencia insuficiente para los estándares constitucionales.';
      } else {
        suitability = 'REJECTED';
        rejection_reason = 'Puntaje de adecuación semántica insuficiente.';
      }

      scores.push({
        source_id: source.source_id,
        source_name: source.source_name,
        entity_fit,
        category_fit,
        relation_fit,
        product_fit,
        geography_fit,
        evidence_capability,
        overall_score,
        suitability,
        rejection_reason
      });
    }

    // Sort by overall_score descending
    return scores.sort((a, b) => b.overall_score - a.overall_score);
  }

  /**
   * PROBE GATE: Reads <= 20 candidates and verifies against Negative Semantics & Evidence Requirements
   */
  public probeSource(sourceId: string, spec: UniversalSemanticSpec, maxProbe: number = 20): SourceProbeResult {
    const declaration = this.registry.get(sourceId);
    if (!declaration) {
      return {
        source_id: sourceId,
        probed_count: 0,
        valid_count: 0,
        rejected_count: 0,
        mission_fit_rate: 0.0,
        pass_probe: false,
        probe_reason: 'SOURCE_NOT_REGISTERED',
        candidates_sample: []
      };
    }

    const cacheKey = `${sourceId}:${spec.category}`;
    const fullPath = path.join(process.cwd(), 'scratch', 'physical_sources', declaration.filename);
    if (!this.memoryCache.has(cacheKey) && !fs.existsSync(fullPath)) {
      return {
        source_id: sourceId,
        probed_count: 0,
        valid_count: 0,
        rejected_count: 0,
        mission_fit_rate: 0.0,
        pass_probe: false,
        probe_reason: `PHYSICAL_FILE_MISSING: ${declaration.filename}`,
        candidates_sample: []
      };
    }

    const effectiveProbe = Math.min(20, maxProbe);
    const rawCandidates = this.readCandidatesFromPhysicalSource(declaration, effectiveProbe, spec);
    const probed = rawCandidates.slice(0, effectiveProbe);

    let valid_count = 0;
    let rejected_count = 0;
    const candidates_sample: any[] = [];
    const roleGate = RoleEvidenceGate.getInstance();

    for (const candidate of probed) {
      const passesNegative = this.checkNegativeSemantics(candidate, spec);
      const passesEvidence = this.checkEvidenceRequirements(candidate, spec);

      let isCertifiable = false;
      if (passesNegative && passesEvidence) {
        const evalRes = roleGate.evaluate({
          requested_role: candidate.role || spec.relation,
          target_sector: spec.category,
          entity_type: spec.entity_type,
          entity_name: candidate.company_name,
          source: declaration.source_name,
          evidence: candidate.evidence || { address: candidate.address, cuit: candidate.cuit },
          category: candidate.category || spec.category,
          rubros: candidate.rubros,
          description: candidate.description || candidate.product_name
        });
        isCertifiable = evalRes.decision === 'PASS';
      }

      let passesGeography = true;
      if (spec.geography) {
        const geoGate = AtlasGeographyRegistry.getInstance().validateCandidateJurisdiction(candidate, spec.geography);
        passesGeography = geoGate.valid;
      }

      if (passesNegative && passesEvidence && isCertifiable && passesGeography) {
        valid_count++;
        candidates_sample.push({
          ...candidate,
          evidence_strength: 'EXPLICIT',
          mission_fit: true
        });
      } else {
        rejected_count++;
      }
    }

    const fit_rate = probed.length > 0 ? (valid_count / probed.length) : 0.0;
    const pass_probe = fit_rate >= 0.20 && valid_count > 0;

    return {
      source_id: sourceId,
      probed_count: probed.length,
      valid_count,
      rejected_count,
      mission_fit_rate: Number(fit_rate.toFixed(2)),
      pass_probe,
      probe_reason: pass_probe ? 'PROBE_PASSED_HIGH_FIT' : (valid_count === 0 ? 'SOURCE_REJECTED_ZERO_YIELD_OR_UNCERTIFIABLE' : `CERTIFIABLE_FIT_LOW: ${fit_rate}`),
      candidates_sample
    };
  }

  /**
   * Physical source candidates reader
   */
  public readCandidatesFromPhysicalSource(
    declaration: SourceCapabilityDeclaration,
    limit: number,
    spec: UniversalSemanticSpec
  ): any[] {
    const cacheKey = `${declaration.source_id}:${spec.category}`;
    if (this.memoryCache.has(cacheKey)) {
      return (this.memoryCache.get(cacheKey) || []).slice(0, limit);
    }

    const fullPath = path.join(process.cwd(), 'scratch', 'physical_sources', declaration.filename);
    const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '[]';
    const results: any[] = [];

    if (declaration.source_id === 'SRC_OSM_PUBLIC_ESTABLISHMENTS') {
      const data = JSON.parse(content);
      for (const item of data) {
        if (results.length >= limit) break;
        results.push({
          company_name: item.company_name,
          product_name: item.product_name,
          category: item.category,
          role: item.role,
          relation_type: item.relation_type,
          cuit: item.cuit,
          province: item.province,
          city: item.city,
          address: item.address,
          domain: item.domain,
          phone: item.phone,
          email: item.email,
          source_name: declaration.source_name,
          source_url: declaration.source_url,
          entity_type: 'ORGANIZATION',
          row_unit: 'ESTABLISHMENT',
          evidence: item.evidence
        });
      }
      return results;
    }

    if (declaration.source_id === 'SRC_CAFABYT_FABRICANTES_BULONES') {
      const data = JSON.parse(content);
      for (const item of data) {
        if (results.length >= limit) break;
        results.push({
          company_name: item.company_name,
          product_name: item.product_name,
          category: item.category,
          role: item.role,
          relation_type: item.relation_type,
          cuit: item.cuit,
          province: item.province,
          city: item.city,
          address: item.address,
          domain: item.website ? item.website.replace(/^https?:\/\//, '') : null,
          website: item.website,
          source_name: declaration.source_name,
          source_url: declaration.source_url,
          entity_type: 'COMPANY',
          row_unit: 'COMPANY'
        });
      }
      return results;
    }

    if (declaration.source_id === 'SRC_IDECOR_STOCK_VETERINARIA') {
      const geo = JSON.parse(content);
      const features = geo.features || [];
      for (const f of features) {
        if (results.length >= limit) break;
        const p = f.properties || {};
        if (!p.nombre_est || p.nombre_est.length < 2) continue;

        const regId = `IDECOR-VET-${p.id || f.id || results.length + 1}`;
        results.push({
          company_name: p.nombre_est.trim(),
          product_name: `Atención Veterinaria y Dispensación de Zooterápicos — ${p.nombre_est}`,
          category: 'Establecimiento Veterinario Habilitado',
          role: 'Establecimiento Veterinario',
          relation_type: 'SERVICE_PROVIDER',
          cuit: regId,
          province: 'Córdoba',
          city: p.localidad_?.trim() || 'Córdoba',
          address: p.domicilio_?.trim() || 'Córdoba',
          phone: p.telefono_e || p.celular_es || null,
          email: p.correo_est?.includes('@') ? p.correo_est.trim() : null,
          public_email: p.correo_est?.includes('@') ? p.correo_est.trim() : null,
          domain: null,
          source_name: declaration.source_name,
          source_url: declaration.source_url,
          entity_type: 'ORGANIZATION',
          row_unit: 'ESTABLISHMENT'
        });
      }
      return results;
    }

    if (declaration.source_id === 'SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS') {
      const lines = content.split(/\r?\n/).filter(Boolean);
      const geoLower = (spec.geography || '').toLowerCase();
      let targetProvinces = ['CABA'];
      if (geoLower.includes('provincia') || geoLower.includes('pba')) {
        targetProvinces = ['BUENOS AIRES'];
      } else if (geoLower.includes('ambas') || (geoLower.includes('buenos aires') && !geoLower.includes('caba'))) {
        targetProvinces = ['CABA', 'BUENOS AIRES'];
      } else if (geoLower.includes('caba') || geoLower.includes('capital')) {
        targetProvinces = ['CABA'];
      }

      for (let i = 1; i < lines.length; i++) {
        if (results.length >= limit) break;
        const line = lines[i];
        if (!line) continue;

        const cols: string[] = [];
        let inQuotes = false;
        let current = '';
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            cols.push(current);
            current = '';
          } else current += char;
        }
        cols.push(current);

        const prov = (cols[5] || '').toUpperCase().replace(/"/g, '').trim();
        if (targetProvinces.includes(prov)) {
          const id = (cols[0] || '').replace(/"/g, '').trim();
          const nombre = (cols[1] || '').replace(/"/g, '').trim();
          const localidad = (cols[3] || '').replace(/"/g, '').trim();
          const domicilio = (cols[15] || '').replace(/"/g, '').trim();
          const sitio_web = (cols[16] || '').replace(/"/g, '').trim();

          const isCaba = prov === 'CABA';
          const provDisplay = isCaba ? 'Ciudad Autónoma de Buenos Aires' : 'Provincia de Buenos Aires';
          const cityDisplay = localidad || (isCaba ? 'CABA' : 'Buenos Aires');

          results.push({
            company_name: nombre,
            product_name: `Dispensación de Medicamentos y Servicios Farmacéuticos — ${nombre}`,
            category: 'Farmacia / Establecimiento Farmacéutico Habilitado',
            role: 'PHARMACY',
            relation_type: 'ESTABLISHMENT_SERVICE',
            cuit: `REFAR-${id}`,
            province: provDisplay,
            city: cityDisplay,
            address: domicilio || cityDisplay,
            domain: sitio_web || null,
            source_name: declaration.source_name,
            source_url: declaration.source_url,
            entity_type: 'ORGANIZATION',
            row_unit: 'ESTABLISHMENT'
          });
        }
      }
      return results;
    }

    if (declaration.source_id === 'SRC_SIPRO_MUEBLES_FABRICANTES') {
      const lines = content.split(/\r?\n/).filter(Boolean);
      const furnitureMfrRegex = /\b(fabrica|fabricacion|elaborador|carpinteria|maderera|industria maderera|aberturas)\b/i;
      const resellerDisqualifiers = /\b(distribuidor|proveedor del estado|libreria|papelera|supermercado|alquiler|servicios comerciales|digital insumos|consignataria)\b/i;

      for (let i = 1; i < lines.length; i++) {
        if (results.length >= limit) break;
        const line = lines[i];
        const parts = line.split(',');
        const name = parts[1] || '';
        const rubros = parts[6] || '';
        const hasFurnitureRubro = /MUEBLE|CARPINTERIA|MADERA/i.test(rubros);
        const hasMfrProof = furnitureMfrRegex.test(name) && !resellerDisqualifiers.test(name);

        if (hasFurnitureRubro && hasMfrProof) {
          const rawCuit = parts[0]?.trim();
          const formattedCuit = rawCuit.length === 11 
            ? `${rawCuit.slice(0, 2)}-${rawCuit.slice(2, 10)}-${rawCuit.slice(10)}`
            : rawCuit;

          results.push({
            company_name: name.trim(),
            product_name: `Mobiliario y Equipamiento Fabricado en Argentina — ${parts[6]?.split(';')[0] || 'Muebles de Madera y Oficina'}`,
            category: 'Fabricación de Muebles y Producto Industrial',
            role: 'Fabricante de Muebles',
            relation_type: 'MANUFACTURER',
            cuit: formattedCuit,
            province: parts[4]?.trim() || 'Argentina',
            city: parts[3]?.trim() || 'Nacional',
            address: `${parts[3] || ''}, ${parts[4] || ''}`.trim(),
            domain: null,
            source_name: declaration.source_name,
            source_url: declaration.source_url,
            entity_type: 'COMPANY',
            row_unit: 'COMPANY'
          });
        }
      }
      return results;
    }

    return results;
  }

  private checkNegativeSemantics(candidate: any, spec: UniversalSemanticSpec): boolean {
    const textBlob = `${candidate.company_name || ''} ${candidate.role || ''} ${candidate.category || ''} ${candidate.product_name || ''}`.toLowerCase();
    for (const rule of spec.negative_semantics || []) {
      for (const kw of rule.disallowed_keywords || []) {
        if (!kw) continue;
        const kwStr = typeof kw === 'string' ? kw.toLowerCase() : (kw.source || '');
        if (kwStr && textBlob.includes(kwStr)) {
          return false;
        }
      }
      for (const role of rule.disallowed_roles || []) {
        if (!role) continue;
        const rUpper = String(role).toUpperCase();
        if (candidate.role?.toUpperCase().includes(rUpper) || candidate.relation_type?.toUpperCase().includes(rUpper)) {
          return false;
        }
      }
    }
    return true;
  }

  private checkEvidenceRequirements(candidate: any, spec: UniversalSemanticSpec): boolean {
    // 1. Identity according to Row Unit
    if (!candidate.company_name || candidate.company_name.length < 2) return false;
    
    if (spec.row_unit === 'ESTABLISHMENT') {
      const hasEstablishmentIdentity = Boolean(
        (candidate.address && candidate.address.trim().length >= 3) ||
        candidate.osm_id ||
        candidate.evidence?.latitude ||
        candidate.evidence?.osm_node_id ||
        (candidate.cuit && candidate.cuit.length >= 5)
      );
      if (!hasEstablishmentIdentity) return false;
    } else if (spec.row_unit === 'PUBLIC_EMAIL_CONTACT') {
      if (!candidate.email || !candidate.email.includes('@')) return false;
    } else {
      if (!candidate.cuit && !candidate.tax_id) return false;
    }

    // 2. Geography with accent normalization
    if (spec.geography) {
      const geoNormalized = spec.geography.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const candGeo = `${candidate.province || ''} ${candidate.city || ''} ${candidate.address || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (geoNormalized.includes('cordoba') && !candGeo.includes('cordoba')) return false;
      if (geoNormalized.includes('caba') && !candGeo.includes('caba') && !candGeo.includes('autonoma') && !candGeo.includes('buenos aires')) return false;
    }

    // 3. Contact if required
    if (spec.contact_requirements?.email_required && (!candidate.email || !candidate.email.includes('@'))) {
      return false;
    }

    return true;
  }

  public getDeclaration(sourceId: string): SourceCapabilityDeclaration | undefined {
    return this.registry.get(sourceId);
  }
}
