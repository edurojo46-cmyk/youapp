import { supabase } from '../src/lib/supabase';
import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

async function testCalle13Diagnosis() {
  console.log('🔍 Diagnosing Calle 13 in youapp_index:');
  const { data, error } = await supabase
    .from('youapp_index')
    .select('id, video_id, provider, provider_content_id, title, creator_name, source, metadata_provenance')
    .ilike('title', '%la perla%');

  console.log(`Filas encontradas con "la perla": ${data?.length || 0}`);
  data?.forEach((r, i) => {
    console.log(` ${i + 1}. [${r.provider}] ID: ${r.provider_content_id} | Title: "${r.title}" | Creator: "${r.creator_name}"`);
  });

  const detection = exactWorkSearchGate.detectExactWork('calle 13 la perla');
  console.log('\nDetection:', detection);

  for (const r of (data || [])) {
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

  console.log('\nTesting SupabaseProvider directly:');
  const { supabaseProvider } = await import('../src/lib/search/providers/supabaseProvider');
  const items = await supabaseProvider.search({ rawQuery: 'calle 13 la perla', normalizedQuery: 'calle 13 la perla' } as any);
  console.log(`SupabaseProvider returned: ${items.length} items:`);
  items.forEach((it, i) => console.log(`   ${i + 1}. [${it.provider}] "${it.title}"`));
}

testCalle13Diagnosis();
