import { executeSearch } from '../src/lib/search/searchEngine';

const queries = [
  'fito paez',
  'los redondos',
  'carlos gardel por una cabeza',
  'queen the march of the black queen',
  'david bowie the laughing gnome',
  'soda stereo texturas',
  'fito paez polaroid de locura ordinaria',
  'fito paez brillante sobre el mic',
  'los redondos recital',
  'spinetta teatro colon',
  'fito paez velez',
  'queen documental',
  'the beatles making of'
];

async function main() {
  console.log('--- SHADOW REPAIR RECOVERY TEST ---');
  let recoveredCount = 0;
  
  for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const benchmarkStartedAt = new Date().toISOString();
    
    // Disable external discovery for speed and purity
    const res = await executeSearch(q, { benchmarkStartedAt, bypassCandidatePool: true, forceExternal: false });
    
    let pass = false;
    let poolCount = 0;

    for (const r of res.all) {
      if (r.id.includes('6bacaa96') || r.providerContentId === '2vWpH4akaL8') {
         console.log(`  [DEBUG] Asset found: quality=${r.qualityScore} relevance=${r.relevanceScore} venueFidelity=${r.semanticMatch?.venueFidelity} constraintMatch=${r.semanticMatch?.isConstraintMatch}`);
      }
      if ((r.qualityScore || 0) >= 60 && (r.relevanceScore || 0) >= 40) {
        if (r.retrievalLane === 'EXACT_STRUCTURED' || r.retrievalLane === 'CANONICAL_ALIAS' || r.retrievalLane === 'ENTITY_CONSTRAINT') {
           pass = true; // Wait, actually we check if they satisfy the gate
        }
        if (r.semanticMatch?.isExactEntityWork || r.semanticMatch?.isConstraintMatch) {
           pass = true;
           poolCount++;
        }
      }
    }
    
    if (pass) {
       console.log(`  Outcome: PASS`);
       recoveredCount++;
    } else {
       console.log(`  Outcome: GAP`);
    }
  }
  console.log(`\nLocalRepairRecoveryRate = ${recoveredCount} / ${queries.length}`);
  process.exit(0);
}

main().catch(console.error);
