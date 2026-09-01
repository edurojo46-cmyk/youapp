import { describe, it, expect, beforeAll } from 'vitest';
import { supabase } from './src/lib/supabase';
import { requestSemanticAnalysis } from './src/lib/moments/momentEngine';
import type { PlaybackItem } from './src/lib/player/playerTypes';

describe('YOU4 Semantic V2 - QA', () => {
  const videos = [
    {
      label: 'Documental / Programa (20-60 min)',
      id: 'M9r5tSfHNqM', // Navarro 54 mins
      durationSec: 3249,
    },
    {
      label: 'Tutorial / Analisis (10-30 min)',
      id: '5018BSt7dp4', // The BIG podcast
      durationSec: 1500, // roughly
    },
    {
      label: 'Entrevista / Noticias (10-60 min)',
      id: 'o1wclWvwpzM', // MILENIO 
      durationSec: 2000,
    },
    {
      label: 'Video Corto (3-6 min)',
      id: 'PpyfSZb0ck8', // AI Matrix Canva
      durationSec: 400,
    }
  ];

  beforeAll(async () => {
    // Ensure all videos exist in youapp_index to satisfy foreign keys and test requirements
    for (const v of videos) {
      await supabase.from('youapp_index').upsert({
        id: `yt_${v.id}`,
        provider: 'youtube',
        provider_content_id: v.id,
        title: `Test Video ${v.id}`,
        description: `Description for ${v.id}`,
        duration_seconds: v.durationSec,
        published_at: new Date().toISOString()
      }, { onConflict: 'provider,provider_content_id' });
    }
    
    // Clear previous jobs and moments for clean tests
    await supabase.from('video_analysis_jobs').delete().neq('content_key', 'dummy');
    await supabase.from('video_moments').delete().neq('content_key', 'dummy');
  });

  for (const v of videos) {
    it(`Should analyze and segment: ${v.label}`, async () => {
      const item: PlaybackItem = {
        id: `yt_${v.id}`,
        provider: 'youtube',
        providerContentId: v.id,
        title: `Test Video ${v.id}`,
        durationSec: v.durationSec,
        type: 'video',
        url: ''
      };

      // 1. Race A -> B: trigger two simultaneously
      const reqA = requestSemanticAnalysis(item);
      const reqB = requestSemanticAnalysis(item);

      const [resA, resB] = await Promise.all([reqA, reqB]);

      // Both might return the result if they poll, but at least one should succeed
      const successfulRes = resA || resB;
      expect(successfulRes, 'One of the requests should return moments').not.toBeNull();
      
      const { moments, summary } = successfulRes!;
      
      // Validaciones de Contenido
      expect(moments.length).toBe(4);
      expect(summary).toBeTruthy();

      let lastEnd = -1;
      const seenTitles = new Set();
      
      moments.forEach((m, idx) => {
        // Título y resumen válidos
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.summary.length).toBeGreaterThan(0);
        expect(seenTitles.has(m.title)).toBe(false);
        seenTitles.add(m.title);

        // Timestamps válidos y precisos (seek preciso)
        expect(m.startSec).toBeGreaterThanOrEqual(0);
        expect(m.endSec).toBeGreaterThan(m.startSec);
        
        // Orden temporal
        expect(m.startSec).toBeGreaterThan(lastEnd - 5); // Allowing small overlap if any, but strictly ordered
        lastEnd = m.endSec;
      });

      // Validaciones de Infraestructura: Cache segundo acceso
      const startTime = Date.now();
      const cachedRes = await requestSemanticAnalysis(item);
      const elapsed = Date.now() - startTime;
      
      expect(cachedRes).not.toBeNull();
      expect(cachedRes?.moments.length).toBe(4);
      // Gemini calls segunda vez = 0 (Debe responder muy rápido de la BD)
      expect(elapsed).toBeLessThan(3000); 

      // videoSummary -> Atlas
      const { data: indexData } = await supabase
        .from('youapp_index')
        .select('description')
        .eq('provider_content_id', v.id)
        .single();
      
      expect(indexData?.description).toContain('[YOUAPP_SUMMARY]');
    }, 60000); // 60s timeout per test
  }
});
