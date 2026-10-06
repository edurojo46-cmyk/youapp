/**
 * diagnose_unlinked_music.ts — Muestreo y Diagnóstico de Piezas Musicales No Vinculadas
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2';

async function diagnoseUnlinked() {
  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('id, provider, title, description, creator_name')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  const unlinkedSample: { title: string; creator: string; provider: string }[] = [];

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      const resolved = resolveEntityV2(item.title, item.description, item.creator_name);
      if (resolved.confidence < 0.85 || !resolved.id) {
        if (unlinkedSample.length < 50) {
          unlinkedSample.push({
            title: item.title,
            creator: item.creator_name || '',
            provider: item.provider
          });
        }
      }
    }
  });

  console.log('======================================================================');
  console.log(`🔍 MUESTRA DIAGNÓSTICA DE TÍTULOS NO VINCULADOS (Total en muestra: ${unlinkedSample.length})`);
  console.log('======================================================================\n');

  unlinkedSample.forEach((item, idx) => {
    console.log(`${(idx + 1).toString().padStart(2)}. [${item.provider}] "${item.title}" (Creator: "${item.creator}")`);
  });
}

diagnoseUnlinked();
