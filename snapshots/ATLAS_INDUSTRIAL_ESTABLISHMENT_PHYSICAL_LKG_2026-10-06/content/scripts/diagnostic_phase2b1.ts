import { supabase } from '../src/lib/supabase';
import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { parseQuery } from '../src/lib/search/queryEngine';
import { normalizeSemanticId } from '../src/lib/search/semanticUtils';

const QUERIES = [
    { query: "fito paez polaroid de locura ordinaria", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "fito paez brillante sobre el mic", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "fito paez velez", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "the beatles making of", category: "SEMANTIC_REPAIR_EXPECTED" },
    { query: "charly garcia spinetta", category: "SEMANTIC_NEGATIVE" },
    { query: "fito paez andres calamaro", category: "SEMANTIC_NEGATIVE" },
    { query: "los redondos patricio rey", category: "SEMANTIC_NEGATIVE" },
    { query: "soda stereo cerati", category: "SEMANTIC_NEGATIVE" },
    { query: "spinetta almendra", category: "SEMANTIC_NEGATIVE" },
    { query: "luis alberto spinetta pescado rabioso", category: "SEMANTIC_NEGATIVE" },
    { query: "charly garcia sui generis", category: "SEMANTIC_NEGATIVE" },
    { query: "the beatles paul mccartney", category: "SEMANTIC_NEGATIVE" }
];

async function run() {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    
    console.log("=== PHASE 2B.1 DIAGNOSTIC ===");
    for (const q of QUERIES) {
        console.log(`\n\n--- DIAGNOSING: ${q.query} (${q.category}) ---`);
        const queryObj = await parseQuery(q.query);
        const detection = exactWorkSearchGate.detectExactWork(queryObj.normalizedQuery, queryObj.intentData);
        
        let entityName = detection.canonicalEntity || queryObj.intentData?.resolvedEntity;
        let workTitle = detection.canonicalWork || detection.residualTitle || queryObj.intentData?.resolvedTitle;
        let topic = detection.topic || queryObj.intentData?.topic;
        
        let nEntity = entityName ? normalizeSemanticId(entityName, 'entity') : null;
        if (entityName && entityName.toLowerCase().includes('fito')) nEntity = 'entity_fito_paez';
        if (entityName && entityName.toLowerCase().includes('beatles')) nEntity = 'entity_the_beatles';
        
        let nWork = workTitle ? normalizeSemanticId(workTitle, 'work') : null;
        let nVenue = detection.venue ? normalizeSemanticId(detection.venue, 'venue') : null;
        if (nVenue && nVenue.includes('velez')) nVenue = 'venue_estadio_velez_sarsfield';
        
        // annotation lookup
        let dbFound = false;
        let annRole = 'none';
        let annStatus = 'none';
        let expectedAssetId = 'none';
        let expectedProviderContentId = 'none';
        
        async function fetchProviderId(assetId: string) {
             const { data: yIdx } = await supabase.from('youapp_index').select('provider_content_id, video_id').eq('id', assetId);
             if (yIdx && yIdx.length > 0) {
                 return yIdx[0].provider_content_id || yIdx[0].video_id || assetId;
             }
             return assetId;
        }

        if (nEntity) {
            let req = supabase.from('asset_semantic_annotations').select('*').eq('semantic_entity_id', nEntity);
            if (nWork) req = req.eq('semantic_work_id', nWork);
            if (nVenue) req = req.eq('semantic_venue_id', nVenue);
            const { data } = await req;
            if (data && data.length > 0) {
                dbFound = true;
                annRole = data[0].content_role;
                annStatus = data[0].annotation_status;
                expectedAssetId = data[0].asset_id;
                expectedProviderContentId = await fetchProviderId(expectedAssetId);
            } else if (topic || q.query.includes('making of')) {
                const isMakingOf = q.query.includes('making of');
                const req2 = supabase.from('asset_semantic_annotations').select('*').eq('semantic_entity_id', nEntity);
                const res2 = await req2;
                if (res2.data) {
                    const match = res2.data.find((x: any) => x.content_type === topic || (isMakingOf && x.content_type === 'MAKING_OF'));
                    if (match) {
                        dbFound = true;
                        annRole = match.content_role;
                        annStatus = match.annotation_status;
                        expectedAssetId = match.asset_id;
                        expectedProviderContentId = await fetchProviderId(expectedAssetId);
                    }
                }
            }
        }
        
        // execute search
        const searchRes = await executeSearch(q.query, { forceExternal: true });
        const resolvedIntent = searchRes.intentData || exactWorkSearchGate.detectExactWork(q.query);
        
        const poolExact = searchRes.all.filter((r: any) => 
            r.semanticMatch?.isExactEntityWork || r.isExactEntityWork || 
            r.semanticMatch?.isExactEntityTitle || r.isExactEntityTitle || 
            r.semanticMatch?.isEntityTopic || r.isEntityTopic ||
            r.semanticMatch?.isConstraintMatch || r.isConstraintMatch ||
            r.retrievalLane === 'SEMANTIC_REPAIR'
        );
        
        const semanticFound = poolExact.filter((r: any) => r.retrievalLane === 'SEMANTIC_REPAIR');
        
        const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(resolvedIntent as any, resolvedIntent as any);
        
        let tpfpfntn = '';
        let finalPresent = false;
        let rejectReason = 'none';
        let passedGate = false;
        let foundLane = 'none';
        let semanticMatchStats = 'none';
        let fpAsset = null;
        
        if (q.category === 'SEMANTIC_REPAIR_EXPECTED') {
            if (semanticFound.length > 0) {
                const evalRes = exactWorkSearchGate.evaluateMandatoryGates(semanticFound[0], mandatoryGates);
                passedGate = evalRes.passed;
                rejectReason = evalRes.reason || 'none';
                foundLane = semanticFound[0].retrievalLane;
                semanticMatchStats = JSON.stringify(semanticFound[0].semanticMatch || {});
                if (passedGate) {
                    tp++; tpfpfntn = 'TP'; finalPresent = true;
                } else {
                    fn++; tpfpfntn = 'FN (Gate Failed)';
                }
            } else {
                // Was it found at all?
                const inAll = searchRes.all.find((a: any) => a.id.includes(expectedProviderContentId) || a.retrievalLane === 'SEMANTIC_REPAIR');
                if (inAll) {
                    const evalRes = exactWorkSearchGate.evaluateMandatoryGates(inAll, mandatoryGates);
                    passedGate = evalRes.passed;
                    rejectReason = evalRes.reason || 'none';
                    foundLane = inAll.retrievalLane;
                    semanticMatchStats = JSON.stringify(inAll.semanticMatch || {});
                    fn++; tpfpfntn = `FN (Pool Filtered - lane ${foundLane})`;
                } else {
                    fn++; tpfpfntn = 'FN (Not returned by Engine)';
                }
            }
        } else {
            if (semanticFound.length > 0) {
                const evalRes = exactWorkSearchGate.evaluateMandatoryGates(semanticFound[0], mandatoryGates);
                passedGate = evalRes.passed;
                rejectReason = evalRes.reason || 'none';
                if (passedGate) {
                    fp++; tpfpfntn = 'FP'; finalPresent = true;
                    fpAsset = semanticFound[0];
                } else {
                    tn++; tpfpfntn = 'TN (Gate Failed)';
                }
            } else {
                tn++; tpfpfntn = 'TN';
            }
        }
        
        console.log(`query: ${q.query}`);
        console.log(`expectedAssetId: ${expectedAssetId}`);
        console.log(`normalizedEntityId: ${nEntity}`);
        console.log(`normalizedWorkId: ${nWork}`);
        console.log(`normalizedVenueId: ${nVenue}`);
        console.log(`annotationFoundInDB: ${dbFound}`);
        console.log(`content_role: ${annRole}`);
        console.log(`annotation_status: ${annStatus}`);
        console.log(`retrievalLane: ${foundLane}`);
        console.log(`semanticMatch: ${semanticMatchStats}`);
        console.log(`mandatoryGateAccepted: ${passedGate}`);
        console.log(`mandatoryGateRejectReason: ${rejectReason}`);
        console.log(`finalResultPresent: ${finalPresent}`);
        console.log(`TP/FP/FN/TN: ${tpfpfntn}`);
        
        if (fpAsset) {
            console.log(`\n>>> FALSE POSITIVE DETAILS:`);
            console.log(`Asset ID: ${fpAsset.id}`);
            console.log(`Title: ${fpAsset.title}`);
            console.log(`RetrievalLane: ${fpAsset.retrievalLane}`);
            console.log(`SemanticMatch:`, fpAsset.semanticMatch);
            console.log(`<<< \n`);
        }
    }
    
    console.log("\n=== METRICS ===");
    console.log(`TP: ${tp}, FP: ${fp}, FN: ${fn}, TN: ${tn}`);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
    console.log(`Precision: ${(precision*100).toFixed(2)}%`);
    console.log(`Recall: ${(recall*100).toFixed(2)}%`);
    console.log(`FPR: ${(fpr*100).toFixed(2)}%`);
}

run().catch(console.error);
