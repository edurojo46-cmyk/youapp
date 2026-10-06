import { supabase } from '../src/lib/supabase';

async function auditInventory() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 AUDITORÍA FÍSICA ATLAS: "Papa Francisco — Entrevista"');
  console.log('════════════════════════════════════════════════════════════════\n');

  // 1. Total Papa Francisco en youapp_index
  const { count: pfTotal } = await supabase
    .from('youapp_index')
    .select('id', { count: 'exact', head: true })
    .or('title.ilike.%papa francisco%,title.ilike.%pope francis%,creator_name.ilike.%papa francisco%');

  // 2. Total entrevistas en general en youapp_index
  const { count: interviewTotal } = await supabase
    .from('youapp_index')
    .select('id', { count: 'exact', head: true })
    .ilike('title', '%entrevista%');

  // 3. Papa Francisco + entrevista físico simultáneo
  const { data: pfInterviews } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, video_id, title, creator_name, duration_seconds, url, canonical_url')
    .or('title.ilike.%papa francisco%,title.ilike.%pope francis%,creator_name.ilike.%papa francisco%')
    .or('title.ilike.%entrevista%,title.ilike.%interview%,title.ilike.%dialoga con%,title.ilike.%conversacion%');

  // Filtrar con precisión los que cumplen Papa Francisco Y entrevista
  const matchingAssets = (pfInterviews || []).filter(item => {
    const t = (item.title || '').toLowerCase();
    const hasEntity = t.includes('papa francisco') || t.includes('francisco') || t.includes('pope francis');
    const hasTopic = t.includes('entrevista') || t.includes('interview') || t.includes('reportaje') || t.includes('dialoga') || t.includes('convers');
    return hasEntity && hasTopic;
  });

  const { data: pfRows } = await supabase
    .from('youapp_index')
    .select('id, provider, title')
    .or('title.ilike.%papa francisco%,title.ilike.%pope francis%,creator_name.ilike.%papa francisco%');

  console.log(`PapaFranciscoPhysical:              ${pfTotal || 0}`);
  console.log(`InterviewPhysical:                  ${interviewTotal || 0}`);
  console.log(`PapaFranciscoInterviewPhysical:     ${matchingAssets.length}`);
  console.log(`PlayableEntityTopicPhysical:        ${matchingAssets.filter(a => a.url || a.canonical_url).length}\n`);

  console.log('Activos Físicos existentes de Papa Francisco en Atlas (14):');
  pfRows?.forEach((r, i) => console.log(`  [${i+1}] [${r.provider}] "${r.title}"`));
  console.log('');

  console.log('Detalle de Activos Físicos Papa Francisco + Entrevista:');
  if (matchingAssets.length === 0) {
    console.log('  ⚠️ CERO ACTIVOS FÍSICOS EXACTOS en Atlas.');
  } else {
    matchingAssets.forEach((a, i) => {
      console.log(`  [${i + 1}] [${a.provider}] ID: ${a.provider_content_id || a.video_id}`);
      console.log(`      Título: "${a.title}"`);
      console.log(`      URL:    ${a.url || a.canonical_url}`);
    });
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  if (matchingAssets.length === 0) {
    console.log('DIAGNÓSTICO: COVERAGE_GAP puro en Atlas para "Papa Francisco Entrevista"');
  } else {
    console.log(`DIAGNÓSTICO: Existen ${matchingAssets.length} activos físicos. Verificar si retrieval los recupera.`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');
}

auditInventory().catch(console.error);
