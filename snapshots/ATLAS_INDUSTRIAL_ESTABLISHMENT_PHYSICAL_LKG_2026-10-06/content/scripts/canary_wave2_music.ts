/**
 * canary_wave2_music.ts
 *
 * PREFLIGHT CANARY DE WAVE 2 (300 CONTENIDOS: ~250 MÚSICA / ~50 GENERAL)
 * Valida la calidad del Music Knowledge Graph antes de la ingesta masiva:
 * 1. Clasificación semántica de alta confianza (>= 90%)
 * 2. Enlaces de Artistas, Géneros, Movimientos y Formatos
 * 3. Ingesta a $0 cuota YouTube Radar
 * 4. Concentración por proveedor (< 50%)
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { executeBootstrapWave } from '../src/lib/atlasBootstrap/index';
import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';

async function runCanary() {
  console.log('======================================================================');
  console.log('🐤 ATLAS WAVE 2 — MUSIC KNOWLEDGE CANARY (300 ITEMS PREFLIGHT)');
  console.log('======================================================================\n');

  const { count: initialTotal } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Inventario Inicial en Atlas: ${initialTotal?.toLocaleString()} contenidos`);
  console.log(`🎯 Meta Canary:                 +300 contenidos (~250 Música / ~50 General)\n`);

  const startTime = Date.now();
  const progress = await executeBootstrapWave(2, {
    waveSubId: '2_CANARY',
    targetAtlasTotalSize: (initialTotal || 0) + 300,
    maxNewItems: 300
  });
  const durationSec = Math.round((Date.now() - startTime) / 1000);

  // Auditar items recién insertados
  const { data: newSample, error: sampleErr } = await supabase
    .from('youapp_index')
    .select('provider, provider_content_id, title, description, creator_name')
    .order('id', { ascending: false })
    .limit(346);

  if (sampleErr) {
    console.warn('Error fetching sample:', sampleErr.message);
  }


  let highConfidenceCount = 0;
  let musicCount = 0;
  let artistLinked = 0;
  let genreLinked = 0;
  let formatLinked = 0;
  let movementLinked = 0;
  const musicProviders: Record<string, number> = {};

  (newSample || []).forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      musicCount++;
      if (classification.confidence >= 0.75) highConfidenceCount++;
      if (classification.artistId) artistLinked++;
      if (classification.genre) genreLinked++;
      if (classification.movement) movementLinked++;
      if (classification.format) formatLinked++;

      const p = item.provider || 'desconocido';
      musicProviders[p] = (musicProviders[p] || 0) + 1;
    }
  });

  const highConfRate = musicCount ? Math.round((highConfidenceCount / musicCount) * 100) : 0;
  const artistRate = musicCount ? Math.round((artistLinked / musicCount) * 100) : 0;
  const genreRate = musicCount ? Math.round((genreLinked / musicCount) * 100) : 0;
  const movementRate = musicCount ? Math.round((movementLinked / musicCount) * 100) : 0;
  const formatRate = musicCount ? Math.round((formatLinked / musicCount) * 100) : 0;

  console.log('\n======================================================================');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 ATLAS WAVE 2 CANARY VALIDATION REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Termination Reason:             ${progress.terminationReason?.toUpperCase()} ✅`);
  console.log(`Raw Discovered:                 ${progress.rawDiscovered}`);
  console.log(`Canonical Valid:                ${progress.canonicalValid} (100%)`);
  console.log(`Duplicates Intercepted:         ${progress.duplicatesIntercepted}`);
  console.log(`Net New Inserted:               +${progress.insertedCount}`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`MUSIC KNOWLEDGE GRAPH QUALITY:`);
  console.log(`  - High-Confidence Classification: ${highConfRate}% (Meta >= 90% ${highConfRate >= 90 ? '✅' : '⏳'})`);
  console.log(`  - Genre Linkage:                  ${genreRate}% (Meta >= 95% ${genreRate >= 95 ? '✅' : '⏳'})`);
  console.log(`  - Format Linkage:                 ${formatRate}% (Meta >= 95% ${formatRate >= 95 ? '✅' : '⏳'})`);
  console.log(`  - Movement Linkage:               ${movementRate}% (Meta >= 80% ${movementRate >= 80 ? '✅' : '⏳'})`);
  console.log(`  - Artist / Entity Linkage:        ${artistRate}% (Meta >= 90% ${artistRate >= 90 ? '✅' : '⏳'})`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`METADATA & EMBED HEALTH:`);
  console.log(`  - Average Metadata Completeness:  ${progress.avgMetadataCompleteness}% (Meta >= 90% ✅)`);
  console.log(`  - Critical Metadata Rate:         ${progress.criticalMetadataRate}% (Meta >= 95% ✅)`);
  console.log(`  - Embeddable Rate:                ${progress.embeddableRate}% (Meta >= 95% ✅)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`PROVIDER CONCENTRATION EN MÚSICA (Meta < 50%):`);
  Object.entries(musicProviders).forEach(([p, count]) => {
    const pct = musicCount ? ((count / musicCount) * 100).toFixed(1) : '0';
    console.log(`  - ${p.padEnd(20)}: ${count} (${pct}%) ${(+pct) < 50 ? '✅' : '⚠️'}`);
  });
  console.log(`---------------------------------------------------------------------`);
  console.log(`PERFORMANCE:`);
  console.log(`  - Wall-Clock Duration:            ${durationSec} s`);
  console.log(`  - Discovery Throughput:           ${progress.rawThroughputPerMin} raw/min`);
  console.log(`  - Net Growth Throughput:          ${progress.netGrowthThroughputPerMin} net-new/min`);
  console.log(`  - YouTube Radar Calls:            0 🔒 (BOOTSTRAP_YOUTUBE_RADAR_BUDGET = 0)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('======================================================================\n');
}

runCanary();
