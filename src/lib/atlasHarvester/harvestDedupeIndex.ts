/**
 * harvestDedupeIndex.ts — Índice de Deduplicación en RAM Ultrarrápido para YouTube
 */

import { supabase } from '../supabase';
import type { YouTubeHarvestReference } from './types';

export class HarvestDedupeIndex {
  private static knownYouTubeIds: Set<string> = new Set();
  private static totalAtlasCount = 0;
  private static lastCheckpointTime: string = new Date().toISOString();
  private static initPromise: Promise<{ initialTotal: number; youtubeKnownCount: number }> | null = null;

  /**
   * Registro incremental inmediato cuando se inserta un nuevo ID de YouTube en Atlas
   */
  static onAtlasYouTubeInsert(id: string): void {
    if (id) {
      HarvestDedupeIndex.knownYouTubeIds.add(id);
      HarvestDedupeIndex.totalAtlasCount++;
    }
  }

  static isLoaded(): boolean {
    return HarvestDedupeIndex.knownYouTubeIds.size > 0;
  }

  /**
   * Refresco incremental ligero: sólo consulta novedades desde el último checkpoint
   * Sin volver a descargar los 60.000 IDs completos.
   */
  static async incrementalRefresh(): Promise<number> {
    if (HarvestDedupeIndex.knownYouTubeIds.size === 0) {
      const idx = new HarvestDedupeIndex();
      await idx.initialize();
      return HarvestDedupeIndex.knownYouTubeIds.size;
    }

    try {
      const since = HarvestDedupeIndex.lastCheckpointTime;
      HarvestDedupeIndex.lastCheckpointTime = new Date().toISOString();

      const { data, error } = await supabase
        .from('youapp_index')
        .select('provider_content_id')
        .eq('provider', 'youtube')
        .gt('created_at', since)
        .limit(1000);

      if (error || !data || data.length === 0) return 0;

      let added = 0;
      for (const row of data) {
        if (row.provider_content_id && !HarvestDedupeIndex.knownYouTubeIds.has(row.provider_content_id)) {
          HarvestDedupeIndex.knownYouTubeIds.add(row.provider_content_id);
          added++;
        }
      }

      if (added > 0) {
        HarvestDedupeIndex.totalAtlasCount += added;
        if (import.meta.env?.DEV) {
          console.log(`🔄 [Incremental Dedupe Sync] +${added} nuevos IDs de YouTube absorbidos en RAM (Total: ${HarvestDedupeIndex.knownYouTubeIds.size.toLocaleString()}).`);
        }
      }

      return added;
    } catch {
      return 0;
    }
  }

  async initialize(): Promise<{ initialTotal: number; youtubeKnownCount: number }> {
    if (HarvestDedupeIndex.knownYouTubeIds.size > 0) {
      return {
        initialTotal: HarvestDedupeIndex.totalAtlasCount,
        youtubeKnownCount: HarvestDedupeIndex.knownYouTubeIds.size
      };
    }

    if (HarvestDedupeIndex.initPromise) {
      return HarvestDedupeIndex.initPromise;
    }

    HarvestDedupeIndex.initPromise = (async () => {
      console.log('⚡ Cargando índice de YouTube en RAM para deduplicación instantánea (<1s)...');
      const t0 = Date.now();
      HarvestDedupeIndex.lastCheckpointTime = new Date().toISOString();

      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('youapp_index')
          .select('provider_content_id')
          .eq('provider', 'youtube')
          .range(from, from + pageSize - 1);

        if (error || !data || data.length === 0) {
          hasMore = false;
        } else {
          for (const row of data) {
            if (row.provider_content_id) {
              HarvestDedupeIndex.knownYouTubeIds.add(row.provider_content_id);
            }
          }
          if (data.length < pageSize) hasMore = false;
          from += pageSize;
        }
      }

      const { count } = await supabase
        .from('youapp_index')
        .select('*', { count: 'exact', head: true });

      HarvestDedupeIndex.totalAtlasCount = count || 50067;
      const dt = Date.now() - t0;
      console.log(`✅ Índice de YouTube cargado en ${dt}ms: ${HarvestDedupeIndex.knownYouTubeIds.size.toLocaleString()} IDs en RAM (Total Atlas: ${HarvestDedupeIndex.totalAtlasCount.toLocaleString()}).\n`);

      return {
        initialTotal: HarvestDedupeIndex.totalAtlasCount,
        youtubeKnownCount: HarvestDedupeIndex.knownYouTubeIds.size
      };
    })();

    return HarvestDedupeIndex.initPromise;
  }

  isDuplicate(videoId: string): boolean {
    return HarvestDedupeIndex.knownYouTubeIds.has(videoId);
  }

  markSeen(videoId: string): void {
    HarvestDedupeIndex.knownYouTubeIds.add(videoId);
  }

  getTotalAtlasSize(): number {
    return HarvestDedupeIndex.totalAtlasCount;
  }

  incrementAtlasSize(count: number): void {
    HarvestDedupeIndex.totalAtlasCount += count;
  }

  async persistBatch(references: YouTubeHarvestReference[]): Promise<number> {
    if (references.length === 0) return 0;

    const recordsToInsert = references.map(ref => {
      const pubName = (ref as any).publisherName || ref.origin?.publisherName || 'Social Reference';
      const pubId = (ref as any).publisherId || ref.origin?.publisherId || 'social_ref';
      const originType = ref.origin?.type || 'social_stream';
      const lang = (ref as any).language || ref.origin?.language || 'es';

      return {
        provider: 'youtube',
        provider_content_id: ref.videoId,
        video_id: ref.videoId,
        title: ref.title || `YouTube Reference [${ref.videoId}]`,
        description: ref.description || `Discovered via ${pubName} (${originType})`,
        thumbnail: ref.thumbnailUrl || `https://i.ytimg.com/vi/${ref.videoId}/hqdefault.jpg`,
        thumbnail_url: ref.thumbnailUrl || `https://i.ytimg.com/vi/${ref.videoId}/hqdefault.jpg`,
        url: ref.canonicalUrl,
        canonical_url: ref.canonicalUrl,
        embed_url: `https://www.youtube-nocookie.com/embed/${ref.videoId}`,
        creator_id: pubId,
        creator_name: pubName,
        duration_seconds: ref.durationSeconds || 0,
        published_at: ref.publishedAt || ref.discoveredAt,
        language: lang,
        source: 'harvester',
        content_state: 'ready'
      };
    });

    try {
      const { error } = await supabase
        .from('youapp_index')
        .insert(recordsToInsert);

      if (error) {
        let success = 0;
        for (const rec of recordsToInsert) {
          const { error: singleErr } = await supabase.from('youapp_index').insert(rec);
          if (!singleErr) success++;
        }
        this.incrementAtlasSize(success);
        return success;
      }

      this.incrementAtlasSize(recordsToInsert.length);
      return recordsToInsert.length;
    } catch (err: any) {
      console.error('❌ Excepción en persistBatch:', err.message);
      return 0;
    }
  }
}
