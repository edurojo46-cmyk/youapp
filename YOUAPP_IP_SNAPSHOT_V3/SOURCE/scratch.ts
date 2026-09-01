import { executeSearch } from './src/lib/search/searchEngine';
import { parseSignalPrompt } from './src/lib/tv/signalUnderstanding';

async function test() {
  console.log("Parsing prompt...");
  const request = parseSignalPrompt("Una hora sobre Roma y arqueología");
  console.log(JSON.stringify(request.subQueries, null, 2));

  for (const sq of request.subQueries) {
    console.log(`\n=== Testing Subquery: "${sq.query}" ===`);
    try {
      const res = await executeSearch(sq.query, {
        routingMode: 'dynamic',
        queryContext: {
          source: 'tv_signal',
          parentTopic: request.mainTopic,
          intentHint: sq.intentHint as any,
          needsDocumentary: sq.needsDocumentary
        }
      });
      
      const vids = res.videos || res.all.filter(c => c.type !== 'article');
      console.log(`Qualified Videos: ${vids.length}`);
      console.log(`Funnel:`, res.trace.funnel);
      
      if (vids.length > 0) {
        console.log(`Top 2:`, vids.slice(0,2).map(v => `${v.title} (Q:${v.qualityScore} R:${v.relevanceScore} P:${v.provider})`));
      } else {
        console.log("No qualified videos found.");
        // Test reformulation
        const reformulatedQuery = sq.role === 'opening' 
          ? `${request.mainTopic} documental` 
          : `${sq.parentContext} ${sq.query.replace(sq.parentContext, '').trim()}`;
        console.log(`Testing reformulated: "${reformulatedQuery}"`);
        const res2 = await executeSearch(reformulatedQuery, {
          routingMode: 'dynamic',
          queryContext: {
            source: 'tv_signal',
            parentTopic: request.mainTopic,
            intentHint: sq.intentHint as any,
            needsDocumentary: sq.needsDocumentary
          }
        });
        const vids2 = res2.videos || res2.all.filter(c => c.type !== 'article');
        console.log(`Reformulated Qualified Videos: ${vids2.length}`);
        console.log(`Reformulated Funnel:`, res2.trace.funnel);
      }
    } catch (e: any) {
      console.error(e.message);
    }
  }
}

test();
