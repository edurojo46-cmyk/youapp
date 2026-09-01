import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Quality Score Formula ─────────────────────────────────────────────────────
// Gemini produce señales. YouApp controla la fórmula.
function calculateQualityScore(params: {
  metadataQuality: number;    // 0-100: completitud y confiabilidad de metadata
  sourceConfidence: number;   // 0-100: confianza en la fuente
  semanticDepth: number;      // 0-100: señal de Gemini sobre profundidad del contenido
  contextAuthority: number;   // 0-100: autoridad del contexto de donde vino el video
  spamRisk: number;           // 0-100: riesgo de spam (penaliza)
}): number {
  const raw =
    (params.metadataQuality    * 0.20) +
    (params.sourceConfidence   * 0.20) +
    (params.semanticDepth      * 0.25) +
    (params.contextAuthority   * 0.15) +
    ((100 - params.spamRisk)   * 0.20);

  return Math.min(100, Math.max(0, Math.round(raw)));
}

// ── Metadata Completeness (Level 0 — Código) ─────────────────────────────────
function assessMetadata(video: any): {
  completeness: number;
  readiness: number;
  provenance: string;
} {
  let score = 0;
  if (video.title && video.title.length > 5) score += 25;
  if (video.description && video.description.length > 20) score += 20;
  if (video.thumbnail_url) score += 15;
  if (video.published_at) score += 20;
  if (video.duration_seconds && video.duration_seconds > 0) score += 10;
  if (video.creator_name) score += 10;

  // Readiness: penaliza si publishedAt es desconocido (especialmente para news)
  const readiness = video.published_at ? score : Math.max(0, score - 20);
  
  const provenance = video.source === 'watcher_rss' ? 'rss'
    : video.source === 'radar' ? 'official_api'
    : video.source === 'scout' ? 'official_api'
    : video.metadata_provenance || 'unknown';

  return { completeness: score, readiness, provenance };
}

// ── Level 1: Clasificación local/barata ──────────────────────────────────────
function classifyLevel1(title: string, description: string, channelName: string): {
  format?: string;
  language?: string;
  spamRisk: number;
  confidence: number;
} {
  const text = `${title} ${description}`.toLowerCase();
  
  // Detección de idioma básica (Level 1)
  const spanishMarkers = ['el', 'la', 'de', 'en', 'que', 'los', 'las', 'con', 'para', 'del', 'por', 'una', 'este', 'esto', 'como', 'pero'];
  const portugueseMarkers = ['de', 'da', 'do', 'em', 'que', 'os', 'as', 'com', 'para', 'um', 'uma', 'esse', 'esta', 'como', 'mas'];
  const englishMarkers = ['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'this', 'that', 'with', 'for'];
  
  const words = text.split(/\s+/);
  const countMarkers = (markers: string[]) => words.filter(w => markers.includes(w)).length;
  
  const esCount = countMarkers(spanishMarkers);
  const ptCount = countMarkers(portugueseMarkers);
  const enCount = countMarkers(englishMarkers);
  
  let language: string | undefined;
  const maxCount = Math.max(esCount, ptCount, enCount);
  if (maxCount > 2) {
    if (esCount === maxCount) language = 'es';
    else if (ptCount === maxCount) language = 'pt';
    else language = 'en';
  }

  // Detección de formato básica
  let format: string | undefined;
  if (/documental|documentary|full film|película completa/.test(text)) format = 'documentary';
  else if (/entrevista|interview|conversación/.test(text)) format = 'interview';
  else if (/tutorial|cómo|how to|step by step/.test(text)) format = 'tutorial';
  else if (/noticias|news|breaking|últimas|novedades/.test(text)) format = 'news';
  else if (/clase|lecture|curso|course|lección/.test(text)) format = 'lecture';

  // Señales de spam básicas
  let spamRisk = 0;
  if (/subscribe|suscrib|like y compart|gratis|free|gana|earn money/i.test(text)) spamRisk += 15;
  if (/\$\$\$|💰💰💰|🔥🔥🔥/.test(title)) spamRisk += 20;
  if (title.length < 5 || title.toUpperCase() === title) spamRisk += 10;
  if (/click here|haz click|ver más|see more/.test(text)) spamRisk += 10;

  // Confidence: qué tan seguro estamos del resultado
  const confidence = language ? (format ? 75 : 55) : 35;

  return { format, language, spamRisk: Math.min(100, spamRisk), confidence };
}

// ── Level 2: Gemini Flash ────────────────────────────────────────────────────
async function classifyWithGemini(
  title: string,
  description: string,
  apiKey: string
): Promise<{
  primary_topic?: string;
  subtopics?: string[];
  entities?: string[];
  format?: string;
  difficulty?: string;
  perspective?: string;
  semantic_depth?: number;
  spam_probability?: number;
}> {
  try {
    const prompt = `Analyze this video metadata and respond ONLY with a JSON object. No markdown, no explanation.

Title: "${title}"
Description: "${description.slice(0, 500)}"

Respond with exactly this JSON structure:
{
  "primary_topic": "one main topic in English (e.g., history, science, football, politics)",
  "subtopics": ["2-3 specific subtopics"],
  "entities": ["named entities: people, places, organizations, works"],
  "format": "one of: documentary, interview, tutorial, news, lecture, entertainment, unknown",
  "difficulty": "one of: general, intermediate, expert",
  "perspective": "one of: neutral, opinion, investigative, educational",
  "semantic_depth": 0-100,
  "spam_probability": 0-100
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!res.ok) return {};

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const { content_id, force_level2 = false, batch_ids } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Soporte para un video individual o un batch de IDs
      const ids: string[] = batch_ids || (content_id ? [content_id] : []);
      
      if (ids.length === 0) {
        return new Response(JSON.stringify({ error: 'Se requiere content_id o batch_ids' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const results = { enriched: 0, level1: 0, level2: 0, errors: [] as string[] };

      for (const id of ids) {
        try {
          // 1. Obtener el video de youapp_index
          const { data: video, error: fetchError } = await supabase
            .from('youapp_index')
            .select('*')
            .eq('id', id)
            .single();

          if (fetchError || !video) {
            results.errors.push(`Video ${id} not found`);
            continue;
          }

          // 2. Level 0: Metadata Assessment
          const { completeness, readiness, provenance } = assessMetadata(video);

          // 3. Level 1: Clasificación local
          const level1 = classifyLevel1(
            video.title || '',
            video.description || '',
            video.creator_name || ''
          );

          // 4. Decidir si necesita Level 2 (Gemini)
          const needsLevel2 = force_level2 || (geminiKey && level1.confidence < 70);
          let level2: Awaited<ReturnType<typeof classifyWithGemini>> = {};
          
          if (needsLevel2 && geminiKey) {
            level2 = await classifyWithGemini(
              video.title || '',
              video.description || '',
              geminiKey
            );
            results.level2++;
          } else {
            results.level1++;
          }

          // 5. Calcular YouScore (YouApp controla la fórmula)
          const metadataQuality = completeness;
          const sourceConfidence = video.source_verified ? 85 : 55;
          const semanticDepth = level2.semantic_depth ?? (level1.confidence);
          const contextAuthority = 50; // Default, será sobrescrito por publisher_sources
          const spamRisk = Math.max(level1.spamRisk, level2.spam_probability ?? 0);
          
          const qualityScore = calculateQualityScore({
            metadataQuality,
            sourceConfidence,
            semanticDepth,
            contextAuthority,
            spamRisk
          });

          const enrichmentLevel = needsLevel2 && level2.primary_topic ? 'level2' : 'level1';

          // 6. Actualizar youapp_index con metadata universal
          await supabase.from('youapp_index').update({
            metadata_completeness: completeness,
            metadata_readiness: readiness,
            metadata_provenance: provenance,
            language: level1.language || video.language,
            updated_at: new Date().toISOString()
          }).eq('id', id);

          // 7. Upsert en atlas_video_features
          const { error: atlasError } = await supabase
            .from('atlas_video_features')
            .upsert({
              content_id: id,
              primary_topic: level2.primary_topic || null,
              subtopics: level2.subtopics || null,
              entities: level2.entities || null,
              format: level2.format || level1.format || null,
              difficulty: level2.difficulty || 'general',
              perspective: level2.perspective || 'neutral',
              quality_score: qualityScore,
              quality_confidence: level1.confidence,
              source_confidence: sourceConfidence,
              context_authority: contextAuthority,
              spam_risk: spamRisk,
              semantic_depth: level2.semantic_depth ?? null,
              spam_probability: level2.spam_probability ?? null,
              metadata_quality_signal: metadataQuality,
              enrichment_level: enrichmentLevel,
              enrichment_version: 1,
              enriched_at: new Date().toISOString()
            }, { onConflict: 'content_id' });

          if (atlasError) {
            results.errors.push(`Atlas upsert error for ${id}: ${atlasError.message}`);
          } else {
            results.enriched++;
          }

        } catch (err: any) {
          results.errors.push(`Error processing ${id}: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
