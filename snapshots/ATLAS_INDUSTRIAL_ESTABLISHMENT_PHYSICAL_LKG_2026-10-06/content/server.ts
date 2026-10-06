import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import { FederatedPersonSearch } from './src/lib/search/FederatedPersonSearch.ts';
import { QueryIntentParser } from './src/lib/search/UniversalQueryModel.ts';
import { MassDiscoveryEngine } from './src/lib/search/MassDiscoveryEngine.ts';
import { OnDemandEnrichmentEngine } from './src/lib/search/OnDemandEnrichmentEngine.ts';
import { getAtlasPeopleScaleMetrics, invalidatePeopleScaleMetricsCache } from './src/lib/search/AtlasPeopleScaleMetrics.ts';
import { AtlasPeopleSearchV2 } from './src/lib/search/AtlasPeopleSearchV2.ts';
import { AtlasLiveTelemetryService } from './src/lib/search/telemetry/AtlasLiveTelemetryService.ts';
import { createClient } from '@supabase/supabase-js';
import { IndustrialSearchRepository } from './src/lib/search/repositories/IndustrialSearchRepository.ts';
import { AtlasContactEngineInterface } from './src/lib/search/AtlasContactEngineInterface.ts';
import { AtlasCommerceService } from './src/lib/commerce/AtlasCommerceService.ts';
import pg from 'pg';
import { createPlatformRouter } from './server/routes/platform.ts';
import { createIndustrialRouter } from './server/routes/industrial.ts';
import { createStreamingRouter } from './server/routes/streaming.ts';
import { AtlasMailService } from './server/services/atlas-mail/AtlasMailService.ts';
import { createMailRouter } from './server/routes/mail/mailRoutes.ts';
import { AtlasSSOCoordinator } from './server/services/auth-sso/AtlasSSOCoordinator.ts';
import { createSSORouter } from './server/routes/auth/ssoRoutes.ts';
import { createLocalRouter } from './server/routes/atlasLocal.ts';
import { AtlasHotClientsService } from './server/services/commercial/AtlasHotClientsService.ts';
import { createDatasetRouter } from './server/routes/datasets.ts';

import { dbPool } from './server/db.ts';
import { AtlasRuntimeIdentity } from './server/services/runtime/AtlasRuntimeIdentity.ts';

// Helper: Resolve User ID strictly from authenticated JWT session (auth.uid())
async function resolveUserId(req: express.Request, sbAdmin: any): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
  
  if (token) {
    try {
      const { data, error } = await sbAdmin.auth.getUser(token);
      if (!error && data?.user?.id) {
        return data.user.id;
      }
    } catch (err) {
      console.error('JWT auth verification failed:', err);
    }
    return null;
  }

  // Allow x-user-id header or dev fallback
  const devUserId = (req.headers['x-user-id'] as string);
  if (devUserId && /^[0-9a-f-]{36}$/i.test(devUserId)) {
    return devUserId;
  }

  if (process.env.NODE_ENV !== 'production') {
    return '768efac1-8d4c-4a19-8919-2de323884569';
  }

  return null;
}

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-atlas-test-auth', 'Accept', 'Origin']
}));
app.use(express.json());

const massEngine = new MassDiscoveryEngine();
const liveTelemetry = AtlasLiveTelemetryService.getInstance();
const contactEngine = new AtlasContactEngineInterface(dbPool);
const commerceService = new AtlasCommerceService(dbPool);
const mailService = new AtlasMailService(dbPool);
const ssoCoordinator = new AtlasSSOCoordinator();
const hotClientsService = new AtlasHotClientsService(dbPool);
hotClientsService.ensureSchema().catch(e => console.error('[HotClientsService] Schema init error:', e));

// ─── MODULAR PRODUCT ROUTERS (PHASE 1 IN-PLACE SEPARATION) ───
app.use(createPlatformRouter({ dbPool, liveTelemetry, contactEngine, resolveUserId }));
app.use(createIndustrialRouter({ dbPool, commerceService, resolveUserId }));
app.use(createStreamingRouter({ massEngine }));

// ─── SHARED HORIZONTAL SERVICES (PHASE 2 ATLAS MAIL CONTROL PLANE) ───
app.use('/api/mail', createMailRouter({ mailService, resolveUserId }));

// ─── CENTRAL AUTH GATEWAY & SSO COORDINATOR (PHASE 3B) ───
app.use('/api/auth/sso', createSSORouter({ ssoCoordinator, resolveUserId }));

// ─── ATLAS LOCAL ROUTER (PHASE AL-1) ───
app.use(createLocalRouter({ dbPool, resolveUserId }));

// ─── ATLAS VIRTUAL DATASETS ROUTER (V1 SHADOW) ───
app.use(createDatasetRouter({ dbPool, resolveUserId }));

// GET /api/atlas/live-metrics: Independent Persistent Live Metrics SSOT
app.get('/api/atlas/live-metrics', async (req, res) => {
  try {
    await liveTelemetry.syncWithPostgres();
    res.json({
      metrics: liveTelemetry.getLiveMetrics(),
      snapshot: liveTelemetry.getStartSnapshot()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/atlas/realtime-snapshot: Pure physical baseline snapshot
app.get('/api/atlas/realtime-snapshot', (req, res) => {
  try {
    res.json({ snapshot: liveTelemetry.getStartSnapshot() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/atlas/live-events: Event-Driven SSE Primary Stream & Cursor Replay Fallback
app.get('/api/atlas/live-events', (req, res) => {
  try {
    const isSSE = req.headers.accept && req.headers.accept.includes('text/event-stream');
    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

      // Initial stream payload
      const initialData = JSON.stringify({
        type: 'INITIAL_STATE',
        metrics: liveTelemetry.getLiveMetrics(),
        recent_events: liveTelemetry.getEventsSince()
      });
      res.write(`event: initial\ndata: ${initialData}\n\n`);

      const unsubscribe = liveTelemetry.subscribe((event, currentMetrics) => {
        if (!event.timestamps) (event as any).timestamps = {};
        event.timestamps.t_sse_server_send = Date.now();
        res.write(`event: update\ndata: ${JSON.stringify({ event, metrics: currentMetrics })}\n\n`);
      });

      const pingTimer = setInterval(() => {
        res.write(': ping\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(pingTimer);
        unsubscribe();
      });
      return;
    }

    // Cursor-based polling fallback
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const events = liveTelemetry.getEventsSince(cursor);
    const metrics = liveTelemetry.getLiveMetrics();
    res.json({
      events,
      metrics,
      cursor: events.length > 0 ? events[events.length - 1].event_id : cursor
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/atlas/emit-event: Ingestion/Worker physical event emitter
app.post('/api/atlas/emit-event', (req, res) => {
  try {
    const emitted = liveTelemetry.emitEvent(req.body);
    res.json({ success: true, event: emitted, metrics: liveTelemetry.getLiveMetrics() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/atlas/reset-baseline: Resets live read model to start snapshot
app.post('/api/atlas/reset-baseline', (req, res) => {
  try {
    liveTelemetry.resetToBaseline();
    res.json({ success: true, snapshot: liveTelemetry.getStartSnapshot(), metrics: liveTelemetry.getLiveMetrics() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/atlas/people-metrics: Single Source of Truth Scale Metrics
app.get('/api/atlas/people-metrics', async (req, res) => {
  try {
    const metrics = await getAtlasPeopleScaleMetrics();
    res.json(metrics);
  } catch (err: any) {
    console.error('Scale Metrics Error:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate scale metrics' });
  }
});

// POST /api/atlas/people-metrics/refresh: Admin cache invalidation and re-calculation
app.post('/api/atlas/people-metrics/refresh', async (req, res) => {
  try {
    invalidatePeopleScaleMetricsCache();
    const metrics = await getAtlasPeopleScaleMetrics({ forceRefresh: true });
    res.json(metrics);
  } catch (err: any) {
    console.error('Metrics Refresh Error:', err);
    res.status(500).json({ error: err.message || 'Failed to refresh metrics' });
  }
});

// POST /api/atlas/people-search: Server-side PostgreSQL Person Search V2
app.post('/api/atlas/people-search', async (req, res) => {
  try {
    const result = await AtlasPeopleSearchV2.search(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('Person Search V2 Error:', err);
    res.status(500).json({ error: err.message || 'Person search failed' });
  }
});

// POST /api/mass-discovery: Real large-scale mass discovery endpoint
app.post('/api/mass-discovery', async (req, res) => {
  try {
    const { query, search_session_id, budget, page, page_size, atlas_indexed_total } = req.body;
    
    console.log(`[POST /api/mass-discovery] query="${query}", session="${search_session_id || 'NEW'}", budget="${budget || 'STANDARD'}", page=${page || 1}`);

    const result = await massEngine.discover({
      query,
      search_session_id,
      budget: budget || 'STANDARD',
      page: page || 1,
      page_size: page_size || 50,
      atlas_indexed_total: atlas_indexed_total || 0
    });

    res.json(result);
  } catch (err: any) {
    console.error('Mass Discovery Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/mass-discovery/enrich: Lazy on-demand viewport card enrichment
app.post('/api/mass-discovery/enrich', async (req, res) => {
  try {
    const { records, options } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records array required' });
    }
    const enriched = await OnDemandEnrichmentEngine.enrichRecords(records, options);
    res.json({ enriched });
  } catch (err: any) {
    console.error('Enrichment Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Existing federated search endpoint
app.post('/api/federated-search', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");

    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Admin authorization check
    const { data: membership, error: memberErr } = await sbAdmin
      .from('atlas_admin_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberErr || !membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    
    const { name, profession, location_filter, mode = 'ALL_SOURCES' } = req.body;
    
    const queryToParse = `${name || ''} ${profession || ''} ${location_filter || ''}`.trim();
    const intent = QueryIntentParser.parse(queryToParse);
    
    const filters = {
      name: intent.person_name,
      profession: intent.profession || intent.occupation || intent.trade || intent.role_class || profession,
      location_filter: intent.geography || location_filter,
      structured_location: intent.geography ? { jurisdiction: intent.geography, city: intent.geography } : undefined,
      query_intent: intent
    };
    
    const federatedSearch = new FederatedPersonSearch(undefined, sbAdmin);
    const results = await federatedSearch.search(filters, mode, true);
    
    console.log('Federated Search executed. Stats:', results.stats);
    console.log('Source Trace:', JSON.stringify(results.source_trace, null, 2));
    
    res.json(results);
  } catch (err: any) {
    console.error('Federated Search Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/industrial-search: Industrial Company Search
app.post('/api/industrial-search', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");

    // Client for auth
    const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
    let user = null;
    
    if (token) {
      const { data, error: authError } = await sbAdmin.auth.getUser(token);
      if (!authError && data.user) {
        user = data.user;
      }
    }
    
    // Auth is optional for industrial search (like a public search engine)

    const { query, limit, page, sortBy, missionId, mission_id } = req.body;
    const effectiveMissionId = missionId || mission_id;
    
    const repo = new IndustrialSearchRepository(sbAdmin);
    const results = await repo.search({ query, limit, page, sortBy, missionId: effectiveMissionId });
    
    res.json(results);
  } catch (err: any) {
    console.error('Industrial Search Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/contacts/resolve-canonical: Explicit Contact Search interface by canonical IDs
app.post('/api/contacts/resolve-canonical', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated JWT session required' });
    }

    const { canonical_ids } = req.body;
    if (!Array.isArray(canonical_ids) || canonical_ids.length === 0) {
      return res.status(400).json({ error: 'canonical_ids array is required' });
    }

    const contacts = await contactEngine.resolveCanonicalContacts(canonical_ids);
    res.json({
      success: true,
      count: Object.keys(contacts).length,
      contacts
    });
  } catch (err: any) {
    console.error('Error resolving canonical contacts:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/user/saved-relations: Retrieve saved records in Mi base with contact enrichment
app.get('/api/user/saved-relations', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated JWT session required', items: [] });
    }

    const baseName = req.query.base_name ? String(req.query.base_name).trim() : null;
    const segmentId = req.query.segment_id ? String(req.query.segment_id).trim() : null;

    let queryText = `
      SELECT 
        s.id as saved_id,
        s.user_id,
        s.product_id,
        s.company_id,
        s.relation_id,
        s.base_name,
        s.saved_at,
        COALESCE(s.commercial_status, 'NEW') as commercial_status,
        s.priority,
        s.notes,
        COALESCE(s.tags, '{}'::text[]) as tags,
        s.last_contact_at,
        s.next_action,
        s.next_action_date,
        s.updated_at,
        COALESCE(p.name, ent.canonical_name, s.metadata->>'company_name', 'Empresa / Proveedor') as product_name,
        COALESCE(p.attributes_json->>'company_name', ent.canonical_name, s.metadata->>'company_name', '') as company_name,
        COALESCE(p.category, ent.metadata->>'category', ent.metadata->>'industry', s.metadata->>'category', 'General') as category,
        COALESCE(p.attributes_json->>'province', ent.metadata->>'province', s.metadata->>'province', '') as province,
        COALESCE(p.attributes_json->>'city', ent.metadata->>'city', s.metadata->>'city', '') as city,
        COALESCE(p.attributes_json->>'website', ent.metadata->>'website', ent.primary_domain, s.metadata->>'website', '') as website,
        COALESCE(p.attributes_json->>'source', ent.metadata->>'source', 'Live Stream / Atlas') as source,
        CASE 
          WHEN p.attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL 
               OR ent.metadata->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL THEN 'CONSTITUTIONAL'
          WHEN p.attributes_json->>'trust_level' = 'LEGACY' OR ent.metadata->>'trust_level' = 'LEGACY' THEN 'LEGACY'
          ELSE 'PENDING'
        END as trust_level,
        COALESCE(p.attributes_json, ent.metadata, '{}'::jsonb) as attributes_json
      FROM public.atlas_user_saved_relations s
      LEFT JOIN public.atlas_products p ON s.product_id = p.product_id
      LEFT JOIN public.atlas_canonical_entities ent ON (s.product_id = ent.canonical_entity_id OR s.company_id = ent.canonical_entity_id)
      WHERE s.user_id = $1::uuid
    `;
    const params: any[] = [userId];

    if (baseName && baseName !== 'ALL') {
      params.push(baseName);
      queryText += ` AND s.base_name = $${params.length}`;
    }

    if (segmentId && segmentId !== 'ALL' && /^[0-9a-f-]{36}$/i.test(segmentId)) {
      params.push(segmentId);
      queryText += ` AND s.id IN (SELECT saved_relation_id FROM public.atlas_user_segment_items WHERE segment_id = $${params.length}::uuid)`;
    }

    queryText += ` ORDER BY s.saved_at DESC;`;

    const client = await dbPool.connect();
    try {
      const result = await client.query(queryText, params);
      
      const env = (process.env.NODE_ENV !== 'production' && req.headers['x-atlas-test-auth'] === 'atlas-test-suite') ? 'TEST_NON_PRODUCTION' : 'REAL';
      const savedIds = result.rows.map((r: any) => r.saved_id);
      const signalsMap = await hotClientsService.getSignalsMap(savedIds, env);

      // Enrich with Contact Engine interface via canonical IDs
      const canonicalIds = Array.from(new Set(
        result.rows.map((r: any) => r.company_id || r.product_id).filter((id: any) => id && /^[0-9a-f-]{36}$/i.test(id))
      )) as string[];

      const contactsMap = await contactEngine.resolveCanonicalContacts(canonicalIds);

      const enrichedItems = result.rows.map((row: any) => {
        const entityId = row.company_id || row.product_id;
        const cData = contactsMap[entityId] || {
          canonical_id: entityId,
          company_name: row.company_name,
          public_emails: [],
          public_phones: [],
          public_website: row.website ? { url: row.website, domain: '' } : null,
          public_contact_forms: [],
          public_associated_contacts: [],
          contactability_level: row.website ? 'LOW' : 'NONE',
          trust_status: 'PENDING',
          has_contact_data: Boolean(row.website),
          evidence_count: 0
        };

        const primaryEmail = cData.public_emails[0]?.email || null;
        const primaryPhone = cData.public_phones[0]?.phone || null;
        const publicWeb = cData.public_website?.url || null;
        const primaryForm = cData.public_contact_forms[0]?.url || null;
        const primaryPerson = cData.public_associated_contacts[0] || null;

        const signals = signalsMap[row.saved_id] || [];
        const commercialIntent = hotClientsService.evaluateCommercialIntent({
          commercial_status: row.commercial_status || 'NEW',
          signals,
          saved_at: row.saved_at
        });

        return {
          ...row,
          public_email: primaryEmail,
          public_phone: primaryPhone,
          website: publicWeb,
          public_contact_form: primaryForm,
          associated_person: primaryPerson,
          all_emails: cData.public_emails,
          all_phones: cData.public_phones,
          all_forms: cData.public_contact_forms,
          all_people: cData.public_associated_contacts,
          contactability_level: cData.contactability_level,
          contact_enrichment: cData,
          suggested_priority: cData.suggested_priority || 'LOW',
          suggested_priority_reasons: cData.suggested_priority_reasons || [],
          has_public_email: cData.public_emails.length > 0,
          has_public_phone: cData.public_phones.length > 0,
          has_public_website: Boolean(publicWeb),
          has_contact_form: cData.public_contact_forms.length > 0,
          has_associated_person: cData.public_associated_contacts.length > 0,
          has_no_contact: !cData.has_contact_data,
          has_direct_contact: cData.public_emails.length > 0 || cData.public_phones.length > 0,
          is_constitutional: row.trust_level === 'CONSTITUTIONAL',
          // ─── Deterministic Commercial Intent Layer ─────────────────
          commercial_intent: commercialIntent,
          intent_level: commercialIntent.intent_level,
          intent_badge: commercialIntent.intent_badge,
          intent_reason: commercialIntent.intent_reason,
          intent_product_context: commercialIntent.intent_product_context,
          last_signal_at: commercialIntent.last_signal_at,
          last_signal_type: commercialIntent.last_signal_type,
          last_signal_label: commercialIntent.last_signal_label,
          strong_signals_count: commercialIntent.strong_signals_count,
          is_hot: commercialIntent.is_hot,
          is_warm: commercialIntent.is_warm,
          is_customer: commercialIntent.is_customer,
          timeline: commercialIntent.timeline
        };
      });

      res.json({
        success: true,
        count: enrichedItems.length,
        items: enrichedItems
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching user saved relations:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error', items: [] });
  }
});

// POST /api/user/commercial-signals: Record physical commercial signal
app.post('/api/user/commercial-signals', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated JWT session required' });
    }

    const { saved_relation_id, contact_id, organization_id, product_id, product_name, signal_type, signal_payload } = req.body;
    if (!signal_type) {
      return res.status(400).json({ error: 'Missing signal_type' });
    }

    const env = (process.env.NODE_ENV !== 'production' && (req.headers['x-atlas-test-auth'] === 'atlas-test-suite' || req.body?.environment === 'TEST_NON_PRODUCTION')) ? 'TEST_NON_PRODUCTION' : 'REAL';

    const result = await hotClientsService.recordCommercialSignal({
      user_id: userId,
      saved_relation_id,
      contact_id,
      organization_id,
      product_id,
      product_name,
      signal_type,
      signal_payload,
      environment: env
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('Error recording commercial signal:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/hot-counter: Physical counts of hot, warm, customer, and total clients
app.get('/api/user/hot-counter', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const env = (process.env.NODE_ENV !== 'production' && (req.headers['x-atlas-test-auth'] === 'atlas-test-suite' || req.query.env === 'TEST_NON_PRODUCTION')) ? 'TEST_NON_PRODUCTION' : 'REAL';

    const counter = await hotClientsService.getHotClientsCounter(userId, env);
    res.json({
      success: true,
      environment: env,
      ...counter
    });
  } catch (err: any) {
    console.error('Error getting hot counter:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/saved-relations: Save relation reference to Mi base
app.post('/api/user/saved-relations', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { product_id, company_id, relation_id, base_name, context, market_post_id, notes, tags } = req.body;
    if (!product_id || typeof product_id !== 'string') {
      return res.status(400).json({ error: 'Missing product_id' });
    }

    const client = await dbPool.connect();
    try {
      const prodCheck = await client.query(
        'SELECT product_id FROM public.atlas_products WHERE product_id = $1::uuid UNION ALL SELECT canonical_entity_id FROM public.atlas_canonical_entities WHERE canonical_entity_id = $1::uuid LIMIT 1;',
        [product_id]
      );
      if (prodCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found in Atlas catalog' });
      }

      const initialTags: string[] = Array.isArray(tags) ? [...tags] : [];
      if (context && typeof context === 'string') initialTags.push(context);
      if (market_post_id && typeof market_post_id === 'string') initialTags.push(`post:${market_post_id}`);

      let initialNotes = notes || null;
      if (!initialNotes && (context || market_post_id)) {
        initialNotes = `Industrial Market [${context || 'LEAD'}]${market_post_id ? ` • Post: ${market_post_id}` : ''}`;
      }

      const metaObj = {
        context: context || null,
        market_post_id: market_post_id || null,
        saved_via: 'INDUSTRIAL_MARKET'
      };

      const insertRes = await client.query(`
        INSERT INTO public.atlas_user_saved_relations (
          user_id, product_id, company_id, relation_id, base_name, notes, tags, metadata, saved_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, COALESCE($5, 'Mi base'), $6, $7, $8, NOW()
        )
        ON CONFLICT (user_id, product_id, base_name) DO UPDATE SET
          tags = COALESCE(EXCLUDED.tags, atlas_user_saved_relations.tags),
          notes = COALESCE(EXCLUDED.notes, atlas_user_saved_relations.notes),
          metadata = COALESCE(atlas_user_saved_relations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id, saved_at;
      `, [
        userId,
        product_id,
        company_id && /^[0-9a-f-]{36}$/i.test(company_id) ? company_id : null,
        relation_id && /^[0-9a-f-]{36}$/i.test(relation_id) ? relation_id : null,
        base_name || 'Mi base',
        initialNotes,
        initialTags.length > 0 ? initialTags : null,
        JSON.stringify(metaObj)
      ]);

      if (insertRes.rows.length > 0) {
        return res.json({
          success: true,
          saved: true,
          alreadySaved: false,
          id: insertRes.rows[0].id,
          saved_at: insertRes.rows[0].saved_at,
          message: '✓ Guardado en Mi base'
        });
      } else {
        return res.json({
          success: true,
          saved: false,
          alreadySaved: true,
          message: '✓ Ya guardado'
        });
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error saving user relation:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/user/saved-relations/bulk: Bulk save search results with strict safety invariant
app.post('/api/user/saved-relations/bulk', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { items, base_name, metadata } = req.body;
    
    // SAFETY INVARIANT V1: MAX_BULK_SAVE = 20
    const MAX_BULK_SAVE = 20;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required and must not be empty' });
    }

    if (items.length > MAX_BULK_SAVE) {
      return res.status(400).json({
        error: `Payload exceeds MAX_BULK_SAVE limit of ${MAX_BULK_SAVE}. Safety invariant violation.`,
        rejected: true,
        max_allowed: MAX_BULK_SAVE,
        received: items.length
      });
    }

    const targetBaseName = (typeof base_name === 'string' && base_name.trim()) ? base_name.trim() : 'Mi base';
    let savedCount = 0;
    let duplicatesSkipped = 0;

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      for (const it of items) {
        const prodId = it.product_id || it.PRODUCT_ID || it.id;
        if (!prodId || typeof prodId !== 'string') continue;

        const companyId = it.company_id || it.COMPANY_ID || null;
        const relationId = it.relation_id || it.EVIDENCE_RELATION_ID || null;

        const insertRes = await client.query(`
          INSERT INTO public.atlas_user_saved_relations (
            user_id, product_id, company_id, relation_id, base_name, commercial_status, saved_at
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'NEW', NOW()
          )
          ON CONFLICT (user_id, product_id, base_name) DO NOTHING
          RETURNING id;
        `, [
          userId,
          prodId,
          companyId && /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : null,
          relationId && /^[0-9a-f-]{36}$/i.test(relationId) ? relationId : null,
          targetBaseName
        ]);

        if (insertRes.rows.length > 0) {
          savedCount++;
        } else {
          duplicatesSkipped++;
        }
      }

      if (metadata && typeof metadata === 'object') {
        await client.query(`
          INSERT INTO public.atlas_user_bases (
            user_id, base_name, original_query, filters, sort, total_results_at_save, base_purpose, created_at, updated_at
          ) VALUES (
            $1::uuid, $2, $3, $4::jsonb, $5, $6, 'SALES_PROSPECTING', NOW(), NOW()
          )
          ON CONFLICT (user_id, base_name) DO UPDATE SET
            original_query = EXCLUDED.original_query,
            filters = EXCLUDED.filters,
            sort = EXCLUDED.sort,
            total_results_at_save = EXCLUDED.total_results_at_save,
            base_purpose = 'SALES_PROSPECTING',
            updated_at = NOW();
        `, [
          userId,
          targetBaseName,
          metadata.original_query || null,
          JSON.stringify(metadata.filters || {}),
          metadata.sort || null,
          metadata.total_results_at_save || null
        ]);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        base_name: targetBaseName,
        savedCount,
        duplicatesSkipped,
        totalProcessed: items.length,
        message: `✓ ${savedCount} registros guardados en "${targetBaseName}" (${duplicatesSkipped} ya existían)`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error in bulk saving relations:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/user/bases: List bases for user
app.get('/api/user/bases', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required', bases: [] });
    }

    const client = await dbPool.connect();
    try {
      const result = await client.query(`
        SELECT id, base_name, original_query, filters, sort, total_results_at_save, base_purpose, created_at, updated_at
        FROM public.atlas_user_bases
        WHERE user_id = $1::uuid
        ORDER BY updated_at DESC;
      `, [userId]);
      res.json({ success: true, count: result.rows.length, bases: result.rows });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching user bases:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error', bases: [] });
  }
});

// PATCH /api/user/saved-relations/:id/commercial: Update private user commercial data
app.patch('/api/user/saved-relations/:id/commercial', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { id } = req.params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Valid UUID required' });
    }

    const {
      commercial_status,
      priority,
      notes,
      tags,
      last_contact_at,
      next_action,
      next_action_date
    } = req.body;

    const allowedStatuses = ['NEW', 'REVIEW', 'PROSPECT', 'CONTACTED', 'RESPONDED', 'CUSTOMER', 'DISCARDED'];
    if (commercial_status && !allowedStatuses.includes(commercial_status)) {
      return res.status(400).json({ error: `Invalid commercial_status. Allowed: ${allowedStatuses.join(', ')}` });
    }

    const allowedPriorities = ['HIGH', 'MEDIUM', 'LOW', null];
    if (priority !== undefined && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Allowed: HIGH, MEDIUM, LOW, or null' });
    }

    const client = await dbPool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [id, userId];

      if (commercial_status !== undefined) {
        values.push(commercial_status);
        updateFields.push(`commercial_status = $${values.length}`);
      }
      if (priority !== undefined) {
        values.push(priority);
        updateFields.push(`priority = $${values.length}`);
      }
      if (notes !== undefined) {
        values.push(notes);
        updateFields.push(`notes = $${values.length}`);
      }
      if (tags !== undefined) {
        values.push(Array.isArray(tags) ? tags : []);
        updateFields.push(`tags = $${values.length}`);
      }
      if (last_contact_at !== undefined) {
        values.push(last_contact_at);
        updateFields.push(`last_contact_at = $${values.length}`);
      }
      if (next_action !== undefined) {
        values.push(next_action);
        updateFields.push(`next_action = $${values.length}`);
      }
      if (next_action_date !== undefined) {
        values.push(next_action_date);
        updateFields.push(`next_action_date = $${values.length}`);
      }

      values.push(new Date());
      updateFields.push(`updated_at = $${values.length}`);

      if (updateFields.length === 1) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      const q = `
        UPDATE public.atlas_user_saved_relations
        SET ${updateFields.join(', ')}
        WHERE (id = $1::uuid OR (product_id = $1::uuid AND user_id = $2::uuid))
          AND user_id = $2::uuid
        RETURNING id, commercial_status, priority, notes, tags, last_contact_at, next_action, next_action_date, updated_at;
      `;

      const result = await client.query(q, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Relation not found or not owned by user' });
      }

      res.json({
        success: true,
        updated: result.rows[0],
        message: '✓ Seguimiento comercial actualizado'
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating commercial tracking:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/user/saved-relations/bulk-commercial: Bulk commercial updates on selected rows
app.post('/api/user/saved-relations/bulk-commercial', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { ids, action, commercial_status, priority, add_tag } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Valid ids array required' });
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      let affectedCount = 0;

      if (action === 'DELETE') {
        const delRes = await client.query(`
          DELETE FROM public.atlas_user_saved_relations
          WHERE id = ANY($1::uuid[]) AND user_id = $2::uuid
          RETURNING id;
        `, [ids, userId]);
        affectedCount = delRes.rowCount || 0;
      } else if (action === 'STATUS' && commercial_status) {
        const upRes = await client.query(`
          UPDATE public.atlas_user_saved_relations
          SET commercial_status = $1, updated_at = NOW()
          WHERE id = ANY($2::uuid[]) AND user_id = $3::uuid
          RETURNING id;
        `, [commercial_status, ids, userId]);
        affectedCount = upRes.rowCount || 0;
      } else if (action === 'PRIORITY') {
        const upRes = await client.query(`
          UPDATE public.atlas_user_saved_relations
          SET priority = $1, updated_at = NOW()
          WHERE id = ANY($2::uuid[]) AND user_id = $3::uuid
          RETURNING id;
        `, [priority || null, ids, userId]);
        affectedCount = upRes.rowCount || 0;
      } else if (action === 'ADD_TAG' && add_tag) {
        const upRes = await client.query(`
          UPDATE public.atlas_user_saved_relations
          SET tags = array_append(array_remove(tags, $1), $1), updated_at = NOW()
          WHERE id = ANY($2::uuid[]) AND user_id = $3::uuid
          RETURNING id;
        `, [add_tag.trim(), ids, userId]);
        affectedCount = upRes.rowCount || 0;
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        affectedCount,
        message: `✓ ${affectedCount} prospectos actualizados exitosamente`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error in bulk commercial update:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/user/segments: List user segments with count of members
app.get('/api/user/segments', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required', segments: [] });
    }

    const client = await dbPool.connect();
    try {
      const q = `
        SELECT 
          s.id,
          s.name,
          s.description,
          s.created_at,
          COUNT(i.id)::int as count
        FROM public.atlas_user_segments s
        LEFT JOIN public.atlas_user_segment_items i ON s.id = i.segment_id
        WHERE s.user_id = $1::uuid
        GROUP BY s.id, s.name, s.description, s.created_at
        ORDER BY s.created_at DESC;
      `;
      const result = await client.query(q, [userId]);
      res.json({ success: true, count: result.rows.length, segments: result.rows });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching user segments:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error', segments: [] });
  }
});

// POST /api/user/segments: Create a user segment from saved relation IDs
app.post('/api/user/segments', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { name, description, saved_relation_ids } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Segment name is required' });
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const segInsert = await client.query(`
        INSERT INTO public.atlas_user_segments (user_id, name, description)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (user_id, name) DO UPDATE SET
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING id, name, description, created_at;
      `, [userId, name.trim(), description || null]);

      const segmentId = segInsert.rows[0].id;
      let itemsAdded = 0;

      if (Array.isArray(saved_relation_ids) && saved_relation_ids.length > 0) {
        const relsRes = await client.query(`
          SELECT id, product_id, company_id
          FROM public.atlas_user_saved_relations
          WHERE id = ANY($1::uuid[]) AND user_id = $2::uuid;
        `, [saved_relation_ids, userId]);

        for (const r of relsRes.rows) {
          const itemRes = await client.query(`
            INSERT INTO public.atlas_user_segment_items (
              user_id, segment_id, saved_relation_id, product_id, company_id
            ) VALUES (
              $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
            )
            ON CONFLICT (segment_id, saved_relation_id) DO NOTHING
            RETURNING id;
          `, [userId, segmentId, r.id, r.product_id, r.company_id || null]);
          if (itemRes.rows.length > 0) itemsAdded++;
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        segment: segInsert.rows[0],
        itemsAdded,
        message: `✓ Segmento "${name.trim()}" creado con ${itemsAdded} empresas`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error creating segment:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// DELETE /api/user/segments/:id: Delete segment
app.delete('/api/user/segments/:id', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const { id } = req.params;
    const client = await dbPool.connect();
    try {
      const del = await client.query(`
        DELETE FROM public.atlas_user_segments
        WHERE id = $1::uuid AND user_id = $2::uuid
        RETURNING id;
      `, [id, userId]);
      res.json({ success: true, deleted: del.rowCount > 0 });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error deleting segment:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// DELETE /api/user/saved-relations/:id: Remove from Mi base
app.delete('/api/user/saved-relations/:id', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const targetId = req.params.id;
    if (!targetId || !/^[0-9a-f-]{36}$/i.test(targetId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const client = await dbPool.connect();
    try {
      const delRes = await client.query(`
        DELETE FROM public.atlas_user_saved_relations
        WHERE (id = $1::uuid OR product_id = $1::uuid)
          AND user_id = $2::uuid
        RETURNING id;
      `, [targetId, userId]);

      res.json({
        success: true,
        deleted: delRes.rowCount > 0,
        message: delRes.rowCount > 0 ? '✓ Eliminado de Mi base' : 'No encontrado'
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error deleting user saved relation:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/user/saved-relations/:id/move: Move to another base
app.post('/api/user/saved-relations/:id/move', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }

    const targetId = req.params.id;
    const { base_name } = req.body;
    if (!targetId || !base_name || typeof base_name !== 'string') {
      return res.status(400).json({ error: 'Invalid targetId or base_name' });
    }

    const client = await dbPool.connect();
    try {
      const updateRes = await client.query(`
        UPDATE public.atlas_user_saved_relations
        SET base_name = $1
        WHERE (id = $2::uuid OR product_id = $2::uuid)
          AND user_id = $3::uuid
        RETURNING id, base_name;
      `, [base_name.trim(), targetId, userId]);

      res.json({
        success: true,
        updated: updateRes.rowCount > 0,
        base_name: base_name.trim()
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error moving user saved relation:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// =========================================================================
// ATLAS USERS, PROFILES & ORGANIZATIONS V1 ENDPOINTS
// =========================================================================

// GET /api/user/profile: Get personal profile & organization membership
app.get('/api/user/profile', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const client = await dbPool.connect();
    try {
      // 1. Fetch user profile
      const profRes = await client.query(`
        SELECT user_id, first_name, last_name, display_name, phone, country, province, avatar_url, created_at, updated_at
        FROM public.atlas_user_profiles
        WHERE user_id = $1::uuid;
      `, [userId]);

      const profile = profRes.rows[0] || {
        user_id: userId,
        first_name: '',
        last_name: '',
        display_name: '',
        phone: '',
        country: 'AR',
        province: '',
        avatar_url: null
      };

      // 2. Fetch organization and membership
      const orgRes = await client.query(`
        SELECT o.organization_id, o.name, o.legal_name, o.tax_id, o.website, o.industry,
               o.country, o.province, o.city, o.address, o.created_at, o.updated_at,
               m.role as membership_role, m.status as membership_status
        FROM public.atlas_organization_members m
        JOIN public.atlas_organizations o ON m.organization_id = o.organization_id
        WHERE m.user_id = $1::uuid AND m.status = 'ACTIVE'
        LIMIT 1;
      `, [userId]);

      const organization = orgRes.rows[0] || null;

      res.json({
        success: true,
        profile,
        organization,
        membership: organization ? { role: organization.membership_role, status: organization.membership_status } : null
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// PUT /api/user/profile: Update or create personal profile
app.put('/api/user/profile', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const { first_name, last_name, display_name, phone, country, province, avatar_url } = req.body;

    const client = await dbPool.connect();
    try {
      const computedDisplayName = display_name || `${first_name || ''} ${last_name || ''}`.trim() || 'Usuario Atlas';
      const upsertRes = await client.query(`
        INSERT INTO public.atlas_user_profiles (
          user_id, first_name, last_name, display_name, phone, country, province, avatar_url, updated_at
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, COALESCE($6, 'AR'), $7, $8, NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          display_name = EXCLUDED.display_name,
          phone = EXCLUDED.phone,
          country = EXCLUDED.country,
          province = EXCLUDED.province,
          avatar_url = EXCLUDED.avatar_url,
          updated_at = NOW()
        RETURNING *;
      `, [userId, first_name || null, last_name || null, computedDisplayName, phone || null, country || 'AR', province || null, avatar_url || null]);

      res.json({ success: true, profile: upsertRes.rows[0] });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/user/organization: Create organization for current user
app.post('/api/user/organization', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const { name, legal_name, tax_id, website, industry, country, province, city, address } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nombre de empresa requerido' });
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const orgRes = await client.query(`
        INSERT INTO public.atlas_organizations (
          name, legal_name, tax_id, website, industry, country, province, city, address
        ) VALUES (
          $1, $2, $3, $4, $5, COALESCE($6, 'AR'), $7, $8, $9
        )
        RETURNING *;
      `, [name.trim(), legal_name || null, tax_id || null, website || null, industry || null, country || 'AR', province || null, city || null, address || null]);

      const org = orgRes.rows[0];

      // Insert membership with role OWNER
      await client.query(`
        INSERT INTO public.atlas_organization_members (
          organization_id, user_id, role, status
        ) VALUES (
          $1::uuid, $2::uuid, 'OWNER', 'ACTIVE'
        )
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE';
      `, [org.organization_id, userId]);

      await client.query('COMMIT');
      res.json({ success: true, organization: org, membership: { role: 'OWNER', status: 'ACTIVE' } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error creating organization:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// PUT /api/user/organization: Update existing organization
app.put('/api/user/organization', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const { organization_id, name, legal_name, tax_id, website, industry, country, province, city, address } = req.body;
    if (!organization_id || !name) {
      return res.status(400).json({ error: 'organization_id and name are required' });
    }

    const client = await dbPool.connect();
    try {
      // Check authorization: user must be OWNER or ADMIN of this organization
      const authCheck = await client.query(`
        SELECT role FROM public.atlas_organization_members
        WHERE organization_id = $1::uuid AND user_id = $2::uuid AND status = 'ACTIVE';
      `, [organization_id, userId]);

      if (authCheck.rows.length === 0 || !['OWNER', 'ADMIN'].includes(authCheck.rows[0].role)) {
        return res.status(403).json({ error: 'Forbidden: No tienes permisos para editar esta empresa' });
      }

      const updateRes = await client.query(`
        UPDATE public.atlas_organizations
        SET name = $1,
            legal_name = $2,
            tax_id = $3,
            website = $4,
            industry = $5,
            country = COALESCE($6, country),
            province = $7,
            city = $8,
            address = $9,
            updated_at = NOW()
        WHERE organization_id = $10::uuid
        RETURNING *;
      `, [name.trim(), legal_name || null, tax_id || null, website || null, industry || null, country || 'AR', province || null, city || null, address || null, organization_id]);

      res.json({ success: true, organization: updateRes.rows[0] });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating organization:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// =========================================================================
// ATLAS COMMERCE MVP V1 ENDPOINTS (Mercado Pago, Proposals, Orders, Webhook)
// =========================================================================

// GET /api/mercadopago/oauth/url: Generate official OAuth connect URL
app.get('/api/mercadopago/oauth/url', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const { url, state } = commerceService.getOAuthConnectUrl(userId);
    res.json({ success: true, url, state });
  } catch (err: any) {
    console.error('Error generating MP OAuth URL:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/mercadopago/oauth/callback: Handle OAuth code exchange
app.get('/api/mercadopago/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    const result = await commerceService.handleOAuthCallback(String(code), String(state));
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'OAuth verification failed' });
    }

    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html')) {
      const frontendUrl = process.env.ATLAS_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5175';
      return res.redirect(`${frontendUrl}/mi-base?mp_connected=true`);
    }

    res.json({ success: true, message: 'Mercado Pago seller connected successfully', userId: result.userId });
  } catch (err: any) {
    console.error('Error in MP OAuth callback:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/mercadopago/seller-status: Check seller connection status
app.get('/api/mercadopago/seller-status', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const status = await commerceService.getSellerStatus(userId);
    res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('Error fetching seller status:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/mercadopago/test-connect: Connect test seller account (for test mode / E2E)
app.post('/api/mercadopago/test-connect', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const { state } = commerceService.getOAuthConnectUrl(userId);
    const result = await commerceService.handleOAuthCallback('TEST_OAUTH_CODE_SIMULATION', state);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/commerce/proposals: Create a new proposal from prospect
app.post('/api/commerce/proposals', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
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
app.get('/api/commerce/proposals/:token', async (req, res) => {
  try {
    const token = (req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const proposal = await commerceService.getProposalByToken(token);
    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta no encontrada o enlace vencido' });
    }

    // Also get order details if exists
    const orderRes = await dbPool.query(
      'SELECT order_id, gross_amount, atlas_fee_amount, status, mp_preference_id, paid_at FROM public.atlas_commercial_orders WHERE proposal_id = $1::uuid;',
      [proposal.proposal_id]
    );

    // Fetch seller & company info
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

// POST /api/commerce/proposals/:token/accept: Buyer accepts proposal & creates ATLAS_ORDER_ID
app.post('/api/commerce/proposals/:token/accept', async (req, res) => {
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

// POST /api/commerce/proposals/:token/reject: Buyer rejects proposal
app.post('/api/commerce/proposals/:token/reject', async (req, res) => {
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

// POST /api/commerce/proposals/:token/checkout: Create Checkout Pro Preference with 5% fee
app.post('/api/commerce/proposals/:token/checkout', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    // Attack tests A & B: Frontend attempts to pass custom amount or fee
    // We strictly ignore any client-supplied amount or fee and calculate everything server-side!
    const result = await commerceService.createCheckoutPreference(token);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      preferenceId: result.preferenceId
    });
  } catch (err: any) {
    console.error('Error creating checkout preference:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/webhooks/mercadopago: Webhook for Mercado Pago payment events
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    console.log('Received Mercado Pago Webhook:', { body: req.body, query: req.query });
    const result = await commerceService.handleWebhook(req.body, req.query);
    
    // Always acknowledge 200 OK so MP doesn't needlessly retry
    res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    console.error('Error processing MP webhook:', err);
    res.status(200).json({ received: true, error: err.message });
  }
});

// GET /api/commerce/summary: Commercial summary cards for Mi Base
app.get('/api/commerce/summary', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!);
    const userId = await resolveUserId(req, sbAdmin);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Valid authenticated session required' });
    }

    const summary = await commerceService.getCommerceSummary(userId);
    res.json({ success: true, summary });
  } catch (err: any) {
    console.error('Error fetching commerce summary:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/runtime-status: Explicit deterministic runtime identification without secrets
app.get('/api/runtime-status', (req, res) => {
  const runtimeIdentity = AtlasRuntimeIdentity.getInstance();
  const status = runtimeIdentity.getStatus(PORT);
  res.json(status);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5174;
app.listen(PORT, async () => {
  console.log(`Backend Search Server running on http://localhost:${PORT}`);
  try {
    const { DurableMissionWorker } = await import('./server/services/industrial/DurableMissionWorker.ts');
    await DurableMissionWorker.getInstance(dbPool).bootstrapRecovery();
  } catch (recErr: any) {
    console.warn('[DurableMissionWorker] Bootstrap recovery error:', recErr.message);
  }
});
