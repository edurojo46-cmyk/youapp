import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tv,
  X
} from 'lucide-react';
import { TvUserSessionMenu } from '../../../src/components/tv/TvUserSessionMenu';
import { YouAppOfficialLogo } from '../../../src/components/ui/YouAppOfficialLogo';
import { AtlasRedVivaPanel } from '../../../src/components/tv/AtlasRedVivaPanel';
import { LiveRepeatersMap } from '../../../src/components/tv/LiveRepeatersMap';
import { useAtlasAuthStore } from '../../../src/store/atlas/atlasAuthStore';
import {
  loadAssociationsWorkspace,
  createCreatorChannelAndSignal,
  proposeAssociation,
  respondToAssociation,
  listSignalMemberships,
  type AssociatedChannelDirectoryItem,
  type UserSignalSummary,
  type AssociationAgreementItem,
  type SignalMembershipItem
} from '../../../src/lib/tv/associationsService';

export default function YouAppAssociationsPage() {
  const navigate = useNavigate();
  const authUser = useAtlasAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<'mapa' | 'conexiones'>('mapa');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [myChannels, setMyChannels] = useState<AssociatedChannelDirectoryItem[]>([]);
  const [mySignals, setMySignals] = useState<UserSignalSummary[]>([]);
  const [directory, setDirectory] = useState<AssociatedChannelDirectoryItem[]>([]);
  const [agreements, setAgreements] = useState<AssociationAgreementItem[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState<string>('');
  const [signalMemberships, setSignalMemberships] = useState<SignalMembershipItem[]>([]);

  const reloadAll = useCallback(async (preferredSignalId?: string) => {
    setLoading(true);
    try {
      const ws = await loadAssociationsWorkspace();
      setUserId(ws.userId);
      setMyChannels(ws.myChannels);
      setMySignals(ws.mySignals);
      setDirectory(ws.directoryChannels);
      setAgreements(ws.agreements);

      const nextSig =
        preferredSignalId && ws.mySignals.some((s) => s.id === preferredSignalId)
          ? preferredSignalId
          : ws.mySignals[0]?.id || '';
      setSelectedSignalId(nextSig);

      if (nextSig) {
        const mems = await listSignalMemberships(nextSig).catch(() => []);
        setSignalMemberships(mems);
      } else {
        setSignalMemberships([]);
      }
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'No se pudo cargar Repetidoras.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll, authUser?.id, authUser?.email]);

  useEffect(() => {
    if (!selectedSignalId) return;
    listSignalMemberships(selectedSignalId)
      .then(setSignalMemberships)
      .catch(() => {});
  }, [selectedSignalId]);

  const selectedSignal = mySignals.find((s) => s.id === selectedSignalId) || mySignals[0] || null;
  const hostChannel = myChannels[0] || null;

  const handlePublishSignalToRedViva = async () => {
    const sig = selectedSignal;
    if (!sig) return;
    setBusy(true);
    setNotice(null);
    try {
      await createCreatorChannelAndSignal({
        channelName: sig.name,
        signalName: sig.name,
        category: sig.mainTopic || 'Curaduría YOUAPP',
        originPlatform: 'YOUAPP',
        originUrl: `https://youapp.tv/misenal1?signal=${encodeURIComponent(sig.clientSignalId || sig.id)}`,
        description: sig.prompt || `Señal YOUAPP · ${sig.name}`
      });
      await reloadAll(sig.id);
      setNotice({
        ok: true,
        text: `¡Listo! Tu señal «${sig.name}» ya está activa en el directorio de Repetidoras para conectar con otras señales.`
      });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'No se pudo activar tu señal en Red Viva.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRespondAgreement = async (
    ag: AssociationAgreementItem,
    action: 'ACCEPT' | 'REJECT' | 'PAUSE' | 'REVOKE'
  ) => {
    setBusy(true);
    setNotice(null);
    try {
      await respondToAssociation({
        agreementId: ag.id,
        action,
        partnerSignalId: action === 'ACCEPT' ? selectedSignal?.id || mySignals[0]?.id || null : null
      });
      await reloadAll(selectedSignalId);
      const msgs: Record<string, string> = {
        ACCEPT: 'Invitación aceptada: ambas señales ahora son repetidoras activas.',
        REJECT: 'Invitación rechazada.',
        PAUSE: 'Repetidora pausada.',
        REVOKE: 'Repetidora finalizada.'
      };
      setNotice({ ok: true, text: msgs[action] });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'No se pudo procesar la acción.' });
    } finally {
      setBusy(false);
    }
  };

  const activeAgreements = agreements.filter(
    (a) => (a.hostUserId === userId || a.partnerUserId === userId) && a.status === 'ACTIVE'
  );
  const incomingPending = agreements.filter(
    (a) => a.partnerUserId === userId && a.status === 'PENDING'
  );
  const outgoingPending = agreements.filter(
    (a) => a.hostUserId === userId && a.status === 'PENDING'
  );

  return (
    <div className="rep-page">
      <div className="rep-stage-bg" aria-hidden="true" />
      <div className="rep-stage-veil" aria-hidden="true" />
      {/* Cabecera Apple Glass unificada */}
      <header className="rep-topnav">
        <div className="rep-nav-left">
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}
          >
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="rep-brand-pill">REPETIDORAS</span>
        </div>

        <nav className="rep-nav-links" aria-label="Navegación principal">
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/mitv')}>
            MITV
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/reels')}>
            REELS
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/dial')}>
            YOU DIAL
          </button>
          <button type="button" className="rep-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="rep-nav-btn"
            onClick={() => navigate('/search')}
            title="Buscar en YOUAPP"
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px' }}
          >
            <Search size={16} />
          </button>
        </nav>

        <div className="rep-user-area">
          <TvUserSessionMenu variant="glass" />
        </div>
      </header>

      <main className="rep-shell">
        {/* Barra limpia de Tu Señal activa */}
        <section className="rep-my-signal-bar">
          <div className="rep-my-signal-left">
            <span className="rep-eyebrow">TU SEÑAL EN RED VIVA · ASOCIÁ TU SEÑAL POR 7 DÍAS PARA INTERCAMBIAR AUDIENCIAS</span>
            {mySignals.length > 0 ? (
              <div className="rep-signal-select-row">
                <select
                  value={selectedSignalId}
                  onChange={(e) => setSelectedSignalId(e.target.value)}
                  className="rep-signal-select"
                  aria-label="Seleccionar mi señal"
                >
                  {mySignals.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.visibility === 'public' ? 'Pública' : 'Privada'})
                    </option>
                  ))}
                </select>
                <span className="rep-count-pill">
                  {activeAgreements.length}{' '}
                  {activeAgreements.length === 1 ? 'repetidora activa' : 'repetidoras activas'}
                </span>
              </div>
            ) : (
              <p className="rep-empty-signal-hint">
                {userId
                  ? 'Todavía no creaste una señal en esta cuenta.'
                  : 'Iniciá sesión para conectar tu señal con otras señales de YOUAPP.'}
              </p>
            )}
          </div>

          <div className="rep-my-signal-actions">
            <button
              type="button"
              className="rep-btn-secondary"
              disabled={loading || busy}
              onClick={() => void reloadAll(selectedSignalId)}
              title="Actualizar invitaciones y señales"
            >
              <RefreshCw size={13} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              className="rep-btn-primary"
              onClick={() =>
                navigate(userId ? '/create-signal' : '/login?returnTo=%2Frepetidoras')
              }
            >
              <Plus size={14} />
              <span>{userId ? 'Nueva señal' : 'Iniciar sesión'}</span>
            </button>
          </div>
        </section>

        {/* PESTAÑAS LIMPIAS: MAPA VIVO vs CONEXIONES E INVITACIONES */}
        <div className="rep-tabs" role="tablist" aria-label="Vistas de Repetidoras">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mapa'}
            className={`rep-tab ${activeTab === 'mapa' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapa')}
          >
            Mapa vivo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'conexiones'}
            className={`rep-tab ${activeTab === 'conexiones' ? 'active' : ''}`}
            onClick={() => setActiveTab('conexiones')}
          >
            Conexiones e invitaciones
            {incomingPending.length + activeAgreements.length > 0 && (
              <span className="rep-tab-badge">
                {incomingPending.length + activeAgreements.length}
              </span>
            )}
          </button>
        </div>

        {/* Aviso 1-clic si la señal existe pero aún no está publicada en el directorio de Red Viva */}
        {userId && selectedSignal && myChannels.length === 0 && (
          <div className="rep-activate-banner">
            <div>
              <strong>Activá tu señal «{selectedSignal.name}» en el directorio de Repetidoras</strong>
              <p>
                Con 1 clic tu señal queda visible para invitar y recibir pruebas de 7 días de otras señales de YOUAPP.
              </p>
            </div>
            <button
              type="button"
              className="rep-btn-primary"
              disabled={busy}
              onClick={() => void handlePublishSignalToRedViva()}
            >
              <Sparkles size={13} />
              <span>Activar mi señal en Red Viva</span>
            </button>
          </div>
        )}

        {notice && (
          <div className={`rep-notice ${notice.ok ? 'ok' : 'err'}`} role="status">
            {notice.text}
          </div>
        )}

        {/* Invitaciones recibidas pendientes (cualquier modalidad) */}
        {incomingPending.length > 0 && (
          <section className="rep-card highlight">
            <div className="rep-card-head">
              <h2>Invitaciones recibidas ({incomingPending.length})</h2>
              <span>Otras señales quieren asociarse con vos</span>
            </div>
            <div className="rep-list">
              {incomingPending.map((ag) => (
                <div key={ag.id} className="rep-row-item">
                  <div className="rep-row-meta">
                    <strong>{ag.hostSignalName || ag.hostChannelName || 'Señal YOUAPP'}</strong>
                    <span>{ag.editorialNote || 'Te invita a asociar señales como repetidoras mutuas.'}</span>
                  </div>
                  <div className="rep-row-actions">
                    <button
                      type="button"
                      className="rep-btn-accept"
                      disabled={busy}
                      onClick={() => void handleRespondAgreement(ag, 'ACCEPT')}
                    >
                      <Check size={13} /> Aceptar
                    </button>
                    <button
                      type="button"
                      className="rep-btn-ghost"
                      disabled={busy}
                      onClick={() => void handleRespondAgreement(ag, 'REJECT')}
                    >
                      <X size={13} /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MAPA VIVO DE REPETIDORAS (Red directa + circulación + oportunidades) */}
        {activeTab === 'mapa' && (
          <LiveRepeatersMap
            hostSignalId={selectedSignal?.id || 'justicia-social-signal-1'}
            currentUserId={userId}
            anchor={{
              name: selectedSignal?.name || 'Mi Señal',
              category: selectedSignal?.mainTopic || 'Curaduría YOUAPP',
              mainTopic: selectedSignal?.mainTopic || undefined,
              prompt: selectedSignal?.prompt || undefined
            }}
            agreements={agreements}
            directoryCandidates={directory.map((d) => ({
              id: d.id,
              userId: d.userId,
              name: d.name,
              category: d.category,
              originPlatform: d.originPlatform,
              originUrl: d.originUrl,
              featuredVideoUrl: d.featuredVideoUrl,
              featuredVideoTitle: d.featuredVideoTitle,
              description: d.description
            }))}
            alreadyAssociatedIds={[
              ...myChannels.map((c) => c.id),
              ...signalMemberships.map((m) => m.channelId)
            ]}
            busy={busy}
            onOpenSignal={(pathOrUrl, isExternal) => {
              if (isExternal) {
                window.open(pathOrUrl, '_blank', 'noopener,noreferrer');
              } else {
                navigate(pathOrUrl);
              }
            }}
            onInviteCandidate={async (candidate, scorePct, reason) => {
              if (!userId) {
                navigate('/login?returnTo=%2Frepetidoras');
                return false;
              }
              if (!selectedSignal) {
                setNotice({
                  ok: false,
                  text: 'Primero creá una señal en «Nueva señal» para poder invitar a otras señales.'
                });
                return false;
              }
              setBusy(true);
              try {
                let effectiveHostChannelId = hostChannel?.id || null;
                if (!effectiveHostChannelId) {
                  const created = await createCreatorChannelAndSignal({
                    channelName: selectedSignal.name,
                    signalName: selectedSignal.name,
                    category: selectedSignal.mainTopic || 'Curaduría YOUAPP',
                    originPlatform: 'YOUAPP',
                    originUrl: `https://youapp.tv/misenal1?signal=${encodeURIComponent(
                      selectedSignal.clientSignalId || selectedSignal.id
                    )}`,
                    description: selectedSignal.prompt || `Señal YOUAPP · ${selectedSignal.name}`
                  });
                  effectiveHostChannelId = created.channel.id;
                }
                await proposeAssociation({
                  hostSignalId: selectedSignal.id,
                  partnerChannelId: candidate.id,
                  modality: 'BILATERAL',
                  placementSlot: 'editorial_pick',
                  editorialNote: `[MAPA VIVO · 7 DÍAS] Señal «${selectedSignal.name}» invita por 7 días (S=${scorePct}%). ${reason}`,
                  hostChannelId: effectiveHostChannelId
                });
                await reloadAll(selectedSignal.id);
                setNotice({
                  ok: true,
                  text: `Invitación enviada a «${candidate.name}» desde el Mapa vivo.`
                });
                return true;
              } catch (err: any) {
                setNotice({
                  ok: false,
                  text: err?.message || 'No se pudo enviar la invitación.'
                });
                return false;
              } finally {
                setBusy(false);
              }
            }}
            onRespondInvite={async (ag, action) => {
              await handleRespondAgreement(ag, action);
            }}
          />
        )}

        {/* ATLAS RED VIVA · SEÑAL ⇄ SEÑAL */}
        {activeTab === 'conexiones' && (
          <AtlasRedVivaPanel
            hostSignalId={selectedSignal?.id || 'justicia-social-signal-1'}
            currentUserId={userId}
            anchor={{
              name: selectedSignal?.name || 'Mi Señal',
              category: selectedSignal?.mainTopic || 'Curaduría YOUAPP',
              mainTopic: selectedSignal?.mainTopic || undefined,
              prompt: selectedSignal?.prompt || undefined
            }}
            directoryCandidates={directory.map((d) => ({
              id: d.id,
              userId: d.userId,
              name: d.name,
              category: d.category,
              originPlatform: d.originPlatform,
              originUrl: d.originUrl,
              featuredVideoUrl: d.featuredVideoUrl,
              featuredVideoTitle: d.featuredVideoTitle,
              description: d.description
            }))}
            alreadyAssociatedIds={[
              ...myChannels.map((c) => c.id),
              ...signalMemberships.map((m) => m.channelId)
            ]}
            agreements={agreements}
            onSendRealInvite={async (candidate, scorePct, reason) => {
              if (!userId) {
                navigate('/login?returnTo=%2Frepetidoras');
                return false;
              }
              if (!selectedSignal) {
                setNotice({
                  ok: false,
                  text: 'Primero creá una señal en «Nueva señal» para poder invitar a otras señales.'
                });
                return false;
              }
              setBusy(true);
              try {
                let effectiveHostChannelId = hostChannel?.id || null;
                if (!effectiveHostChannelId) {
                  const created = await createCreatorChannelAndSignal({
                    channelName: selectedSignal.name,
                    signalName: selectedSignal.name,
                    category: selectedSignal.mainTopic || 'Curaduría YOUAPP',
                    originPlatform: 'YOUAPP',
                    originUrl: `https://youapp.tv/misenal1?signal=${encodeURIComponent(
                      selectedSignal.clientSignalId || selectedSignal.id
                    )}`,
                    description: selectedSignal.prompt || `Señal YOUAPP · ${selectedSignal.name}`
                  });
                  effectiveHostChannelId = created.channel.id;
                }
                await proposeAssociation({
                  hostSignalId: selectedSignal.id,
                  partnerChannelId: candidate.id,
                  modality: 'BILATERAL',
                  placementSlot: 'editorial_pick',
                  editorialNote: `[ATLAS RED VIVA · 7 DÍAS] Señal «${selectedSignal.name}» invita por 7 días (S=${scorePct}%). ${reason}`,
                  hostChannelId: effectiveHostChannelId
                });
                await reloadAll(selectedSignal.id);
                return true;
              } catch (err: any) {
                setNotice({
                  ok: false,
                  text: err?.message || 'No se pudo enviar la invitación real de 7 días.'
                });
                return false;
              } finally {
                setBusy(false);
              }
            }}
            onRespondRealInvite={async (ag, action) => {
              await handleRespondAgreement(ag, action);
            }}
            onPermanentAccepted={(guestName) =>
              setNotice({
                ok: true,
                text: `«${guestName}» fue aceptada como repetidora permanente.`
              })
            }
          />
        )}

        {/* Repetidoras activas y enviadas */}
        {activeTab === 'conexiones' && (activeAgreements.length > 0 || outgoingPending.length > 0) && (
          <section className="rep-card">
            <div className="rep-card-head">
              <h2>
                <ArrowLeftRight size={15} /> Tus conexiones de señal ({activeAgreements.length + outgoingPending.length})
              </h2>
              <span>Asociaciones vigentes y pendientes en Supabase</span>
            </div>

            <div className="rep-list">
              {[...activeAgreements, ...outgoingPending].map((ag) => (
                <div key={ag.id} className="rep-row-item">
                  <div className="rep-row-meta">
                    <div className="rep-row-title-line">
                      <strong>
                        {ag.hostSignalName || ag.hostChannelName || 'Tu señal'} ⇄{' '}
                        {ag.partnerSignalName || ag.partnerChannelName || 'Señal invitada'}
                      </strong>
                      <span className={`rep-status-pill ${ag.status.toLowerCase()}`}>
                        {ag.status === 'ACTIVE' ? 'Activa' : 'Pendiente'}
                      </span>
                    </div>
                    <span>
                      {ag.referralClicks || 0} clics derivados · {ag.editorialNote || 'Repetidora entre señales'}
                    </span>
                  </div>

                  <div className="rep-row-actions">
                    <button
                      type="button"
                      className="rep-btn-secondary"
                      onClick={() => navigate('/misenal1')}
                    >
                      <Tv size={12} /> Ver en Mi Señal
                    </button>
                    {ag.partnerChannelOriginUrl && (
                      <a
                        href={ag.partnerChannelOriginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rep-btn-secondary"
                        title="Abrir señal"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button
                      type="button"
                      className="rep-btn-ghost"
                      disabled={busy}
                      onClick={() => void handleRespondAgreement(ag, 'REVOKE')}
                    >
                      <X size={12} /> Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <style>{`
        .rep-page {
          position: relative;
          min-height: 100dvh;
          background-color: #101712;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          padding-bottom: 84px;
          overflow-x: clip;
          isolation: isolate;
        }
        .rep-stage-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background-color: #101b12;
          background-image: url('/repetidoras-green-canopy-bg.png');
          background-size: cover;
          background-position: center 18%;
          filter: blur(11px) brightness(0.74) contrast(1.06) saturate(1.12);
          transform: scale(1.16) translateZ(0);
          pointer-events: none;
        }
        .rep-stage-veil {
          position: fixed;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            rgba(10, 16, 12, 0.34) 0%,
            rgba(10, 16, 12, 0.44) 55%,
            rgba(8, 12, 10, 0.68) 100%
          );
          pointer-events: none;
        }
        .rep-topnav {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 24px;
          background: rgba(20, 24, 22, 0.56);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        }
        .rep-nav-left, .rep-nav-links, .rep-user-area {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .rep-nav-links {
          overflow-x: auto;
          scrollbar-width: none;
          flex-wrap: nowrap;
        }
        .rep-nav-links::-webkit-scrollbar { display: none; }
        .rep-brand-pill {
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #e5f3ff;
          white-space: nowrap;
        }
        .rep-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.85);
          font-size: 11.5px;
          font-weight: 650;
          letter-spacing: 0.06em;
          padding: 7px 11px;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .rep-nav-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .rep-tabs {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          align-self: flex-start;
        }
        .rep-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 8px 16px;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .rep-tab.active {
          background: rgba(255, 255, 255, 0.92);
          color: #101614;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
        }
        .rep-tab-badge {
          padding: 1px 7px;
          border-radius: 999px;
          background: #0071e3;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
        }
        .rep-shell {
          position: relative;
          z-index: 2;
          max-width: 1080px;
          margin: 0 auto;
          padding: 22px 20px 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .rep-my-signal-bar,
        .rep-card,
        .rep-activate-banner {
          position: relative;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.09);
          backdrop-filter: blur(22px) saturate(150%);
          -webkit-backdrop-filter: blur(22px) saturate(150%);
          box-shadow: 0 20px 44px rgba(0, 0, 0, 0.28);
          color: #f5f5f7;
        }
        .rep-my-signal-bar::after,
        .rep-card::after,
        .rep-activate-banner::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.8px;
          background:
            radial-gradient(220px circle at 0% 0%, rgba(255, 255, 255, 0.85), transparent 56%),
            radial-gradient(200px circle at 100% 0%, rgba(167, 243, 208, 0.65), transparent 56%),
            radial-gradient(220px circle at 100% 100%, rgba(255, 255, 255, 0.62), transparent 56%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .rep-my-signal-bar > *,
        .rep-card > *,
        .rep-activate-banner > * {
          position: relative;
          z-index: 1;
        }
        .rep-my-signal-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          padding: 18px 22px;
        }
        .rep-my-signal-left {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .rep-eyebrow {
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.1em;
          color: #a7f3d0;
        }
        .rep-signal-select-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rep-signal-select {
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(16, 22, 18, 0.65);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .rep-count-pill {
          padding: 4px 11px;
          border-radius: 999px;
          background: rgba(167, 243, 208, 0.18);
          border: 1px solid rgba(167, 243, 208, 0.38);
          color: #d1fae5;
          font-size: 11.5px;
          font-weight: 700;
        }
        .rep-empty-signal-hint {
          margin: 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.78);
        }
        .rep-my-signal-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rep-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 9px 16px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .rep-btn-primary:hover:not(:disabled) {
          background: #0a84ff;
        }
        .rep-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          text-decoration: none;
          cursor: pointer;
        }
        .rep-btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.18);
        }
        .rep-btn-accept {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: #16a34a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .rep-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.85);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .rep-activate-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          padding: 16px 20px;
        }
        .rep-activate-banner strong {
          font-size: 14.5px;
          color: #ffffff;
        }
        .rep-activate-banner p {
          margin: 3px 0 0;
          font-size: 12.5px;
          color: rgba(245, 245, 247, 0.78);
        }
        .rep-notice {
          padding: 11px 15px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 650;
          backdrop-filter: blur(16px);
        }
        .rep-notice.ok {
          background: rgba(22, 163, 74, 0.24);
          border: 1px solid rgba(134, 239, 172, 0.45);
          color: #dcfce7;
        }
        .rep-notice.err {
          background: rgba(220, 38, 38, 0.24);
          border: 1px solid rgba(252, 165, 165, 0.45);
          color: #fee2e2;
        }
        .rep-card {
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rep-card.highlight {
          background: rgba(245, 158, 11, 0.14);
        }
        .rep-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rep-card-head h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
        }
        .rep-card-head span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .rep-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .rep-row-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .rep-row-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1 1 240px;
        }
        .rep-row-title-line {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rep-row-meta strong {
          font-size: 13.5px;
          font-weight: 700;
          color: #ffffff;
        }
        .rep-row-meta span {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .rep-status-pill {
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 700;
        }
        .rep-status-pill.active {
          background: rgba(22, 163, 74, 0.28);
          color: #bbf7d0;
        }
        .rep-status-pill.pending {
          background: rgba(245, 158, 11, 0.28);
          color: #fde68a;
        }
        .rep-row-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        @media (max-width: 760px) {
          .rep-nav-links { display: none; }
          .rep-topnav { padding: 10px 14px; }
        }
      `}</style>
    </div>
  );
}
