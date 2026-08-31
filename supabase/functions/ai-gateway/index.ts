import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// ai-gateway — Brain Level 2
//
// Tres capacidades principales:
//   1. summary    — Resumen inteligente de un video
//   2. you4       — "Te puede interesar también" — recomendaciones contextuales
//   3. ask_video  — Preguntarle al video (Q&A sobre el contenido)
//
// Regla: Gemini produce señales y respuestas. YouApp controla el formato final.
// ═══════════════════════════════════════════════════════════════════════════

// ── Llamada a Gemini Flash ───────────────────────────────────────────────────
async function callGemini(prompt: string, apiKey: string, maxTokens = 512): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
        }
      }),
      signal: AbortSignal.timeout(60000)
    }
  );

  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── 1. SUMMARY — Resumen inteligente de un video ────────────────────────────
async function generateSummary(video: any, apiKey: string): Promise<{
  headline: string;
  summary: string;
  keyPoints: string[];
  idealFor: string;
  duration_label: string;
}> {
  const minutes = video.duration_seconds ? Math.round(video.duration_seconds / 60) : null;
  const durationStr = minutes ? `${minutes} minutos` : 'duración desconocida';

  const prompt = `Eres el asistente de YouApp, una app de televisión inteligente. Analiza este video y genera un resumen conciso y atractivo. Responde SOLO con JSON válido, sin markdown.

Video:
- Título: "${video.title}"
- Descripción: "${(video.description || '').slice(0, 600)}"
- Canal: "${video.creator_name || video.channelTitle || 'Desconocido'}"
- Duración: ${durationStr}
- Idioma: ${video.language || 'desconocido'}

Responde con exactamente este JSON:
{
  "headline": "Una frase gancho de máximo 12 palabras que capture la esencia del video",
  "summary": "Resumen de 2-3 oraciones que explique de qué trata el video, sin spoilers si es entretenimiento",
  "keyPoints": ["punto clave 1", "punto clave 2", "punto clave 3"],
  "idealFor": "Para quién es ideal este video (ej: 'Amantes de la historia argentina', 'Estudiantes de física')",
  "duration_label": "Etiqueta de duración (ej: 'Video corto · 8 min', 'Documental completo · 1h 22min')"
}`;

  const raw = await callGemini(prompt, apiKey, 400);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid JSON from Gemini');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    headline: parsed.headline || video.title,
    summary: parsed.summary || '',
    keyPoints: parsed.keyPoints || [],
    idealFor: parsed.idealFor || '',
    duration_label: parsed.duration_label || (minutes ? `${minutes} min` : '')
  };
}

// ── 1.5. ANALYZE_VIDEO — Resumen rico para AiSummary.tsx ────────────────────
async function generateAnalysis(title: string, description: string, apiKey: string): Promise<any> {
  const prompt = `Eres el motor de IA de YouApp. Analiza la siguiente información de un video y genera un resumen enriquecido. Responde SOLO con un JSON válido, sin bloques de código markdown, con la siguiente estructura exacta:

{
  "summary": {
    "short": "Resumen muy breve de 1 oración.",
    "medium": "Resumen estándar de 2-3 oraciones.",
    "detailed": "Resumen más largo y detallado de 5-6 oraciones explicando el contexto."
  },
  "ideas": ["Idea principal 1", "Idea principal 2", "Idea principal 3", "Idea principal 4", "Idea principal 5"],
  "chapters": [
    { "time": "00:00", "title": "Introducción" },
    { "time": "03:15", "title": "Desarrollo del tema" },
    { "time": "12:30", "title": "Conclusión" }
  ],
  "moments": [
    { "time": "05:20", "title": "Momento destacado clave" },
    { "time": "09:45", "title": "Cita importante o clímax" }
  ],
  "learning": "Un párrafo en primera persona que explique qué aprende el espectador al ver este video (ej: 'Aprendí cómo funciona...')."
}

Usa tu conocimiento general para inferir capítulos y momentos plausibles si la descripción no los incluye, basados en el formato típico de un video sobre este tema (usa tiempos lógicos como 00:00, 01:20, etc).

Video:
- Título: "${title}"
- Descripción: "${(description || '').slice(0, 1000)}"`;

  const raw = await callGemini(prompt, apiKey, 2500);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Invalid JSON from Gemini. Raw response: ${raw.slice(0, 500)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON parse error. Raw response: ${raw.slice(0, 500)}`);
  }
}


// ── 2. YOU4 — Recomendaciones contextuales ───────────────────────────────────
async function generateYou4(
  currentVideo: any,
  candidates: any[],
  apiKey: string
): Promise<{ videoId: string; reason: string }[]> {
  if (!candidates.length) return [];

  // Limitar candidatos para no sobrepasar el context window
  const topCandidates = candidates.slice(0, 15);
  const candidatesList = topCandidates.map((v, i) =>
    `${i + 1}. ID: ${v.id} | "${v.title}" | Canal: ${v.creator_name || v.channelTitle || '?'}`
  ).join('\n');

  const prompt = `Eres el motor de recomendaciones de YouApp. El usuario acaba de ver:
"${currentVideo.title}" (${currentVideo.creator_name || currentVideo.channelTitle || 'Canal desconocido'})

De esta lista de videos disponibles, selecciona los 4 más relevantes para recomendar DESPUÉS de ver el video anterior. Considera complementariedad temática, nivel de dificultad similar, y diversidad de perspectivas. Responde SOLO con JSON válido.

Videos disponibles:
${candidatesList}

Responde con exactamente este JSON:
{
  "recommendations": [
    {"index": 1, "reason": "Por qué este video complementa el anterior (máx 10 palabras)"},
    {"index": 2, "reason": "..."},
    {"index": 3, "reason": "..."},
    {"index": 4, "reason": "..."}
  ]
}`;

  const raw = await callGemini(prompt, apiKey, 300);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.recommendations || []).map((r: any) => ({
    videoId: topCandidates[r.index - 1]?.id || '',
    reason: r.reason || ''
  })).filter((r: any) => r.videoId);
}

// ── 3. ASK_VIDEO — Preguntarle al video ──────────────────────────────────────
async function askVideo(
  video: any,
  question: string,
  apiKey: string
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low'; disclaimer?: string }> {
  const prompt = `Eres el asistente de YouApp. El usuario está viendo el siguiente video y tiene una pregunta. Responde basándote ÚNICAMENTE en la información disponible (título, descripción, canal). Si no tienes suficiente información, dilo honestamente.

Video:
- Título: "${video.title}"
- Descripción: "${(video.description || '').slice(0, 800)}"
- Canal: "${video.creator_name || video.channelTitle || 'Desconocido'}"

Pregunta del usuario: "${question}"

Responde SOLO con JSON válido:
{
  "answer": "Tu respuesta en máximo 3 oraciones. Si no sabes, dilo honestamente.",
  "confidence": "high|medium|low (según cuánta info tienes sobre el video)",
  "disclaimer": "Opcional: nota si la respuesta se basa solo en descripción/título sin ver el video completo"
}`;

  const raw = await callGemini(prompt, apiKey, 350);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      answer: 'No pude analizar ese video en este momento. Intentá de nuevo.',
      confidence: 'low'
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    answer: parsed.answer || '',
    confidence: parsed.confidence || 'low',
    disclaimer: parsed.disclaimer
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
      const { action, video_id, question, candidate_ids } = body;

      if (!action) {
        return new Response(JSON.stringify({ error: 'action required: summary | you4 | ask_video' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ── 1. Resumen ──────────────────────────────────────────────────────────
      if (action === 'summary') {
        if (!video_id) {
          return new Response(JSON.stringify({ error: 'video_id required for summary' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const { data: video } = await supabase.from('youapp_index').select('*').eq('id', video_id).maybeSingle();
        if (!video) {
          return new Response(JSON.stringify({ error: `Video ${video_id} not found` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const result = await generateSummary(video, geminiKey);

        // Guardar en atlas_video_features para no regenerar innecesariamente
        await supabase.from('atlas_video_features').upsert({
          content_id: video_id,
          enrichment_level: 'level2',
          enriched_at: new Date().toISOString()
        }, { onConflict: 'content_id' });

        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 1.5. Analyze Video (AiSummary) ──────────────────────────────────────
      if (action === 'analyze_video') {
        const title = body.title;
        const description = body.description || '';
        
        if (!title) {
          return new Response(JSON.stringify({ error: 'title required for analyze_video' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await generateAnalysis(title, description, geminiKey);
        
        // AiSummary.tsx expects the direct object, not { success, result }
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 2. YOU4 — Recomendaciones ───────────────────────────────────────────
      if (action === 'you4') {
        if (!body.video_id) return new Response(JSON.stringify({ error: 'video_id required for you4' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { data: video } = await supabase.from('youapp_index').select('*').eq('id', body.video_id).maybeSingle();
        if (!video) return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        let candidates: any[] = [];

        if (candidate_ids?.length) {
          const { data } = await supabase
            .from('youapp_index')
            .select('id, title, creator_name, description')
            .in('id', candidate_ids.slice(0, 20));
          candidates = data || [];
        } else {
          // Buscar candidatos similares en Atlas si no se proveen
          const { data } = await supabase
            .from('youapp_index')
            .select('id, title, creator_name, description')
            .neq('id', body.video_id)
            .limit(15);
          candidates = data || [];
        }

        const result = await generateYou4(video, candidates, geminiKey);
        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 3. Preguntarle al video ──────────────────────────────────────────────
      if (action === 'ask_video') {
        if (!body.video_id) return new Response(JSON.stringify({ error: 'video_id required for ask_video' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const { data: video } = await supabase.from('youapp_index').select('*').eq('id', body.video_id).maybeSingle();
        if (!video) return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (!question?.trim()) {
          return new Response(JSON.stringify({ error: 'question required for ask_video' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await askVideo(video, question, geminiKey);
        return new Response(JSON.stringify({ success: true, action, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
