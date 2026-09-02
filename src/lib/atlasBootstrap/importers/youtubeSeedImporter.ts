/**
 * youtubeSeedImporter.ts — Importador de Semillas Conocidas de YouTube para Atlas Bootstrap
 *
 * REGLAS INVIOLABLES DE SEGURIDAD DE CUOTA:
 * 1. BOOTSTRAP_YOUTUBE_RADAR_BUDGET = 0 (Prohibido quemar cuota de búsqueda)
 * 2. ALLOW_YOUTUBE_SEARCH_LIST = false (Nunca ejecuta search.list de YouTube)
 * 3. Solo ingesta desde IDs/feeds de canales verificados en seed_sources o listas estáticas.
 */

import type { RawDiscoveredItem } from '../bootstrapTypes';
import { supabase } from '../../supabase';

export const BOOTSTRAP_YOUTUBE_RADAR_BUDGET = 0;
export const ALLOW_YOUTUBE_SEARCH_LIST = false;

export async function importFromYouTubeKnownSeeds(
  topicId: string,
  runId: string,
  limit = 25
): Promise<RawDiscoveredItem[]> {
  // Verificación de seguridad en runtime
  if (BOOTSTRAP_YOUTUBE_RADAR_BUDGET !== 0 || ALLOW_YOUTUBE_SEARCH_LIST !== false) {
    throw new Error('SECURITY_VIOLATION: YouTube search.list is forbidden during Atlas Bootstrap.');
  }

  try {
    // Obtener canales/semillas verificadas de seed_sources (provider='youtube')
    const { data: seeds } = await supabase
      .from('seed_sources')
      .select('provider_source_id, provider_channel_id, name, metadata')
      .eq('provider', 'youtube')
      .eq('status', 'verified')
      .limit(limit);

    if (!seeds || seeds.length === 0) return [];

    // Mapear semillas a items conocidos sin llamar a search.list
    return seeds.map((seed: any): RawDiscoveredItem => {
      const channelId = seed.provider_source_id || seed.provider_channel_id || '';
      return {
        provider: 'youtube_seed',
        providerContentId: channelId,
        title: seed.name || 'Canal Educativo Verificado',
        description: seed.metadata?.description || 'Canal conocido verificado en seed_sources',
        creatorName: seed.name,
        creatorId: channelId,
        canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
        embedUrl: `https://www.youtube-nocookie.com/embed?listType=user_uploads&list=${channelId}`,
        durationSeconds: 900,
        publishedAt: new Date().toISOString(),
        language: 'es',
        topicId,
        embeddable: true,
        provenance: {
          bootstrapRun: runId,
          discoveryOrigin: 'youtube_seed_sources',
          sourceSeed: channelId,
          discoveredAt: new Date().toISOString(),
          canonicalId: channelId
        }
      };
    });
  } catch (err: any) {
    console.warn('[YouTubeSeedImporter] Error:', err.message);
    return [];
  }
}
