import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { supabase } from '../src/lib/supabase';

async function checkQuerySources(query: string) {
  console.log(`\n========================================`);
  console.log(`AUDIT SOURCE FOR: "${query}"`);
  console.log(`========================================`);

  const detection = exactWorkSearchGate.detectExactWork(query);
  const resolvedIntent = exactWorkSearchGate.toResolvedIntent(detection, 'AUTOCOMPLETE_SELECTION');

  const res = await executeSearch(query, {
    resolvedIntent,
    excludeProviders: ['youtube-radar']
  });

  const items = res.all || [];
  console.log(`Total items returned: ${items.length}`);

  const byProvider: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  items.forEach((c, i) => {
    const prov = c.provider || 'unknown';
    const src = (c as any).retrievalSource || (c as any).source || (c.provider === 'atlas' || (c as any).isLocal ? 'atlas' : 'federated');
    byProvider[prov] = (byProvider[prov] || 0) + 1;
    bySource[src] = (bySource[src] || 0) + 1;

    if (i < 5) {
      console.log(`  [${i + 1}] [${c.provider}] (source: ${src}) "${c.title}"`);
    }
  });

  console.log('By Provider:', byProvider);
  console.log('By Source:', bySource);
}

async function main() {
  await checkQuerySources('queen wembley');
  await checkQuerySources('ricky martin a medio vivir');
  await checkQuerySources('osvaldo pugliese en el colon');
}

main().catch(console.error);
