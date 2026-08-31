import React, { useEffect, useRef, useState } from 'react';
import type { ScheduleBlock } from '../signalTypes';
import { resolvePlayback } from './playbackResolver';
import type { PlaybackResolution } from './playbackResolver';
import ReactPlayer from 'react-player';
interface SmartTVPlayerProps {
  block: ScheduleBlock;
  onEnded: () => void;
  onError: (err: any) => void;
}

function NativeVideoPlayer({ src, onEnded, onError }: { src: string, onEnded: () => void, onError: (err: any) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let isSubscribed = true;

    const handlePlay = () => {
      if (!isSubscribed) return;
      video.play().catch(err => {
        if (!isSubscribed) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Ignorar AbortError (usuario hizo zapping rápido)
          return;
        }
        onError(err);
      });
    };

    handlePlay();

    return () => {
      isSubscribed = false;
      video.pause();
    };
  }, [src, onError]);

  return (
    <video
      ref={videoRef}
      src={src}
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'black' }}
      controls={false}
      onEnded={onEnded}
      onError={(e) => onError(e)}
    />
  );
}

export default function SmartTVPlayer({ block, onEnded, onError }: SmartTVPlayerProps) {
  const [resolution, setResolution] = useState<PlaybackResolution | null>(null);
  
  useEffect(() => {
    const res = resolvePlayback(block.contentItem);
    setResolution(res);
  }, [block]);

  // Handle external or unsupported content
  useEffect(() => {
    if (!resolution) return;
    
    let timer: any;
    if (resolution.mode === 'external' || resolution.mode === 'unsupported') {
      // Simulate playback for external content (5 seconds for demo)
      timer = setTimeout(() => {
        onEnded();
      }, 5000);
    }
    
    return () => clearTimeout(timer);
  }, [resolution, onEnded]);

  if (!resolution) {
    return <div style={{ color: 'white' }}>Cargando...</div>;
  }

  if (resolution.mode === 'embed' && resolution.src) {
    // Para embeds de YouTube/Vimeo usamos ReactPlayer que maneja la API de JS (onEnded, autoplay, strict mode quirks)
    // Convertimos la URL de embed a URL estándar para ReactPlayer
    let playerUrl = resolution.src;
    if (resolution.provider === 'youtube') {
      const ytMatch = resolution.src.match(/embed\/([^?]+)/);
      if (ytMatch) playerUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
    } else if (resolution.provider === 'vimeo') {
      const viMatch = resolution.src.match(/video\/([^?]+)/);
      if (viMatch) playerUrl = `https://vimeo.com/${viMatch[1]}`;
    }

    return (
      <div style={{ width: '100%', height: '100%', background: 'black' }}>
        <ReactPlayer 
          url={playerUrl}
          playing={true}
          controls={false}
          muted={false} // Permitir sonido si el navegador lo permite
          width="100%"
          height="100%"
          onEnded={onEnded}
          onError={onError}
          config={{
            youtube: {
              playerVars: { 
                autoplay: 1, 
                controls: 1, // Mostrar controles para que el usuario pueda darle play si falla el autoplay
                showinfo: 0, 
                rel: 0,
                origin: window.location.origin
              }
            }
          }}
        />
      </div>
    );
  }

  if (resolution.mode === 'native' && resolution.src) {
    return (
      <NativeVideoPlayer 
        src={resolution.src} 
        onEnded={onEnded} 
        onError={onError} 
      />
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#0f172a', color: 'white' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 24, textAlign: 'center' }}>{block.contentItem.title}</h3>
      <p style={{ color: '#94a3b8', fontSize: 16 }}>
        Este contenido es un enlace externo. 
      </p>
      {resolution.externalUrl && (
        <a href={resolution.externalUrl} target="_blank" rel="noreferrer" style={{ marginTop: 24, padding: '12px 24px', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: 8 }}>
          Abrir contenido
        </a>
      )}
      <p style={{ marginTop: 32, fontSize: 12, color: '#64748b' }}>Avanzando automáticamente en 5 segundos...</p>
    </div>
  );
}
