/**
 * run_mine_discovery_session.ts — Sesión de Descubrimiento de Minas Adaptativo (6 Frentes, Invariante Estricto y Fuel Audit)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { getSourcesForDiscovery } from '../src/lib/atlasHarvester/sourceDiscoveryEngine';
import { NewMineDiscoveryEngine, MineQualificationResult, MineDiscoverySummary } from '../src/lib/atlasHarvester/newMineDiscoveryEngine';
import { harvestSocialReferences } from '../src/lib/atlasHarvester/socialReferenceHarvester';

async function main() {
  console.log('======================================================================');
  console.log('🔍 SOURCE DISCOVERY ENGINE V1 — 6 FRENTES & ADAPTIVE FUEL AUDIT');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  console.log(`✅ Índice YouTube cargado: ${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM (Total Atlas: ${initResult.initialTotal.toLocaleString()}).\n`);

  const discoveryEngine = new NewMineDiscoveryEngine();
  const qualifiedMines: MineQualificationResult[] = [];
  const requiredTo100K = Math.max(0, 100000 - initResult.initialTotal);

  const summary: MineDiscoverySummary = {
    domainsExamined: 0,
    sitemapsSampled: 0,
    megaMinesFound: 0,
    eliteMinesFound: 0,
    strongMinesFound: 0,
    tacticalMinesFound: 0,
    smallCleanFound: 0,
    saturatedMinesDiscarded: 0,
    inconclusiveMinesCount: 0,
    totalPagesSampled: 0,
    totalPointPotentialNetNew: 0,
    totalConservativePotentialNetNew: 0,
    discoveryEfficiency: 0,
    requiredTo100K,
    fuelCoverageRatio: 0,
    qualifiedMines: []
  };

  const domainSet = new Set<string>();
  const activeSources = getSourcesForDiscovery();

  // 1. Exploración y Muestreo Adaptativo en los 6 Frentes
  console.log('📡 [Fase 1: Muestreo Adaptativo 25➔100➔250 en 6 Frentes]');

  for (const source of activeSources) {
    domainSet.add(source.domain);

    for (const feed of source.feeds) {
      try {
        const res = await fetch(feed.url, {
          signal: AbortSignal.timeout(6000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) {
          continue;
        }
        const xmlText = await res.text();

        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let match: RegExpExecArray | null;
        const childSitemaps: string[] = [];

        while ((match = locRegex.exec(xmlText)) !== null) {
          const loc = match[1].trim();
          if (loc.endsWith('.xml')) {
            childSitemaps.push(loc);
          }
        }

        const sitemapsToSample = childSitemaps.length > 0 ? childSitemaps.slice(0, 5) : [feed.url];

        for (const sUrl of sitemapsToSample) {
          summary.sitemapsSampled++;
          const result = await discoveryEngine.qualifySitemapPartition(
            sUrl,
            source,
            dedupeIndex
          );

          if (result) {
            qualifiedMines.push(result);
            summary.totalPagesSampled += result.samplePagesCount;
            summary.totalPointPotentialNetNew += result.pointPotentialNetNew;
            summary.totalConservativePotentialNetNew += result.conservativePotentialNetNew;

            if (result.tier === 'mega') summary.megaMinesFound++;
            else if (result.tier === 'elite') summary.eliteMinesFound++;
            else if (result.tier === 'strong') summary.strongMinesFound++;
            else if (result.tier === 'tactical') summary.tacticalMinesFound++;
            else if (result.tier === 'small_clean') summary.smallCleanFound++;
            else if (result.tier === 'saturated') summary.saturatedMinesDiscarded++;
            else if (result.tier === 'inconclusive') summary.inconclusiveMinesCount++;

            const novPct = (result.rawNoveltyRate * 100).toFixed(0);
            const stageLabel = result.samplingStage.padEnd(11);
            console.log(`  [${result.tier.toUpperCase().padEnd(11)}] ${source.name.padEnd(28)} | ${stageLabel} | Sample: ${result.samplePagesCount.toString().padStart(3)}p ➔ ${result.netNewCount.toString().padStart(2)} new (${novPct.padStart(3)}%) | Conservador: +${result.conservativePotentialNetNew.toLocaleString()} (MegaProb: ${(result.megaMineProbability * 100).toFixed(0)}%)`);
          }
        }
      } catch {
        // Ignorar timeouts
      }
    }
  }

  summary.domainsExamined = domainSet.size;
  summary.fuelCoverageRatio = summary.requiredTo100K > 0
    ? +(summary.totalConservativePotentialNetNew / summary.requiredTo100K).toFixed(3)
    : 1.0;
  summary.discoveryEfficiency = summary.totalPagesSampled > 0
    ? +(summary.totalConservativePotentialNetNew / summary.totalPagesSampled).toFixed(2)
    : 0;

  // Verificación de Invariante de Clasificación
  const totalClassified = summary.megaMinesFound + summary.eliteMinesFound + summary.strongMinesFound +
                          summary.tacticalMinesFound + summary.smallCleanFound + summary.saturatedMinesDiscarded +
                          summary.inconclusiveMinesCount;

  console.log(`\n🔒 [TAXONOMY INVARIANT CHECK]: Muestreados: ${qualifiedMines.length} | Clasificados: ${totalClassified} ➔ ${qualifiedMines.length === totalClassified ? '✅ 100% CONCILIADO' : '❌ DESCUADRE DETECTADO'}`);

  // 2. Exploración Separada de Redes Sociales (Social Reference Harvester)
  console.log('\n📱 [Fase 2: Social Mine Discovery (Reddit / Public Feeds)]');
  const tSocial0 = Date.now();
  const socialResult = await harvestSocialReferences(dedupeIndex);
  const socialElapsedSec = Math.max(1, (Date.now() - tSocial0) / 1000);
  const socialVel = +(socialResult.netNew / socialElapsedSec).toFixed(2);

  if (socialResult.references.length > 0) {
    const inserted = await dedupeIndex.persistBatch(socialResult.references);
    console.log(`  ✅ Social Discovery: ${socialResult.totalFound} encontrados ➔ +${inserted} net-new (${socialVel} items/s) persistidos en Atlas.`);
  } else {
    console.log(`  ℹ️ Social Discovery: Feeds procesados.`);
  }

  // 3. Dashboard Final y Evaluación de Milestones
  summary.qualifiedMines = qualifiedMines;
  const coveragePct = (summary.fuelCoverageRatio * 100).toFixed(1);

  let milestoneBadge = 'Milestone 0 (<10%)';
  if (summary.totalConservativePotentialNetNew >= 52800) milestoneBadge = '🚀 LISTO PARA 100K (>=150% Fuel Coverage)';
  else if (summary.totalConservativePotentialNetNew >= 35207) milestoneBadge = '🟢 MILESTONE D (100% Fuel Coverage)';
  else if (summary.totalConservativePotentialNetNew >= 17600) milestoneBadge = '🟡 MILESTONE C (50% Fuel Coverage)';
  else if (summary.totalConservativePotentialNetNew >= 8800) milestoneBadge = '🟡 MILESTONE B (25% Fuel Coverage)';
  else if (summary.totalConservativePotentialNetNew >= 3500) milestoneBadge = '🟡 MILESTONE A (10% Fuel Coverage)';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       SOURCE DISCOVERY & FUEL COVERAGE RATIO REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Dominios Examinados:            ${summary.domainsExamined} dominios`);
  console.log(`Particiones Muestreadas:        ${qualifiedMines.length} particiones`);
  console.log(`Páginas Totales Muestreadas:    ${summary.totalPagesSampled.toLocaleString()} páginas`);
  console.log(`Faltante Real para 100K:        ${summary.requiredTo100K.toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`CLASIFICACIÓN TAXONÓMICA EXHAUSTIVA:`);
  console.log(`  • MEGA MINAS (Potential >5.000):   ${summary.megaMinesFound} minas 💎💎💎`);
  console.log(`  • MINAS ELITE (Potential >2.000):  ${summary.eliteMinesFound} minas ⭐⭐⭐⭐⭐`);
  console.log(`  • MINAS STRONG (Potential 500-2K): ${summary.strongMinesFound} minas ⭐⭐⭐⭐`);
  console.log(`  • MINAS TÁCTICAS (Potential 100-500): ${summary.tacticalMinesFound} minas ⭐⭐⭐`);
  console.log(`  • MINAS PEQUEÑAS LIMPIAS (<100):   ${summary.smallCleanFound} minas 🧼`);
  console.log(`  • MINAS SATURADAS (Descartadas):   ${summary.saturatedMinesDiscarded} minas ⛔`);
  console.log(`  • MUESTRAS INCONCLUSAS:            ${summary.inconclusiveMinesCount} minas ❓`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`ESTIMACIÓN DE COMBUSTIBLE POTENCIAL (WILSON 95% LOWER BOUND):`);
  console.log(`  • Potencial Estimado Puntual:   +${summary.totalPointPotentialNetNew.toLocaleString()} net-new`);
  console.log(`  • POTENCIAL CONSERVADOR (REAL): +${summary.totalConservativePotentialNetNew.toLocaleString()} net-new 🎯`);
  console.log(`  • DISCOVERY EFFICIENCY:         ${summary.discoveryEfficiency} (Net-New Potencial / Página Muestreada) 🚀`);
  console.log(`  • FUEL COVERAGE RATIO:          ${coveragePct}% (Potencial Conservador / ${summary.requiredTo100K.toLocaleString()})`);
  console.log(`  • ESTADO DE HITOS (MILESTONE):  ${milestoneBadge}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏆 TOP MINAS CALIFICADAS PARA EXPLOTACIÓN MASIVA:');
  qualifiedMines
    .filter(m => m.tier === 'mega' || m.tier === 'elite' || m.tier === 'strong' || m.tier === 'tactical' || m.tier === 'small_clean')
    .sort((a, b) => b.conservativePotentialNetNew - a.conservativePotentialNetNew)
    .slice(0, 10)
    .forEach((m, idx) => {
      const nov = (m.rawNoveltyRate * 100).toFixed(0);
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${m.publisherName.padEnd(28)} | ${m.samplingStage.padEnd(11)} | Nov: ${nov.padStart(3)}% | Conservador: +${m.conservativePotentialNetNew.toLocaleString()} [${m.tier.toUpperCase()}]`);
    });

  console.log('\n🏁 SESIÓN DE SOURCE DISCOVERY FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Discovery Error:', err);
  process.exit(1);
});
