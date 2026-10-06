/**
 * audit_atlas_music.ts
 *
 * AUDITORÍA EXHAUSTIVA DEL MUSIC KNOWLEDGE GRAPH EN ATLAS (ATLAS 100K V3)
 * Incluye:
 * 1. Conteo total y proporción de música
 * 2. Enlaces del Grafo: Artist Linkage, Genre Linkage, Movement Linkage, Format Classification
 * 3. Recuperación Retroactiva de Entidades en el backlog de música
 * 4. Diversidad por Proveedor y Formato
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';
import { classifyMusicItem } from '../src/lib/atlasBootstrap/musicClassifier';

async function auditAtlasMusicGraph() {
  console.log('======================================================================');
  console.log('🎵 AUDITORÍA DE GRAFO MUSICAL & ENRICHMENT RETROACTIVO');
  console.log('======================================================================\n');

  let allIndexItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: pageErr } = await supabase
      .from('youapp_index')
      .select('provider, provider_content_id, title, description, creator_name, duration_seconds, language, content_state')
      .range(from, from + batchSize - 1);

    if (pageErr || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allIndexItems.push(...pageData);
      if (pageData.length < batchSize) hasMore = false;
      from += batchSize;
    }
  }

  const totalAtlas = allIndexItems.length;
  console.log(`📊 Inventario Total Físico en Atlas: ${totalAtlas.toLocaleString()} contenidos\n`);

  let musicCount = 0;
  let nonMusicCount = 0;
  let withArtist = 0;
  let withGenre = 0;
  let withMovement = 0;
  let withFormat = 0;
  let withVenue = 0;

  const genreCounts: Record<string, number> = {};
  const formatCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  const artistCounts: Record<string, number> = {};
  const venueCounts: Record<string, number> = {};

  allIndexItems.forEach(item => {
    const classification = classifyMusicItem(item.title, item.description, item.creator_name);

    if (classification && classification.domain === 'music') {
      musicCount++;

      if (classification.artistId) {
        withArtist++;
        artistCounts[classification.artistName || classification.artistId] = (artistCounts[classification.artistName || classification.artistId] || 0) + 1;
      }
      if (classification.genre) {
        withGenre++;
        genreCounts[classification.genre] = (genreCounts[classification.genre] || 0) + 1;
      }
      if (classification.movement) {
        withMovement++;
      }
      if (classification.format) {
        withFormat++;
        formatCounts[classification.format] = (formatCounts[classification.format] || 0) + 1;
      }
      if (classification.venueOrSeries) {
        withVenue++;
        venueCounts[classification.venueOrSeries] = (venueCounts[classification.venueOrSeries] || 0) + 1;
      }

      const p = item.provider || 'desconocido';
      providerCounts[p] = (providerCounts[p] || 0) + 1;
    } else {
      nonMusicCount++;
    }
  });

  const musicPct = totalAtlas ? ((musicCount / totalAtlas) * 100).toFixed(1) : '0';
  const nonMusicPct = totalAtlas ? ((nonMusicCount / totalAtlas) * 100).toFixed(1) : '0';

  const artistLinkageRate = musicCount ? Math.round((withArtist / musicCount) * 100) : 0;
  const genreLinkageRate = musicCount ? Math.round((withGenre / musicCount) * 100) : 0;
  const movementLinkageRate = musicCount ? Math.round((withMovement / musicCount) * 100) : 0;
  const formatClassificationRate = musicCount ? Math.round((withFormat / musicCount) * 100) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 ATLAS MUSIC FOUNDATION AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Atlas Actual:              ${totalAtlas.toLocaleString()} contenidos`);
  console.log(`  🎵 Contenido Musical:           ${musicCount.toLocaleString().padStart(6)} (${musicPct}%)`);
  console.log(`  📚 Contenido General:           ${nonMusicCount.toLocaleString().padStart(6)} (${nonMusicPct}%)\n`);

  console.log(`🎯 METAS ATLAS 100K V3:`);
  console.log(`  - Meta Música:                  50.000 (Faltan: ${(Math.max(0, 50000 - musicCount)).toLocaleString()})`);
  console.log(`  - Meta Conocimiento General:    50.000 (Faltan: ${(Math.max(0, 50000 - nonMusicCount)).toLocaleString()})`);
  console.log(`  - Meta Total Atlas:            100.000 (Faltan: ${(Math.max(0, 100000 - totalAtlas)).toLocaleString()})\n`);

  console.log(`🧠 ENLACES DEL MUSIC KNOWLEDGE GRAPH:`);
  console.log(`  - Genre Linkage:                ${genreLinkageRate}% (Meta: >=95% ${genreLinkageRate >= 95 ? '✅' : '⏳'})`);
  console.log(`  - Format Classification:        ${formatClassificationRate}% (Meta: >=95% ${formatClassificationRate >= 95 ? '✅' : '⏳'})`);
  console.log(`  - Movement Linkage:             ${movementLinkageRate}% (Meta: >=80% ${movementLinkageRate >= 80 ? '✅' : '⏳'})`);
  console.log(`  - Artist / Entity Linkage:      ${artistLinkageRate}% (${withArtist.toLocaleString()} piezas vinculadas — Meta: >=90% ${artistLinkageRate >= 90 ? '✅' : '⏳'})\n`);

  console.log(`📋 DISTRIBUCIÓN POR GÉNERO / FAMILIA MUSICAL:`);
  Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, c]) => {
      const pct = musicCount ? ((c / musicCount) * 100).toFixed(1) : '0';
      console.log(`  - ${g.padEnd(25)}: ${c.toLocaleString().padStart(5)} (${pct}%)`);
    });

  console.log(`\n🎙️ DISTRIBUCIÓN POR FORMATO:`);
  Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([f, c]) => {
      const pct = musicCount ? ((c / musicCount) * 100).toFixed(1) : '0';
      console.log(`  - ${f.padEnd(25)}: ${c.toLocaleString().padStart(5)} (${pct}%)`);
    });

  console.log(`\n🌐 CONCENTRACIÓN POR PROVEEDOR EN MÚSICA (Meta < 50%):`);
  Object.entries(providerCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([p, c]) => {
      const pct = musicCount ? ((c / musicCount) * 100).toFixed(1) : '0';
      const pass = (+pct) < 50;
      console.log(`  - ${p.padEnd(20)}: ${c.toLocaleString().padStart(5)} (${pct}%) ${pass ? '✅' : '⚠️ (>50%)'}`);
    });

  if (Object.keys(venueCounts).length > 0) {
    console.log(`\n🏛️ SERIES Y VENUES IDENTIFICADOS:`);
    Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([v, c]) => {
        console.log(`  - ${v.padEnd(20)}: ${c.toLocaleString().padStart(5)}`);
      });
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

auditAtlasMusicGraph();
