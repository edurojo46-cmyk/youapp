/**
 * ATLAS CONCEPT REGISTRY V1
 * Declarative Semantic Concept Authority
 * 
 * Separates ENGINE CODE from CONCEPT KNOWLEDGE.
 * Concept knowledge is persisted as structured data in public.atlas_concept_registry.
 * 
 * Invariants:
 * - NO hardcoded dictionary of business categories in code.
 * - Knowledge is loaded dynamically from database / SSOT.
 * - Adding a new concept requires NO TypeScript compilation or code modification.
 */

import fs from 'fs';
import path from 'path';
import type pg from 'pg';
import { dbPool } from '../../db.ts';
import type { UniversalRowUnit, UniversalRelationType } from './UniversalSemanticResolver.ts';
import { AtlasConceptIntegrityGate } from './AtlasConceptIntegrityGate.ts';

export interface ConceptNegatives {
  disallowed_roles: string[];
  disallowed_categories: string[];
  disallowed_keywords: string[];
  reason: string;
}

export interface AtlasConceptDefinition {
  concept_id: string;
  canonical_name: string;
  synonyms: string[];
  aliases?: string[];
  entity_types: string[];
  row_units: UniversalRowUnit[];
  default_row_unit: UniversalRowUnit;
  categories: string[];
  activities: string[];
  relations: UniversalRelationType[];
  products: string[];
  services: string[];
  service_display?: string;
  parent_concepts?: string[];
  child_concepts?: string[];
  negative_concepts?: ConceptNegatives;
  required_evidence: string[];
  semantic_features?: Record<string, any>;
  osm_tags?: string[];
  clae_codes?: string[];
  wikidata_ids?: string[];
  other_external_taxonomy_ids?: Record<string, any>;
  source_hints?: string[];
  source_capability_hints?: string[];
  confidence?: number;
  provenance?: string;
  validation_state?: 'VALIDATED' | 'LEARNED' | 'EXPERIMENTAL' | 'REJECTED';
  version?: number;
  learned_at?: string;
  updated_at?: string;
}

export interface ConceptMatchResult {
  concept: AtlasConceptDefinition;
  score: number;
  matchType: 'EXACT_CANONICAL' | 'EXACT_ALIAS' | 'NORMALIZED_PHRASE' | 'STRONG_TOKEN_MATCH' | 'TAXONOMIC_RELATION' | 'STEM_SUPPORT';
  query_token_coverage: number;
  candidate_token_coverage: number;
  stem_only_match: boolean;
  resolution_admissible: boolean;
  match_provenance: string;
}

export const SPANISH_STOP_WORDS = new Set([
  'de', 'en', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'con', 'del', 'al', 'por', 'que', 'sobre', 'a', 'ante', 'bajo',
  'cabe', 'desde', 'hacia', 'hasta', 'sin', 'so', 'tras'
]);

export class AtlasConceptRegistry {
  private static instance: AtlasConceptRegistry;
  private dbPool: pg.Pool | null = dbPool as any;
  private concepts: Map<string, AtlasConceptDefinition> = new Map();
  private isInitialized = false;

  private constructor() {
    this.seedBaselineMemoryConcepts();
  }

  private seedBaselineMemoryConcepts(): void {
    try {
      const candidates = [
        path.resolve('server/data/ontology/bootstrap_concepts.json'),
        path.join(process.cwd(), 'server', 'data', 'ontology', 'bootstrap_concepts.json')
      ];
      for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const list: AtlasConceptDefinition[] = JSON.parse(raw);
          for (const c of list) {
            this.concepts.set(c.concept_id, c);
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[AtlasConceptRegistry] Failed to load bootstrap concepts from disk cache:', e);
    }
  }

  public static getInstance(): AtlasConceptRegistry {
    if (!this.instance) {
      this.instance = new AtlasConceptRegistry();
    }
    return this.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.loadFromDb();
      this.isInitialized = true;
    }
  }

  public setDbPool(pool: pg.Pool): void {
    this.dbPool = pool;
  }

  public async ensureSchema(): Promise<void> {
    if (!this.dbPool) {
      console.warn('[AtlasConceptRegistry] No DB pool configured; using in-memory cache.');
      return;
    }

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_concept_registry (
        concept_id VARCHAR(100) PRIMARY KEY,
        canonical_name VARCHAR(255) NOT NULL,
        synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        entity_types JSONB NOT NULL DEFAULT '["COMPANY"]'::jsonb,
        row_units JSONB NOT NULL DEFAULT '["COMPANY"]'::jsonb,
        default_row_unit VARCHAR(50) NOT NULL DEFAULT 'COMPANY',
        categories JSONB NOT NULL DEFAULT '[]'::jsonb,
        activities JSONB NOT NULL DEFAULT '[]'::jsonb,
        relations JSONB NOT NULL DEFAULT '["GENERAL_ENTITY"]'::jsonb,
        products JSONB NOT NULL DEFAULT '[]'::jsonb,
        services JSONB NOT NULL DEFAULT '[]'::jsonb,
        service_display TEXT,
        parent_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
        child_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
        negative_concepts JSONB NOT NULL DEFAULT '{}'::jsonb,
        required_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
        semantic_features JSONB NOT NULL DEFAULT '{}'::jsonb,
        osm_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        clae_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        wikidata_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        other_external_taxonomy_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
        source_capability_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
        confidence NUMERIC(4,2) NOT NULL DEFAULT 1.00,
        provenance VARCHAR(100) NOT NULL DEFAULT 'OFFICIAL_REGISTRY',
        validation_state VARCHAR(50) NOT NULL DEFAULT 'VALIDATED',
        version INT NOT NULL DEFAULT 1,
        learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_atlas_concept_synonyms ON public.atlas_concept_registry USING gin (synonyms);
      CREATE INDEX IF NOT EXISTS idx_atlas_concept_validation ON public.atlas_concept_registry (validation_state);
      CREATE INDEX IF NOT EXISTS idx_concept_clae ON public.atlas_concept_registry USING gin (clae_codes);
      CREATE INDEX IF NOT EXISTS idx_concept_osm ON public.atlas_concept_registry USING gin (osm_tags);
      CREATE INDEX IF NOT EXISTS idx_concept_wikidata ON public.atlas_concept_registry USING gin (wikidata_ids);
    `);

    // Seed initial concepts from bootstrap data only if DB table is currently empty
    try {
      const existingCheck = await this.dbPool.query('SELECT 1 FROM public.atlas_concept_registry LIMIT 1;');
      if (existingCheck.rows.length === 0) {
        for (const def of this.concepts.values()) {
          const osm = def.osm_tags || (Array.isArray(def.semantic_features?.osm_tags) ? def.semantic_features.osm_tags : []);
          const clae = def.clae_codes || (Array.isArray(def.semantic_features?.clae_codes) ? def.semantic_features.clae_codes : []);
          const wiki = def.wikidata_ids || (Array.isArray(def.semantic_features?.wikidata_ids) ? def.semantic_features.wikidata_ids : []);
          const ext = def.other_external_taxonomy_ids || def.semantic_features?.other_external_taxonomy_ids || {};
          const hints = def.source_hints || def.source_capability_hints || [];

          await this.dbPool.query(`
            INSERT INTO public.atlas_concept_registry (
              concept_id, canonical_name, synonyms, aliases, entity_types, row_units, default_row_unit,
              categories, activities, relations, products, services, service_display,
              parent_concepts, child_concepts, negative_concepts, required_evidence,
              semantic_features, osm_tags, clae_codes, wikidata_ids, other_external_taxonomy_ids,
              source_hints, source_capability_hints, confidence, provenance, validation_state, version,
              learned_at, updated_at
            ) VALUES (
              $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7,
              $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
              $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
              $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb,
              $23::jsonb, $24::jsonb, $25, $26, $27, $28,
              NOW(), NOW()
            )
            ON CONFLICT (concept_id) DO UPDATE SET
              canonical_name = EXCLUDED.canonical_name,
              synonyms = EXCLUDED.synonyms,
              aliases = EXCLUDED.aliases,
              entity_types = EXCLUDED.entity_types,
              row_units = EXCLUDED.row_units,
              default_row_unit = EXCLUDED.default_row_unit,
              categories = EXCLUDED.categories,
              activities = EXCLUDED.activities,
              relations = EXCLUDED.relations,
              products = EXCLUDED.products,
              services = EXCLUDED.services,
              service_display = EXCLUDED.service_display,
              parent_concepts = EXCLUDED.parent_concepts,
              child_concepts = EXCLUDED.child_concepts,
              negative_concepts = EXCLUDED.negative_concepts,
              required_evidence = EXCLUDED.required_evidence,
              semantic_features = EXCLUDED.semantic_features,
              osm_tags = EXCLUDED.osm_tags,
              clae_codes = EXCLUDED.clae_codes,
              wikidata_ids = EXCLUDED.wikidata_ids,
              other_external_taxonomy_ids = EXCLUDED.other_external_taxonomy_ids,
              source_hints = EXCLUDED.source_hints,
              source_capability_hints = EXCLUDED.source_capability_hints,
              confidence = EXCLUDED.confidence,
              provenance = EXCLUDED.provenance,
              validation_state = EXCLUDED.validation_state,
              version = EXCLUDED.version,
              updated_at = NOW();
          `, [
            def.concept_id,
            def.canonical_name,
            JSON.stringify(def.synonyms || []),
            JSON.stringify(def.aliases || []),
            JSON.stringify(def.entity_types || ['COMPANY']),
            JSON.stringify(def.row_units || ['COMPANY']),
            def.default_row_unit || 'COMPANY',
            JSON.stringify(def.categories || [def.concept_id]),
            JSON.stringify(def.activities || []),
            JSON.stringify(def.relations || ['GENERAL_ENTITY']),
            JSON.stringify(def.products || []),
            JSON.stringify(def.services || []),
            def.service_display || null,
            JSON.stringify(def.parent_concepts || []),
            JSON.stringify(def.child_concepts || []),
            JSON.stringify(def.negative_concepts || {}),
            JSON.stringify(def.required_evidence || []),
            JSON.stringify(def.semantic_features || {}),
            JSON.stringify(osm),
            JSON.stringify(clae),
            JSON.stringify(wiki),
            JSON.stringify(ext),
            JSON.stringify(hints),
            JSON.stringify(def.source_capability_hints || []),
            def.confidence !== undefined ? def.confidence : 1.0,
            def.provenance || 'BOOTSTRAP_ONTOLOGY',
            def.validation_state || 'VALIDATED',
            def.version || 1
          ]);
        }
      }
    } catch (err: any) {
      console.warn('[AtlasConceptRegistry] Notice during bootstrap insertion:', err.message);
    }

    // Invariant: Professional and urban domain concepts must be cleanly synced
    try {
      await this.ensureProfessionalConcepts();
      await this.ensureUrbanDomainConcepts();
    } catch (profErr: any) {
      console.warn('[AtlasConceptRegistry] Notice during concepts sync:', profErr.message);
    }

    await this.loadFromDb();
    this.isInitialized = true;
  }

  private async ensureProfessionalConcepts(): Promise<void> {
    const professionalDefinitions: AtlasConceptDefinition[] = [
      {
        concept_id: 'LAWYER',
        canonical_name: 'Abogado / Profesional del Derecho',
        synonyms: ['abogado', 'abogados', 'abogada', 'abogadas', 'letrado', 'letrados', 'letrada', 'letradas', 'abogado matriculado', 'abogados matriculados'],
        aliases: ['abogado', 'abogados'],
        entity_types: ['PERSON'],
        row_units: ['PERSON'],
        default_row_unit: 'PERSON',
        categories: ['LEGAL_PROFESSIONAL', 'PROFESSIONAL_REGISTRY'],
        activities: ['EJERCICIO_PROFESIONAL_DERECHO'],
        relations: ['PROFESSIONAL_PRACTICES_AS_LAWYER'],
        products: [],
        services: ['PATROCINIO_LETRADO', 'LITIGIOS', 'ASESORAMIENTO_JURIDICO'],
        service_display: 'EJERCICIO INDIVIDUAL DE LA ABOGACÍA',
        required_evidence: ['PERSON_IDENTITY', 'PROFESSIONAL_LICENSE', 'BAR_ASSOCIATION_REGISTRY', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      },
      {
        concept_id: 'ACCOUNTANT',
        canonical_name: 'Contador Público / Profesional Contable',
        synonyms: ['contador', 'contadores', 'contadora', 'contadoras', 'contador publico', 'contadores publicos'],
        aliases: ['contador', 'contadores'],
        entity_types: ['PERSON'],
        row_units: ['PERSON'],
        default_row_unit: 'PERSON',
        categories: ['ACCOUNTING_PROFESSIONAL', 'PROFESSIONAL_REGISTRY'],
        activities: ['EJERCICIO_PROFESIONAL_CIENCIAS_ECONOMICAS'],
        relations: ['PROFESSIONAL_PRACTICES_AS_ACCOUNTANT'],
        products: [],
        services: ['AUDITORIA_CONTABLE', 'LIQUIDACION_IMPUESTOS', 'BALANCES'],
        service_display: 'EJERCICIO INDIVIDUAL DE LA CONTADURÍA PÚBLICA',
        required_evidence: ['PERSON_IDENTITY', 'PROFESSIONAL_LICENSE', 'PROFESSIONAL_COUNCIL_REGISTRY', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      },
      {
        concept_id: 'ARCHITECT',
        canonical_name: 'Arquitecto / Profesional de Arquitectura',
        synonyms: ['arquitecto', 'arquitectos', 'arquitecta', 'arquitectas'],
        aliases: ['arquitecto', 'arquitectos'],
        entity_types: ['PERSON'],
        row_units: ['PERSON'],
        default_row_unit: 'PERSON',
        categories: ['ARCHITECTURE_PROFESSIONAL', 'PROFESSIONAL_REGISTRY'],
        activities: ['EJERCICIO_PROFESIONAL_ARQUITECTURA'],
        relations: ['PROFESSIONAL_PRACTICES_AS_ARCHITECT'],
        products: [],
        services: ['PROYECTO_Y_DIRECCION_DE_OBRA', 'DISENO_ARQUITECTONICO', 'PLANOS'],
        service_display: 'EJERCICIO INDIVIDUAL DE LA ARQUITECTURA',
        required_evidence: ['PERSON_IDENTITY', 'PROFESSIONAL_LICENSE', 'ARCHITECTURE_COUNCIL_REGISTRY', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      }
    ];

    for (const def of professionalDefinitions) {
      this.concepts.set(def.concept_id, def);
      if (this.dbPool) {
        await this.dbPool.query(`
          INSERT INTO public.atlas_concept_registry (
            concept_id, canonical_name, synonyms, aliases, entity_types, row_units, default_row_unit,
            categories, activities, relations, products, services, service_display,
            parent_concepts, child_concepts, negative_concepts, required_evidence,
            semantic_features, osm_tags, clae_codes, wikidata_ids, other_external_taxonomy_ids,
            source_hints, source_capability_hints, confidence, provenance, validation_state, version,
            updated_at
          ) VALUES (
            $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7,
            $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
            '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, $14::jsonb,
            '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
            '[]'::jsonb, '[]'::jsonb, $15, $16, $17, $18,
            NOW()
          )
          ON CONFLICT (concept_id) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            synonyms = EXCLUDED.synonyms,
            aliases = EXCLUDED.aliases,
            entity_types = EXCLUDED.entity_types,
            row_units = EXCLUDED.row_units,
            default_row_unit = EXCLUDED.default_row_unit,
            categories = EXCLUDED.categories,
            activities = EXCLUDED.activities,
            relations = EXCLUDED.relations,
            services = EXCLUDED.services,
            service_display = EXCLUDED.service_display,
            required_evidence = EXCLUDED.required_evidence,
            confidence = EXCLUDED.confidence,
            validation_state = EXCLUDED.validation_state,
            updated_at = NOW();
        `, [
          def.concept_id,
          def.canonical_name,
          JSON.stringify(def.synonyms),
          JSON.stringify(def.aliases),
          JSON.stringify(def.entity_types),
          JSON.stringify(def.row_units),
          def.default_row_unit,
          JSON.stringify(def.categories),
          JSON.stringify(def.activities),
          JSON.stringify(def.relations),
          JSON.stringify(def.products),
          JSON.stringify(def.services),
          def.service_display,
          JSON.stringify(def.required_evidence),
          def.confidence,
          def.provenance,
          def.validation_state,
          def.version
        ]);
      }
    }

    // Clean LAW_FIRM & ACCOUNTING_FIRM synonyms so they do not overlap individual person/practitioner
    if (this.dbPool) {
      await this.dbPool.query(`
        UPDATE public.atlas_concept_registry
        SET canonical_name = 'Estudio Jurídico',
            synonyms = '["estudio juridico", "estudios juridicos", "bufete", "bufete de abogados", "estudio de abogados"]'::jsonb,
            row_units = '["ESTABLISHMENT", "COMPANY"]'::jsonb,
            default_row_unit = 'COMPANY',
            entity_types = '["COMPANY", "ESTABLISHMENT"]'::jsonb,
            updated_at = NOW()
        WHERE concept_id = 'LAW_FIRM';

        UPDATE public.atlas_concept_registry
        SET canonical_name = 'Estudio Contable',
            synonyms = '["estudio contable", "estudios contables", "asesoria contable", "estudio contable impositivo"]'::jsonb,
            row_units = '["ESTABLISHMENT", "COMPANY"]'::jsonb,
            default_row_unit = 'COMPANY',
            entity_types = '["COMPANY", "ESTABLISHMENT"]'::jsonb,
            updated_at = NOW()
        WHERE concept_id = 'ACCOUNTING_FIRM';
      `);
    }
  }

  private async ensureUrbanDomainConcepts(): Promise<void> {
    const urbanDefinitions: AtlasConceptDefinition[] = [
      {
        concept_id: 'GARAGES_ESTACIONAMIENTOS',
        canonical_name: 'Garages y Playas de Estacionamiento',
        synonyms: ['garage', 'garages', 'estacionamiento', 'estacionamientos', 'playa de estacionamiento', 'playas de estacionamiento', 'cochera', 'cocheras', 'parking'],
        aliases: ['garage', 'garages', 'estacionamiento', 'estacionamientos', 'cochera', 'cocheras'],
        entity_types: ['ESTABLISHMENT'],
        row_units: ['ESTABLISHMENT'],
        default_row_unit: 'ESTABLISHMENT',
        categories: ['SERVICIOS_AUTOMOTORES', 'TRANSPORTE_Y_LOGISTICA'],
        activities: ['SERVICIOS_DE_ESTACIONAMIENTO'],
        relations: ['ESTABLISHMENT_SERVICE'],
        products: [],
        services: ['ESTACIONAMIENTO_VEHICULAR'],
        service_display: 'SERVICIOS DE ESTACIONAMIENTO Y GARAGES',
        required_evidence: ['PHYSICAL_ADDRESS', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      },
      {
        concept_id: 'PLAZAS_ESPACIOS_PUBLICOS',
        canonical_name: 'Plazas y Espacios Verdes Públicos',
        synonyms: ['plaza', 'plazas', 'plazas publicas', 'espacios verdes', 'parque', 'parques', 'plazoleta', 'plazoletas'],
        aliases: ['plaza', 'plazas', 'parque', 'parques'],
        entity_types: ['ESTABLISHMENT'],
        row_units: ['ESTABLISHMENT'],
        default_row_unit: 'ESTABLISHMENT',
        categories: ['ESPACIOS_PUBLICOS', 'INFRAESTRUCTURA_PUBLICA'],
        activities: ['RECREACION_ESPACIO_PUBLICO'],
        relations: ['ESTABLISHMENT_SERVICE'],
        products: [],
        services: ['ESPACIO_VERDE_PUBLICO'],
        service_display: 'ESPACIOS PÚBLICOS Y VERDES',
        required_evidence: ['PHYSICAL_ADDRESS', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      },
      {
        concept_id: 'FARMACIAS',
        canonical_name: 'Farmacias y Boticas',
        synonyms: ['farmacia', 'farmacias', 'botica', 'boticas'],
        aliases: ['farmacia', 'farmacias'],
        entity_types: ['ESTABLISHMENT'],
        row_units: ['ESTABLISHMENT'],
        default_row_unit: 'ESTABLISHMENT',
        categories: ['SALUD_Y_FARMACIA', 'COMERCIO_MINORISTA'],
        activities: ['VENTA_MEDICAMENTOS_Y_FARMACIA'],
        relations: ['RETAILER'],
        products: ['MEDICAMENTOS', 'PRODUCTOS_FARMACEUTICOS'],
        services: ['DISPENSACION_FARMACEUTICA'],
        service_display: 'FARMACIAS Y BOTICAS',
        required_evidence: ['PHYSICAL_ADDRESS', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      },
      {
        concept_id: 'RESTAURANTES_GASTRONOMIA',
        canonical_name: 'Restaurantes y Locales Gastronómicos',
        synonyms: ['restaurante', 'restaurantes', 'resto', 'gastronomia', 'casa de comidas'],
        aliases: ['restaurante', 'restaurantes'],
        entity_types: ['ESTABLISHMENT'],
        row_units: ['ESTABLISHMENT'],
        default_row_unit: 'ESTABLISHMENT',
        categories: ['GASTRONOMIA', 'RESTAURANTES'],
        activities: ['SERVICIO_DE_COMIDAS'],
        relations: ['ESTABLISHMENT_SERVICE'],
        products: ['PLATOS_PREPARADOS'],
        services: ['GASTRONOMIA_Y_COMIDAS'],
        service_display: 'RESTAURANTES Y GASTRONOMÍA',
        required_evidence: ['PHYSICAL_ADDRESS', 'GEOGRAPHY_EVIDENCE'],
        confidence: 1.0,
        provenance: 'OFFICIAL_REGISTRY',
        validation_state: 'VALIDATED',
        version: 1
      }
    ];

    if (!this.dbPool) return;

    for (const def of urbanDefinitions) {
      try {
        await this.dbPool.query(`
          INSERT INTO public.atlas_concept_registry (
            concept_id, canonical_name, synonyms, aliases, entity_types, row_units, default_row_unit,
            categories, activities, relations, products, services, service_display,
            parent_concepts, child_concepts, negative_concepts, required_evidence,
            semantic_features, osm_tags, clae_codes, wikidata_ids, other_external_taxonomy_ids,
            source_hints, source_capability_hints, confidence, provenance, validation_state, version,
            updated_at
          ) VALUES (
            $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7,
            $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
            '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, $14::jsonb,
            '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
            '[]'::jsonb, '[]'::jsonb, $15, $16, $17, $18,
            NOW()
          )
          ON CONFLICT (concept_id) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            synonyms = EXCLUDED.synonyms,
            aliases = EXCLUDED.aliases,
            entity_types = EXCLUDED.entity_types,
            row_units = EXCLUDED.row_units,
            default_row_unit = EXCLUDED.default_row_unit,
            categories = EXCLUDED.categories,
            activities = EXCLUDED.activities,
            relations = EXCLUDED.relations,
            services = EXCLUDED.services,
            service_display = EXCLUDED.service_display,
            required_evidence = EXCLUDED.required_evidence,
            confidence = EXCLUDED.confidence,
            validation_state = EXCLUDED.validation_state,
            updated_at = NOW();
        `, [
          def.concept_id,
          def.canonical_name,
          JSON.stringify(def.synonyms),
          JSON.stringify(def.aliases),
          JSON.stringify(def.entity_types),
          JSON.stringify(def.row_units),
          def.default_row_unit,
          JSON.stringify(def.categories),
          JSON.stringify(def.activities),
          JSON.stringify(def.relations),
          JSON.stringify(def.products),
          JSON.stringify(def.services),
          def.service_display,
          JSON.stringify(def.required_evidence),
          def.confidence,
          def.provenance,
          def.validation_state,
          def.version
        ]);
      } catch (err: any) {
        console.warn(`[AtlasConceptRegistry] Notice during urban concept insertion (${def.concept_id}):`, err.message);
      }
    }
  }

  public async loadFromDb(): Promise<void> {
    if (!this.dbPool) return;
    try {
      const res = await this.dbPool.query(`
        SELECT * FROM public.atlas_concept_registry
        WHERE validation_state IN ('VALIDATED', 'LEARNED', 'STABLE', 'VALIDATED_CANDIDATE');
      `);
      this.concepts.clear();
      for (const row of res.rows) {
        const osm = Array.isArray(row.osm_tags) ? row.osm_tags : (Array.isArray(row.semantic_features?.osm_tags) ? row.semantic_features.osm_tags : []);
        const clae = Array.isArray(row.clae_codes) ? row.clae_codes : (Array.isArray(row.semantic_features?.clae_codes) ? row.semantic_features.clae_codes : []);
        const wiki = Array.isArray(row.wikidata_ids) ? row.wikidata_ids : (Array.isArray(row.semantic_features?.wikidata_ids) ? row.semantic_features.wikidata_ids : []);
        const ext = row.other_external_taxonomy_ids || row.semantic_features?.other_external_taxonomy_ids || {};
        const hints = Array.isArray(row.source_hints) ? row.source_hints : (Array.isArray(row.semantic_features?.source_hints) ? row.semantic_features.source_hints : []);

        const def: AtlasConceptDefinition = {
          concept_id: row.concept_id,
          canonical_name: row.canonical_name,
          synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
          aliases: Array.isArray(row.aliases) ? row.aliases : [],
          entity_types: Array.isArray(row.entity_types) ? row.entity_types : ['COMPANY'],
          row_units: Array.isArray(row.row_units) ? row.row_units : ['COMPANY'],
          default_row_unit: row.default_row_unit || 'COMPANY',
          categories: Array.isArray(row.categories) ? row.categories : [row.concept_id],
          activities: Array.isArray(row.activities) ? row.activities : [],
          relations: Array.isArray(row.relations) ? row.relations : ['GENERAL_ENTITY'],
          products: Array.isArray(row.products) ? row.products : [],
          services: Array.isArray(row.services) ? row.services : [],
          service_display: row.service_display || undefined,
          parent_concepts: Array.isArray(row.parent_concepts) ? row.parent_concepts : [],
          child_concepts: Array.isArray(row.child_concepts) ? row.child_concepts : [],
          negative_concepts: typeof row.negative_concepts === 'object' && row.negative_concepts ? row.negative_concepts : undefined,
          required_evidence: Array.isArray(row.required_evidence) ? row.required_evidence : [],
          semantic_features: row.semantic_features || {},
          osm_tags: osm,
          clae_codes: clae,
          wikidata_ids: wiki,
          other_external_taxonomy_ids: ext,
          source_hints: hints,
          source_capability_hints: Array.isArray(row.source_capability_hints) ? row.source_capability_hints : [],
          confidence: Number(row.confidence) || 1.0,
          provenance: row.provenance || 'OFFICIAL_REGISTRY',
          validation_state: row.validation_state || 'VALIDATED',
          version: Number(row.version) || 1,
          learned_at: row.learned_at ? new Date(row.learned_at).toISOString() : undefined,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
        };
        this.concepts.set(def.concept_id, def);
      }
      console.log(`[AtlasConceptRegistry] Loaded ${this.concepts.size} concepts from database.`);
    } catch (e) {
      console.error('[AtlasConceptRegistry] Error loading concepts from DB:', e);
    }
  }

  public async registerConceptInDb(def: AtlasConceptDefinition): Promise<void> {
    if (!this.dbPool) {
      // In-memory register
      this.concepts.set(def.concept_id, def);
      return;
    }

    // Invariant: Integrity gate validation before database ingestion
    const validation = AtlasConceptIntegrityGate.getInstance().validateConcept(def);
    if (!validation.valid) {
      const contradictions = validation.issues.filter(i => i.code === 'CANONICAL_TAG_CONTRADICTION');
      if (contradictions.length > 0) {
        throw new Error(`CONCEPT_INTEGRITY_VIOLATION: Cannot register concept '${def.concept_id}': ${contradictions.map(c => c.message).join('; ')}`);
      }
    }

    const osm = def.osm_tags || (Array.isArray(def.semantic_features?.osm_tags) ? def.semantic_features.osm_tags : []);
    const clae = def.clae_codes || (Array.isArray(def.semantic_features?.clae_codes) ? def.semantic_features.clae_codes : []);
    const wiki = def.wikidata_ids || (Array.isArray(def.semantic_features?.wikidata_ids) ? def.semantic_features.wikidata_ids : []);
    const ext = def.other_external_taxonomy_ids || def.semantic_features?.other_external_taxonomy_ids || {};
    const hints = def.source_hints || def.source_capability_hints || [];

    await this.dbPool.query(`
      INSERT INTO public.atlas_concept_registry (
        concept_id, canonical_name, synonyms, aliases, entity_types, row_units, default_row_unit,
        categories, activities, relations, products, services, service_display,
        parent_concepts, child_concepts, negative_concepts, required_evidence,
        semantic_features, osm_tags, clae_codes, wikidata_ids, other_external_taxonomy_ids,
        source_hints, source_capability_hints, confidence, provenance, validation_state, version,
        updated_at
      ) VALUES (
        $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13,
        $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
        $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb,
        $23::jsonb, $24::jsonb, $25, $26, $27, $28,
        NOW()
      )
      ON CONFLICT (concept_id) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        synonyms = EXCLUDED.synonyms,
        aliases = EXCLUDED.aliases,
        entity_types = EXCLUDED.entity_types,
        row_units = EXCLUDED.row_units,
        default_row_unit = EXCLUDED.default_row_unit,
        categories = EXCLUDED.categories,
        activities = EXCLUDED.activities,
        relations = EXCLUDED.relations,
        products = EXCLUDED.products,
        services = EXCLUDED.services,
        service_display = EXCLUDED.service_display,
        parent_concepts = EXCLUDED.parent_concepts,
        child_concepts = EXCLUDED.child_concepts,
        negative_concepts = EXCLUDED.negative_concepts,
        required_evidence = EXCLUDED.required_evidence,
        semantic_features = EXCLUDED.semantic_features,
        osm_tags = EXCLUDED.osm_tags,
        clae_codes = EXCLUDED.clae_codes,
        wikidata_ids = EXCLUDED.wikidata_ids,
        other_external_taxonomy_ids = EXCLUDED.other_external_taxonomy_ids,
        source_hints = EXCLUDED.source_hints,
        source_capability_hints = EXCLUDED.source_capability_hints,
        confidence = EXCLUDED.confidence,
        validation_state = EXCLUDED.validation_state,
        version = EXCLUDED.version,
        updated_at = NOW();
    `, [
      def.concept_id,
      def.canonical_name,
      JSON.stringify(def.synonyms || []),
      JSON.stringify(def.aliases || []),
      JSON.stringify(def.entity_types || ['COMPANY']),
      JSON.stringify(def.row_units || ['COMPANY']),
      def.default_row_unit || 'COMPANY',
      JSON.stringify(def.categories || [def.concept_id]),
      JSON.stringify(def.activities || []),
      JSON.stringify(def.relations || ['GENERAL_ENTITY']),
      JSON.stringify(def.products || []),
      JSON.stringify(def.services || []),
      def.service_display || null,
      JSON.stringify(def.parent_concepts || []),
      JSON.stringify(def.child_concepts || []),
      JSON.stringify(def.negative_concepts || {}),
      JSON.stringify(def.required_evidence || []),
      JSON.stringify(def.semantic_features || {}),
      JSON.stringify(osm),
      JSON.stringify(clae),
      JSON.stringify(wiki),
      JSON.stringify(ext),
      JSON.stringify(hints),
      JSON.stringify(def.source_capability_hints || []),
      def.confidence !== undefined ? def.confidence : 1.0,
      def.provenance || 'RUNTIME_LEARNED',
      def.validation_state || 'VALIDATED',
      def.version || 1
    ]);

    this.concepts.set(def.concept_id, def);
  }

  public registerConcept(def: AtlasConceptDefinition): void {
    this.concepts.set(def.concept_id, def);
  }

  public async deleteConceptFromDb(conceptId: string): Promise<void> {
    if (this.dbPool) {
      await this.dbPool.query('DELETE FROM public.atlas_concept_registry WHERE concept_id = $1;', [conceptId]);
    }
    this.concepts.delete(conceptId);
  }

  public getConcept(conceptId: string): AtlasConceptDefinition | undefined {
    return this.concepts.get(conceptId);
  }

  public getAllConcepts(): AtlasConceptDefinition[] {
    return Array.from(this.concepts.values());
  }

  /**
   * Detects polysemic and ambiguous business queries
   * e.g. "almacén" -> GROCERY_STORE (barrio) vs WAREHOUSE_AND_STORAGE (depósito logístico)
   */
  public detectAmbiguity(text: string): { ambiguous: boolean; prompt?: string; candidates: string[] } {
    const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // 1. "almacén" ambiguity (Retail grocery vs Logistics warehouse)
    const hasAlmacen = /\b(almacen(es)?)\b/i.test(lower);
    const hasGroceryContext = /\b(barrio|comestibles?|alimentos?|fiambreria|bebidas?|despensa|minorista)\b/i.test(lower);
    const hasWarehouseContext = /\b(deposito(s)?|logistica|almacenamiento|parque\s+industrial|distribucion|bodega(s)?|carga)\b/i.test(lower);

    if (hasAlmacen && !hasGroceryContext && !hasWarehouseContext) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a? [ Almacenes de barrio ] [ Depósitos / warehouses ]',
        candidates: ['GROCERY_STORE', 'WAREHOUSE_AND_STORAGE']
      };
    }

    // 2. Generic bare contacts query
    const isBareContactsQuery = /^(?:quiero|necesito|buscame|dame|obtener)?\s*(?:\d{1,3}(?:\.\d{3})+|\d+|diez mil|veinte mil|mil)?\s*contactos?\s*(?:publicos?)?$/i.test(lower);
    if (isBareContactsQuery) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a personas profesionales, empresas o canales de contacto directo (email/teléfono)?',
        candidates: ['PROFESSIONAL_CONTACT', 'COMPANY', 'PUBLIC_EMAIL_CONTACT']
      };
    }

    // 3. "boliche" ambiguity (Discoteca/Bailable vs Bar/Gastronomía)
    const hasBoliche = /\b(boliche(s)?)\b/i.test(lower);
    const hasBolicheContext = /\b(bailable|baile|nocturno|discoteca|tragos|bar|resto|comida|bowling)\b/i.test(lower);
    if (hasBoliche && !hasBolicheContext) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a? [ Discotecas / Locales bailables ] [ Bares / Gastronomía ]',
        candidates: ['NIGHTCLUB', 'BAR']
      };
    }

    // 4. "taller" ambiguity (Mecánico/Automotor vs Oficio/Artesanal)
    const hasTaller = /\b(taller(es)?)\b/i.test(lower);
    const hasTallerContext = /\b(mecanic[oa]|chapa|pintura|autos?|motos?|costura|confeccion|textil|arte|artesanal|carpinteria|herreria|capacitacion)\b/i.test(lower);
    if (hasTaller && !hasTallerContext) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a? [ Talleres mecánicos / automotores ] [ Talleres de oficio / artesanales / costura ]',
        candidates: ['CAR_REPAIR', 'CRAFT_WORKSHOP']
      };
    }

    // 5. "estudio" ambiguity (Contable/Jurídico vs Arquitectura/Diseño)
    const hasEstudio = /\b(estudio(s)?)\b/i.test(lower);
    const hasEstudioContext = /\b(contables?|juridicos?|abogados?|contadores?|arquitectura|diseno|fotografia|grabacion|musica)\b/i.test(lower);
    if (hasEstudio && !hasEstudioContext) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a? [ Estudios contables / jurídicos ] [ Estudios de arquitectura / diseño ]',
        candidates: ['ACCOUNTING_FIRM', 'ARCHITECTURE_STUDIO']
      };
    }

    // 6. "laboratorio" ambiguity (Dental/Clínico vs Químico/Farmacéutico)
    const hasLaboratorio = /\b(laboratorio(s)?)\b/i.test(lower);
    const hasLaboratorioContext = /\b(dental|protesis|analisis\s+clinicos?|bioquimic[oa]|farmaceutic[oa]|quimic[oa]|industrial)\b/i.test(lower);
    if (hasLaboratorio && !hasLaboratorioContext) {
      return {
        ambiguous: true,
        prompt: '¿Te referís a? [ Laboratorios dentales / clínicos ] [ Laboratorios farmacéuticos / químicos ]',
        candidates: ['DENTAL_LABORATORY', 'PHARMACEUTICAL_LABORATORY']
      };
    }

    return { ambiguous: false, candidates: [] };
  }

  private cleanRemainderNoise(text: string): string {
    return text
      .replace(/\b(?:de|en|para|el|la|los|las|un|una|unos|unas|y|con|del|al|por|que|sobre|o)\b/gi, ' ')
      .replace(/\b(?:fabricas?|fabricantes?|fabricacion|elaboracion|produccion|industrias?|tiendas?|locales?|comercios?|negocios?|empresas?|distribuidor(?:as?|es)?|distribuidora|mayoristas?|proveedor(?:as?|es)?|servicios?|estudios?|consultor(?:as?|ias?)|agencias?|institutos?|centros?|talleres?|cooperativas?|obra|obras|civil|civiles|privad[oa]s?|profesionales?)\b/gi, ' ')
      .replace(/\b(?:caba|buenos aires|cordoba|rosario|santa fe|mendoza|salta|neuquen|bariloche|san juan|tucuman|mar del plata|bahia blanca|pilar|quilmes|tigre|san martin|once|flores|catamarca|la rioja|jujuy|chaco|corrientes|misiones|entre rios|la pampa|rio negro|chubut|santa cruz|tierra del fuego|ushuaia)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Helper: checks if a concept has specific, usable public taxonomy (not generic placeholders like shop=yes)
   */
  public static hasSpecificTaxonomy(concept?: AtlasConceptDefinition | null): boolean {
    if (!concept) return false;
    const osmTags = concept.osm_tags || (Array.isArray(concept.semantic_features?.osm_tags) ? concept.semantic_features.osm_tags : []);
    if (!osmTags || osmTags.length === 0) return false;
    const genericPlaceholders = new Set([
      'shop=yes', 'amenity=yes', 'office=yes', 'craft=yes', 
      'tourism=yes', 'leisure=yes', 'industrial=yes', 'commercial=yes'
    ]);
    const specific = osmTags.filter(t => typeof t === 'string' && !genericPlaceholders.has(t.trim().toLowerCase()) && t.includes('='));
    return specific.length > 0;
  }

  /**
   * Ranked matching with multi-dimensional confidence and stem-safety invariants
   */
  public findMatchingConcepts(text: string): ConceptMatchResult[] {
    const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const queryRawTokens = lower.split(/[^a-z0-9]+/i).filter(w => w.length >= 2);
    const querySigTokens = queryRawTokens.filter(w => !SPANISH_STOP_WORDS.has(w));
    const results: ConceptMatchResult[] = [];

    for (const concept of this.concepts.values()) {
      const canonicalNorm = concept.canonical_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      
      // 1. EXACT_CANONICAL check
      if (lower === canonicalNorm) {
        results.push({
          concept,
          score: 1.0,
          matchType: 'EXACT_CANONICAL',
          query_token_coverage: 1.0,
          candidate_token_coverage: 1.0,
          stem_only_match: false,
          resolution_admissible: true,
          match_provenance: 'EXACT_CANONICAL'
        });
        continue;
      }

      // 2. EXACT_ALIAS check
      let exactAliasFound = false;
      for (const syn of concept.synonyms) {
        const synNorm = syn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (lower === synNorm) {
          results.push({
            concept,
            score: 0.98,
            matchType: 'EXACT_ALIAS',
            query_token_coverage: 1.0,
            candidate_token_coverage: 1.0,
            stem_only_match: false,
            resolution_admissible: true,
            match_provenance: 'EXACT_SYNONYM'
          });
          exactAliasFound = true;
          break;
        }
      }
      if (exactAliasFound) continue;

      for (const alias of (concept.aliases || [])) {
        const aliasNorm = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (lower === aliasNorm) {
          results.push({
            concept,
            score: 0.97,
            matchType: 'EXACT_ALIAS',
            query_token_coverage: 1.0,
            candidate_token_coverage: 1.0,
            stem_only_match: false,
            resolution_admissible: true,
            match_provenance: 'EXACT_ALIAS'
          });
          exactAliasFound = true;
          break;
        }
      }
      if (exactAliasFound) continue;

      // 3. NORMALIZED_PHRASE check
      const cleanRemainder = this.cleanRemainderNoise(lower);
      if (cleanRemainder && cleanRemainder.length >= 3) {
        if (cleanRemainder === canonicalNorm) {
          results.push({
            concept,
            score: 0.95,
            matchType: 'NORMALIZED_PHRASE',
            query_token_coverage: 1.0,
            candidate_token_coverage: 1.0,
            stem_only_match: false,
            resolution_admissible: true,
            match_provenance: 'NORMALIZED_PHRASE_CANONICAL'
          });
          continue;
        }
        let normSynMatch = false;
        for (const syn of concept.synonyms) {
          const synNorm = syn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          if (cleanRemainder === synNorm) {
            results.push({
              concept,
              score: 0.94,
              matchType: 'NORMALIZED_PHRASE',
              query_token_coverage: 1.0,
              candidate_token_coverage: 1.0,
              stem_only_match: false,
              resolution_admissible: true,
              match_provenance: 'NORMALIZED_PHRASE_SYNONYM'
            });
            normSynMatch = true;
            break;
          }
        }
        if (normSynMatch) continue;
      }

      // 4. STRONG_TOKEN_MATCH vs STEM_SUPPORT Evaluation
      // Gather candidate phrases to evaluate coverage against
      const candidatePhrases = [concept.canonical_name, ...concept.synonyms];
      let bestStrongMatch: ConceptMatchResult | null = null;
      let bestStemMatch: ConceptMatchResult | null = null;

      for (const phrase of candidatePhrases) {
        const phraseNorm = phrase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const candTokens = phraseNorm.split(/[^a-z0-9]+/i).filter(w => w.length >= 2);
        const candSigTokens = candTokens.filter(w => !SPANISH_STOP_WORDS.has(w));

        // Exact word token overlap
        let exactWordHits = 0;
        for (const qTok of querySigTokens) {
          if (candSigTokens.includes(qTok)) {
            exactWordHits++;
          }
        }

        const queryTokenCoverage = querySigTokens.length > 0 ? exactWordHits / querySigTokens.length : 0;
        const candTokenCoverage = candSigTokens.length > 0 ? exactWordHits / candSigTokens.length : 0;

        // STRONG_TOKEN_MATCH: Requires substantial query and candidate token coverage
        if (querySigTokens.length === 1 && exactWordHits === 1) {
          // Single word query (e.g. "ferreterias", "panaderias", "garages")
          // Must match a distinctive core word in a concise phrase (candidate coverage >= 0.20)
          if (candTokenCoverage >= 0.20) {
            const score = Math.min(0.90, 0.82 + (candTokenCoverage * 0.08));
            if (!bestStrongMatch || score > bestStrongMatch.score) {
              bestStrongMatch = {
                concept,
                score,
                matchType: 'STRONG_TOKEN_MATCH',
                query_token_coverage: 1.0,
                candidate_token_coverage: candTokenCoverage,
                stem_only_match: false,
                resolution_admissible: true,
                match_provenance: 'STRONG_SINGLE_TOKEN_EXACT_WORD'
              };
            }
          }
        } else if (querySigTokens.length > 1 && queryTokenCoverage >= 0.70 && candTokenCoverage >= 0.20) {
          const score = Math.min(0.92, 0.80 + (queryTokenCoverage * 0.10) + (candTokenCoverage * 0.05));
          if (!bestStrongMatch || score > bestStrongMatch.score) {
            bestStrongMatch = {
              concept,
              score,
              matchType: 'STRONG_TOKEN_MATCH',
              query_token_coverage: queryTokenCoverage,
              candidate_token_coverage: candTokenCoverage,
              stem_only_match: false,
              resolution_admissible: true,
              match_provenance: 'STRONG_MULTI_TOKEN_MATCH'
            };
          }
        }

        // STEM-ONLY Matching (Supporting signal only, NEVER resolution admissible)
        if (exactWordHits === 0 && querySigTokens.length > 0) {
          for (const qTok of querySigTokens) {
            if (qTok.length >= 5) {
              // Strip standard grammatical/inflectional suffixes
              const stem = qTok.replace(/(?:erias?|eras?|eros?|arias?|arios?|istas?|ores?|adoras?|os?|as?)$/i, '');
              // SHORT STEM SAFETY: Stem must have substantial length (>= 5 chars) to even be considered a supporting signal
              if (stem.length >= 5) {
                const hasStemInCand = candSigTokens.some(cTok => cTok.startsWith(stem) || stem.startsWith(cTok));
                if (hasStemInCand) {
                  const stemScore = Math.min(0.35, 0.20 + (stem.length / 30));
                  if (!bestStemMatch || stemScore > bestStemMatch.score) {
                    bestStemMatch = {
                      concept,
                      score: stemScore,
                      matchType: 'STEM_SUPPORT',
                      query_token_coverage: 0.0,
                      candidate_token_coverage: 0.0,
                      stem_only_match: true,
                      resolution_admissible: false,
                      match_provenance: 'SHORT_OR_LOW_INFORMATION_STEM_REJECTED'
                    };
                  }
                }
              }
            }
          }
        }
      }

      if (bestStrongMatch) {
        results.push(bestStrongMatch);
      } else if (bestStemMatch) {
        results.push(bestStemMatch);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  public getParentConcept(conceptId: string): AtlasConceptDefinition | undefined {
    const concept = this.concepts.get(conceptId);
    if (concept && concept.parent_concepts && concept.parent_concepts.length > 0) {
      return this.concepts.get(concept.parent_concepts[0]);
    }
    return undefined;
  }

  public getChildConcepts(conceptId: string): AtlasConceptDefinition[] {
    const children: AtlasConceptDefinition[] = [];
    for (const c of this.concepts.values()) {
      if (c.parent_concepts && c.parent_concepts.includes(conceptId)) {
        children.push(c);
      }
    }
    return children;
  }

  /**
   * Matches an input text against registered concepts by synonym ranking
   * Strict Invariant: STEM_ONLY_MATCH cannot resolve concept.
   */
  public matchConcept(text: string): AtlasConceptDefinition | null {
    const matches = this.findMatchingConcepts(text);
    const top = matches[0];
    if (top && top.resolution_admissible && !top.stem_only_match && top.score >= 0.80) {
      return top.concept;
    }
    return null;
  }
}
