/**
 * audit_works_graph_v2.ts — Auditoría del Works Graph V2 con Descubrimiento Automático y Ontología 3D
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2';
import { matchCanonicalWork } from '../src/lib/atlasBootstrap/worksGraphEngine';
import {
  extractWorkTitleCandidate,
  detectRenditionType,
  detectContentRole,
  detectSourceContext,
  DiscoveredWorkCluster
} from '../src/lib/atlasBootstrap/workResolver';
import type { RenditionType, ContentRole, SourceContext } from '../src/lib/atlasBootstrap/worksGraphTypes';

async function auditWorksGraphV2() {
  console.log('======================================================================');
  console.log('🎼 ATLAS WORKS GRAPH V2 — AUTOMATED DISCOVERY & 3D ONTOLOGY AUDIT');
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

  const renditionTotals: Record<RenditionType, number> = {
    studio: 0,
    live: 0,
    acoustic: 0,
    rehearsal: 0,
    demo: 0,
    outtake: 0,
    cover: 0,
    remaster: 0
  };

  const roleTotals: Record<ContentRole, number> = {
    performance: 0,
    documentary: 0,
    analysis: 0,
    interview: 0,
    historical_context: 0
  };

  const contextTotals: Record<SourceContext, number> = {
    archive: 0,
    broadcast: 0,
    radio_session: 0,
    festival: 0,
    television: 0,
    official_release: 0
  };

  const workClusters: Record<string, DiscoveredWorkCluster> = {};

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);
    if (classification && classification.domain === 'music') {
      totalMusic++;
      const resolved = resolveEntityV2(item.title, item.description, item.creator_name);

      let canonicalWorkId: string | null = null;
      let canonicalWorkTitle: string | null = null;
      let entityId = resolved.id || 'unassigned_artist';
      let entityName = resolved.name || 'Artista No Identificado';

      // 1. Intentar matching con obras canónicas curadas
      const staticMatch = matchCanonicalWork(item.title, item.description, item.creator_name);
      if (staticMatch) {
        canonicalWorkId = staticMatch.workId;
        canonicalWorkTitle = staticMatch.canonicalTitle;
        entityId = staticMatch.primaryEntityId;
      } else if (resolved.confidence >= 0.85 && resolved.name) {
        // 2. Extracción y clustering dinámico de obras
        const candidateTitle = extractWorkTitleCandidate(item.title, resolved.name);
        if (candidateTitle) {
          const norm = candidateTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          canonicalWorkId = `${entityId}:${norm}`;
          canonicalWorkTitle = candidateTitle;
        }
      }

      if (canonicalWorkId && canonicalWorkTitle) {
        totalWorksLinked++;

        const rendition = detectRenditionType(item.title, item.description);
        const role = detectContentRole(item.title, item.description);
        const sourceCtx = detectSourceContext(item.title, item.description);

        renditionTotals[rendition]++;
        roleTotals[role]++;
        contextTotals[sourceCtx]++;

        if (!workClusters[canonicalWorkId]) {
          workClusters[canonicalWorkId] = {
            workId: canonicalWorkId,
            canonicalTitle: canonicalWorkTitle,
            normalizedTitle: canonicalWorkTitle.toLowerCase(),
            primaryEntityId: entityId,
            primaryEntityName: entityName,
            assetIds: [],
            renditionCounts: { studio: 0, live: 0, acoustic: 0, rehearsal: 0, demo: 0, outtake: 0, cover: 0, remaster: 0 },
            roleCounts: { performance: 0, documentary: 0, analysis: 0, interview: 0, historical_context: 0 },
            contextCounts: { archive: 0, broadcast: 0, radio_session: 0, festival: 0, television: 0, official_release: 0 }
          };
        }

        const cluster = workClusters[canonicalWorkId];
        cluster.assetIds.push(item.id);
        cluster.renditionCounts[rendition]++;
        cluster.roleCounts[role]++;
        cluster.contextCounts[sourceCtx]++;
      }
    }
  });

  const totalWorksDiscovered = Object.keys(workClusters).length;
  const workLinkagePct = totalMusic ? +((totalWorksLinked / totalMusic) * 100).toFixed(1) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 INFORME DEL WORKS GRAPH V2 (50.015 ASSETS)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Contenidos en Atlas:            ${allIndexItems.length.toLocaleString()}`);
  console.log(`Total Piezas Musicales Reales:        ${totalMusic.toLocaleString()}`);
  console.log(`Obras Canónicas Distintas en Grafo:   ${totalWorksDiscovered.toLocaleString()} Obras 🎯 (Meta >= 500)`);
  console.log(`Assets Conectados a Obras Canónicas:  ${totalWorksLinked.toLocaleString()} piezas (${workLinkagePct}%) 🚀 (Meta >= 5.000)\n`);

  console.log('DIMENSIÓN 1: TIPO DE INTERPRETACIÓN (RENDITION TYPE):');
  Object.entries(renditionTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([rend, count]) => {
      console.log(`  • ${rend.padEnd(20)}: ${count.toLocaleString().padStart(5)} assets (${Math.round((count / totalWorksLinked) * 100)}%)`);
    });

  console.log('\nDIMENSIÓN 2: ROL DE CONTENIDO (CONTENT ROLE):');
  Object.entries(roleTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([role, count]) => {
      console.log(`  • ${role.padEnd(20)}: ${count.toLocaleString().padStart(5)} assets (${Math.round((count / totalWorksLinked) * 100)}%)`);
    });

  console.log('\nDIMENSIÓN 3: CONTEXTO DE PROCEDENCIA (SOURCE CONTEXT):');
  Object.entries(contextTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ctx, count]) => {
      console.log(`  • ${ctx.padEnd(20)}: ${count.toLocaleString().padStart(5)} assets (${Math.round((count / totalWorksLinked) * 100)}%)`);
    });

  console.log('\nTOP 15 OBRAS CANÓNICAS CON MAYOR DIVERSIDAD MULTIDIMENSIONAL:');
  Object.values(workClusters)
    .sort((a, b) => b.assetIds.length - a.assetIds.length)
    .slice(0, 15)
    .forEach((cluster, idx) => {
      const rDetails = Object.entries(cluster.renditionCounts).filter(([_, c]) => c > 0).map(([r, c]) => `${r}: ${c}`).join(', ');
      console.log(`  ${(idx + 1).toString().padStart(2)}. "${cluster.canonicalTitle}" [${cluster.primaryEntityName}] ➔ ${cluster.assetIds.length} videos [${rDetails}]`);
    });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

auditWorksGraphV2();
