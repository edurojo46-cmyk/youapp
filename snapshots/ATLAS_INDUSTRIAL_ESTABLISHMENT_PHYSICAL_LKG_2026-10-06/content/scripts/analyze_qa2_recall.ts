import fs from 'fs';
import dotenv from 'dotenv';
import { SemanticSignalProposer } from '../src/social/SemanticSignalProposer.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

function getGoldLabel(channel: string, text: string): 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'WRONG_ENTITY' | 'STALE' | 'AMBIGUOUS' {
    const lowerChannel = channel.toLowerCase();
    const lowerText = text.toLowerCase();
    
    if (lowerChannel.includes('expansión') || lowerChannel.includes('eltrece') || lowerChannel.includes('tv') || lowerChannel.includes('press') || lowerChannel.includes('vision') || lowerChannel.includes('canal') || lowerChannel.includes('tesla')) {
        return 'WRONG_ENTITY';
    }
    if (lowerText.includes('cómo') || lowerText.includes('cuánto') || lowerText.includes('lecciones') || lowerText.includes('tips')) {
        return 'FALSE_POSITIVE';
    }
    if (lowerText.includes('hace un año')) {
        return 'STALE';
    }
    if (lowerChannel.includes('alex') || lowerChannel.includes('laura') || lowerChannel.includes('kenyi') || lowerChannel.includes('ruzzarin') || lowerChannel.includes('somos del rancho') || lowerChannel.includes('destino tolk') || lowerChannel.includes('archgroup')) {
        return 'FALSE_POSITIVE';
    }
    if (lowerChannel.includes('gobierno') || lowerChannel.includes('municipalidad') || lowerChannel.includes('puratos')) {
        return 'TRUE_POSITIVE'; 
    }
    return 'TRUE_POSITIVE';
}

async function analyzeQA2Recall() {
    console.log('ATLAS — PHASE 10B.5-QA3: RECALL ANALYSIS (Original 58 Cases)\n');

    const dataRaw = fs.readFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/extracted_signals.json', 'utf8');
    const rawSignals = JSON.parse(dataRaw);
    const signalMap = new Map();
    for (const s of rawSignals) {
        signalMap.set(s.id, {
            channel: s.evidence[0].content.profile.handle,
            title: s.evidence[0].content.text_excerpt.split('|')[0] || '',
            desc: s.evidence[0].content.text_excerpt.split('|')[1] || ''
        });
    }

    let tp = 0, fp = 0, tn = 0, fn = 0;
    let sem_tp = 0, sem_fp = 0, sem_tn = 0, sem_fn = 0;

    let fnAnalysis = {
        MODEL_MISS: 0,
        ENTITY_UNRESOLVED: 0,
        SUPPORTING_SPAN_GATE: 0,
        ASSERTION_MODE: 0,
        TEMPORAL_UNKNOWN: 0,
        OTHER: 0
    };

    console.log(`Analyzing ${rawSignals.length} evaluations...\n`);

    let evals: any[] = [];
    const proposer = new SemanticSignalProposer();

    for (const raw of rawSignals) {
        const channel = raw.evidence[0].content.profile.handle.toLowerCase();
        const text = raw.evidence[0].content.text_excerpt.toLowerCase();
        const title = text.split('|')[0] || '';
        const desc = text.split('|')[1] || '';

        const output = await proposer.evaluate({
            candidate_signal_type: raw.signal_type,
            channel_name: channel,
            published_at: raw.evidence[0].content.published_at,
            title: title,
            description_excerpt: desc.substring(0, 500)
        });

        // 1. Supporting span validation
        let rejectReason = '';
        const fullText = (title + ' ' + desc).toLowerCase();
        if (!fullText.includes(output.supporting_span.toLowerCase())) {
            rejectReason = 'EVIDENCE_SPAN_INVALID';
        }

        let resolutionStatus = 'UNRESOLVED';
        if (output.subject_is_channel_owner) {
            resolutionStatus = 'RESOLVED';
        } else if (output.source_relation === 'THIRD_PARTY_REPORT') {
            resolutionStatus = 'UNRESOLVED';
        }

        let prediction = 'OBSERVED';
        if (output.is_opportunity && !output.negated && (output.assertion_mode === 'FACT' || output.assertion_mode === 'PLAN' || output.assertion_mode === 'NEWS_REPORT') && output.temporal_state !== 'STALE' && rejectReason === '' && resolutionStatus === 'RESOLVED') {
            prediction = 'CONFIRMED';
        }

        evals.push({
            signal_id: raw.id,
            is_opportunity: output.is_opportunity,
            assertion_mode: output.assertion_mode,
            negated: output.negated,
            temporal_state: output.temporal_state,
            subject_resolution_status: resolutionStatus,
            semantic_rejection_reason: rejectReason,
            prediction: prediction
        });
    }

    for (const ev of evals) {
        const raw = signalMap.get(ev.signal_id);
        if (!raw) continue;
        
        const text = (raw.desc + ' ' + raw.title).toLowerCase();
        const goldLabel = getGoldLabel(raw.channel, text);
        const isGoldPositive = goldLabel === 'TRUE_POSITIVE';

        // 1. SEMANTIC QUALITY
        const semanticallyPositive = ev.is_opportunity && ev.negated === false && (ev.assertion_mode === 'FACT' || ev.assertion_mode === 'PLAN' || ev.assertion_mode === 'NEWS_REPORT') && (ev.temporal_state === 'CURRENT' || ev.temporal_state === 'FUTURE');

        if (isGoldPositive && semanticallyPositive) sem_tp++;
        if (!isGoldPositive && semanticallyPositive) sem_fp++;
        if (!isGoldPositive && !semanticallyPositive) sem_tn++;
        if (isGoldPositive && !semanticallyPositive) {
            sem_fn++;
            if (!ev.is_opportunity) fnAnalysis.MODEL_MISS++;
            else if (ev.assertion_mode !== 'FACT' && ev.assertion_mode !== 'PLAN' && ev.assertion_mode !== 'NEWS_REPORT') fnAnalysis.ASSERTION_MODE++;
            else if (ev.temporal_state === 'UNKNOWN') fnAnalysis.TEMPORAL_UNKNOWN++;
            else fnAnalysis.OTHER++;
        }

        // 2. OPERATIONAL CONFIRMATION
        const operationalPositive = ev.prediction === 'CONFIRMED';
        
        if (isGoldPositive && operationalPositive) tp++;
        if (!isGoldPositive && operationalPositive) fp++;
        if (!isGoldPositive && !operationalPositive) tn++;
        if (isGoldPositive && !operationalPositive) {
            fn++;
            if (semanticallyPositive) {
                if (ev.subject_resolution_status === 'UNRESOLVED') fnAnalysis.ENTITY_UNRESOLVED++;
                else if (ev.semantic_rejection_reason === 'EVIDENCE_SPAN_INVALID') fnAnalysis.SUPPORTING_SPAN_GATE++;
                else fnAnalysis.OTHER++;
            }
        }
    }

    const calcPrec = (trueP: number, falseP: number) => trueP + falseP === 0 ? 0 : trueP / (trueP + falseP);
    const calcRec = (trueP: number, falseN: number) => trueP + falseN === 0 ? 0 : trueP / (trueP + falseN);
    const calcF1 = (prec: number, rec: number) => prec + rec === 0 ? 0 : 2 * (prec * rec) / (prec + rec);

    const semPrec = calcPrec(sem_tp, sem_fp);
    const semRec = calcRec(sem_tp, sem_fn);
    const semF1 = calcF1(semPrec, semRec);

    const opPrec = calcPrec(tp, fp);
    const opRec = calcRec(tp, fn);
    const opF1 = calcF1(opPrec, opRec);
    const opSpec = (tn + fp) === 0 ? 0 : tn / (tn + fp);

    console.log('--- 1. SEMANTIC QUALITY ---');
    console.log(`TP: ${sem_tp} | FP: ${sem_fp} | TN: ${sem_tn} | FN: ${sem_fn}`);
    console.log(`Precision: ${(semPrec * 100).toFixed(1)}%`);
    console.log(`Recall:    ${(semRec * 100).toFixed(1)}%`);
    console.log(`F1 Score:  ${(semF1 * 100).toFixed(1)}%\n`);

    console.log('--- 2. OPERATIONAL CONFIRMATION ---');
    console.log(`TP: ${tp} | FP: ${fp} | TN: ${tn} | FN: ${fn}`);
    console.log(`Precision: ${(opPrec * 100).toFixed(1)}%`);
    console.log(`Recall:    ${(opRec * 100).toFixed(1)}%`);
    console.log(`F1 Score:  ${(opF1 * 100).toFixed(1)}%`);
    console.log(`Specificity:${(opSpec * 100).toFixed(1)}%\n`);

    console.log('--- FALSE NEGATIVE AUDIT (Operational) ---');
    console.log(`Total FN: ${fn}`);
    console.log(`- MODEL_MISS (Semantic failure): ${fnAnalysis.MODEL_MISS}`);
    console.log(`- ASSERTION_MODE (Semantic rejection): ${fnAnalysis.ASSERTION_MODE}`);
    console.log(`- TEMPORAL_UNKNOWN (Semantic rejection): ${fnAnalysis.TEMPORAL_UNKNOWN}`);
    console.log(`- ENTITY_UNRESOLVED (Operational rejection): ${fnAnalysis.ENTITY_UNRESOLVED}`);
    console.log(`- SUPPORTING_SPAN_GATE (Operational rejection): ${fnAnalysis.SUPPORTING_SPAN_GATE}`);
    console.log(`- OTHER: ${fnAnalysis.OTHER}\n`);
}

analyzeQA2Recall().catch(console.error);
