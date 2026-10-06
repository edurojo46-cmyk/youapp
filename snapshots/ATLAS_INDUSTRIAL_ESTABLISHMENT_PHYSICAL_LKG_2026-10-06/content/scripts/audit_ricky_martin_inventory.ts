/**
 * audit_ricky_martin_inventory.ts
 * 
 * Auditoría Física y Diagnóstico de Retrieval para:
 * Entity: Ricky Martin
 * Title: A Medio Vivir
 * 
 * FASE 1: Inspección de Atlas youapp_index directo (sin Discovery, sin mocks, sin inserciones).
 * FASE 2: Auditoría de Retrieval de searchEngine (evaluación de recall).
 * FASE 3: Diagnóstico causal (RETRIEVAL_FAILURE, COVERAGE_GAP, BOTH o HEALTHY).
 */

import { supabase } from '../src/lib/supabase';
import { retrieveInternalCandidates } from '../src/lib/search/retrievalEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { parseQuery } from '../src/lib/search/queryEngine';
import type { ContentItem } from '../src/lib/search/types';

async function audit() {
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('🔍 AUDITORÍA FÍSICA DE ATLAS: "Ricky Martin — A Medio Vivir"');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  // ── 1. AUDITORÍA FÍSICA EN youapp_index ───────────────────────────────────────
  console.log('── PARTE 1: INVENTARIO FÍSICO DIRECTO EN youapp_index ──');

  // Total filas en Atlas
  const { count: atlasTotalRows } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  // Filas que mencionan Ricky Martin (en título)
  const { data: rickyTitleRows, count: rickyTitleCount } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, video_id, title, creator_name, url, canonical_url, description', { count: 'exact' })
    .ilike('title', '%ricky martin%');

  // Filas que mencionan Ricky Martin (en description)
  const { data: rickyDescRows, count: rickyDescCount } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, video_id, title, creator_name, url, canonical_url, description', { count: 'exact' })
    .ilike('description', '%ricky martin%');

  const rickyMap = new Map<string, any>();
  (rickyTitleRows || []).forEach(r => rickyMap.set(r.id, r));
  (rickyDescRows || []).forEach(r => rickyMap.set(r.id, r));
  const entityPhysicalMatches = rickyMap.size;
  const entityRows = Array.from(rickyMap.values());

  // Filas que mencionan "medio vivir" (en título)
  const { data: songTitleRows, count: songTitleCount } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, video_id, title, creator_name, url, canonical_url, description', { count: 'exact' })
    .ilike('title', '%medio vivir%');

  // Filas que mencionan "medio vivir" (en description)
  const { data: songDescRows, count: songDescCount } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, video_id, title, creator_name, url, canonical_url, description', { count: 'exact' })
    .ilike('description', '%medio vivir%');

  const songMap = new Map<string, any>();
  (songTitleRows || []).forEach(r => songMap.set(r.id, r));
  (songDescRows || []).forEach(r => songMap.set(r.id, r));
  const titlePhysicalMatches = songMap.size;
  const titleRows = Array.from(songMap.values());

  // Filas que contienen AMBAS cosas (Ricky Martin AND medio vivir)
  const entityAndTitleRows = entityRows.filter(r => {
    const text = `${r.title || ''} ${r.creator_name || ''} ${r.description || ''}`.toLowerCase();
    return text.includes('medio vivir');
  });
  const entityAndTitlePhysicalMatches = entityAndTitleRows.length;

  // Filtrado estricto con Gates de Fidelidad (TF >= 75 && AF >= 85)
  const exactDetection = exactWorkSearchGate.detectExactWork('ricky martin a medio vivir');
  const exactEntityTitlePhysicalRows: any[] = [];
  const playableExactPhysicalRows: any[] = [];

  for (const r of entityAndTitleRows) {
    const item: ContentItem = {
      id: r.id || `${r.provider}_${r.video_id || r.provider_content_id}`,
      type: 'video',
      provider: r.provider || 'unknown',
      providerId: r.video_id || r.provider_content_id,
      title: r.title || '',
      description: r.description || '',
      channelTitle: r.creator_name || '',
      videoUrl: r.url || r.canonical_url || '',
      thumbnail: '',
      isLive: false,
      isVerified: true
    };

    const tf = exactWorkSearchGate.calculateTitleFidelity(item, exactDetection);
    const af = exactWorkSearchGate.calculateArtistFidelity(item, exactDetection);

    if (tf >= 75 && af >= 85) {
      exactEntityTitlePhysicalRows.push({ ...r, tf, af });
      const isPlayable = !!(item.videoUrl && item.videoUrl.length > 5);
      if (isPlayable) {
        playableExactPhysicalRows.push({ ...r, tf, af });
      }
    }
  }

  console.log(`  Total Atlas rows:                 ${atlasTotalRows ?? 'N/A'}`);
  console.log(`  Ricky Martin rows:                ${entityPhysicalMatches ?? 0}`);
  console.log(`  "A Medio Vivir" title rows:       ${titlePhysicalMatches ?? 0}`);
  console.log(`  Ricky Martin + A Medio Vivir:     ${entityAndTitlePhysicalMatches}`);
  console.log(`  Exact Entity+Title (TF>=75, AF>=85): ${exactEntityTitlePhysicalRows.length}`);
  console.log(`  Playable Exact Physical:          ${playableExactPhysicalRows.length}\n`);

  console.log('Detalle de Activos Físicos Exactos en Atlas:');
  if (exactEntityTitlePhysicalRows.length === 0) {
    console.log('  (Ningún registro físico exacto encontrado en youapp_index)');
  } else {
    exactEntityTitlePhysicalRows.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.provider}] ID: ${r.video_id || r.provider_content_id} | TF:${r.tf} AF:${r.af}`);
      console.log(`     Título:  "${r.title}"`);
      console.log(`     Creador: "${r.creator_name}"`);
      console.log(`     URL:     ${r.url || r.canonical_url}`);
    });
  }

  // ── 2. AUDITORÍA DE RETRIEVAL ───────────────────────────────────────────────
  console.log('\n── PARTE 2: AUDITORÍA DE RETRIEVAL (retrieveInternalCandidates) ──');
  const query = parseQuery('ricky martin a medio vivir');
  const retrieval = await retrieveInternalCandidates(query);
  const rawRetrievedItems = retrieval.candidates || [];

  let entityMatchesRetrieved = 0;
  let titleMatchesRetrieved = 0;
  let exactBeforeGate = 0;
  let exactQualifiedAfterGate = 0;

  for (const c of rawRetrievedItems) {
    const text = `${c.title || ''} ${c.channelTitle || ''} ${c.description || ''}`.toLowerCase();
    const hasEntity = text.includes('ricky martin');
    const hasTitle = text.includes('medio vivir');

    if (hasEntity) entityMatchesRetrieved++;
    if (hasTitle) titleMatchesRetrieved++;

    if (hasEntity && hasTitle) {
      exactBeforeGate++;
    }

    const tf = exactWorkSearchGate.calculateTitleFidelity(c, exactDetection);
    const af = exactWorkSearchGate.calculateArtistFidelity(c, exactDetection);
    if (tf >= 75 && af >= 85) {
      exactQualifiedAfterGate++;
    }
  }

  const exactPhysical = exactEntityTitlePhysicalRows.length;
  const exactRecall = exactPhysical > 0 ? (exactBeforeGate / exactPhysical) * 100 : null;

  console.log(`  Raw candidates recuperados:              ${rawRetrievedItems.length}`);
  console.log(`  Entity matches recuperados:              ${entityMatchesRetrieved}`);
  console.log(`  Title matches recuperados:               ${titleMatchesRetrieved}`);
  console.log(`  Exact Entity+Title antes de gate:        ${exactBeforeGate}`);
  console.log(`  Exact Entity+Title calificados post-gate: ${exactQualifiedAfterGate}`);
  console.log(`  ExactRetrievalRecall:                    ${exactRecall !== null ? `${exactRecall.toFixed(1)}%` : 'N/A (exactPhysical = 0)'}\n`);

  // ── 3. DIAGNÓSTICO AUTOMÁTICO ───────────────────────────────────────────────
  console.log('── PARTE 3: DIAGNÓSTICO AUTOMÁTICO ──');
  let diagnosis: 'RETRIEVAL_FAILURE' | 'COVERAGE_GAP' | 'BOTH' | 'HEALTHY';

  if (exactPhysical >= 6 && exactBeforeGate < exactPhysical) {
    diagnosis = 'RETRIEVAL_FAILURE';
  } else if (exactPhysical < 6 && (exactPhysical === 0 || exactBeforeGate === exactPhysical)) {
    diagnosis = 'COVERAGE_GAP';
  } else if (exactPhysical < 6 && exactBeforeGate < exactPhysical) {
    diagnosis = 'BOTH';
  } else {
    diagnosis = 'HEALTHY';
  }

  console.log(`  Diagnóstico Causal: ${diagnosis}`);
  if (diagnosis === 'COVERAGE_GAP') {
    console.log('  Explicación: Atlas no dispone físicamente de activos de "A Medio Vivir" de Ricky Martin (o tiene <6).');
    console.log('               El buscador no mintió: reportó 0 porque Atlas tiene un gap real de catálogo.');
    console.log('               La solución arquitectónica requerida es disparar Discovery Gap Worker para cosechar y persistir Bronze.');
  } else if (diagnosis === 'RETRIEVAL_FAILURE') {
    console.log('  Explicación: Los activos existen físicamente en Atlas, pero el motor de retrieval no los seleccionó.');
  } else if (diagnosis === 'BOTH') {
    console.log('  Explicación: Existen pocos activos y además retrieval no recuperó los existentes.');
  } else {
    console.log('  Explicación: Catálogo y retrieval están completamente sanos.');
  }

  console.log('\n════════════════════════════════════════════════════════════════════════════════');
}

audit().catch(e => {
  console.error('Error en auditoría:', e);
  process.exit(1);
});
