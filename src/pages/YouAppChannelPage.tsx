import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Play, Plus, Share2, SlidersHorizontal, Tv } from 'lucide-react';
import { shareYouAppVideo } from '../lib/tv/youappShareHelper';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { YouAppPlayer, type YouAppPlayerHandle } from '../components/player/YouAppPlayer';
import { SmartBar } from '../components/smartbar/SmartBar';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSignalStore } from '../lib/tv/signalStore';
import {
  fetchChannelLiveVideos,
  resolveChannelProfile,
  type ChannelVideoItem
} from '../lib/tv/channelIdentityCatalog';
import type { ScheduleBlock } from '../lib/tv/signalTypes';

function formatDuration(sec: number): string {
  const safe = Math.max(1, Math.round(sec || 60));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function YouAppChannelPage() {
  const { channelSlug = '' } = useParams<{ channelSlug: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { activeSignal, savedSignalsById, getSavedSignal, setSignal, insert } = useSignalStore();
  const playbackState = usePlayerStore((s) => s.playbackState);
  const userAudioUnlocked = usePlayerStore((s) => s.userAudioUnlocked);
  const isPlaying = playbackState === 'playing';

  const playerRef = useRef<YouAppPlayerHandle>(null);

  const profile = useMemo(
    () =>
      resolveChannelProfile(channelSlug, {
        activeSignal,
        savedSignalsById,
        routeState: (location.state as any) || null
      }),
    [channelSlug, activeSignal, savedSignalsById, location.state]
  );

  const [selectedVideoIdx, setSelectedVideoIdx] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [previewVidId, setPreviewVidId] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const [liveVideos, setLiveVideos] = useState<ChannelVideoItem[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(15);

  useEffect(() => {
    setSelectedVideoIdx(0);
    setVisibleLimit(15);
    setLiveVideos([]);
    if (!profile.channelId) return;
    let cancelled = false;
    setIsLoadingLive(true);
    fetchChannelLiveVideos(profile.channelId, profile.name, profile.originUrl, 36)
      .then((fetched) => {
        if (!cancelled && fetched.length > 0) {
          setLiveVideos(fetched);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.channelId, profile.name, profile.originUrl]);

  const allVideos = useMemo(() => {
    const map = new Map<string, ChannelVideoItem>();
    for (const v of profile.videos) {
      if (v.videoId && !map.has(v.videoId)) map.set(v.videoId, v);
    }
    for (const v of liveVideos) {
      if (v.videoId && !map.has(v.videoId)) map.set(v.videoId, v);
    }
    return Array.from(map.values());
  }, [profile.videos, liveVideos]);

  const visibleVideos = allVideos.slice(0, visibleLimit);
  const hasMoreVideos = allVideos.length > visibleLimit;

  const activeVideo: ChannelVideoItem | null = allVideos[selectedVideoIdx] || allVideos[0] || null;

  const personalSignal = getSavedSignal('justicia-social-signal-1') || (activeSignal && !activeSignal.id.startsWith('curated-') ? activeSignal : null);
  const personalVideoIds = useMemo(
    () => new Set((personalSignal?.schedule || []).map((b) => b.contentItem.providerId || b.contentItem.id)),
    [personalSignal]
  );

  const allInPersonal =
    allVideos.length > 0 && allVideos.slice(0, 2).every((v) => personalVideoIds.has(v.videoId));

  const buildBlockFromVideo = (v: ChannelVideoItem, position: number): ScheduleBlock => ({
    id: `ch-${profile.slug}-${v.videoId}-${Date.now()}`,
    position,
    startOffsetSec: position * 600,
    durationSec: v.durationSec || 600,
    topic: v.topic || profile.name,
    role: 'explainer',
    contentItem: {
      id: v.videoId,
      providerId: v.videoId,
      type: 'video',
      provider: 'youtube',
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      thumbnail: v.thumbnailUrl,
      videoUrl: v.videoUrl,
      channelName: profile.name,
      channelTitle: profile.name,
      channelId: profile.slug,
      originUrl: v.originUrl || profile.originUrl,
      isLive: false,
      isVerified: true
    } as any
  });

  const handleAddVideosToPersonalSignal = (videosToAdd: ChannelVideoItem[]) => {
    if (!videosToAdd.length) return;
    const targetPersonal = getSavedSignal('justicia-social-signal-1');

    if (targetPersonal && activeSignal?.id === targetPersonal.id) {
      let added = 0;
      for (const v of videosToAdd) {
        if (personalVideoIds.has(v.videoId)) continue;
        insert(buildBlockFromVideo(v, activeSignal.schedule.length + added), activeSignal.schedule.length + added - 1);
        added += 1;
      }
      setToastMsg(
        added > 0
          ? `Se sumó ${added === 1 ? '1 video' : `${added} videos`} de ${profile.name} a Mi Señal.`
          : `${profile.name} ya estaba en Mi Señal.`
      );
      return;
    }

    const existingSchedule = targetPersonal?.schedule ? [...targetPersonal.schedule] : [];
    const existingSet = new Set(existingSchedule.map((b) => b.contentItem.providerId || b.contentItem.id));
    let added = 0;
    for (const v of videosToAdd) {
      if (existingSet.has(v.videoId)) continue;
      existingSet.add(v.videoId);
      existingSchedule.push(buildBlockFromVideo(v, existingSchedule.length));
      added += 1;
    }

    if (added > 0) {
      setSignal({
        id: targetPersonal?.id || 'justicia-social-signal-1',
        name: targetPersonal?.name || 'Justicia Social TV',
        seedVersion: 5,
        prompt: targetPersonal?.prompt || 'Mi señal personal en YOUAPP',
        visibility: 'public',
        created_at: targetPersonal?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        schedule: existingSchedule
      } as any);
      setToastMsg(`Se sumó ${added === 1 ? '1 video' : `${added} videos`} de ${profile.name} a Mi Señal.`);
    } else {
      setToastMsg(`${profile.name} ya estaba en Mi Señal.`);
    }
  };

  const initial = (profile.name.trim()[0] || 'C').toUpperCase();

  return (
    <div className="ych-page">
      {/* Cabecera Apple Glass */}
      <nav className="ych-topnav">
        <div className="ych-nav-left">
          <button
            type="button"
            className="ych-back-btn"
            onClick={() => navigate('/misenal1')}
            title="Volver a Mi Señal"
          >
            <ArrowLeft size={14} />
            <span>Mi Señal</span>
          </button>
          <div className="ych-divider" />
          <YouAppOfficialLogo theme="light" />
        </div>

        <div className="ych-nav-links">
          <button type="button" className="ych-nav-btn" onClick={() => navigate('/')}>
            Descubrir
          </button>
          <button type="button" className="ych-nav-btn" onClick={() => navigate('/misenal1')}>
            Mi Señal
          </button>
          <button type="button" className="ych-nav-btn" onClick={() => navigate('/repetidoras')}>
            Repetidoras
          </button>
          <button type="button" className="ych-nav-pill" onClick={() => navigate('/mitv')}>
            <SlidersHorizontal size={13} /> MiTV
          </button>
        </div>

        <div className="ych-user-area">
          <TvUserSessionMenu />
        </div>
      </nav>

      <main className="ych-shell">
        {/* Tarjeta Hero del Canal: portada completa (o espacio limpio en blanco) + avatar + acciones */}
        <section className="ych-hero-card">
          <div className={`ych-hero-banner ${profile.coverUrl ? 'has-img' : ''}`}>
            {profile.coverUrl && (
              <img
                src={profile.coverUrl}
                alt={`Portada oficial de ${profile.name}`}
                className="ych-hero-banner-img"
              />
            )}
          </div>

          <div className="ych-hero-bar">
            <div className="ych-hero-identity">
              <div className="ych-hero-avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.name} />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="ych-hero-text">
                <div className="ych-hero-title-row">
                  <h1>{profile.name}</h1>
                  <span className="ych-count-pill">
                    {allVideos.length} {allVideos.length === 1 ? 'video' : 'videos'}
                  </span>
                </div>
                <p>{profile.subtitle}</p>
              </div>
            </div>

            <div className="ych-hero-actions">
              <button
                type="button"
                className={`ych-btn-primary ${allInPersonal ? 'added' : ''}`}
                onClick={() => handleAddVideosToPersonalSignal(allVideos.slice(0, 2))}
              >
                {allInPersonal ? <Check size={14} /> : <Plus size={14} />}
                <span>{allInPersonal ? 'En Mi Señal' : 'Sumar a Mi Señal'}</span>
              </button>

              <button
                type="button"
                className="ych-btn-secondary"
                onClick={async () => {
                  if (!activeVideo) return;
                  const curTime = usePlayerStore.getState().currentTime;
                  const res = await shareYouAppVideo({
                    videoId: activeVideo.videoId,
                    startSec: curTime,
                    title: activeVideo.title,
                    channelName: profile.name
                  });
                  if (res.status === 'copied') {
                    setToastMsg('Enlace del video en YOUAPP copiado al portapapeles.');
                  }
                }}
                title="Compartir este video desde el inicio de YOUAPP"
              >
                <Share2 size={13} />
                <span>Compartir</span>
              </button>

              {profile.originUrl && (
                <a
                  href={profile.originUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ych-btn-secondary"
                  title={`Abrir canal oficial de ${profile.name} en YouTube`}
                >
                  <span>Ver en YouTube</span>
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          {toastMsg && (
            <div className="ych-toast" role="status">
              <span>{toastMsg}</span>
              <button
                type="button"
                className="ych-toast-link"
                onClick={() => navigate('/misenal1')}
              >
                <Tv size={12} /> Ir a Mi Señal
              </button>
            </div>
          )}
        </section>

        {/* Reproductor YOUAPP + Barra Viva */}
        {activeVideo && (
          <section className="ych-player-wrap">
            <div className="ych-now-top-header">
              <div className="ych-now-avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.name} />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="ych-now-meta">
                <h2>{activeVideo.title}</h2>
                <p>
                  {profile.name} · {formatDuration(activeVideo.durationSec)}
                </p>
              </div>
            </div>

            <div className="ych-stage">
              <YouAppPlayer
                ref={playerRef}
                item={{
                  blockId: activeVideo.id,
                  provider: 'youtube',
                  providerContentId: activeVideo.videoId,
                  playbackUrl: activeVideo.videoUrl,
                  title: activeVideo.title,
                  durationSec: activeVideo.durationSec,
                  autoplay: false,
                  muted: !userAudioUnlocked
                }}
                onEnded={() => {
                  if (selectedVideoIdx < allVideos.length - 1) {
                    setSelectedVideoIdx((i) => i + 1);
                  }
                }}
              />
            </div>

            <div className="ych-smartbar-wrap">
              <SmartBar
                isPlaying={isPlaying}
                onPlayPause={() => (isPlaying ? playerRef.current?.pause() : playerRef.current?.play())}
                onSeek={(t) => void playerRef.current?.seek(t)}
                isMosaic={false}
                onToggleMosaic={() => navigate('/you4')}
                moments={[]}
                onSelectMoment={(m) => void playerRef.current?.seek(m.startSec)}
                onNextBlock={() =>
                  setSelectedVideoIdx((i) => (allVideos.length ? (i + 1) % allVideos.length : 0))
                }
                onPreviousBlock={() =>
                  setSelectedVideoIdx((i) =>
                    allVideos.length ? (i - 1 + allVideos.length) % allVideos.length : 0
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Grilla de videos del canal */}
        <section className="ych-videos-section">
          <div className="ych-section-head">
            <h3>
              Videos de {profile.name}
              {isLoadingLive && <span className="ych-loading-tag"> · Cargando últimos videos…</span>}
            </h3>
            <span>Mostrando {visibleVideos.length} de {allVideos.length} videos</span>
          </div>

          <div className="ych-videos-grid">
            {visibleVideos.map((v, idx) => {
              const isSelected = activeVideo?.videoId === v.videoId;
              const isInPersonal = personalVideoIds.has(v.videoId);
              const isPreviewing = previewVidId === v.videoId;

              return (
                <article
                  key={v.videoId}
                  className={`ych-video-card ${isSelected ? 'active' : ''}`}
                  onMouseEnter={() => {
                    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
                    previewTimerRef.current = window.setTimeout(() => setPreviewVidId(v.videoId), 240);
                  }}
                  onMouseLeave={() => {
                    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
                    setPreviewVidId((cur) => (cur === v.videoId ? null : cur));
                  }}
                >
                  <button
                    type="button"
                    className="ych-video-thumb-btn"
                    onClick={() => {
                      setPreviewVidId(null);
                      setSelectedVideoIdx(idx);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <img src={v.thumbnailUrl} alt={v.title} />
                    {isPreviewing && !isSelected && (
                      <iframe
                        className="ych-preview-frame"
                        src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3`}
                        title={`Vista previa de ${v.title}`}
                        allow="autoplay; encrypted-media"
                        tabIndex={-1}
                      />
                    )}
                    <span className="ych-dur-badge">{formatDuration(v.durationSec)}</span>
                    {isSelected && (
                      <span className="ych-playing-badge">
                        <Play size={10} fill="currentColor" /> Reproduciendo
                      </span>
                    )}
                  </button>

                  <div className="ych-video-body">
                    <button
                      type="button"
                      className="ych-video-title-btn"
                      onClick={() => {
                        setSelectedVideoIdx(idx);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <h4>{v.title}</h4>
                      <p>{v.topic}</p>
                    </button>

                    <div className="ych-video-foot">
                      <button
                        type="button"
                        className={`ych-mini-add ${isInPersonal ? 'added' : ''}`}
                        onClick={() => handleAddVideosToPersonalSignal([v])}
                      >
                        {isInPersonal ? <Check size={11} /> : <Plus size={11} />}
                        <span>{isInPersonal ? 'En Mi Señal' : 'Sumar a Mi Señal'}</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMoreVideos && (
            <div className="ych-load-more-row">
              <button
                type="button"
                className="ych-load-more-btn"
                onClick={() => setVisibleLimit((n) => n + 12)}
              >
                <Plus size={14} />
                <span>Ver más videos ({allVideos.length - visibleLimit} disponibles)</span>
              </button>
            </div>
          )}
        </section>
      </main>

      <style>{`
        .ych-page {
          min-height: 100dvh;
          background: #f5f5f7;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          padding-bottom: 48px;
        }
        .ych-topnav {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .ych-nav-left, .ych-nav-links, .ych-user-area {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ych-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ych-back-btn:hover {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.16);
        }
        .ych-divider {
          width: 1px;
          height: 18px;
          background: rgba(0, 0, 0, 0.1);
        }
        .ych-nav-btn {
          border: none;
          background: transparent;
          color: #424245;
          font-size: 13px;
          font-weight: 550;
          padding: 6px 10px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ych-nav-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #1d1d1f;
        }
        .ych-nav-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: none;
          background: #1d1d1f;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 999px;
          cursor: pointer;
        }
        .ych-shell {
          max-width: 1120px;
          margin: 0 auto;
          padding: 20px 18px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .ych-hero-card {
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          overflow: hidden;
        }
        .ych-hero-banner {
          width: 100%;
          aspect-ratio: 1138 / 188;
          min-height: 92px;
          background: #ffffff;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .ych-hero-banner.has-img {
          aspect-ratio: auto;
          background: #111216;
          border-bottom: none;
          min-height: 0;
        }
        .ych-hero-banner-img {
          width: 100%;
          height: auto;
          max-height: 210px;
          object-fit: contain;
          display: block;
        }
        .ych-hero-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 22px;
          flex-wrap: wrap;
        }
        .ych-hero-identity {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1;
        }
        .ych-hero-avatar {
          width: 68px;
          height: 68px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 24px;
          font-weight: 750;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
        }
        .ych-hero-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ych-hero-text {
          min-width: 0;
        }
        .ych-hero-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ych-hero-text h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 750;
          letter-spacing: -0.028em;
          color: #1d1d1f;
        }
        .ych-count-pill {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.1);
          color: #6e6e73;
          font-size: 11.5px;
          font-weight: 600;
        }
        .ych-hero-text p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #6e6e73;
        }
        .ych-hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ych-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.16s ease, transform 0.16s ease;
        }
        .ych-btn-primary:hover {
          background: #0077ed;
          transform: translateY(-0.5px);
        }
        .ych-btn-primary.added {
          background: #248a3d;
        }
        .ych-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #ffffff;
          color: #1d1d1f;
          text-decoration: none;
          font-size: 12.5px;
          font-weight: 600;
          transition: background 0.16s ease, border-color 0.16s ease;
        }
        .ych-btn-secondary:hover {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.18);
        }
        .ych-toast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 22px 16px;
          padding: 10px 14px;
          border-radius: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12.5px;
          font-weight: 600;
        }
        .ych-toast-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          border: none;
          background: #166534;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .ych-player-wrap {
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ych-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          max-height: 520px;
          border-radius: 18px;
          overflow: hidden;
          background: #000000;
        }
        .ych-now-top-header {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 2px 4px;
          min-width: 0;
        }
        .ych-now-avatar {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1.5px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
        }
        .ych-now-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ych-now-meta {
          min-width: 0;
          flex: 1;
        }
        .ych-now-meta h2 {
          margin: 0;
          font-size: 15.5px;
          font-weight: 680;
          letter-spacing: -0.02em;
          color: #1d1d1f;
          line-height: 1.26;
        }
        .ych-now-meta p {
          margin: 2px 0 0;
          font-size: 12px;
          color: #6e6e73;
        }
        .ych-smartbar-wrap {
          width: 100%;
        }
        .ych-videos-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .ych-section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ych-section-head h3 {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .ych-section-head span {
          font-size: 12.5px;
          color: #6e6e73;
        }
        .ych-videos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 16px;
        }
        .ych-video-card {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .ych-video-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.07);
        }
        .ych-video-card.active {
          border-color: rgba(0, 113, 227, 0.45);
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
        }
        .ych-video-thumb-btn {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          padding: 0;
          border: none;
          background: #111216;
          overflow: hidden;
          cursor: pointer;
          display: block;
        }
        .ych-video-thumb-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ych-preview-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          pointer-events: none;
        }
        .ych-dur-badge {
          position: absolute;
          right: 8px;
          bottom: 8px;
          padding: 3px 7px;
          border-radius: 999px;
          background: rgba(29, 29, 31, 0.78);
          color: #ffffff;
          font-size: 11px;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
        }
        .ych-playing-badge {
          position: absolute;
          left: 8px;
          top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border-radius: 999px;
          background: #0071e3;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .ych-video-body {
          padding: 13px 14px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
          flex: 1;
        }
        .ych-video-title-btn {
          border: none;
          background: transparent;
          text-align: left;
          padding: 0;
          cursor: pointer;
        }
        .ych-video-title-btn h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 680;
          letter-spacing: -0.015em;
          color: #1d1d1f;
          line-height: 1.32;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ych-video-title-btn p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #6e6e73;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ych-video-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .ych-mini-add {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 620;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .ych-mini-add:hover {
          background: #0071e3;
          color: #ffffff;
          border-color: #0071e3;
        }
        .ych-mini-add.added {
          background: #f0fdf4;
          color: #166534;
          border-color: #bbf7d0;
        }
        .ych-loading-tag {
          font-size: 12px;
          font-weight: 500;
          color: #0071e3;
        }
        .ych-load-more-row {
          display: flex;
          justify-content: center;
          padding-top: 8px;
        }
        .ych-load-more-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 620;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .ych-load-more-btn:hover {
          background: #1d1d1f;
          color: #ffffff;
          border-color: #1d1d1f;
          transform: translateY(-1px);
        }
        @media (max-width: 720px) {
          .ych-nav-links { display: none; }
          .ych-hero-bar { padding: 14px 16px; }
          .ych-hero-avatar { width: 54px; height: 54px; font-size: 19px; }
          .ych-hero-text h1 { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
