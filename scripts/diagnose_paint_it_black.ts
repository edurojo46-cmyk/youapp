import { supabase } from '../src/lib/supabase';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { executeSearch } from '../src/lib/search/searchEngine';

async function diagnosePaintItBlack() {
  console.log('🔍 DIAGNOSTIC: PAINT IT BLACK ATLAS PHYSICAL INVENTORY\n');

  // 1. Check all rows in youapp_index matching paint it black
  const { data: rows } = await supabase
    .from('youapp_index')
    .select('id, video_id, provider, provider_content_id, title, creator_name, source, metadata_provenance, content_state')
    .ilike('title', '%paint%black%');

  console.log(`Filas encontradas en youapp_index (%paint%black%): ${rows?.length || 0}`);
  rows?.forEach((r, i) => {
    console.log(` ${i + 1}. [${r.provider}] ID: ${r.provider_content_id || r.video_id} | Title: "${r.title}" | Creator: "${r.creator_name}" | Source: ${r.source} | State: ${r.content_state}`);
  });

  // 2. Test exactWorkSearchGate on these rows
  const detection = exactWorkSearchGate.detectExactWork('rolling stones paint it black');
  console.log('\nDetection:', detection);

  for (const r of (rows || [])) {
    const item: any = {
      id: r.id,
      provider: r.provider,
      providerContentId: r.provider_content_id,
      title: r.title,
      channelTitle: r.creator_name,
      videoUrl: 'https://test',
      durationSeconds: 240
    };
    const wf = exactWorkSearchGate.calculateWorkFidelity(item, detection);
    const af = exactWorkSearchGate.calculateArtistFidelity(item, detection);
    const role = exactWorkSearchGate.classifyContentRole(item, detection);
    console.log(` -> Title: "${r.title.slice(0, 45)}" | Role: ${role} | WF: ${wf} | AF: ${af}`);
  }

  // 3. Test executeSearch query
  console.log('\n3. Testing executeSearch("rolling stones paint it black"):');
  const res = await executeSearch('rolling stones paint it black', { bypassCandidatePool: true });
  console.log(`Path: ${res.trace.path} | Videos returned: ${res.videos?.length || 0}`);
  res.videos?.forEach((v, i) => {
    console.log(` ${i + 1}. [${v.provider}] "${v.title}" | EEW: ${(v as any).isExactEntityWork}`);
  });
}

diagnosePaintItBlack();
