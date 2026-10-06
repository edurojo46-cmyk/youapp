import { DailymotionAdapter } from '../src/lib/search/providers/adapters/dailymotionAdapter';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { supabase } from '../src/lib/supabase';

async function diagnose() {
  console.log('🔍 DIAGNÓSTICO DE DISPONIBILIDAD PARA "Calle 13 - La Perla" EN LA RED FEDERADA:\n');

  const detection = exactWorkSearchGate.detectExactWork('calle 13 la perla');
  console.log('Detection:', detection);

  // 1. Dailymotion con varias variantes de query
  const searchTerms = [
    'calle 13 la perla',
    'calle 13 ruben blades la perla',
    'calle 13 la perla live',
    'calle 13 la perla en vivo',
    'calle 13 la perla oficial',
    'calle 13 la perla letra'
  ];

  const dm = new DailymotionAdapter();
  const allDmCandidates = new Map<string, any>();

  for (const st of searchTerms) {
    console.log(`\nConsultando Dailymotion con: "${st}"...`);
    const params = new URLSearchParams({
      search: st,
      fields: 'id,title,description,duration,created_time,thumbnail_url,owner,channel,allow_embed',
      limit: '25',
      sort: 'relevance'
    });

    try {
      const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list = json.list || [];
        console.log(`  -> Devueltos por Dailymotion: ${list.length}`);
        for (const item of list) {
          if (!allDmCandidates.has(item.id)) {
            allDmCandidates.set(item.id, item);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching DM:', e);
    }
  }

  console.log(`\nTotal videos únicos recolectados de Dailymotion: ${allDmCandidates.size}`);

  console.log('\n2. EVALUANDO CADA CANDIDATO CON ExactWorkSearchGate (WF>=75, AF>=85):');
  let qualifiedCount = 0;
  for (const [id, item] of allDmCandidates.entries()) {
    const candidate: any = {
      id: `dm_${id}`,
      provider: 'dailymotion',
      providerContentId: id,
      title: item.title,
      description: item.description,
      channelTitle: item.owner || 'Dailymotion',
      videoUrl: `https://www.dailymotion.com/video/${id}`,
      thumbnail: item.thumbnail_url,
      durationSeconds: item.duration || 240
    };

    const wf = exactWorkSearchGate.calculateWorkFidelity(candidate, detection);
    const af = exactWorkSearchGate.calculateArtistFidelity(candidate, detection);
    const role = exactWorkSearchGate.classifyContentRole(candidate, detection);

    const isQualified = wf >= 75 && af >= 85 && role !== 'COVER' && role !== 'TRIBUTE' && role !== 'CONTEXTUAL_USE' && role !== 'COMMENTARY' && role !== 'REACTION';

    if (isQualified) {
      qualifiedCount++;
      console.log(`  ✅ [CALIFICADO] "${item.title}" | ID: ${id} | Role: ${role} | WF: ${wf} | AF: ${af}`);
    } else {
      console.log(`  ❌ [DESCARTADO] "${item.title.slice(0, 50)}" | Role: ${role} | WF: ${wf} | AF: ${af}`);
    }
  }

  console.log(`\nTotal candidatos calificados para Calle 13 La Perla: ${qualifiedCount}`);
}

diagnose();
