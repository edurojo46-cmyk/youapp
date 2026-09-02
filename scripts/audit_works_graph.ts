/**
 * audit_works_graph.ts — Auditoría del Grafo de Obras Canónicas (Works Graph V1) sobre Atlas 50K
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';
import { matchCanonicalWork } from '../src/lib/atlasBootstrap/worksGraphEngine';

async function auditWorksGraph() {
  console.log('======================================================================');
  console.log('🎼 ATLAS WORKS GRAPH V1 — CANONICAL WORKS & VERSION AUDIT');
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
  let totalWorksLinked = 0;
  const versionBreakdown: Record<string, number> = {
    studio: 0,
    live: 0,
    acoustic: 0,
    rehearsal: 0,
    demo: 0,
    outtake: 0,
    cover: 0,
    analysis: 0,
    documentary: 0,
    interview_context: 0,
    unknown: 0
  };

  const workCounts: Record<string, { title: string; count: number; versions: Record<string, number> }> = {};

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      totalMusic++;

      const workRelation = matchCanonicalWork(item.title, item.description, item.creator_name);
      if (workRelation) {
        totalWorksLinked++;
        const wId = workRelation.workId;
        const vType = workRelation.versionType;

        versionBreakdown[vType] = (versionBreakdown[vType] || 0) + 1;

        if (!workCounts[wId]) {
          workCounts[wId] = {
            title: workRelation.canonicalTitle,
            count: 0,
            versions: {}
          };
        }
        workCounts[wId].count++;
        workCounts[wId].versions[vType] = (workCounts[wId].versions[vType] || 0) + 1;
      }
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DE AUDITORÍA DEL WORKS GRAPH V1');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Contenidos en Atlas:            ${allIndexItems.length.toLocaleString()}`);
  console.log(`Total Piezas Musicales:               ${totalMusic.toLocaleString()}`);
  console.log(`Assets Vinculados a Obras Canónicas:  ${totalWorksLinked.toLocaleString()} (${Math.round((totalWorksLinked / totalMusic) * 100)}%) 🎯`);
  console.log(`Obras Canónicas Distintas Detectadas: ${Object.keys(workCounts).length.toLocaleString()}\n`);

  console.log('DISTRIBUCIÓN POR TIPO DE VERSIÓN (VERSION CLASSIFICATION):');
  Object.entries(versionBreakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([vType, count]) => {
      console.log(`  - ${vType.padEnd(20)}: ${count.toLocaleString()} piezas`);
    });

  console.log('\nTOP OBRAS CANÓNICAS CON DIVERSIDAD DE VERSIONES:');
  Object.values(workCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .forEach((work, idx) => {
      const vDetails = Object.entries(work.versions).map(([v, c]) => `${v}: ${c}`).join(', ');
      console.log(`  ${(idx + 1).toString().padStart(2)}. "${work.title}" (${work.count} assets) ➔ [${vDetails}]`);
    });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

auditWorksGraph();
