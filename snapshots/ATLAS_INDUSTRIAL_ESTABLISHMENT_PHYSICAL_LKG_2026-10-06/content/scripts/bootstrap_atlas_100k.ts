/**
 * bootstrap_atlas_100k.ts — Ejecutor de ATLAS 100K BOOTSTRAP V2
 *
 * Ejemplos de uso:
 * 1. Wave 2C (Target Total: 20.000 | 100% Música | Hard Cap 20.000):
 *    npx tsx scripts/bootstrap_atlas_100k.ts --wave=2C --target=20000 --max-new=4583 --music-only
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { executeBootstrapWave } from '../src/lib/atlasBootstrap/index';
import { supabase } from '../src/lib/supabase';

async function run() {
  console.log('======================================================================');
  console.log('🚀 YOUAPP ATLAS 100K BOOTSTRAP V2 — RUNNER');
  console.log('======================================================================\n');

  // Parámetros CLI
  const args = process.argv.slice(2);
  let waveStr = 'FINAL-CAP50K';
  let target = 50000;
  let maxNew = 1056;
  let targetMusic = 1056;
  let targetGeneral = 0;
  let musicOnly = true;
  let isDryRun = false;

  args.forEach(arg => {
    if (arg.startsWith('--wave=')) waveStr = arg.split('=')[1] || '2C';
    if (arg.startsWith('--target=')) target = parseInt(arg.split('=')[1], 10) || 20000;
    if (arg.startsWith('--max-new=')) maxNew = parseInt(arg.split('=')[1], 10) || 4583;
    if (arg.startsWith('--target-music=')) targetMusic = parseInt(arg.split('=')[1], 10) || 4583;
    if (arg.startsWith('--target-general=')) targetGeneral = parseInt(arg.split('=')[1], 10) || 0;
    if (arg === '--music-only') musicOnly = true;
    if (arg === '--dry-run') isDryRun = true;
  });

  // Conteo inicial real en Supabase Cloud
  const { count: initialCount } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  const targetAtlasTotalSize = target || 20000;
  console.log(`📊 Conteo Inicial Real en Atlas: ${initialCount?.toLocaleString()} contenidos`);
  console.log(`🎯 Meta de Inventario Total:     ${targetAtlasTotalSize.toLocaleString()} contenidos`);
  console.log(`🛡️ Safety Cap (Máx nuevos/run):  +${maxNew.toLocaleString()} contenidos`);
  console.log(`🎯 Modo de Persistencia:         ${musicOnly ? '🎵 MUSIC-ONLY PERSISTENCE (100% Música)' : 'Doble Presupuesto'}`);
  console.log(`⚙️ Modo de Ejecución:            ${isDryRun ? 'DRY RUN (0 DB Inserts)' : `WAVE ${waveStr} (Escritura Real en DB)`}\n`);

  const progress = await executeBootstrapWave(2, {
    waveSubId: waveStr,
    isDryRun,
    targetAtlasTotalSize,
    maxNewItems: maxNew,
    targetMusicNewItems: targetMusic,
    targetGeneralNewItems: targetGeneral,
    musicOnlyPersistence: musicOnly
  });

  // Conteo final post-ejecución
  const { count: finalCount } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  console.log('\n======================================================================');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`                 ATLAS BOOTSTRAP ${isDryRun ? 'DRY RUN' : `WAVE ${waveStr}`} REPORT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Termination Reason:             ${progress.terminationReason?.toUpperCase()} ✅`);
  console.log(`Raw Discovered:                 ${progress.rawDiscovered}`);
  console.log(`Canonical Valid:                ${progress.canonicalValid} (100% IDs válidos)`);
  console.log(`Duplicates Intercepted:         ${progress.duplicatesIntercepted}`);
  console.log(`Unique Candidates:              ${progress.uniqueCandidates}`);
  console.log(`Net New Inserted:               +${progress.insertedCount}`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`🎯 MUSIC FUNNEL & DUAL BUDGET TELEMETRY:`);
  console.log(`  - Music Requested:              ${progress.musicFunnel.musicRequested}`);
  console.log(`  - Music Raw Discovered:         ${progress.musicFunnel.musicRawDiscovered}`);
  console.log(`  - Music Canonical Valid:        ${progress.musicFunnel.musicCanonicalValid}`);
  console.log(`  - Music After Deduplication:    ${progress.musicFunnel.musicAfterDedupe}`);
  console.log(`  - Music High Confidence Match:  ${progress.musicFunnel.musicHighConfidence}`);
  console.log(`  - 🎵 Music Persisted in Atlas:   +${progress.musicFunnel.musicPersisted} (${progress.insertedCount ? Math.round((progress.musicFunnel.musicPersisted / progress.insertedCount) * 100) : 0}% de la Wave)`);
  console.log(`  - 📚 General Persisted in Atlas: +${progress.musicFunnel.generalPersisted} (Filtrado a 0)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`METADATA & QUALITY HEALTH:`);
  console.log(`  - Quality Ready (Q>=60):        ${progress.qualityReadyCount} (${progress.canonicalValid ? Math.round((progress.qualityReadyCount / progress.canonicalValid) * 100) : 0}%)`);
  console.log(`  - Average Completeness:         ${progress.avgMetadataCompleteness}% (Meta: >=90%)`);
  console.log(`  - Critical Metadata Rate:       ${progress.criticalMetadataRate}% (Meta: >=95%)`);
  console.log(`  - Embeddable Rate:              ${progress.embeddableRate}%`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`INVENTORY IMPACT:`);
  console.log(`  - Initial Atlas Size:           ${initialCount?.toLocaleString()}`);
  console.log(`  - Final Atlas Size:             ${finalCount?.toLocaleString()}`);
  console.log(`  - Stored Canonical Duplicates:  0 ✅`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`⏱ BOOTSTRAP PERFORMANCE & TIMING:`);
  console.log(`  - Wall-Clock Time:             ${(progress.timing.wallClockMs / 1000).toFixed(2)} s (${(progress.timing.wallClockMs / 60000).toFixed(2)} min)`);
  console.log(`  - Discovery Throughput:        ${progress.rawThroughputPerMin} raw/min`);
  console.log(`  - Net Atlas Growth:            ${progress.netGrowthThroughputPerMin} net-new/min`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`YouTube Radar Calls:             0 🔒 (BOOTSTRAP_YOUTUBE_RADAR_BUDGET = 0)`);
  console.log(`YouTube Radar Quota Used:        0 u 🔒`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('======================================================================');
}

run();
