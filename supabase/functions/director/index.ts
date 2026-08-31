import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// director — Fase 11: Director de TV Personalizada
//
// Tres modos:
//   1. make_tv      — "Haceme una TV" sobre un tema
//   2. time_block   — "Tengo X minutos, qué veo"
//   3. my_signal    — "Mi Señal" — programación personalizada
//
// El Director selecciona y ordena videos de youapp_index + atlas_video_features.
// Gemini opcionalmente ayuda a ordenar y narrar la programación.
// ═══════════════════════════════════════════════════════════════════════════

async function callGemini(prompt: string, apiKey: string, maxTokens = 600): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens }
      }),
      signal: AbortSignal.timeout(20000)
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds) return '?:??';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildScheduleBlock(video: any, startMinute: number) {
  const duration = video.duration_seconds || 600;
  return {
    video_id: video.id,
    title: video.title,
    provider: video.provider,
    embed_url: video.embed_url,
    thumbnail_url: video.thumbnail_url,
    creator_name: video.creator_name,
    duration_seconds: duration,
    duration_label: formatDuration(duration),
    start_minute: startMinute,
    end_minute: startMinute + Math.ceil(duration / 60),
    quality_score: video.features?.quality_score || 50,
  };
}

// ── 1. MAKE_TV — "Haceme una TV" sobre un tema ───────────────────────────────
async function makeTV(
  topic: string,
  duration_minutes: number,
  language: string,
  supabase: any,
  geminiKey?: string
): Promise<{
  title: string;
  description: string;
  blocks: any[];
  total_minutes: number;
}> {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const q = norm(topic);

  // Buscar videos relevantes en Atlas
  const { data: videos } = await supabase
    .from('youapp_index')
    .select(`
      id, title, description, provider, embed_url, thumbnail_url,
      creator_name, duration_seconds, language, published_at,
      metadata_readiness
    `)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .gte('metadata_readiness', 30)
    .order('metadata_readiness', { ascending: false })
    .limit(50);

  if (!videos?.length) {
    return {
      title: `TV sobre "${topic}"`,
      description: 'No encontramos suficiente contenido. Intentá con otro tema.',
      blocks: [],
      total_minutes: 0
    };
  }

  // Filtrar por idioma si se especifica
  const filtered = language !== 'any'
    ? videos.filter((v: any) => !v.language || v.language === language)
    : videos;

  const pool = filtered.length > 5 ? filtered : videos;

  // Ordenar por calidad y armar bloques hasta llenar el tiempo
  let minutesUsed = 0;
  const blocks: any[] = [];

  for (const video of pool) {
    if (minutesUsed >= duration_minutes) break;
    const dur = video.duration_seconds ? Math.ceil(video.duration_seconds / 60) : 10;
    if (minutesUsed + dur > duration_minutes + 5) continue; // tolerancia 5 min
    blocks.push(buildScheduleBlock(video, minutesUsed));
    minutesUsed += dur;
  }

  // Generar título y descripción con Gemini (si está disponible)
  let title = `📺 TV de ${topic}`;
  let description = `${blocks.length} videos sobre "${topic}" — ${minutesUsed} minutos de contenido`;

  if (geminiKey && blocks.length > 0) {
    try {
      const videoList = blocks.slice(0, 5).map(b => `"${b.title}"`).join(', ');
      const prompt = `Eres el director de YouApp TV. Generaste una programación sobre "${topic}" con estos videos: ${videoList}. Escribe un título atractivo (máx 8 palabras) y descripción (máx 2 oraciones) para esta TV personalizada. Responde SOLO con JSON: {"title": "...", "description": "..."}`;
      const raw = await callGemini(prompt, geminiKey, 150);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        title = parsed.title || title;
        description = parsed.description || description;
      }
    } catch { /* best-effort */ }
  }

  return { title, description, blocks, total_minutes: minutesUsed };
}

// ── 2. TIME_BLOCK — "Tengo X minutos" ────────────────────────────────────────
async function timeBlock(
  available_minutes: number,
  preferred_topics: string[],
  supabase: any
): Promise<{
  suggestion: string;
  blocks: any[];
  total_minutes: number;
}> {
  const queries = preferred_topics.length > 0
    ? preferred_topics
    : ['ciencia', 'historia', 'cultura', 'tecnología'];

  let allVideos: any[] = [];

  for (const topic of queries.slice(0, 3)) {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const { data } = await supabase
      .from('youapp_index')
      .select('id, title, provider, embed_url, thumbnail_url, creator_name, duration_seconds, metadata_readiness')
      .ilike('title', `%${norm(topic)}%`)
      .gte('metadata_readiness', 40)
      .limit(20);
    if (data) allVideos.push(...data);
  }

  // Dedup y filtrar por duración compatible
  const seen = new Set<string>();
  const candidates = allVideos.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    const dur = v.duration_seconds || 600;
    return dur <= available_minutes * 60 + 120; // 2 min tolerancia
  });

  // Estrategia: preferir videos que encajen bien en el tiempo disponible
  candidates.sort((a, b) => {
    const aFit = Math.abs((a.duration_seconds || 600) - available_minutes * 60 * 0.8);
    const bFit = Math.abs((b.duration_seconds || 600) - available_minutes * 60 * 0.8);
    return aFit - bFit;
  });

  let minutesUsed = 0;
  const blocks: any[] = [];

  for (const v of candidates) {
    if (minutesUsed >= available_minutes) break;
    const dur = Math.ceil((v.duration_seconds || 600) / 60);
    if (minutesUsed + dur > available_minutes + 3) continue;
    blocks.push(buildScheduleBlock(v, minutesUsed));
    minutesUsed += dur;
  }

  const suggestion = blocks.length === 1
    ? `Perfecto para ${available_minutes} min: un video de ${blocks[0].duration_label}`
    : `${blocks.length} videos · ${minutesUsed} minutos de contenido`;

  return { suggestion, blocks, total_minutes: minutesUsed };
}

// ── 3. MY_SIGNAL — Programación personalizada ─────────────────────────────────
async function mySignal(
  user_id: string,
  slots: number,  // cuántas franjas horarias armar
  supabase: any,
  geminiKey?: string
): Promise<{
  signal_name: string;
  blocks: any[];
  total_minutes: number;
}> {
  // Buscar videos de alta calidad en Atlas
  const { data: featured } = await supabase
    .from('youapp_index')
    .select(`
      id, title, provider, embed_url, thumbnail_url,
      creator_name, duration_seconds, language,
      atlas_video_features!inner(quality_score, primary_topic, format)
    `)
    .gte('atlas_video_features.quality_score', 60)
    .gte('metadata_readiness', 50)
    .order('atlas_video_features.quality_score', { ascending: false })
    .limit(slots * 3);

  // Fallback si no hay features
  const { data: fallback } = featured?.length ? { data: null } : await supabase
    .from('youapp_index')
    .select('id, title, provider, embed_url, thumbnail_url, creator_name, duration_seconds')
    .gte('metadata_readiness', 40)
    .order('metadata_readiness', { ascending: false })
    .limit(slots * 2);

  const pool = (featured?.length ? featured : fallback) || [];

  // Diversificar formatos
  const seen = new Set<string>();
  const blocks: any[] = [];
  let minutesUsed = 0;

  for (const v of pool) {
    if (blocks.length >= slots) break;
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    blocks.push(buildScheduleBlock(v, minutesUsed));
    minutesUsed += Math.ceil((v.duration_seconds || 600) / 60);
  }

  return {
    signal_name: 'Mi Señal YouApp',
    blocks,
    total_minutes: minutesUsed
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        action,                         // 'make_tv' | 'time_block' | 'my_signal'
        topic,                          // Para make_tv
        duration_minutes = 60,          // Para make_tv y time_block
        language = 'es',               // Para make_tv
        preferred_topics = [],          // Para time_block
        slots = 5,                      // Para my_signal
        user_id                         // Para my_signal
      } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const geminiKey = Deno.env.get('GEMINI_API_KEY'); // Opcional para Director
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      if (action === 'make_tv') {
        if (!topic) return new Response(JSON.stringify({ error: 'topic required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        const result = await makeTV(topic, duration_minutes, language, supabase, geminiKey);
        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'time_block') {
        const result = await timeBlock(duration_minutes, preferred_topics, supabase);
        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'my_signal') {
        const result = await mySignal(user_id || 'anon', slots, supabase, geminiKey);
        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
