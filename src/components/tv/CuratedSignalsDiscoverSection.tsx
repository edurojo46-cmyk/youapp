import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Clock,
  ExternalLink,
  ListChecks,
  Play,
  Plus,
  Radio,
  Sparkles,
  BookmarkPlus,
  Share2,
  Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  COUNTRY_CHANGED_EVENT,
  getActiveCountryProfile,
  type CountryProfile
} from '../../lib/geo/userCountry';
import { openWhatsAppSignalShare } from '../../lib/tv/youappShareHelper';
import { useSignalStore } from '../../lib/tv/signalStore';
import {
  CURATED_SIGNALS_PILOT,
  buildCustomSignalFromCurated,
  mergeCuratedIntoPersonalSignal,
  readCuratedPilotState,
  toggleFollowCuratedSignal,
  recordCuratedSignalSession,
  type CuratedSignalDefinition,
  type CuratedPilotState
} from '../../lib/tv/curatedSignalsCatalog';

interface CommunityPublicSignal {
  id: string;
  clientSignalId: string;
  name: string;
  prompt: string;
  itemCount: number;
  coverThumb: string;
}

const COMMUNITY_FOLLOWS_KEY = 'youapp_followed_community_signals_v1';

function readCommunityFollows(): string[] {
  try {
    const raw = localStorage.getItem(COMMUNITY_FOLLOWS_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CuratedSignalsDiscoverSection() {
  const navigate = useNavigate();
  const { activeSignal, setSignal } = useSignalStore();

  const [activeCountry, setActiveCountry] = useState<CountryProfile>(() => getActiveCountryProfile());
  const [communitySignals, setCommunitySignals] = useState<CommunityPublicSignal[]>([]);
  const [followedCommunityIds, setFollowedCommunityIds] = useState<string[]>(() => readCommunityFollows());
  const [quick15Mode, setQuick15Mode] = useState(false);
  const [pilotState, setPilotState] = useState<CuratedPilotState>(() => readCuratedPilotState());
  const [pickingSignalId, setPickingSignalId] = useState<string | null>(null);
  const [selectedBySignal, setSelectedBySignal] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const s of CURATED_SIGNALS_PILOT) {
      init[s.id] = s.channels.slice(0, 3).map((c) => c.id);
    }
    return init;
  });
  const [feedbackBanner, setFeedbackBanner] = useState<{
    text: string;
    ctaLabel?: string;
    ctaRoute?: string;
  } | null>(null);

  useEffect(() => {
    setPilotState(readCuratedPilotState());
    const onCountryChange = () => setActiveCountry(getActiveCountryProfile());
    window.addEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);

    let alive = true;
    (async () => {
      try {
        const { data: sigs } = await supabase
          .from('custom_signals')
          .select('id, client_signal_id, name, prompt, visibility')
          .eq('visibility', 'public')
          .order('updated_at', { ascending: false })
          .limit(8);
        if (!alive || !Array.isArray(sigs) || sigs.length === 0) return;

        const pgIds = sigs.map((s: any) => s.id).filter(Boolean);
        const { data: items } = await supabase
          .from('signal_schedule_items')
          .select('signal_id, thumbnail_url, provider_content_id, position')
          .in('signal_id', pgIds)
          .order('position', { ascending: true });

        const countBySig = new Map<string, number>();
        const thumbBySig = new Map<string, string>();
        for (const it of items || []) {
          const sid = String((it as any).signal_id);
          countBySig.set(sid, (countBySig.get(sid) || 0) + 1);
          if (!thumbBySig.has(sid)) {
            const t =
              (it as any).thumbnail_url ||
              ((it as any).provider_content_id && /^[A-Za-z0-9_-]{11}$/.test((it as any).provider_content_id)
                ? `https://i.ytimg.com/vi/${(it as any).provider_content_id}/hqdefault.jpg`
                : '');
            if (t) thumbBySig.set(sid, t);
          }
        }

        const mapped: CommunityPublicSignal[] = sigs
          .filter((s: any) => (countBySig.get(String(s.id)) || 0) > 0)
          .map((s: any) => ({
            id: String(s.id),
            clientSignalId: String(s.client_signal_id || s.id),
            name: String(s.name || 'Señal de la comunidad'),
            prompt: String(s.prompt || ''),
            itemCount: countBySig.get(String(s.id)) || 0,
            coverThumb: thumbBySig.get(String(s.id)) || ''
          }));
        if (alive) setCommunitySignals(mapped.slice(0, 6));
      } catch {
        // Optional public community feed
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener(COUNTRY_CHANGED_EVENT, onCountryChange);
    };
  }, []);

  const toggleFollowCommunity = (clientSignalId: string) => {
    setFollowedCommunityIds((prev) => {
      const next = prev.includes(clientSignalId)
        ? prev.filter((id) => id !== clientSignalId)
        : [...prev, clientSignalId];
      try {
        localStorage.setItem(COMMUNITY_FOLLOWS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleFollowAndWatchFull = (sig: CuratedSignalDefinition) => {
    const nextPilot = toggleFollowCuratedSignal(sig.id, true);
    recordCuratedSignalSession(
      sig.id,
      sig.channels.map((c) => c.originUrl),
      quick15Mode
    );
    setPilotState(readCuratedPilotState() || nextPilot);

    const built = buildCustomSignalFromCurated(sig, { quick15Min: quick15Mode });
    setSignal(built as any);
    navigate(
      `/misenal1?signal=${encodeURIComponent(sig.id)}${quick15Mode ? '&quick15=1' : ''}`
    );
  };

  const handleToggleChannelPick = (signalId: string, channelId: string) => {
    setSelectedBySignal((prev) => {
      const cur = prev[signalId] || [];
      const exists = cur.includes(channelId);
      const next = exists ? cur.filter((id) => id !== channelId) : [...cur, channelId];
      return { ...prev, [signalId]: next };
    });
  };

  const handleWatchSelectedChannels = (sig: CuratedSignalDefinition) => {
    const chosenIds = selectedBySignal[sig.id] || [];
    if (chosenIds.length === 0) return;

    const chosenChannels = sig.channels.filter((c) => chosenIds.includes(c.id));
    recordCuratedSignalSession(
      sig.id,
      chosenChannels.map((c) => c.originUrl),
      quick15Mode
    );
    setPilotState(readCuratedPilotState());

    const built = buildCustomSignalFromCurated(sig, {
      selectedChannelIds: chosenIds,
      quick15Min: quick15Mode
    });
    setSignal(built as any);
    navigate(
      `/misenal1?signal=${encodeURIComponent(sig.id)}&channels=${encodeURIComponent(
        chosenIds.join(',')
      )}${quick15Mode ? '&quick15=1' : ''}`
    );
  };

  const handleSaveSelectionToMySignal = (
    sig: CuratedSignalDefinition,
    onlySelected = false
  ) => {
    const chosenIds = onlySelected ? selectedBySignal[sig.id] || [] : undefined;
    const { updatedSignal, addedCount } = mergeCuratedIntoPersonalSignal(
      activeSignal,
      sig,
      chosenIds
    );
    setSignal(updatedSignal);

    const usedChannels =
      chosenIds && chosenIds.length > 0
        ? sig.channels.filter((c) => chosenIds.includes(c.id))
        : sig.channels;

    recordCuratedSignalSession(
      sig.id,
      usedChannels.map((c) => c.originUrl),
      quick15Mode
    );
    setPilotState(readCuratedPilotState());
    setPickingSignalId(null);

    setFeedbackBanner({
      text:
        addedCount > 0
          ? `Se sumaron ${addedCount} bloque(s) de «${sig.title}» a tu propia señal personal sin borrar tu grilla.`
          : `Los bloques elegidos de «${sig.title}» ya forman parte de tu señal personal.`,
      ctaLabel: 'Abrir Mi Señal ahora',
      ctaRoute: `/misenal1?signal=${encodeURIComponent(updatedSignal.id)}`
    });
  };

  const handleVisitOriginalCreator = (sigId: string, originUrl: string) => {
    recordCuratedSignalSession(sigId, [originUrl], false);
    setPilotState(readCuratedPilotState());
  };

  return (
    <section className="csd-root" aria-label="Señales vivas seleccionadas por curadores">
      <div className="csd-header">
        <div className="csd-header-copy">
          <div className="csd-eyebrow">
            <Radio size={13} /> YOUAPP · DESCUBRIR — MI SEÑAL VIVA
          </div>
          <h2>Señales para vos · Curadas por criterio humano</h2>
          <p>
            Seguí selecciones temáticas confiables sin depender solo de algoritmos, o armá tu propia señal reuniendo tus canales favoritos aunque no produzcas videos.
          </p>
        </div>

        <div className="csd-header-actions">
          <button
            type="button"
            onClick={() => setQuick15Mode((v) => !v)}
            className={`csd-15m-btn ${quick15Mode ? 'active' : ''}`}
            title="Adaptar las señales a bloques ágiles de hasta 15 minutos"
          >
            <Clock size={15} />
            <span>{quick15Mode ? '⏱ Tengo 15 min: ACTIVO' : 'Tengo 15 minutos'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/create-signal')}
            className="csd-create-btn"
          >
            <Plus size={15} />
            <span>Crear mi propia señal</span>
          </button>
        </div>
      </div>

      {feedbackBanner && (
        <div className="csd-feedback" role="status">
          <span>{feedbackBanner.text}</span>
          {feedbackBanner.ctaRoute && (
            <button
              type="button"
              onClick={() => navigate(feedbackBanner.ctaRoute!)}
              className="csd-feedback-cta"
            >
              {feedbackBanner.ctaLabel} →
            </button>
          )}
        </div>
      )}

      {/* VIDRIERA POR PAÍS + SEÑALES PÚBLICAS DE LA COMUNIDAD */}
      <div className="csd-community-strip">
        <div className="csd-community-head">
          <span className="csd-community-badge">
            <Users size={12} /> {activeCountry.flag} Destacados en {activeCountry.name}
          </span>
          <div className="csd-country-chips">
            <button
              type="button"
              className="csd-country-chip"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`noticias ${activeCountry.name}`)}`)}
            >
              Noticias {activeCountry.name}
            </button>
            <button
              type="button"
              className="csd-country-chip"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`musica ${activeCountry.name}`)}`)}
            >
              Música {activeCountry.name}
            </button>
            <button
              type="button"
              className="csd-country-chip"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`streaming ${activeCountry.name}`)}`)}
            >
              Streaming {activeCountry.name}
            </button>
            <button
              type="button"
              className="csd-country-chip"
              onClick={() => navigate(`/search?q=${encodeURIComponent(`deportes ${activeCountry.name}`)}`)}
            >
              Deportes {activeCountry.name}
            </button>
          </div>
        </div>

        {communitySignals.length > 0 && (
          <div className="csd-community-grid">
            {communitySignals.map((cs) => {
              const isFollowing = followedCommunityIds.includes(cs.clientSignalId);
              return (
                <article key={cs.id} className="csd-comm-card">
                  <button
                    type="button"
                    className="csd-comm-thumb"
                    onClick={() =>
                      navigate(`/misenal1?signal=${encodeURIComponent(cs.clientSignalId)}&sharedSignal=1`)
                    }
                  >
                    {cs.coverThumb && <img src={cs.coverThumb} alt={cs.name} loading="lazy" />}
                    <span className="csd-comm-count">{cs.itemCount} videos</span>
                  </button>
                  <div className="csd-comm-body">
                    <strong>{cs.name}</strong>
                    {cs.prompt && <p>{cs.prompt}</p>}
                    <div className="csd-comm-actions">
                      <button
                        type="button"
                        className="csd-comm-play"
                        onClick={() =>
                          navigate(`/misenal1?signal=${encodeURIComponent(cs.clientSignalId)}&sharedSignal=1`)
                        }
                      >
                        <Play size={11} fill="currentColor" /> Ver
                      </button>
                      <button
                        type="button"
                        className={`csd-comm-follow ${isFollowing ? 'following' : ''}`}
                        onClick={() => toggleFollowCommunity(cs.clientSignalId)}
                      >
                        {isFollowing ? (
                          <>
                            <Check size={11} /> Siguiendo
                          </>
                        ) : (
                          <>
                            <Plus size={11} /> Seguir
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="csd-comm-wa"
                        title="Compartir señal por WhatsApp"
                        onClick={() =>
                          openWhatsAppSignalShare({
                            signalId: cs.clientSignalId,
                            signalName: cs.name,
                            itemCount: cs.itemCount,
                            description: cs.prompt
                          })
                        }
                      >
                        <Share2 size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="csd-grid">
        {CURATED_SIGNALS_PILOT.map((sig) => {
          const isFollowed = pilotState.followedSignalIds.includes(sig.id);
          const isPicking = pickingSignalId === sig.id;
          const pickedIds = selectedBySignal[sig.id] || [];
          const visibleChannels = quick15Mode
            ? sig.channels.filter((c) => c.durationSec <= 900)
            : sig.channels;

          return (
            <article key={sig.id} className="csd-card">
              {/* Portada visual verificada */}
              <div
                className="csd-cover"
                onClick={() => handleFollowAndWatchFull(sig)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFollowAndWatchFull(sig);
                }}
              >
                <img
                  src={`https://i.ytimg.com/vi/${sig.coverVideoId}/hqdefault.jpg`}
                  alt={sig.title}
                />
                <div className="csd-cover-gradient" />

                <div className="csd-cover-top">
                  <span className="csd-pilot-pill">
                    <Sparkles size={11} /> {visibleChannels.length} canales verificados
                  </span>
                  {isFollowed && (
                    <span className="csd-following-pill">
                      <Check size={11} /> Siguiendo
                    </span>
                  )}
                </div>

                <div className="csd-cover-bottom">
                  <div className="csd-tags">
                    {sig.tags.map((t) => (
                      <span key={t} className="csd-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                  <h3>{sig.title}</h3>
                </div>
              </div>

              {/* Cuerpo curatorial */}
              <div className="csd-body">
                <p className="csd-subtitle">{sig.subtitle}</p>

                <div className="csd-curator-box">
                  <strong>{sig.curatorRole}</strong>
                  <span>{sig.curatorNote} · Reproduce desde cada canal oficial.</span>
                </div>

                {/* Creadores incluidos con enlace directo al original */}
                <div className="csd-creators-strip" aria-label="Canales incluidos en esta señal">
                  {visibleChannels.map((ch) => (
                    <a
                      key={ch.id}
                      href={ch.originUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleVisitOriginalCreator(sig.id, ch.originUrl)}
                      className="csd-creator-chip"
                      title={`Abrir canal oficial de ${ch.channelName}`}
                    >
                      <span>{ch.channelName}</span>
                      <span className="csd-creator-min">
                        {Math.max(1, Math.round(ch.durationSec / 60))}m
                      </span>
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>

                {/* Selector desplegable si elige "Elegir solamente algunos canales" */}
                {isPicking && (
                  <div className="csd-picker-drawer">
                    <div className="csd-picker-head">
                      <strong>Marcá los canales que querés incluir ({pickedIds.length})</strong>
                      <button
                        type="button"
                        onClick={() => setPickingSignalId(null)}
                        className="csd-picker-close"
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="csd-picker-list">
                      {sig.channels.map((ch) => {
                        const checked = pickedIds.includes(ch.id);
                        return (
                          <label key={ch.id} className={`csd-picker-row ${checked ? 'checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleChannelPick(sig.id, ch.id)}
                            />
                            <div className="csd-picker-meta">
                              <strong>{ch.channelName}</strong>
                              <span>
                                {ch.videoTitle} ({Math.round(ch.durationSec / 60)} min)
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="csd-picker-btns">
                      <button
                        type="button"
                        disabled={pickedIds.length === 0}
                        onClick={() => handleWatchSelectedChannels(sig)}
                        className="csd-pick-watch"
                      >
                        <Play size={13} /> Ver estos {pickedIds.length} ahora
                      </button>
                      <button
                        type="button"
                        disabled={pickedIds.length === 0}
                        onClick={() => handleSaveSelectionToMySignal(sig, true)}
                        className="csd-pick-save"
                      >
                        <BookmarkPlus size={13} /> Llevar a Mi Señal
                      </button>
                    </div>
                  </div>
                )}

                {/* LAS 3 ACCIONES CLAVE DEL ESPECTADOR / SELECCIONADOR */}
                <div className="csd-actions-block">
                  <div className="csd-actions-prompt">¿Qué querés hacer?</div>

                  <button
                    type="button"
                    onClick={() => handleFollowAndWatchFull(sig)}
                    className="csd-btn-primary"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>
                      {isFollowed ? 'Ver señal completa' : 'Seguir la señal completa'}
                      {quick15Mode ? ' (15 min)' : ''}
                    </span>
                  </button>

                  <div className="csd-btn-secondary-row">
                    <button
                      type="button"
                      onClick={() => setPickingSignalId(isPicking ? null : sig.id)}
                      className={`csd-btn-outline ${isPicking ? 'active' : ''}`}
                    >
                      <ListChecks size={14} />
                      <span>Elegir algunos canales</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveSelectionToMySignal(sig, false)}
                      className="csd-btn-outline"
                    >
                      <BookmarkPlus size={14} />
                      <span>Guardar en Mi Señal</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Barra transparente del Experimento Piloto (3 señales reales · métricas locales reales) */}
      <div className="csd-pilot-footer">
        <div className="csd-pilot-note">
          <strong>Piloto experimental · Curadores y Repetidoras:</strong> los videos se reproducen en el reproductor oficial de cada creador sin copiar archivos.
        </div>
        <div className="csd-pilot-metrics">
          <span>
            <strong>{pilotState.followedSignalIds.length}</strong> señales seguidas
          </span>
          <span>•</span>
          <span>
            <strong>{pilotState.discoveredChannels.length}</strong> canales descubiertos
          </span>
          <span>•</span>
          <span>
            <strong>{pilotState.activeDays.length}</strong> día(s) activo(s)
          </span>
          <button
            type="button"
            onClick={() => navigate('/repetidoras')}
            className="csd-pilot-link"
          >
            Ver red de repetidoras →
          </button>
        </div>
      </div>

      <style>{`
        .csd-root {
          max-width: 1400px;
          width: 100%;
          margin: 0 auto 28px;
          padding: 0 48px;
          box-sizing: border-box;
        }
        .csd-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 18px;
        }
        .csd-header-copy {
          max-width: 720px;
        }
        .csd-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #64d2ff;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .csd-header-copy h2 {
          margin: 0 0 6px;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #ffffff;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
        }
        .csd-header-copy p {
          margin: 0;
          font-size: 14px;
          color: rgba(245, 245, 247, 0.82);
          line-height: 1.45;
        }
        .csd-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .csd-15m-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 15px;
          border-radius: 999px;
          border: 1.5px solid rgba(255, 255, 255, 0.45);
          background: rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.18s ease;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 6px 20px rgba(0, 0, 0, 0.18);
        }
        .csd-15m-btn:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.72);
        }
        .csd-15m-btn.active {
          background: rgba(0, 113, 227, 0.38);
          border-color: #64d2ff;
          color: #ffffff;
          box-shadow: 0 0 0 3px rgba(100, 210, 255, 0.24);
        }
        .csd-create-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 999px;
          border: 1.5px solid rgba(100, 210, 255, 0.65);
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0, 113, 227, 0.36);
          transition: 0.18s ease;
        }
        .csd-create-btn:hover {
          background: #0a84ff;
        }

        .csd-feedback {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          padding: 12px 16px;
          margin-bottom: 16px;
          border-radius: 16px;
          background: rgba(22, 163, 74, 0.22);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(74, 222, 128, 0.48);
          color: #e6ffed;
          font-size: 13.5px;
          font-weight: 600;
        }
        .csd-feedback-cta {
          background: #16a34a;
          color: #ffffff;
          border: none;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .csd-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        /* Tarjetas de Señales — Cristal puro nítido biselado sin desenfoque */
        .csd-card {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.02) 50%,
            rgba(255, 255, 255, 0.06) 100%
          );
          border-top: 1.5px solid rgba(255, 255, 255, 0.72);
          border-left: 1.5px solid rgba(255, 255, 255, 0.50);
          border-right: 1.5px solid rgba(255, 255, 255, 0.36);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.48);
          border-radius: 22px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.72),
            inset 0 -1px 2px rgba(255, 255, 255, 0.32),
            0 14px 36px rgba(0, 0, 0, 0.22);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .csd-card:hover {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 2px rgba(255, 255, 255, 0.88),
            inset 0 -1px 3px rgba(255, 255, 255, 0.45),
            0 18px 42px rgba(0, 0, 0, 0.28);
        }
        .csd-cover {
          position: relative;
          aspect-ratio: 16 / 9;
          background: #0f172a;
          cursor: pointer;
          overflow: hidden;
        }
        .csd-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }
        .csd-card:hover .csd-cover img {
          transform: scale(1.04);
        }
        .csd-cover-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(15,23,42,0.28) 0%, rgba(15,23,42,0.12) 40%, rgba(15,23,42,0.86) 100%);
        }
        .csd-cover-top {
          position: absolute;
          top: 10px;
          left: 12px;
          right: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .csd-pilot-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.24);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
        }
        .csd-following-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
        }
        .csd-cover-bottom {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 12px;
        }
        .csd-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 6px;
        }
        .csd-tag {
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .csd-cover-bottom h3 {
          margin: 0;
          color: #ffffff;
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 8px rgba(0,0,0,0.45);
        }

        .csd-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }
        .csd-subtitle {
          margin: 0;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.90);
          line-height: 1.42;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
        }
        .csd-curator-box {
          padding: 9px 11px;
          border-radius: 14px;
          background: rgba(12, 18, 28, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.24);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .csd-curator-box strong {
          font-size: 12px;
          color: #8ee0ff;
        }
        .csd-curator-box span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.78);
        }

        .csd-creators-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .csd-creator-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          text-decoration: none;
          transition: 0.15s ease;
        }
        .csd-creator-chip:hover {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.55);
          color: #ffffff;
        }
        .csd-creator-min {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.72);
        }

        .csd-picker-drawer {
          padding: 11px;
          border-radius: 14px;
          background: rgba(12, 20, 32, 0.45);
          border: 1px solid rgba(100, 210, 255, 0.42);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .csd-picker-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #d8f3ff;
        }
        .csd-picker-close {
          background: none;
          border: none;
          color: rgba(245, 245, 247, 0.75);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .csd-picker-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .csd-picker-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.20);
          cursor: pointer;
          font-size: 12px;
        }
        .csd-picker-row.checked {
          border-color: #64d2ff;
          background: rgba(0, 113, 227, 0.28);
        }
        .csd-picker-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .csd-picker-meta strong {
          color: #ffffff;
          font-size: 12px;
        }
        .csd-picker-meta span {
          color: rgba(245, 245, 247, 0.74);
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csd-picker-btns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 2px;
        }
        .csd-pick-watch,
        .csd-pick-save {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: none;
        }
        .csd-pick-watch {
          background: #0071e3;
          color: #ffffff;
        }
        .csd-pick-save {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.36);
        }

        .csd-actions-block {
          margin-top: auto;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.20);
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .csd-actions-prompt {
          font-size: 11px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.74);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .csd-btn-primary {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 10px 14px;
          border-radius: 13px;
          border: 1px solid rgba(100, 210, 255, 0.60);
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0, 113, 227, 0.34);
          transition: background 0.16s ease;
        }
        .csd-btn-primary:hover {
          background: #0a84ff;
        }
        .csd-btn-secondary-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }
        .csd-btn-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 11.8px;
          font-weight: 650;
          cursor: pointer;
          transition: 0.15s ease;
        }
        .csd-btn-outline:hover,
        .csd-btn-outline.active {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.62);
          color: #ffffff;
        }

        .csd-pilot-footer {
          margin-top: 16px;
          padding: 12px 18px;
          border-radius: 20px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.02) 50%,
            rgba(255, 255, 255, 0.06) 100%
          );
          border-top: 1.5px solid rgba(255, 255, 255, 0.68);
          border-left: 1.5px solid rgba(255, 255, 255, 0.46);
          border-right: 1.5px solid rgba(255, 255, 255, 0.34);
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.44);
          box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.72),
            0 10px 28px rgba(0, 0, 0, 0.16);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.88);
        }
        .csd-pilot-metrics {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: #ffffff;
        }
        .csd-pilot-link {
          background: none;
          border: none;
          color: #8ee0ff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          padding: 0 0 0 4px;
        }

        .csd-community-strip {
          margin-bottom: 22px;
          padding: 16px 18px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.055);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .csd-community-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .csd-community-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #bae6fd;
        }
        .csd-country-chips {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .csd-country-chip {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .csd-country-chip:hover {
          background: rgba(100, 210, 255, 0.2);
          border-color: rgba(100, 210, 255, 0.55);
          color: #ffffff;
        }
        .csd-community-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
        }
        .csd-comm-card {
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(12, 16, 24, 0.52);
          display: flex;
          flex-direction: column;
        }
        .csd-comm-thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          width: 100%;
          border: none;
          padding: 0;
          background: linear-gradient(135deg, #121826, #1f2937);
          cursor: pointer;
          overflow: hidden;
        }
        .csd-comm-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .csd-comm-count {
          position: absolute;
          right: 8px;
          bottom: 8px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(8, 10, 16, 0.8);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .csd-comm-body {
          padding: 11px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .csd-comm-body strong {
          font-size: 13.5px;
          font-weight: 750;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csd-comm-body p {
          margin: 0;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .csd-comm-actions {
          margin-top: auto;
          padding-top: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .csd-comm-play,
        .csd-comm-follow,
        .csd-comm-wa {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .csd-comm-play {
          background: #0071e3;
          border-color: rgba(100, 210, 255, 0.55);
        }
        .csd-comm-follow {
          flex: 1;
        }
        .csd-comm-follow.following {
          background: rgba(37, 211, 102, 0.18);
          border-color: rgba(37, 211, 102, 0.5);
          color: #a7f3d0;
        }
        .csd-comm-wa {
          color: #25D366;
          border-color: rgba(37, 211, 102, 0.38);
        }

        @media (max-width: 1080px) {
          .csd-root {
            padding: 0 20px;
          }
          .csd-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .csd-btn-secondary-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
