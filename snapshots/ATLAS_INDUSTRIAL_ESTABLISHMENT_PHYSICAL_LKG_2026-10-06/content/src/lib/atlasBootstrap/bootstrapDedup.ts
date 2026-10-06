/**
 * bootstrapDedup.ts — Deduplicación en memoria y contra base de datos para Atlas Bootstrap
 */

import type { AtlasEnrichedItem } from './bootstrapTypes';
import { supabase } from '../supabase';

export async function deduplicateAgainstDatabase(
  items: AtlasEnrichedItem[]
): Promise<{ uniqueItems: AtlasEnrichedItem[]; duplicateCount: number }> {
  if (items.length === 0) return { uniqueItems: [], duplicateCount: 0 };

  // 1. Deduplicación interna en memoria del batch actual
  const seenKeys = new Set<string>();
  const memoryUnique: AtlasEnrichedItem[] = [];

  for (const item of items) {
    const key = `${item.provider}:${item.providerContentId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      memoryUnique.push(item);
    }
  }

  // 2. Consulta rápida a youapp_index para excluir duplicados ya persistidos
  const providerIds = memoryUnique.map(i => i.providerContentId);
  const { data: existing } = await supabase
    .from('youapp_index')
    .select('provider, provider_content_id')
    .in('provider_content_id', providerIds);

  const existingSet = new Set((existing || []).map((e: any) => `${e.provider}:${e.provider_content_id}`));
  const uniqueItems = memoryUnique.filter(item => !existingSet.has(`${item.provider}:${item.providerContentId}`));
  const duplicateCount = items.length - uniqueItems.length;

  return { uniqueItems, duplicateCount };
}
