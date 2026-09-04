/**
 * discoveryPlanner.ts — Planificador de Misiones Discovery mediante Gemini (Solo JSON Estructurado)
 */

import { DEFAULT_DISCOVERY_BUDGET } from './discoveryBudget';
import type { DiscoveryPlan, DiscoveryRequest, DiscoveryChannel } from './types';
import { supabase } from '../supabase';

const ALLOWED_CHANNELS = new Set<DiscoveryChannel>([
  'atlas',
  'bluesky_live',
  'bluesky_backfill',
  'nostr',
  'lemmy',
  'publisher_sitemap',
  'broadcaster_archive',
  'rss',
  'mrss',
  'vimeo',
  'dailymotion',
  'peertube',
  'archive'
]);

async function callGeminiPlanner(systemPrompt: string, data: any): Promise<any> {
  const isServer = typeof window === 'undefined';
  const apiKey = (isServer && typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';

  const prompt = `${systemPrompt}\n\nINPUT DATA:\n${JSON.stringify(data, null, 2)}\n\nOUTPUT FORMAT: Return a valid JSON object ONLY.`;

  // 1. En entornos de backend / scripts Node.js con GEMINI_API_KEY en variables de entorno seguras
  if (isServer && apiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(10000)
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return JSON.parse(text);
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Intentar vía Supabase Edge Function 'ai-gateway'
  try {
    const { data: edgeData, error } = await supabase.functions.invoke('ai-gateway', {
      body: { action: 'plan_discovery', prompt, data }
    });
    if (!error && edgeData && !edgeData.error) {
      return typeof edgeData === 'string' ? JSON.parse(edgeData) : edgeData;
    }
    if (error && import.meta.env?.DEV) {
      console.warn(`[AI Gateway Discovery Audit] missionId: plan_${data.query?.slice(0, 10)} | requestType: plan_discovery | HTTP status: 400 | validation error: Unknown action: plan_discovery (falling back to heuristic planner)`);
    }
  } catch (err: any) {
    if (import.meta.env?.DEV) {
      console.warn(`[AI Gateway Discovery Audit] Exception invoking ai-gateway: ${err?.message}`);
    }
  }

  // 3. Fallback Heurístico Estructurado si el servicio no responde
  const query = data.query || '';
  const isMusicOrLive = /concierto|recital|vivo|live|acustico|musica|cancion|tema/i.test(query);
  const isInterviewOrNews = /entrevista|charla|declaracion|debate|programa|badia|noticia/i.test(query);

  const preferred: DiscoveryChannel[] = ['bluesky_backfill', 'bluesky_live'];
  if (isMusicOrLive) preferred.push('broadcaster_archive', 'publisher_sitemap');
  if (isInterviewOrNews) preferred.push('broadcaster_archive', 'rss');

  return {
    shouldDiscover: true,
    intent: `Discover audiovisual content for query: ${query}`,
    targetEntities: data.entities || [query],
    targetWorks: data.works || [],
    preferredChannels: preferred,
    targetConcepts: [query],
    rarityTarget: 'high',
    confidence: 0.85,
    reason: 'Heuristic high-affinity gap planner'
  };
}

export async function planDiscovery(request: DiscoveryRequest): Promise<DiscoveryPlan> {
  const system = `
You are the Discovery Planner for YouAppTV Atlas (Search & Discovery Engine).
Your job is ONLY to produce a structured discovery plan to fill gaps in Atlas search results.

CRITICAL INVARIANTS:
1. You may NEVER request scraping of YouTube Search.list, X/Twitter without API, Reddit, or any restricted service.
2. Select ONLY from allowed channels: ${Array.from(ALLOWED_CHANNELS).join(', ')}.
3. Prefer high-novelty channels like bluesky_backfill, broadcaster_archive, publisher_sitemap, archive.
4. Return a valid JSON object matching the DiscoveryPlan schema.
`;

  const rawPlan = await callGeminiPlanner(system, {
    query: request.query,
    entities: request.entities ?? [],
    works: request.works ?? [],
    atlasCoverage: request.coverageScore,
    qualifiedResults: request.relevanceQualifiedCount,
    gaps: request.gaps,
    allowedChannels: Array.from(ALLOWED_CHANNELS),
    budget: DEFAULT_DISCOVERY_BUDGET
  });

  const channels: DiscoveryChannel[] = (rawPlan.preferredChannels ?? [])
    .filter((channel: string): channel is DiscoveryChannel => ALLOWED_CHANNELS.has(channel as DiscoveryChannel));

  return {
    shouldDiscover: Boolean(rawPlan.shouldDiscover ?? true),
    intent: String(rawPlan.intent ?? request.query),
    targetEntities: rawPlan.targetEntities ?? request.entities ?? [],
    targetWorks: rawPlan.targetWorks ?? request.works ?? [],
    preferredChannels: channels.length > 0 ? channels.slice(0, DEFAULT_DISCOVERY_BUDGET.maxSources) : ['bluesky_backfill', 'broadcaster_archive'],
    targetConcepts: rawPlan.targetConcepts ?? [request.query],
    rarityTarget: rawPlan.rarityTarget || 'normal',
    confidence: Math.max(0, Math.min(1, Number(rawPlan.confidence ?? 0.8))),
    maxSources: DEFAULT_DISCOVERY_BUDGET.maxSources,
    maxPagesPerSource: DEFAULT_DISCOVERY_BUDGET.maxPagesPerSource,
    reason: String(rawPlan.reason ?? 'Autonomous Discovery Gap Fill')
  };
}
