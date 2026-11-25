import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  HardDrive,
  Cpu,
  Layers,
  Check,
  RotateCcw,
  Sliders,
  ExternalLink,
  ChevronRight,
  Wrench,
  AlertTriangle,
  Info
} from 'lucide-react';

interface PiperVoice {
  id: string;
  name: string;
  locale: string;
  quality: string;
  gender: string;
  accent: string;
  tone: string;
  license: string;
  sizeMb: number;
  sampleRate: number;
  status: 'INSTALLED' | 'AVAILABLE_FOR_INSTALL' | 'CATALOG_REGISTERED';
  isDefaultApproved: boolean;
  sampleWebUrl?: string;
}

export default function AtlasMotionVoiceStudio() {
  const [selectedVoice, setSelectedVoice] = useState<string>('es_ES-davefx-medium');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  const [isOrigPlaying, setIsOrigPlaying] = useState<boolean>(false);
  const [isMotionPlaying, setIsMotionPlaying] = useState<boolean>(false);

  const origVideoRef = useRef<HTMLVideoElement | null>(null);
  const motionVideoRef = useRef<HTMLVideoElement | null>(null);
  const realMotionVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const voices: PiperVoice[] = [
    {
      id: 'es_ES-davefx-medium',
      name: 'DaveFX (Español España)',
      locale: 'es_ES',
      quality: 'medium',
      gender: 'MASCULINO',
      accent: 'España / Peninsular',
      tone: 'Narración documental solemne, profunda y pausada',
      license: 'CC BY 4.0 / Open Source',
      sizeMb: 60.27,
      sampleRate: 22050,
      status: 'INSTALLED',
      isDefaultApproved: true,
      sampleWebUrl: '/audio/voices/sample_es_ES_davefx_medium.mp3'
    },
    {
      id: 'es_MX-ald-medium',
      name: 'Ald (Español México)',
      locale: 'es_MX',
      quality: 'medium',
      gender: 'MASCULINO',
      accent: 'México / Neutro latinoamericano',
      tone: 'Claro, dinámico, cinematográfico y moderno',
      license: 'CC BY 4.0 / Open Source',
      sizeMb: 60.27,
      sampleRate: 22050,
      status: 'INSTALLED',
      isDefaultApproved: false,
      sampleWebUrl: '/audio/voices/sample_es_MX_ald_medium.mp3'
    },
    {
      id: 'es_ES-sharvard-medium',
      name: 'Sharvard (Español España)',
      locale: 'es_ES',
      quality: 'medium',
      gender: 'FEMENINO',
      accent: 'España / Peninsular académico',
      tone: 'Natural, articulación precisa y dicción elocuente',
      license: 'CC BY 4.0 / Open Source',
      sizeMb: 73.18,
      sampleRate: 22050,
      status: 'INSTALLED',
      isDefaultApproved: false,
      sampleWebUrl: '/audio/voices/sample_es_ES_sharvard_medium.mp3'
    },
    {
      id: 'es_AR-daniela-high',
      name: 'Daniela (Español Argentina)',
      locale: 'es_AR',
      quality: 'high (alta fidelidad)',
      gender: 'FEMENINO',
      accent: 'Argentina / Rioplatense',
      tone: 'Cálido, expresivo, emotivo de alta definición',
      license: 'CC BY 4.0 / Open Source',
      sizeMb: 108.91,
      sampleRate: 22050,
      status: 'AVAILABLE_FOR_INSTALL',
      isDefaultApproved: false
    },
    {
      id: 'es_MX-claude-high',
      name: 'Claude (Español México)',
      locale: 'es_MX',
      quality: 'high (alta fidelidad)',
      gender: 'MASCULINO',
      accent: 'México / Radiofónico',
      tone: 'Profesional, radiofónico, resonancia cálida',
      license: 'CC BY 4.0 / Open Source',
      sizeMb: 60.20,
      sampleRate: 22050,
      status: 'AVAILABLE_FOR_INSTALL',
      isDefaultApproved: false
    }
  ];

  const handlePlayVoiceSample = (voice: PiperVoice) => {
    if (!voice.sampleWebUrl) return;

    if (playingVoiceId === voice.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = voice.sampleWebUrl;
      audioPlayerRef.current.play().then(() => {
        setPlayingVoiceId(voice.id);
      }).catch(err => {
        console.error('Audio playback error:', err);
      });
    }
  };

  const handleSelectProductionVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('atlas_active_piper_voice', voiceId);
  };

  const handleSyncPlayBoth = () => {
    if (origVideoRef.current && motionVideoRef.current) {
      if (isMotionPlaying || isOrigPlaying) {
        origVideoRef.current.pause();
        motionVideoRef.current.pause();
        setIsOrigPlaying(false);
        setIsMotionPlaying(false);
      } else {
        origVideoRef.current.currentTime = 0;
        motionVideoRef.current.currentTime = 0;
        origVideoRef.current.play().catch(() => {});
        motionVideoRef.current.play().catch(() => {});
        setIsOrigPlaying(true);
        setIsMotionPlaying(true);
      }
    }
  };

  const installedVoices = voices.filter(v => v.status === 'INSTALLED');

  return (
    <div style={{ minHeight: '100vh', background: '#07090e', color: '#f1f3f7', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Hidden audio element for voice auditions */}
      <audio
        ref={audioPlayerRef}
        onTimeUpdate={(e) => setAudioCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setAudioDuration((e.target as HTMLAudioElement).duration)}
        onEnded={() => { setPlayingVoiceId(null); setAudioCurrentTime(0); }}
        onError={() => setPlayingVoiceId(null)}
      />

      {/* TOP HEADER */}
      <div style={{ maxWidth: 1280, margin: '0 auto 24px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#38bdf8', color: '#0369a1', fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 6 }}>
              STUDIO V2
            </span>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
              ATLAS CINEMATIC MOTION + PIPER MULTI-VOICE STUDIO
            </h1>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Benchmark «El Susurro del Glaciar» • Movimiento Físico Real de Objeto/Personaje • 3 Voces Piper Instaladas (Costo $0)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 800, background: 'rgba(52, 211, 153, 0.12)', padding: '5px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <HardDrive size={13} /> DISK_FREE: 9.52 GB (GATE &gt;= 3.0 GB)
          </span>
          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, background: 'rgba(56, 189, 248, 0.12)', padding: '5px 10px', borderRadius: 6 }}>
            EXTERNAL_COST = $0.00
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECCIÓN 1: SELECTOR DE VOCES PIPER (SIEMPRE VISIBLE DIRECTAMENTE)  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: '#0b1120', border: '1px solid #38bdf8', borderRadius: 12, padding: 20 }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Volume2 size={18} color="#38bdf8" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                  SELECTOR DE VOCES PIPER NEURALES (INSTALADAS Y LISTAS)
                </h2>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Sintetizador neuronal 100% local offline. Cada tarjeta cuenta con muestra de 15 segundos para audicionar de inmediato.
              </div>
            </div>

            <div style={{ fontSize: 11, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
              3 Modelos ONNX Instalados Localmente
            </div>
          </div>

          {/* TEXTO DE COMPARACIÓN */}
          <div style={{ background: '#07090e', borderLeft: '3px solid #38bdf8', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' }}>
            «Ochocientos metros bajo el hielo eterno de la Antártida descansa el aire que respiró la Tierra hace cuatrocientos mil años. La investigación polar revela los secretos del clima...»
          </div>

          {/* TARJETAS DE VOCES INSTALADAS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {installedVoices.map(voice => {
              const isSelected = selectedVoice === voice.id;
              const isPlaying = playingVoiceId === voice.id;

              return (
                <div
                  key={voice.id}
                  style={{
                    background: isSelected ? '#0d1d36' : '#07090e',
                    border: `1.5px solid ${isSelected ? '#38bdf8' : '#1e293b'}`,
                    borderRadius: 10,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 0 16px rgba(56, 189, 248, 0.2)' : 'none'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>
                          {voice.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600, marginTop: 2 }}>
                          {voice.accent} • {voice.gender}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column', alignItems: 'flex-end' }}>
                        {voice.isDefaultApproved && (
                          <span style={{ fontSize: 9, background: '#10b981', color: '#fff', fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>
                            PREDETERMINADA
                          </span>
                        )}
                        <span style={{ fontSize: 9, background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                          INSTALADA
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4, margin: '8px 0 12px', background: '#0b1120', padding: 8, borderRadius: 6 }}>
                      {voice.tone}
                    </div>

                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 12, marginBottom: 12 }}>
                      <span>Tasa: <strong>{voice.sampleRate} Hz</strong></span>
                      <span>Tamaño: <strong>{voice.sizeMb} MB</strong></span>
                      <span>Licencia: <strong>CC BY 4.0</strong></span>
                    </div>

                    {isPlaying && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#38bdf8', marginBottom: 3 }}>
                          <span>Reproduciendo muestra...</span>
                          <span>{audioCurrentTime.toFixed(1)}s / {audioDuration.toFixed(1)}s</span>
                        </div>
                        <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${(audioCurrentTime / (audioDuration || 1)) * 100}%`, height: '100%', background: '#38bdf8', transition: 'width 0.1s linear' }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => handlePlayVoiceSample(voice)}
                      style={{
                        flex: 1.2,
                        background: isPlaying ? '#ef4444' : '#1e293b',
                        color: '#fff',
                        border: `1px solid ${isPlaying ? '#ef4444' : '#334155'}`,
                        padding: '9px 12px',
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {isPlaying ? 'PAUSAR' : 'ESCUCHAR (15s)'}
                    </button>

                    <button
                      onClick={() => handleSelectProductionVoice(voice.id)}
                      style={{
                        flex: 1,
                        background: isSelected ? '#10b981' : '#2563eb',
                        color: '#fff',
                        border: 'none',
                        padding: '9px 12px',
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}
                    >
                      {isSelected ? <Check size={14} /> : null}
                      {isSelected ? 'ACTIVA' : 'SELECCIONAR'}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECCIÓN 2: MOVIMIENTO FÍSICO REAL DE SUJETO/OBJETO (5.0s PREVIEW)   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: '#0b1120', border: '1px solid #10b981', borderRadius: 12, padding: 20 }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={18} color="#10b981" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                  MOVIMIENTO FÍSICO REAL DENTRO DE LA ESCENA (5.0s BENCHMARK)
                </h2>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Mano de Valeria accionando la llave del generador polar con torque mecánico y chispas de contacto • Fondo 100% estático y coherente
              </div>
            </div>

            <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '4px 10px', borderRadius: 6, fontWeight: 800 }}>
              ACCIÓN FÍSICA REAL SIN ZOOM
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'center' }}>
            
            {/* VIDEO PLAYER */}
            <div style={{ maxWidth: 420, margin: '0 auto', width: '100%', background: '#000', borderRadius: 10, overflow: 'hidden', border: '1px solid #334155' }}>
              <div style={{ background: '#0f172a', padding: '8px 12px', fontSize: 11, fontWeight: 800, color: '#10b981', display: 'flex', justifyContent: 'space-between' }}>
                <span>SCENE 06 • VALERIA GENERATOR REPAIR</span>
                <span>5.0s • 24 FPS • 13.4 MB</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '9/16', maxHeight: 520, margin: '0 auto', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video
                  ref={realMotionVideoRef}
                  src="/videos/glaciar_valeria_generator_motion_5s.mp4"
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            </div>

            {/* ANÁLISIS TÉCNICO Y FÍSICO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              <div style={{ background: '#07090e', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 800, color: '#34d399', fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={15} /> Movimiento Físico del Sujeto (Wrench &amp; Hand Torque)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  <li><strong>Torque Angular Selectivo:</strong> La mano enguantada y la llave giran hacia abajo con tensión muscular periódica sobre el eje del perno en (X:775, Y:1095).</li>
                  <li><strong>Dos Golpes de Apriete (Strokes):</strong> Stroke 1 a -5.7° con liberación y clic de trinquete; Stroke 2 a -8.0° de bloqueo final.</li>
                  <li><strong>Chispas Dinámicas en Punto de Contacto:</strong> Erupción de partículas de fricción metálica en el momento exacto del torque máximo, proyectadas hacia la nieve.</li>
                </ul>
              </div>

              <div style={{ background: '#07090e', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={15} /> Fondo 100% Estacionario y Coherente
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  El bloque de motor del generador, la nieve acumulada en las vigas, los cables superiores y el horizonte polar permanecen completamente inmóviles. No hay zoom artificial de cámara completa ni desgarro del fondo.
                </p>
              </div>

              <div style={{ background: '#07090e', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Volume2 size={15} /> Audio Mux Sincronizado
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  Narración neuronal oficial Piper DaveFX combinada con sonido ambiente de viento polar y chasquido de trinquete mecánico sincronizado con el movimiento de la mano.
                </p>
              </div>

            </div>

          </div>

        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECCIÓN 3: COMPARATIVA CINEMATOGRÁFICA 20s (ORIGINAL VS MOTION)    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Film size={18} color="#94a3b8" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                  COMPARATIVA DE MONTAJE (ORIGINAL 20s VS CINEMATIC MOTION 20s)
                </h2>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Mismo audio Piper, mismas imágenes base. Compara montaje estático frente a versión con movimiento de cámara 2.5D y ventisca procedural.
              </div>
            </div>

            <button
              onClick={handleSyncPlayBoth}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <RotateCcw size={14} /> Reproducir Ambos en Simultáneo (Sync)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
            
            {/* ORIGINAL */}
            <div style={{ background: '#07090e', border: '1px solid #334155', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>1. ORIGINAL (ESTÁTICO)</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>20.0s • 5.1 MB</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '9/16', maxHeight: 460, margin: '0 auto', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
                <video
                  ref={origVideoRef}
                  src="/videos/glaciar_original_preview_20s.mp4"
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, lineHeight: 1.4 }}>
                Fotogramas fijos sin desplazamiento de cámara ni ventisca activa.
              </div>
            </div>

            {/* CINEMATIC MOTION */}
            <div style={{ background: '#07090e', border: '1px solid #2563eb', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8' }}>2. CINEMATIC MOTION (CÁMARA + VENTISCA)</span>
                <span style={{ fontSize: 11, color: '#38bdf8' }}>20.0s • 31.6 MB</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '9/16', maxHeight: 460, margin: '0 auto', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
                <video
                  ref={motionVideoRef}
                  src="/videos/glaciar_motion_preview_20s.mp4"
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 10, lineHeight: 1.4 }}>
                Parallax 2.5D suave + barrido de nieve procedural a -35°C + baliza ámbar pulsante.
              </div>
            </div>

          </div>

        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECCIÓN 4: AUDITORÍA DE HARDWARE Y CAPACIDAD LOCAL DE GENERACIÓN    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Cpu size={16} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
              DIAGNÓSTICO REAL DE HARDWARE &amp; LÍMITES DE GENERACIÓN DE VIDEO
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12, fontSize: 12 }}>
            <div style={{ background: '#07090e', padding: 8, borderRadius: 6 }}>
              CPU: <strong>Intel Core i5-8250U @ 1.60GHz</strong>
            </div>
            <div style={{ background: '#07090e', padding: 8, borderRadius: 6 }}>
              GPU: <strong>Intel(R) UHD Graphics 620</strong> (Sin CUDA/VRAM)
            </div>
            <div style={{ background: '#07090e', padding: 8, borderRadius: 6 }}>
              RAM: <strong>11.43 GB Total</strong> (0.55 GB libres)
            </div>
            <div style={{ background: '#07090e', padding: 8, borderRadius: 6 }}>
              Disco C: <strong>9.52 GB libres</strong> (Gate &gt;= 3.0 GB superado)
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, background: '#07090e', padding: 10, borderRadius: 6, borderLeft: '3px solid #f59e0b' }}>
            <strong style={{ color: '#f8fafc' }}>Evaluación de Modelos de Difusión Pesados (SVD, AnimateDiff, CogVideo):</strong> Estos modelos requieren obligatoriamente GPU dedicada NVIDIA con 8–16 GB de VRAM y 16+ GB de memoria física. En esta máquina (Intel UHD 620 sin VRAM y solo 550 MB de RAM libre), la ejecución de modelos de difusión locales provocaría OOM (Out Of Memory) inmediato y congelamiento del sistema.
            <br />
            <strong style={{ color: '#34d399' }}>Solución Industrial Viable:</strong> Rotoscopía selectiva y animación física angular/translacional de sujetos mediante máscaras y composición FFmpeg de alta fidelidad, con costo $0 y estabilidad garantizada sin arriesgar memoria ni almacenamiento.
          </div>
        </div>

      </div>

    </div>
  );
}
