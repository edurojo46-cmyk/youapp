import fs from 'fs';
import crypto from 'crypto';

const GOLD_PATH = 'phase2c_gold_pilot.json';
const PREDS_PATH = 'phase2c_atlas_predictions_50_v1.json';

function runBenchmark() {
    const goldData = JSON.parse(fs.readFileSync(GOLD_PATH, 'utf-8'));
    const predsData = JSON.parse(fs.readFileSync(PREDS_PATH, 'utf-8'));
    
    let exactMatches = 0;
    const totalAssets = goldData.labels.length;
    
    // Accuracies
    let entityCorrect = 0, workCorrect = 0, venueCorrect = 0;
    let typeCorrect = 0, modeCorrect = 0, roleCorrect = 0, primaryCorrect = 0;
    
    // Abstention
    let abstentionTotal = 0;
    let abstentionCorrect = 0;
    
    // Leakage
    let mentionToPrimaryLeakage = 0;
    
    // High Confidence Errors
    let highConfErrors = 0;
    
    const predsMap = new Map();
    for (const p of predsData.predictions) predsMap.set(p.asset_id, p);
    
    for (const gold of goldData.labels) {
        const pred = predsMap.get(gold.asset_id);
        if (!pred) continue;
        
        let allMatch = true;
        
        const isEntityMatch = gold.expected_entity_id === pred.prediction_entity_id;
        const isWorkMatch = gold.expected_work_id === pred.prediction_work_id;
        const isVenueMatch = gold.expected_venue_id === pred.prediction_venue_id;
        const isTypeMatch = gold.expected_content_type === pred.prediction_content_type;
        const isModeMatch = gold.expected_performance_mode === pred.prediction_performance_mode;
        const isRoleMatch = gold.expected_content_role === pred.prediction_content_role;
        const isPrimaryMatch = gold.expected_primary_identity === pred.prediction_primary_identity;
        
        if (isEntityMatch) entityCorrect++; else allMatch = false;
        if (isWorkMatch) workCorrect++; else allMatch = false;
        if (isVenueMatch) venueCorrect++; else allMatch = false;
        if (isTypeMatch) typeCorrect++; else allMatch = false;
        if (isModeMatch) modeCorrect++; else allMatch = false;
        if (isRoleMatch) roleCorrect++; else allMatch = false;
        if (isPrimaryMatch) primaryCorrect++; else allMatch = false;
        
        if (allMatch) exactMatches++;
        
        // High confidence errors (if not match but conf >= 0.8)
        if (!allMatch) {
            let hasHcError = false;
            if (!isEntityMatch && pred.prediction_confidence.entity >= 0.8) hasHcError = true;
            if (!isWorkMatch && pred.prediction_confidence.work >= 0.8) hasHcError = true;
            if (!isRoleMatch && pred.prediction_confidence.content_role >= 0.8) hasHcError = true;
            if (hasHcError) highConfErrors++;
        }
        
        // Mention to primary leakage: gold role=CONTEXTUAL, pred role=PRIMARY
        if (gold.expected_content_role === 'CONTEXTUAL' && pred.prediction_content_role === 'PRIMARY') {
            mentionToPrimaryLeakage++;
        }
        
        // Abstention accuracy
        const abstainValues = ['UNKNOWN', 'AMBIGUOUS', 'NOT_APPLICABLE'];
        const goldHasAbstention = abstainValues.includes(gold.expected_entity_id) || 
                                  abstainValues.includes(gold.expected_work_id) || 
                                  abstainValues.includes(gold.expected_venue_id);
                                  
        if (goldHasAbstention) {
            abstentionTotal++;
            const predHasAbstention = abstainValues.includes(pred.prediction_entity_id) || 
                                      abstainValues.includes(pred.prediction_work_id) || 
                                      abstainValues.includes(pred.prediction_venue_id);
            if (predHasAbstention) abstentionCorrect++;
        }
    }
    
    console.log("========================================");
    console.log("P2C ATLAS BENCHMARK — RUN A V1");
    console.log("========================================");
    console.log(`Gold Hash:       ${predsData.metadata.gold_hash}`);
    console.log(`Prediction Hash: ${crypto.createHash('sha256').update(fs.readFileSync(PREDS_PATH)).digest('hex')}`);
    console.log(`Assets:          ${totalAssets}`);
    console.log("----------------------------------------");
    
    console.log("FIELD ACCURACIES:");
    console.log(`Entity:             ${((entityCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Work:               ${((workCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Venue:              ${((venueCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Content Type:       ${((typeCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Performance Mode:   ${((modeCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Content Role:       ${((roleCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log(`Primary Identity:   ${((primaryCorrect/totalAssets)*100).toFixed(2)}%`);
    console.log("----------------------------------------");
    
    console.log(`EXACT SEMANTIC MATCH: ${((exactMatches/totalAssets)*100).toFixed(2)}% (${exactMatches}/${totalAssets})`);
    console.log("----------------------------------------");
    
    console.log("CRITICAL METRICS:");
    console.log(`Abstention Accuracy:       ${abstentionTotal > 0 ? ((abstentionCorrect/abstentionTotal)*100).toFixed(2) : 0}% (${abstentionCorrect}/${abstentionTotal})`);
    console.log(`MentionToPrimary Leakage:  ${mentionToPrimaryLeakage}`);
    console.log(`High Confidence Errors:    ${highConfErrors}`);
    console.log("========================================");
}

runBenchmark();
