/**
 * useDirector.ts — Hook para el Director de TV Personalizada (Fase 11)
 *
 * Tres modos:
 *   - makeTV(topic, minutes)          → Programación sobre un tema
 *   - timeBlock(minutes, topics)      → Qué ver en X minutos
 *   - mySignal(slots)                 → Mi Señal personal
 */

import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ScheduleBlock {
  video_id: string;
  title: string;
  provider: string;
  embed_url: string;
  thumbnail_url?: string;
  creator_name?: string;
  duration_seconds: number;
  duration_label: string;
  start_minute: number;
  end_minute: number;
  quality_score: number;
}

export interface TVProgram {
  title: string;
  description: string;
  blocks: ScheduleBlock[];
  total_minutes: number;
}

export interface TimeBlockResult {
  suggestion: string;
  blocks: ScheduleBlock[];
  total_minutes: number;
}

export interface MySignalResult {
  signal_name: string;
  blocks: ScheduleBlock[];
  total_minutes: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDirector() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const invoke = useCallback(async (action: string, params: object) => {
    setLoading(true);
    setError(undefined);
    try {
      const { data, error: fnError } = await (supabase.functions as any).invoke('director', {
        body: { action, ...params }
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || `Director ${action} failed`);
      setLoading(false);
      return data.result;
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
      return null;
    }
  }, []);

  // "Haceme una TV" sobre un tema
  const makeTV = useCallback((
    topic: string,
    duration_minutes = 60,
    language = 'es'
  ): Promise<TVProgram | null> => {
    return invoke('make_tv', { topic, duration_minutes, language });
  }, [invoke]);

  // "Tengo X minutos, qué veo"
  const timeBlock = useCallback((
    available_minutes: number,
    preferred_topics: string[] = []
  ): Promise<TimeBlockResult | null> => {
    return invoke('time_block', { duration_minutes: available_minutes, preferred_topics });
  }, [invoke]);

  // "Mi Señal" — programación personalizada
  const mySignal = useCallback((slots = 5): Promise<MySignalResult | null> => {
    return invoke('my_signal', { slots });
  }, [invoke]);

  return { makeTV, timeBlock, mySignal, loading, error };
}
