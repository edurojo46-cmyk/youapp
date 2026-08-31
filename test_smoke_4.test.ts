import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { generateSchedule } from './src/lib/tv/scheduleGenerator';
import { getDailySummary } from './src/lib/quotaBrain';
import { supabase } from './src/lib/supabase';

describe('Smoke Test 4 - Actualidad', () => {
  it('Programame 30 minutos con las noticias más importantes de inteligencia artificial de hoy', async () => {
    
    // Fetch initial quota metrics
    const quotaBefore = await getDailySummary();
    const searchesUsedBefore = quotaBefore.searches_used;

    const req: TVSignalRequest = {
      prompt: "Programame 30 minutos con las noticias más importantes de inteligencia artificial de hoy.",
      trafficType: 'qa'
    };
    const signal = await generateSchedule(req.prompt, { trafficClass: 'qa' });

    // 2. Extract key metrics
    const totalDurationSec = signal.schedule.reduce((acc, b) => acc + (b.contentItem.durationSeconds || 0), 0);
    const durationTargetSec = signal.understandingRequest?.durationTargetMin ? signal.understandingRequest.durationTargetMin * 60 : 3600;
    const durationCoverage = Math.min(100, Math.round((totalDurationSec / durationTargetSec) * 100));
    const semanticCoverage = Math.round(signal.semanticCoverage || 0);
    const independentCoverage = Math.round(signal.independentSemanticCoverage || 0);
    
    let mocksInjected = 0;
    let vimeoWarning = false;
    let fatalCascade = false;

    // Check trace for providers/mocks
    if (signal.trace?.providerStatuses) {
      if (signal.trace.providerStatuses['vimeo']?.status === 'error') {
        vimeoWarning = true;
      }
    }
    mocksInjected = signal.schedule.filter(b => b.contentItem.provider === 'mock').length;

    // Check Quota Delta
    const quotaAfter = await getDailySummary();
    const searchesUsedAfter = quotaAfter.searches_used;
    const quotaDelta = searchesUsedAfter - searchesUsedBefore;

    // Get Radar details
    const radarDecision = signal.trace?.routerDecisions?.find((d: any) => d.provider === 'youtube');
    const radarPlanned = radarDecision ? radarDecision.shouldActivate : false;
    const radarExecuted = radarPlanned && (signal.trace?.providerStatuses?.['youtube']?.status === 'success' || signal.trace?.providerStatuses?.['youtube']?.status === 'adapter_error' || signal.trace?.providerStatuses?.['youtube']?.status === 'no_results');
    const youtubeItems = signal.trace?.providerStatuses?.['youtube']?.results || 0;
    
    // Print rich report
    console.log(`\n=== TEST 1 — HISTORIA ===\n`);
    console.log(`UNDERSTANDING`);
    console.log(`MainTopic                  ${signal.understandingRequest?.mainTopic}`);
    console.log(`Intent                     ${signal.understandingRequest?.subQueries[0]?.intentHint}\n`);

    console.log(`MESH`);
    console.log(`Independent Coverage       ${independentCoverage}%\n`);

    console.log(`RADAR`);
    console.log(`Planned                    ${radarPlanned ? 'YES' : 'NO'}`);
    console.log(`Executed                   ${radarExecuted ? 'YES' : 'NO'}`);
    if (radarExecuted) {
      console.log(`Items                      ${youtubeItems}`);
      console.log(`Quota consumed             ${quotaDelta}\n`);
    } else {
      console.log('');
    }

    console.log(`FINAL`);
    console.log(`Semantic Coverage          ${semanticCoverage}%`);
    console.log(`Duration Coverage          ${durationCoverage}%\n`);
    
    let qualifiedViolations = 0;
    for (const b of signal.schedule) {
      if ((b.contentItem.qualityScore || 0) < 60 || (b.contentItem.relevanceScore || 0) < 40) {
        console.log(`[VIOLATION] ${b.contentItem.title} - Q:${b.contentItem.qualityScore} R:${b.contentItem.relevanceScore}`);
        qualifiedViolations++;
      }
    }

    console.log(`Qualified violations       ${qualifiedViolations}`);
    console.log(`Mocks                      ${mocksInjected}`);
    console.log(`Vimeo                      ${vimeoWarning ? 'unavailable' : 'OK'}`);
    console.log(`Fatal cascade              ${fatalCascade ? 'YES' : 'NO'}\n`);

    // --- ASSERTIONS ---
    expect(mocksInjected).toBe(0);
    expect(qualifiedViolations).toBe(0);
    
    // Radar expectations
    if (radarPlanned) {
      expect(radarExecuted).toBe(true);
      expect(quotaDelta).toBe(1); // Since radar was planned and executed, it must consume 1 unit
      expect(youtubeItems).toBeGreaterThan(0);
    }
    expect(signal.radarConsumed).toBeLessThanOrEqual(1);

    // Final coverage expectations
    expect(semanticCoverage).toBeGreaterThanOrEqual(80);
    expect(durationCoverage).toBeGreaterThanOrEqual(80);
    
    // Actualidad specific expectations
    const isCurrent = signal.understandingRequest?.subQueries.some(sq => sq.temporal?.intent === 'current' || sq.temporal?.intent === 'recent' || sq.freshness === 'current' || sq.freshness === 'recent' || sq.intentHint === 'NEWS');
    expect(isCurrent).toBe(true);
    
    const publisherItems = signal.schedule.filter(b => b.contentItem.provider === 'publisher' || b.contentItem.type === 'article').length;
    expect(publisherItems).toBe(0); // "artículos NO entran como ScheduleBlock"

    // Database persistence
    await new Promise(r => setTimeout(r, 1500)); // wait for fire-and-forget insert
    const radarItems = signal.schedule.filter(b => b.contentItem.retrievalSource === 'radar');
    for (const item of radarItems) {
      const { data } = await supabase.from('youapp_index').select('content_state').eq('provider_content_id', item.contentItem.providerContentId).single();
      expect(data?.content_state).toBe('discovered');
    }

    console.log(`RESULT                     PASS\n`);
  }, 60000);
});
