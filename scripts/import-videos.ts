import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !YOUTUBE_API_KEY) {
  console.error("Faltan variables de entorno (SUPABASE_URL, SUPABASE_KEY, o YOUTUBE_API_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchPlaylistItems(playlistId: string, limit: number = 50) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${limit}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.items || [];
}

async function fetchVideoDetails(videoIds: string[]) {
  if (videoIds.length === 0) return [];
  // Rich metadata request
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.items || [];
}

// Convert ISO 8601 duration to seconds
function parseDurationSeconds(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const hours = (parseInt(match[1]) || 0);
  const minutes = (parseInt(match[2]) || 0);
  const seconds = (parseInt(match[3]) || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

async function main() {
  console.log("=== INICIANDO IMPORTACIÓN DE VIDEOS (ARQUITECTURA FINAL) ===");

  const { data: sources, error: fetchError } = await supabase
    .from('seed_sources')
    .select('*')
    .eq('status', 'verified')
    .not('uploads_playlist_id', 'is', null);

  if (fetchError) {
    console.error("❌ Error obteniendo seed sources:", fetchError);
    process.exit(1);
  }

  console.log(`Encontrados ${sources.length} canales verificados para importar.`);

  let totalVideos = 0;
  let totalDuplicates = 0;

  for (const source of sources) {
    console.log(`\nProcesando canal: ${source.name} (Playlist: ${source.uploads_playlist_id})`);
    
    try {
      // 1. Crear Job y linkear a seed_sources
      const { data: job, error: jobError } = await supabase
        .from('catalog_import_jobs')
        .insert({
          type: 'channel',
          seed_source_id: source.id,
          source_url: source.canonical_url,
          category: source.category,
          requested_count: 50,
          status: 'processing'
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // 2. Obtener los 50 últimos videos de la playlist de uploads
      const playlistItems = await fetchPlaylistItems(source.uploads_playlist_id, 50);
      const videoIds = playlistItems.map((item: any) => item.contentDetails.videoId);
      
      // 3. Obtener detalles ricos (en batch)
      const videoDetails = await fetchVideoDetails(videoIds);
      const videoDetailsMap = new Map();
      for (const vd of videoDetails) {
        videoDetailsMap.set(vd.id, vd);
      }

      let processedCount = 0;
      let duplicateCount = 0;
      let rejectedCount = 0;

      // 4. Insertar de a uno manejando la deduplicación y relaciones
      for (const item of playlistItems) {
        const videoId = item.contentDetails.videoId;
        const details = videoDetailsMap.get(videoId);
        
        if (!details) {
          rejectedCount++;
          continue; // Video privado/borrado
        }

        const durationSecs = parseDurationSeconds(details.contentDetails?.duration || "");
        
        // Tratar de insertar el candidato único
        const { data: insertedItem, error: insertError } = await supabase
          .from('catalog_import_items')
          .insert({
            provider: 'youtube',
            provider_content_id: videoId,
            seed_source_id: source.id,
            title: details.snippet?.title || "",
            description: details.snippet?.description || "",
            thumbnail_url: details.snippet?.thumbnails?.high?.url || details.snippet?.thumbnails?.default?.url,
            published_at: details.snippet?.publishedAt,
            duration_seconds: durationSecs,
            view_count: details.statistics?.viewCount ? parseInt(details.statistics.viewCount) : null,
            like_count: details.statistics?.likeCount ? parseInt(details.statistics.likeCount) : null,
            comment_count: details.statistics?.commentCount ? parseInt(details.statistics.commentCount) : null,
            category_id: details.snippet?.categoryId,
            embeddable: details.status?.embeddable,
            privacy_status: details.status?.privacyStatus,
            canonical_url: `https://youtube.com/watch?v=${videoId}`,
            raw_metadata: details, // Guardamos el JSON crudo por si acaso
            status: 'pending_approval'
          })
          .select('id')
          .single();

        let itemId = insertedItem?.id;

        if (insertError) {
          if (insertError.code === '23505') { // Ya existe globalmente
            const { data: existing } = await supabase
              .from('catalog_import_items')
              .select('id')
              .eq('provider', 'youtube')
              .eq('provider_content_id', videoId)
              .single();
            
            itemId = existing?.id;
            duplicateCount++;
          } else {
            console.error(`  ❌ Error insertando video ${videoId}:`, insertError.message);
            rejectedCount++;
          }
        } else {
          processedCount++;
        }

        // 5. Relacionar este item con el Job actual (historial)
        if (itemId) {
          await supabase
            .from('catalog_import_job_items')
            .insert({
              job_id: job.id,
              import_item_id: itemId
            });
        }
      }

      // 6. Actualizar Job a completado
      await supabase
        .from('catalog_import_jobs')
        .update({
          processed_count: processedCount,
          duplicate_count: duplicateCount,
          rejected_count: rejectedCount,
          status: 'completed'
        })
        .eq('id', job.id);

      totalVideos += processedCount;
      totalDuplicates += duplicateCount;
      console.log(`  ✅ Completado: ${processedCount} nuevos, ${duplicateCount} duplicados/existentes, ${rejectedCount} errores.`);
      
    } catch (err: any) {
      console.error(`  ❌ Error en canal ${source.name}:`, err.message);
    }
  }

  console.log(`\n=== IMPORTACIÓN FINALIZADA ===`);
  console.log(`Canales procesados: ${sources.length}`);
  console.log(`Videos totales insertados (Nuevos): ${totalVideos}`);
  console.log(`Videos totales existentes (Relaciones agregadas): ${totalDuplicates}`);
}

main().catch(console.error);
