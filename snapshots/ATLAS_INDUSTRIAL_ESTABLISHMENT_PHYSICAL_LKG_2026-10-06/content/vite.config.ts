import 'dotenv/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function massDiscoveryPlugin() {
  return {
    name: 'mass-discovery-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';

        // ATLAS PEOPLE SCALE METRICS (Single Source of Truth)
        if (url.startsWith('/api/atlas/people-metrics')) {
          if (req.method === 'GET') {
            try {
              const { getAtlasPeopleScaleMetrics } = await server.ssrLoadModule('/src/lib/search/AtlasPeopleScaleMetrics.ts');
              const metrics = await getAtlasPeopleScaleMetrics();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(metrics));
            } catch (err: any) {
              console.error('[atlas-people-metrics] Error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Metrics calculation failed' }));
            }
            return;
          } else if (req.method === 'POST') {
            try {
              const { getAtlasPeopleScaleMetrics, invalidatePeopleScaleMetricsCache } = await server.ssrLoadModule('/src/lib/search/AtlasPeopleScaleMetrics.ts');
              invalidatePeopleScaleMetricsCache();
              const metrics = await getAtlasPeopleScaleMetrics({ forceRefresh: true });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(metrics));
            } catch (err: any) {
              console.error('[atlas-people-metrics-refresh] Error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Metrics refresh failed' }));
            }
            return;
          }
        }
        // ATLAS LIVE TELEMETRY (Persistent Realtime SSE & Cursor Read Model)
        if (url.startsWith('/api/atlas/live-metrics')) {
          try {
            const { AtlasLiveTelemetryService } = await server.ssrLoadModule('/src/lib/search/telemetry/AtlasLiveTelemetryService.ts');
            const service = AtlasLiveTelemetryService.getInstance();
            await service.syncWithPostgres();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              metrics: service.getLiveMetrics(),
              snapshot: service.getStartSnapshot()
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (url.startsWith('/api/atlas/live-events')) {
          try {
            const { AtlasLiveTelemetryService } = await server.ssrLoadModule('/src/lib/search/telemetry/AtlasLiveTelemetryService.ts');
            const service = AtlasLiveTelemetryService.getInstance();
            await service.syncWithPostgres();

            const isSSE = req.headers.accept && req.headers.accept.includes('text/event-stream');
            if (isSSE) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              if (typeof res.flushHeaders === 'function') res.flushHeaders();

              // Send initial state
              const initialPayload = JSON.stringify({
                type: 'INITIAL_STATE',
                metrics: service.getLiveMetrics(),
                recent_events: service.getEventsSince()
              });
              res.write(`event: initial\ndata: ${initialPayload}\n\n`);

              const unsubscribe = service.subscribe((event: any, currentMetrics: any) => {
                if (!event.timestamps) event.timestamps = {};
                event.timestamps.t_sse_server_send = Date.now();
                res.write(`event: update\ndata: ${JSON.stringify({ event, metrics: currentMetrics })}\n\n`);
              });

              const keepAlive = setInterval(() => {
                res.write(': ping\n\n');
              }, 15000);

              req.on('close', () => {
                clearInterval(keepAlive);
                unsubscribe();
              });
              return;
            }

            // Fallback JSON polling with cursor
            const urlObj = new URL(url, 'http://localhost:5173');
            const cursor = urlObj.searchParams.get('cursor') || undefined;
            const events = service.getEventsSince(cursor);
            const metrics = service.getLiveMetrics();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              events, 
              metrics, 
              cursor: events.length > 0 ? events[events.length - 1].event_id : cursor 
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (url.startsWith('/api/atlas/emit-event') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const { AtlasLiveTelemetryService } = await server.ssrLoadModule('/src/lib/search/telemetry/AtlasLiveTelemetryService.ts');
              const service = AtlasLiveTelemetryService.getInstance();
              const emitted = service.emitEvent(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, event: emitted, metrics: service.getLiveMetrics() }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // ATLAS PEOPLE SEARCH V2 (Server-Side Postgres Search)
        if (url.startsWith('/api/atlas/people-search') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const { AtlasPeopleSearchV2 } = await server.ssrLoadModule('/src/lib/search/AtlasPeopleSearchV2.ts');
              const result = await AtlasPeopleSearchV2.search(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              console.error('[atlas-people-search] Error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Person search failed' }));
            }
          });
          return;
        }

        if (url.startsWith('/api/mass-discovery')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsedBody = body ? JSON.parse(body) : {};
                
                if (url.startsWith('/api/mass-discovery/enrich')) {
                  const { OnDemandEnrichmentEngine } = await server.ssrLoadModule('/src/lib/search/OnDemandEnrichmentEngine.ts');
                  const enriched = await OnDemandEnrichmentEngine.enrichRecords(parsedBody.records || [], parsedBody.options);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ enriched }));
                  return;
                }

                const { MassDiscoveryEngine } = await server.ssrLoadModule('/src/lib/search/MassDiscoveryEngine.ts');
                const engine = new MassDiscoveryEngine();
                const result = await engine.discover({
                  query: parsedBody.query,
                  search_session_id: parsedBody.search_session_id,
                  budget: parsedBody.budget || 'STANDARD',
                  page: parsedBody.page || 1,
                  page_size: parsedBody.page_size || 100,
                  atlas_indexed_total: parsedBody.atlas_indexed_total || 0
                });
                
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (err: any) {
                console.error('[mass-discovery-api] Error:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Mass discovery failed' }));
              }
            });
            return;
          }
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), massDiscoveryPlugin()],
  base: '/',
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  server: {
    host: true,
    proxy: {
      '/api/youtubei': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/youtubei/, '/youtubei'),
        headers: {
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20231201.00.00'
        }
      },
      '/api/runtime-status': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/industrial': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/atlas': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/commerce': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/mercadopago': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/user': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/auth': {
        target: 'http://localhost:5174',
        changeOrigin: true
      },
      '/api/webhooks': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  },
  test: {
    include: ['src/tests/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000
  }
})
