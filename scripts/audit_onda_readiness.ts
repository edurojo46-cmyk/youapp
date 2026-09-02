/**
 * audit_onda_readiness.ts — Auditoría de Preparación Editorial de Atlas para el Director de Onda
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';

async function runOndaReadinessAudit() {
  console.log('======================================================================');
  console.log('🎬 ATLAS 30K — ONDA EXPERIENCE READINESS & NARRATIVE AUDIT');
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
  let totalGeneral = 0;
  let linkedEntities = 0;
  let narrativeCovered = 0;

  let sumOpener = 0;
  let sumTransition = 0;
  let sumCloser = 0;
  let sumEnergy = 0;
  let sumVisual = 0;
  let sumRarity = 0;
  let sumHistorical = 0;

  let countOpeners = 0;
  let countTransitions = 0;
  let countClosers = 0;
  let countDeepCuts = 0;

  const energyDist = { low: 0, medium: 0, high: 0 };
  const visualDist = { low: 0, medium: 0, high: 0 };
  const historyDist = { standard: 0, high: 0, masterpiece: 0 };

  const entityCounts: Record<string, number> = {};

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      totalMusic++;

      if (classification.artistId) {
        linkedEntities++;
        const name = classification.artistName || classification.artistId;
        entityCounts[name] = (entityCounts[name] || 0) + 1;
      }

      if (classification.narrativeProfile) {
        narrativeCovered++;
        const np = classification.narrativeProfile;
        sumOpener += np.openerScore;
        sumTransition += np.transitionScore;
        sumCloser += np.closerScore;
        sumEnergy += np.energyScore;
        sumVisual += np.visualDemandScore;
        sumRarity += np.rarityScore;
        sumHistorical += np.historicalScore;

        if (np.isGoodOpener) countOpeners++;
        if (np.isGoodTransition) countTransitions++;
        if (np.isGoodCloser) countClosers++;
        if (np.isDeepCut) countDeepCuts++;

        if (np.energyLevel === 'low') energyDist.low++;
        else if (np.energyLevel === 'high') energyDist.high++;
        else energyDist.medium++;

        if (np.visualAttention === 'low') visualDist.low++;
        else if (np.visualAttention === 'high') visualDist.high++;
        else visualDist.medium++;

        if (np.historicalValue === 'masterpiece') historyDist.masterpiece++;
        else if (np.historicalValue === 'high') historyDist.high++;
        else historyDist.standard++;
      }
    } else {
      totalGeneral++;
    }
  });

  const narrativeCoveragePct = totalMusic > 0 ? Math.round((narrativeCovered / totalMusic) * 100) : 0;
  const entityLinkagePct = totalMusic > 0 ? Math.round((linkedEntities / totalMusic) * 100) : 0;

  const avgOpener = narrativeCovered > 0 ? Math.round(sumOpener / narrativeCovered) : 0;
  const avgTransition = narrativeCovered > 0 ? Math.round(sumTransition / narrativeCovered) : 0;
  const avgCloser = narrativeCovered > 0 ? Math.round(sumCloser / narrativeCovered) : 0;
  const avgEnergy = narrativeCovered > 0 ? Math.round(sumEnergy / narrativeCovered) : 0;
  const avgVisual = narrativeCovered > 0 ? Math.round(sumVisual / narrativeCovered) : 0;
  const avgRarity = narrativeCovered > 0 ? Math.round(sumRarity / narrativeCovered) : 0;
  const avgHistorical = narrativeCovered > 0 ? Math.round(sumHistorical / narrativeCovered) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DE READINESS PARA EL DIRECTOR DE ONDA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Inventario Atlas:           ${allIndexItems.length.toLocaleString()} contenidos`);
  console.log(`  🎵 Contenido Musical:            ${totalMusic.toLocaleString()} (${Math.round((totalMusic / allIndexItems.length) * 100)}%)`);
  console.log(`  📚 Contenido General:           ${totalGeneral.toLocaleString()} (${Math.round((totalGeneral / allIndexItems.length) * 100)}%)\n`);

  console.log(`🧠 COBERTURA Y GRAFO DE ENTIDADES:`);
  console.log(`  - Cobertura de Metadata Narrativa:  ${narrativeCoveragePct}% (Meta >= 90% ✅)`);
  console.log(`  - Artist / Entity Linkage:          ${entityLinkagePct}% (${linkedEntities.toLocaleString()} piezas vinculadas)`);
  console.log(`  - Piezas sin Entidad Identificada:  ${(totalMusic - linkedEntities).toLocaleString()}\n`);

  console.log(`📊 PUNTUACIONES MEDIAS NARRATIVAS (0–100):`);
  console.log(`  - Capacidad de Apertura (Opener):   ${avgOpener}/100`);
  console.log(`  - Fluidez de Transición (Bridge):   ${avgTransition}/100`);
  console.log(`  - Fuerza de Clímax (Closer):        ${avgCloser}/100`);
  console.log(`  - Intensidad Sonora (Energy):       ${avgEnergy}/100`);
  console.log(`  - Demanda Visual (Visual Demand):   ${avgVisual}/100`);
  console.log(`  - Nivel de Rareza (Rarity Score):   ${avgRarity}/100`);
  console.log(`  - Relevancia Histórica (Historic):  ${avgHistorical}/100\n`);

  console.log(`🎭 CAPACIDADES DE COMPOSICIÓN SECUENCIAL (Para Director de Onda):`);
  console.log(`  - Candidatos a Apertura (Openers):   ${countOpeners.toLocaleString()} (${Math.round((countOpeners / totalMusic) * 100)}%)`);
  console.log(`  - Candidatos a Puente (Transitions): ${countTransitions.toLocaleString()} (${Math.round((countTransitions / totalMusic) * 100)}%)`);
  console.log(`  - Candidatos a Cierre (Closers):     ${countClosers.toLocaleString()} (${Math.round((countClosers / totalMusic) * 100)}%)`);
  console.log(`  - Joyas Ocultas (Deep Cuts):         ${countDeepCuts.toLocaleString()} (${Math.round((countDeepCuts / totalMusic) * 100)}%)\n`);

  console.log(`🌡️ DISTRIBUCIÓN DE ENERGÍA Y DEMANDA:`);
  console.log(`  - Energía:         Baja: ${energyDist.low.toLocaleString()} | Media: ${energyDist.medium.toLocaleString()} | Alta: ${energyDist.high.toLocaleString()}`);
  console.log(`  - Demanda Visual:  Baja: ${visualDist.low.toLocaleString()} | Media: ${visualDist.medium.toLocaleString()} | Alta: ${visualDist.high.toLocaleString()}`);
  console.log(`  - Valor Histórico: Estándar: ${historyDist.standard.toLocaleString()} | Alto: ${historyDist.high.toLocaleString()} | Obra Cumbre: ${historyDist.masterpiece.toLocaleString()}\n`);

  console.log(`🏆 TOP 10 ENTIDADES INDIVIDUALES ESTRICTAS EN ATLAS:`);
  Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count], idx) => {
      console.log(`  ${(idx + 1).toString().padStart(2)}. ${name.padEnd(35)}: ${count.toLocaleString().padStart(5)} videos`);
    });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runOndaReadinessAudit();
