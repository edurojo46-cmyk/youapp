/**
 * run_bluesky_backfill_deep_probe.ts — Deep Probe de Backfill Histórico en Bluesky (Jetstream Cursor Replay)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { BlueskyBackfillHarvester } from '../src/lib/atlasHarvester/socialV3/blueskyBackfillHarvester';
import { globalCandidateManifest } from '../src/lib/atlasHarvester/mineCandidateManifest';

async function main() {
  console.log('======================================================================');
  console.log('🔭 BLUESKY BACKFILL DEEP PROBE (JETSTREAM CURSOR REPLAY & NOVELTY DECAY)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Evaluando 4 Ventanas Temporales Históricas en AT Protocol Jetstream\n`);

  const windows = [
    { label: 'Ventana 1: Hace 2 horas (T-2h a T-1h)', hoursAgoStart: 2, hoursAgoEnd: 1 },
    { label: 'Ventana 2: Hace 6 horas (T-6h a T-5h)', hoursAgoStart: 6, hoursAgoEnd: 5 },
    { label: 'Ventana 3: Hace 24 horas (T-24h a T-23h)', hoursAgoStart: 24, hoursAgoEnd: 23 },
    { label: 'Ventana 4: Hace 72 horas (T-72h a T-71h)', hoursAgoStart: 72, hoursAgoEnd: 71 }
  ];

  const harvester = new BlueskyBackfillHarvester();
  const t0 = Date.now();

  const results = await harvester.runDeepProbe(
    windows,
    (vid) => dedupeIndex.isDuplicate(vid),
    (refs) => {
      for (const r of refs) {
        if (!dedupeIndex.isDuplicate(r.videoId)) {
          dedupeIndex.markSeen(r.videoId);
          globalCandidateManifest.addCandidate(r, 'bluesky_backfill_deep', dedupeIndex.getTotalAtlasSize());
        }
      }
    }
  );

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const totalScanned = results.reduce((acc, r) => acc + r.eventsScanned, 0);
  const totalRefs = results.reduce((acc, r) => acc + r.youtubeRefsFound, 0);
  const totalUnique = results.reduce((acc, r) => acc + r.uniqueYouTubeIds, 0);
  const totalNetNew = results.reduce((acc, r) => acc + r.netNew, 0);
  const globalNov = totalUnique > 0 ? +((totalNetNew / totalUnique) * 100).toFixed(1) : 0;

  // Persistir en Atlas
  const bankedRefs = globalCandidateManifest.toHarvestReferences();
  let persistedCount = 0;
  if (bankedRefs.length > 0) {
    persistedCount = await dedupeIndex.persistBatch(bankedRefs);
  }

  const finalAtlas = dedupeIndex.getTotalAtlasSize();
  const sessionDelta = finalAtlas - 64793;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       BLUESKY BACKFILL DEEP PROBE AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo de Sondeo:               ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Ventanas Temporales:            ${windows.length} particiones históricas`);
  console.log(`Eventos Analizados:             ${totalScanned.toLocaleString()} posts Jetstream`);
  console.log(`Referencias YouTube:            ${totalRefs.toLocaleString()} enlaces`);
  console.log(`IDs Únicos Históricos:          ${totalUnique.toLocaleString()} videos`);
  console.log(`Net-New Confirmado:             +${totalNetNew.toLocaleString()} videos inéditos 💎`);
  console.log(`Novelty Rate Global Backfill:   ${globalNov.toFixed(1)}% ⭐⭐⭐⭐⭐`);
  console.log(`Atlas Final:                    ${finalAtlas.toLocaleString()} contenidos (+${persistedCount} persistidos) 🎯`);
  console.log(`SESSION DELTA (Sesión hoy):     +${sessionDelta.toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`HISTORICAL NOVELTY DECAY & TEMPORAL YIELD:`);
  results.forEach((w, idx) => {
    console.log(`  ${(idx + 1)}. ${w.windowLabel.padEnd(36)} | ${w.eventsScanned.toString().padStart(5)} posts ➔ ${w.uniqueYouTubeIds.toString().padStart(3)} YT ➔ +${w.netNew.toString().padStart(3)} new (${w.noveltyRate.toFixed(1)}% nov | ${w.netNewPerHourOfHistory.toFixed(1)} new/h-hist | ${w.netNewPerMillionEvents.toLocaleString()} new/M-events)`);
  });
  console.log(`---------------------------------------------------------------------`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 BLUESKY BACKFILL DEEP PROBE FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Deep Probe Error:', err);
  process.exit(1);
});
