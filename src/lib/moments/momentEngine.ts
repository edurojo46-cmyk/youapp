import { supabase } from '../supabase';
import type { PlaybackItem } from '../player/playerTypes';
import type { VideoMoment } from './momentTypes';

export async function getMomentsForVideo(item: PlaybackItem): Promise<{ moments: VideoMoment[]; isFallback: boolean }> {
  const contentKey = `${item.provider}:${item.providerContentId}`;
  try {
    // 1. Try to fetch analyzed moments from Supabase
    // Only fetch those that are analyzed with the current version
    const { data, error } = await supabase
      .from('video_moments')
      .select('*')
      .eq('content_key', contentKey)
      .eq('analysis_version', 'you4_semantic_v1')
      .order('start_sec', { ascending: true })
      .limit(4);

    if (!error && data && data.length === 4) {
      return {
        moments: data.map(m => ({
          id: m.id,
          contentKey: m.content_key,
          startSec: m.start_sec,
          endSec: m.end_sec || m.start_sec + 60,
          title: m.title,
          summary: m.summary || '',
          type: m.moment_type as any || 'key_point',
          confidence: m.confidence,
          source: m.source as any
        })),
        isFallback: false
      };
    }
  } catch (err) {
    console.error('[Moments Engine] Unexpected error, generating fallback', err);
  }

  // 2. Generate local fallback moments
  return {
    moments: generateFallbackMoments(item.durationSec || 0, contentKey),
    isFallback: true
  };
}

export async function requestSemanticAnalysis(item: PlaybackItem): Promise<VideoMoment[] | null> {
  // Gate: don't analyze very short videos (< 180s)
  try {
    const { data: indexData } = await supabase
      .from('youapp_index')
      .select('title, description, duration_seconds')
      .eq('provider_content_id', item.providerContentId)
      .eq('provider', item.provider)
      .maybeSingle();

    if (!indexData) return null;
    
    if (indexData.duration_seconds && indexData.duration_seconds < 180) {
      console.log('[Moments Engine] Video too short for semantic analysis, skipping.');
      return null;
    }

    const response = await supabase.functions.invoke('ai-gateway', {
      body: {
        action: 'you4_moments',
        provider: item.provider,
        providerContentId: item.providerContentId,
        videoUrl: `https://www.youtube.com/watch?v=${item.providerContentId}`,
        title: indexData.title,
        description: indexData.description,
        durationSec: indexData.duration_seconds
      }
    });

    if (response.error || response.data?.error) {
      console.log('[Moments Engine] Analysis failed:', response.error || response.data);
      return null;
    }

    const contentKey = `${item.provider}:${item.providerContentId}`;

    if (response.data?.status === 'running') {
      console.log('[Moments Engine] Analysis pending, polling for completion...');
      // Poll up to 15 times (30 seconds total) waiting for background job to finish
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const { data } = await supabase
          .from('video_moments')
          .select('*')
          .eq('content_key', contentKey)
          .eq('analysis_version', 'you4_semantic_v1')
          .order('start_sec', { ascending: true })
          .limit(4);

        if (data && data.length === 4) {
          return data.map(m => ({
            id: m.id,
            contentKey: m.content_key,
            startSec: m.start_sec,
            endSec: m.end_sec || m.start_sec + 60,
            title: m.title,
            summary: m.summary || '',
            type: m.moment_type as any || 'key_point',
            confidence: m.confidence,
            source: m.source as any
          }));
        }
      }
      return null; // Timed out
    }

    const moments = response.data?.moments;
    if (moments && moments.length === 4) {
      return moments.map((m: any, index: number) => ({
        id: `ai-${contentKey}-${index}`,
        contentKey,
        startSec: m.start_sec,
        endSec: m.end_sec,
        title: m.title,
        summary: m.summary || '',
        type: 'key_point',
        confidence: m.confidence || 100,
        source: 'video_ai'
      }));
    }
    return null;
  } catch (e) {
    console.error('[Moments Engine] Semantic analysis request failed:', e);
    return null;
  }
}

function generateFallbackMoments(durationSec: number, contentKey: string): VideoMoment[] {
  const d = durationSec > 0 ? durationSec : 1200;

  const points = [
    { pct: 0.10, title: 'Inicio', type: 'opening' },
    { pct: 0.35, title: 'Primer recorrido', type: 'key_point' },
    { pct: 0.65, title: 'Más adelante', type: 'turning_point' },
    { pct: 0.90, title: 'Tramo final', type: 'closing' }
  ];

  return points.map((p, i) => ({
    id: `fallback-${contentKey}-${i}`,
    contentKey,
    startSec: Math.floor(d * p.pct),
    endSec: Math.floor(d * p.pct) + 60,
    title: p.title,
    summary: '',
    type: p.type as any,
    confidence: 0,
    source: 'fallback'
  }));
}
