import { Router } from 'express';
import express from 'express';
import { dbPool } from '../db.ts';
import { AtlasVirtualDatasetService } from '../services/industrial/AtlasVirtualDatasetService.ts';

export interface DatasetRouterDeps {
  dbPool?: any;
  resolveUserId?: (req: express.Request, sbAdmin: any) => Promise<string | null>;
}

export function createDatasetRouter(deps: DatasetRouterDeps = {}): Router {
  const router = Router();
  const pool = deps.dbPool || dbPool;
  const datasetService = AtlasVirtualDatasetService.getInstance(pool);

  // Feature flag check (DEFAULT: OFF, CANARY: ACTIVE, AUTHORITY: CANARY / SHADOW)
  const getVirtualDatasetsMode = () => {
    return process.env.ATLAS_VIRTUAL_DATASETS_V1 || 'OFF';
  };

  const isVirtualDatasetsEnabled = () => {
    const mode = getVirtualDatasetsMode();
    return mode === 'CANARY' || mode === 'PRIMARY' || mode === 'true';
  };

  // GET /api/atlas/datasets/status
  router.get('/api/atlas/datasets/status', (req, res) => {
    const mode = getVirtualDatasetsMode();
    res.json({
      feature_flag: 'ATLAS_VIRTUAL_DATASETS_V1',
      mode,
      enabled: isVirtualDatasetsEnabled(),
      default: 'OFF',
      authority: mode === 'PRIMARY' ? 'PRIMARY' : (mode === 'CANARY' ? 'CANARY' : 'SHADOW'),
      modes: ['LIVE_ONLY', 'HYBRID', 'MATERIALIZE']
    });
  });

  // POST /api/atlas/datasets/flag - Dynamic Toggle between OFF, CANARY, and SHADOW
  router.post('/api/atlas/datasets/flag', (req, res) => {
    const { mode } = req.body || {};
    const validModes = ['OFF', 'CANARY', 'SHADOW', 'PRIMARY'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: 'INVALID_MODE', valid_modes: validModes });
    }
    process.env.ATLAS_VIRTUAL_DATASETS_V1 = mode;
    console.log(`[ATLAS_VIRTUAL_DATASETS_V1] Mode switched to: ${mode}`);
    res.json({
      success: true,
      feature_flag: 'ATLAS_VIRTUAL_DATASETS_V1',
      mode,
      enabled: isVirtualDatasetsEnabled(),
      authority: mode === 'PRIMARY' ? 'PRIMARY' : (mode === 'CANARY' ? 'CANARY' : 'SHADOW')
    });
  });

  // POST /api/atlas/datasets/canary/purge - Clean expired / canary temporary rows
  router.post('/api/atlas/datasets/canary/purge', async (req, res) => {
    try {
      const purgeResult = await datasetService.cleanExpiredRows();
      res.json({
        success: true,
        ...purgeResult
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/atlas/datasets
  router.post('/api/atlas/datasets', async (req, res) => {
    try {
      const {
        owner_id,
        raw_request,
        title,
        description,
        execution_mode,
        visibility,
        cache_policy,
        refresh_policy
      } = req.body;

      if (!raw_request) {
        return res.status(400).json({ error: 'RAW_REQUEST_REQUIRED' });
      }

      const dataset = await datasetService.createDatasetDefinition({
        owner_id: owner_id || 'system',
        raw_request,
        title,
        description,
        execution_mode: execution_mode || 'HYBRID',
        visibility: visibility || 'PRIVATE',
        cache_policy,
        refresh_policy
      });

      res.status(201).json({
        success: true,
        authority: 'SHADOW',
        dataset
      });
    } catch (err: any) {
      console.error('[DatasetAPI] Create dataset error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/atlas/datasets/:id/run
  router.post('/api/atlas/datasets/:id/run', async (req, res) => {
    try {
      const datasetId = req.params.id;
      const { execution_mode, ttl, target_limit, fixture_live_candidates } = req.body;

      const result = await datasetService.executeLiveRun(datasetId, {
        execution_mode,
        ttl,
        target_limit,
        fixture_live_candidates
      });

      res.status(200).json({
        success: true,
        authority: 'SHADOW',
        ...result
      });
    } catch (err: any) {
      console.error('[DatasetAPI] Run dataset error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/atlas/live-runs/:runId
  router.get('/api/atlas/live-runs/:runId', async (req, res) => {
    try {
      const runId = req.params.runId;
      const runRes = await pool.query('SELECT * FROM public.atlas_live_dataset_runs WHERE run_id = $1;', [runId]);
      if (runRes.rows.length === 0) {
        return res.status(404).json({ error: 'RUN_NOT_FOUND' });
      }

      res.json({
        success: true,
        authority: 'SHADOW',
        run: runRes.rows[0]
      });
    } catch (err: any) {
      console.error('[DatasetAPI] Get live run error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/atlas/live-runs/:runId/results
  router.get('/api/atlas/live-runs/:runId/results', async (req, res) => {
    try {
      const runId = req.params.runId;
      const results = await datasetService.getLiveRunResults(runId);
      res.json({
        success: true,
        authority: 'SHADOW',
        ...results
      });
    } catch (err: any) {
      console.error('[DatasetAPI] Get live run results error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/atlas/live-runs/:runId/save
  // Explicit Save in "Mi Base" Boundary: Live Temporary -> User Persisted
  router.post('/api/atlas/live-runs/:runId/save', async (req, res) => {
    try {
      const runId = req.params.runId;
      const { selected_row_ids, user_id, base_name } = req.body;

      if (!Array.isArray(selected_row_ids) || selected_row_ids.length === 0) {
        return res.status(400).json({ error: 'SELECTED_ROW_IDS_REQUIRED' });
      }

      const saveResult = await datasetService.saveSelectedToUserBase(
        runId,
        selected_row_ids,
        user_id || '768efac1-8d4c-4a19-8919-2de323884569',
        base_name || 'Mi Base'
      );

      res.json({
        success: true,
        authority: 'SHADOW',
        ...saveResult
      });
    } catch (err: any) {
      console.error('[DatasetAPI] Save to Mi Base error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
