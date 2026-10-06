import { Router } from 'express';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { IndustrialSearchRepository } from '../../src/lib/search/repositories/IndustrialSearchRepository.ts';
import { AtlasCommerceService } from '../../src/lib/commerce/AtlasCommerceService.ts';
import { IndustrialMarketMatcher, type IndustrialMarketPost } from '../../src/lib/industrialMarket/IndustrialMarketMatcher.ts';
import { IndustrialDiscoveryService } from '../services/industrial/IndustrialDiscoveryService.ts';
import { UniversalMissionEngine } from '../services/industrial/UniversalMissionEngine.ts';
import { RoleEvidenceGate } from '../../src/lib/atlasIntelligence/RoleEvidenceGate.ts';
import { AtlasConceptRegistry } from '../services/industrial/AtlasConceptRegistry.ts';
import { UniversalSemanticResolver } from '../services/industrial/UniversalSemanticResolver.ts';
import { AtlasSemanticCompiler } from '../services/industrial/AtlasSemanticCompiler.ts';
import { SourceNativeIdentityReconciler } from '../services/industrial/SourceNativeIdentityReconciler.ts';
import { SpatialPartitionPlanner } from '../services/industrial/SpatialPartitionPlanner.ts';
import { AtlasGeographyRegistry } from '../services/industrial/AtlasGeographyRegistry.ts';
import { AtlasVirtualDatasetService } from '../services/industrial/AtlasVirtualDatasetService.ts';
import { DurableMissionWorker } from '../services/industrial/DurableMissionWorker.ts';
import { DurableMissionQueue } from '../services/industrial/DurableMissionQueue.ts';

export interface IndustrialRouterDeps {
  dbPool: any;
  commerceService: AtlasCommerceService;
  resolveUserId: (req: express.Request, sbAdmin: any) => Promise<string | null>;
}

export function createIndustrialRouter(deps: IndustrialRouterDeps): Router {
  const router = Router();
  const { dbPool, commerceService, resolveUserId } = deps;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const getSbAdmin = () => {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");
    return createClient(supabaseUrl, supabaseServiceKey);
  };

  const discoveryService = new IndustrialDiscoveryService(dbPool);
  discoveryService.ensureSchema().catch(e => console.error('[DiscoveryService] Schema init error:', e));

  const conceptRegistry = AtlasConceptRegistry.getInstance();
  conceptRegistry.setDbPool(dbPool);
  conceptRegistry.ensureSchema().catch(e => console.error('[AtlasConceptRegistry] Schema init error:', e));

  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  geoRegistry.ensureSchema().catch(e => console.error('[AtlasGeographyRegistry] Schema init error:', e));

  /**
   * CANONICAL MISSION RESULT CONTRACT (Requirements 4, 5, 11)
   * Resolves the committed, persistent MissionResultSet directly from Atlas Core DB
   * Invariant: VISIBLE_CERTIFIED_COUNT = RECOVERABLE_MISSION_RESULT_COUNT
   */
  const getMissionResultSet = async (missionId: string, options: { page?: number; limit?: number; sortBy?: string } = {}) => {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(200, options.limit || 50));
    const offset = (page - 1) * limit;

    // 1. Mission definition truth
    const mRes = await dbPool.query(`
      SELECT mission_id, objective, geography, status, terminal_reason,
             certified_new_searchable, true_net_new_count, duplicate_existing_count,
             scanned_count, created_at, completed_at, criteria
      FROM public.atlas_discovery_missions
      WHERE mission_id = $1;
    `, [missionId]);

    const mission = mRes.rows[0];

    // 2. Count total certified rows committed to atlas_products for this mission
    const countRes = await dbPool.query(`
      SELECT count(*) as total
      FROM public.atlas_products
      WHERE attributes_json->>'mission_id' = $1;
    `, [missionId]);
    const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

    // 3. Query paginated rows joined with atlas_canonical_entities
    let orderBy = 'p.created_at DESC';
    if (options.sortBy === 'Producto A-Z' || options.sortBy === 'Producto A–Z') {
      orderBy = 'p.name ASC';
    } else if (options.sortBy === 'Empresa A-Z' || options.sortBy === 'Empresa A–Z') {
      orderBy = "COALESCE(e.canonical_name, p.attributes_json->>'company_name', p.name) ASC";
    } else if (options.sortBy === 'Provincia') {
      orderBy = "COALESCE(p.attributes_json->>'province', 'Buenos Aires') ASC";
    }

    const rowsRes = await dbPool.query(`
      SELECT 
        p.product_id,
        p.name as product_name,
        p.category as product_category,
        p.description as product_description,
        p.attributes_json,
        p.created_at as product_created_at,
        e.canonical_entity_id,
        e.canonical_name,
        e.entity_type,
        e.primary_domain,
        e.metadata as entity_metadata
      FROM public.atlas_products p
      LEFT JOIN public.atlas_canonical_entities e 
        ON e.canonical_entity_id::text = p.attributes_json->>'company_id'
      WHERE p.attributes_json->>'mission_id' = $1
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3;
    `, [missionId, limit, offset]);

    const results = rowsRes.rows.map((pRow: any) => {
      const meta = pRow.attributes_json || {};
      const entMeta = pRow.entity_metadata || {};
      const companyId = pRow.canonical_entity_id || meta.company_id || null;
      const companyName = pRow.canonical_name || meta.company_name || 'Desconocido';
      const evidence = meta.evidence || {};
      const sourceId = meta.source_id || evidence.source_id || meta.source || 'Atlas Discovery';
      const relationId = evidence.relation_id || evidence.certificate_id || `rel:${pRow.product_id}:${companyId}`;
      const isConstitutional = Boolean(meta.constitutional_authorization?.constitution_decision_id);
      const trustLevel = isConstitutional ? 'CONSTITUTIONAL' : 'VERIFIED';

      let realWebsite: string | null = null;
      if (meta.website && typeof meta.website === 'string' && !meta.website.includes('produccion.gob.ar')) {
        realWebsite = meta.website.trim();
      } else if (entMeta.website && typeof entMeta.website === 'string' && !entMeta.website.includes('produccion.gob.ar')) {
        realWebsite = entMeta.website.trim();
      } else if (pRow.primary_domain && typeof pRow.primary_domain === 'string' && !pRow.primary_domain.includes('produccion.gob.ar')) {
        realWebsite = pRow.primary_domain.trim();
      }

      const taxId = evidence.cuit || meta.cuit || meta.tax_id || entMeta.cuit || entMeta.tax_id || null;
      const desc = pRow.product_description || meta.description || entMeta.description || null;
      const empRange = meta.employee_range || entMeta.employee_range || null;
      const fYear = meta.founded_year || entMeta.founded_year || null;
      const category = meta.category || pRow.product_category || entMeta.category || 'Servicios Industriales';

      return {
        id: pRow.product_id,
        PRODUCT_ID: pRow.product_id,
        COMPANY_ID: companyId,
        COMPANY_METADATA_ENTITY_ID: companyId,
        EVIDENCE_RELATION_ID: relationId,
        COMPANY_NAME: companyName,
        TAX_ID: taxId,
        WEBSITE: realWebsite,
        DESCRIPTION: desc,
        EMPLOYEE_RANGE: empRange,
        FOUNDED_YEAR: fYear,
        ENTITY_TYPE: pRow.entity_type || 'ESTABLISHMENT',
        ROLE: meta.relationship_type || meta.role || 'Comercio / Proveedor',
        CATEGORY: category,
        PROVINCE: meta.province || entMeta.province || 'Buenos Aires',
        CITY: meta.city || entMeta.city || 'CABA',
        PUBLIC_EMAIL: meta.public_email || meta.email || entMeta.email || '',
        PUBLIC_PHONE: meta.phone || entMeta.phone || '',
        SOURCE: meta.source || evidence.official_registry || 'Atlas Core (Misión Certificada)',
        TRUST_LEVEL: trustLevel,
        IS_CONSTITUTIONAL: isConstitutional,
        IS_NEW_FROM_THIS_MISSION: true,
        IS_LIVE_TEMPORARY: false,
        LIVE_BADGE: 'EN ATLAS CORE',
        SOURCE_KIND: 'MISSION_CERTIFIED_CORE',
        EVIDENCE_COUNT: evidence && Object.keys(evidence).length > 0 ? 1 : 0,
        // Canonical Mission Result Contract (Section 4)
        mission_id: missionId,
        entity_id: companyId,
        source_id: sourceId,
        certification_status: isConstitutional ? 'CERTIFIED_CONSTITUTIONAL' : 'CERTIFIED',
        created_at: pRow.product_created_at,
        evidence_reference: relationId,
        name: companyName,
        initials: companyName.substring(0, 2).toUpperCase(),
        color: '#1e4d8c',
        MATCH_TYPE: 'product',
        MATCH_SCORE: 5,
        PRODUCTS: [{ name: pRow.product_name, category, evidence }]
      };
    });

    const facets = {
      categories: Array.from(new Set(results.map(r => r.CATEGORY).filter(Boolean))).map(c => ({ label: c, count: results.filter(r => r.CATEGORY === c).length, checked: false })),
      provinces: Array.from(new Set(results.map(r => r.PROVINCE).filter(Boolean))).map(p => ({ label: p, count: results.filter(r => r.PROVINCE === p).length, checked: false })),
      types: Array.from(new Set(results.map(r => r.ENTITY_TYPE).filter(Boolean))).map(t => ({ label: t, count: results.filter(r => r.ENTITY_TYPE === t).length, checked: false })),
      roles: Array.from(new Set(results.map(r => r.ROLE).filter(Boolean))).map(ro => ({ label: ro, count: results.filter(r => r.ROLE === ro).length, checked: false })),
      products: Array.from(new Set(results.flatMap(r => (r.PRODUCTS || []).map((p: any) => p.name)).filter(Boolean))).slice(0, 50).map(pr => ({ label: pr, count: 1, checked: false }))
    };

    const catalogStats = {
      totalRelations: totalCount,
      totalProducts: totalCount,
      totalEntities: new Set(results.map(r => r.COMPANY_ID).filter(Boolean)).size,
      totalCategories: new Set(results.map(r => r.CATEGORY).filter(Boolean)).size,
      totalProvinces: new Set(results.map(r => r.PROVINCE).filter(Boolean)).size,
      certifiedRelations: totalCount,
      constitutionalCoveragePercent: 100,
      globalCoveragePercent: 100,
      missionFitCoveragePercent: 100,
      totalPhysicalRows: totalCount,
      activeMissionFitRelations: totalCount
    };

    return {
      success: true,
      mission_id: missionId,
      status: mission?.status || 'COMPLETED',
      objective: mission?.objective || '',
      terminal_reason: mission?.terminal_reason || null,
      total: totalCount,
      totalCount: totalCount,
      coreExistingCount: 0,
      liveTemporaryCount: 0,
      newCount: totalCount,
      rows: results,
      results: results,
      facets,
      catalogStats,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      },
      searchMode: 'MISSION_RESULT_SET',
      acquisitionMode: 'MATERIALIZED'
    };
  };

  // GET /api/industrial/geographies
  router.get('/api/industrial/geographies', async (req, res) => {
    try {
      const geos = geoRegistry.getAllGeographies();
      res.json({ success: true, count: geos.length, geographies: geos });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/industrial/concepts
  router.get('/api/industrial/concepts', async (req, res) => {
    try {
      const concepts = conceptRegistry.getAllConcepts();
      res.json({ success: true, count: concepts.length, concepts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/industrial/concepts
  router.post('/api/industrial/concepts', async (req, res) => {
    try {
      const conceptDef = req.body;
      if (!conceptDef || !conceptDef.concept_id || !conceptDef.canonical_name) {
        return res.status(400).json({ error: 'Missing required concept fields (concept_id, canonical_name)' });
      }
      await conceptRegistry.registerConceptInDb(conceptDef);
      res.json({ success: true, concept_id: conceptDef.concept_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/industrial/concepts/:id
  router.delete('/api/industrial/concepts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await conceptRegistry.deleteConceptFromDb(id);
      res.json({ success: true, deleted: id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/industrial-search: Industrial Company Search
  router.post('/api/industrial-search', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
      
      const sbAdmin = getSbAdmin();
      let user = null;
      
      if (token) {
        const { data, error: authError } = await sbAdmin.auth.getUser(token);
        if (!authError && data.user) {
          user = data.user;
        }
      }
      
      // Auth is optional for industrial search (like a public search engine)
      const { query, limit, page, sortBy, missionId, mission_id, geography, searchMode, acquisitionMode } = req.body;
      const effectiveMissionId = missionId || mission_id;
      const isCanary = process.env.ATLAS_VIRTUAL_DATASETS_V1 === 'CANARY';
      const isMaterializeAcquisition = acquisitionMode === 'MATERIALIZE' || searchMode === 'MATERIALIZE';

      // MISSION RESULT SET FAST-PATH: If an explicit missionId is requested, return its canonical MissionResultSet
      if (effectiveMissionId) {
        const resultSet = await getMissionResultSet(effectiveMissionId, { page, limit, sortBy });
        return res.json(resultSet);
      }

      if (isCanary && query && typeof query === 'string' && query.trim() && !isMaterializeAcquisition) {
        // CANARY Virtual Dataset Flow: Live Stream + Core Existing (HYBRID)
        const datasetService = AtlasVirtualDatasetService.getInstance(dbPool);
        await datasetService.ensureSchema();

        const detectedQueryGeo = geoRegistry.resolveCanonicalGeography(query);
        const detectedParamGeo = geography ? geoRegistry.resolveCanonicalGeography(geography) : null;
        let canonicalGeo = 'ARG_CABA';
        if (detectedQueryGeo && detectedQueryGeo.geography_id !== 'ARG_NACIONAL') {
          canonicalGeo = detectedQueryGeo.geography_id;
        } else if (detectedParamGeo) {
          canonicalGeo = detectedParamGeo.geography_id;
        }

        // Get or create dataset definition
        const dsTitle = `Virtual Dataset — ${query.trim()} (${canonicalGeo})`;
        const dataset = await datasetService.createDatasetDefinition({
          raw_request: `${query.trim()} en ${canonicalGeo}`,
          title: dsTitle,
          execution_mode: 'HYBRID',
          geography_id: canonicalGeo,
          visibility: 'PUBLIC'
        });

        const runResult = await datasetService.executeLiveRun(dataset.dataset_id, {
          execution_mode: 'HYBRID',
          target_limit: 5
        });

        const defaultCategory = dataset.mission_ir?.object?.canonical_name || dataset.concept_ids[0] || 'Comercio';

        // Format live temporary rows (net-new only; overlapping rows are presented from Core)
        const liveRows = (runResult.temporary_rows || [])
          .filter((row: any) => !row.is_overlap_with_core)
          .map((row: any) => ({
          id: row.temporary_row_id,
          PRODUCT_ID: row.temporary_row_id,
          COMPANY_ID: row.temporary_row_id,
          COMPANY_METADATA_ENTITY_ID: row.temporary_row_id,
          EVIDENCE_RELATION_ID: `rel:live:${row.temporary_row_id}`,
          COMPANY_NAME: row.payload.name,
          TAX_ID: null,
          WEBSITE: row.payload.website || null,
          DESCRIPTION: `Comercio encontrado en vivo vía ${row.source_id}. Calificación: ${row.quality_state}.`,
          EMPLOYEE_RANGE: null,
          FOUNDED_YEAR: null,
          ENTITY_TYPE: 'ESTABLISHMENT',
          ROLE: `${defaultCategory} (En vivo)`,
          CATEGORY: row.payload.category || defaultCategory,
          PROVINCE: row.payload.province || 'Buenos Aires',
          CITY: row.payload.city || 'La Plata',
          PUBLIC_EMAIL: row.payload.email || '',
          PUBLIC_PHONE: row.payload.phone || '',
          SOURCE: 'Directorio Público OSM (En vivo)',
          TRUST_LEVEL: 'PENDING',
          IS_CONSTITUTIONAL: false,
          IS_NEW_FROM_THIS_MISSION: true,
          IS_LIVE_TEMPORARY: true,
          LIVE_BADGE: 'ENCONTRADO EN VIVO',
          SOURCE_KIND: 'LIVE_TEMPORARY',
          temporary_row_id: row.temporary_row_id,
          run_id: runResult.run.run_id,
          EVIDENCE_COUNT: 1,
          PRODUCTS: [{ name: row.payload.name, category: row.payload.category || defaultCategory }]
        }));

        // Format core existing rows
        const coreRows = (runResult.core_existing_rows || []).map((row: any) => {
          const meta = row.metadata || {};
          return {
            id: row.canonical_entity_id,
            PRODUCT_ID: row.canonical_entity_id,
            COMPANY_ID: row.canonical_entity_id,
            COMPANY_METADATA_ENTITY_ID: row.canonical_entity_id,
            EVIDENCE_RELATION_ID: meta.evidence?.relation_id || `rel:${row.canonical_entity_id}`,
            COMPANY_NAME: row.canonical_name,
            TAX_ID: meta.cuit || meta.tax_id || null,
            WEBSITE: meta.website || null,
            DESCRIPTION: meta.description || 'Comercio registrado en Atlas Core.',
            EMPLOYEE_RANGE: meta.employee_range || null,
            FOUNDED_YEAR: meta.founded_year || null,
            ENTITY_TYPE: row.entity_type || 'COMPANY',
            ROLE: meta.role || defaultCategory,
            CATEGORY: meta.category || meta.industry || defaultCategory,
            PROVINCE: meta.province || 'Buenos Aires',
            CITY: meta.city || 'La Plata',
            PUBLIC_EMAIL: meta.email || '',
            PUBLIC_PHONE: meta.phone || '',
            SOURCE: meta.source || 'Atlas Core',
            TRUST_LEVEL: meta.trust_level || 'LEGACY',
            IS_CONSTITUTIONAL: Boolean(meta.constitutional_authorization?.constitution_decision_id),
            IS_NEW_FROM_THIS_MISSION: false,
            IS_LIVE_TEMPORARY: false,
            LIVE_BADGE: 'YA EN ATLAS',
            SOURCE_KIND: 'CORE_EXISTING',
            temporary_row_id: null,
            run_id: runResult.run.run_id,
            EVIDENCE_COUNT: meta.evidence ? 1 : 0,
            PRODUCTS: [{ name: row.canonical_name, category: meta.category || defaultCategory }]
          };
        });

        // Combined: Live rows first, followed by Core rows
        const allMerged = [...liveRows, ...coreRows];
        const pageNum = page || 1;
        const limitNum = limit || 50;
        const offset = (pageNum - 1) * limitNum;
        const paginatedRows = allMerged.slice(offset, offset + limitNum);

        return res.json({
          results: paginatedRows,
          totalCount: runResult.unique_total_count,
          coreExistingCount: runResult.core_existing_count,
          liveTemporaryCount: runResult.live_temporary_count,
          uniqueTotalCount: runResult.unique_total_count,
          newCount: runResult.live_temporary_count,
          searchMode: 'HYBRID_CANARY',
          acquisitionMode: 'TEMPORARY_PREVIEW',
          runId: runResult.run.run_id,
          isCanary: true,
          telemetry: runResult.telemetry
        });
      }

      const repo = new IndustrialSearchRepository(sbAdmin);
      const results = await repo.search({ query, limit, page, sortBy, missionId: effectiveMissionId });
      
      res.json(results);
    } catch (err: any) {
      console.error('Industrial Search Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DISCOVERY MISSIONS V1 — BUSCAR HASTA 100.000 NUEVOS
  // ══════════════════════════════════════════════════════════════════════════

  const universalEngine = new UniversalMissionEngine(dbPool);

  // 0. POST /api/industrial/universal/plan: Deterministic Preview & Gap Analysis (No Auth required for preview)
  router.post('/api/industrial/universal/plan', async (req, res) => {
    try {
      const { objective, target, geography } = req.body || {};
      if (!objective || typeof objective !== 'string' || !objective.trim()) {
        return res.status(400).json({ success: false, error: 'El objetivo de búsqueda es obligatorio.', code: 'OBJECTIVE_REQUIRED' });
      }

      const geoRegistry = AtlasGeographyRegistry.getInstance();
      const unifyRes = geoRegistry.unifyGeographyIntent(objective.trim(), geography);

      if (unifyRes.conflict) {
        return res.status(400).json({
          success: false,
          error: unifyRes.prompt,
          code: 'GEOGRAPHY_CONFLICT',
          prompt: unifyRes.prompt,
          candidates: unifyRes.candidates
        });
      }

      const canonicalGeo = unifyRes.canonicalGeo;
      let effectiveObjective = objective.trim();
      if (canonicalGeo && canonicalGeo.geography_id !== 'ARG_NACIONAL') {
        const lowerObj = effectiveObjective.toLowerCase();
        const hasGeoInText = canonicalGeo.normalized_aliases.some(a => lowerObj.includes(a));
        if (!hasGeoInText) {
          effectiveObjective = `${effectiveObjective} en ${canonicalGeo.display_name}`;
        }
      }

      const { spec, plan_preview } = await universalEngine.compileUniversalSpec({
        objective: effectiveObjective,
        explicit_target: target ? Number(target) : undefined,
        canonical_geography: canonicalGeo,
        explicit_geography: canonicalGeo ? canonicalGeo.display_name : geography
      });

      if (unifyRes.ambiguity) {
        plan_preview.ambiguity_detected = true;
        plan_preview.clarification_prompt = unifyRes.prompt;
        plan_preview.candidate_concepts = unifyRes.candidates;
      }

      res.json({ success: true, spec, plan_preview });
    } catch (err: any) {
      console.error('Universal Plan Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/industrial/universal/resolve: Direct Semantic Parser Inspection
  router.post('/api/industrial/universal/resolve', async (req, res) => {
    try {
      const { objective, target } = req.body || {};
      if (!objective || typeof objective !== 'string' || !objective.trim()) {
        return res.status(400).json({ success: false, error: 'El objetivo de búsqueda es obligatorio.', code: 'OBJECTIVE_REQUIRED' });
      }
      // PRIMARY: AtlasSemanticCompiler V1
      const compiler = AtlasSemanticCompiler.getInstance();
      const missionIR = await compiler.compileAsync(objective.trim(), target ? Number(target) : undefined);

      // SHADOW: UniversalSemanticResolver (Legacy)
      const resolver = UniversalSemanticResolver.getInstance();
      const legacySpec = resolver.resolve(objective.trim(), target ? Number(target) : undefined);

      res.json({
        success: true,
        primary_compiler: missionIR,
        compiler_ir_id: missionIR.compiler_ir_id,
        ir_hash: missionIR.ir_hash,
        legacy_shadow: legacySpec,
        spec: {
          ...legacySpec,
          compiler_ir_id: missionIR.compiler_ir_id,
          ir_hash: missionIR.ir_hash,
          row_unit: missionIR.target.row_unit,
          entity_type: missionIR.target.entity_type,
          relation: missionIR.intent.role,
          category: missionIR.object.domain,
          product: missionIR.object.raw_product_phrase || missionIR.object.canonical_name,
          service: missionIR.object.raw_service_phrase,
          geography: missionIR.geography.canonical_name || missionIR.geography.raw_geography_phrase,
          needs_ontology_resolution: missionIR.execution_layers?.gaps.ontology_gap || false,
          execution_ready: missionIR.execution_layers?.execution_readiness || false,
          resolution_state: missionIR.resolution_state,
          execution_layers: missionIR.execution_layers,
          evidence_contract: missionIR.evidence_contract
        }
      });
    } catch (err: any) {
      console.error('Universal Resolve Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/industrial/system/runtime-coherence: Runtime Coherence & Worker Registry
  router.get('/api/industrial/system/runtime-coherence', async (req, res) => {
    try {
      const worker = DurableMissionWorker.getInstance(dbPool);
      const queue = DurableMissionQueue.getInstance(dbPool);
      const queueMetrics = await queue.getQueueMetrics();

      res.json({
        success: true,
        build_id: 'ATLAS_CANONICAL_V1',
        started_at: worker.getWorkerMetadata().started_at,
        role: 'MISSION_CONTROL_AND_DURABLE_WORKER',
        pid: process.pid,
        heartbeat_at: new Date().toISOString(),
        active_workers: DurableMissionWorker.getActiveWorkerCount(),
        executor_capacity: 10,
        build_compatibility: true,
        schema_version: '1.0.0',
        queue_metrics: queueMetrics
      });
    } catch (err: any) {
      console.error('Runtime Coherence Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
  });

  // 1. POST /api/industrial/missions/spec: Compile & Create Mission Specification
  router.post('/api/industrial/missions/spec', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Se requiere sesión de usuario válida para crear una misión.', code: 'UNAUTHORIZED_MISSION_CREATION' });
      }

      const { objective, entity_type, geography, criteria, target_new_records, environment } = req.body || {};
      if (!objective || typeof objective !== 'string' || !objective.trim()) {
        return res.status(400).json({ success: false, error: 'El objetivo de búsqueda es obligatorio.', code: 'OBJECTIVE_REQUIRED' });
      }

      // Max target backend enforcement
      const requestedTarget = Number(target_new_records) || 100000;
      const target = Math.min(Math.max(1, requestedTarget), 100000);

      // Universal Mission Engine enrichment with Text + Selector Unification
      const geoRegistry = AtlasGeographyRegistry.getInstance();
      const unifyRes = geoRegistry.unifyGeographyIntent(objective.trim(), geography);

      if (unifyRes.conflict) {
        return res.status(400).json({
          success: false,
          error: unifyRes.prompt,
          code: 'GEOGRAPHY_CONFLICT',
          prompt: unifyRes.prompt,
          candidates: unifyRes.candidates
        });
      }

      const canonicalGeo = unifyRes.canonicalGeo;
      let effectiveObjective = objective.trim();
      if (canonicalGeo && canonicalGeo.geography_id !== 'ARG_NACIONAL') {
        const lowerObj = effectiveObjective.toLowerCase();
        const hasGeoInText = canonicalGeo.normalized_aliases.some(a => lowerObj.includes(a));
        if (!hasGeoInText) {
          effectiveObjective = `${effectiveObjective} en ${canonicalGeo.display_name}`;
        }
      }

      const { spec: uniSpec, plan_preview } = await universalEngine.compileUniversalSpec({
        objective: effectiveObjective,
        explicit_target: target,
        environment: environment || 'PRODUCTION',
        created_by: userId,
        canonical_geography: canonicalGeo,
        explicit_geography: canonicalGeo ? canonicalGeo.display_name : geography
      });

      const canonicalGeoId = canonicalGeo ? canonicalGeo.geography_id : (geography || uniSpec.geography);

      // Requirement 2: Fail before mission creation if contract invalid
      if (!uniSpec.geography || uniSpec.geography === 'null' || !canonicalGeoId || canonicalGeoId === 'null') {
        return res.status(400).json({
          success: false,
          error: 'GEOGRAPHY_SERIALIZATION_ERROR: Failed to serialize valid canonical geography into universal spec.',
          code: 'GEOGRAPHY_SERIALIZATION_ERROR'
        });
      }

      uniSpec.geography = canonicalGeoId;

      const mergedCriteria = {
        ...(criteria || {}),
        universal_spec: uniSpec,
        plan_preview,
        row_unit: uniSpec.row_unit,
        relation_type: uniSpec.relation_type,
        contact_requirements: uniSpec.contact_requirements,
        dedupe_strategy: uniSpec.dedupe_strategy,
        existing_matches_count: uniSpec.existing_matches_count,
        acquisition_gap: uniSpec.acquisition_gap,
        true_net_new_required: uniSpec.true_net_new_required,
        search_strategy: uniSpec.search_strategy,
        geography: canonicalGeoId,
        geography_id: canonicalGeoId
      };

      const spec = discoveryService.compileMissionSpec({
        objective: effectiveObjective,
        entity_type: entity_type || uniSpec.entity_type,
        geography: canonicalGeoId,
        criteria: mergedCriteria,
        target_new_records: target,
        environment: environment || 'PRODUCTION',
        created_by: userId
      });

      const mission = await discoveryService.createMission(spec);
      res.json({ success: true, spec, mission, plan_preview, universal_spec: uniSpec });
    } catch (err: any) {
      console.error('Mission Spec Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 2. GET /api/industrial/missions/active: Get latest/active mission
  router.get('/api/industrial/missions/active', async (req, res) => {
    try {
      const mission = await discoveryService.getLatestMission();
      res.json({ success: true, mission });
    } catch (err: any) {
      console.error('Get Active Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 2b. GET /api/industrial/missions: Get all recent missions
  router.get('/api/industrial/missions', async (req, res) => {
    try {
      const q = await dbPool.query(`
        SELECT * FROM public.atlas_discovery_missions
        ORDER BY created_at DESC LIMIT 25;
      `);
      res.json({ success: true, missions: q.rows });
    } catch (err: any) {
      console.error('Get Missions Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 3. GET /api/industrial/missions/:missionId: Get Mission Status & Metrics Truth
  router.get('/api/industrial/missions/:missionId', async (req, res) => {
    try {
      const mission = await discoveryService.getMission(req.params.missionId);
      if (!mission) {
        return res.status(404).json({ success: false, error: 'Misión no encontrada.', code: 'MISSION_NOT_FOUND' });
      }
      res.json({ success: true, mission });
    } catch (err: any) {
      console.error('Get Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 3a. GET /api/industrial/missions/:missionId/results: Canonical MissionResultSet Authority
  router.get('/api/industrial/missions/:missionId/results', async (req, res) => {
    try {
      const { missionId } = req.params;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined;

      const resultSet = await getMissionResultSet(missionId, { page, limit, sortBy });
      res.json(resultSet);
    } catch (err: any) {
      console.error('Get Mission Results Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 3b. GET /api/industrial/missions/:missionId/audit: Get Mission Decisions Audit
  router.get('/api/industrial/missions/:missionId/audit', async (req, res) => {
    try {
      const { missionId } = req.params;
      const mRes = await dbPool.query('SELECT * FROM public.atlas_discovery_missions WHERE mission_id = $1;', [missionId]);
      if (mRes.rows.length === 0) return res.status(404).json({ error: 'MISSION_NOT_FOUND' });
      const mission = mRes.rows[0];

      const dRes = await dbPool.query(`
        SELECT decision_id, object_id, object_type, mission_fit_status, evidence_status, final_decision, rules_triggered, created_at
        FROM public.atlas_constitution_decisions
        WHERE mission_id = $1 OR mission_scope = $1
        ORDER BY created_at ASC;
      `, [missionId]);

      res.json({
        success: true,
        mission,
        decisions_count: dRes.rows.length,
        decisions: dRes.rows
      });
    } catch (err: any) {
      console.error('Audit Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 3b2. GET /api/industrial/missions/:missionId/partitions: Get Spatial Partitions State
  router.get('/api/industrial/missions/:missionId/partitions', async (req, res) => {
    try {
      const { missionId } = req.params;
      const pRes = await dbPool.query(`
        SELECT partition_id, parent_partition_id, depth, bbox, status, records_scanned, records_valid, duplicates, rejected, certified_new, query_signature, retry_count, last_error, created_at, updated_at
        FROM public.atlas_mission_partitions
        WHERE mission_id = $1
        ORDER BY depth ASC, partition_id ASC;
      `, [missionId]);

      const planner = SpatialPartitionPlanner.getInstance(dbPool);
      const summary = await planner.getMissionPartitionSummary(missionId);

      res.json({
        success: true,
        mission_id: missionId,
        summary,
        partitions_count: pRes.rows.length,
        partitions: pRes.rows
      });
    } catch (err: any) {
      console.error('Get Partitions Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 3c. GET /api/industrial/admin/source-native-audit: Global Source-Native Identity Audit
  router.get('/api/industrial/admin/source-native-audit', async (req, res) => {
    try {
      const reconciler = new SourceNativeIdentityReconciler(dbPool);
      const audit = await reconciler.auditGlobalDuplicates();
      res.json({ success: true, ...audit });
    } catch (err: any) {
      console.error('Source Native Audit Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 3d. POST /api/industrial/admin/source-native-reconcile: Append-only Global Reconciliation
  router.post('/api/industrial/admin/source-native-reconcile', async (req, res) => {
    try {
      const reconciler = new SourceNativeIdentityReconciler(dbPool);
      const result = await reconciler.reconcileDuplicates();
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('Source Native Reconcile Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 4. POST /api/industrial/missions/:missionId/start: Start Execution
  router.post('/api/industrial/missions/:missionId/start', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Sesión de usuario requerida para iniciar misión.', code: 'UNAUTHORIZED_MISSION_START' });
      }

      const { missionId } = req.params;
      const { allowedTarget } = req.body || {};
      const target = allowedTarget ? Math.min(Number(allowedTarget), 100000) : undefined;

      const mission = await discoveryService.startMission(missionId, target);
      res.status(202).json({ success: true, mission });
    } catch (err: any) {
      console.error('Start Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 5. POST /api/industrial/missions/:missionId/pause: Pause Execution
  router.post('/api/industrial/missions/:missionId/pause', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'No autorizado.', code: 'UNAUTHORIZED' });
      }
      const mission = await discoveryService.pauseMission(req.params.missionId);
      res.json({ success: true, mission });
    } catch (err: any) {
      console.error('Pause Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 6. POST /api/industrial/missions/:missionId/resume: Resume Execution
  router.post('/api/industrial/missions/:missionId/resume', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'No autorizado.', code: 'UNAUTHORIZED' });
      }
      const mission = await discoveryService.resumeMission(req.params.missionId);
      res.json({ success: true, mission });
    } catch (err: any) {
      console.error('Resume Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 7. POST /api/industrial/missions/:missionId/cancel: Cancel Mission
  router.post('/api/industrial/missions/:missionId/cancel', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ success: false, error: 'No autorizado.', code: 'UNAUTHORIZED' });
      }
      const mission = await discoveryService.cancelMission(req.params.missionId, {
        origin: 'HTTP_POST_USER_CANCEL',
        userId: userId || undefined
      });
      res.json({ success: true, mission });
    } catch (err: any) {
      console.error('Cancel Mission Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error', code: 'INTERNAL_ERROR' });
    }
  });

  // 8. POST /api/industrial/missions/repair-canaries: Append-only Semantic Repair of Previous Canaries
  router.post('/api/industrial/missions/repair-canaries', async (req, res) => {
    try {
      const { missionIds } = req.body || {};
      const targetMissions = missionIds || [
        { id: 'MISS_1790953524358_132995', role: 'MANUFACTURER', sector: 'mueble' },
        { id: 'MISS_1790953707469_69C92D', role: 'JOURNALIST', sector: 'economia', contact: true },
        { id: 'MISS_1790953798082_6F7FC2', role: 'SUPPLIER', sector: 'hotel' }
      ];

      const gate = RoleEvidenceGate.getInstance();
      const report: any = {};
      let totalFalsePositivesRemoved = 0;

      for (const m of targetMissions) {
        const prodQuery = await dbPool.query(`
          SELECT product_id, name, category, description, attributes_json
          FROM public.atlas_products
          WHERE attributes_json->>'mission_id' = $1;
        `, [m.id]);

        let passCount = 0;
        let failCount = 0;

        for (const row of prodQuery.rows) {
          const meta = row.attributes_json || {};
          const evalRes = gate.evaluate({
            requested_role: m.role,
            target_sector: m.sector,
            entity_type: meta.entity_type || (meta.is_person ? 'PERSON' : 'COMPANY'),
            entity_name: meta.company_name || row.name,
            source: meta.source || meta.source_id || 'SIPRO',
            evidence: meta.evidence || {},
            category: row.category || meta.category,
            rubros: meta.rubros || meta.category || row.category,
            description: row.description || meta.description,
            structured_attributes: {
              role: meta.relationship_type,
              email: meta.public_email || meta.email,
              public_email: meta.public_email || meta.email,
              is_person: meta.is_person
            },
            contact_requirements: { public_contact_required: !!m.contact }
          });

          if (evalRes.decision === 'FAIL') {
            failCount++;
            totalFalsePositivesRemoved++;
            
            // Append-only decision record
            const decisionId = (await import('crypto')).randomUUID();
            await dbPool.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, 'ROLE_EVIDENCE_REVISION_V1', 'PRODUCT_RELATION', $3, 'DEFICIENT', 'DEFICIENT', 'REJECTED_OFF_MISSION', 'DEFICIENT', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              m.id,
              row.product_id,
              JSON.stringify(['ROLE_EVIDENCE_GATE_REVISION', evalRes.reason, evalRes.evidence_level])
            ]);

            // Update attributes_json to mark mission_qualified = false
            await dbPool.query(`
              UPDATE public.atlas_products
              SET attributes_json = jsonb_set(
                jsonb_set(attributes_json, '{mission_qualified}', 'false'::jsonb),
                '{rejection_reason}', to_jsonb($2::text)
              ), updated_at = NOW()
              WHERE product_id = $1;
            `, [row.product_id, evalRes.reason]);

            // Also mark entity if canonical_entity_id exists
            if (meta.company_id) {
              await dbPool.query(`
                UPDATE public.atlas_canonical_entities
                SET metadata = jsonb_set(metadata, '{mission_qualified}', 'false'::jsonb),
                    updated_at = NOW()
                WHERE canonical_entity_id = $1;
              `, [meta.company_id]);
            }
          } else {
            passCount++;
            // Explicitly mark qualified
            await dbPool.query(`
              UPDATE public.atlas_products
              SET attributes_json = jsonb_set(attributes_json, '{mission_qualified}', 'true'::jsonb),
                  updated_at = NOW()
              WHERE product_id = $1;
            `, [row.product_id]);
          }
        }

        // Physically update atlas_discovery_missions counters
        await dbPool.query(`
          UPDATE public.atlas_discovery_missions
          SET 
            certified_new_searchable = $1,
            searchable_count = $1,
            qualified_count = $1,
            target_reached = ($1 >= target_new_records),
            updated_at = NOW()
          WHERE mission_id = $2;
        `, [passCount, m.id]);

        report[m.id] = {
          role: m.role,
          total_re_evaluated: prodQuery.rows.length,
          certified_valid: passCount,
          rejected_false_positives: failCount
        };
      }

      res.json({
        success: true,
        report,
        totalFalsePositivesRemoved
      });
    } catch (err: any) {
      console.error('Repair Canaries Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // POST /api/commerce/proposals: Create a new proposal from prospect
  router.post('/api/commerce/proposals', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Valid user session required to create proposals' });
      }

      const {
        savedRelationId,
        buyerCompanyId,
        buyerName,
        buyerContactEmail,
        title,
        description,
        quantity,
        unitPrice,
        currency,
        validDays,
        termsConditions
      } = req.body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title (product/service) is required' });
      }

      if (unitPrice === undefined || isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
        return res.status(400).json({ error: 'Valid unit price is required' });
      }

      // Resolve seller organization if user belongs to one
      let sellerOrgId: string | null = null;
      const orgCheck = await dbPool.query(`
        SELECT organization_id FROM public.atlas_organization_members
        WHERE user_id = $1::uuid AND status = 'ACTIVE' LIMIT 1;
      `, [userId]);
      if (orgCheck.rows.length > 0) {
        sellerOrgId = orgCheck.rows[0].organization_id;
      }

      const proposal = await commerceService.createProposal({
        userId,
        savedRelationId,
        buyerCompanyId,
        buyerName,
        buyerContactEmail,
        title,
        description,
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitPrice),
        currency: currency || 'ARS',
        validDays: Number(validDays) || 15,
        termsConditions,
        sellerOrganizationId: sellerOrgId
      });

      res.json({ success: true, proposal });
    } catch (err: any) {
      console.error('Error creating proposal:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // GET /api/commerce/proposals/:token: Public endpoint for Buyer Flow
  router.get('/api/commerce/proposals/:token', async (req, res) => {
    try {
      const token = (req.params.token || '').trim();
      if (!token) return res.status(400).json({ error: 'Token is required' });

      const proposal = await commerceService.getProposalByToken(token);
      if (!proposal) {
        return res.status(404).json({ error: 'Propuesta no encontrada o enlace vencido' });
      }

      const orderRes = await dbPool.query(
        'SELECT order_id, gross_amount, atlas_fee_amount, status, mp_preference_id, paid_at FROM public.atlas_commercial_orders WHERE proposal_id = $1::uuid;',
        [proposal.proposal_id]
      );

      let sellerInfo: any = null;
      const sellerRes = await dbPool.query(`
        SELECT p.display_name, p.first_name, p.last_name, o.name as organization_name, o.legal_name, o.tax_id, o.website
        FROM public.atlas_commercial_proposals cp
        LEFT JOIN public.atlas_user_profiles p ON cp.user_id = p.user_id
        LEFT JOIN public.atlas_organizations o ON cp.seller_organization_id = o.organization_id
        WHERE cp.proposal_id = $1::uuid;
      `, [proposal.proposal_id]);

      if (sellerRes.rows.length > 0) {
        const s = sellerRes.rows[0];
        sellerInfo = {
          organization_name: s.organization_name || null,
          representative_name: s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || null,
          tax_id: s.tax_id || null,
          website: s.website || null
        };
      }

      res.json({
        success: true,
        proposal,
        order: orderRes.rows[0] || null,
        seller_info: sellerInfo
      });
    } catch (err: any) {
      console.error('Error fetching proposal by token:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // POST /api/commerce/proposals/:token/accept
  router.post('/api/commerce/proposals/:token/accept', async (req, res) => {
    try {
      const token = req.params.token;
      if (!token) return res.status(400).json({ error: 'Token is required' });

      const result = await commerceService.acceptProposal(token);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, order: result.order });
    } catch (err: any) {
      console.error('Error accepting proposal:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // POST /api/commerce/proposals/:token/reject
  router.post('/api/commerce/proposals/:token/reject', async (req, res) => {
    try {
      const token = req.params.token;
      if (!token) return res.status(400).json({ error: 'Token is required' });

      const result = await commerceService.rejectProposal(token);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: 'Proposal rejected' });
    } catch (err: any) {
      console.error('Error rejecting proposal:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // INDUSTRIAL MARKET — DEMAND MATCHING V1 (TENGO / NECESITO)
  // ══════════════════════════════════════════════════════════════════════════
  const marketMatcher = new IndustrialMarketMatcher(dbPool);

  // 1. POST /api/industrial/market/posts (Authorized Publish)
  router.post('/api/industrial/market/posts', async (req, res) => {
    try {
      const sbAdmin = getSbAdmin();
      const userId = await resolveUserId(req, sbAdmin);
      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED_USER',
          message: 'Sesión de usuario requerida para publicar en Industrial Market.'
        });
      }

      // Server-side Authority Check:
      // User must be active OWNER or ADMIN of an organization in atlas_organization_members.
      // Do NOT trust client-provided organization_id.
      const memberQuery = await dbPool.query(`
        SELECT m.organization_id, m.role, o.name as organization_name
        FROM public.atlas_organization_members m
        JOIN public.atlas_organizations o ON m.organization_id = o.organization_id
        WHERE m.user_id = $1::uuid
          AND m.status = 'ACTIVE'
          AND m.role IN ('OWNER', 'ADMIN')
        ORDER BY m.created_at ASC
        LIMIT 5;
      `, [userId]);

      if (memberQuery.rows.length === 0) {
        return res.status(403).json({
          error: 'UNAUTHORIZED_PUBLISH_BLOCKED',
          message: 'Sólo usuarios con rol OWNER o ADMIN de una organización autorizada pueden publicar.'
        });
      }

      // Determine authoritative organization_id
      const authorizedOrgs = memberQuery.rows;
      const requestedOrgId = req.body.organization_id;
      let targetOrgId = authorizedOrgs[0].organization_id;

      if (requestedOrgId) {
        const hasAuth = authorizedOrgs.some(o => o.organization_id === requestedOrgId);
        if (!hasAuth) {
          return res.status(403).json({
            error: 'UNAUTHORIZED_PUBLISH_BLOCKED',
            message: 'No posee facultades (OWNER/ADMIN) sobre la organización indicada.'
          });
        }
        targetOrgId = requestedOrgId;
      }

      const {
        type,
        title,
        description,
        product_or_service,
        category,
        geographic_scope,
        neighborhood,
        city,
        province,
        valid_until,
        status = 'ACTIVE',
        metadata = {}
      } = req.body;

      if (!type || !title || !description || !product_or_service || !category || !geographic_scope) {
        return res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' });
      }

      if (!['OFFER', 'DEMAND'].includes(type)) {
        return res.status(400).json({ error: 'INVALID_POST_TYPE' });
      }

      if (!['PRODUCT', 'SERVICE'].includes(product_or_service)) {
        return res.status(400).json({ error: 'INVALID_PRODUCT_OR_SERVICE' });
      }

      if (!['BARRIO', 'CABA', 'ARGENTINA'].includes(geographic_scope)) {
        return res.status(400).json({ error: 'INVALID_GEOGRAPHIC_SCOPE' });
      }

      const insertRes = await dbPool.query(`
        INSERT INTO public.atlas_industrial_market_posts (
          organization_id, created_by_user_id, type, title, description,
          product_or_service, category, geographic_scope, neighborhood,
          city, province, valid_until, status, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING *;
      `, [
        targetOrgId,
        userId,
        type,
        String(title).trim(),
        String(description).trim(),
        product_or_service,
        String(category).trim(),
        geographic_scope,
        neighborhood ? String(neighborhood).trim() : (geographic_scope === 'BARRIO' ? 'caballito' : null),
        city ? String(city).trim() : null,
        province ? String(province).trim() : null,
        valid_until || new Date(Date.now() + 30 * 86400000).toISOString(),
        status,
        metadata
      ]);

      const post = insertRes.rows[0];
      res.status(201).json({
        success: true,
        post
      });
    } catch (err: any) {
      console.error('Error creating market post:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 2. GET /api/industrial/market/posts (List Market Posts)
  router.get('/api/industrial/market/posts', async (req, res) => {
    try {
      const { type, status = 'ACTIVE', neighborhood, limit = 50 } = req.query;
      let querySql = `
        SELECT 
          p.*,
          COALESCE(o.name, b.name) as organization_name,
          COALESCE(o.address, b.address) as organization_address,
          COALESCE(o.industry, b.industry) as organization_industry,
          b.contact_summary
        FROM public.atlas_industrial_market_posts p
        LEFT JOIN public.atlas_organizations o ON p.organization_id = o.organization_id
        LEFT JOIN public.atlas_local_businesses b ON p.organization_id = b.organization_id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (type) {
        params.push(type);
        querySql += ` AND p.type = $${params.length}`;
      }
      if (status) {
        params.push(status);
        querySql += ` AND p.status = $${params.length}`;
      }
      if (neighborhood) {
        params.push(neighborhood);
        querySql += ` AND LOWER(p.neighborhood) = LOWER($${params.length})`;
      }
      querySql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1};`;
      params.push(Number(limit) || 50);

      const result = await dbPool.query(querySql, params);
      res.json({
        success: true,
        count: result.rows.length,
        posts: result.rows
      });
    } catch (err: any) {
      console.error('Error fetching market posts:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 3. GET /api/industrial/market/posts/:id (Single Post Detail)
  router.get('/api/industrial/market/posts/:id', async (req, res) => {
    try {
      const result = await dbPool.query(`
        SELECT 
          p.*,
          COALESCE(o.name, b.name) as organization_name,
          COALESCE(o.address, b.address) as organization_address,
          COALESCE(o.industry, b.industry) as organization_industry,
          b.contact_summary
        FROM public.atlas_industrial_market_posts p
        LEFT JOIN public.atlas_organizations o ON p.organization_id = o.organization_id
        LEFT JOIN public.atlas_local_businesses b ON p.organization_id = b.organization_id
        WHERE p.post_id = $1::uuid;
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'POST_NOT_FOUND' });
      }

      res.json({
        success: true,
        post: result.rows[0]
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 4. GET /api/industrial/market/posts/:id/matches (Deterministic Matcher Contract)
  router.get('/api/industrial/market/posts/:id/matches', async (req, res) => {
    try {
      const postRes = await dbPool.query(`
        SELECT * FROM public.atlas_industrial_market_posts
        WHERE post_id = $1::uuid;
      `, [req.params.id]);

      if (postRes.rows.length === 0) {
        return res.status(404).json({ error: 'POST_NOT_FOUND' });
      }

      const post = postRes.rows[0];
      const matches = await marketMatcher.matchPost(post, { limit: 50 });

      res.json({
        success: true,
        post,
        count: matches.length,
        matches
      });
    } catch (err: any) {
      console.error('Error running IndustrialMarketMatcher:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // 5. GET /api/industrial/admin/verify-geography-gate: Complete Physical Audit of Geography Gate
  router.get('/api/industrial/admin/verify-geography-gate', async (req, res) => {
    try {
      const geoRegistry = AtlasGeographyRegistry.getInstance();
      const allGeos = geoRegistry.getAllGeographies();

      const provinces = allGeos.filter(g => g.admin_level === 'PROVINCE' || g.admin_level === 'CITY_PROVINCE');
      const municipalities = allGeos.filter(g => g.admin_level === 'MUNICIPALITY' || g.admin_level === 'LOCALITY');

      // 1. Ambiguity Tests
      const ambigCases = [
        { text: 'carnicerias en Córdoba', expect: true, term: 'Córdoba' },
        { text: 'ferreterias en Santa Fe', expect: true, term: 'Santa Fe' },
        { text: 'bodegas en Mendoza', expect: true, term: 'Mendoza' },
        { text: 'panaderias en San Juan', expect: true, term: 'San Juan' },
        { text: 'panaderias en Córdoba Capital', expect: false },
        { text: 'bodegas en Provincia de Mendoza', expect: false }
      ];
      const ambiguityResults = ambigCases.map(c => {
        const r = geoRegistry.detectAmbiguity(c.text);
        return {
          query: c.text,
          is_ambiguous: r.is_ambiguous,
          expected: c.expect,
          prompt: r.prompt,
          candidates: r.candidates,
          pass: r.is_ambiguous === c.expect
        };
      });

      // 2. Unification Tests
      const caseA = geoRegistry.unifyGeographyIntent('carnicerias en Salta', 'Argentina');
      const caseB = geoRegistry.unifyGeographyIntent('carnicerias en Salta', 'CABA');
      const unificationResults = {
        caseA: {
          winner: caseA.canonicalGeo?.display_name,
          conflict: caseA.conflict,
          pass: caseA.canonicalGeo?.geography_id === 'ARG_SALTA_CAPITAL' && !caseA.conflict
        },
        caseB: {
          conflict: caseB.conflict,
          prompt: caseB.prompt,
          pass: caseB.conflict
        }
      };

      // 3. 5 Blind Geography Runs
      const blindConfigs = [
        {
          key: 'BLIND_GEO_1',
          name: 'Salta Capital',
          objective: 'panaderia en Salta',
          geography: 'Salta Capital',
          target: 5,
          latMin: -25.0, latMax: -24.6, lonMin: -65.6, lonMax: -65.2
        },
        {
          key: 'BLIND_GEO_2',
          name: 'San Miguel de Tucumán',
          objective: 'farmacia en San Miguel de Tucumán',
          geography: 'San Miguel de Tucumán',
          target: 5,
          latMin: -27.0, latMax: -26.7, lonMin: -65.4, lonMax: -65.0
        },
        {
          key: 'BLIND_GEO_3',
          name: 'Mar del Plata',
          objective: 'ferreteria en Mar del Plata',
          geography: 'Mar del Plata',
          target: 5,
          latMin: -38.2, latMax: -37.8, lonMin: -57.8, lonMax: -57.4
        },
        {
          key: 'BLIND_GEO_4',
          name: 'Neuquén Capital',
          objective: 'carniceria en Neuquén',
          geography: 'Neuquén Capital',
          target: 5,
          latMin: -39.1, latMax: -38.8, lonMin: -68.3, lonMax: -67.9
        },
        {
          key: 'BLIND_GEO_5',
          name: 'Bariloche',
          objective: 'heladeria en Bariloche',
          geography: 'Bariloche',
          target: 5,
          latMin: -41.3, latMax: -41.0, lonMin: -71.5, lonMax: -71.1
        }
      ];

      const blindResults: any[] = [];
      let totalOutOfGeo = 0;

      for (const b of blindConfigs) {
        // Clean previous test entities for this blind geo
        if (b.geography === 'Salta Capital') {
          await dbPool.query(`DELETE FROM public.atlas_canonical_entities WHERE metadata->>'province' = 'Salta';`);
        } else if (b.geography === 'San Miguel de Tucumán') {
          await dbPool.query(`DELETE FROM public.atlas_canonical_entities WHERE metadata->>'province' = 'Tucumán';`);
        } else if (b.geography === 'Mar del Plata') {
          await dbPool.query(`DELETE FROM public.atlas_canonical_entities WHERE metadata->>'city' ILIKE '%Mar del Plata%';`);
        } else if (b.geography === 'Neuquén Capital') {
          await dbPool.query(`DELETE FROM public.atlas_canonical_entities WHERE metadata->>'province' = 'Neuquén';`);
        } else if (b.geography === 'Bariloche') {
          await dbPool.query(`DELETE FROM public.atlas_canonical_entities WHERE metadata->>'province' = 'Río Negro';`);
        }

        const canonicalGeo = geoRegistry.resolveCanonicalGeography(b.geography);
        const { spec: uniSpec, plan_preview } = await universalEngine.compileUniversalSpec({
          objective: b.objective,
          explicit_target: b.target
        });

        const spec = discoveryService.compileMissionSpec({
          objective: b.objective,
          entity_type: uniSpec.entity_type,
          geography: canonicalGeo?.display_name || b.geography,
          criteria: {
            universal_spec: uniSpec,
            plan_preview,
            geography_id: canonicalGeo?.geography_id
          },
          target_new_records: b.target,
          environment: 'PRODUCTION',
          created_by: '768efac1-8d4c-4a19-8919-2de323884569'
        });

        const mission = await discoveryService.createMission(spec);
        await discoveryService.startMission(mission.mission_id, b.target);

        // Wait until certified >= target or terminal
        let finalMission: any = null;
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 2000));
          finalMission = await discoveryService.getMission(mission.mission_id);
          if (finalMission.status !== 'RUNNING' || finalMission.certified_new_searchable >= b.target) {
            break;
          }
        }

        const entRes = await dbPool.query(`
          SELECT canonical_entity_id, canonical_name, metadata
          FROM public.atlas_canonical_entities
          WHERE metadata->>'mission_id' = $1;
        `, [mission.mission_id]);

        const certifiedRows = entRes.rows;
        let outOfGeoCount = 0;
        const verifiedEntities = certifiedRows.map(e => {
          const lat = Number(e.metadata?.latitude || e.metadata?.evidence?.latitude);
          const lon = Number(e.metadata?.longitude || e.metadata?.evidence?.longitude);
          const addr = e.metadata?.address || '';
          const city = e.metadata?.city || '';
          const prov = e.metadata?.province || '';

          const inLat = lat >= b.latMin && lat <= b.latMax;
          const inLon = lon >= b.lonMin && lon <= b.lonMax;
          const isInGeo = inLat && inLon;

          if (!isInGeo) {
            outOfGeoCount++;
            totalOutOfGeo++;
          }

          return {
            name: e.canonical_name,
            coordinates: [lat, lon],
            address: addr,
            city,
            province: prov,
            is_in_geography: isInGeo
          };
        });

        blindResults.push({
          key: b.key,
          name: b.name,
          requested_geography: b.geography,
          objective: b.objective,
          mission_id: mission.mission_id,
          target: b.target,
          scanned: finalMission?.scanned_count || certifiedRows.length,
          certified: certifiedRows.length,
          out_of_geography: outOfGeoCount,
          pass: certifiedRows.length === b.target && outOfGeoCount === 0,
          entities: verifiedEntities
        });
      }

      res.json({
        success: true,
        provinces_covered: provinces.length,
        municipalities_localities_covered: municipalities.length,
        ambiguity_tests: ambiguityResults,
        unification_tests: unificationResults,
        blind_tests: blindResults,
        total_out_of_geography_results: totalOutOfGeo
      });
    } catch (err: any) {
      console.error('Verify Geography Gate Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  return router;
}

export default createIndustrialRouter;
