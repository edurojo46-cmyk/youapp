/**
 * bootstrapPersistence.ts — Persistencia y Checkpoint para Atlas Bootstrap
 */

import type { AtlasEnrichedItem, BootstrapWaveProgress } from './bootstrapTypes';
import { supabase } from '../supabase';

export async function persistBatchToAtlas(
  items: AtlasEnrichedItem[]
): Promise<{ inserted: number; errors: number }> {
  if (items.length === 0) return { inserted: 0, errors: 0 };

  const recordsToInsert = items.map(item => ({
    provider: item.provider,
    provider_content_id: item.providerContentId,
    video_id: item.providerContentId,
    title: item.title,
    description: item.description,
    thumbnail: item.thumbnailUrl,
    thumbnail_url: item.thumbnailUrl,
    url: item.canonicalUrl,
    canonical_url: item.canonicalUrl,
    embed_url: item.embedUrl,
    creator_id: item.creatorId,
    creator_name: item.creatorName,
    duration_seconds: item.durationSeconds,
    published_at: item.publishedAt,
    language: item.language,
    source: 'bootstrap',
    content_state: item.contentState
  }));

  try {
    const { error } = await supabase
      .from('youapp_index')
      .insert(recordsToInsert);

    if (error) {
      // Si falla por colisión individual, insertar uno a uno ignorando duplicados
      let success = 0;
      for (const rec of recordsToInsert) {
        const { error: singleErr } = await supabase.from('youapp_index').insert(rec);
        if (!singleErr) success++;
      }
      return { inserted: success, errors: recordsToInsert.length - success };
    }

    return { inserted: items.length, errors: 0 };
  } catch (err: any) {
    console.error('[BootstrapPersistence] Excepción en insert:', err.message);
    return { inserted: 0, errors: items.length };
  }
}

