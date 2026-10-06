import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { PlaybackItem } from '../../lib/player/playerTypes';
import { PlayerController } from '../../lib/player/playerController';
import { logAudienceEvent } from '../../lib/player/telemetry/playerEvents';
import { usePlayerStore, type PlaybackStateType } from '../../store/usePlayerStore';

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
    
    // Store callbacks in refs to avoid effect re-runs
    const callbacksRef = useRef({ onEnded, onError, onReady, onPlaybackStateChange });
    useEffect(() => {
      callbacksRef.current = { onEnded, onError, onReady, onPlaybackStateChange };
    }, [onEnded, onError, onReady, onPlaybackStateChange]);

    useImperativeHandle(ref, () => ({
      async play() {
        console.log('[YouAppPlayer] PLAY requested');
        await controllerRef.current?.play();
      },
      async pause() {
        console.log('[YouAppPlayer] PAUSE requested');
        await controllerRef.current?.pause('imperative_handle');
      },
      async seek(seconds: number) {
        let actualDuration = controllerRef.current?.getDuration() || 0;
        let safeSeconds = seconds;
        if (actualDuration > 0) {
          safeSeconds = Math.min(seconds, actualDuration - 1);
        }
        await controllerRef.current?.seek(safeSeconds);
      },
      async mute() {
        await controllerRef.current?.mute();
      },
      async unmute() {
        await controllerRef.current?.unmute();
      },
      getDuration() {
        return controllerRef.current?.getDuration() || 0;
      }
    }));

    // Sincronizar API y Estado de Bloque al Store
    useEffect(() => {
      usePlayerStore.getState().setPlayerApi({
        play: async () => {
          console.log('[YouAppPlayer.playerApi] PLAY requested');
          await controllerRef.current?.play();
        },
        pause: async () => {
          console.log('[YouAppPlayer.playerApi] PAUSE requested');
          await controllerRef.current?.pause('playerApi');
        },
        seek: async (seconds: number) => {
          let actualDuration = controllerRef.current?.getDuration() || 0;
          let safeSeconds = seconds;
          if (actualDuration > 0) safeSeconds = Math.min(seconds, actualDuration - 1);
          await controllerRef.current?.seek(safeSeconds);
        },
        mute: async () => { await controllerRef.current?.mute(); },
        unmute: async () => { await controllerRef.current?.unmute(); },
        getDuration: () => controllerRef.current?.getDuration() || 0,
      });

      return () => {
        usePlayerStore.getState().setPlayerApi(null);
      };
    }, []);

    useEffect(() => {
      usePlayerStore.getState().setCurrentBlock(item);
    }, [item.blockId, item.providerContentId]); // avoid object reference infinite loops

  useEffect(() => {
    if (!containerRef.current) return;

    controllerRef.current = new PlayerController(containerRef.current);

    const unsubscribe = controllerRef.current.subscribe((event) => {
      switch (event.type) {
        case 'ready':
          console.log('[YouAppPlayer] READY event received');
          if (callbacksRef.current.onReady) callbacksRef.current.onReady(controllerRef.current?.getDuration() || 0);
          break;
        case 'state':
          console.log('[YouAppPlayer] STATE ->', event.state);
          setIsPlaying(event.state === 'playing');
          usePlayerStore.getState().setPlaybackState(event.state);
          callbacksRef.current.onPlaybackStateChange?.(event.state);
          if (event.state === 'playing') {
            logAudienceEvent({ type: 'block_started', blockId: item.blockId });
          }
          break;
        case 'ended':
          usePlayerStore.getState().setPlaybackState('ended');
          callbacksRef.current.onPlaybackStateChange?.('ended');
          logAudienceEvent({ type: 'block_completed', blockId: item.blockId });
          callbacksRef.current.onEnded();
          break;
        case 'error':
        case 'unavailable':
          usePlayerStore.getState().setPlaybackState('error');
          callbacksRef.current.onPlaybackStateChange?.('error');
          setError(event.payload?.toString() || 'Playback Error');
          logAudienceEvent({ type: 'playback_error', blockId: item.blockId, payload: event.payload });
          callbacksRef.current.onError(event.payload);
          break;
        case 'progress':
          if (event.payload?.milestone) {
            logAudienceEvent({ type: `${event.payload.milestone}_percent` as any, blockId: item.blockId });
          } else if (event.payload?.currentTime !== undefined) {
            usePlayerStore.getState().setProgress(event.payload.currentTime, event.payload.duration);
          }
          break;
      }
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controllerRef.current?.pause('visibility_hidden');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controllerRef.current?.destroy();
    };
  }, []); // Run ONCE on mount, rely on callbacksRef for latest functions

  useEffect(() => {
    if (!item) return;
    setError(null);
    setIsPlaying(false);
    controllerRef.current?.load(item);
  }, [item.blockId]); // load on new block

  const handlePlayPause = () => {
    if (isPlaying) {
      controllerRef.current?.pause();
    } else {
      controllerRef.current?.play();
    }
  };

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: 'black', overflow: 'hidden' }}>
        {/* Video Container */}
        <div 
          ref={containerRef} 
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} 
        />
        
        {/* Error Overlay */}
        {error && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', zIndex: 10 }}>
            <p>Error: {typeof error === 'object' ? JSON.stringify(error) : String(error)}</p>
          </div>
        )}
        
        {/* 
          Player Chrome would go here if we wanted custom play/pause overlay,
          but for V1 we keep the UI clean around the video (OSD in LiveZapping) 
          and let the providers show their own native controls when required.
        */}
      </div>
    );
  }
);
