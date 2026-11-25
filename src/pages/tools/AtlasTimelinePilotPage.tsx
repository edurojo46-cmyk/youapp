import React, { useState, useEffect, useRef } from 'react';
import { Film, Play, Pause, CheckCircle2, Layers, Cpu, Eye, ExternalLink } from 'lucide-react';

export default function AtlasTimelinePilotPage() {
  const [timelineData, setTimelineData] = useState<any>(null);
  const [mltXml, setMltXml] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeSegment, setActiveSegment] = useState<string>('00:00-00:05 (VIDEO ORIGINAL)');

  const playerRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetch('/api/atlas/video/timeline-pilot')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTimelineData(data.timeline);
          setMltXml(data.mltXml);
        }
      })
      .catch(() => {});
  }, []);

  const handleTimeUpdate = () => {
    if (playerRef.current) {
      const t = playerRef.current.currentTime;
      setCurrentTime(t);
      if (t >= 0 && t < 5) {
        setActiveSegment('00:00-00:05 (VIDEO ORIGINAL)');
      } else if (t >= 5 && t < 10) {
        setActiveSegment('00:05-00:10 (FRAME SELECCIONADO)');
      } else {
        setActiveSegment('00:10-00:30 (VIDEO ORIGINAL)');
      }
    }
  };

  const jumpTo = (sec: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = sec;
      playerRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(sec);
    }
  };

  const togglePlay = () => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#07090e', color: '#f1f3f7', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* HEADER BAR */}
      <div style={{ maxWidth: 1180, margin: '0 auto 20px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#38bdf8', color: '#0369a1', fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 6 }}>
              PILOTO AISLADO
            </span>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>
              ATLAS CANONICAL TIMELINE PILOT (OTIO → MLT → FFMPEG)
            </h1>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Una sola fuente de verdad: <strong>atlas_timeline_pilot.otio</strong> • Costo: <strong>$0</strong> (Zero Cloud, Zero APIs pagas)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 800, background: 'rgba(52, 211, 153, 0.12)', padding: '4px 10px', borderRadius: 6 }}>
            EXTERNAL_COST = 0
          </span>
          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, background: 'rgba(56, 189, 248, 0.12)', padding: '4px 10px', borderRadius: 6 }}>
            OTIO / MLT = ACTIVE
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* ROW 1: FUENTES Y PREVIEW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          
          {/* 1. VIDEO ORIGINAL */}
          <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Film size={14} /> VIDEO ORIGINAL (psychology_2min_v1.webm)
            </div>
            <div style={{ width: '100%', height: 220, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <video
                src="/videos/psychology_2min_v1.webm"
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Fuente base para los tramos 00:00-00:05 y 00:10-00:30
            </div>
          </div>

          {/* 2. FRAME SELECCIONADO */}
          <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} /> FRAME SELECCIONADO (FRAME_REFERENCE_VIDEO_001_30000)
            </div>
            <div style={{ width: '100%', height: 220, background: '#000', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/captured_frames/FRAME_REFERENCE_VIDEO_001_30000_1792841976216.jpg"
                alt="Frame Seleccionado"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Fotograma exacto insertado en el tramo 00:05-00:10
            </div>
          </div>

          {/* 3. PREVIEW RESULTANTE */}
          <div style={{ background: '#0b1120', border: '1.5px solid #10b981', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#34d399', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> PREVIEW RESULTANTE (timeline_pilot_v1.webm)
              </span>
              <span style={{ fontSize: 10, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 4 }}>
                RENDER OTIO/MLT
              </span>
            </div>
            <div style={{ width: '100%', height: 220, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <video
                ref={playerRef}
                id="pilot-video-player"
                src="/videos/timeline_pilot_v1.webm"
                onTimeUpdate={handleTimeUpdate}
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            
            {/* PRUEBA HUMANA BUTTONS */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                id="btn-pilot-seek-03"
                onClick={() => jumpTo(3.0)}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                VER 00:03 (ORIGINAL)
              </button>
              <button
                id="btn-pilot-seek-07"
                onClick={() => jumpTo(7.0)}
                style={{ flex: 1, background: '#1e293b', border: '1.5px solid #fbbf24', color: '#fbbf24', padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
              >
                VER 00:07 (FRAME ELEGIDO)
              </button>
              <button
                id="btn-pilot-seek-12"
                onClick={() => jumpTo(12.0)}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                VER 00:12 (ORIGINAL)
              </button>
            </div>
          </div>

        </div>

        {/* ROW 2: TIMELINE CANONICA VISUAL */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#38bdf8" />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                TIMELINE CANÓNICA VISUAL: VIDEO | FRAME | VIDEO
              </span>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#38bdf8' }}>
              Tiempo: <strong>{formatSeconds(currentTime)} / 00:30</strong> • Tramo activo: <strong style={{ color: '#fbbf24' }}>{activeSegment}</strong>
            </div>
          </div>

          {/* VISUAL STRIP */}
          <div style={{ width: '100%', height: 48, background: '#020617', borderRadius: 8, display: 'flex', overflow: 'hidden', border: '1px solid #334155', position: 'relative' }}>
            
            {/* SEGMENT 1: 00:00 - 00:05 (16.6%) */}
            <div
              onClick={() => jumpTo(2.5)}
              style={{
                width: `${(5 / 30) * 100}%`,
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(30, 58, 138, 0.4))',
                borderRight: '2px solid #38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10.5,
                fontWeight: 800,
                color: '#38bdf8',
                cursor: 'pointer'
              }}
            >
              00:00-00:05 VIDEO
            </div>

            {/* SEGMENT 2: 00:05 - 00:10 (16.6%) */}
            <div
              onClick={() => jumpTo(7.0)}
              style={{
                width: `${(5 / 30) * 100}%`,
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.35), rgba(180, 83, 9, 0.5))',
                borderRight: '2px solid #fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10.5,
                fontWeight: 900,
                color: '#fbbf24',
                cursor: 'pointer'
              }}
            >
              00:05-00:10 FRAME
            </div>

            {/* SEGMENT 3: 00:10 - 00:30 (66.6%) */}
            <div
              onClick={() => jumpTo(15.0)}
              style={{
                width: `${(20 / 30) * 100}%`,
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(30, 58, 138, 0.3))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10.5,
                fontWeight: 800,
                color: '#38bdf8',
                cursor: 'pointer'
              }}
            >
              00:10-00:30 VIDEO ORIGINAL
            </div>

            {/* PLAYHEAD INDICATOR */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(currentTime / 30) * 100}%`,
                width: 3,
                background: '#ef4444',
                boxShadow: '0 0 8px #ef4444',
                pointerEvents: 'none',
                transition: 'left 0.1s linear'
              }}
            />
          </div>
        </div>

        {/* ROW 3: OTIO SPECIFICATION & MLT XML PREVIEWS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 8 }}>
              OpenTimelineIO Schema (server/data/atlas_timeline_pilot.otio)
            </div>
            <pre style={{ margin: 0, background: '#020617', padding: 12, borderRadius: 6, fontSize: 10, color: '#94a3b8', maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace' }}>
              {timelineData ? JSON.stringify(timelineData, null, 2) : 'Cargando OTIO...'}
            </pre>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#34d399', marginBottom: 8 }}>
              MLT Tractor XML (server/data/atlas_timeline_pilot.mlt)
            </div>
            <pre style={{ margin: 0, background: '#020617', padding: 12, borderRadius: 6, fontSize: 10, color: '#94a3b8', maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace' }}>
              {mltXml || 'Cargando MLT XML...'}
            </pre>
          </div>

        </div>

      </div>
    </div>
  );
}
