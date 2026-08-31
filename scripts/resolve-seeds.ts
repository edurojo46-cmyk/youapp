import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

// Supabase config (should be set in env or passed)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !YOUTUBE_API_KEY) {
  console.error("Faltan variables de entorno (SUPABASE_URL, SUPABASE_KEY, o YOUTUBE_API_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

interface SeedManifestItem {
  input: string;
  name: string;
  provider: string;
  category: string;
  country: string;
  language: string;
  tier: string;
}

async function fetchFromYouTube(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function processSeed(seed: SeedManifestItem) {
  console.log(`\nProcesando: ${seed.name} (${seed.input})`);
  let channelId = null;
  let channelData = null;
  let status = 'pending';
  let method = 'unknown';

  try {
    // 1. Extraer Handle o ID
    let handleMatch = seed.input.match(/@([\w.-]+)/);
    let channelIdMatch = seed.input.match(/channel\/(UC[\w-]{22})/);
    let isHandle = false;

    if (channelIdMatch) {
      // Caso 3: Ya tenemos channelId
      channelId = channelIdMatch[1];
      method = 'id';
      console.log(`  └─ Detectado Channel ID directo: ${channelId}`);
    } else if (handleMatch) {
      // Casos 1 y 2: Tenemos Handle
      const handle = `@${handleMatch[1]}`;
      isHandle = true;
      method = 'handle';
      console.log(`  └─ Detectado Handle: ${handle}. Usando channels.list(forHandle)...`);
      
      const data = await fetchFromYouTube(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}`);
      
      if (data.items && data.items.length > 0) {
        channelData = data.items[0];
        channelId = channelData.id;
      } else {
        console.log(`  ❌ No se encontró canal para el handle: ${handle}`);
        status = 'not_found';
      }
    } else {
      // Caso 4: Búsqueda ambigua ("Gastón Edul")
      method = 'search';
      console.log(`  └─ Sin Handle/ID. Búsqueda ambigua de canal: "${seed.input}". Usando search.list...`);
      
      const searchData = await fetchFromYouTube(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(seed.input)}&maxResults=3&key=${YOUTUBE_API_KEY}`);
      
      if (searchData.items && searchData.items.length > 0) {
        console.log(`\n  ⚠ AMBIGUOUS: ${seed.input}`);
        searchData.items.forEach((item: any, idx: number) => {
          console.log(`  [${idx + 1}] ${item.snippet.title} (ID: ${item.snippet.channelId})`);
        });
        console.log(`  [0] Ninguno (Omitir)`);
        
        const answer = await question(`  CONFIRMAR [1-${searchData.items.length}] o 0: `);
        const choice = parseInt(answer.trim(), 10);
        
        if (choice > 0 && choice <= searchData.items.length) {
          channelId = searchData.items[choice - 1].snippet.channelId;
        } else {
          status = 'not_found';
          console.log(`  ❌ Omitido por el usuario.`);
        }
      } else {
        console.log(`  ❌ No se encontraron resultados en la búsqueda.`);
        status = 'not_found';
      }
    }

    // Si obtuvimos un channelId (sea por ID, Handle o Búsqueda interactiva), obtenemos el resto de datos
    if (channelId && !channelData) {
      const data = await fetchFromYouTube(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`);
      if (data.items && data.items.length > 0) {
        channelData = data.items[0];
      }
    }

    if (channelData && channelId) {
      status = 'verified';
      const handle = channelData.snippet.customUrl || null;
      const uploadsPlaylistId = channelData.contentDetails?.relatedPlaylists?.uploads || null;
      
      // Guardar en Supabase - Idempotente (Upsert)
      const { data: insertedSeed, error: insertError } = await supabase
        .from('seed_sources')
        .upsert({
          provider: 'youtube',
          provider_channel_id: channelId,
          name: channelData.snippet.title, // Nombre real de YouTube (o podríamos priorizar el editorial)
          handle: handle,
          normalized_handle: handle ? handle.toLowerCase() : null,
          canonical_url: `https://youtube.com/channel/${channelId}`,
          country: seed.country,
          language: seed.language,
          tier: seed.tier,
          uploads_playlist_id: uploadsPlaylistId,
          status: status,
          last_verified_at: new Date().toISOString()
        }, { onConflict: 'provider,provider_channel_id' })
        .select()
        .single();

      if (insertError) {
         if (insertError.code === '23505') { // Ya existe o viola un unique
           console.log(`  ♻ Duplicado ignorado (Ya en base de datos)`);
           return { status: 'duplicate' };
         }
         console.error(`  ❌ Error insertando seed:`, insertError.message);
         return { status: 'error' };
      }

      // Asociar Categoría (M:N)
      if (insertedSeed && seed.category) {
        const { error: catError } = await supabase
          .from('seed_source_categories')
          .upsert({
            seed_source_id: insertedSeed.id,
            category: seed.category
          }, { onConflict: 'seed_source_id,category' });
          
        if (catError) {
          console.error(`  ❌ Error insertando categoría:`, catError.message);
        }
      }

      console.log(`  ✅ Guardado/Verificado: ${channelData.snippet.title} (Uploads: ${uploadsPlaylistId})`);
      return { status: 'verified' };
    }

    return { status };

  } catch (err: any) {
    console.error(`  ❌ Error procesando ${seed.input}:`, err.message);
    return { status: 'error' };
  }
}

async function main() {
  console.log("=== INICIANDO RESOLUCIÓN DE SEEDS ===");
  const manifestPath = path.join(process.cwd(), 'scripts', 'seeds', 'seed-manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest: SeedManifestItem[] = JSON.parse(manifestRaw);
  
  let stats = {
    total: manifest.length,
    verified: 0,
    ambiguous: 0,
    not_found: 0,
    duplicate: 0,
    error: 0
  };

  for (const seed of manifest) {
    const res = await processSeed(seed);
    if (res.status === 'verified') stats.verified++;
    else if (res.status === 'not_found') stats.not_found++;
    else if (res.status === 'duplicate') stats.duplicate++;
    else if (res.status === 'error') stats.error++;
    // Ambigüedad resuelta se cuenta como verificada si lo encontró, 
    // pero podemos llevar un registro más fino si lo deseamos.
  }

  console.log("\n=== SEED RESOLUTION COMPLETADA ===");
  console.log(`Fuentes totales:       ${stats.total}`);
  console.log(`✅ Verificadas:         ${stats.verified}`);
  console.log(`❌ No encontradas:      ${stats.not_found}`);
  console.log(`♻ Duplicadas:           ${stats.duplicate}`);
  console.log(`⚠ Errores:             ${stats.error}`);
  
  rl.close();
}

main().catch(console.error);
