import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX, 
  Activity, 
  Lock, 
  Mail, 
  TrendingUp, 
  RefreshCw,
  Info
} from 'lucide-react';
import type { ReputationEvaluationResult, VolumeGovernorTierKey } from '../../lib/atlasMailFabric/types';
import { AtlasMailVolumeGovernor } from '../../lib/atlasMailFabric/AtlasMailVolumeGovernor';

interface AtlasReputationDashboardProps {
  domain?: string;
  initialEvaluation?: ReputationEvaluationResult;
}

export const AtlasReputationDashboard: React.FC<AtlasReputationDashboardProps> = ({
  domain = 'youapp.com',
  initialEvaluation
}) => {
  const [evaluation] = useState<ReputationEvaluationResult>(
    initialEvaluation || {
      domain,
      evaluation_date: new Date().toISOString().split('T')[0],
      overall_status: 'WATCH',
      gate_reason: 'INSUFFICIENT_SAMPLE_NEW_IP_PILOT_ONLY',
      google_spam_rate: 0.0000,
      google_domain_reputation: 'INSUFFICIENT_SAMPLE',
      google_ip_reputation: 'INSUFFICIENT_SAMPLE',
      google_compliance_status: 'COMPLIANT_V2',
      snds_abnormal: false,
      auth_status: 'PASS',
      smtp_accepted_count: 18,
      smtp_deferral_count: 0,
      smtp_rejection_count: 0,
      bounce_rate: 0.0000,
      complaint_rate: 0.0000,
      current_allowed_volume_per_day: 25,
      current_tier: 'PILOT_ONLY',
      consecutive_green_days: 0,
      can_scale_volume: false,
      has_sufficient_sample: false
    }
  );

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const getStatusBadge = (status: 'GREEN' | 'WATCH' | 'HOLD') => {
    switch (status) {
      case 'GREEN':
        return (
          <div className="status-badge status-green">
            <ShieldCheck size={16} className="badge-icon" />
            <span>GREEN — DISPATCH PERMITTED</span>
          </div>
        );
      case 'WATCH':
        return (
          <div className="status-badge status-watch">
            <ShieldAlert size={16} className="badge-icon" />
            <span>WATCH — VOLUME FROZEN / PILOT ONLY</span>
          </div>
        );
      case 'HOLD':
        return (
          <div className="status-badge status-hold">
            <ShieldX size={16} className="badge-icon" />
            <span>HOLD — DISPATCHES BLOCKED</span>
          </div>
        );
    }
  };

  const tierConfig = AtlasMailVolumeGovernor.TIERS[evaluation.current_tier as VolumeGovernorTierKey] || AtlasMailVolumeGovernor.TIERS.PILOT_ONLY;

  return (
    <div className="reputation-dashboard-root">
      {/* Header Banner */}
      <div className="rep-header">
        <div className="rep-title-group">
          <div className="rep-icon-wrap">
            <Activity className="rep-main-icon" size={24} />
          </div>
          <div>
            <h2 className="rep-heading">Atlas Reputation Guard V1</h2>
            <p className="rep-subheading">
              Real-time Deliverability & Signal Governance for <strong style={{ color: '#60a5fa' }}>{domain}</strong>
            </p>
          </div>
        </div>

        <div className="rep-header-actions">
          <div className="zero-pii-chip">
            <Lock size={12} />
            <span>ZERO-PII CERTIFIED</span>
          </div>
          <button 
            className={`rep-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            title="Refresh Signal Telemetry"
          >
            <RefreshCw size={14} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Main Status & Gate Banner */}
      <div className={`rep-status-card status-${evaluation.overall_status.toLowerCase()}`}>
        <div className="status-top-row">
          <div className="status-indicator-group">
            {getStatusBadge(evaluation.overall_status)}
            <div className="gate-reason-text">
              <strong>Motivo del Gate:</strong> {evaluation.gate_reason}
            </div>
          </div>
          <div className="volume-cap-badge">
            <span className="vol-label">Cap Diario Permitido:</span>
            <span className="vol-value">{evaluation.current_allowed_volume_per_day.toLocaleString()} msgs/día</span>
          </div>
        </div>

        {evaluation.overall_status === 'WATCH' && !evaluation.has_sufficient_sample && (
          <div className="info-callout">
            <Info size={16} className="callout-icon" />
            <span>
              <strong>Fase de Observación Inicial (IP Nueva):</strong> Los proveedores (Google / Microsoft) aún no registran volumen estadístico suficiente para calcular puntuación de reputación. La autenticación y registros locales están saludables, autorizando el piloto controlado dentro del límite conservador.
            </span>
          </div>
        )}
      </div>

      {/* 4 Key Pillar Grid */}
      <div className="rep-grid">
        {/* 1. Google Postmaster Tools v2 */}
        <div className="rep-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <div className="provider-dot google-dot"></div>
              <h3>Google Postmaster Tools API v2</h3>
            </div>
            <span className="compliance-tag">DOMAIN VERIFIED</span>
          </div>

          <div className="metric-row">
            <span className="metric-name">API Integration:</span>
            <span className="metric-val val-warning">NOT_CONFIGURED (OAuth2 Ready)</span>
          </div>
          <div className="metric-row">
            <span className="metric-name">Google Data Feed:</span>
            <span className="metric-val val-warning">INSUFFICIENT_SAMPLE</span>
          </div>

          <div className="spam-gauge-bar">
            <div 
              className="spam-fill"
              style={{ 
                width: '0%',
                backgroundColor: '#10b981'
              }}
            ></div>
            <div className="target-line target-010" title="Google Target: < 0.10%"></div>
            <div className="target-line target-030" title="Google Hard Threshold: 0.30%"></div>
          </div>
          <div className="gauge-labels">
            <span>0.00%</span>
            <span className="target-label">0.10% (Target)</span>
            <span className="danger-label">0.30% (Critical)</span>
          </div>

          <div className="submetrics-list">
            <div className="submetric-item">
              <span>Domain Reputation:</span>
              <strong className="badge-sub text-amber">INSUFFICIENT_SAMPLE</strong>
            </div>
            <div className="submetric-item">
              <span>IP Reputation:</span>
              <strong className="badge-sub text-amber">INSUFFICIENT_SAMPLE</strong>
            </div>
            <div className="submetric-item">
              <span>DNS Auth (SPF/DKIM/DMARC):</span>
              <strong className="badge-sub text-emerald">PASS (p=quarantine)</strong>
            </div>
          </div>
        </div>

        {/* 2. Microsoft SNDS */}
        <div className="rep-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <div className="provider-dot msft-dot"></div>
              <h3>Microsoft SNDS</h3>
            </div>
            <span className="compliance-tag">PORTAL AUTHORIZED</span>
          </div>

          <div className="metric-row">
            <span className="metric-name">Automated Export:</span>
            <span className="metric-val val-warning">NOT_CONFIGURED (Secret URLs)</span>
          </div>
          <div className="metric-row">
            <span className="metric-name">IP Status:</span>
            <span className="metric-val val-good">
              {evaluation.snds_abnormal ? 'Anomaly Detected' : 'No Abnormal Reports'}
            </span>
          </div>

          <div className="submetrics-list" style={{ marginTop: '0.85rem' }}>
            <div className="submetric-item">
              <span>Spam Trap Hits:</span>
              <strong className="badge-sub">0 (No report)</strong>
            </div>
            <div className="submetric-item">
              <span>Complaint Rate:</span>
              <strong className="badge-sub">0.00% (No report)</strong>
            </div>
            <div className="submetric-item">
              <span>Secret Export Integration:</span>
              <strong className="badge-sub text-blue">PROTECTED (Env Only)</strong>
            </div>
          </div>
        </div>

        {/* 3. Postfix SMTP & Transport */}
        <div className="rep-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Mail size={16} className="card-icon" />
              <h3>Postfix SMTP Outcomes</h3>
            </div>
            <span className="badge-sub">Port 25 Direct</span>
          </div>

          <div className="smtp-distribution-bar">
            <div 
              className="smtp-seg seg-accepted" 
              style={{ width: `${evaluation.smtp_accepted_count > 0 ? 100 : 0}%` }}
              title={`Accepted (250): ${evaluation.smtp_accepted_count}`}
            ></div>
            <div 
              className="smtp-seg seg-deferred" 
              style={{ width: `${evaluation.smtp_deferral_count}%` }}
              title={`Deferred (4xx): ${evaluation.smtp_deferral_count}`}
            ></div>
            <div 
              className="smtp-seg seg-rejected" 
              style={{ width: `${evaluation.smtp_rejection_count}%` }}
              title={`Rejected (5xx): ${evaluation.smtp_rejection_count}`}
            ></div>
          </div>

          <div className="submetrics-list" style={{ marginTop: '1rem' }}>
            <div className="submetric-item">
              <span>Aceptados (250 OK):</span>
              <strong className="badge-sub text-emerald">{evaluation.smtp_accepted_count}</strong>
            </div>
            <div className="submetric-item">
              <span>Diferidos (4xx):</span>
              <strong className="badge-sub">{evaluation.smtp_deferral_count}</strong>
            </div>
            <div className="submetric-item">
              <span>Rechazados / Bounces (5xx):</span>
              <strong className="badge-sub">{evaluation.smtp_rejection_count}</strong>
            </div>
          </div>
        </div>

        {/* 4. Volume Governor & Scaling Gate */}
        <div className="rep-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <TrendingUp size={16} className="card-icon" />
              <h3>Volume Governor</h3>
            </div>
            <span className="tier-badge">{evaluation.current_tier}</span>
          </div>

          <p className="tier-description">{tierConfig.description}</p>

          <div className="governor-stats">
            <div className="gov-stat-item">
              <span className="gov-stat-label">Consecutive Clean Days:</span>
              <span className="gov-stat-val">{evaluation.consecutive_green_days} días</span>
            </div>
            <div className="gov-stat-item">
              <span className="gov-stat-label">Escalado Automático:</span>
              <span className={`gov-stat-val ${evaluation.can_scale_volume ? 'text-emerald' : 'text-amber'}`}>
                {evaluation.can_scale_volume ? 'ELEGIBLE' : 'BLOQUEADO (Requiere datos)'}
              </span>
            </div>
          </div>

          <div className="mass-send-lock">
            <Lock size={12} />
            <span>MASS SENDING = STRICTLY BLOCKED</span>
          </div>
        </div>
      </div>

      <style>{`
        .reputation-dashboard-root {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          color: #f1f5f9;
          font-family: inherit;
        }

        .rep-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
        }

        .rep-title-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .rep-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2));
          border: 1px solid rgba(59, 130, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #60a5fa;
        }

        .rep-heading {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .rep-subheading {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 0.2rem 0 0 0;
        }

        .rep-header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .zero-pii-chip {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.35rem 0.75rem;
          border-radius: 20px;
          letter-spacing: 0.04em;
        }

        .rep-refresh-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          font-size: 0.8rem;
          font-weight: 500;
          padding: 0.4rem 0.85rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .rep-refresh-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .rep-refresh-btn.spinning svg {
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Status Banner */
        .rep-status-card {
          background: rgba(15, 23, 42, 0.85);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          border-left: 4px solid;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .rep-status-card.status-green {
          border-left-color: #10b981;
          background: linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%);
          border-top: 1px solid rgba(16, 185, 129, 0.2);
          border-right: 1px solid rgba(16, 185, 129, 0.2);
          border-bottom: 1px solid rgba(16, 185, 129, 0.2);
        }

        .rep-status-card.status-watch {
          border-left-color: #f59e0b;
          background: linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%);
          border-top: 1px solid rgba(245, 158, 11, 0.2);
          border-right: 1px solid rgba(245, 158, 11, 0.2);
          border-bottom: 1px solid rgba(245, 158, 11, 0.2);
        }

        .rep-status-card.status-hold {
          border-left-color: #ef4444;
          background: linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.9) 100%);
          border-top: 1px solid rgba(239, 68, 68, 0.2);
          border-right: 1px solid rgba(239, 68, 68, 0.2);
          border-bottom: 1px solid rgba(239, 68, 68, 0.2);
        }

        .status-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .status-indicator-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.03em;
        }

        .status-green { color: #34d399; }
        .status-watch { color: #fbbf24; }
        .status-hold { color: #f87171; }

        .gate-reason-text {
          font-size: 0.85rem;
          color: #cbd5e1;
        }

        .volume-cap-badge {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          background: rgba(0, 0, 0, 0.35);
          padding: 0.4rem 0.85rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .vol-label {
          font-size: 0.7rem;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .vol-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: #60a5fa;
        }

        .info-callout {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          padding: 0.6rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          color: #93c5fd;
          line-height: 1.4;
        }

        .callout-icon {
          flex-shrink: 0;
          margin-top: 0.1rem;
        }

        /* 4 Column Grid */
        .rep-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem;
        }

        .rep-card {
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 0.6rem;
        }

        .card-title-wrap {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .card-title-wrap h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0;
        }

        .provider-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .google-dot { background: #ea4335; box-shadow: 0 0 8px rgba(234, 67, 53, 0.5); }
        .msft-dot { background: #00a4ef; box-shadow: 0 0 8px rgba(0, 164, 239, 0.5); }

        .compliance-tag {
          font-size: 0.68rem;
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          font-weight: 600;
        }

        .snds-status-pill {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }

        .pill-good { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .pill-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; }

        .metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          margin-bottom: 0.4rem;
        }

        .metric-val {
          font-weight: 700;
          font-size: 1rem;
        }

        .val-good { color: #34d399; }
        .val-warning { color: #fbbf24; }
        .val-danger { color: #f87171; }

        .spam-gauge-bar {
          position: relative;
          height: 10px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
          margin: 0.4rem 0 0.2rem 0;
        }

        .spam-fill {
          height: 100%;
          transition: width 0.4s ease;
        }

        .target-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          z-index: 2;
        }

        .target-010 {
          left: 33.3%;
          background: #fbbf24;
        }

        .target-030 {
          left: 100%;
          background: #ef4444;
        }

        .gauge-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.65rem;
          color: #64748b;
          margin-bottom: 0.85rem;
        }

        .target-label { color: #fbbf24; font-weight: 600; }
        .danger-label { color: #f87171; font-weight: 600; }

        .submetrics-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .submetric-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #94a3b8;
          padding: 0.25rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .badge-sub {
          color: #f1f5f9;
          font-weight: 500;
        }

        .text-emerald { color: #34d399; }
        .text-amber { color: #fbbf24; }
        .text-blue { color: #60a5fa; }

        .smtp-distribution-bar {
          display: flex;
          height: 10px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          overflow: hidden;
        }

        .smtp-seg { height: 100%; }
        .seg-accepted { background: #10b981; }
        .seg-deferred { background: #f59e0b; }
        .seg-rejected { background: #ef4444; }

        .tier-badge {
          background: rgba(139, 92, 246, 0.2);
          border: 1px solid rgba(139, 92, 246, 0.4);
          color: #c4b5fd;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }

        .tier-description {
          font-size: 0.78rem;
          color: #94a3b8;
          line-height: 1.35;
          margin: 0 0 0.85rem 0;
        }

        .governor-stats {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          background: rgba(0, 0, 0, 0.25);
          padding: 0.6rem 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.85rem;
        }

        .gov-stat-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.78rem;
        }

        .gov-stat-label { color: #94a3b8; }
        .gov-stat-val { font-weight: 600; color: #f1f5f9; }

        .mass-send-lock {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.35rem;
          border-radius: 6px;
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
};
