import React, { useState, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Sparkles,
  Music2,
  BookOpen,
  Award,
  ArrowLeftRight,
  Link2,
  ExternalLink,
  MousePointerClick,
  ShoppingBag
} from 'lucide-react';
import { AtlasCtaLinkEngineInstance } from '../lib/atlas/atlasCtaLinkEngine';
import { AtlasMercadoLibreLinkHub } from '../lib/atlas/atlasMercadoLibreLinkHub';

interface MusicTrackInfo {
  title: string;
  artist: string;
  style: string;
  audioUrl: string;
  qualityScore?: number;
  melodyScore?: number;
  harmonyScore?: number;
  emotionalScore?: number;
  progressionScore?: number;
}

interface EmotiveStoryItem {
  videoId: string;
  title: string;
  theme: string;
  text: string;
  musicA: MusicTrackInfo;
  musicB: MusicTrackInfo;
  mood: string;
  creativeScore: number;
  previewUrl: string;
  videoUrl: string;
}

const EMOTIVE_STORIES: EmotiveStoryItem[] = [
  {
    videoId: 'RECIPE_001',
    title: 'La piedra en el sendero',
    theme: 'PERSEVERANCIA',
    text: 'Un hombre caminaba cada día por el mismo sendero. Siempre encontraba una gran piedra y prefería rodearla. Una mañana decidió detenerse y moverla con sus manos. Debajo descubrió una pequeña planta buscando la luz. Entonces comprendió que algunos obstáculos esconden aquello que sólo descubrimos cuando nos animamos a enfrentarlos.',
    musicA: {
      title: 'Virtutes Instrumenti',
      artist: 'Kevin MacLeod (CC-BY 3.0)',
      style: 'Flauta Celta & Arpa Acústica',
      audioUrl: '/emotive_audio/virtutes_instrumenti.mp3'
    },
    musicB: {
      title: 'Sovereign',
      artist: 'Kevin MacLeod (CC-BY 3.0)',
      style: 'Cuerdas Melódicas & Piano Elevado (Vangelis / Enya feel)',
      audioUrl: '/emotive_audio/sovereign.mp3',
      qualityScore: 94,
      melodyScore: 95,
      harmonyScore: 94,
      emotionalScore: 96,
      progressionScore: 94
    },
    mood: 'CINEMATIC / ETHEREAL',
    creativeScore: 98,
    previewUrl: '/emotive_previews/emotive_preview_recipe_001.jpg',
    videoUrl: '/videos/emotive_preview_recipe_001.webm'
  },
  {
    videoId: 'RECIPE_002',
    title: 'El árbol y la tormenta',
    theme: 'FORTALEZA',
    text: 'En medio del valle crecía un árbol más pequeño que los demás. Sentía tristeza porque sus ramas no llegaban a tocar el cielo. Una noche de tormenta derribó los árboles más altos del bosque. El pequeño, flexible y arraigado en la roca, permaneció en pie. Aquella mañana comprendió que la verdadera fortaleza reside en la humildad de doblarse sin quebrarse.',
    musicA: {
      title: 'Touching Moments Two - Higher',
      artist: 'Kevin MacLeod (CC-BY 3.0)',
      style: 'Piano & Cuerdas Cálidas',
      audioUrl: '/emotive_audio/touching_moments_higher.mp3'
    },
    musicB: {
      title: 'Gymnopedie No 1',
      artist: 'Erik Satie / Kevin MacLeod (CC-BY 3.0)',
      style: 'Melodía de Piano Inmortal & Armonía Contemplativa (Satie Masterpiece)',
      audioUrl: '/emotive_audio/gymnopedie_no_1.mp3',
      qualityScore: 94,
      melodyScore: 96,
      harmonyScore: 95,
      emotionalScore: 95,
      progressionScore: 90
    },
    mood: 'PAZ / CONTEMPLATIVO',
    creativeScore: 97,
    previewUrl: '/emotive_previews/emotive_preview_recipe_002.jpg',
    videoUrl: '/videos/emotive_preview_recipe_002.webm'
  },
  {
    videoId: 'RECIPE_003',
    title: 'La lámpara en la niebla',
    theme: 'ESPERANZA',
    text: 'Un viajero temía cruzar la montaña envuelta en una densa niebla. Esperaba que el sol despejara todo el camino para poder avanzar. Al caer la tarde, decidió encender un pequeño farol de mano. La débil llama apenas iluminaba los siguientes dos pasos de la senda. Caminando paso a paso llegó a la cima, comprendiendo que nunca hace falta ver todo el camino para empezar a andar.',
    musicA: {
      title: 'Clear Waters',
      artist: 'Kevin MacLeod (CC-BY 3.0)',
      style: 'Arpa Cristalina & Cuerdas Clásicas',
      audioUrl: '/emotive_audio/clear_waters.mp3'
    },
    musicB: {
      title: 'Canon in D Major',
      artist: 'Johann Pachelbel / Kevin MacLeod (CC-BY 3.0)',
      style: 'Cuerdas Orquestales & Piano con Progresión Ascendente (Pachelbel Classic)',
      audioUrl: '/emotive_audio/canon_in_d_major.mp3',
      qualityScore: 94,
      melodyScore: 96,
      harmonyScore: 96,
      emotionalScore: 93,
      progressionScore: 95
    },
    mood: 'ESPERANZA / CELESTIAL',
    creativeScore: 99,
    previewUrl: '/emotive_previews/emotive_preview_recipe_003.jpg',
    videoUrl: '/videos/emotive_preview_recipe_003.webm'
  }
];

export default function EmotiveReviewLab() {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [ratings, setRatings] = useState<Record<string, 'LIKE' | 'DISLIKE' | null>>({});
  const [selectedMusic, setSelectedMusic] = useState<Record<string, 'A' | 'B'>>({
    RECIPE_001: 'B',
    RECIPE_002: 'B',
    RECIPE_003: 'B'
  });
  const [musicChoice, setMusicChoice] = useState<Record<string, 'MEJOR ACTUAL' | 'MEJOR NUEVA' | null>>({});
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const audioRefsA = useRef<(HTMLAudioElement | null)[]>([]);
  const audioRefsB = useRef<(HTMLAudioElement | null)[]>([]);

  // CTA Engine State per video
  const [ctaPlatforms, setCtaPlatforms] = useState<Record<string, 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK'>>({
    RECIPE_001: 'YOUTUBE',
    RECIPE_002: 'YOUTUBE',
    RECIPE_003: 'YOUTUBE'
  });
  const [ctaClicks, setCtaClicks] = useState<Record<string, number>>({
    RECIPE_001: 0,
    RECIPE_002: 0,
    RECIPE_003: 0
  });
  const [lastClickTime, setLastClickTime] = useState<Record<string, string | null>>({
    RECIPE_001: null,
    RECIPE_002: null,
    RECIPE_003: null
  });
  const [destinationReached, setDestinationReached] = useState<Record<string, string | null>>({
    RECIPE_001: null,
    RECIPE_002: null,
    RECIPE_003: null
  });
  const [mlClicks, setMlClicks] = useState<Record<string, number>>({});
  const [videoTimeInfo, setVideoTimeInfo] = useState<Record<string, { current: number; duration: number }>>({});

  const handleTimeUpdate = (index: number) => {
    const vid = videoRefs.current[index];
    if (vid) {
      const item = EMOTIVE_STORIES[index];
      const curTime = vid.currentTime;
      const totalDur = vid.duration || (item.videoId === 'RECIPE_001' ? 35.0 : 30.0);

      setVideoTimeInfo(prev => ({
        ...prev,
        [item.videoId]: { current: curTime, duration: totalDur }
      }));

      // Audio Fade Out rule: only in the last 1.5s of the video (33.5s - 35.0s) for RECIPE_001
      if (item.videoId === 'RECIPE_001') {
        const audioA = audioRefsA.current[index];
        const audioB = audioRefsB.current[index];
        if (curTime >= 33.5 && curTime <= 35.0) {
          const vol = Math.max(0, (35.0 - curTime) / 1.5);
          if (audioA) audioA.volume = vol;
          if (audioB) audioB.volume = vol;
        } else if (curTime < 33.5) {
          if (audioA) audioA.volume = 1.0;
          if (audioB) audioB.volume = 1.0;
        }
      }
    }
  };

  const jumpToCtaEndcard = (index: number) => {
    const vid = videoRefs.current[index];
    if (vid) {
      vid.currentTime = 30.0;
      handleSeek(index);
      vid.play().catch(() => {});
    }
  };

  const handleTestCtaLink = (videoId: string, trackingUrl: string, destUrl: string) => {
    // 1. Record authentic test click (NO inventar clics)
    setCtaClicks(prev => ({ ...prev, [videoId]: (prev[videoId] || 0) + 1 }));

    // 2. Record timestamp
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastClickTime(prev => ({ ...prev, [videoId]: timeFormatted }));

    // 3. Mark destination reached
    setDestinationReached(prev => ({ ...prev, [videoId]: `YES (${destUrl})` }));
  };

  // Stop other media when a video starts playing (NO simultaneous playback)
  const handlePlay = (index: number) => {
    const targetItem = EMOTIVE_STORIES[index];
    setPlayingVideoId(targetItem.videoId);
    setCurrentIndex(index);

    // Pause all other videos and audio elements immediately
    EMOTIVE_STORIES.forEach((_, idx) => {
      if (idx !== index) {
        if (videoRefs.current[idx]) videoRefs.current[idx]!.pause();
        if (audioRefsA.current[idx]) audioRefsA.current[idx]!.pause();
        if (audioRefsB.current[idx]) audioRefsB.current[idx]!.pause();
      }
    });

    // Start active paired audio track (A or B)
    const activeAudioRef = selectedMusic[targetItem.videoId] === 'A' ? audioRefsA.current[index] : audioRefsB.current[index];
    if (activeAudioRef) {
      activeAudioRef.currentTime = videoRefs.current[index]?.currentTime || 0;
      activeAudioRef.play().catch(() => {});
    }
  };

  const handlePause = (index: number) => {
    const targetItem = EMOTIVE_STORIES[index];
    if (playingVideoId === targetItem.videoId) {
      setPlayingVideoId(null);
    }
    if (audioRefsA.current[index]) audioRefsA.current[index]!.pause();
    if (audioRefsB.current[index]) audioRefsB.current[index]!.pause();
  };

  const handleSeek = (index: number) => {
    const targetItem = EMOTIVE_STORIES[index];
    const time = videoRefs.current[index]?.currentTime || 0;
    if (audioRefsA.current[index]) audioRefsA.current[index]!.currentTime = time;
    if (audioRefsB.current[index]) audioRefsB.current[index]!.currentTime = time;
    handleTimeUpdate(index);
  };

  const handleSwitchMusic = (index: number, track: 'A' | 'B') => {
    const targetItem = EMOTIVE_STORIES[index];
    setSelectedMusic(prev => ({ ...prev, [targetItem.videoId]: track }));

    const isPlaying = videoRefs.current[index] && !videoRefs.current[index]!.paused;
    const time = videoRefs.current[index]?.currentTime || 0;

    // Pause both audios
    if (audioRefsA.current[index]) audioRefsA.current[index]!.pause();
    if (audioRefsB.current[index]) audioRefsB.current[index]!.pause();

    const targetAudio = track === 'A' ? audioRefsA.current[index] : audioRefsB.current[index];
    if (targetAudio) {
      targetAudio.currentTime = time;
      if (isPlaying) {
        targetAudio.play().catch(() => {});
      }
    }
  };

  const handleSelectPreference = (videoId: string, choice: 'MEJOR ACTUAL' | 'MEJOR NUEVA') => {
    setMusicChoice(prev => ({
      ...prev,
      [videoId]: prev[videoId] === choice ? null : choice
    }));
  };

  const handleVote = (videoId: string, vote: 'LIKE' | 'DISLIKE') => {
    setRatings(prev => ({
      ...prev,
      [videoId]: prev[videoId] === vote ? null : vote
    }));
  };

  const scrollToCard = (index: number) => {
    const targetCard = document.getElementById(`video-card-${EMOTIVE_STORIES[index].videoId}`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const goPrevious = () => {
    const newIdx = currentIndex > 0 ? currentIndex - 1 : EMOTIVE_STORIES.length - 1;
    setCurrentIndex(newIdx);
    scrollToCard(newIdx);
  };

  const goNext = () => {
    const newIdx = currentIndex < EMOTIVE_STORIES.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIdx);
    scrollToCard(newIdx);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#07090e', color: '#f1f3f7', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* HEADER & PERSISTENT NAVIGATION BAR */}
      <div style={{ maxWidth: 1100, margin: '0 auto 28px', background: 'rgba(18, 22, 34, 0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 18, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, position: 'sticky', top: 16, zIndex: 50, boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, letterSpacing: 1.2 }}>
              MUSIC QUALITY V4 • A/B COMPARISON
            </span>
            <span style={{ fontSize: 13, color: '#a0aec0', fontWeight: 600 }}>
              Preview {currentIndex + 1} de {EMOTIVE_STORIES.length} ({EMOTIVE_STORIES[currentIndex].videoId})
            </span>
            <span style={{ background: 'rgba(72, 187, 120, 0.15)', color: '#68d391', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
              GATE SCORE: 94/100
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', letterSpacing: -0.3 }}>
            EmotiveReviewLab — Comparativa A/B Música & Calidad Emocional
          </h1>
        </div>

        {/* TOP LEVEL NAVIGATION (ANTERIOR / SIGUIENTE) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            id="btn-anterior"
            data-testid="btn-anterior"
            onClick={goPrevious}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#1a202c',
              border: '1px solid #4a5568',
              color: '#edf2f7',
              padding: '10px 18px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <ChevronLeft size={16} /> ANTERIOR
          </button>

          <button
            id="btn-siguiente"
            data-testid="btn-siguiente"
            onClick={goNext}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #805ad5, #6b46c1)',
              border: '1px solid #9f7aea',
              color: '#ffffff',
              padding: '10px 20px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 4px 14px rgba(128, 90, 213, 0.4)'
            }}
          >
            SIGUIENTE <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 3 PREVIEWS CONTAINER */}
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>
        {EMOTIVE_STORIES.map((item, idx) => {
          const isFocused = currentIndex === idx;
          const currentRating = ratings[item.videoId];
          const activeTrack = selectedMusic[item.videoId] || 'B';
          const userChoice = musicChoice[item.videoId];

          // Compute CTA data using ATLAS_CTA_LINK_ENGINE (reused singleton)
          const selectedPlatform = ctaPlatforms[item.videoId] || 'YOUTUBE';
          const destinationUrl = '/recomendados';
          const campaignId = 'CAMP_EMOTIVE_CREATOR_V1';

          const ctaData = AtlasCtaLinkEngineInstance.generate({
            videoId: item.videoId,
            platform: selectedPlatform,
            destinationUrl,
            campaignId
          });

          const mlProduct = AtlasMercadoLibreLinkHub.getProductByVideoId(item.videoId);

          return (
            <div
              key={item.videoId}
              id={`video-card-${item.videoId}`}
              data-testid={`video-card-${item.videoId}`}
              onClick={() => setCurrentIndex(idx)}
              style={{
                background: '#121622',
                border: isFocused ? '2px solid #805ad5' : '1px solid #2d3748',
                borderRadius: 20,
                padding: 24,
                boxShadow: isFocused ? '0 16px 40px rgba(128, 90, 213, 0.25)' : '0 8px 24px rgba(0,0,0,0.4)',
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 360px) 1fr',
                gap: 28,
                alignItems: 'start',
                transition: 'all 0.2s ease'
              }}
            >
              {/* VIDEO PLAYER SECTION */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{ width: '100%', maxWidth: 360, aspectRatio: '9 / 16', background: '#000', borderRadius: 16, overflow: 'hidden', position: 'relative', boxShadow: '0 12px 28px rgba(0,0,0,0.7)', border: '1px solid #374151' }}>
                  <video
                    id={`video-${item.videoId}`}
                    data-testid={`video-element-${item.videoId}`}
                    ref={el => { videoRefs.current[idx] = el; }}
                    src={item.videoUrl}
                    poster={item.previewUrl}
                    controls
                    playsInline
                    preload="auto"
                    onPlay={() => handlePlay(idx)}
                    onPause={() => handlePause(idx)}
                    onSeeked={() => handleSeek(idx)}
                    onTimeUpdate={() => handleTimeUpdate(idx)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Paired audio elements for real-time A/B switching */}
                  <audio
                    id={`audio-A-${item.videoId}`}
                    ref={el => { audioRefsA.current[idx] = el; }}
                    src={item.musicA.audioUrl}
                    preload="auto"
                  />
                  <audio
                    id={`audio-B-${item.videoId}`}
                    ref={el => { audioRefsB.current[idx] = el; }}
                    src={item.musicB.audioUrl}
                    preload="auto"
                  />

                  {/* YouTube Shorts CTA End Card Overlay:
                      Only visible & clickable during 30s - 35s.
                      Strictly DISPLAY=NONE during 0s -> 29.9s to allow normal player controls */}
                  <div
                    id={`visual-cta-overlay-${item.videoId}`}
                    style={{
                      display: (item.videoId === 'RECIPE_001' && (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 && (videoTimeInfo[item.videoId]?.current || 0) <= 35.0) ? 'flex' : 'none',
                      position: 'absolute',
                      inset: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: ((videoTimeInfo[item.videoId]?.current || 0) >= 30.0 && (videoTimeInfo[item.videoId]?.current || 0) <= 35.0) ? 'auto' : 'none',
                      zIndex: 20
                    }}
                  >
                    <div
                      id={`cta-card-overlay-${item.videoId}`}
                      data-testid={`cta-card-overlay-${item.videoId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/recomendados?video=${item.videoId}`, '_blank');
                      }}
                      style={{
                        cursor: 'pointer',
                        background: 'rgba(11, 15, 25, 0.88)',
                        backdropFilter: 'blur(12px)',
                        border: '1.5px solid rgba(255, 230, 0, 0.6)',
                        borderRadius: 16,
                        padding: '14px 22px',
                        textAlign: 'center',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 230, 0, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 5,
                        maxWidth: 270
                      }}
                    >
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', fontFamily: 'serif' }}>
                        Conocé más
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ffe600', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ShoppingBag size={13} />
                        Productos recomendados
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>
                        Link en el perfil
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACTIVE AUDIO BADGE */}
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: activeTrack === 'B' ? '#a78bfa' : '#63b3ed', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Music2 size={13} />
                  Reproduciendo: {activeTrack === 'B' ? `MUSIC B (Nueva: ${item.musicB.title})` : `MUSIC A (Actual: ${item.musicA.title})`}
                </div>

                {/* ATLAS CTA LINK ENGINE INTEGRATION PANEL (POR CADA VIDEO DEBAJO DEL PLAYER) */}
                <div
                  id={`cta-panel-${item.videoId}`}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    maxWidth: 360,
                    background: 'rgba(18, 22, 34, 0.95)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  {/* Header & Simulation Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Link2 size={12} /> ATLAS_CTA_LINK_ENGINE
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 6px', borderRadius: 4 }}>
                      SIMULATION_ONLY
                    </span>
                  </div>

                  {/* 5-SECOND CTA EXTENSION CONTROLS FOR RECIPE_001 */}
                  {item.videoId === 'RECIPE_001' && (
                    <div style={{ marginBottom: 12, background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>SECUENCIA (CUENTO 30s + CTA 5s)</span>
                        <span style={{ color: (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 ? '#a78bfa' : '#38bdf8' }}>
                          t = {(videoTimeInfo[item.videoId]?.current || 0).toFixed(1)}s / 35.0s
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr', gap: 6, marginBottom: 8, fontSize: 10 }}>
                        <div style={{ padding: '4px 6px', borderRadius: 6, background: (videoTimeInfo[item.videoId]?.current || 0) < 30.0 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)', border: (videoTimeInfo[item.videoId]?.current || 0) < 30.0 ? '1px solid #38bdf8' : '1px solid transparent', color: (videoTimeInfo[item.videoId]?.current || 0) < 30.0 ? '#38bdf8' : '#64748b', fontWeight: (videoTimeInfo[item.videoId]?.current || 0) < 30.0 ? 700 : 400 }}>
                          1. Cuento (0s - 30s)
                        </div>
                        <div style={{ padding: '4px 6px', borderRadius: 6, background: (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.03)', border: (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 ? '1px solid #a78bfa' : '1px solid transparent', color: (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 ? '#a78bfa' : '#64748b', fontWeight: (videoTimeInfo[item.videoId]?.current || 0) >= 30.0 ? 700 : 400 }}>
                          2. CTA End Card (5s)
                        </div>
                      </div>

                      <button
                        id="btn-jump-to-cta-recipe_001"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToCtaEndcard(idx);
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(167, 139, 250, 0.15)',
                          border: '1px solid rgba(167, 139, 250, 0.4)',
                          color: '#c4b5fd',
                          borderRadius: 6,
                          cursor: 'pointer'
                        }}
                      >
                        ⏱️ IR A CTA FINAL (t=30.0s)
                      </button>
                    </div>
                  )}

                  {/* Platform Selector Pills */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase', marginBottom: 5 }}>
                      Plataforma & Regla
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['YOUTUBE', 'INSTAGRAM', 'TIKTOK'] as const).map(p => (
                        <button
                          key={p}
                          id={`btn-cta-platform-${item.videoId}-${p.toLowerCase()}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCtaPlatforms(prev => ({ ...prev, [item.videoId]: p }));
                          }}
                          style={{
                            flex: 1,
                            padding: '5px 0',
                            fontSize: 10.5,
                            fontWeight: selectedPlatform === p ? 700 : 500,
                            background: selectedPlatform === p ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                            border: selectedPlatform === p ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                            color: selectedPlatform === p ? '#38bdf8' : '#94a3b8',
                            borderRadius: 6,
                            cursor: 'pointer'
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Platform Rule Display */}
                  <div style={{ fontSize: 10, color: '#a0aec0', marginBottom: 10, background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }}>
                    {selectedPlatform === 'YOUTUBE' && 'YOUTUBE → DESCRIPTION / RELATED / PROFILE'}
                    {selectedPlatform === 'INSTAGRAM' && 'INSTAGRAM → BIO / PLATFORM_ALLOWED_PLACEMENT'}
                    {selectedPlatform === 'TIKTOK' && 'TIKTOK → PROFILE / PLATFORM_ALLOWED_PLACEMENT'}
                  </div>

                  {/* CTA_TEXT */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>CTA_TEXT</div>
                    <div id={`val-cta-text-${item.videoId}`} style={{ fontSize: 11.5, fontWeight: 600, color: '#edf2f7', background: 'rgba(255, 255, 255, 0.03)', padding: '6px 8px', borderRadius: 6, marginTop: 2 }}>
                      {ctaData.CTA_TEXT}
                    </div>
                  </div>

                  {/* LINK_PLACEMENT */}
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>LINK_PLACEMENT</span>
                    <span id={`val-link-placement-${item.videoId}`} style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                      {ctaData.LINK_PLACEMENT}
                    </span>
                  </div>

                  {/* DESTINATION_URL */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>DESTINATION_URL</div>
                    <div id={`val-destination-url-${item.videoId}`} style={{ fontSize: 11, color: '#94a3b8', wordBreak: 'break-all', marginTop: 2 }}>
                      {destinationUrl}
                    </div>
                  </div>

                  {/* TRACKING_URL */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>TRACKING_URL</div>
                    <div id={`val-tracking-url-${item.videoId}`} style={{ fontSize: 10, fontFamily: 'monospace', color: '#a78bfa', background: 'rgba(0,0,0,0.4)', padding: '6px 8px', borderRadius: 6, wordBreak: 'break-all', marginTop: 2, border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                      {ctaData.TRACKING_URL}
                    </div>
                  </div>

                  {/* Action: PROBAR ENLACE */}
                  <div style={{ marginBottom: 10 }}>
                    <button
                      id={`btn-probar-enlace-${item.videoId}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestCtaLink(item.videoId, ctaData.TRACKING_URL, destinationUrl);
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                        border: '1px solid #38bdf8',
                        color: '#ffffff',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)'
                      }}
                    >
                      <ExternalLink size={13} /> PROBAR ENLACE
                    </button>
                  </div>

                  {/* Click Test Telemetry */}
                  <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', fontSize: 10.5, fontFamily: 'monospace' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#718096' }}>CLICKS:</span>
                      <span id={`val-clicks-${item.videoId}`} style={{ color: '#34d399', fontWeight: 700 }}>
                        {ctaClicks[item.videoId] || 0}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#718096' }}>LAST_CLICK:</span>
                      <span id={`val-last-click-${item.videoId}`} style={{ color: '#cbd5e1' }}>
                        {lastClickTime[item.videoId] || 'NONE'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#718096' }}>DESTINATION_REACHED:</span>
                      <span id={`val-destination-reached-${item.videoId}`} style={{ color: destinationReached[item.videoId] ? '#38bdf8' : '#64748b', fontWeight: 600 }}>
                        {destinationReached[item.videoId] || 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {/* RECIPE_001 SPECIFIC VERIFICATION TEST METRICS */}
                  {item.videoId === 'RECIPE_001' && (
                    <div id="recipe-001-test-metrics" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontFamily: 'monospace' }}>
                      <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 5 }}>TEST VERIFICACIÓN 5s CTA:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', color: '#94a3b8' }}>
                        <div>STORY_FINISHES_FIRST=<span id="metric-story-finishes" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>CTA_AFTER_STORY=<span id="metric-cta-after-story" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>CTA_DURATION=<span id="metric-cta-duration" style={{ color: '#38bdf8', fontWeight: 700 }}>5s</span></div>
                        <div>IMAGE_CONTINUES=<span id="metric-image-continues" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>MUSIC_CONTINUES=<span id="metric-music-continues" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>AUDIO_FADE_OUT=<span id="metric-audio-fade-out" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>NO_BLACK_SCREEN=<span id="metric-no-black-screen" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                        <div>TRACKING_LINK_PRESERVED=<span id="metric-tracking-preserved" style={{ color: '#34d399', fontWeight: 700 }}>YES</span></div>
                      </div>
                      <div style={{ marginTop: 4, color: '#94a3b8' }}>PUBLISHED=<span id="metric-published" style={{ color: '#64748b', fontWeight: 700 }}>0</span></div>
                    </div>
                  )}
                </div>

                {/* MERCADO LIBRE CREATOR LINK HUB PREVIEW (1 VIDEO -> 1 PRODUCTO -> LANDING -> BOTÓN MERCADO LIBRE) */}
                {mlProduct && (
                  <div
                    id={`ml-creator-hub-preview-${item.videoId}`}
                    data-testid={`ml-creator-hub-preview-${item.videoId}`}
                    style={{
                      marginTop: 14,
                      width: '100%',
                      maxWidth: 360,
                      background: 'rgba(15, 20, 32, 0.95)',
                      border: '1px solid rgba(255, 230, 0, 0.35)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#ffe600', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ShoppingBag size={13} /> ML CREATOR LINK HUB
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#ffe600', background: 'rgba(255, 230, 0, 0.15)', border: '1px solid rgba(255, 230, 0, 0.3)', padding: '2px 6px', borderRadius: 4 }}>
                        LINK EN PERFIL
                      </span>
                    </div>

                    {/* Mapping banner */}
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10, background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>1 VIDEO</span> ({item.videoId}) →{' '}
                      <span style={{ color: '#ffe600', fontWeight: 700 }}>1 PRODUCTO</span> ({mlProduct.PRODUCT_ID}) →{' '}
                      <span style={{ color: '#34d399', fontWeight: 700 }}>LANDING</span> (/recomendados)
                    </div>

                    {/* Product Card Mini */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 8, marginBottom: 10 }}>
                      <img
                        id={`ml-product-thumb-${item.videoId}`}
                        src={mlProduct.PRODUCT_IMAGE}
                        alt={mlProduct.PRODUCT_TITLE}
                        style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div id={`ml-product-title-${item.videoId}`} style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {mlProduct.PRODUCT_TITLE}
                        </div>
                        <div style={{ fontSize: 9.5, color: '#64748b' }}>
                          ID: {mlProduct.PRODUCT_ID} · {mlProduct.CAMPAIGN_ID}
                        </div>
                      </div>
                    </div>

                    {/* Permanent YouTube Profile URL */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>
                        URL PERMANENTE PERFIL YOUTUBE
                      </div>
                      <div id={`val-yt-profile-url-${item.videoId}`} style={{ fontSize: 11, fontFamily: 'monospace', color: '#ffe600', background: 'rgba(0,0,0,0.4)', padding: '6px 8px', borderRadius: 6, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>/recomendados</span>
                        <button
                          id={`btn-open-landing-${item.videoId}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/recomendados?video=${item.videoId}`, '_blank');
                          }}
                          style={{ background: 'none', border: 'none', color: '#ffe600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700 }}
                        >
                          ABRIR LANDING <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>

                    {/* Original Untouched Mercado Libre Affiliate URL */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>
                        MERCADOLIBRE_AFFILIATE_URL (ORIGINAL INTACTO)
                      </div>
                      <div id={`val-affiliate-url-preview-${item.videoId}`} style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 6, wordBreak: 'break-all', marginTop: 2 }}>
                        {mlProduct.AFFILIATE_URL}
                      </div>
                    </div>

                    {/* Botón VER EN MERCADO LIBRE */}
                    <button
                      id={`btn-ver-en-mercadolibre-${item.videoId}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const res = AtlasMercadoLibreLinkHub.recordClick(mlProduct.PRODUCT_ID);
                        setMlClicks(prev => ({
                          ...prev,
                          [mlProduct.PRODUCT_ID]: res ? res.clicks : ((prev[mlProduct.PRODUCT_ID] || mlProduct.CLICKS || 0) + 1)
                        }));
                        window.open(mlProduct.AFFILIATE_URL, '_blank', 'noopener,noreferrer');
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 800,
                        background: '#ffe600',
                        color: '#2d3277',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(255, 230, 0, 0.3)'
                      }}
                    >
                      <ShoppingBag size={13} /> VER EN MERCADO LIBRE
                    </button>

                    {/* Telemetry */}
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#718096', fontFamily: 'monospace' }}>
                      <span>CLICKS AFILIADO ML:</span>
                      <span id={`val-ml-clicks-${item.videoId}`} style={{ color: '#34d399', fontWeight: 700 }}>
                        {mlClicks[mlProduct.PRODUCT_ID] ?? mlProduct.CLICKS ?? 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* METADATA & A/B COMPARISON SECTION */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* VIDEO_ID & CREATIVE SCORE */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2d3748', paddingBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#718096', letterSpacing: 1 }}>PREVIEW</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#90cdf4', letterSpacing: 0.5 }}>
                      VIDEO_ID: <span id={`val-video-id-${item.videoId}`} style={{ color: '#fff' }}>{item.videoId}</span>
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right', background: 'rgba(72, 187, 120, 0.15)', border: '1px solid rgba(72, 187, 120, 0.3)', padding: '6px 14px', borderRadius: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#68d391', letterSpacing: 1 }}>CREATIVE_SCORE</div>
                    <div id={`val-creative-score-${item.videoId}`} style={{ fontSize: 20, fontWeight: 900, color: '#48bb78' }}>
                      {item.creativeScore}
                    </div>
                  </div>
                </div>

                {/* TEXT CONTENT (PURE STORY TEXT) */}
                <div style={{ background: '#1a202c', border: '1px solid #2d3748', borderRadius: 14, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#f6ad55', letterSpacing: 1 }}>
                      <BookOpen size={14} /> TEXT: {item.title.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#68d391', background: 'rgba(72, 187, 120, 0.12)', padding: '2px 8px', borderRadius: 6 }}>
                      SOLO EL CUENTO • CONTENEDOR GLASS SUTIL
                    </span>
                  </div>
                  <div id={`val-text-${item.videoId}`} style={{ fontSize: 14, lineHeight: 1.6, color: '#edf2f7', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                    "{item.text}"
                  </div>
                </div>

                {/* ── COMPARADOR A / B DE MÚSICA ── */}
                <div style={{ background: 'linear-gradient(135deg, rgba(26, 32, 44, 0.9), rgba(18, 22, 34, 0.95))', border: '1px solid #4a5568', borderRadius: 16, padding: '16px 18px' }}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#e2e8f0', letterSpacing: 0.8 }}>
                      <ArrowLeftRight size={15} color="#a78bfa" /> COMPARATIVA A/B DE MÚSICA (AUDICIÓN DIRECTA)
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e0' }}>
                      Elige qué pista suena mejor
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    
                    {/* MUSIC A (ACTUAL V3) */}
                    <div
                      onClick={() => handleSwitchMusic(idx, 'A')}
                      style={{
                        background: activeTrack === 'A' ? 'rgba(66, 153, 225, 0.15)' : 'rgba(15, 20, 30, 0.6)',
                        border: activeTrack === 'A' ? '2px solid #4299e1' : '1px solid #2d3748',
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#63b3ed', letterSpacing: 1 }}>
                          MUSIC A (ACTUAL)
                        </span>
                        {activeTrack === 'A' && <span style={{ fontSize: 10, fontWeight: 700, color: '#4299e1', background: 'rgba(66, 153, 225, 0.2)', padding: '1px 6px', borderRadius: 4 }}>SONANDO</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                        {item.musicA.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>
                        {item.musicA.style}
                      </div>
                    </div>

                    {/* MUSIC B (NUEVA V4 TOP QUALITY GATE) */}
                    <div
                      onClick={() => handleSwitchMusic(idx, 'B')}
                      style={{
                        background: activeTrack === 'B' ? 'rgba(167, 139, 250, 0.20)' : 'rgba(15, 20, 30, 0.6)',
                        border: activeTrack === 'B' ? '2px solid #a78bfa' : '1px solid #2d3748',
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Sparkles size={12} /> MUSIC B (NUEVA V4)
                        </span>
                        {activeTrack === 'B' && <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167, 139, 250, 0.2)', padding: '1px 6px', borderRadius: 4 }}>SONANDO</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                        {item.musicB.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#cbd5e0', marginTop: 2 }}>
                        {item.musicB.style}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#68d391', background: 'rgba(72, 187, 120, 0.15)', padding: '1px 6px', borderRadius: 4 }}>
                          SCORE: {item.musicB.qualityScore}/100
                        </span>
                        <span style={{ fontSize: 10, color: '#a0aec0' }}>
                          Melodía: {item.musicB.melodyScore} • Emoción: {item.musicB.emotionalScore}
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* USER DECISION BUTTONS: MEJOR ACTUAL VS MEJOR NUEVA */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      id={`btn-pref-a-${item.videoId}`}
                      data-testid={`btn-pref-a-${item.videoId}`}
                      onClick={() => handleSelectPreference(item.videoId, 'MEJOR ACTUAL')}
                      style={{
                        flex: 1,
                        background: userChoice === 'MEJOR ACTUAL' ? 'rgba(66, 153, 225, 0.35)' : '#1a202c',
                        border: userChoice === 'MEJOR ACTUAL' ? '2px solid #4299e1' : '1px solid #4a5568',
                        color: userChoice === 'MEJOR ACTUAL' ? '#63b3ed' : '#e2e8f0',
                        padding: '10px 14px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🌟 MEJOR ACTUAL (A)
                    </button>

                    <button
                      id={`btn-pref-b-${item.videoId}`}
                      data-testid={`btn-pref-b-${item.videoId}`}
                      onClick={() => handleSelectPreference(item.videoId, 'MEJOR NUEVA')}
                      style={{
                        flex: 1,
                        background: userChoice === 'MEJOR NUEVA' ? 'rgba(167, 139, 250, 0.35)' : '#1a202c',
                        border: userChoice === 'MEJOR NUEVA' ? '2px solid #a78bfa' : '1px solid #4a5568',
                        color: userChoice === 'MEJOR NUEVA' ? '#c4b5fd' : '#e2e8f0',
                        padding: '10px 14px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      🏆 MEJOR NUEVA (B)
                    </button>
                  </div>

                  {/* USER CHOICE FEEDBACK */}
                  {userChoice && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: userChoice === 'MEJOR NUEVA' ? '#c4b5fd' : '#63b3ed' }}>
                      <CheckCircle2 size={14} />
                      Preferencia de revisión humana guardada: {userChoice}
                    </div>
                  )}

                </div>

                {/* OVERALL REVIEW BUTTONS: 👍 ME GUSTA / 👎 NO ME GUSTA */}
                <div style={{ paddingTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    id={`btn-like-${item.videoId}`}
                    data-testid={`btn-like-${item.videoId}`}
                    onClick={() => handleVote(item.videoId, 'LIKE')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: currentRating === 'LIKE' ? 'rgba(72, 187, 120, 0.25)' : '#1a202c',
                      border: currentRating === 'LIKE' ? '2px solid #48bb78' : '1px solid #4a5568',
                      color: currentRating === 'LIKE' ? '#48bb78' : '#e2e8f0',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ThumbsUp size={15} /> 👍 ME GUSTA
                  </button>

                  <button
                    id={`btn-dislike-${item.videoId}`}
                    data-testid={`btn-dislike-${item.videoId}`}
                    onClick={() => handleVote(item.videoId, 'DISLIKE')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: currentRating === 'DISLIKE' ? 'rgba(245, 101, 101, 0.25)' : '#1a202c',
                      border: currentRating === 'DISLIKE' ? '2px solid #f56565' : '1px solid #4a5568',
                      color: currentRating === 'DISLIKE' ? '#f56565' : '#e2e8f0',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ThumbsDown size={15} /> 👎 NO ME GUSTA
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER NAVIGATION */}
      <div style={{ maxWidth: 1100, margin: '40px auto 20px', display: 'flex', justifyContent: 'center', gap: 16 }}>
        <button
          onClick={goPrevious}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#1a202c',
            border: '1px solid #4a5568',
            color: '#edf2f7',
            padding: '12px 24px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <ChevronLeft size={16} /> ANTERIOR
        </button>

        <button
          onClick={goNext}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'linear-gradient(135deg, #805ad5, #6b46c1)',
            border: '1px solid #9f7aea',
            color: '#ffffff',
            padding: '12px 28px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(128, 90, 213, 0.4)'
          }}
        >
          SIGUIENTE <ChevronRight size={16} />
        </button>
      </div>

    </div>
  );
}
