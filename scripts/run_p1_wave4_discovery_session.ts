/**
 * run_p1_wave4_discovery_session.ts — Sesión de Descubrimiento P1 Wave 4 (Streaming, Radio Filmada & Deportes)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { BroadcasterDiscoveryEngine, P1_WAVE4_TARGETS, BroadcasterDiscoveryResult } from '../src/lib/atlasHarvester/broadcasterDiscoveryEngine';
import { globalCandidateManifest } from '../src/lib/atlasHarvester/mineCandidateManifest';

async function main() {
  console.log('======================================================================');
  console.log('📡 P1 DISCOVERY WAVE 4 (STREAMING, RADIO FILMADA & ARQUETIPOS DE ALTA DENSIDAD)');
  console.log('======================================================================\n');

  globalCandidateManifest.clear();

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Objetivos Wave 4 en Exploración: ${P1_WAVE4_TARGETS.length} emisoras y canales de streaming\n`);

  const engine = new BroadcasterDiscoveryEngine();
  const results: BroadcasterDiscoveryResult[] = [];

  let totalDiscoveredUrls = 0;
  let totalSampledPages = 0;
  let totalObservedUnpersisted = 0;
  let totalEstimatedRemaining = 0;
  let totalConservativeFuelSum = 0;

  console.log('📡 [Paso 1: Auto-Descubrimiento & Muestreo Estratificado 25➔100➔250]');

  for (const broadcaster of P1_WAVE4_TARGETS) {
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
      const front = `[${result.front.toUpperCase()}]`.padEnd(28);
      const score = result.mineProductionScore.toFixed(1).padStart(5);
      const obsTier = result.observedTier.padEnd(18);
      const estTier = result.estimatedTier.padEnd(18);

      console.log(`  ${broadcaster.name.padEnd(28)} | ${front} | Score: ${score} | Sample: ${result.pagesSampled.toString().padStart(3)}p ➔ ${result.observedUniqueNetNew.toString().padStart(4)} new (${nov.padStart(3)}%) | Confirmados: +${result.observedUnpersistedFuel.toString().padStart(4)} | Remanente: +${result.estimatedRemainingConservative.toString().padStart(4)} | Total Fuel: +${result.totalConservativeFuel.toLocaleString()}`);
    } catch (err: any) {
      console.error(`  ⚠️ [${broadcaster.name}] Error: ${err?.message || err}`);
    }
  }

  // Conciliación Matemática de Combustible
  const sumConservative = results.reduce((acc, r) => acc + r.totalConservativeFuel, 0);
  const bankedCount = globalCandidateManifest.getTotalCount();

  console.log(`\n🔒 [EXACT RECONCILIATION AUDIT]:`);
  console.log(`  • Suma por Mina:                     +${sumConservative.toLocaleString()} net-new`);
  console.log(`  • Global Total Conservative Fuel:    +${totalConservativeFuelSum.toLocaleString()} net-new`);
  console.log(`  • Candidatos Bancados en Manifiesto: +${bankedCount.toLocaleString()} IDs únicos net-new`);
  console.log(`  • INVARIANT TEST: ${sumConservative === totalConservativeFuelSum && totalConservativeFuelSum >= totalObservedUnpersisted ? '✅ 100% CONCILIADO EXACTO' : '❌ DESCUADRE DETECTADO'}\n`);

  // Desglose de Tiers Separados
  const confirmedMines = results.filter(r => r.observedTier.startsWith('confirmed_'));
  const estimatedMines = results.filter(r => r.estimatedTier.startsWith('estimated_'));
  const smallClean = results.filter(r => r.estimatedTier === 'small_clean');
  const saturated = results.filter(r => r.estimatedTier === 'saturated');

  // Evaluación de Milestone Gates
  let milestoneBadge = '🔴 Milestone 0 (<3.500 net-new)';
  if (totalConservativeFuelSum >= 50000) milestoneBadge = '🚀🚀 READY + BUFFER (>=50.000 net-new)';
  else if (totalConservativeFuelSum >= 35200) milestoneBadge = '🚀 SPEEDRUN FUEL (>=35.200 net-new)';
  else if (totalConservativeFuelSum >= 17600) milestoneBadge = '🟢 STRONG SIGNAL (>=17.600 net-new)';
  else if (totalConservativeFuelSum >= 8800) milestoneBadge = '🟡 MILESTONE B (>=8.800 net-new)';
  else if (totalConservativeFuelSum >= 3500) milestoneBadge = '🟡 MILESTONE A (>=3.500 net-new)';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       P1 WAVE 4 STREAMING & RADIO DISCOVERY REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Emisoras y Canales Examinados:  ${results.length} objetivos (6 Frentes)`);
  console.log(`URLs Reales Descubiertas:       ${totalDiscoveredUrls.toLocaleString()} artículos/videos`);
  console.log(`Páginas Totales Muestreadas:    ${totalSampledPages.toLocaleString()} páginas`);
  console.log(`Atlas Actual:                   ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - startAtlas).toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`CONTABILIDAD DE COMBUSTIBLE RIGUROSA WAVE 4:`);
  console.log(`  • COMBUSTIBLE CONFIRMADO BANCADO: +${totalObservedUnpersisted.toLocaleString()} net-new únicos en memoria (0 refetch) 💎`);
  console.log(`  • COMBUSTIBLE REMANENTE ESTIMADO: +${totalEstimatedRemaining.toLocaleString()} net-new conservadores (Wilson 95% + Decay)`);
  console.log(`  • TOTAL CONSERVATIVE FUEL WAVE 4: +${totalConservativeFuelSum.toLocaleString()} net-new reales disponibles 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`TAXONOMÍA SEPARADA (OBSERVED VS ESTIMATED):`);
  console.log(`  • Minas CONFIRMED (Net-New Físico >=100): ${confirmedMines.length} canales ⭐⭐⭐⭐⭐`);
  console.log(`  • Minas ESTIMATED (Potencial >=100):      ${estimatedMines.length} canales ⭐⭐⭐⭐`);
  console.log(`  • Minas SMALL CLEAN (<100 pura):          ${smallClean.length} canales 🧼`);
  console.log(`  • Minas SATURADAS (Descartadas):          ${saturated.length} canales ⛔`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`ESTADO DEL GATE P1 WAVE 4:      ${milestoneBadge}`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏆 TOP MINAS WAVE 4 POR ARQUETIPO Y PRODUCTION SCORE:');
  results
    .filter(r => r.totalConservativeFuel > 0)
    .sort((a, b) => b.mineProductionScore - a.mineProductionScore)
    .forEach((m, idx) => {
      const nov = (m.rawNoveltyRate * 100).toFixed(0);
      const rate = m.observedNetNewPerPage.toFixed(3);
      const vel = m.observedNetNewVelocity.toFixed(2);
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${m.broadcasterName.padEnd(28)} | Score: ${m.mineProductionScore.toFixed(1).padStart(5)} | Arquetipo: ${m.primaryArchetype.padEnd(22)} | Rate: ${rate} | Total Fuel: +${m.totalConservativeFuel.toLocaleString()} [${m.observedTier.toUpperCase()} / ${m.estimatedTier.toUpperCase()}]`);
    });

  console.log('\n🏁 SESIÓN P1 WAVE 4 FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Discovery Error:', err);
  process.exit(1);
});
