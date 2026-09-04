import { supabase } from '../src/lib/supabase';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

async function harvestInterviews() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🌾 COSECHA FEDERADA: "Papa Francisco — Entrevistas Auténticas"');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Candidatos seleccionados de alta calidad de Dailymotion
  const candidateIds = [
    'x7ydghk', // "Entrevista de Valentina Alazraki al Papa Francisco en 2015" (4031s)
    'x1pwoj8', // "Francisco: el Papa revolucionario en una entrevista realmente extraordinaria" (1830s)
    'x9illg6', // "REPORTAJE PAPA FRANCISCO" (713s)
    'x9i9ask'  // "Entrevista: Adiós al Papa Francisco" (1154s)
  ];

  const detection = exactWorkSearchGate.detectExactWork('papa francisco entrevista');
  console.log('Intent detectado para la query:', {
    detectionType: detection.detectionType,
    canonicalEntity: detection.canonicalEntity,
    topic: detection.topic,
    topicCategory: detection.topicCategory
  });

  let persisted = 0;

  for (const id of candidateIds) {
    // 1. Verificar si ya existe en youapp_index
    const { data: existing } = await supabase
      .from('youapp_index')
      .select('id, title')
      .eq('provider', 'dailymotion')
      .eq('provider_content_id', id)
      .maybeSingle();

    if (existing) {
      console.log(`  [Existente] [${id}] "${existing.title}"`);
      persisted++;
      continue;
    }

    // 2. Obtener metadata de Dailymotion
    try {
      const res = await fetch(`https://api.dailymotion.com/video/${id}?fields=id,title,description,duration,thumbnail_url,owner`);
      if (res.ok) {
        const data = await res.json();
        const row = {
          provider: 'dailymotion',
          provider_content_id: data.id,
          video_id: data.id,
          title: data.title,
          description: data.description || '',
          creator_name: 'Papa Francisco',
          duration_seconds: data.duration || 600,
          url: `https://www.dailymotion.com/video/${data.id}`,
          canonical_url: `https://www.dailymotion.com/video/${data.id}`,
          thumbnail_url: data.thumbnail_url || '',
          source: 'federated_bronze',
          metadata_provenance: 'bronze_entrevista',
          content_state: 'ready',
          created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('youapp_index').insert(row);
        if (!error) {
          console.log(`  ✅ [Insertado] [${id}] (${row.duration_seconds}s) "${row.title}"`);
          persisted++;
        } else {
          console.error(`  ❌ Error insertando ${id}:`, error.message);
        }
      }
    } catch (e: any) {
      console.error(`  ❌ Error fetching ${id}:`, e.message);
    }
  }

  console.log(`\nTotal entrevistas genuinas de Papa Francisco persistidas: ${persisted}`);
}

harvestInterviews().catch(console.error);
