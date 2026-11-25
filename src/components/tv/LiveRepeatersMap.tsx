import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Compass,
  ExternalLink,
  Network,
  Sparkles,
  Tv,
  X
} from 'lucide-react';
import {
  computeRedVivaOpportunities,
  type AffinityAnchorInput,
  type RedVivaCandidateInput
} from '../../lib/tv/repeaterAffinityEngine';
import { CURATED_SIGNALS_PILOT } from '../../lib/tv/curatedSignalsCatalog';
import { readRedVivaState } from '../../lib/tv/atlasRedVivaStore';
import type { AssociationAgreementItem } from '../../lib/tv/associationsService';

export type MapFilterMode = 'all' | 'active' | 'opportunities';

type MapNodeKind = 'active' | 'trial' | 'incoming' | 'outgoing' | 'opportunity';

interface MapNode {
  id: string;
  label: string;
  shortLabel: string;
  kind: MapNodeKind;
  category: string;
  scorePct?: number;
  clicks?: number;
  reason: string;
  originUrl?: string | null;
  curatedSignalId?: string;
  agreement?: AssociationAgreementItem;
  candidate?: RedVivaCandidateInput;
  x: number;
  y: number;
}

interface LiveRepeatersMapProps {
  hostSignalId: string;
  currentUserId: string | null;
  anchor: AffinityAnchorInput;
  agreements: AssociationAgreementItem[];
  directoryCandidates: RedVivaCandidateInput[];
  alreadyAssociatedIds: string[];
  busy?: boolean;
  onOpenSignal: (pathOrUrl: string, isExternal?: boolean) => void;
  onInviteCandidate: (
    candidate: RedVivaCandidateInput,
    scorePct: number,
    reason: string
  ) => Promise<boolean>;
  onRespondInvite: (
    ag: AssociationAgreementItem,
    action: 'ACCEPT' | 'REJECT' | 'REVOKE'
  ) => Promise<void>;
}

const CX = 340;
const CY = 210;

function truncateLabel(text?: string | null, max = 16): string {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function distributeOnRing<T>(
  items: T[],
  radius: number,
  startAngleDeg: number
): Array<{ item: T; x: number; y: number }> {
  if (items.length === 0) return [];
  const step = 360 / items.length;
  return items.map((item, idx) => {
    const rad = ((startAngleDeg + idx * step) * Math.PI) / 180;
    return {
      item,
      x: CX + Math.cos(rad) * radius,
      y: CY + Math.sin(rad) * radius
    };
  });
}

export const LiveRepeatersMap: React.FC<LiveRepeatersMapProps> = ({
  hostSignalId,
  currentUserId,
  anchor,
  agreements,
  directoryCandidates,
  alreadyAssociatedIds,
  busy = false,
  onOpenSignal,
  onInviteCandidate,
  onRespondInvite
}) => {
  const [filter, setFilter] = useState<MapFilterMode>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const redVivaState = useMemo(() => readRedVivaState(), [hostSignalId]);

  const nodes = useMemo<MapNode[]>(() => {
    const activeAgs = agreements.filter(
      (a) =>
        (a.hostUserId === currentUserId || a.partnerUserId === currentUserId) &&
        a.status === 'ACTIVE'
    );
    const incomingAgs = agreements.filter(
      (a) => a.partnerUserId === currentUserId && a.status === 'PENDING'
    );
    const outgoingAgs = agreements.filter(
      (a) => a.hostUserId === currentUserId && a.status === 'PENDING'
    );

    const innerRaw: Omit<MapNode, 'x' | 'y'>[] = [];

    for (const ag of activeAgs.slice(0, 5)) {
      const isHost = ag.hostUserId === currentUserId;
      const otherName = isHost
        ? ag.partnerSignalName || ag.partnerChannelName || 'Señal asociada'
        : ag.hostSignalName || ag.hostChannelName || 'Señal asociada';
      innerRaw.push({
        id: `ag-act-${ag.id}`,
        label: otherName,
        shortLabel: truncateLabel(otherName, 15),
        kind: 'active',
        category: 'Repetidora activa',
        clicks: ag.referralClicks || 0,
        reason: ag.editorialNote || 'Conexión activa Señal ⇄ Señal en Supabase.',
        originUrl: ag.partnerChannelOriginUrl,
        agreement: ag
      });
    }

    if (redVivaState.activeTrial && redVivaState.activeTrial.status === 'ACTIVE_7D') {
      const t = redVivaState.activeTrial;
      innerRaw.push({
        id: `trial-${t.id}`,
        label: t.guestChannelName,
        shortLabel: truncateLabel(t.guestChannelName, 15),
        kind: 'trial',
        category: t.guestCategory || 'Prueba 7 días',
        scorePct: t.scorePct,
        clicks: (t.metrics?.playsFromCard || 0) + (t.metrics?.referralClicks || 0),
        reason: t.reason,
        curatedSignalId: t.isCuratorSignal
          ? t.guestChannelId.replace(/^curator-/, '')
          : undefined
      });
    }

    const middleRaw: Omit<MapNode, 'x' | 'y'>[] = [];
    for (const ag of incomingAgs.slice(0, 3)) {
      const name = ag.hostSignalName || ag.hostChannelName || 'Señal YOUAPP';
      middleRaw.push({
        id: `ag-in-${ag.id}`,
        label: name,
        shortLabel: truncateLabel(name, 14),
        kind: 'incoming',
        category: 'Invitación recibida',
        reason: ag.editorialNote || 'Quiere conectar su señal como repetidora mutua.',
        agreement: ag
      });
    }
    for (const ag of outgoingAgs.slice(0, 3)) {
      const name = ag.partnerSignalName || ag.partnerChannelName || 'Señal invitada';
      middleRaw.push({
        id: `ag-out-${ag.id}`,
        label: name,
        shortLabel: truncateLabel(name, 14),
        kind: 'outgoing',
        category: 'Invitación enviada',
        reason: ag.editorialNote || 'Esperando respuesta de la otra señal.',
        agreement: ag
      });
    }

    // Oportunidades reales de afinidad S (directorio Supabase + curadas YOUAPP como complemento)
    const curatedPool: RedVivaCandidateInput[] = CURATED_SIGNALS_PILOT.map((s) => ({
      id: `curator-${s.id}`,
      userId: null,
      name: s.title,
      category: s.tags[0] || 'Curaduría YOUAPP',
      originPlatform: 'YOUAPP',
      originUrl: `/misenal1?signal=${encodeURIComponent(s.id)}`,
      description: s.subtitle,
      isCuratorSignal: true
    }));

    const combinedPool: RedVivaCandidateInput[] = [
      ...directoryCandidates.filter((d) => d.userId !== currentUserId),
      ...curatedPool
    ];

    const ranked = computeRedVivaOpportunities(
      anchor,
      combinedPool,
      alreadyAssociatedIds,
      { includeCurators: true, limit: 6 }
    );

    const outerRaw: Omit<MapNode, 'x' | 'y'>[] = ranked.map((op) => ({
      id: `opp-${op.channel.id}`,
      label: op.channel.name,
      shortLabel: truncateLabel(op.channel.name, 15),
      kind: 'opportunity',
      category: op.channel.category || 'Oportunidad',
      scorePct: op.scorePct,
      reason: op.complementaryReason,
      originUrl: op.channel.originUrl,
      curatedSignalId: op.channel.isCuratorSignal
        ? op.channel.id.replace(/^curator-/, '')
        : undefined,
      candidate: op.channel
    }));

    const showInner = filter === 'all' || filter === 'active';
    const showMiddle = filter === 'all' || filter === 'active';
    const showOuter = filter === 'all' || filter === 'opportunities';

    const placed: MapNode[] = [];
    if (showInner) {
      for (const p of distributeOnRing(innerRaw, 102, -90)) {
        placed.push({ ...p.item, x: p.x, y: p.y });
      }
    }
    if (showMiddle) {
      for (const p of distributeOnRing(middleRaw, 142, -35)) {
        placed.push({ ...p.item, x: p.x, y: p.y });
      }
    }
    if (showOuter) {
      for (const p of distributeOnRing(outerRaw, 174, -60)) {
        placed.push({ ...p.item, x: p.x, y: p.y });
      }
    }
    return placed;
  }, [
    agreements,
    alreadyAssociatedIds,
    anchor,
    currentUserId,
    directoryCandidates,
    filter,
    redVivaState.activeTrial
  ]);

  const selectedNode =
    nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null;

  const activeCount = nodes.filter((n) => n.kind === 'active' || n.kind === 'trial').length;
  const oppCount = nodes.filter((n) => n.kind === 'opportunity').length;

  const kindColor = (kind: MapNodeKind) => {
    switch (kind) {
      case 'active':
        return '#10b981';
      case 'trial':
        return '#0071e3';
      case 'incoming':
      case 'outgoing':
        return '#f59e0b';
      case 'opportunity':
      default:
        return '#6366f1';
    }
  };

  const kindBadgeLabel = (kind: MapNodeKind) => {
    switch (kind) {
      case 'active':
        return 'Repetidora activa';
      case 'trial':
        return 'Invitada 7 días';
      case 'incoming':
        return 'Invitación recibida';
      case 'outgoing':
        return 'Invitación enviada';
      case 'opportunity':
      default:
        return 'Oportunidad de colaboración';
    }
  };

  return (
    <section className="lrm-card" aria-label="Mapa vivo de repetidoras">
      <div className="lrm-head">
        <div className="lrm-head-left">
          <span className="lrm-eyebrow">
            <Network size={12} /> MAPA VIVO DE REPETIDORAS
          </span>
          <h2>Tu red directa y circulación de recomendaciones</h2>
        </div>

        <div className="lrm-filters" role="tablist" aria-label="Filtrar mapa de red">
          <button
            type="button"
            className={`lrm-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Toda la red ({nodes.length})
          </button>
          <button
            type="button"
            className={`lrm-filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Activas ({activeCount})
          </button>
          <button
            type="button"
            className={`lrm-filter-btn ${filter === 'opportunities' ? 'active' : ''}`}
            onClick={() => setFilter('opportunities')}
          >
            Oportunidades ({oppCount})
          </button>
        </div>
      </div>

      <div className="lrm-grid">
        {/* Grafo SVG interactivo */}
        <div className="lrm-canvas-wrap">
          <svg
            viewBox="0 0 680 420"
            className="lrm-svg"
            role="img"
            aria-label={`Mapa de conexiones de ${anchor.name || 'Mi Señal'}`}
          >
            {/* Anillos orbitales suaves */}
            <circle cx={CX} cy={CY} r={102} className="lrm-orbit" />
            <circle cx={CX} cy={CY} r={174} className="lrm-orbit dashed" />

            {/* Conexiones desde el centro a cada nodo */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const stroke = kindColor(node.kind);
              const isFlowing = node.kind === 'active' || node.kind === 'trial';
              return (
                <line
                  key={`edge-${node.id}`}
                  x1={CX}
                  y1={CY}
                  x2={node.x}
                  y2={node.y}
                  stroke={stroke}
                  strokeOpacity={isSelected ? 0.95 : isFlowing ? 0.65 : 0.35}
                  strokeWidth={isSelected ? 2.6 : isFlowing ? 2 : 1.4}
                  strokeDasharray={
                    node.kind === 'opportunity'
                      ? '3 5'
                      : node.kind === 'incoming' || node.kind === 'outgoing'
                      ? '6 4'
                      : '8 4'
                  }
                  className={isFlowing ? 'lrm-edge-flow' : undefined}
                />
              );
            })}

            {/* Nodo central: Tu Señal */}
            <g className="lrm-center-node">
              <circle cx={CX} cy={CY} r={44} className="lrm-center-halo" />
              <circle cx={CX} cy={CY} r={36} className="lrm-center-circle" />
              <text x={CX} y={CY - 4} textAnchor="middle" className="lrm-center-eyebrow">
                TU SEÑAL
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle" className="lrm-center-label">
                {truncateLabel(anchor.name || 'Mi Señal', 13)}
              </text>
            </g>

            {/* Nodos de red y oportunidades */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const color = kindColor(node.kind);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={`lrm-node ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNodeId(node.id);
                    }
                  }}
                >
                  {isSelected && (
                    <circle r={27} fill={color} fillOpacity={0.16} />
                  )}
                  <circle
                    r={21}
                    fill="#ffffff"
                    stroke={color}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                  <text y={3} textAnchor="middle" className="lrm-node-metric" fill={color}>
                    {node.scorePct !== undefined
                      ? `S ${node.scorePct}%`
                      : node.clicks !== undefined
                      ? `${node.clicks} clics`
                      : node.kind === 'incoming'
                      ? 'RECIB.'
                      : 'ENV.'}
                  </text>
                  <text y={35} textAnchor="middle" className="lrm-node-name">
                    {node.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="lrm-legend">
            <span>
              <i style={{ background: '#10b981' }} /> Activa
            </span>
            <span>
              <i style={{ background: '#0071e3' }} /> Invitada 7 días
            </span>
            <span>
              <i style={{ background: '#f59e0b' }} /> Pendiente
            </span>
            <span>
              <i style={{ background: '#6366f1' }} /> Oportunidad (S %)
            </span>
          </div>
        </div>

        {/* Panel inspector del nodo seleccionado */}
        <aside className="lrm-inspector">
          {selectedNode ? (
            <>
              <div className="lrm-ins-top">
                <span
                  className="lrm-ins-badge"
                  style={{
                    color: kindColor(selectedNode.kind),
                    background: `${kindColor(selectedNode.kind)}18`
                  }}
                >
                  {kindBadgeLabel(selectedNode.kind)}
                </span>
                {selectedNode.scorePct !== undefined && (
                  <span className="lrm-ins-score">Afinidad S {selectedNode.scorePct}%</span>
                )}
              </div>

              <h3 className="lrm-ins-title">{selectedNode.label}</h3>
              <span className="lrm-ins-cat">{selectedNode.category}</span>
              <p className="lrm-ins-reason">{selectedNode.reason}</p>

              {selectedNode.clicks !== undefined && (
                <div className="lrm-ins-stat">
                  <ArrowLeftRight size={13} color="#0071e3" />
                  <span>
                    <strong>{selectedNode.clicks}</strong> derivaciones registradas en tu red
                  </span>
                </div>
              )}

              <div className="lrm-ins-actions">
                {selectedNode.kind === 'incoming' && selectedNode.agreement && (
                  <>
                    <button
                      type="button"
                      className="lrm-btn-primary"
                      disabled={busy}
                      onClick={() => void onRespondInvite(selectedNode.agreement!, 'ACCEPT')}
                    >
                      <Check size={13} /> Aceptar repetidora
                    </button>
                    <button
                      type="button"
                      className="lrm-btn-ghost"
                      disabled={busy}
                      onClick={() => void onRespondInvite(selectedNode.agreement!, 'REJECT')}
                    >
                      <X size={13} /> Rechazar
                    </button>
                  </>
                )}

                {selectedNode.kind === 'opportunity' &&
                  selectedNode.candidate &&
                  !selectedNode.curatedSignalId && (
                    <button
                      type="button"
                      className="lrm-btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void onInviteCandidate(
                          selectedNode.candidate!,
                          selectedNode.scorePct || 70,
                          selectedNode.reason
                        )
                      }
                    >
                      <Sparkles size={13} /> Proponer repetidora (7 días)
                    </button>
                  )}

                {selectedNode.curatedSignalId && (
                  <button
                    type="button"
                    className="lrm-btn-primary"
                    onClick={() =>
                      onOpenSignal(
                        `/misenal1?signal=${encodeURIComponent(selectedNode.curatedSignalId!)}`,
                        false
                      )
                    }
                  >
                    <Tv size={13} /> Explorar señal en YOUAPP
                  </button>
                )}

                {!selectedNode.curatedSignalId && selectedNode.originUrl && (
                  <button
                    type="button"
                    className="lrm-btn-secondary"
                    onClick={() =>
                      onOpenSignal(
                        selectedNode.originUrl!,
                        /^https?:\/\//i.test(selectedNode.originUrl!)
                      )
                    }
                  >
                    <ExternalLink size={13} /> Abrir señal
                  </button>
                )}

                {(selectedNode.kind === 'active' || selectedNode.kind === 'outgoing') &&
                  selectedNode.agreement && (
                    <button
                      type="button"
                      className="lrm-btn-ghost"
                      disabled={busy}
                      onClick={() => void onRespondInvite(selectedNode.agreement!, 'REVOKE')}
                    >
                      <X size={13} /> Quitar conexión
                    </button>
                  )}
              </div>
            </>
          ) : (
            <div className="lrm-ins-empty">
              <Compass size={20} color="#86868b" />
              <p>Tocá cualquier nodo del mapa para ver cómo se conecta con tu señal.</p>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .lrm-card {
          position: relative;
          background: rgba(255, 255, 255, 0.09);
          backdrop-filter: blur(22px) saturate(155%);
          -webkit-backdrop-filter: blur(22px) saturate(155%);
          border-radius: 26px;
          padding: 20px 22px;
          box-shadow: 0 22px 48px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: #f5f5f7;
        }
        .lrm-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.8px;
          background:
            radial-gradient(240px circle at 0% 0%, rgba(255, 255, 255, 0.88), transparent 56%),
            radial-gradient(220px circle at 100% 0%, rgba(167, 243, 208, 0.7), transparent 56%),
            radial-gradient(240px circle at 100% 100%, rgba(255, 255, 255, 0.65), transparent 56%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }
        .lrm-card > * {
          position: relative;
          z-index: 1;
        }
        .lrm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .lrm-head-left {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .lrm-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #a7f3d0;
        }
        .lrm-head h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 750;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .lrm-filters {
          display: inline-flex;
          gap: 4px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 3px;
          border-radius: 999px;
        }
        .lrm-filter-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          font-size: 11.5px;
          font-weight: 650;
          padding: 5px 12px;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .lrm-filter-btn.active {
          background: rgba(255, 255, 255, 0.92);
          color: #101614;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .lrm-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(250px, 1fr);
          gap: 16px;
          align-items: stretch;
        }
        .lrm-canvas-wrap {
          border-radius: 20px;
          background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.12) 0%, rgba(12, 18, 15, 0.36) 100%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .lrm-svg {
          width: 100%;
          height: auto;
          max-height: 360px;
          display: block;
          user-select: none;
        }
        .lrm-orbit {
          fill: none;
          stroke: rgba(255, 255, 255, 0.2);
          stroke-width: 1;
        }
        .lrm-orbit.dashed {
          stroke-dasharray: 4 5;
        }
        .lrm-edge-flow {
          animation: lrmDashFlow 14s linear infinite;
        }
        @keyframes lrmDashFlow {
          from { stroke-dashoffset: 120; }
          to { stroke-dashoffset: 0; }
        }
        .lrm-center-halo {
          fill: rgba(100, 210, 255, 0.22);
        }
        .lrm-center-circle {
          fill: rgba(14, 22, 18, 0.88);
          stroke: #64d2ff;
          stroke-width: 2.5;
        }
        .lrm-center-eyebrow {
          fill: #a7f3d0;
          font-size: 7.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .lrm-center-label {
          fill: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .lrm-node {
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .lrm-node:hover {
          opacity: 0.92;
        }
        .lrm-node-metric {
          font-size: 9px;
          font-weight: 800;
        }
        .lrm-node-name {
          fill: #ffffff;
          font-size: 10.5px;
          font-weight: 650;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
        }
        .lrm-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 12px;
          font-size: 11px;
          color: rgba(245, 245, 247, 0.82);
          font-weight: 600;
        }
        .lrm-legend span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .lrm-legend i {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
        }
        .lrm-inspector {
          border-radius: 20px;
          background: rgba(14, 20, 18, 0.42);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          color: #f5f5f7;
        }
        .lrm-ins-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          flex-wrap: wrap;
        }
        .lrm-ins-badge {
          font-size: 10.5px;
          font-weight: 750;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .lrm-ins-score {
          font-size: 11px;
          font-weight: 750;
          color: #a7f3d0;
        }
        .lrm-ins-title {
          margin: 2px 0 0;
          font-size: 17px;
          font-weight: 750;
          color: #ffffff;
          line-height: 1.25;
        }
        .lrm-ins-cat {
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
          font-weight: 600;
        }
        .lrm-ins-reason {
          margin: 2px 0 0;
          font-size: 12.5px;
          line-height: 1.48;
          color: rgba(245, 245, 247, 0.85);
        }
        .lrm-ins-stat {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 11px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-size: 12px;
          color: #ffffff;
        }
        .lrm-ins-actions {
          margin-top: auto;
          padding-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .lrm-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .lrm-btn-primary:hover:not(:disabled) {
          background: #0a84ff;
        }
        .lrm-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .lrm-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.18);
        }
        .lrm-btn-ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(245, 245, 247, 0.82);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .lrm-ins-empty {
          margin: auto;
          text-align: center;
          color: rgba(245, 245, 247, 0.72);
          font-size: 12.5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        @media (max-width: 820px) {
          .lrm-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
};
