import { supabase } from '../src/lib/supabase';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

async function main() {
  console.log('=== AUDITORIA DIRECTA DE PUGLIESE EN ATLAS (youapp_index) ===');
  const { data, error } = await supabase
    .from('youapp_index')
    .select('*')
    .or('title.ilike.%osvaldo pugliese%,creator_name.ilike.%osvaldo pugliese%,title.ilike.%pugliese%');

  if (error) {
    console.error('Error fetching from youapp_index:', error);
    return;
  }

  console.log(`Filas encontradas en youapp_index: ${data?.length || 0}`);
  const detection = exactWorkSearchGate.detectExactWork('osvaldo pugliese');
  console.log('Detection para "osvaldo pugliese":', {
    baseIntent: detection.baseIntent,
    detectionType: detection.detectionType,
    canonicalEntity: detection.canonicalEntity
  });

  data?.forEach((r, i) => {
    const item: any = {
      id: r.id,
      provider: r.provider,
      title: r.title,
      description: r.description,
      creator: r.creator_name,
      durationSeconds: r.duration_seconds,
      qualityScore: r.quality_score ?? 80,
      relevanceScore: r.relevance_score ?? 80,
      contentRole: r.content_role
    };

    const af = exactWorkSearchGate.calculateArtistFidelity(item, detection);
    const wf = exactWorkSearchGate.calculateWorkFidelity(item, detection);
    const role = exactWorkSearchGate.classifyContentRole(item, detection);
    const objType = exactWorkSearchGate.detectObjectType(item, role);
    const directPerf = exactWorkSearchGate.isDirectPerformance(item, role);

    console.log(`\n[${i + 1}] ProviderID: [${r.provider}:${r.provider_content_id}]`);
    console.log(`    Title: "${r.title}"`);
    console.log(`    Creator: "${r.creator_name}"`);
    console.log(`    Description: "${r.description || ''}"`);
    console.log(`    ExistsInAtlas: true`);
    console.log(`    Duration: ${r.duration_seconds}s`);
    console.log(`    Quality: ${item.qualityScore}`);
    console.log(`    Relevance: ${item.relevanceScore}`);
    console.log(`    EntityFidelity (AF): ${af}`);
    console.log(`    WorkFidelity (WF): ${wf}`);
    console.log(`    ContentRole: ${role}`);
    console.log(`    ObjectType: ${objType}`);
    console.log(`    DirectPerformance: ${directPerf}`);

    const colonDetection = exactWorkSearchGate.detectExactWork('osvaldo pugliese en el colon');
    const vf = exactWorkSearchGate.calculateVenueFidelity(item, colonDetection);
    console.log(`    VenueFidelity for 'Teatro Colón': ${vf}`);
  });
}

main().catch(console.error);
