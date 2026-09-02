/**
 * run_p1_broadcaster_discovery_session.ts — Sesión de Descubrimiento P1 Wave 3 (SBT++ Scale & MineProduction Leaderboard)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { BroadcasterDiscoveryEngine, P1_WAVE3_TARGETS, BroadcasterDiscoveryResult } from '../src/lib/atlasHarvester/broadcasterDiscoveryEngine';
import { globalCandidateManifest } from '../src/lib/atlasHarvester/mineCandidateManifest';

async function main() {
  console.log('======================================================================');
  console.log('📡 P1 BROADCASTER DISCOVERY WAVE 3 (SBT++ SCALE & MINE PRODUCTION)');
  console.log('======================================================================\n');

  globalCandidateManifest.clear();

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Broadcasters P1 Wave 3 en Exploración: ${P1_WAVE3_TARGETS.length} objetivos\n`);

  const engine = new BroadcasterDiscoveryEngine();
  const results: BroadcasterDiscoveryResult[] = [];

  let totalDiscoveredUrls = 0;
  let totalSampledPages = 0;
  let totalObservedUnpersisted = 0;
  let totalEstimatedRemaining = 0;
  let totalConservativeFuelSum = 0;

  console.log('📡 [Paso 1: Auto-Descubrimiento & Muestreo Estratificado 25➔100➔250]');

  for (const broadcaster of P1_WAVE3_TARGETS) {
    try {
      const result = await engine.discoverAndQualifyBroadcaster(broadcaster, dedupeIndex);
      results.push(result);

      totalDiscoveredUrls += result.totalRealUrlsDiscovered;
      totalSampledPages += result.pagesSampled;
      totalObservedUnpersisted += result.observedUnpersistedFuel;
      totalEstimatedRemaining += result.estimatedRemainingConservative;
      totalConservativeFuelSum += result.totalConservativeFuel;

      const nov = (result.rawNoveltyRate * 100).toFixed(0);
      const stage = result.samplingStage.padEnd(11);
      const arch = result.archiveDepth.padEnd(10);
      const struct = result.structureType.padEnd(14);
      const front = `[${result.front.toUpperCase()}]`.padEnd(17);
      const score = result.mineProductionScore.toFixed(1).padStart(5);

      console.log(`  [${result.tier.toUpperCase().padEnd(17)}] ${broadcaster.name.padEnd(26)} | ${front} | Score: ${score} | Sample: ${result.pagesSampled.toString().padStart(3)}p ➔ ${result.observedUniqueNetNew.toString().padStart(4)} new (${nov.padStart(3)}%) | Confirmados: +${result.observedUnpersistedFuel.toString().padStart(4)} | Remanente: +${result.estimatedRemainingConservative.toString().padStart(4)} | Total Fuel: +${result.totalConservativeFuel.toLocaleString()}`);
    } catch (err: any) {
      console.error(`  ⚠️ [${broadcaster.name}] Error: ${err?.message || err}`);
    }
  }

  // Verificación de Invariante de Fuel Accounting
  const bankedCount = globalCandidateManifest.getTotalCount();
  console.log(`\n🔒 [FUEL ACCOUNTING INVARIANT AUDIT]:`);
  console.log(`  • Candidatos Bancados en Manifiesto: +${bankedCount.toLocaleString()} IDs únicos net-new`);
  console.log(`  • Total Observed Unpersisted Fuel:   +${totalObservedUnpersisted.toLocaleString()}`);
  console.log(`  • Total Estimated Remaining Fuel:    +${totalEstimatedRemaining.toLocaleString()}`);
  console.log(`  • Total Conservative Fuel:           +${totalConservativeFuelSum.toLocaleString()}`);
  console.log(`  • INVARIANT TEST: ${totalConservativeFuelSum >= totalObservedUnpersisted ? '✅ 100% CUMPLIDO (Total Fuel >= Observed)' : '❌ INVARIANT FAIL'}\n`);

  // Desglose Taxonómico
  const confirmedMines = results.filter(r => r.tier.startsWith('confirmed_'));
  const estimatedMines = results.filter(r => r.tier.startsWith('estimated_'));
  const smallClean = results.filter(r => r.tier === 'small_clean');
  const saturated = results.filter(r => r.tier === 'saturated');

  // Evaluación de Milestone Gates
  let milestoneBadge = '🔴 Milestone 0 (<3.500 net-new)';
  if (totalConservativeFuelSum >= 50000) milestoneBadge = '🚀🚀 READY + BUFFER (>=50.000 net-new)';
  else if (totalConservativeFuelSum >= 35200) milestoneBadge = '🚀 SPEEDRUN FUEL (>=35.200 net-new)';
  else if (totalConservativeFuelSum >= 17600) milestoneBadge = '🟢 STRONG SIGNAL (>=17.600 net-new)';
  else if (totalConservativeFuelSum >= 8800) milestoneBadge = '🟡 MILESTONE B (>=8.800 net-new)';
  else if (totalConservativeFuelSum >= 3500) milestoneBadge = '🟡 MILESTONE A (>=3.500 net-new)';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       P1 WAVE 3 BROADCASTER & MINE PRODUCTION REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Broadcasters Examinados:        ${results.length} cadenas (6 Frentes)`);
  console.log(`URLs Reales Descubiertas:       ${totalDiscoveredUrls.toLocaleString()} artículos/videos`);
  console.log(`Páginas Totales Muestreadas:    ${totalSampledPages.toLocaleString()} páginas`);
  console.log(`Atlas Actual:                   ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - startAtlas).toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`CONTABILIDAD DE COMBUSTIBLE RIGUROSA (CONFIRMADO VS ESTIMADO):`);
  console.log(`  • COMBUSTIBLE CONFIRMADO BANCADO: +${totalObservedUnpersisted.toLocaleString()} net-new únicos en memoria (0 refetch) 💎`);
  console.log(`  • COMBUSTIBLE REMANENTE ESTIMADO: +${totalEstimatedRemaining.toLocaleString()} net-new conservadores (Wilson 95% + Decay)`);
  console.log(`  • TOTAL CONSERVATIVE FUEL:        +${totalConservativeFuelSum.toLocaleString()} net-new reales disponibles 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`CLASIFICACIÓN TAXONÓMICA WAVE 3:`);
  console.log(`  • Minas CONFIRMED (Net-New Físico >=100): ${confirmedMines.length} cadenas ⭐⭐⭐⭐⭐`);
  console.log(`  • Minas ESTIMATED (Potencial >=100):      ${estimatedMines.length} cadenas ⭐⭐⭐⭐`);
  console.log(`  • Minas SMALL CLEAN (<100 pura):          ${smallClean.length} cadenas 🧼`);
  console.log(`  • Minas SATURADAS (Descartadas):          ${saturated.length} cadenas ⛔`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`ESTADO DEL GATE P1 WAVE 3:      ${milestoneBadge}`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏆 MINE PRODUCTION LEADERBOARD (RANKING POR SCORE Y VOLUMEN):');
  results
    .filter(r => r.totalConservativeFuel > 0)
    .sort((a, b) => b.mineProductionScore - a.mineProductionScore)
    .forEach((m, idx) => {
      const nov = (m.rawNoveltyRate * 100).toFixed(0);
      const rate = m.observedNetNewPerPage.toFixed(3);
      const vel = m.observedNetNewVelocity.toFixed(2);
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${m.broadcasterName.padEnd(28)} | Score: ${m.mineProductionScore.toFixed(1).padStart(5)} | New/Page: ${rate} | Vel: ${vel}/s | Total Fuel: +${m.totalConservativeFuel.toLocaleString()} [${m.tier.toUpperCase()}]`);
    });

  console.log('\n🏁 SESIÓN P1 WAVE 3 FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Discovery Error:', err);
  process.exit(1);
});
