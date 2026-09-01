/**
 * useBrain.ts — Hook para Brain Level 2 (ai-gateway)
 *
 * Expone las tres capacidades del Brain avanzado:
 *   - summary(videoId)        → Resumen inteligente
 *   - you4(videoId, candidates) → 4 recomendaciones contextuales
 *   - askVideo(videoId, question) → Preguntarle al video
 */

import { useState, useCallback } from 'react';
import { supabase } from '../supabase';

// ── Tipos de respuesta ────────────────────────────────────────────────────────

export interface VideoSummary {
  headline: string;
  summary: string;
  keyPoints: string[];
  idealFor: string;
  duration_label: string;
}

export interface You4Recommendation {
  videoId: string;
  reason: string;
}

export interface AskVideoResult {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  disclaimer?: string;
}

export interface BrainState {
  loading: boolean;
  error?: string;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useBrain() {
  const [summaryState, setSummaryState] = useState<BrainState>({ loading: false });
  const [you4State, setYou4State] = useState<BrainState>({ loading: false });
  const [askState, setAskState] = useState<BrainState>({ loading: false });

  // ── 1. Generar resumen de un video ──────────────────────────────────────────
  const getSummary = useCallback(async (videoId: string): Promise<VideoSummary | null> => {
    setSummaryState({ loading: true });
    try {
      const { data, error } = await (supabase.functions as any).invoke('ai-gateway', {
        body: { action: 'summary', video_id: videoId }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Summary failed');

      setSummaryState({ loading: false });
      return data.result as VideoSummary;
    } catch (err: any) {
      setSummaryState({ loading: false, error: err.message });
      return null;
    }
  }, []);

  // ── 2. YOU4 — Recomendaciones contextuales ──────────────────────────────────
  const getYou4 = useCallback(async (
    videoId: string,
    candidateIds?: string[]
  ): Promise<You4Recommendation[]> => {
    setYou4State({ loading: true });
    try {
      const { data, error } = await (supabase.functions as any).invoke('ai-gateway', {
        body: { action: 'you4', video_id: videoId, candidate_ids: candidateIds }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'YOU4 failed');

      setYou4State({ loading: false });
      return data.result as You4Recommendation[];
    } catch (err: any) {
      setYou4State({ loading: false, error: err.message });
      return [];
    }
  }, []);

  // ── 3. Preguntarle al video ─────────────────────────────────────────────────
  const askVideo = useCallback(async (
    videoId: string,
    question: string
  ): Promise<AskVideoResult | null> => {
    if (!question.trim()) return null;
    setAskState({ loading: true });
    try {
      const { data, error } = await (supabase.functions as any).invoke('ai-gateway', {
        body: { action: 'ask_video', video_id: videoId, question }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Ask failed');

      setAskState({ loading: false });
      return data.result as AskVideoResult;
    } catch (err: any) {
      setAskState({ loading: false, error: err.message });
      return null;
    }
  }, []);

  return {
    getSummary,
    summaryLoading: summaryState.loading,
    summaryError: summaryState.error,

    getYou4,
    you4Loading: you4State.loading,
    you4Error: you4State.error,

    askVideo,
    askLoading: askState.loading,
    askError: askState.error,
  };
}
