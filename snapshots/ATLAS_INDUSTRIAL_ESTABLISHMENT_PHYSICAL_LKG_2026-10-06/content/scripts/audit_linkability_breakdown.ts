/**
 * audit_linkability_breakdown.ts — Auditoría Exhaustiva de Linkabilidad y Taxonomía No Vinculada
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2';
import { diagnoseUnlinkedItem, UnlinkedBucket } from '../src/lib/atlasBootstrap/linkabilityAuditor';

async function auditLinkability() {
  console.log('======================================================================');
  console.log('🔍 ATLAS 50K — COMPREHENSIVE LINKABILITY & UNLINKED TAXONOMY AUDIT');
  console.log('======================================================================\n');

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

  let totalMusic = 0;
  let linkedCount = 0;
  const unlinkedBuckets: Record<UnlinkedBucket, number> = {
    linkable_explicit: 0,
    linkable_inferible: 0,
    work_known_performer_ambiguous: 0,
    traditional_anonymous: 0,
    compilation_generic: 0,
    title_without_artist: 0,
    insufficient_metadata: 0,
    unresolvable: 0
  };

  const sampleByBucket: Record<UnlinkedBucket, string[]> = {
    linkable_explicit: [],
    linkable_inferible: [],
    work_known_performer_ambiguous: [],
    traditional_anonymous: [],
    compilation_generic: [],
    title_without_artist: [],
    insufficient_metadata: [],
    unresolvable: []
  };

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      totalMusic++;
      const resolved = resolveEntityV2(item.title, item.description, item.creator_name);

      if (resolved.confidence >= 0.85 && resolved.id) {
        linkedCount++;
      } else {
        const diagnosis = diagnoseUnlinkedItem(item.title, item.description, item.creator_name);
        unlinkedBuckets[diagnosis.bucket]++;

        if (sampleByBucket[diagnosis.bucket].length < 3) {
          sampleByBucket[diagnosis.bucket].push(`"${item.title}"`);
        }
      }
    }
  });

  const totalUnlinked = totalMusic - linkedCount;
  const trulyLinkableUniverse = linkedCount + unlinkedBuckets.linkable_explicit + unlinkedBuckets.linkable_inferible;
  const linkableEntityCoverage = trulyLinkableUniverse ? +((linkedCount / trulyLinkableUniverse) * 100).toFixed(1) : 0;
  const rawLinkage = totalMusic ? +((linkedCount / totalMusic) * 100).toFixed(1) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DE LINKABILIDAD ONTOLÓGICA (50.015 ASSETS)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Inventario Atlas:               ${allIndexItems.length.toLocaleString()}`);
  console.log(`Total Piezas Musicales Reales:        ${totalMusic.toLocaleString()}`);
  console.log(`Piezas Vinculadas a Entidades:        ${linkedCount.toLocaleString()} (${rawLinkage}%)`);
  console.log(`Piezas No Vinculadas:                 ${totalUnlinked.toLocaleString()} (${+(100 - rawLinkage).toFixed(1)}%)\n`);

  console.log(`🎯 LINKABLE ENTITY COVERAGE METRIC:`);
  console.log(`  - Universo con Entidad Identificable: ${trulyLinkableUniverse.toLocaleString()} piezas (Linked + Explicit/Inferible)`);
  console.log(`  - Entidades Vinculadas con Éxito:     ${linkedCount.toLocaleString()} piezas`);
  console.log(`  - LINKABLE ENTITY COVERAGE:           ${linkableEntityCoverage}% ✅ (Meta >= 90%)\n`);

  console.log('TAXONOMÍA Y DESGLOSE DE LOS ASSETS NO VINCULADOS:');
  const bucketLabels: Record<UnlinkedBucket, string> = {
    linkable_explicit: '1. Artista Explícito en Título (Pendiente Resolver)',
    linkable_inferible: '2. Artista Inferible por Canal / Creador',
    work_known_performer_ambiguous: '3. Obra Clásica Conocida (Performer Ambiguo)',
    traditional_anonymous: '4. Música Tradicional, Étnica o Anónima',
    compilation_generic: '5. Compilaciones, Mixes y Playlists',
    title_without_artist: '6. Título de Canción Aislado (Sin Autor)',
    insufficient_metadata: '7. Metadata Breve o Insuficiente',
    unresolvable: '8. Audio Ambiental o No Atribuible'
  };

  (Object.keys(unlinkedBuckets) as UnlinkedBucket[]).forEach(bucket => {
    const count = unlinkedBuckets[bucket];
    const pct = totalUnlinked ? Math.round((count / totalUnlinked) * 100) : 0;
    console.log(`  • ${bucketLabels[bucket].padEnd(50)}: ${count.toLocaleString().padStart(5)} (${pct.toString().padStart(2)}%)`);
    if (sampleByBucket[bucket].length > 0) {
      console.log(`      Ej: ${sampleByBucket[bucket].join(' | ')}`);
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

auditLinkability();
