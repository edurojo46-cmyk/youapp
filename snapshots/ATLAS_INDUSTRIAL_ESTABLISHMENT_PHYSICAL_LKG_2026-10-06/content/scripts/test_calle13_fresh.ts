import { executeSearch } from '../src/lib/search/searchEngine';

async function testCalle13Fresh() {
  const res = await executeSearch('calle 13 la perla', { bypassCandidatePool: true });
  console.log(`Path: ${res.trace.path} | Videos returned: ${res.videos?.length || 0}`);
  res.videos?.forEach((v, i) => {
    console.log(` ${i + 1}. [${v.provider}] "${v.title}" | EEW: ${(v as any).isExactEntityWork}`);
  });
}

testCalle13Fresh();
