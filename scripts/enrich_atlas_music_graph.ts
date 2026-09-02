/**
 * enrich_atlas_music_graph.ts — Pase de Enriquecimiento y Reparación del Grafo de Entidades V2
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2';

async function runEnrichmentPass() {
  console.log('======================================================================');
  console.log('🧠 ATLAS MUSIC KNOWLEDGE GRAPH — ENTITY REPAIR PASS V2');
  console.log('======================================================================\n');

  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('id, provider, provider_content_id, title, description, creator_name')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  let totalMusic = 0;
  let linkedCount = 0;
  let tierAutoLink = 0;     // >= 0.95
  let tierCorroborated = 0; // 0.85 - 0.94
  let tierUnresolved = 0;   // < 0.85

  const artistCounts: Record<string, number> = {};
  const resolutionMethods: Record<string, number> = {};

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      totalMusic++;

      // Resolver con EntityResolverV2
      const resolved = resolveEntityV2(item.title, item.description, item.creator_name);

      if (resolved.confidence >= 0.85 && resolved.id) {
        linkedCount++;
        const name = resolved.name || resolved.id;
        artistCounts[name] = (artistCounts[name] || 0) + 1;
        resolutionMethods[resolved.resolvedVia] = (resolutionMethods[resolved.resolvedVia] || 0) + 1;

        if (resolved.confidence >= 0.95) {
          tierAutoLink++;
        } else {
          tierCorroborated++;
        }
      } else {
        tierUnresolved++;
      }
    }
  });

  const linkageRate = totalMusic ? +((linkedCount / totalMusic) * 100).toFixed(1) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DE ENTITY REPAIR PASS V2');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Contenidos en Atlas:            ${allIndexItems.length.toLocaleString()}`);
  console.log(`Total Piezas Musicales:               ${totalMusic.toLocaleString()}`);
  console.log(`Piezas Vinculadas a Entidades:        ${linkedCount.toLocaleString()} (${linkageRate}%) 🎯`);
  console.log(`Piezas No Vinculadas (Seguridad):     ${tierUnresolved.toLocaleString()}\n`);

  console.log('DISTRIBUCIÓN POR NIVELES DE CONFIANZA:');
  console.log(`  - Nivel Auto-Link (Confianza >= 0.95):        ${tierAutoLink.toLocaleString()} (${Math.round((tierAutoLink / totalMusic) * 100)}%)`);
  console.log(`  - Nivel Corroborado (Confianza 0.85 - 0.94):  ${tierCorroborated.toLocaleString()} (${Math.round((tierCorroborated / totalMusic) * 100)}%)`);
  console.log(`  - Nivel No Resuelto (Confianza < 0.85):       ${tierUnresolved.toLocaleString()} (${Math.round((tierUnresolved / totalMusic) * 100)}%)\n`);

  console.log('MÉTODO DE RESOLUCIÓN EMPLEADO:');
  Object.entries(resolutionMethods).forEach(([method, count]) => {
    console.log(`  - ${method.padEnd(25)}: ${count.toLocaleString()} piezas`);
  });

  console.log('\nTOP 15 ENTIDADES INDIVIDUALES EN ATLAS:');
  Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([art, count], idx) => {
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${art.padEnd(35)}: ${count.toLocaleString().padStart(5)} videos`);
    });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runEnrichmentPass();
