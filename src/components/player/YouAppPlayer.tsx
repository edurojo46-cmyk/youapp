import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { PlaybackItem } from '../../lib/player/playerTypes';
import { PlayerController } from '../../lib/player/playerController';
import { logAudienceEvent } from '../../lib/player/telemetry/playerEvents';
import { usePlayerStore, type PlaybackStateType } from '../../store/usePlayerStore';
import { useAtlasAuthStore } from '../../store/atlas/atlasAuthStore';
import { useSignalStore } from '../../lib/tv/signalStore';
import { useWatchContinuityStore, formatWatchTime } from '../../lib/tv/watchContinuityStore';

export interface YouAppPlayerHandle {
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  getDuration(): number;
}

interface YouAppPlayerProps {
  item: PlaybackItem;
  onEnded: () => void;
  onError: (err: any) => void;
  onReady?: (duration: number) => void;
  onPlaybackStateChange?: (state: PlaybackStateType) => void;
}

export const YouAppPlayer = forwardRef<YouAppPlayerHandle, YouAppPlayerProps>(
  ({ item, onEnded, onError, onReady, onPlaybackStateChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<PlayerController | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resumePromptSec, setResumePromptSec] = useState<number | null>(null);
    const pendingAutoSeekRef = useRef<number | null>(null);
    const lastKnownTimeRef = useRef<number>(0);

    const itemRef = useRef(item);
    itemRef.current = item;

    const persistCurrentProgress = (currentTime: number, duration: number, forceImmediate = false) => {
      const curItem = itemRef.current;
      if (!curItem?.blockId) return;
      const userId = useAtlasAuthStore.getState().user?.id;
      const activeSignal = useSignalStore.getState().activeSignal;
      const matchedBlock = activeSignal?.schedule.find((b) => b.id === curItem.blockId);
      const route = typeof window !== 'undefined' ? window.location.pathname : '/mitv';

      useWatchContinuityStore.getState().saveCheckpoint(
        userId,
        {
          signalId: activeSignal?.id || 'default',
          signalName: activeSignal?.name || 'Mi Señal TV',
          blockId: curItem.blockId,
          blockTitle: curItem.title || matchedBlock?.contentItem.title || 'Programa TV',
          topic: matchedBlock?.topic,
          provider: curItem.provider,
          providerContentId: curItem.providerContentId,
          thumbnailUrl:
            matchedBlock?.contentItem.thumbnail ||
            (matchedBlock?.contentItem as any)?.thumbnailUrl,
          route,
          positionSec: currentTime,
          durationSec: duration || curItem.durationSec || matchedBlock?.durationSec || 0
        },
        forceImmediate
      );
    };

    // Store callbacks in refs to avoid effect re-runs
    const callbacksRef = useRef({ onEnded, onError, onReady, onPlaybackStateChange });
    useEffect(() => {
      callbacksRef.current = { onEnded, onError, onReady, onPlaybackStateChange };
    }, [onEnded, onError, onReady, onPlaybackStateChange]);

    useImperativeHandle(ref, () => ({
      async play() {
        await controllerRef.current?.play();
      },
      async pause() {
        await controllerRef.current?.pause('imperative_handle');
      },
      async seek(seconds: number) {
        const actualDuration = controllerRef.current?.getDuration() || 0;
        const safeSeconds = actualDuration > 0 ? Math.min(seconds, actualDuration - 1) : seconds;
        lastKnownTimeRef.current = safeSeconds;
        await controllerRef.current?.seek(safeSeconds);
        persistCurrentProgress(safeSeconds, actualDuration, true);
      },
      async mute() {
        await controllerRef.current?.mute();
        usePlayerStore.getState().setIsMuted(true, true);
      },
      async unmute() {
        await controllerRef.current?.unmute();
        usePlayerStore.getState().setIsMuted(false, true);
      },
      getDuration() {
        return controllerRef.current?.getDuration() || 0;
      }
    }));

    // Sincronizar API y Estado de Bloque al Store
    useEffect(() => {
      usePlayerStore.getState().setPlayerApi({
        play: async () => {
          await controllerRef.current?.play();
        },
        pause: async () => {
          await controllerRef.current?.pause('playerApi');
        },
        seek: async (seconds: number) => {
          const actualDuration = controllerRef.current?.getDuration() || 0;
          const safeSeconds = actualDuration > 0 ? Math.min(seconds, actualDuration - 1) : seconds;
          lastKnownTimeRef.current = safeSeconds;
          await controllerRef.current?.seek(safeSeconds);
          persistCurrentProgress(safeSeconds, actualDuration, true);
        },
        mute: async () => {
          await controllerRef.current?.mute();
          usePlayerStore.getState().setIsMuted(true, true);
        },
        unmute: async () => {
          await controllerRef.current?.unmute();
          usePlayerStore.getState().setIsMuted(false, true);
        },
        getDuration: () => controllerRef.current?.getDuration() || 0,
      });

      return () => {
        usePlayerStore.getState().setPlayerApi(null);
      };
    }, []);

    useEffect(() => {
      usePlayerStore.getState().setCurrentBlock(item);
      usePlayerStore.getState().setIsMuted(Boolean(item.muted));
    }, [item.blockId, item.providerContentId, item.muted]);

    useEffect(() => {
      if (!containerRef.current) return;

      controllerRef.current = new PlayerController(containerRef.current);

      const unsubscribe = controllerRef.current.subscribe((event) => {
        const activeItem = itemRef.current;
        switch (event.type) {
          case 'ready': {
            const dur = controllerRef.current?.getDuration() || 0;
            if (callbacksRef.current.onReady) callbacksRef.current.onReady(dur);
            if (pendingAutoSeekRef.current !== null && pendingAutoSeekRef.current > 2) {
              const targetSec = dur > 0 ? Math.min(pendingAutoSeekRef.current, dur - 1) : pendingAutoSeekRef.current;
              pendingAutoSeekRef.current = null;
              setResumePromptSec(null);
              void controllerRef.current?.seek(targetSec);
              void controllerRef.current?.play();
            }
            break;
          }
          case 'state':
            setIsPlaying(event.state === 'playing');
            usePlayerStore.getState().setPlaybackState(event.state);
            callbacksRef.current.onPlaybackStateChange?.(event.state);
            if (event.state === 'playing') {
              logAudienceEvent({ type: 'block_started', blockId: activeItem.blockId });
            } else if (event.state === 'paused' && lastKnownTimeRef.current >= 5) {
              persistCurrentProgress(
                lastKnownTimeRef.current,
                controllerRef.current?.getDuration() || activeItem.durationSec || 0,
                true
              );
            }
            break;
          case 'ended': {
            const userId = useAtlasAuthStore.getState().user?.id;
            const sigId = useSignalStore.getState().activeSignal?.id;
            useWatchContinuityStore.getState().markCompleted(userId, activeItem.blockId, sigId);
            usePlayerStore.getState().setPlaybackState('ended');
            callbacksRef.current.onPlaybackStateChange?.('ended');
            logAudienceEvent({ type: 'block_completed', blockId: activeItem.blockId });
            callbacksRef.current.onEnded();
            break;
          }
          case 'error':
          case 'unavailable':
            usePlayerStore.getState().setPlaybackState('error');
            callbacksRef.current.onPlaybackStateChange?.('error');
            setError(event.payload?.toString() || 'Playback Error');
            logAudienceEvent({ type: 'playback_error', blockId: activeItem.blockId, payload: event.payload });
            callbacksRef.current.onError(event.payload);
            break;
          case 'progress':
            if (event.payload?.milestone) {
              logAudienceEvent({ type: `${event.payload.milestone}_percent` as any, blockId: activeItem.blockId });
            } else if (event.payload?.currentTime !== undefined) {
              lastKnownTimeRef.current = event.payload.currentTime;
              usePlayerStore.getState().setProgress(event.payload.currentTime, event.payload.duration);
              persistCurrentProgress(event.payload.currentTime, event.payload.duration, false);
            }
            break;
        }
      });

      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (lastKnownTimeRef.current >= 5) {
            persistCurrentProgress(
              lastKnownTimeRef.current,
              controllerRef.current?.getDuration() || itemRef.current?.durationSec || 0,
              true
            );
          }
          controllerRef.current?.pause('visibility_hidden');
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        unsubscribe();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        controllerRef.current?.destroy();
      };
    }, []);

    useEffect(() => {
      if (!item) return;
      setError(null);
      setIsPlaying(false);
      lastKnownTimeRef.current = 0;

      const continuity = useWatchContinuityStore.getState();
      const explicitResume = continuity.consumePendingResume(item.blockId);
      if (explicitResume !== null && explicitResume >= 3) {
        pendingAutoSeekRef.current = explicitResume;
        setResumePromptSec(null);
      } else {
        pendingAutoSeekRef.current = null;
        const userId = useAtlasAuthStore.getState().user?.id;
        const sigId = useSignalStore.getState().activeSignal?.id;
        const saved = continuity.getCheckpointForBlock(userId, item.blockId, sigId);
        if (saved && saved.positionSec >= 8) {
          setResumePromptSec(saved.positionSec);
        } else {
          setResumePromptSec(null);
        }
      }

      controllerRef.current?.load(item);
    }, [item.blockId, item.providerContentId, item.playbackUrl]);

    useEffect(() => {
      if (resumePromptSec === null) return;
      const timer = setTimeout(() => setResumePromptSec(null), 14000);
      return () => clearTimeout(timer);
    }, [resumePromptSec]);

    const handleAcceptResumePrompt = async () => {
      if (resumePromptSec === null) return;
      const target = resumePromptSec;
      setResumePromptSec(null);
      const dur = controllerRef.current?.getDuration() || 0;
      const safeTarget = dur > 0 ? Math.min(target, dur - 1) : target;
      await controllerRef.current?.seek(safeTarget);
      await controllerRef.current?.play();
    };

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: 'black', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        />

        {resumePromptSec !== null && !error && (
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 22,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px 7px 13px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(56, 189, 248, 0.55)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              pointerEvents: 'auto'
            }}
          >
            <button
              type="button"
              onClick={() => { void handleAcceptResumePrompt(); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#f8fafc',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span style={{ color: '#38bdf8' }}>▶</span>
              <span>Seguir viendo desde {formatWatchTime(resumePromptSec)}</span>
            </button>
            <button
              type="button"
              aria-label="Cerrar aviso de reanudación"
              onClick={() => setResumePromptSec(null)}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#cbd5e1',
                width: 20,
                height: 20,
                borderRadius: '50%',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', zIndex: 10 }}>
            <p>Error: {typeof error === 'object' ? JSON.stringify(error) : String(error)}</p>
          </div>
        )}
      </div>
    );
  }
);
