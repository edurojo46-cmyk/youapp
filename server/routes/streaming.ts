import { Router } from 'express';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { FederatedPersonSearch } from '../../src/lib/search/FederatedPersonSearch.ts';
import { QueryIntentParser } from '../../src/lib/search/UniversalQueryModel.ts';
import { MassDiscoveryEngine } from '../../src/lib/search/MassDiscoveryEngine.ts';
import { OnDemandEnrichmentEngine } from '../../src/lib/search/OnDemandEnrichmentEngine.ts';

export interface StreamingRouterDeps {
  massEngine: MassDiscoveryEngine;
}

export function createStreamingRouter(deps: StreamingRouterDeps): Router {
  const router = Router();
  const { massEngine } = deps;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const getSbAdmin = () => {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");
    return createClient(supabaseUrl, supabaseServiceKey);
  };

  // POST /api/mass-discovery
  router.post('/api/mass-discovery', async (req, res) => {
    try {
      const { query, search_session_id, budget, page, page_size, atlas_indexed_total } = req.body;
      const result = await massEngine.discover({
        query,
        search_session_id,
        budget: budget || 'STANDARD',
        page: page || 1,
        page_size: page_size || 100,
        atlas_indexed_total: atlas_indexed_total || 0
      });
      res.json(result);
    } catch (err: any) {
      console.error('[POST /api/mass-discovery] Error:', err);
      res.status(500).json({ error: err.message || 'Mass discovery failed' });
    }
  });

  // POST /api/mass-discovery/enrich
  router.post('/api/mass-discovery/enrich', async (req, res) => {
    try {
      const { records, options } = req.body;
      const enriched = await OnDemandEnrichmentEngine.enrichRecords(records || [], options);
      res.json({ enriched });
    } catch (err: any) {
      console.error('[POST /api/mass-discovery/enrich] Error:', err);
      res.status(500).json({ error: err.message || 'On-demand enrichment failed' });
    }
  });

  // POST /api/person-search
  router.post('/api/person-search', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
      }
      
      const sbAdmin = getSbAdmin();
      const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
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
      res.json(results);
    } catch (err: any) {
      console.error('Federated Search Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  return router;
}

export default createStreamingRouter;
