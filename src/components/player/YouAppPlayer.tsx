import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { PlaybackItem } from '../../lib/player/playerTypes';
import { PlayerController } from '../../lib/player/playerController';
import { logAudienceEvent } from '../../lib/player/telemetry/playerEvents';

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
}

export const YouAppPlayer = forwardRef<YouAppPlayerHandle, YouAppPlayerProps>(
  ({ item, onEnded, onError, onReady }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<PlayerController | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      async play() {
        await controllerRef.current?.play();
      },
      async pause() {
        await controllerRef.current?.pause();
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

  useEffect(() => {
    if (!containerRef.current) return;

    controllerRef.current = new PlayerController(containerRef.current);

    const unsubscribe = controllerRef.current.subscribe((event) => {
      switch (event.type) {
        case 'ready':
          // Auto-play is handled natively by the provider's autoplay: 1 parameter.
          // Manually calling play() here immediately causes postMessage errors with YouTube when loading multiple iframes.
          if (onReady) onReady(controllerRef.current?.getDuration() || 0);
          break;
        case 'play':
          setIsPlaying(true);
          logAudienceEvent({ type: 'block_started', blockId: item.blockId });
          break;
        case 'pause':
          setIsPlaying(false);
          break;
        case 'ended':
          logAudienceEvent({ type: 'block_completed', blockId: item.blockId });
          onEnded();
          break;
        case 'error':
        case 'unavailable':
          setError(event.payload?.toString() || 'Playback Error');
          logAudienceEvent({ type: 'playback_error', blockId: item.blockId, payload: event.payload });
          onError(event.payload);
          break;
        case 'progress':
          if (event.payload?.milestone) {
            logAudienceEvent({ type: `${event.payload.milestone}_percent` as any, blockId: item.blockId });
          }
          break;
      }
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controllerRef.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controllerRef.current?.destroy();
    };
  }, [onEnded, onError, onReady]); // item is handled in the next effect

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
            <p>Error: {error}</p>
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
