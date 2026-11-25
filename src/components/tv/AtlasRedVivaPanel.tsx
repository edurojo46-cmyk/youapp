import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Clock,
  ExternalLink,
  Network,
  Sparkles,
  TrendingUp,
  UserPlus,
  X
} from 'lucide-react';
import {
  computeRedVivaOpportunities,
  computeRedVivaReproduction,
  simulateRedVivaPilot,
  type AffinityAnchorInput,
  type RedVivaCandidateInput
} from '../../lib/tv/repeaterAffinityEngine';
import {
  decideRedVivaTrial,
  getTrialProgressInfo,
  readRedVivaState,
  recordRedVivaMetric,
  startRedVivaTrial,
  updateRedVivaSettings,
  type RedVivaState
} from '../../lib/tv/atlasRedVivaStore';
import { CURATED_SIGNALS_PILOT } from '../../lib/tv/curatedSignalsCatalog';
import { resolveKnownChannelAvatar, slugifyChannelName } from '../../lib/tv/channelIdentityCatalog';

import type { AssociationAgreementItem } from '../../lib/tv/associationsService';

interface AtlasRedVivaPanelProps {
  hostSignalId: string;
  currentUserId?: string | null;
  anchor: AffinityAnchorInput;
  directoryCandidates: RedVivaCandidateInput[];
  alreadyAssociatedIds: string[];
  agreements?: AssociationAgreementItem[];
  onSendRealInvite?: (candidate: RedVivaCandidateInput, scorePct: number, reason: string) => Promise<boolean>;
  onRespondRealInvite?: (agreement: AssociationAgreementItem, action: 'ACCEPT' | 'REJECT' | 'REVOKE') => Promise<void>;
  onPermanentAccepted?: (guestChannelName: string) => void;
}

const ALL_CATEGORIES = ['Historia', 'Ciencia', 'Fútbol', 'Actualidad', 'Tecnología', 'Cultura'];

export const AtlasRedVivaPanel: React.FC<AtlasRedVivaPanelProps> = ({
  hostSignalId,
  currentUserId,
  anchor,
  directoryCandidates,
  alreadyAssociatedIds,
  agreements = [],
  onSendRealInvite,
  onRespondRealInvite,
  onPermanentAccepted
}) => {
  const navigate = useNavigate();
  const [state, setState] = useState<RedVivaState>(() => readRedVivaState());
  const [showCalc, setShowCalc] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [panelMsg, setPanelMsg] = useState<string | null>(null);

  const realDirectoryIds = useMemo(
    () => new Set(directoryCandidates.filter((c) => Boolean(c.userId)).map((c) => c.id)),
    [directoryCandidates]
  );

  const incomingRealRedViva = useMemo(
    () =>
      agreements.filter(
        (a) =>
          a.partnerUserId === currentUserId &&
          a.status === 'PENDING' &&
          (a.editorialNote || '').includes('ATLAS RED VIVA')
      ),
    [agreements, currentUserId]
  );

  const activeRealRedViva = useMemo(
    () =>
      agreements.filter(
        (a) =>
          (a.hostUserId === currentUserId || a.partnerUserId === currentUserId) &&
          (a.status === 'ACTIVE' || a.status === 'PENDING') &&
          (a.editorialNote || '').includes('ATLAS RED VIVA')
      ),
    [agreements, currentUserId]
  );

  // Parámetros del Simulador Piloto (20 señales · 8 semanas)
  const [simSignals, setSimSignals] = useState(20);
  const [simWeeks, setSimWeeks] = useState(8);
  const [simPa, setSimPa] = useState(60);
  const [simPp, setSimPp] = useState(70);
  const [simAvgAudience, setSimAvgAudience] = useState(400);

  const simulation = useMemo(
    () =>
      simulateRedVivaPilot({
        initialSignals: simSignals,
        weeks: simWeeks,
        acceptProb: simPa / 100,
        persistProb: simPp / 100,
        avgAudiencePerSignal: simAvgAudience,
        smallSignalShare: 0.35
      }),
    [simSignals, simWeeks, simPa, simPp, simAvgAudience]
  );

  // Parámetros de la calculadora R = I * Pa * Pp * U
  const [calcI, setCalcI] = useState(3);
  const [calcPa, setCalcPa] = useState(60);
  const [calcPp, setCalcPp] = useState(70);
  const [calcU, setCalcU] = useState(90);

  const repro = useMemo(
    () => computeRedVivaReproduction(calcI, calcPa / 100, calcPp / 100, calcU / 100),
    [calcI, calcPa, calcPp, calcU]
  );

  // Pool 100% Señal ⇄ Señal: señales reales de usuarios YOUAPP + señales curadas de YOUAPP
  const combinedCandidates = useMemo<RedVivaCandidateInput[]>(() => {
    const byId = new Map<string, RedVivaCandidateInput>();
    for (const c of directoryCandidates) {
      byId.set(c.id, { ...c, isCuratorSignal: true });
    }
    for (const curated of CURATED_SIGNALS_PILOT) {
      const cid = `curator-${curated.id}`;
      if (!byId.has(cid)) {
        byId.set(cid, {
          id: cid,
          name: curated.title,
          category: curated.tags[0] || 'Cultura',
          originPlatform: 'YOUAPP',
          originUrl: `https://youapp.tv/misenal1?signal=${curated.id}`,
          featuredVideoTitle: curated.channels[0]?.videoTitle,
          description: curated.subtitle,
          isCuratorSignal: true,
          isSmallOrNewSignal: true
        });
      }
    }
    return Array.from(byId.values());
  }, [directoryCandidates]);

  const excludedIds = useMemo(() => {
    const ids = [...alreadyAssociatedIds];
    if (state.activeTrial) ids.push(state.activeTrial.guestChannelId);
    for (const h of state.history) ids.push(h.guestChannelId);
    return ids;
  }, [alreadyAssociatedIds, state.activeTrial, state.history]);

  const opportunities = useMemo(
    () =>
      computeRedVivaOpportunities(anchor, combinedCandidates, excludedIds, {
        allowedCategories: state.settings.allowedCategories,
        includeCurators: state.settings.includeCurators,
        limit: 5
      }),
    [anchor, combinedCandidates, excludedIds, state.settings.allowedCategories, state.settings.includeCurators]
  );

  const toggleCategory = (cat: string) => {
    const exists = state.settings.allowedCategories.includes(cat);
    const nextCats = exists
      ? state.settings.allowedCategories.filter((c) => c !== cat)
      : [...state.settings.allowedCategories, cat];
    setState(updateRedVivaSettings({ allowedCategories: nextCats }));
  };

  const activeTrial = state.activeTrial;
  const progress = activeTrial ? getTrialProgressInfo(activeTrial) : null;

  return (
    <section className="rv-panel" aria-label="ATLAS Red Viva · Pruebas de 7 días">
      {/* Cabecera + Opt-in voluntario */}
      <div className="rv-head">
        <div className="rv-head-left">
          <span className="rv-eyebrow">
            <Network size={12} /> ATLAS RED VIVA · SEÑAL ⇄ SEÑAL
          </span>
          <h2>Repetidoras entre señales (pruebas de 7 días)</h2>
          <p>
            Conectá tu señal con otras señales de YOUAPP. Cada asociación habilita <strong>máximo 1 señal invitada por 7 días</strong> para descubrir audiencia nueva sin saturar tu pantalla.
          </p>
        </div>

        <label className="rv-optin-toggle">
          <input
            type="checkbox"
            checked={state.settings.optedIn}
            onChange={(e) => setState(updateRedVivaSettings({ optedIn: e.target.checked }))}
          />
          <span>{state.settings.optedIn ? 'Participando en Red Viva' : 'Pausado'}</span>
        </label>
      </div>

      {/* Categorías permitidas + Incluir curadores YOUAPP */}
      <div className="rv-prefs-row">
        <div className="rv-cats">
          {ALL_CATEGORIES.map((cat) => {
            const active = state.settings.allowedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                className={`rv-cat-pill ${active ? 'active' : ''}`}
                onClick={() => toggleCategory(cat)}
              >
                {active && <Check size={11} />}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        <div className="rv-prefs-right">
          <label className="rv-curator-check">
            <input
              type="checkbox"
              checked={state.settings.includeCurators}
              onChange={(e) => setState(updateRedVivaSettings({ includeCurators: e.target.checked }))}
            />
            <span>Incluir curadores YOUAPP</span>
          </label>

          <button
            type="button"
            className={`rv-calc-toggle ${showSimulator ? 'active' : ''}`}
            onClick={() => setShowSimulator((v) => !v)}
          >
            <Network size={12} />
            <span>Simulador ({simSignals} señales)</span>
          </button>

          <button
            type="button"
            className="rv-calc-toggle"
            onClick={() => setShowCalc((v) => !v)}
          >
            <TrendingUp size={12} />
            <span>Calculadora R ({repro.R})</span>
          </button>
        </div>
      </div>

      {/* SIMULADOR SEMANAL DE RED VIVA (20 señales · 8 semanas · tope 1 prueba/señal) */}
      {showSimulator && (
        <div className="rv-sim-box" aria-label="Simulador de crecimiento ATLAS Red Viva">
          <div className="rv-sim-top">
            <div>
              <span className="rv-sim-badge">SIMULACIÓN · MODELO CON TOPE 1 PRUEBA/SEÑAL Y ANTI-SATURACIÓN</span>
              <h3>Simulador Piloto de Red Viva ({simSignals} señales · {simWeeks} semanas)</h3>
            </div>
            <div className="rv-sim-presets">
              <button
                type="button"
                className="rv-preset-btn"
                onClick={() => {
                  setSimSignals(20);
                  setSimWeeks(8);
                  setSimPa(45);
                  setSimPp(55);
                  setSimAvgAudience(300);
                }}
              >
                Conservador
              </button>
              <button
                type="button"
                className="rv-preset-btn primary"
                onClick={() => {
                  setSimSignals(20);
                  setSimWeeks(8);
                  setSimPa(60);
                  setSimPp(70);
                  setSimAvgAudience(400);
                }}
              >
                Piloto 20 señales
              </button>
              <button
                type="button"
                className="rv-preset-btn"
                onClick={() => {
                  setSimSignals(35);
                  setSimWeeks(10);
                  setSimPa(75);
                  setSimPp(75);
                  setSimAvgAudience(650);
                }}
              >
                Expansión alta
              </button>
            </div>
          </div>

          <div className="rv-calc-sliders">
            <label>
              <span>Señales voluntarias: <strong>{simSignals}</strong></span>
              <input type="range" min={10} max={60} step={2} value={simSignals} onChange={(e) => setSimSignals(Number(e.target.value))} />
            </label>
            <label>
              <span>Ciclos semanales: <strong>{simWeeks} sem</strong></span>
              <input type="range" min={4} max={12} value={simWeeks} onChange={(e) => setSimWeeks(Number(e.target.value))} />
            </label>
            <label>
              <span>Aceptan prueba 7d (Pa): <strong>{simPa}%</strong></span>
              <input type="range" min={20} max={95} step={5} value={simPa} onChange={(e) => setSimPa(Number(e.target.value))} />
            </label>
            <label>
              <span>Permanecen día 7 (Pp): <strong>{simPp}%</strong></span>
              <input type="range" min={20} max={95} step={5} value={simPp} onChange={(e) => setSimPp(Number(e.target.value))} />
            </label>
            <label>
              <span>Audiencia media/señal: <strong>{simAvgAudience}</strong></span>
              <input type="range" min={100} max={2000} step={50} value={simAvgAudience} onChange={(e) => setSimAvgAudience(Number(e.target.value))} />
            </label>
          </div>

          <div className="rv-sim-kpis">
            <div className="rv-sim-kpi">
              <span>Repetidoras permanentes</span>
              <strong>{simulation.totalPermanentLinks}</strong>
              <small>en {simulation.finalActiveSignals} señales activas</small>
            </div>
            <div className="rv-sim-kpi accent">
              <span>Audiencia nueva estimada</span>
              <strong>+{simulation.cumulativeNewAudience.toLocaleString('es-AR')}</strong>
              <small>espectadores descubiertos</small>
            </div>
            <div className="rv-sim-kpi">
              <span>Señales chicas / curadores</span>
              <strong>{simulation.smallSignalsBoostedTotal}</strong>
              <small>oportunidades reservadas (35%)</small>
            </div>
            <div className="rv-sim-kpi">
              <span>Saturación de red</span>
              <strong>{simulation.finalSaturationPct}%</strong>
              <small>Tope 1 prueba visible/señal</small>
            </div>
          </div>

          {/* Gráfico visual semana a semana */}
          <div className="rv-sim-chart" aria-label="Evolución semanal de repetidoras permanentes">
            {(() => {
              const maxLinks = Math.max(1, ...simulation.points.map((p) => p.totalPermanentLinks));
              return simulation.points.map((pt) => {
                const pct = Math.max(10, Math.round((pt.totalPermanentLinks / maxLinks) * 100));
                return (
                  <div
                    key={pt.week}
                    className="rv-bar-col"
                    title={`Semana ${pt.week}: ${pt.trialsStarted} pruebas · +${pt.newPermanent} permanentes · +${pt.newAudienceWeek} audiencia nueva`}
                  >
                    <span className="rv-bar-val">{pt.totalPermanentLinks}</span>
                    <div className="rv-bar-track">
                      <div className="rv-bar-fill" style={{ height: `${pct}%` }} />
                    </div>
                    <span className="rv-bar-lbl">S{pt.week}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Calculadora interactiva R = I * Pa * Pp * U */}
      {showCalc && (
        <div className="rv-calc-box">
          <div className="rv-calc-sliders">
            <label>
              <span>Invitaciones/ciclo (I): <strong>{calcI}</strong></span>
              <input type="range" min={1} max={5} value={calcI} onChange={(e) => setCalcI(Number(e.target.value))} />
            </label>
            <label>
              <span>Aceptan probar (Pa): <strong>{calcPa}%</strong></span>
              <input type="range" min={10} max={100} step={5} value={calcPa} onChange={(e) => setCalcPa(Number(e.target.value))} />
            </label>
            <label>
              <span>Permanecen día 7 (Pp): <strong>{calcPp}%</strong></span>
              <input type="range" min={10} max={100} step={5} value={calcPp} onChange={(e) => setCalcPp(Number(e.target.value))} />
            </label>
            <label>
              <span>Candidatos nuevos (U): <strong>{calcU}%</strong></span>
              <input type="range" min={20} max={100} step={5} value={calcU} onChange={(e) => setCalcU(Number(e.target.value))} />
            </label>
          </div>
          <div className={`rv-calc-result ${repro.status}`}>
            <span className="rv-calc-label">Reproducción efectiva (R)</span>
            <strong>{repro.R.toFixed(2)}</strong>
            <span>
              {repro.status === 'expanding'
                ? 'Expansión orgánica sostenible'
                : repro.status === 'steady'
                ? 'Red estable'
                : 'Requiere mejorar aceptación o permanencia'}
            </span>
          </div>
        </div>
      )}

      {/* INVITACIONES REALES DE SUPABASE ENTRE CUENTAS YOUAPP (Ventana normal ↔ Incógnito) */}
      {panelMsg && (
        <div className="rv-live-notice" role="status">
          {panelMsg}
        </div>
      )}

      {incomingRealRedViva.length > 0 && (
        <div className="rv-incoming-box">
          <div className="rv-incoming-title">
            ✦ TENÉS {incomingRealRedViva.length} INVITACIÓN REAL DE ATLAS RED VIVA (7 DÍAS)
          </div>
          {incomingRealRedViva.map((ag) => (
            <div key={ag.id} className="rv-incoming-row">
              <div>
                <strong>{ag.hostSignalName || ag.hostChannelName || 'Señal YOUAPP'} te invita por 7 días</strong>
                <p>{ag.editorialNote}</p>
              </div>
              <div className="rv-trial-actions">
                <button
                  type="button"
                  className="rv-btn-primary"
                  onClick={() => void onRespondRealInvite?.(ag, 'ACCEPT')}
                >
                  <Check size={13} />
                  <span>Aceptar prueba 7 días</span>
                </button>
                <button
                  type="button"
                  className="rv-btn-ghost"
                  onClick={() => void onRespondRealInvite?.(ag, 'REJECT')}
                >
                  <X size={13} />
                  <span>Rechazar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeRealRedViva.length > 0 && (
        <div className="rv-real-list">
          <div className="rv-opps-head">
            <span>● Pruebas reales en Supabase ({activeRealRedViva.length})</span>
          </div>
          {activeRealRedViva.map((ag) => (
            <div key={ag.id} className="rv-real-item">
              <div>
                <strong>
                  {ag.hostChannelName || ag.hostSignalName || 'Tu señal'} ⇄ {ag.partnerChannelName || 'Canal invitado'}
                </strong>
                <span>
                  Estado real: <strong>{ag.status === 'ACTIVE' ? 'ACTIVA (7 días)' : 'PENDIENTE de aceptación en la otra cuenta'}</strong>
                </span>
              </div>
              {ag.status === 'ACTIVE' && (
                <button
                  type="button"
                  className="rv-btn-ghost"
                  onClick={() => void onRespondRealInvite?.(ag, 'REVOKE')}
                >
                  <X size={12} /> Finalizar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Prueba activa de 7 días (máximo 1 visible) */}
      {activeTrial && progress && (
        <div className="rv-active-trial">
          <div className="rv-trial-top">
            <div>
              <span className="rv-trial-badge">
                <Clock size={11} /> REPETIDORA INVITADA · DÍA {progress.dayNumber} DE 7 ({progress.daysLeft}d restantes)
              </span>
              <h3>{activeTrial.guestChannelName}</h3>
              <p>{activeTrial.reason}</p>
            </div>
            <div className="rv-trial-score">
              <span>Oportunidad S</span>
              <strong>{activeTrial.scorePct}%</strong>
            </div>
          </div>

          <div className="rv-metrics-row">
            <div className="rv-metric">
              <strong>{activeTrial.metrics.referralClicks}</strong>
              <span>Clics derivados</span>
            </div>
            <div className="rv-metric">
              <strong>{activeTrial.metrics.playsFromCard}</strong>
              <span>Reproducciones</span>
            </div>
            <div className="rv-metric">
              <strong>{activeTrial.metrics.newFollowers}</strong>
              <span>Nuevos seguidores</span>
            </div>
          </div>

          <div className="rv-trial-actions">
            <button
              type="button"
              className="rv-btn-secondary"
              onClick={() => {
                setState(recordRedVivaMetric(activeTrial.id, 'referralClicks'));
                if (activeTrial.isCuratorSignal) {
                  navigate(`/misenal1?signal=${encodeURIComponent(activeTrial.guestChannelId.replace(/^curator-/, ''))}`);
                } else {
                  navigate(`/canal/${slugifyChannelName(activeTrial.guestChannelName)}`);
                }
              }}
            >
              <ExternalLink size={13} />
              <span>Abrir canal invitado</span>
            </button>

            <button
              type="button"
              className="rv-btn-primary"
              onClick={() => {
                const name = activeTrial.guestChannelName;
                setState(decideRedVivaTrial('PERMANENT'));
                onPermanentAccepted?.(name);
              }}
            >
              <Check size={13} />
              <span>Aceptar como permanente</span>
            </button>

            <button
              type="button"
              className="rv-btn-ghost"
              onClick={() => setState(decideRedVivaTrial('ENDED'))}
            >
              <X size={13} />
              <span>Finalizar prueba</span>
            </button>
          </div>
        </div>
      )}

      {/* Oportunidades calculadas por ATLAS (S = 0.35A + 0.30N + 0.20C + 0.15Q) */}
      {state.settings.optedIn && (
        <div className="rv-opps-wrap">
          <div className="rv-opps-head">
            <span>
              <Sparkles size={13} /> Candidatos recomendados por ATLAS (fórmula S = 0.35A + 0.30N + 0.20C + 0.15Q)
            </span>
            {activeTrial && <span className="rv-cap-note">Cupo activo: 1/1 prueba visible</span>}
          </div>

          <div className="rv-opps-grid">
            {opportunities.map((opp) => {
              const avatar = resolveKnownChannelAvatar(opp.channel.name);
              const initial = (opp.channel.name[0] || 'C').toUpperCase();
              return (
                <div key={opp.channel.id} className="rv-opp-card">
                  <div className="rv-opp-top">
                    <span className="rv-opp-avatar">
                      {avatar ? <img src={avatar} alt={opp.channel.name} /> : <span>{initial}</span>}
                    </span>
                    <div className="rv-opp-title">
                      <strong>{opp.channel.name}</strong>
                      <span>
                        {realDirectoryIds.has(opp.channel.id)
                          ? '● Señal real YOUAPP · '
                          : ''}
                        {opp.channel.category}
                        {opp.channel.isCuratorSignal
                          ? ' · Curador YOUAPP'
                          : opp.isSmallOrCuratorSlot && !realDirectoryIds.has(opp.channel.id)
                          ? ' · Señal nueva'
                          : ''}
                      </span>
                    </div>
                    <span className="rv-opp-score">{opp.scorePct}%</span>
                  </div>

                  <p className="rv-opp-reason">{opp.complementaryReason}</p>

                  <div className="rv-factors-line">
                    <span>A {(opp.factors.A * 100).toFixed(0)}</span>
                    <span>N {(opp.factors.N * 100).toFixed(0)}</span>
                    <span>C {(opp.factors.C * 100).toFixed(0)}</span>
                    <span>Q {(opp.factors.Q * 100).toFixed(0)}</span>
                  </div>

                  <button
                    type="button"
                    className="rv-invite-btn"
                    disabled={
                      sendingId === opp.channel.id ||
                      (!realDirectoryIds.has(opp.channel.id) && Boolean(activeTrial))
                    }
                    onClick={async () => {
                      const isRealUser = realDirectoryIds.has(opp.channel.id);
                      if (isRealUser && onSendRealInvite) {
                        setSendingId(opp.channel.id);
                        setPanelMsg(null);
                        try {
                          const ok = await onSendRealInvite(opp.channel, opp.scorePct, opp.complementaryReason);
                          if (ok) {
                            setPanelMsg(
                              `Invitación REAL de 7 días enviada a «${opp.channel.name}» en Supabase. Abrí su cuenta en la ventana de Incógnito para aceptarla.`
                            );
                          }
                        } finally {
                          setSendingId(null);
                        }
                        return;
                      }
                      setState(
                        startRedVivaTrial({
                          hostSignalId,
                          guestChannelId: opp.channel.id,
                          guestChannelName: opp.channel.name,
                          guestCategory: opp.channel.category,
                          guestOriginUrl: opp.channel.originUrl || 'https://youapp.tv',
                          guestAvatarUrl: avatar,
                          guestFeaturedVideoTitle: opp.channel.featuredVideoTitle || undefined,
                          isCuratorSignal: opp.channel.isCuratorSignal,
                          scorePct: opp.scorePct,
                          factors: opp.factors,
                          reason: opp.complementaryReason
                        })
                      );
                    }}
                  >
                    <UserPlus size={13} />
                    <span>
                      {sendingId === opp.channel.id
                        ? 'Enviando a Supabase…'
                        : realDirectoryIds.has(opp.channel.id)
                        ? 'Invitar 7 días (Real)'
                        : activeTrial
                        ? 'Esperando cierre de prueba activa'
                        : 'Probar 7 días (Local)'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .rv-panel {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 22px;
          padding: 20px;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 20px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
          color: #1d1d1f;
        }
        .rv-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .rv-head-left {
          flex: 1 1 320px;
        }
        .rv-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .rv-head h2 {
          margin: 4px 0 4px;
          font-size: 19px;
          font-weight: 750;
          letter-spacing: -0.025em;
        }
        .rv-head p {
          margin: 0;
          font-size: 13px;
          color: #6e6e73;
          line-height: 1.45;
        }
        .rv-optin-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 13px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.09);
          border: 1px solid rgba(0, 113, 227, 0.22);
          color: #0071e3;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .rv-prefs-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rv-cats {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .rv-cat-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #424245;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .rv-cat-pill.active {
          background: #1d1d1f;
          color: #ffffff;
          border-color: #1d1d1f;
        }
        .rv-prefs-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rv-curator-check {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: #424245;
          cursor: pointer;
        }
        .rv-calc-toggle {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .rv-calc-toggle.active {
          background: #0071e3;
          color: #ffffff;
          border-color: #0071e3;
        }
        .rv-sim-box {
          padding: 16px;
          border-radius: 18px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.07);
          display: flex;
          flex-direction: column;
          gap: 13px;
        }
        .rv-sim-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rv-sim-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.04em;
          color: #0071e3;
          background: rgba(0, 113, 227, 0.1);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .rv-sim-top h3 {
          margin: 5px 0 0;
          font-size: 15.5px;
          font-weight: 720;
        }
        .rv-sim-presets {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .rv-preset-btn {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .rv-preset-btn.primary {
          background: #1d1d1f;
          color: #ffffff;
          border-color: #1d1d1f;
        }
        .rv-sim-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 9px;
        }
        .rv-sim-kpi {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 14px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .rv-sim-kpi.accent {
          border-color: rgba(0, 113, 227, 0.28);
          background: linear-gradient(135deg, rgba(0, 113, 227, 0.06) 0%, #ffffff 100%);
        }
        .rv-sim-kpi span {
          font-size: 11px;
          font-weight: 600;
          color: #6e6e73;
        }
        .rv-sim-kpi strong {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #1d1d1f;
        }
        .rv-sim-kpi.accent strong {
          color: #0071e3;
        }
        .rv-sim-kpi small {
          font-size: 10.5px;
          color: #86868b;
        }
        .rv-sim-chart {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: 118px;
          padding: 12px 12px 6px;
          border-radius: 14px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .rv-bar-col {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          min-width: 0;
        }
        .rv-bar-val {
          font-size: 10px;
          font-weight: 700;
          color: #424245;
          font-variant-numeric: tabular-nums;
        }
        .rv-bar-track {
          width: 100%;
          max-width: 34px;
          flex: 1;
          display: flex;
          align-items: flex-end;
          background: rgba(118, 118, 128, 0.09);
          border-radius: 8px;
          overflow: hidden;
        }
        .rv-bar-fill {
          width: 100%;
          background: linear-gradient(180deg, #2997ff 0%, #0071e3 100%);
          border-radius: 8px 8px 0 0;
          transition: height 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rv-bar-lbl {
          font-size: 10.5px;
          font-weight: 600;
          color: #86868b;
        }
        .rv-calc-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          padding: 14px;
          border-radius: 16px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .rv-calc-sliders {
          flex: 1 1 320px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
        }
        .rv-calc-sliders label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11.5px;
          color: #424245;
        }
        .rv-calc-result {
          min-width: 170px;
          padding: 12px 16px;
          border-radius: 16px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.07);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .rv-calc-label {
          font-size: 10.5px;
          font-weight: 650;
          color: #6e6e73;
        }
        .rv-calc-result strong {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #0071e3;
        }
        .rv-calc-result.expanding strong { color: #16a34a; }
        .rv-calc-result.contracting strong { color: #d97706; }
        .rv-calc-result span:last-child {
          font-size: 11px;
          color: #6e6e73;
        }
        .rv-active-trial {
          padding: 16px;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(0, 113, 227, 0.06) 0%, rgba(255, 255, 255, 0.96) 100%);
          border: 1px solid rgba(0, 113, 227, 0.24);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rv-trial-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .rv-trial-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 750;
          color: #0071e3;
        }
        .rv-active-trial h3 {
          margin: 4px 0 2px;
          font-size: 17px;
          font-weight: 720;
        }
        .rv-active-trial p {
          margin: 0;
          font-size: 12.5px;
          color: #6e6e73;
        }
        .rv-trial-score {
          text-align: right;
          flex-shrink: 0;
        }
        .rv-trial-score span {
          display: block;
          font-size: 10px;
          color: #6e6e73;
        }
        .rv-trial-score strong {
          font-size: 22px;
          font-weight: 800;
          color: #0071e3;
        }
        .rv-metrics-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .rv-metric {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 12px;
          padding: 9px 10px;
          text-align: center;
        }
        .rv-metric strong {
          display: block;
          font-size: 18px;
          font-weight: 750;
          color: #1d1d1f;
        }
        .rv-metric span {
          font-size: 11px;
          color: #6e6e73;
        }
        .rv-trial-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rv-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: #16a34a;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .rv-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .rv-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.12);
          color: #424245;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .rv-opps-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rv-opps-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12px;
          font-weight: 650;
          color: #424245;
        }
        .rv-opps-head span:first-child {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .rv-cap-note {
          font-size: 11px;
          color: #0071e3;
          background: rgba(0, 113, 227, 0.09);
          padding: 2px 9px;
          border-radius: 999px;
        }
        .rv-opps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
          gap: 10px;
        }
        .rv-opp-card {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.07);
          border-radius: 16px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .rv-opp-top {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .rv-opp-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .rv-opp-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .rv-opp-title {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .rv-opp-title strong {
          font-size: 12.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rv-opp-title span {
          font-size: 10.5px;
          color: #6e6e73;
        }
        .rv-opp-score {
          font-size: 12px;
          font-weight: 800;
          color: #0071e3;
          background: rgba(0, 113, 227, 0.1);
          padding: 3px 8px;
          border-radius: 999px;
        }
        .rv-opp-reason {
          margin: 0;
          font-size: 11.5px;
          color: #424245;
          line-height: 1.35;
        }
        .rv-factors-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10.5px;
          font-weight: 600;
          color: #86868b;
          background: #f5f5f7;
          padding: 4px 8px;
          border-radius: 8px;
          font-variant-numeric: tabular-nums;
        }
        .rv-invite-btn {
          margin-top: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .rv-invite-btn:disabled {
          background: #e5e5ea;
          color: #8e8e93;
          cursor: not-allowed;
        }
        .rv-live-notice {
          padding: 10px 14px;
          border-radius: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12.5px;
          font-weight: 620;
        }
        .rv-incoming-box {
          padding: 14px 16px;
          border-radius: 18px;
          background: linear-gradient(135deg, #fffbeb 0%, #ffffff 100%);
          border: 1.5px solid #f59e0b;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rv-incoming-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #b45309;
        }
        .rv-incoming-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rv-incoming-row strong {
          display: block;
          font-size: 14px;
          color: #1d1d1f;
        }
        .rv-incoming-row p {
          margin: 2px 0 0;
          font-size: 12px;
          color: #6e6e73;
        }
        .rv-real-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid rgba(0, 0, 0, 0.07);
        }
        .rv-real-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 8px 10px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }
        .rv-real-item strong {
          display: block;
          font-size: 13px;
          color: #1d1d1f;
        }
        .rv-real-item span {
          font-size: 11.5px;
          color: #6e6e73;
        }
      `}</style>
    </section>
  );
};
