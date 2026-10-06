/**
 * audit_partial_deficits.ts — Generador de Cola de Déficits para Consultas Parciales
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { GOLD_200_QUERIES } from './benchmark_atlas_coverage';

export interface PartialDeficitItem {
  query: string;
  qualifiedCount: number;
  missingToSix: number;
  recommendedSeeds: string[];
}

export async function generatePartialDeficitQueue(): Promise<PartialDeficitItem[]> {
  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('provider, provider_content_id, title, description, creator_name')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  const partialQueue: PartialDeficitItem[] = [];

  for (const query of GOLD_200_QUERIES) {
    const cleanQ = query.toLowerCase().trim();
    const tokens = cleanQ.split(/\s+/).filter(t => t.length > 2);

    let matchCount = 0;
    for (const item of allIndexItems) {
      const text = `${item.title} ${item.description || ''} ${item.creator_name || ''}`.toLowerCase();
      const hits = tokens.filter(t => text.includes(t));
      if (hits.length >= Math.min(2, tokens.length)) {
        matchCount++;
      }
    }

    if (matchCount < 6) {
      partialQueue.push({
        query,
        qualifiedCount: matchCount,
        missingToSix: 6 - matchCount,
        recommendedSeeds: [
          `${query} documental explicacion`,
          `${query} curso completo leccion`,
          `${query} conferencia oficial archivo`
        ]
      });
    }
  }

  // Ordenar de menor faltante a mayor faltante (más baratos de convertir a suficiente)
  partialQueue.sort((a, b) => a.missingToSix - b.missingToSix);

  return partialQueue;
}

async function run() {
  console.log('======================================================================');
  console.log('🎯 ATLAS PARTIAL DEFICIT QUEUE GENERATOR (200-QUERY AUDIT)');
  console.log('======================================================================\n');

  const queue = await generatePartialDeficitQueue();

  console.log(`📋 Total Consultas Parciales Detectadas: ${queue.length} / 200 (${Math.round((queue.length / 200) * 100)}%)\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                  COLA PRIORITARIA DE DÉFICITS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  queue.forEach((item, idx) => {
    console.log(`  ${(idx + 1).toString().padStart(2)}. [Faltan ${item.missingToSix} videos] "${item.query}" | Actual: ${item.qualifiedCount}/6`);
    console.log(`      💡 Semilla recomendada: "${item.recommendedSeeds[0]}"`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run();
