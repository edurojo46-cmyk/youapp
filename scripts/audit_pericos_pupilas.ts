import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { parseQuery } from '../src/lib/search/queryEngine';
import { retrieveInternalCandidates } from '../src/lib/search/retrievalEngine';
import { DiscoveryGapWorker } from '../src/lib/atlasDiscoveryAI/discoveryGapWorker';
import { supabase } from '../src/lib/supabase';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';

async function main() {
  const rawQuery = 'los pericos pupilas lejanas';
  console.log(`\n======================================================`);
  console.log(`🔍 AUDIT LOG: ${rawQuery}`);
  console.log(`======================================================\n`);

  const detection = exactWorkSearchGate.detectExactWork(rawQuery);
  const query = parseQuery(rawQuery);

  console.log(`ResolvedBaseIntent: ${detection.baseIntent}`);
  console.log(`ResolvedEntity:     ${detection.canonicalEntity || 'none'}`);
  console.log(`ResolvedObject:     ${detection.canonicalWork || detection.residualTitle || 'none'}`);
  console.log(`WorkId/provKey:     ${detection.workId || detection.provisionalTitleKey || 'null'}`);

  const retrieval = await retrieveInternalCandidates(query);
  const candidates = retrieval.candidates;
  console.log(`AtlasRaw:           ${candidates.length}`);

  let entityQualifiedCount = 0;
  let objectQualifiedCount = 0;
  let exactEntityWorkQualifiedCount = 0;

  console.log(`\n--- CANDIDATE INSPECTION ---`);
  const scored = calculateQualityScore(candidates);

  for (const c of scored) {
    const af = exactWorkSearchGate.calculateArtistFidelity(c, detection);
    const wf = exactWorkSearchGate.calculateWorkFidelity(c, detection);
    const tf = exactWorkSearchGate.calculateTitleFidelity(c, detection);
    const role = exactWorkSearchGate.classifyContentRole(c, detection);
    const objType = exactWorkSearchGate.detectObjectType(c, role);
    const qScore = c.qualityScore || 0;
    
    let isEntityQual = af >= 85;
    let isObjQual = wf >= 75 || tf >= 75;
    let isExactQual = isEntityQual && isObjQual;

    if (isEntityQual) entityQualifiedCount++;
    if (isObjQual) objectQualifiedCount++;
    if (isExactQual) exactEntityWorkQualifiedCount++;

    let whyDropped = '';
    if (!isEntityQual) whyDropped += '[WrongEntity] ';
    if (isEntityQual && !isObjQual) whyDropped += '[WrongObject] ';
    if (qScore < 60) whyDropped += '[QualityDrop] ';

    console.log(`\n- title:        "${c.title}"`);
    console.log(`  provider:     ${c.provider} (${c.providerContentId || c.id})`);
    console.log(`  EntityFidelity: ${af}`);
    console.log(`  WorkFidelity:   ${Math.max(wf, tf)}`);
    console.log(`  contentRole:    ${role} (${objType})`);
    console.log(`  qualityScore:   ${qScore}`);
    console.log(`  decision:       ${whyDropped === '' ? 'INCLUDED (Fully Qualified)' : 'DROPPED ' + whyDropped}`);
  }

  console.log(`\n--- COVERAGE SUMMARY ---`);
  console.log(`EntityQualified:          ${entityQualifiedCount}`);
  console.log(`ObjectQualified:          ${objectQualifiedCount}`);
  console.log(`ExactEntityWorkQualified: ${exactEntityWorkQualifiedCount}`);
  
  if (exactEntityWorkQualifiedCount < 6) {
    console.log(`\n🚨 EXACT_ENTITY_WORK COVERAGE GAP DETECTED (<6)`);
    console.log(`\n--- RUNNING LOCAL GAP REPAIR ---`);
    let reclassified = 0;
    let enriched = 0;

    const { data: rows } = await supabase
      .from('youapp_index')
      .select('id, title, creator_name, description')
      .ilike('title', '%pericos%');

    if (rows) {
      for (const r of rows) {
        if (/pupilas/i.test(r.title || '')) {
           const updates: any = {};
           if (!r.creator_name || r.creator_name === 'music' || r.creator_name !== 'Los Pericos') {
              updates.creator_name = 'Los Pericos';
              reclassified++;
           }
           updates.metadata_provenance = 'atlas_gap_repaired';
           enriched++;
           if (Object.keys(updates).length > 0) {
             await supabase.from('youapp_index').update(updates).eq('id', r.id);
           }
        }
      }
    }

    console.log(`existingAssetsReclassified: ${reclassified}`);
    console.log(`existingAssetsEnriched:     ${enriched}`);
    console.log(`exactCoverageBefore:        ${exactEntityWorkQualifiedCount}`);
    
    // Simulate re-run after repair
    const retrievalAfter = await retrieveInternalCandidates(query);
    let exactCoverageAfter = 0;
    for (const c of retrievalAfter.candidates) {
      const af = exactWorkSearchGate.calculateArtistFidelity(c, detection);
      const wf = exactWorkSearchGate.calculateWorkFidelity(c, detection);
      const tf = exactWorkSearchGate.calculateTitleFidelity(c, detection);
      if (af >= 85 && (wf >= 75 || tf >= 75)) exactCoverageAfter++;
    }
    console.log(`exactCoverageAfter:         ${exactCoverageAfter}`);

    if (exactCoverageAfter < 6) {
      console.log(`\n🚀 RUNNING DISCOVERY MISSION (External)`);
      console.log(`Target: Entity = Los Pericos | Work = Pupilas lejanas`);
      console.log(`Constraints: No YouTube Search.list / Radar (0 units)`);
      
      const missionResult = await DiscoveryGapWorker.repairEntityTitleGap('Los Pericos', 'Pupilas lejanas');
      console.log(`\nMission Result:`, JSON.stringify(missionResult, null, 2));
    }
  }
}

main().catch(console.error);
