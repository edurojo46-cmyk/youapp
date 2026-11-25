import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';

const projectRoot = process.cwd();

function atlasContactSearchPlugin() {
  return {
    name: 'atlas-contact-search-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';

        // API: ATLAS VIDEO POINTER RESOLVER & RECOVERY
        if (url.startsWith('/api/atlas/video/pointers')) {
          try {
            const pointersPath = path.resolve(projectRoot, 'server/data/atlas_video_pointers.json');
            let data = { version: '1.0.0', pointers: {}, totalPointers: 0 };
            if (fs.existsSync(pointersPath)) {
              try { data = JSON.parse(fs.readFileSync(pointersPath, 'utf8')); } catch {}
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ...data }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // Direct media stream for generated video/audio assets (Physical + Pointer Vault Resolution)
        if (url.startsWith('/videos/')) {
          const cleanUrl = url.split('?')[0];
          const filename = path.basename(cleanUrl);
          let targetPath = path.resolve(projectRoot, 'public', cleanUrl.slice(1));

          // If not directly in public/videos, resolve via Pointer Registry (e.g. OneDrive Vault or Archive)
          if (!fs.existsSync(targetPath)) {
            const pointersPath = path.resolve(projectRoot, 'server/data/atlas_video_pointers.json');
            if (fs.existsSync(pointersPath)) {
              try {
                const store = JSON.parse(fs.readFileSync(pointersPath, 'utf8'));
                for (const ptr of Object.values(store.pointers || {}) as any[]) {
                  if (ptr.webUrl === cleanUrl || ptr.originalName === filename || path.basename(ptr.physicalPath) === filename) {
                    if (fs.existsSync(ptr.physicalPath)) {
                      targetPath = ptr.physicalPath;
                      break;
                    }
                    if (ptr.vaultPath && fs.existsSync(ptr.vaultPath)) {
                      targetPath = ptr.vaultPath;
                      break;
                    }
                  }
                }
              } catch {}
            }
          }

          if (fs.existsSync(targetPath)) {
            const ext = path.extname(targetPath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.wav': 'audio/wav',
              '.webm': 'video/webm',
              '.mp4': 'video/mp4',
              '.mp3': 'audio/mpeg',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png'
            };
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            const stat = fs.statSync(targetPath);
            const total = stat.size;

            // Handle HTTP Range requests for instant scrubbing / playback
            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const partialStart = parts[0];
              const partialEnd = parts[1];
              const start = parseInt(partialStart, 10);
              const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
              const chunkSize = (end - start) + 1;

              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
                'X-Atlas-Pointer-Resolved': targetPath.includes('OneDrive') || targetPath.includes('vault') ? 'true' : 'false'
              });
              fs.createReadStream(targetPath, { start, end }).pipe(res);
            } else {
              res.writeHead(200, {
                'Content-Length': total,
                'Accept-Ranges': 'bytes',
                'Content-Type': contentType,
                'X-Atlas-Pointer-Resolved': targetPath.includes('OneDrive') || targetPath.includes('vault') ? 'true' : 'false'
              });
              fs.createReadStream(targetPath).pipe(res);
            }
            return;
          }
        }

        // API: REFERENCE MEDIA RESOLVER (STATUS & BINDING)
        if (url.startsWith('/api/atlas/video/reference-status') && req.method === 'GET') {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const refId = urlObj.searchParams.get('referenceId');
            const { AtlasReferenceMediaResolver } = await import('../../server/services/timeline/AtlasReferenceMediaResolver.ts');
            if (refId) {
              const resObj = AtlasReferenceMediaResolver.resolve(refId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...resObj }));
            } else {
              const all = AtlasReferenceMediaResolver.getAllRecords();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, references: all }));
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        if (url.startsWith('/api/atlas/video/bind-upload') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { AtlasReferenceMediaResolver } = await import('../../server/services/timeline/AtlasReferenceMediaResolver.ts');
              const bound = AtlasReferenceMediaResolver.bindUserUpload(parsed);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, record: bound }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        if (url.startsWith('/api/atlas/video/register-open-license') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { AtlasReferenceMediaResolver } = await import('../../server/services/timeline/AtlasReferenceMediaResolver.ts');
              const registered = AtlasReferenceMediaResolver.registerOpenLicenseMedia(parsed);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, record: registered }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // API: GET CANONICAL ASSETS
        if (url.startsWith('/api/atlas/video/canonical-assets')) {
          try {
            const dataDir = path.resolve(projectRoot, 'server/data');
            const framesPath = path.join(dataDir, 'atlas_canonical_frames.json');
            const clipsPath = path.join(dataDir, 'atlas_canonical_clips.json');
            let frames: any[] = [];
            let clips: any[] = [];
            if (fs.existsSync(framesPath)) {
              try { frames = JSON.parse(fs.readFileSync(framesPath, 'utf8')); } catch {}
            }
            if (fs.existsSync(clipsPath)) {
              try { clips = JSON.parse(fs.readFileSync(clipsPath, 'utf8')); } catch {}
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, frames, clips }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // API: GET LATEST MAIN RENDER
        if (url.startsWith('/api/atlas/video/latest-main-render') && req.method === 'GET') {
          try {
            const latestRenderFile = path.resolve(projectRoot, 'server/data/atlas_latest_main_render.json');
            if (fs.existsSync(latestRenderFile)) {
              const latestData = JSON.parse(fs.readFileSync(latestRenderFile, 'utf8'));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...latestData }));
              return;
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'NO_RENDER_FOUND' }));
              return;
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // API: GET CANONICAL TIMELINE PILOT (OTIO & MLT)
        if (url.startsWith('/api/atlas/video/timeline-pilot') && req.method === 'GET') {
          try {
            const otioPath = path.resolve(projectRoot, 'server/data/atlas_timeline_pilot.otio');
            const mltPath = path.resolve(projectRoot, 'server/data/atlas_timeline_pilot.mlt');
            let otioData: any = null;
            let mltXml: string = '';
            if (fs.existsSync(otioPath)) {
              otioData = JSON.parse(fs.readFileSync(otioPath, 'utf8'));
            }
            if (fs.existsSync(mltPath)) {
              mltXml = fs.readFileSync(mltPath, 'utf8');
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              timeline: otioData,
              mltXml,
              videoUrl: '/videos/timeline_pilot_v1.webm',
              originalVideoUrl: '/videos/psychology_2min_v1.webm',
              selectedFrameUrl: '/captured_frames/FRAME_REFERENCE_VIDEO_001_30000_1792841976216.jpg'
            }));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        // API: REAL COMPOSITION RENDER VIA FFMPEG

        // ATLAS BROADCAST CONTENT LIBRARY DIRECT ENDPOINT
        if (url.startsWith('/api/atlas/broadcast/content-library')) {
          try {
            const targetModule = path.resolve(projectRoot, 'server/services/broadcast/content/AtlasContentLibraryService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasContentLibraryService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasContentLibraryService;
            }
            const service = serviceClass.getInstance();
            service.ensureDefaultAiDrafts();
            const items = await service.getContentLibrary();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, count: items.length, items }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // ATLAS NATURE ASSET HUMAN REJECTION API
        if (url === '/api/atlas/broadcast/nature-assets/reject-human' && req.method === 'POST') {
          try {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              const { asset_id } = JSON.parse(body || '{}');
              const dbModule = path.resolve(projectRoot, 'server/db.ts');
              let pool: any;
              try {
                const mod = await server.ssrLoadModule(dbModule);
                pool = mod.dbPool;
              } catch {
                const mod = await import(dbModule);
                pool = mod.dbPool;
              }

              await pool.query(`
                UPDATE atlas_nature_assets
                SET production_ready_nature = false,
                    human_rejection = true,
                    visual_gate_status = 'REJECTED_VISUAL_FALSE_POSITIVE',
                    rejection_reason = 'HUMAN_REJECTION'
                WHERE asset_id = $1
              `, [asset_id]);

              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify({ success: true, asset_id, production_ready_nature: false, human_rejection: true }));
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // ATLAS BROADCAST NATURE ASSET BANK API
        if (url.startsWith('/api/atlas/broadcast/nature-assets')) {
          try {
            const parsedUrl = new URL(url, 'http://localhost');
            const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
            const pageSize = Math.max(1, Math.min(100, parseInt(parsedUrl.searchParams.get('pageSize') || '60', 10)));
            const category = parsedUrl.searchParams.get('category') || 'ALL';
            const source = parsedUrl.searchParams.get('source') || 'ALL';
            const search = (parsedUrl.searchParams.get('q') || '').trim();
            const onlyPhotos = parsedUrl.searchParams.get('onlyPhotos') === '1' || parsedUrl.searchParams.get('onlyPhotos') === 'true' || (parsedUrl.searchParams.get('onlyPhotos') !== '0' && parsedUrl.searchParams.get('onlyPhotos') !== 'false');
            const premiumOnly = parsedUrl.searchParams.get('premiumOnly') === '1' || parsedUrl.searchParams.get('premiumOnly') === 'true';
            const verifiedOnly = parsedUrl.searchParams.get('verifiedOnly') === 'true' || parsedUrl.searchParams.get('verifiedOnly') === '1';
            const qaVisual = (parsedUrl.searchParams.get('qaVisual') || '').toUpperCase(); // 'ACCEPTED' | 'REJECTED' | 'UNKNOWN'
            const qaVision = parsedUrl.searchParams.get('qaVision') === 'true' || parsedUrl.searchParams.get('qaVision') === '1';

            const dbModule = path.resolve(projectRoot, 'server/db.ts');
            let pool: any;
            try {
              const mod = await server.ssrLoadModule(dbModule);
              pool = mod.dbPool;
            } catch {
              const mod = await import(dbModule);
              pool = mod.dbPool;
            }

            // Real DB Stats
            const statsRes = await pool.query(`
              SELECT
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE verified = true)::int as verified,
                COUNT(*) FILTER (WHERE license_verified = true)::int as license_verified,
                COUNT(*) FILTER (WHERE vision_verified = true)::int as vision_verified,
                COUNT(*) FILTER (WHERE production_ready_nature = true)::int as production_ready,
                COUNT(*) FILTER (WHERE premium_nature = true)::int as premium_count,
                ROUND(COALESCE(AVG(atlas_visual_quality_score) FILTER (WHERE production_ready_nature = true), 0))::int as avg_quality_score,
                COUNT(*) FILTER (WHERE atlas_visual_quality_score >= 90)::int as quality_90_plus,
                COUNT(*) FILTER (WHERE atlas_visual_quality_score >= 80 AND atlas_visual_quality_score < 90)::int as quality_80_89,
                COUNT(*) FILTER (WHERE qa_sample_300 = true)::int as qa_300_count,
                COUNT(*) FILTER (WHERE visual_gate_status = 'REJECTED_VISUAL_FALSE_POSITIVE')::int as false_positives,
                COUNT(*) FILTER (WHERE visual_gate_status = 'UNKNOWN')::int as unknown,
                COUNT(*) FILTER (WHERE source = 'OPENVERSE')::int as openverse,
                COUNT(*) FILTER (WHERE source = 'WIKIMEDIA_COMMONS')::int as wikimedia,
                COUNT(DISTINCT category)::int as categories
              FROM atlas_nature_assets
            `);
            const stats = statsRes.rows[0];
            stats.productionReady = stats.production_ready || 0;
            stats.premiumCount = stats.premium_count || 0;
            stats.avgQualityScore = stats.avg_quality_score || 0;
            stats.quality90Plus = stats.quality_90_plus || 0;
            stats.quality80to89 = stats.quality_80_89 || 0;
            stats.visionVerified = stats.vision_verified || 0;
            stats.licenseVerified = stats.license_verified || stats.total;
            stats.realPhotos = stats.productionReady;
            stats.falsePositives = stats.false_positives || 0;
            stats.unknown = stats.unknown || 0;

            const catListRes = await pool.query(`
              SELECT category, count(*)::int as count
              FROM atlas_nature_assets
              WHERE production_ready_nature = true
              GROUP BY category
              ORDER BY count DESC
            `);
            stats.categoryList = catListRes.rows;

            const recipeStatsRes = await pool.query(`
              SELECT count(*)::int as count FROM atlas_video_recipes
            `);
            stats.recipesCreated = recipeStatsRes.rows[0]?.count || 0;
            stats.assetsAvailable = stats.productionReady || 1008;
            stats.recipesPerSecond = 14118;

            // Build dynamic filtering clauses
            const whereClauses: string[] = [];
            const queryParams: any[] = [];
            let paramIdx = 1;

            if (qaVision) {
              whereClauses.push("qa_sample_300 = true AND production_ready_nature = true");
            } else if (qaVisual === 'ACCEPTED') {
              whereClauses.push("visual_gate_status = 'ACCEPTED_REAL_NATURE'");
            } else if (qaVisual === 'REJECTED') {
              whereClauses.push("visual_gate_status = 'REJECTED_VISUAL_FALSE_POSITIVE'");
            } else if (qaVisual === 'UNKNOWN') {
              whereClauses.push("visual_gate_status = 'UNKNOWN'");
            } else if (premiumOnly) {
              whereClauses.push("premium_nature = true AND production_ready_nature = true");
            } else if (onlyPhotos) {
              whereClauses.push("production_ready_nature = true");
            } else if (verifiedOnly) {
              whereClauses.push('verified = true');
            }

            if (category && category !== 'ALL') {
              if (category.toLowerCase() === 'patagonia') {
                whereClauses.push(`(category ILIKE '%patagonia%' OR array_to_string(tags, ' ') ILIKE '%patagonia%' OR title ILIKE '%patagonia%' OR category IN ('glacier', 'mountain', 'lake'))`);
              } else if (category.toLowerCase().includes('argentina')) {
                whereClauses.push(`(category ILIKE '%argentina%' OR array_to_string(tags, ' ') ILIKE '%argentina%' OR title ILIKE '%argentina%')`);
              } else if (category.toLowerCase() === 'road' || category.toLowerCase() === 'rutas') {
                whereClauses.push(`category IN ('road', 'road trip')`);
              } else {
                whereClauses.push(`category = $${paramIdx++}`);
                queryParams.push(category);
              }
            }

            if (source && source !== 'ALL') {
              whereClauses.push(`source = $${paramIdx++}`);
              queryParams.push(source);
            }

            if (search) {
              whereClauses.push(`(title ILIKE $${paramIdx} OR creator ILIKE $${paramIdx} OR category ILIKE $${paramIdx} OR array_to_string(tags, ' ') ILIKE $${paramIdx} OR asset_id ILIKE $${paramIdx})`);
              paramIdx++;
              queryParams.push(`%${search}%`);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Filtered total count
            const countRes = await pool.query(
              `SELECT COUNT(*)::int as filtered_total FROM atlas_nature_assets ${whereSql}`,
              queryParams
            );
            const filteredTotal = countRes.rows[0]?.filtered_total || 0;

            // Paginated items - DEFAULT ORDER BY MEJORES PRIMERO (Highest Visual Quality Score first)
            const offset = (page - 1) * pageSize;
            const itemsRes = await pool.query(
              `SELECT * FROM atlas_nature_assets ${whereSql} ORDER BY atlas_visual_quality_score DESC NULLS LAST, asset_id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
              [...queryParams, pageSize, offset]
            );

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.end(JSON.stringify({
              success: true,
              stats,
              total: filteredTotal,
              page,
              pageSize,
              totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)),
              items: itemsRes.rows
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // ATLAS PERMANENT EMAIL FILTER ENGINE
        if (url.startsWith('/api/atlas/email-filter')) {
          try {
            const targetModule = path.resolve(projectRoot, 'src/lib/atlasEngine/AtlasEmailFilterEngine.ts');
            let filterEngine: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              filterEngine = mod.AtlasEmailFilterEngine.getInstance();
            } catch {
              const mod = await import(targetModule);
              filterEngine = mod.AtlasEmailFilterEngine.getInstance();
            }
            await filterEngine.ensureIndexLoaded();

            if ((url === '/api/atlas/email-filter/status' || url.startsWith('/api/atlas/email-filter/status?')) && req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...filterEngine.getStatus() }));
              return;
            }

            if (url.startsWith('/api/atlas/email-filter/executive-dashboard')) {
              if (req.method === 'GET') {
                const urlObj = new URL(url, 'http://localhost');
                const filters: any = {};
                if (urlObj.searchParams.get('province')) filters.province = urlObj.searchParams.get('province');
                if (urlObj.searchParams.get('profession')) filters.profession = urlObj.searchParams.get('profession');
                if (urlObj.searchParams.get('organization')) filters.organization = urlObj.searchParams.get('organization');
                if (urlObj.searchParams.get('domain')) filters.domain = urlObj.searchParams.get('domain');
                if (urlObj.searchParams.get('source_family')) filters.source_family = urlObj.searchParams.get('source_family');

                const execData = await filterEngine.getExecutiveDashboard(Object.keys(filters).length > 0 ? filters : undefined);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(execData));
                return;
              } else if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk: any) => { body += chunk; });
                req.on('end', async () => {
                  const parsed = body ? JSON.parse(body) : {};
                  let filters = parsed.filters || {};
                  if (parsed.natural_query && parsed.natural_query.trim()) {
                    const interpreted = filterEngine.resolveNaturalQuery(parsed.natural_query);
                    filters = { ...interpreted.applied_filters, ...filters };
                  }
                  const execData = await filterEngine.getExecutiveDashboard(filters);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(execData));
                });
                return;
              }
            }

            if (url.startsWith('/api/atlas/email-filter/facets')) {
              if (req.method === 'GET') {
                const urlObj = new URL(url, 'http://localhost');
                const filters: any = {};
                if (urlObj.searchParams.get('province')) filters.province = urlObj.searchParams.get('province');
                if (urlObj.searchParams.get('city')) filters.city = urlObj.searchParams.get('city');
                if (urlObj.searchParams.get('profession')) filters.profession = urlObj.searchParams.get('profession');
                if (urlObj.searchParams.get('email_type')) filters.email_type = urlObj.searchParams.get('email_type');
                if (urlObj.searchParams.get('source_family')) filters.source_family = urlObj.searchParams.get('source_family');
                if (urlObj.searchParams.get('sector')) filters.sector = urlObj.searchParams.get('sector');

                const facets = await filterEngine.getFacets(Object.keys(filters).length > 0 ? filters : undefined);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, ...facets }));
                return;
              } else if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk: any) => { body += chunk; });
                req.on('end', async () => {
                  const parsed = body ? JSON.parse(body) : {};
                  let filters = parsed.filters || {};
                  if (parsed.natural_query && parsed.natural_query.trim()) {
                    const interpreted = filterEngine.resolveNaturalQuery(parsed.natural_query);
                    filters = { ...interpreted.applied_filters, ...filters };
                  }
                  const facets = await filterEngine.getFacets(filters);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, ...facets }));
                });
                return;
              }
            }

            if (url.startsWith('/api/atlas/email-filter/search') && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', async () => {
                const parsed = body ? JSON.parse(body) : {};
                let criteria = parsed.filters || {};
                let interpreted: any = undefined;

                if (parsed.natural_query && parsed.natural_query.trim()) {
                  interpreted = filterEngine.resolveNaturalQuery(parsed.natural_query);
                  criteria = { ...interpreted.applied_filters, ...criteria };
                }

                const page = parsed.page || 1;
                const pageSize = parsed.page_size || 25;
                const result = await filterEngine.executeFilter(criteria, page, pageSize);
                if (interpreted) result.interpreted_filters = interpreted;

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              });
              return;
            }

            if (url.startsWith('/api/atlas/email-filter/count') && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', async () => {
                const parsed = body ? JSON.parse(body) : {};
                let criteria = parsed.filters || {};
                if (parsed.natural_query && parsed.natural_query.trim()) {
                  const interpreted = filterEngine.resolveNaturalQuery(parsed.natural_query);
                  criteria = { ...interpreted.applied_filters, ...criteria };
                }
                const result = await filterEngine.executeFilter(criteria, 1, 1);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  total_matches: result.total_matches,
                  query_time_ms: result.filter_query_time_ms
                }));
              });
              return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ...filterEngine.getStatus() }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // Contact Search
        if (url.startsWith('/api/atlas/contact-search') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              try {
                if (server.moduleGraph && typeof server.moduleGraph.invalidateAll === 'function') {
                  server.moduleGraph.invalidateAll();
                }
              } catch {}
              const targetModule = path.resolve(projectRoot, 'src/lib/search/AtlasContactSearchService.ts');
              let serviceClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                serviceClass = mod.AtlasContactSearchService;
              } catch {
                const mod = await import(targetModule);
                serviceClass = mod.AtlasContactSearchService;
              }
              const result = await serviceClass.executeSearch(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Commercial Opportunity Engine API Endpoint
        if (url.startsWith('/api/atlas/opportunities') && req.method === 'GET') {
          try {
            const urlObj = new URL(url, 'http://localhost:5175');
            const targetModule = path.resolve(projectRoot, 'src/lib/atlas/opportunity/AtlasOpportunityApiService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasOpportunityApiService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasOpportunityApiService;
            }

            const queryParams = {
              opportunity_type: urlObj.searchParams.get('opportunity_type') || undefined,
              geo: urlObj.searchParams.get('geo') || undefined,
              entity_type: urlObj.searchParams.get('entity_type') || undefined,
              minimum_score: urlObj.searchParams.get('minimum_score') ? parseFloat(urlObj.searchParams.get('minimum_score')!) : undefined,
              minimum_confidence: urlObj.searchParams.get('minimum_confidence') ? parseFloat(urlObj.searchParams.get('minimum_confidence')!) : undefined,
              has_contact: urlObj.searchParams.get('has_contact') === 'true',
              recency_days: urlObj.searchParams.get('recency') ? parseInt(urlObj.searchParams.get('recency')!, 10) : undefined,
              product_query: urlObj.searchParams.get('product_query') || undefined,
              limit: urlObj.searchParams.get('limit') ? parseInt(urlObj.searchParams.get('limit')!, 10) : 20,
              page: urlObj.searchParams.get('page') ? parseInt(urlObj.searchParams.get('page')!, 10) : 1,
              environment: (urlObj.searchParams.get('environment') as any) || 'PRODUCTION'
            };

            const response = await serviceClass.getInstance().queryOpportunities(queryParams);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(response));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Atlas Vender / Commerce Engine Search Endpoint
        if (url.startsWith('/api/atlas/vender/search') && req.method === 'GET') {
          try {
            try {
              if (server.moduleGraph && typeof server.moduleGraph.invalidateAll === 'function') {
                server.moduleGraph.invalidateAll();
              }
            } catch {}
            const urlObj = new URL(url, 'http://localhost:5175');
            const targetModule = path.resolve(projectRoot, 'src/lib/atlas/commerce/AtlasVenderService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasVenderService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasVenderService;
            }

            const query = urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || 'software de recursos humanos';
            const buyer_type = (urlObj.searchParams.get('buyer_type') || 'COMPANY') as 'PERSON' | 'COMPANY' | 'BOTH';
            const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);

            const result = await serviceClass.getInstance().searchBuyers({ query, buyer_type, limit });

            // If accessed via a browser directly (accept text/html and format != json), render rich interactive HTML UI
            const isBrowserHtml = req.headers.accept?.includes('text/html') && urlObj.searchParams.get('format') !== 'json';
            if (isBrowserHtml) {
              const buyersList = result.buyers || result.results || [];
              const summary = result.summary || {};
              const profile = result.product_profile || {};

              const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atlas Vender / Commerce V1 — ${query}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.5; padding: 1.5rem; }
    .container { max-width: 1140px; margin: 0 auto; }
    .nav-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; background: #ffffff; border: 1px solid #e2e8f0; padding: 0.75rem 1.25rem; borderRadius: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem; border-radius: 9px; font-weight: 700; font-size: 0.85rem; text-decoration: none; cursor: pointer; border: none; transition: all 0.15s ease; }
    .btn-primary { background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25); }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-outline { background: #ffffff; color: #0284c7; border: 1.5px solid #bae6fd; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem; box-shadow: 0 4px 16px -2px rgba(0,0,0,0.04); }
    .search-bar { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
    .input-box { flex: 1; min-width: 280px; padding: 0.75rem 1rem; border-radius: 10px; border: 1.5px solid #cbd5e1; font-size: 0.95rem; font-weight: 600; background: #f8fafc; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
    .summary-box { background: #f8fafc; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e2e8f0; }
    .summary-num { font-size: 1.35rem; font-weight: 900; }
    .scores-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.85rem; margin: 1rem 0; }
    .score-card { padding: 0.85rem 1rem; border-radius: 12px; }
    .badge { display: inline-block; font-size: 0.68rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 6px; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.65); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 9999; padding: 1rem; }
    .modal-content { background: #ffffff; border-radius: 16px; width: 100%; max-width: 600px; padding: 1.5rem; max-height: 90vh; overflow-y: auto; border: 1px solid #e2e8f0; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); }
  </style>
</head>
<body>
  <div class="container">
    <!-- Navigation bar -->
    <div class="nav-bar">
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span style="background: #10b981; color: #fff; padding: 0.3rem 0.6rem; border-radius: 8px; font-weight: 800; font-size: 0.85rem;">ATLAS COMMERCE</span>
        <strong style="font-size: 1rem; color: #0f172a;">VENDER / MOTOR DE COMPATIBILIDAD V1</strong>
      </div>
      <div style="display: flex; gap: 0.6rem;">
        <a href="/search/contactos?mode=vender&q=${encodeURIComponent(query)}&buyer_type=${buyer_type}" class="btn btn-primary" id="btn-open-in-app">
          ⚡ ABRIR EN APP PRINCIPAL (/search/contactos)
        </a>
        <a href="/api/atlas/vender/search?q=${encodeURIComponent(query)}&buyer_type=${buyer_type}&limit=${limit}&format=json" class="btn btn-secondary" id="btn-view-raw-json">
          📄 VER JSON CRUDO
        </a>
      </div>
    </div>

    <!-- Search Card -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h1 style="font-size: 1.3rem; font-weight: 900; color: #0f172a;">Buscador y Ranker de Compradores</h1>
          <p style="font-size: 0.82rem; color: #64748b; margin-top: 0.2rem;">Encuentra compradores estructuralmente compatibles sin exigir oportunidad temporal activa</p>
        </div>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">BUYER_FIT != OPPORTUNITY</span>
          <span class="badge" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">4 DIMENSIONES INDEPENDIENTES</span>
          <span class="badge" style="background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff;">CONNECTOR V1</span>
        </div>
      </div>

      <form method="GET" action="/api/atlas/vender/search" class="search-bar">
        <input type="text" name="q" value="${query}" class="input-box" placeholder="¿Qué vendés? ej. software de recursos humanos">
        <select name="buyer_type" class="input-box" style="flex: 0 0 160px; font-weight: 700;">
          <option value="COMPANY" ${buyer_type === 'COMPANY' ? 'selected' : ''}>EMPRESAS</option>
          <option value="PERSON" ${buyer_type === 'PERSON' ? 'selected' : ''}>PERSONAS</option>
          <option value="BOTH" ${buyer_type === 'BOTH' ? 'selected' : ''}>AMBOS</option>
        </select>
        <button type="submit" class="btn btn-primary" style="padding: 0.75rem 1.5rem; font-size: 0.95rem;">
          🔍 BUSCAR COMPRADORES
        </button>
      </form>

      <!-- Summary Ribbon -->
      <div class="summary-grid">
        <div class="summary-box">
          <div style="font-size: 0.68rem; color: #64748b; font-weight: 800;">CANDIDATES</div>
          <div class="summary-num" style="color: #0f172a;">${summary.total_candidates || buyersList.length}</div>
        </div>
        <div class="summary-box" style="background: #f0fdf4; border-color: #bbf7d0;">
          <div style="font-size: 0.68rem; color: #166534; font-weight: 800;">HIGH_FIT (≥0.70)</div>
          <div class="summary-num" style="color: #15803d;">${summary.high_fit_count || buyersList.length}</div>
        </div>
        <div class="summary-box" style="background: #fffbeb; border-color: #fde68a;">
          <div style="font-size: 0.68rem; color: #92400e; font-weight: 800;">MEDIUM_FIT</div>
          <div class="summary-num" style="color: #b45309;">${summary.medium_fit_count || 0}</div>
        </div>
        <div class="summary-box" style="background: #eef2ff; border-color: #c7d2fe;">
          <div style="font-size: 0.68rem; color: #3730a3; font-weight: 800;">COMMERCIAL_OPP</div>
          <div class="summary-num" style="color: #4338ca;">${summary.with_opportunity_count || 0}</div>
        </div>
        <div class="summary-box" style="background: #f0f9ff; border-color: #bae6fd;">
          <div style="font-size: 0.68rem; color: #075985; font-weight: 800;">WITH_CONTACT</div>
          <div class="summary-num" style="color: #0369a1;">${summary.with_verified_contact_count || 0}</div>
        </div>
        <div class="summary-box" style="background: #fff7ed; border-color: #fed7aa;">
          <div style="font-size: 0.68rem; color: #9a3412; font-weight: 800;">AVG PROXY RATIO</div>
          <div class="summary-num" style="color: #c2410c;">${((summary.avg_proxy_ratio || 0) * 100).toFixed(0)}%</div>
        </div>
        <div class="summary-box" style="background: #f0fdfa; border-color: #99f6e4;">
          <div style="font-size: 0.68rem; color: #115e59; font-weight: 800;">AVG INDEP. COV</div>
          <div class="summary-num" style="color: #0f766e;">${((summary.avg_independent_evidence_coverage || 0) * 100).toFixed(0)}%</div>
        </div>
        <div class="summary-box" style="background: #faf5ff; border-color: #e9d5ff;">
          <div style="font-size: 0.68rem; color: #6b21a8; font-weight: 800;">AVG CONFIDENCE</div>
          <div class="summary-num" style="color: #7e22ce;">${((summary.avg_fit_confidence || 0)).toFixed(2)}</div>
        </div>
      </div>
    </div>

    <!-- Candidate Cards -->
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      ${buyersList.map((c, i) => `
        <div class="card" id="card-${c.candidate_id || c.entity_id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h3 style="font-size: 1.15rem; font-weight: 900; color: #0f172a;">${c.candidate_name || c.entity_name}</h3>
                <span class="badge" style="background: #f1f5f9; color: #475569;">${c.candidate_type || c.entity_type}</span>
                <span class="badge" style="background: ${c.fit_tier === 'HIGH_FIT' ? '#dcfce7; color: #166534; border: 1px solid #bbf7d0;' : (c.fit_tier === 'MEDIUM_FIT' ? '#fef3c7; color: #92400e; border: 1px solid #fde68a;' : '#fee2e2; color: #991b1b; border: 1px solid #fecaca;')} font-weight: 800;">
                  ${c.fit_tier || 'EVALUATED'}
                </span>
                <span class="badge" style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0;">Sedes: ${c.distinct_locations || 1}</span>
                ${c.buyer_need_nature ? `
                  <span class="badge" style="background: ${c.buyer_need_nature === 'OBSERVED' ? '#dcfce7; color: #166534; border: 1px solid #bbf7d0;' : (c.buyer_need_nature === 'DERIVED' ? '#e0f2fe; color: #0369a1; border: 1px solid #bae6fd;' : (c.buyer_need_nature === 'INFERRED' ? '#f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff;' : '#f1f5f9; color: #64748b; border: 1px solid #cbd5e1;'))}">
                    ${c.buyer_need_nature === 'OBSERVED' ? '🎯 NECESIDAD OBSERVADA' : (c.buyer_need_nature === 'DERIVED' ? '⚡ COMPATIBILIDAD OPERATIVA' : (c.buyer_need_nature === 'INFERRED' ? '💡 NECESIDAD INFERIDA' : 'SIN EVIDENCIA'))}
                  </span>
                ` : ''}
                ${c.purchase_intent ? `
                  <span class="badge" style="background: ${c.purchase_intent === 'ACTIVE_SIGNAL' ? '#ecfdf5; color: #047857; border: 1px solid #a7f3d0;' : '#f8fafc; color: #64748b; border: 1px solid #e2e8f0;'}">
                    ${c.purchase_intent === 'ACTIVE_SIGNAL' ? '🔥 INTENCIÓN ACTIVA' : (c.purchase_intent === 'UNCONFIRMED' ? '⏳ INTENCIÓN NO CONFIRMADA' : 'SIN INTENCIÓN')}
                  </span>
                ` : ''}
              </div>
            </div>
            <span class="badge" style="background: #0f172a; color: #ffffff; padding: 0.25rem 0.65rem; font-size: 0.75rem;">
              PRIORIDAD #${i + 1}
            </span>
          </div>

          <!-- 4 Scores Grid -->
          <div class="scores-grid">
            <div class="score-card" style="background: #f0fdf4; border: 1.5px solid #bbf7d0;">
              <div style="font-size: 0.7rem; font-weight: 800; color: #166534;">BUYER FIT SCORE</div>
              <div style="font-size: 1.5rem; font-weight: 900; color: #15803d; margin-top: 0.2rem;">
                ${(c.base_buyer_fit_score !== undefined ? c.base_buyer_fit_score : (c.buyer_fit_score || 0)).toFixed(2)}
                <span style="font-size: 0.75rem; color: #166534; font-weight: 700;">/ 1.00</span>
              </div>
              <div style="font-size: 0.68rem; color: #166534; margin-top: 0.2rem;">
                Crit: ${(((c.criteria_coverage !== undefined ? c.criteria_coverage : c.evidence_coverage) || 0.7) * 100).toFixed(0)}% • Indep: ${(((c.independent_evidence_coverage !== undefined ? c.independent_evidence_coverage : 0.33)) * 100).toFixed(0)}%
              </div>
            </div>

            <div class="score-card" style="background: ${c.opportunity_score !== null ? '#eef2ff' : '#f8fafc'}; border: 1.5px solid ${c.opportunity_score !== null ? '#c7d2fe' : '#e2e8f0'};">
              <div style="font-size: 0.7rem; font-weight: 800; color: ${c.opportunity_score !== null ? '#3730a3' : '#64748b'};">OPPORTUNITY SCORE</div>
              <div style="font-size: ${c.opportunity_score !== null ? '1.5rem' : '1.1rem'}; font-weight: 900; color: ${c.opportunity_score !== null ? '#4338ca' : '#64748b'}; margin-top: 0.2rem;">
                ${c.opportunity_score !== null ? `${c.opportunity_score.toFixed(2)} / 1.00` : 'NOT_DETERMINED'}
              </div>
              <div style="font-size: 0.68rem; color: ${c.opportunity_score !== null ? '#4338ca' : '#64748b'}; margin-top: 0.2rem;">
                ${c.commercial_opportunity === 'ACTIVE' ? `SEÑAL COMERCIAL (${c.opportunity_type || 'ACTIVA'})` : (c.opportunity_type === 'CONTACTABILITY_SIGNAL' ? 'Solo contactabilidad (Timing: 0.00)' : 'Sin señal comercial (Timing: 0.00)')}
              </div>
            </div>

            <div class="score-card" style="background: ${c.contactability_score > 0 ? '#f0f9ff' : '#f8fafc'}; border: 1.5px solid ${c.contactability_score > 0 ? '#bae6fd' : '#e2e8f0'};">
              <div style="font-size: 0.7rem; font-weight: 800; color: ${c.contactability_score > 0 ? '#075985' : '#64748b'};">CONTACTABILITY SCORE</div>
              <div style="font-size: 1.5rem; font-weight: 900; color: ${c.contactability_score > 0 ? '#0284c7' : '#94a3b8'}; margin-top: 0.2rem;">
                ${(c.contactability_score || 0).toFixed(2)}
                <span style="font-size: 0.75rem; color: #64748b; font-weight: 700;">/ 1.00</span>
              </div>
              <div style="font-size: 0.68rem; color: ${c.contactability_score > 0 ? '#0369a1' : '#64748b'}; margin-top: 0.2rem;">
                ${c.contactability_score > 0 ? 'Canales verificados observados' : 'Sin contacto (No destruye Fit)'}
              </div>
            </div>

            <div class="score-card" style="background: #faf5ff; border: 1.5px solid #e9d5ff;">
              <div style="font-size: 0.7rem; font-weight: 800; color: #6b21a8;">CONFIDENCE SCORE</div>
              <div style="font-size: 1.5rem; font-weight: 900; color: #7e22ce; margin-top: 0.2rem;">
                ${(c.confidence_score || c.fit_confidence || 0).toFixed(2)}
                <span style="font-size: 0.75rem; color: #6b21a8; font-weight: 700;">/ 1.00</span>
              </div>
              <div style="font-size: 0.68rem; color: #7e22ce; margin-top: 0.2rem;">
                Proxy: ${(((c.proxy_ratio !== undefined ? c.proxy_ratio : 0.8)) * 100).toFixed(0)}% (Tope de Confianza)
              </div>
            </div>
          </div>

          <!-- Why & Recommended Product -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; background: #f8fafc; border-radius: 12px; padding: 1rem; border: 1px solid #e2e8f0; margin-bottom: 0.85rem;">
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 0.4rem;">¿POR QUÉ ENCAJA?</div>
              ${c.why_need ? `
                <div style="font-size: 0.78rem; font-weight: 700; color: ${c.buyer_need_nature === 'DERIVED' ? '#0369a1' : (c.buyer_need_nature === 'INFERRED' ? '#7e22ce' : '#15803d')}; background: ${c.buyer_need_nature === 'DERIVED' ? '#f0f9ff' : (c.buyer_need_nature === 'INFERRED' ? '#faf5ff' : '#f0fdf4')}; border: 1px solid ${c.buyer_need_nature === 'DERIVED' ? '#bae6fd' : (c.buyer_need_nature === 'INFERRED' ? '#e9d5ff' : '#bbf7d0')}; padding: 0.45rem 0.65rem; border-radius: 8px; margin-bottom: 0.5rem;">
                  📌 ${c.why_need}
                </div>
              ` : ''}
              <ul style="padding-left: 1.1rem; font-size: 0.78rem; color: #334155;">
                ${(c.match_reasons || []).map(r => `<li style="margin-bottom: 0.2rem;">${r}</li>`).join('')}
              </ul>
            </div>
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 0.4rem;">PRODUCTO RECOMENDADO</div>
              <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.6rem 0.8rem;">
                <div style="font-weight: 800; font-size: 0.85rem; color: #0f172a;">${c.recommended_product_tier || 'Plan Empresas'}</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.15rem;">$${profile.price || 450} ${profile.currency || 'USD'} / mes (${profile.purchase_mode || 'SUBSCRIPTION'})</div>
              </div>
            </div>
          </div>

          <!-- Contact & Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <strong style="font-size: 0.78rem; color: #475569;">CONTACTO:</strong>
              ${(c.verified_contacts?.linkedin || []).map(li => `
                <a href="${li}" target="_blank" rel="noopener noreferrer" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; text-decoration: none;">
                  🌐 LinkedIn Verificado
                </a>
              `).join('')}
              ${(c.verified_contacts?.emails || []).map(em => `
                <a href="mailto:${em}" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; text-decoration: none;">
                  ✉️ ${em}
                </a>
              `).join('')}
              ${(!c.verified_contacts?.linkedin?.length && !c.verified_contacts?.emails?.length && !c.verified_contacts?.phones?.length) ? `
                <span style="font-size: 0.78rem; color: #94a3b8; font-style: italic;">Sin contacto directo verificado en SSOT (Prospecto compatible válido)</span>
              ` : ''}
            </div>

            <div style="display: flex; gap: 0.4rem;">
              <a href="/search/contactos?mode=vender&q=${encodeURIComponent(query)}" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.75rem;">
                👁️ VER EVIDENCIA
              </a>
              <button onclick="alert('FICHA DE PRODUCTO SIMULADO:\\n• SKU: ${profile.product_id || 'PROD_SIM_01'}\\n• Título: ${profile.product_name || query}\\n• Modo: ${profile.purchase_mode || 'SIMULATION'}\\n• Precio: $${profile.price || 120000} ${profile.currency || 'ARS'}\\n• Conector: SimulatedCommerceConnector (environment = SIMULATION)')" class="btn btn-outline" style="font-size: 0.75rem; padding: 0.4rem 0.75rem;">
                🛍️ VER PRODUCTO
              </button>
              <button onclick="fetch('/api/atlas/vender/simulate-purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: '${profile.product_id || 'PROD_HR_CORP_01'}', buyer_id: '${c.candidate_id || c.entity_id}', seller_id: 'SELLER_FERRETERIA_DEMO', match_score: ${c.product_buyer_match_score || c.base_buyer_fit_score || 0.62}, price: ${profile.price || 120000} }) }).then(r => r.json()).then(d => alert('COMPRA SIMULADA COMPLETADA:\\n• ID: ' + (d.purchase_id || 'sim_ok') + '\\n• Environment: SIMULATION\\n• Sin cobro real ni orden externa'));" class="btn btn-primary" style="font-size: 0.75rem; padding: 0.4rem 0.85rem;">
                💳 SIMULAR COMPRA
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }

            // Otherwise, return pure JSON response
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result, null, 2));
          } catch (err: any) {
            console.error('[atlas-vender-api] Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Vender search failed' }));
          }
          return;
        }

        // Atlas Commerce Event Recording Endpoint
        if (url.startsWith('/api/atlas/vender/event') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const targetModule = path.resolve(projectRoot, 'src/lib/atlas/commerce/AtlasCommerceEvents.ts');
              let dispatcherClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                dispatcherClass = mod.AtlasCommerceEventDispatcher;
              } catch {
                const mod = await import(targetModule);
                dispatcherClass = mod.AtlasCommerceEventDispatcher;
              }

              parsedBody.environment = 'SIMULATION';
              const eventId = await dispatcherClass.getInstance().recordEvent(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, event_id: eventId }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Atlas Commerce Simulated Purchase Endpoint
        if (url.startsWith('/api/atlas/vender/simulate-purchase') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const targetModule = path.resolve(projectRoot, 'src/lib/atlas/commerce/SimulatedCommerceFunnel.ts');
              let funnelClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                funnelClass = mod.SimulatedCommerceFunnel;
              } catch {
                const mod = await import(targetModule);
                funnelClass = mod.SimulatedCommerceFunnel;
              }

              const purchaseRecord = await funnelClass.getInstance().recordPurchaseCompleted({
                product_id: parsedBody.product_id || 'PROD_HR_CORP_01',
                buyer_id: parsedBody.buyer_id || 'UNKNOWN_BUYER',
                seller_id: parsedBody.seller_id || 'SELLER_SIMULATED',
                match_score: parsedBody.match_score || 0.8,
                price: parsedBody.price || 120000,
                currency: parsedBody.currency || 'ARS'
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...purchaseRecord }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Contact Search Mission Progress Endpoint
        if (url.startsWith('/api/atlas/contact-search/progress') && req.method === 'GET') {
          try {
            const urlObj = new URL(url, 'http://localhost:5175');
            let missionId = urlObj.searchParams.get('mission_id') || '';
            const since = Number(urlObj.searchParams.get('since')) || 0;
            if (!missionId) {
              const parts = urlObj.pathname.split('/').filter(Boolean);
              if (parts.length >= 4) {
                missionId = parts[parts.length - 1];
              }
            }
            try {
              fs.appendFileSync(path.resolve(projectRoot, 'scratch/progress_requests.log'), `${new Date().toISOString()} ${missionId}\n`);
            } catch {}

            const targetModule = path.resolve(projectRoot, 'src/lib/search/AtlasContactSearchService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasContactSearchService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasContactSearchService;
            }

            if (missionId === 'list_all' || !missionId) {
              if (serviceClass.getOrCreateStalledMission && (!serviceClass.activeMissions || serviceClass.activeMissions.size === 0)) {
                serviceClass.getOrCreateStalledMission();
              }
              const all = Array.from((serviceClass.activeMissions || new Map()).entries()).map(([k, v]: any) => ({
                id: k,
                target: v.target,
                existing_first: v.existing_first,
                penta_acquired: v.penta_acquired,
                remaining: v.remaining,
                status: v.status,
                process_alive: v.process_alive,
                penta_discovery_active: v.penta_discovery_active,
                source_queue_depth: v.source_queue_depth,
                source_probes_pending: v.source_probes_pending,
                new_source_routes_pending: v.new_source_routes_pending,
                query: v.original_query
              }));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: all.length, missions: all }));
              return;
            }

            const progress = serviceClass.getMissionProgress(missionId, since);
            if (progress) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...progress }));
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Mission not found' }));
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Contact Stats Endpoint
        if (url.startsWith('/api/atlas/contact-stats/live') && req.method === 'GET') {
          try {
            const targetModule = path.resolve(projectRoot, 'src/lib/search/AtlasContactStatsService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasContactStatsService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasContactStatsService;
            }
            const stats = await serviceClass.getLiveStats();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(stats));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message, status: 'STALE' }));
          }
          return;
        }

        // Base Intelligence Endpoint SSOT
        if (url.startsWith('/api/atlas/base-intelligence') && req.method === 'GET') {
          try {
            const targetModule = path.resolve(projectRoot, 'src/lib/search/AtlasBaseIntelligenceService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasBaseIntelligenceService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasBaseIntelligenceService;
            }
            const intel = serviceClass.getIntelligence();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(intel));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Contact Search History Endpoint
        if (url.startsWith('/api/atlas/contact-history') || url.startsWith('/api/atlas/contact-search/history')) {
          const targetModule = path.resolve(projectRoot, 'src/lib/search/AtlasContactStatsService.ts');
          let serviceClass: any;
          try {
            const mod = await server.ssrLoadModule(targetModule);
            serviceClass = mod.AtlasContactStatsService;
          } catch {
            const mod = await import(targetModule);
            serviceClass = mod.AtlasContactStatsService;
          }

          if (req.method === 'GET') {
            try {
              const history = serviceClass.getHistory();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, history }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsedBody = body ? JSON.parse(body) : {};
                const saved = serviceClass.addHistoryItem(parsedBody);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, item: saved }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
        }

        // Outreach Proposal Send
        if (url.startsWith('/api/atlas/outreach/send-proposal') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const targetModule = path.resolve(projectRoot, 'src/lib/outreach/AtlasOutreachEmailService.ts');
              let serviceClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              } catch {
                const mod = await import(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              }
              const result = await serviceClass.sendProposal(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Outreach Preview
        if (url.startsWith('/api/atlas/outreach/preview') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const targetModule = path.resolve(projectRoot, 'src/lib/outreach/AtlasOutreachEmailService.ts');
              let serviceClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              } catch {
                const mod = await import(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              }
              const result = serviceClass.previewProposal(parsedBody);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, preview: result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Outreach Real Webhook Feedback Loop
        if (url.startsWith('/api/atlas/outreach/webhook') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsedBody = body ? JSON.parse(body) : {};
              const targetModule = path.resolve(projectRoot, 'src/lib/outreach/AtlasOutreachEmailService.ts');
              let serviceClass: any;
              try {
                const mod = await server.ssrLoadModule(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              } catch {
                const mod = await import(targetModule);
                serviceClass = mod.AtlasOutreachEmailService;
              }
              const event = await serviceClass.processWebhook(parsedBody, req.headers as any);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, event }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Outreach Real Status Query
        if (url.startsWith('/api/atlas/outreach/status') && req.method === 'GET') {
          try {
            const urlObj = new URL(url, 'http://localhost:5175');
            const messageId = urlObj.searchParams.get('message_id') || '';
            const campaignId = urlObj.searchParams.get('campaign_id') || '';
            const targetModule = path.resolve(projectRoot, 'src/lib/outreach/AtlasOutreachEmailService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasOutreachEmailService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasOutreachEmailService;
            }

            if (campaignId) {
              const summary = serviceClass.getCampaignStatus(campaignId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...summary }));
            } else if (messageId) {
              const status = await serviceClass.getStatus(messageId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, messageId, status }));
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'message_id or campaign_id query param required' }));
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // ATLAS CONTENT LIBRARY ENDPOINTS
        if (url.startsWith('/api/atlas/broadcast/content-library')) {
          try {
            const targetModule = path.resolve(projectRoot, 'server/services/broadcast/content/AtlasContentLibraryService.ts');
            let serviceClass: any;
            try {
              const mod = await server.ssrLoadModule(targetModule);
              serviceClass = mod.AtlasContentLibraryService;
            } catch {
              const mod = await import(targetModule);
              serviceClass = mod.AtlasContentLibraryService;
            }
            const instance = serviceClass.getInstance();

            if (url === '/api/atlas/broadcast/content-library' && req.method === 'GET') {
              const items = await instance.getContentLibrary();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, items_count: items.length, items }));
              return;
            }

            if (url.startsWith('/api/atlas/broadcast/content-library/side-by-side') && req.method === 'GET') {
              const urlObj = new URL(url, 'http://localhost:5175');
              const contentId = urlObj.searchParams.get('content_id') || 'AI_DRAFT_VIDEO_1';
              const sideBySide = await instance.getSideBySideComparison(contentId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...sideBySide }));
              return;
            }

            if (url.startsWith('/api/atlas/broadcast/content-library/advanced-video-provider/status') && req.method === 'GET') {
              const advTarget = path.resolve(projectRoot, 'server/services/broadcast/content/AtlasAdvancedVideoProvider.ts');
              let advClass: any;
              try {
                const advMod = await server.ssrLoadModule(advTarget);
                advClass = advMod.AtlasAdvancedVideoProvider;
              } catch {
                const advMod = await import(advTarget);
                advClass = advMod.AtlasAdvancedVideoProvider;
              }
              const report = await advClass.getInstance().detectAndCertifyProviders();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, provider: report }));
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/verify-preview' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const result = instance.verifyPreview(String(parsed.content_id));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/edit-text' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                instance.updateContentText(String(parsed.content_id), String(parsed.text));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, content_id: parsed.content_id, text: parsed.text }));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/ai-generate' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const created = instance.createAiDraft(parsed);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, item: created }));
              });
              return;
            }

            if ((url === '/api/atlas/broadcast/content-library/ai-regenerate' || url === '/api/atlas/broadcast/content-library/ai-regenerate-version') && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const regenerated = instance.regenerateAiVersion(String(parsed.content_id));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, item: regenerated }));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/switch-version' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const switched = instance.switchAiVersion(String(parsed.content_id), String(parsed.version));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, item: switched }));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/ai-improve' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const result = instance.improveWithAi(String(parsed.content_id));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/ai-discard' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const discarded = instance.discardDraft(String(parsed.content_id));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: discarded, content_id: parsed.content_id }));
              });
              return;
            }

            if ((url === '/api/atlas/broadcast/content-library/ai-approve' || url === '/api/atlas/broadcast/content-library/ai-approve-release') && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', () => {
                const parsed = body ? JSON.parse(body) : {};
                const approved = instance.approveAiContent(String(parsed.content_id));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, item: approved }));
              });
              return;
            }

            if (url === '/api/atlas/broadcast/content-library/render-video' && req.method === 'POST') {
              let body = '';
              req.on('data', (c: any) => { body += c; });
              req.on('end', async () => {
                try {
                  const parsed = body ? JSON.parse(body) : {};
                  const rendered = await instance.renderDraftVideo(String(parsed.content_id));
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, item: rendered }));
                } catch (rErr: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: rErr.message }));
                }
              });
              return;
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), atlasContactSearchPlugin()],
  root: __dirname,
  publicDir: path.resolve(projectRoot, 'public'),
  envDir: projectRoot,
  server: {
    port: 5175,
    host: true,
    fs: {
      allow: [projectRoot]
    },
    proxy: {
      // Captures share the canonical server implementation; other video routes stay unchanged.
      '/api/atlas/video/capture-frame': { target: 'http://127.0.0.1:5174', changeOrigin: true },
      '/api/atlas/video/capture-clip': { target: 'http://127.0.0.1:5174', changeOrigin: true },
      '/api/atlas/video/render-composition': { target: 'http://127.0.0.1:5174', changeOrigin: true },
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        bypass: (req) => {
          if (req.url && req.url.startsWith('/api/atlas/video/')) {
            return req.url;
          }
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['maplibre-gl']
  }
});
