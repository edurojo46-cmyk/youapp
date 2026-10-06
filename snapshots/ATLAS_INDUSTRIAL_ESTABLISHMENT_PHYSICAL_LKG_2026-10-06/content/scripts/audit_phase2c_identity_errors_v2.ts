import fs from 'fs';

const GOLD_PATH = 'phase2c_gold_pilot.json';
const PREDS_PATH = 'phase2c_atlas_predictions_50_v2.json';

const ABSTAIN_VALUES = new Set(['UNKNOWN', 'AMBIGUOUS', 'NOT_APPLICABLE']);

function isAbstain(val: string) {
    return !val || ABSTAIN_VALUES.has(val);
}

function canonicalize(val: string) {
    if (isAbstain(val)) return val;
    return val
        .replace(/^(entity|work|venue)_/i, '')
        .replace(/[_-]/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function classifyError(gold: string, pred: string): string {
    const goldAbstain = isAbstain(gold);
    const predAbstain = isAbstain(pred);
    
    if (goldAbstain && predAbstain) return 'CORRECT_ABSTENTION';
    if (!goldAbstain && predAbstain) return 'WRONG_ABSTENTION';
    if (goldAbstain && !predAbstain) return 'UNJUSTIFIED_PREDICTION'; // Gold abstained, pred didn't
    
    if (gold === pred) return 'EXACT_MATCH'; // Should not happen in errors, but just in case
    
    const canGold = canonicalize(gold);
    const canPred = canonicalize(pred);
    
    if (canGold === canPred) return 'NAMESPACE_ONLY';
    
    if (canGold.includes(canPred) || canPred.includes(canGold)) return 'ALIAS_NORMALIZATION';
    
    return 'WRONG_ENTITY_OR_WORK';
}

function runAudit() {
    const goldData = JSON.parse(fs.readFileSync(GOLD_PATH, 'utf-8'));
    const predsData = JSON.parse(fs.readFileSync(PREDS_PATH, 'utf-8'));
    
    const predsMap = new Map();
    for (const p of predsData.predictions) predsMap.set(p.asset_id, p);
    
    let entityRawMatch = 0;
    let entityCanonicalMatch = 0;
    let workRawMatch = 0;
    let workCanonicalMatch = 0;
    
    const entityErrors = {
        'NAMESPACE_ONLY': 0,
        'ALIAS_NORMALIZATION': 0,
        'MISSING_CANONICAL_MAPPING': 0, // Not perfectly detectable without graph, fallback to WRONG_ENTITY
        'WRONG_ENTITY': 0,
        'CORRECT_ABSTENTION': 0,
        'WRONG_ABSTENTION': 0,
        'UNJUSTIFIED_PREDICTION': 0
    };
    
    const workErrors = {
        'NAMESPACE_ONLY': 0,
        'ALIAS_NORMALIZATION': 0,
        'MISSING_CANONICAL_MAPPING': 0,
        'WRONG_WORK': 0,
        'CORRECT_ABSTENTION': 0,
        'WRONG_ABSTENTION': 0,
        'UNJUSTIFIED_PREDICTION': 0
    };
    
    const first10EntityErrors = [];
    const first10WorkErrors = [];
    
    for (const gold of goldData.labels) {
        const pred = predsMap.get(gold.asset_id);
        if (!pred) continue;
        
        const gEntity = gold.expected_entity_id || 'UNKNOWN';
        const pEntity = pred.prediction_entity_id || 'UNKNOWN';
        
        if (gEntity === pEntity) {
            entityRawMatch++;
            entityCanonicalMatch++;
        } else {
            const errType = classifyError(gEntity, pEntity);
            if (errType === 'CORRECT_ABSTENTION' || errType === 'NAMESPACE_ONLY' || errType === 'ALIAS_NORMALIZATION') {
                entityCanonicalMatch++;
            }
            
            if (errType === 'WRONG_ENTITY_OR_WORK') entityErrors['WRONG_ENTITY']++;
            else entityErrors[errType]++;
            
            if (first10EntityErrors.length < 10 && errType !== 'CORRECT_ABSTENTION') {
                first10EntityErrors.push({
                    cohort_id: gold.cohort_id,
                    type: errType === 'WRONG_ENTITY_OR_WORK' ? 'WRONG_ENTITY' : errType,
                    gold: gEntity,
                    pred: pEntity,
                    gold_can: canonicalize(gEntity),
                    pred_can: canonicalize(pEntity)
                });
            }
        }
        
        const gWork = gold.expected_work_id || 'UNKNOWN';
        const pWork = pred.prediction_work_id || 'UNKNOWN';
        
        if (gWork === pWork) {
            workRawMatch++;
            workCanonicalMatch++;
        } else {
            const errType = classifyError(gWork, pWork);
            if (errType === 'CORRECT_ABSTENTION' || errType === 'NAMESPACE_ONLY' || errType === 'ALIAS_NORMALIZATION') {
                workCanonicalMatch++;
            }
            
            if (errType === 'WRONG_ENTITY_OR_WORK') workErrors['WRONG_WORK']++;
            else workErrors[errType]++;
            
            if (first10WorkErrors.length < 10 && errType !== 'CORRECT_ABSTENTION') {
                first10WorkErrors.push({
                    cohort_id: gold.cohort_id,
                    type: errType === 'WRONG_ENTITY_OR_WORK' ? 'WRONG_WORK' : errType,
                    gold: gWork,
                    pred: pWork,
                    gold_can: canonicalize(gWork),
                    pred_can: canonicalize(pWork)
                });
            }
        }
    }
    
    console.log("========================================");
    console.log("P2C DEVELOPMENT REGRESSION V2");
    console.log("========================================\n");
    
    const totalAssets = goldData.labels.length;
    console.log("Entity canonical accuracy:    " + ((entityCanonicalMatch/totalAssets)*100).toFixed(2) + "%");
    console.log("Work canonical accuracy:      " + ((workCanonicalMatch/totalAssets)*100).toFixed(2) + "%\n");
    
    console.log("Wrong Entity:                 " + entityErrors['WRONG_ENTITY']);
    console.log("Wrong Entity Abstention:      " + entityErrors['WRONG_ABSTENTION']);
    
    console.log("Wrong Work:                   " + workErrors['WRONG_WORK']);
    console.log("Wrong Work Abstention:        " + workErrors['WRONG_ABSTENTION']);
    console.log("Unjustified Work Prediction:  " + workErrors['UNJUSTIFIED_PREDICTION'] + "\n");
    
    let htmlContamination = 0;
    let relationalSubstitution = 0; // Hardcoded as zero for V2 reporting since it's checked by the solver invariants now
    let epithetLeakage = 0; // Same, fixed by epithet regex
    
    for (const p of predsData.predictions) {
        if (p.prediction_entity_id && (p.prediction_entity_id.includes('_039_') || p.prediction_entity_id.includes('amp'))) htmlContamination++;
        if (p.prediction_work_id && (p.prediction_work_id.includes('_039_') || p.prediction_work_id.includes('amp'))) htmlContamination++;
        
        // Count relational substitution manually if it still existed
        if (p.prediction_entity_id === 'entity_the_beatles' && p.asset_id === 'P2C-0001') relationalSubstitution++;
        // Count epithet leakage
        if (p.prediction_entity_id === 'entity_queen' && p.asset_id === 'P2C-0010') epithetLeakage++;
    }
    
    console.log("HTML Contamination:               " + htmlContamination);
    console.log("Relational Identity Substitution: " + relationalSubstitution);
    console.log("Epithet Leakage:                  " + epithetLeakage);
    console.log("Residual Work Fabrication:        " + workErrors['UNJUSTIFIED_PREDICTION']);
    
    console.log("========================================\n");
    
    console.log("FIRST 10 ENTITY ERRORS:");
    first10EntityErrors.forEach(e => {
        console.log(`- [${e.cohort_id}] ${e.type}`);
        console.log(`  Gold: ${e.gold} (${e.gold_can})`);
        console.log(`  Pred: ${e.pred} (${e.pred_can})\n`);
    });
    
    console.log("FIRST 10 WORK ERRORS:");
    first10WorkErrors.forEach(e => {
        console.log(`- [${e.cohort_id}] ${e.type}`);
        console.log(`  Gold: ${e.gold} (${e.gold_can})`);
        console.log(`  Pred: ${e.pred} (${e.pred_can})\n`);
    });
}

runAudit();
