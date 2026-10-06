import { Router } from 'express';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { getAtlasPeopleScaleMetrics, invalidatePeopleScaleMetricsCache } from '../../src/lib/search/AtlasPeopleScaleMetrics.ts';
import { AtlasPeopleSearchV2 } from '../../src/lib/search/AtlasPeopleSearchV2.ts';

export interface PlatformRouterDeps {
  dbPool: any;
  liveTelemetry: any;
  contactEngine: any;
  resolveUserId: (req: express.Request, sbAdmin: any) => Promise<string | null>;
}

export function createPlatformRouter(deps: PlatformRouterDeps): Router {
  const router = Router();
  const { dbPool, liveTelemetry, contactEngine, resolveUserId } = deps;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const getSbAdmin = () => {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing Supabase configuration");
    return createClient(supabaseUrl, supabaseServiceKey);
  };

  // ─── TELEMETRY & SCALE METRICS ──────────────────────────────────────────
  router.get('/api/atlas/live-metrics', async (req, res) => {
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

  router.get('/api/atlas/realtime-snapshot', (req, res) => {
    try {
      res.json({ snapshot: liveTelemetry.getStartSnapshot() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/atlas/live-events', (req, res) => {
    try {
      const isSSE = req.headers.accept && req.headers.accept.includes('text/event-stream');
      if (isSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

        const initialData = JSON.stringify({
          type: 'INITIAL_STATE',
          metrics: liveTelemetry.getLiveMetrics(),
          recent_events: liveTelemetry.getEventsSince()
        });
        res.write(`event: initial\ndata: ${initialData}\n\n`);

        const unsubscribe = liveTelemetry.subscribe((event: any, currentMetrics: any) => {
          if (!event.timestamps) event.timestamps = {};
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

  router.post('/api/atlas/emit-event', (req, res) => {
    try {
      const emitted = liveTelemetry.emitEvent(req.body);
      res.json({ success: true, event: emitted, metrics: liveTelemetry.getLiveMetrics() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/atlas/reset-baseline', (req, res) => {
    try {
      liveTelemetry.resetToBaseline();
      res.json({ success: true, snapshot: liveTelemetry.getStartSnapshot(), metrics: liveTelemetry.getLiveMetrics() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/atlas/people-metrics', async (req, res) => {
    try {
      const metrics = await getAtlasPeopleScaleMetrics();
      res.json(metrics);
    } catch (err: any) {
      console.error('Scale Metrics Error:', err);
      res.status(500).json({ error: err.message || 'Failed to calculate scale metrics' });
    }
  });

  router.post('/api/atlas/people-metrics/refresh', async (req, res) => {
    try {
      invalidatePeopleScaleMetricsCache();
      const metrics = await getAtlasPeopleScaleMetrics({ forceRefresh: true });
      res.json(metrics);
    } catch (err: any) {
      console.error('Metrics Refresh Error:', err);
      res.status(500).json({ error: err.message || 'Failed to refresh metrics' });
    }
  });

  router.post('/api/atlas/people-search', async (req, res) => {
    try {
      const result = await AtlasPeopleSearchV2.search(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('Person Search V2 Error:', err);
      res.status(500).json({ error: err.message || 'Person search failed' });
    }
  });

  return router;
}

export default createPlatformRouter;
