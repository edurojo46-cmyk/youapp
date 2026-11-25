import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, Play, Radio } from 'lucide-react';
import { useSignalStore } from '../lib/tv/signalStore';
import {
  buildCustomSignalFromCurated,
  findCuratedSignalById
} from '../lib/tv/curatedSignalsCatalog';
import { loadPublicSignalById } from '../lib/tv/signalPersistence';
import { resolveKnownChannelAvatar } from '../lib/tv/channelIdentityCatalog';
import { buildYouAppVideoShareUrl } from '../lib/tv/youappShareHelper';
import type { CustomSignal } from '../lib/tv/signalTypes';

export default function DigitalAntennaEmbed() {
  const { signalId = 'justicia-social-signal-1' } = useParams<{ signalId: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'compact' ? 'compact' : 'full';
  const queryName = searchParams.get('name') || '';
  const queryVideoId = searchParams.get('v') || '';

  const { activeSignal, getSavedSignal } = useSignalStore();
  const [cloudSignal, setCloudSignal] = useState<CustomSignal | null>(null);
  const [playingInline, setPlayingInline] = useState(false);

  const localOrCurated = useMemo<CustomSignal | null>(() => {
    const curated = findCuratedSignalById(signalId);
    if (curated) return buildCustomSignalFromCurated(curated) as any;
    const saved = getSavedSignal(signalId);
    if (saved) return saved;
    if (activeSignal?.id === signalId) return activeSignal;
    return null;
  }, [activeSignal, getSavedSignal, signalId]);

  useEffect(() => {
    if (localOrCurated) return;
    loadPublicSignalById(signalId)
      .then((sig) => {
        if (sig) setCloudSignal(sig);
      })
      .catch(() => {});
  }, [localOrCurated, signalId]);

  const resolvedSignal = localOrCurated || cloudSignal;
  const signalName = resolvedSignal?.name || queryName || 'Mi Señal · YOUAPP TV';
  const featuredBlock = resolvedSignal?.schedule?.[0] || null;
  const featuredVideoId =
    featuredBlock?.contentItem?.providerId ||
    featuredBlock?.contentItem?.id ||
    queryVideoId ||
    '0cjWa3Eizqw';
  const featuredTitle =
    featuredBlock?.contentItem?.title || `Emisión destacada de ${signalName}`;
  const featuredThumb =
    featuredBlock?.contentItem?.thumbnail ||
    (featuredBlock?.contentItem as any)?.thumbnailUrl ||
    `https://i.ytimg.com/vi/${featuredVideoId}/hqdefault.jpg`;

  const avatarUrl = resolveKnownChannelAvatar(signalName);
  const initial = (signalName.trim()[0] || 'Y').toUpperCase();
  const extraItems = (resolvedSignal?.schedule || []).slice(1, 3);

  const followUrl = buildYouAppVideoShareUrl({
    videoId: featuredVideoId,
    title: featuredTitle,
    channelName: signalName
  });

  return (
    <div className={`ant-root ${mode}`}>
      <div className="ant-card">
        {/* Cabecera identidad de la señal */}
        <div className="ant-head">
          <div className="ant-id">
            <span className="ant-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={signalName} /> : <span>{initial}</span>}
            </span>
            <div className="ant-meta">
              <span className="ant-live-tag">
                <Radio size={10} /> ANTENA DIGITAL · YOUAPP
              </span>
              <h1>{signalName}</h1>
            </div>
          </div>

          <a
            href={followUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ant-follow-btn"
          >
            <span>Seguir señal</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Video destacado reproducible */}
        <div className="ant-media">
          {playingInline ? (
            <iframe
              className="ant-iframe"
              src={`https://www.youtube.com/embed/${featuredVideoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={featuredTitle}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="ant-poster-btn"
              onClick={() => setPlayingInline(true)}
              aria-label={`Reproducir ${featuredTitle}`}
            >
              <img src={featuredThumb} alt={featuredTitle} />
              <div className="ant-poster-scrim" />
              <span className="ant-play-pill">
                <Play size={16} fill="currentColor" />
                <span>Reproducir</span>
              </span>
              <div className="ant-poster-title">{featuredTitle}</div>
            </button>
          )}
        </div>

        {/* En modo completo, muestra 2 bloques más de la señal */}
        {mode === 'full' && extraItems.length > 0 && (
          <div className="ant-more-list">
            {extraItems.map((blk) => {
              const vid = blk.contentItem.providerId || blk.contentItem.id;
              const link = buildYouAppVideoShareUrl({
                videoId: vid,
                title: blk.contentItem.title,
                channelName: signalName
              });
              return (
                <a
                  key={blk.id}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ant-more-row"
                >
                  <img
                    src={
                      blk.contentItem.thumbnail ||
                      (blk.contentItem as any).thumbnailUrl ||
                      `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
                    }
                    alt={blk.contentItem.title}
                  />
                  <span>{blk.contentItem.title}</span>
                  <ExternalLink size={12} color="#6e6e73" />
                </a>
              );
            })}
          </div>
        )}

        <div className="ant-foot">
          <span>Transmitido con <strong>YOUAPP TV</strong></span>
          <a href={followUrl} target="_blank" rel="noopener noreferrer">
            Abrir señal completa →
          </a>
        </div>
      </div>

      <style>{`
        .ant-root {
          min-height: 100vh;
          padding: 8px;
          box-sizing: border-box;
          background: transparent;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          color: #1d1d1f;
        }
        .ant-card {
          max-width: 540px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.09);
          border-radius: 20px;
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .ant-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }
        .ant-id {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .ant-avatar {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 750;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .ant-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .ant-meta { min-width: 0; flex: 1; }
        .ant-live-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .ant-meta h1 {
          margin: 1px 0 0;
          font-size: 15px;
          font-weight: 750;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ant-follow-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          background: #0071e3;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
          text-decoration: none;
          flex-shrink: 0;
        }
        .ant-media {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
        }
        .ant-root.compact .ant-media {
          aspect-ratio: 21 / 9;
        }
        .ant-iframe {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
        .ant-poster-btn {
          position: relative;
          width: 100%;
          height: 100%;
          padding: 0;
          border: none;
          background: #000000;
          cursor: pointer;
          display: block;
          text-align: left;
        }
        .ant-poster-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ant-poster-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.72) 100%);
        }
        .ant-play-pill {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.94);
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
        }
        .ant-poster-title {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 10px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 680;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ant-more-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
        }
        .ant-more-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 8px;
          border-radius: 12px;
          background: #f5f5f7;
          color: #1d1d1f;
          text-decoration: none;
          font-size: 12px;
          font-weight: 600;
        }
        .ant-more-row img {
          width: 48px;
          height: 28px;
          border-radius: 7px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ant-more-row span {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ant-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 14px;
          background: #f8fafc;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          font-size: 11px;
          color: #6e6e73;
        }
        .ant-foot a {
          color: #0071e3;
          font-weight: 650;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}
