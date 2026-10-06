import fs from 'fs';
import { SemanticSignalProposer } from '../src/social/SemanticSignalProposer.js';

async function runQA3Holdout() {
    console.log('ATLAS — PHASE 10B.5-QA3: UNSEEN HOLDOUT BENCHMARK\n');
    console.log('Model Baseline: gemini-3.6-flash');
    console.log('Prompt Version: qa2_semantic_v1');
    console.log('Evaluated at: ' + new Date().toISOString() + '\n');

    const casesRaw = fs.readFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/holdout_cases.json', 'utf8');
    const cases = JSON.parse(casesRaw);

    const labelsRaw = fs.readFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/holdout_labels.json', 'utf8');
    const goldLabels = JSON.parse(labelsRaw);

    const proposer = new SemanticSignalProposer();
    
    let tp = 0, fp = 0, tn = 0, fn = 0;
    let sem_tp = 0, sem_fp = 0, sem_tn = 0, sem_fn = 0;
    
    // Operational tracking
    let entityResolved = 0;
    let evidenceAccepted = 0;
    let temporalValid = 0;
    let operationallyConfirmed = 0;
    
    let semanticPositives = 0;
    
    let disagreements = [];

    for (const c of cases) {
        const output = await proposer.evaluate({
            candidate_signal_type: 'EXPANSION',
            channel_name: c.channel,
            published_at: new Date().toISOString(),
            title: c.title,
            description_excerpt: c.desc
        });

        // Semantic Evaluation
        const semanticallyPositive = output.is_opportunity && !output.negated && (output.assertion_mode === 'FACT' || output.assertion_mode === 'PLAN' || output.assertion_mode === 'NEWS_REPORT') && (output.temporal_state === 'CURRENT' || output.temporal_state === 'FUTURE');

        // Operational evaluation
        let rejectReason = '';
        const fullText = (c.title + ' ' + c.desc).toLowerCase();
        if (!fullText.includes(output.supporting_span.toLowerCase())) {
            rejectReason = 'EVIDENCE_SPAN_INVALID';
        } else {
            evidenceAccepted++;
        }

        let resolutionStatus = 'UNRESOLVED';
        if (output.subject_is_channel_owner) {
            resolutionStatus = 'RESOLVED';
            entityResolved++;
        }

        if (output.temporal_state !== 'STALE' && output.temporal_state !== 'UNKNOWN') {
            temporalValid++;
        }

        let prediction = 'OBSERVED';
        if (semanticallyPositive && rejectReason === '' && resolutionStatus === 'RESOLVED') {
            prediction = 'CONFIRMED';
            operationallyConfirmed++;
        }
        
        if (semanticallyPositive) semanticPositives++;

        const goldLabel = goldLabels[c.id].label;
        const isGoldPositive = goldLabel === 'TRUE_POSITIVE';

        // Metrics
        if (isGoldPositive && semanticallyPositive) sem_tp++;
        if (!isGoldPositive && semanticallyPositive) sem_fp++;
        if (!isGoldPositive && !semanticallyPositive) sem_tn++;
        if (isGoldPositive && !semanticallyPositive) sem_fn++;

        // Operational overall
        const operationalPositive = prediction === 'CONFIRMED';
        if (isGoldPositive && operationalPositive) tp++;
        if (!isGoldPositive && operationalPositive) fp++;
        if (!isGoldPositive && !operationalPositive) tn++;
        if (isGoldPositive && !operationalPositive) fn++;

        // Disagreements
        if ((isGoldPositive && !semanticallyPositive) || (!isGoldPositive && semanticallyPositive)) {
            disagreements.push({
                case: c,
                gold: goldLabel,
                semanticPred: semanticallyPositive ? 'POSITIVE' : 'NEGATIVE',
                reason: `is_opp: ${output.is_opportunity}, mode: ${output.assertion_mode}, negated: ${output.negated}`
            });
        }
    }

    const calcPrec = (trueP: number, falseP: number) => trueP + falseP === 0 ? 0 : trueP / (trueP + falseP);
    const calcRec = (trueP: number, falseN: number) => trueP + falseN === 0 ? 0 : trueP / (trueP + falseN);
    const calcF1 = (prec: number, rec: number) => prec + rec === 0 ? 0 : 2 * (prec * rec) / (prec + rec);

    const semPrec = calcPrec(sem_tp, sem_fp);
    const semRec = calcRec(sem_tp, sem_fn);
    const semF1 = calcF1(semPrec, semRec);

    console.log('--- SEMANTIC QUALITY ---');
    console.log(`TP: ${sem_tp} | FP: ${sem_fp} | TN: ${sem_tn} | FN: ${sem_fn}`);
    console.log(`Precision: ${(semPrec * 100).toFixed(1)}%`);
    console.log(`Recall:    ${(semRec * 100).toFixed(1)}%`);
    console.log(`F1 Score:  ${(semF1 * 100).toFixed(1)}%\n`);
    
    console.log('--- OPERATIONAL CONFIRMATION ---');
    console.log(`Entity Resolved: ${(entityResolved / cases.length * 100).toFixed(1)}%`);
    console.log(`Evidence Accepted: ${(evidenceAccepted / cases.length * 100).toFixed(1)}%`);
    console.log(`Temporal Valid: ${(temporalValid / cases.length * 100).toFixed(1)}%`);
    console.log(`Operationally Confirmed: ${(operationallyConfirmed / semanticPositives * 100).toFixed(1)}% (of semantic positives)\n`);

    console.log('--- DISAGREEMENTS FOR HUMAN REVIEW ---');
    if (disagreements.length === 0) console.log('None.');
    for (const d of disagreements) {
        console.log(`[${d.case.id}] ${d.case.channel} - ${d.case.title}`);
        console.log(`Gold: ${d.gold} | AI: ${d.semanticPred} | Details: ${d.reason}\n`);
    }

}

runQA3Holdout().catch(console.error);
