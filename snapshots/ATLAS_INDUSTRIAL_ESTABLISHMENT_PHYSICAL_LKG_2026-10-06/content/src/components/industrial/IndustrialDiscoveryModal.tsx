import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './IndustrialDiscoveryModal.css';

export interface MissionMetrics {
  mission_id: string;
  objective: string;
  entity_type: string;
  geography: string;
  target_new_records: number;
  environment: string;
  status: string;
  
  scanned_count: number;
  discovered_count: number;
  verified_count: number;
  qualified_count: number;
  true_net_new_count: number;
  persisted_count: number;
  searchable_count: number;
  duplicate_existing_count: number;
  rejected_count: number;
  
  certified_new_searchable: number;
  target_reached: boolean;
  
  speed_records_per_sec: number;
  elapsed_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  error_message?: string | null;
  terminal_reason?: string | null;
  cancel_origin?: string | null;
}

interface IndustrialDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialObjective?: string;
  onNavigateToResults?: (missionId: string) => void;
}

const NATURAL_PRESETS = [
  'Quiero 10.000 mails públicos de empresas argentinas',
  'Buscame fabricantes de muebles de Córdoba',
  'Quiero todos los comercios gastronómicos de Rosario',
  'Necesito distribuidores de insumos médicos',
  'Buscame periodistas de economía con contacto público',
  'Quiero empresas que puedan comprar packaging',
  'Buscame proveedores para hoteles de Argentina'
];

const QUANTITY_PRESETS = [1000, 10000, 50000, 100000];

export const isTerminalStatus = (status?: string, reason?: string | null): boolean => {
  if (!status) return false;
  if (status === 'RUNNING' || status === 'STARTING') return false;
  return [
    'TARGET_REACHED',
    'COMPLETED_WITH_NEW_ROWS',
    'COMPLETED',
    'SOURCE_FRONTIER_EXHAUSTED',
    'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF',
    'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY',
    'ALL_EXECUTABLE_SOURCES_FAILED',
    'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED',
    'EXECUTION_PIPELINE_FAILURE',
    'NO_NEW_ALL_DUPLICATES',
    'NO_NEW_ALL_REJECTED',
    'NO_NEW_MIXED',
    'HARD_BUDGET_REACHED',
    'EXPLICIT_SAFETY_BLOCK',
    'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION',
    'USER_CANCELLED',
    'CANCELLED',
    'FAILED',
    'PARTIAL_SOURCE_EXHAUSTED',
    'ALL_SUPPORTED_SOURCES_EXHAUSTED',
    'NO_SUITABLE_SOURCE_FOUND',
    'NO_NEW_RECORDS_FOUND',
    'ALL_CANDIDATES_REJECTED',
    'NEEDS_ONTOLOGY_RESOLUTION',
    'NEEDS_USER_CLARIFICATION',
    'SOURCE_EXHAUSTED',
    'PARTITION_EXHAUSTED',
    'CURRENT_SOURCE_PLAN_EXHAUSTED',
    'KNOWN_SOURCE_CONNECTOR_MISSING',
    'SOURCE_COVERAGE_LIMITED',
    'EXECUTION_START_FAILED',
    'WORKER_UNAVAILABLE',
    'GEOGRAPHY_CONTRACT_VIOLATION'
  ].includes(status) || Boolean(reason && !['RUNNING', 'STARTING'].includes(status));
};

export function getMissionStatusPillClass(mission: MissionMetrics): string {
  const reason = (mission.terminal_reason || mission.status || '').toLowerCase().replace(/_/g, '-');
  return reason || 'default';
}

export function getMissionStatusPillLabel(mission: MissionMetrics): string {
  if (mission.status === 'STARTING') return '⏳ INICIANDO...';
  if (mission.status === 'RUNNING') {
    const phase = (mission as any).mission_phase;
    if (phase === 'PROBING') return '🔍 VALIDANDO FUENTES...';
    if (phase === 'ACQUIRING') return '⚡ BUSCANDO RESULTADOS...';
    if (phase === 'EXPANDING_SOURCE_PLAN') return '🌐 AMPLIANDO PLAN...';
    return '⚡ EN EJECUCIÓN';
  }
  if (mission.status === 'PAUSED') return '⏸ PAUSADA';
  if (mission.status === 'READY') return 'LISTA';

  const reason = (mission.terminal_reason || mission.status || '').trim();

  // Strict User Cancellation: ONLY if explicit user action!
  const isExplicitUserCancel =
    reason === 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION' ||
    (reason === 'USER_CANCELLED' && (mission.cancel_origin === 'USER_EXPLICIT' || (mission as any).cancel_origin === 'HTTP_POST_USER_CANCEL' || !(mission as any).cancel_origin));

  if (isExplicitUserCancel) {
    return '✕ CANCELADA';
  }

  switch (reason) {
    case 'TARGET_REACHED':
    case 'COMPLETED_WITH_NEW_ROWS':
      return '✓ MISIÓN CUMPLIDA';
    case 'COMPLETED':
      return (mission.certified_new_searchable || 0) > 0 ? '✓ FINALIZADA' : '⚠️ SIN NUEVOS REGISTROS';
    case 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY':
      return '⚠️ SIN FUENTE VÁLIDA';
    case 'NO_NEW_ALL_DUPLICATES':
    case 'NO_NEW_RECORDS_FOUND':
      return 'ℹ️ TODOS DUPLICADOS';
    case 'NO_NEW_ALL_REJECTED':
    case 'ALL_CANDIDATES_REJECTED':
      return '🛡️ CANDIDATOS NO CERTIFICADOS';
    case 'NO_NEW_MIXED':
      return 'ℹ️ SIN NUEVOS REGISTROS';
    case 'SOURCE_FRONTIER_EXHAUSTED':
    case 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF':
    case 'ALL_SUPPORTED_SOURCES_EXHAUSTED':
      return '⚠️ FUENTES AGOTADAS';
    case 'PARTIAL_SOURCE_EXHAUSTED':
      return '⚠️ RESULTADO PARCIAL';
    case 'SOURCE_EXHAUSTED':
      return '⚠️ FUENTE AGOTADA';
    case 'PARTITION_EXHAUSTED':
      return '⚠️ PARTICIÓN AGOTADA';
    case 'CURRENT_SOURCE_PLAN_EXHAUSTED':
      return '⚠️ PLAN AGOTADO';
    case 'KNOWN_SOURCE_CONNECTOR_MISSING':
      return '⚠️ CONECTOR PENDIENTE';
    case 'SOURCE_COVERAGE_LIMITED':
      return '⚠️ COBERTURA LIMITADA';
    case 'NO_SUITABLE_SOURCE_FOUND':
      return '⚠️ SIN FUENTE ADECUADA';
    case 'NEEDS_ONTOLOGY_RESOLUTION':
      return 'ℹ️ RESOLUCIÓN PENDIENTE';
    case 'NEEDS_USER_CLARIFICATION':
      return '❓ ACLARACIÓN REQUERIDA';
    case 'ALL_EXECUTABLE_SOURCES_FAILED':
    case 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED':
    case 'EXECUTION_PIPELINE_FAILURE':
      return '✕ FALLO TÉCNICO';
    case 'FAILED':
    case 'EXECUTION_START_FAILED':
    case 'WORKER_UNAVAILABLE':
    case 'GEOGRAPHY_CONTRACT_VIOLATION':
      return '✕ ERROR';
    default:
      // Unknown terminal state: NEVER defaults to cancelled!
      return `⚠️ ESTADO: ${reason}`;
  }
}

export function renderMissionTerminalState(mission: MissionMetrics): React.ReactElement {
  const reason = (mission.terminal_reason || mission.status || '').trim();
  const msg = mission.error_message || '';
  const numCertified = (mission.certified_new_searchable || mission.qualified_count || 0).toLocaleString('es-AR');
  const numTarget = (mission.target_new_records || 0).toLocaleString('es-AR');

  const renderDiagnosticBadge = (code: string) => (
    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: 'monospace',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        color: '#94a3b8'
      }}>
        TERMINAL_REASON: {code}
      </span>
      {mission.completed_at && (
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          Finalizado: {new Date(mission.completed_at).toLocaleTimeString('es-AR')}
        </span>
      )}
    </div>
  );

  // 1. TARGET_REACHED / COMPLETED_WITH_NEW_ROWS
  if (reason === 'TARGET_REACHED' || reason === 'COMPLETED_WITH_NEW_ROWS' || (reason === 'COMPLETED' && (mission.certified_new_searchable || 0) > 0)) {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--success">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>🎉</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#34d399', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            ¡Misión cumplida con éxito!
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || `Se han certificado, deduplicado e indexado los ${numCertified} registros netos nuevos solicitados.`}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 2. NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY
  if (reason === 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--no-source">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fbbf24', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Todavía no encontramos una fuente válida para ampliar esta búsqueda.
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Atlas analizó las fuentes disponibles y autónomas, pero ninguna cumple los criterios de certificación para este concepto.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 3. NO_NEW_ALL_DUPLICATES / NO_NEW_RECORDS_FOUND
  if (reason === 'NO_NEW_ALL_DUPLICATES' || reason === 'NO_NEW_RECORDS_FOUND') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--duplicates">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#38bdf8', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Todos los registros encontrados ya existían en Atlas
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Se escanearon candidatos pero todos coincidieron con registros previamente certificados en la base de datos.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 4. NO_NEW_ALL_REJECTED / ALL_CANDIDATES_REJECTED
  if (reason === 'NO_NEW_ALL_REJECTED' || reason === 'ALL_CANDIDATES_REJECTED') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--rejected">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>🛡️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#f87171', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Candidatos no certificados
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Se escanearon candidatos de fuentes públicas pero ninguno superó las reglas de validación y calidad.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 5. NO_NEW_MIXED
  if (reason === 'NO_NEW_MIXED') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--mixed">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#38bdf8', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Candidatos existentes o no certificados
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Los candidatos analizados se dividieron entre duplicados de la base y descartes por calidad, sin arrojar nuevos registros netos.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 6. SOURCE_FRONTIER_EXHAUSTED / SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF / PARTIAL_SOURCE_EXHAUSTED / ALL_SUPPORTED_SOURCES_EXHAUSTED / SOURCE_EXHAUSTED / PARTITION_EXHAUSTED / CURRENT_SOURCE_PLAN_EXHAUSTED / SOURCE_COVERAGE_LIMITED
  if (
    reason === 'SOURCE_FRONTIER_EXHAUSTED' ||
    reason === 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' ||
    reason === 'PARTIAL_SOURCE_EXHAUSTED' ||
    reason === 'SOURCE_EXHAUSTED' ||
    reason === 'PARTITION_EXHAUSTED' ||
    reason === 'CURRENT_SOURCE_PLAN_EXHAUSTED' ||
    reason === 'SOURCE_COVERAGE_LIMITED' ||
    reason === 'ALL_SUPPORTED_SOURCES_EXHAUSTED'
  ) {
    const hasCertified = (mission.certified_new_searchable || 0) > 0;
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--exhausted">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fbbf24', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            {hasCertified
              ? `Búsqueda finalizada: encontramos ${numCertified} de ${numTarget}`
              : 'Fuentes públicas analizadas sin resultados nuevos'}
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || (hasCertified ? 'Atlas agotó las fuentes públicas disponibles para esta búsqueda.' : 'Se exploraron todas las fuentes disponibles y alcanzables para esta geografía sin encontrar registros nuevos.')}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 7. ALL_EXECUTABLE_SOURCES_FAILED / ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED
  if (reason === 'ALL_EXECUTABLE_SOURCES_FAILED' || reason === 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--failed-sources">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fbbf24', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Fallo técnico en las fuentes ejecutables
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Las fuentes de datos identificadas no respondieron correctamente a las consultas técnicas de extracción.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 8. EXECUTION_PIPELINE_FAILURE
  if (reason === 'EXECUTION_PIPELINE_FAILURE') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--pipeline-failure">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fbbf24', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Fallo en el pipeline de ejecución de la fuente
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Fallo técnico durante la extracción o descarga de datos de la fuente oficial identificada.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 9. KNOWN_SOURCE_CONNECTOR_MISSING
  if (reason === 'KNOWN_SOURCE_CONNECTOR_MISSING') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--connector-missing">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>🏛️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#38bdf8', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Fuente oficial identificada — Conector de lote pendiente
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Existe un registro oficial verificado, pero requiere consulta individual o conector especializado.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 10. NO_SUITABLE_SOURCE_FOUND
  if (reason === 'NO_SUITABLE_SOURCE_FOUND') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--no-suitable">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>🛡️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#f87171', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            No encontramos todavía una fuente adecuada
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Atlas no localizó datos públicos con la evidencia verificable requerida para esta búsqueda.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 11. NEEDS_ONTOLOGY_RESOLUTION
  if (reason === 'NEEDS_ONTOLOGY_RESOLUTION') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--ontology">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>🧠</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#38bdf8', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Atlas necesita resolver mejor este tipo de búsqueda
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'La ontología semántica requiere mayor definición para interpretar este tipo de búsqueda.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 12. NEEDS_USER_CLARIFICATION
  if (reason === 'NEEDS_USER_CLARIFICATION') {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--clarification">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>❓</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#c084fc', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Aclaración requerida
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Por favor brinde más detalles sobre el rol, rubro o actividad requerida.'}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 13. USER_CANCELLED (STRICT REQUIREMENT 3: ONLY IF EXPLICIT USER ACTION)
  const isExplicitUserCancel =
    reason === 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION' ||
    (reason === 'USER_CANCELLED' && (mission.cancel_origin === 'USER_EXPLICIT' || (mission as any).cancel_origin === 'HTTP_POST_USER_CANCEL' || !(mission as any).cancel_origin));

  if (isExplicitUserCancel) {
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--cancelled">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>✕</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#cbd5e1', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            Cancelada por el usuario
          </strong>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.45' }}>
            {msg || 'Cancelaste la búsqueda manualmente.'}
          </p>
          {renderDiagnosticBadge('USER_CANCELLED')}
        </div>
      </div>
    );
  }

  // 14. FAILED / ERROR / GEOGRAPHY_CONTRACT_VIOLATION / WORKER_UNAVAILABLE / EXECUTION_START_FAILED
  if (
    reason === 'FAILED' ||
    mission.status === 'FAILED' ||
    reason === 'GEOGRAPHY_CONTRACT_VIOLATION' ||
    reason === 'WORKER_UNAVAILABLE' ||
    reason === 'EXECUTION_START_FAILED'
  ) {
    let failDetail = msg || 'Ocurrió un error inesperado al procesar la misión.';
    if (reason.includes('GEOGRAPHY') || msg.includes('GEOGRAPHY') || reason.includes('geografía') || msg.includes('geografía')) {
      failDetail = 'No se pudo iniciar la búsqueda por un error interno de geografía.';
    } else if (reason === 'WORKER_UNAVAILABLE') {
      failDetail = 'El ejecutor de búsqueda no se encuentra disponible temporalmente.';
    } else if (reason === 'EXECUTION_START_FAILED') {
      failDetail = 'No se pudo iniciar la ejecución dentro del tiempo límite.';
    }
    return (
      <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--error">
        <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#f87171', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
            No se pudo completar la búsqueda
          </strong>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
            {failDetail}
          </p>
          {renderDiagnosticBadge(reason)}
        </div>
      </div>
    );
  }

  // 15. UNKNOWN TERMINAL STATE (REQUIREMENT 2: NEVER DEFAULT TO CANCELLED!)
  return (
    <div id="idm-terminal-banner" className="idm-terminal-card idm-terminal-card--unknown">
      <span style={{ fontSize: '26px', lineHeight: 1 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <strong style={{ color: '#fbbf24', fontSize: '15px', display: 'block', marginBottom: '4px' }}>
          Estado de misión no reconocido
        </strong>
        <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.45' }}>
          Diagnóstico técnico: terminal_reason = <code>"{reason || 'UNDEFINED'}"</code> (status: <code>"{mission.status}"</code>). {msg ? `Mensaje: ${msg}` : ''}
        </p>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          Atlas finalizó la misión con un código terminal no clasificado. No se interpreta como cancelación.
        </div>
        {renderDiagnosticBadge(reason || mission.status || 'UNKNOWN')}
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  (window as any).__ATLAS_TERMINAL_RENDERER__ = {
    getMissionStatusPillLabel,
    getMissionStatusPillClass,
    renderMissionTerminalState,
    isTerminalStatus
  };
}

// Safe JSON HTTP Parser: strictly guards against empty bodies, network crashes, and malformed non-JSON
async function safeJsonFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(input, init);
    const rawText = await res.text();

    if (!rawText || !rawText.trim()) {
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: `Error HTTP ${res.status}: el servidor no devolvió contenido.`
        };
      }
      return { ok: true, status: res.status, data: undefined };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        status: res.status,
        error: `Respuesta inválida del servidor (HTTP ${res.status}): ${rawText.slice(0, 100)}`
      };
    }

    if (!res.ok || parsed.success === false) {
      return {
        ok: false,
        status: res.status,
        data: parsed,
        error: parsed.message || parsed.error || `Error HTTP ${res.status}`
      };
    }

    return { ok: true, status: res.status, data: parsed };
  } catch (netErr: any) {
    return {
      ok: false,
      status: 0,
      error: 'No se pudo conectar con Atlas.'
    };
  }
}

export default function IndustrialDiscoveryModal({
  isOpen,
  onClose,
  initialObjective = '',
  onNavigateToResults
}: IndustrialDiscoveryModalProps) {
  const navigate = useNavigate();

  // Mode: 'ATLAS_SEARCH' vs 'AMPLIAR_BASE'
  const [activeTabMode, setActiveTabMode] = useState<'ATLAS_SEARCH' | 'AMPLIAR_BASE'>('AMPLIAR_BASE');
  
  // Step: 'BUILDER' | 'CONFIRMATION' | 'PROGRESS'
  const [step, setStep] = useState<'BUILDER' | 'CONFIRMATION' | 'PROGRESS'>('BUILDER');

  // Form State
  const [objective, setObjective] = useState(initialObjective || NATURAL_PRESETS[0]);
  const [entityType, setEntityType] = useState('COMPANY');
  const [geography, setGeography] = useState('ARG_NACIONAL');
  const userExplicitlyChangedGeo = useRef(false);
  const [targetQuantity, setTargetQuantity] = useState<number>(100000);

  // Universal Plan Preview State (Requirements 2, 7, 8, 17)
  const [planPreview, setPlanPreview] = useState<any>(null);
  const [universalSpec, setUniversalSpec] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableGeographies, setAvailableGeographies] = useState<any[]>([]);

  useEffect(() => {
    async function loadGeos() {
      try {
        const res = await safeJsonFetch<any>('/api/industrial/geographies');
        if (res.ok && res.data?.geographies) {
          setAvailableGeographies(res.data.geographies);
        }
      } catch (e) {
        // silent fallback
      }
    }
    loadGeos();
  }, []);

  // Active Mission & Loading States
  const [activeMission, setActiveMission] = useState<MissionMetrics | null>(null);
  const activeMissionIdRef = useRef<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live elapsed time ticker for active running mission (Requirement 8)
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0);
  useEffect(() => {
    if (!activeMission || activeMission.status !== 'RUNNING' || !activeMission.started_at) {
      setLiveElapsedSeconds(activeMission?.elapsed_seconds || 0);
      return;
    }
    const updateElapsed = () => {
      const startMs = new Date(activeMission.started_at!).getTime();
      const diffSecs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setLiveElapsedSeconds(Math.max(diffSecs, activeMission.elapsed_seconds || 0));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeMission?.status, activeMission?.started_at, activeMission?.elapsed_seconds]);

  const pollIntervalRef = useRef<any>(null);

  // Debounced Plan Preview on objective change
  useEffect(() => {
    if (!isOpen || !objective.trim()) {
      setPlanPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const result = await safeJsonFetch<any>('/api/industrial/universal/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objective: objective.trim(), target: targetQuantity, geography })
        });
        if (result.ok && result.data?.success && result.data?.spec) {
          setPlanPreview(result.data.plan_preview);
          setUniversalSpec(result.data.spec);
          // NEVER silently overwrite user's selected geography during plan preview!
          // Geography remains immutable unless user explicitly changes it in the dropdown.
          if (result.data.spec.entity_type) setEntityType(result.data.spec.entity_type);
          if (result.data.spec.target && result.data.spec.target !== targetQuantity) {
            setTargetQuantity(result.data.spec.target);
          }
        }
      } catch (e) {
        // silent preview fallback
      } finally {
        setIsAnalyzing(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, objective]);

  // Sync initial objective when passed
  useEffect(() => {
    if (initialObjective && initialObjective.trim()) {
      setObjective(initialObjective.trim());
      setStep('BUILDER');
    }
  }, [initialObjective]);

  // Check for active mission ONLY on initial mount/open IF no mission is already active in the session
  useEffect(() => {
    let isMounted = true;
    async function checkActiveMission() {
      // If user already has an active or submitted mission locked in this session, DO NOT REPLACE
      if (activeMissionIdRef.current) return;

      try {
        const result = await safeJsonFetch<any>('/api/industrial/missions/active');
        if (result.ok && isMounted && result.data?.mission && !activeMissionIdRef.current) {
          const activeObj = (result.data.mission.objective || '').toLowerCase().trim();
          const currentQuery = (initialObjective || objective || '').toLowerCase().trim();
          // ONLY enter PROGRESS if the mission is RUNNING or STARTING and matches the current query objective!
          if ((result.data.mission.status === 'RUNNING' || result.data.mission.status === 'STARTING') && activeObj && activeObj === currentQuery) {
            activeMissionIdRef.current = result.data.mission.mission_id;
            setActiveMission(result.data.mission);
            setStep('PROGRESS');
          }
        }
      } catch (err) {
        console.warn('Could not fetch active mission:', err);
      }
    }

    if (isOpen) {
      checkActiveMission();
    }

    return () => { isMounted = false; };
  }, [isOpen]);

  // Polling loop for active mission progress - STRICTLY IMMUTABLE MISSION_ID SCOPE
  useEffect(() => {
    const lockedMissionId = activeMissionIdRef.current || activeMission?.mission_id;
    if (!isOpen || step !== 'PROGRESS' || !lockedMissionId) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const fetchStatus = async () => {
      try {
        const result = await safeJsonFetch<any>(`/api/industrial/missions/${lockedMissionId}`);
        if (result.ok && result.data?.mission) {
          // MISSION IDENTITY INVARIANT GATE:
          // Returned mission MUST match the locked active mission ID!
          if (result.data.mission.mission_id !== lockedMissionId) {
            console.error(`[MISSION_IDENTITY_INVARIANT_FAILURE] Polled mission ID ${result.data.mission.mission_id} does not match locked mission ${lockedMissionId}`);
            return;
          }
          setActiveMission(result.data.mission);
          if (isTerminalStatus(result.data.mission.status, result.data.mission.terminal_reason)) {
            // Mission reached terminal state.
            // DO NOT switch to another mission or kick to builder!
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        }
      } catch (e) {
        // silent polling catch
      }
    };

    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 1000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, step, activeMission?.mission_id, activeMission?.status]);

  if (!isOpen) return null;

  // Step 1: Open Confirmation Screen
  const handleProceedToConfirmation = async () => {
    if (planPreview?.ambiguity_detected) {
      setActionError('Por favor selecciona una precisión antes de continuar.');
      return;
    }
    if (!objective.trim()) {
      setActionError('Por favor escribe un objetivo de búsqueda.');
      return;
    }
    setActionError(null);
    setIsCompiling(true);

    try {
      const result = await safeJsonFetch<any>('/api/industrial/missions/spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: objective.trim(),
          entity_type: entityType,
          geography,
          target_new_records: targetQuantity,
          environment: 'PRODUCTION'
        })
      });

      if (!result.ok || !result.data?.success || !result.data?.mission) {
        throw new Error(result.error || 'Error al compilar la especificación.');
      }

      activeMissionIdRef.current = result.data.mission.mission_id;
      setActiveMission(result.data.mission);
      setStep('CONFIRMATION');
    } catch (err: any) {
      setActionError(err.message || 'Error al preparar la misión.');
    } finally {
      setIsCompiling(false);
    }
  };

  // Step 2: Start Mission (Second Click Confirmation Authority)
  const handleStartMission = async () => {
    if (!activeMission?.mission_id) return;
    setIsActionLoading(true);
    setActionError(null);

    try {
      const result = await safeJsonFetch<any>(`/api/industrial/missions/${activeMission.mission_id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedTarget: targetQuantity })
      });

      if (!result.ok || !result.data?.success || !result.data?.mission) {
        throw new Error(result.error || 'Error al iniciar la misión.');
      }

      activeMissionIdRef.current = result.data.mission.mission_id;
      setActiveMission(result.data.mission);
      setStep('PROGRESS');
    } catch (err: any) {
      setActionError(err.message || 'No se pudo iniciar la misión.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Pause Mission
  const handlePauseMission = async () => {
    if (!activeMission?.mission_id) return;
    setIsActionLoading(true);
    try {
      const result = await safeJsonFetch<any>(`/api/industrial/missions/${activeMission.mission_id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (result.ok && result.data?.mission) setActiveMission(result.data.mission);
    } catch (err: any) {
      setActionError('Error al pausar la misión.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Resume Mission
  const handleResumeMission = async () => {
    if (!activeMission?.mission_id) return;
    setIsActionLoading(true);
    try {
      const result = await safeJsonFetch<any>(`/api/industrial/missions/${activeMission.mission_id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (result.ok && result.data?.mission) setActiveMission(result.data.mission);
    } catch (err: any) {
      setActionError('Error al reanudar la misión.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Cancel Mission
  const handleCancelMission = async () => {
    if (!activeMission?.mission_id) return;
    if (!window.confirm('¿Seguro que deseas cancelar esta misión de adquisición?')) return;
    setIsActionLoading(true);
    try {
      const result = await safeJsonFetch<any>(`/api/industrial/missions/${activeMission.mission_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (result.ok && result.data?.mission) setActiveMission(result.data.mission);
    } catch (err: any) {
      setActionError('Error al cancelar la misión.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Navigate to Search Results for this Mission
  const handleViewResults = () => {
    onClose();
    if (activeMission?.mission_id) {
      if (onNavigateToResults) {
        onNavigateToResults(activeMission.mission_id);
      } else {
        navigate(`/productos?mission_id=${activeMission.mission_id}`);
      }
    } else {
      navigate(`/productos?q=${encodeURIComponent(objective)}`);
    }
  };

  const formatNumber = (num?: number) => {
    return (num || 0).toLocaleString('es-AR');
  };

  const formatSeconds = (sec?: number) => {
    const s = sec || 0;
    const mins = Math.floor(s / 60);
    const remainder = s % 60;
    return `${mins}m ${remainder < 10 ? '0' : ''}${remainder}s`;
  };

  const progressPercent = activeMission
    ? Math.min(100, Math.round(((activeMission.certified_new_searchable || 0) / (activeMission.target_new_records || 100000)) * 100))
    : 0;

  return (
    <div className="idm-overlay" onClick={onClose}>
      <div className="idm-modal" onClick={e => e.stopPropagation()}>
        
        {/* Header Strip with Two Distinct Modes */}
        <div className="idm-header">
          <div className="idm-modes-toggle">
            <button
              className={`idm-mode-btn ${activeTabMode === 'ATLAS_SEARCH' ? 'idm-mode-btn--active' : ''}`}
              onClick={() => {
                setActiveTabMode('ATLAS_SEARCH');
                onClose();
              }}
            >
              <span className="idm-mode-ico">🔍</span>
              Buscar en Atlas (Existente)
            </button>
            <button
              className={`idm-mode-btn ${activeTabMode === 'AMPLIAR_BASE' ? 'idm-mode-btn--active' : ''}`}
              onClick={() => setActiveTabMode('AMPLIAR_BASE')}
            >
              <span className="idm-mode-ico">⚡</span>
              Ampliar Atlas Core (Adquisición Persistente)
            </button>
          </div>
          <button className="idm-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Error Alert */}
        {actionError && (
          <div className="idm-error-strip">
            <span>⚠️ {actionError}</span>
            <button onClick={() => setActionError(null)}>✕</button>
          </div>
        )}

        {/* ─── STEP 1: SPEC BUILDER ─── */}
        {step === 'BUILDER' && (
          <div className="idm-body">
            <div className="idm-title-block">
              <span className="idm-badge-primary">MISIÓN DE ADQUISICIÓN V1</span>
              <h2>Ampliar Base Industrial</h2>
              <p className="idm-subtitle">
                Descubre hasta <strong>100.000 nuevos registros</strong> verificados y calificados constitucionalmente,
                usando exclusivamente fuentes públicas abiertas de Atlas sin costo de licencia.
              </p>
            </div>

            {/* Quick Prompts Chips */}
            <div className="idm-field">
              <label className="idm-label">Objetivos sugeridos</label>
              <div className="idm-chips-grid">
                {NATURAL_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`idm-chip ${objective === p ? 'idm-chip--selected' : ''}`}
                    onClick={() => setObjective(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Natural Objective Input */}
            <div className="idm-field">
              <label className="idm-label" htmlFor="idm-objective-input">
                Objetivo natural en lenguaje cotidiano
              </label>
              <textarea
                id="idm-objective-input"
                className="idm-textarea"
                rows={3}
                placeholder="Ej: Quiero 100.000 comercios de Argentina relacionados con gastronomía..."
                value={objective}
                onChange={e => setObjective(e.target.value)}
              />
            </div>

            {/* ─── UNIVERSAL MISSION PLAN PREVIEW (Section 17 & 28) ─── */}
            {isAnalyzing && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                <span className="idm-spin">⚡</span> Interpretando objetivo en lenguaje natural y calculando supply Atlas...
              </div>
            )}

            {planPreview && (
              <div className="idm-plan-preview-box" style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '10px',
                padding: '16px',
                margin: '14px 0',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      ENTENDÍ:
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                      onClick={() => setObjective('')}
                    >
                      [Corregir]
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(planPreview.ambiguity_detected)}
                      style={{
                        background: planPreview.ambiguity_detected ? 'rgba(255,255,255,0.08)' : '#0284c7',
                        border: 'none',
                        color: planPreview.ambiguity_detected ? '#64748b' : '#ffffff',
                        borderRadius: '4px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: planPreview.ambiguity_detected ? 'not-allowed' : 'pointer'
                      }}
                      onClick={planPreview.ambiguity_detected ? undefined : handleProceedToConfirmation}
                      title={planPreview.ambiguity_detected ? 'Seleccioná una opción para continuar' : undefined}
                    >
                      [Buscar]
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Qué buscás</span>
                    <strong style={{ color: '#f8fafc' }}>{planPreview.objective_summary}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Tipo de resultado</span>
                    <strong style={{ color: '#7dd3fc' }}>
                      {universalSpec?.entity_type === 'COMPANY' ? 'Empresas' : (universalSpec?.row_unit === 'ESTABLISHMENT' ? 'Establecimientos' : (universalSpec?.row_unit === 'PERSON' ? 'Personas / Profesionales' : 'Contactos'))}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Relación</span>
                    <strong style={{ color: '#f1f5f9' }}>
                      {universalSpec?.relation_type === 'MANUFACTURER' ? 'Fabrican' : (universalSpec?.relation_type === 'DISTRIBUTOR' ? 'Distribuyen' : (universalSpec?.relation_type === 'BUYER' ? 'Compran' : (universalSpec?.relation_type === 'SUPPLIER' ? 'Proveen' : 'Operan / Servicios')))}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Producto / Servicio</span>
                    <strong style={{ color: '#f1f5f9' }}>
                      {planPreview.ambiguity_detected
                        ? `${objective} (requiere aclaración)`
                        : (universalSpec?.product || universalSpec?.service || 'Actividad comercial verificada')}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>Dónde</span>
                    <strong style={{ color: '#f8fafc' }}>{planPreview.geography ? planPreview.geography.replace('ARG / ', '') : 'Argentina'}</strong>
                  </div>
                </div>

                {planPreview.requirements_summary && planPreview.requirements_summary.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Requisitos principales:</span>
                    <div>
                      {planPreview.requirements_summary.map((req: string, i: number) => (
                        <span key={i} style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', margin: '2px 4px 2px 0', fontSize: '11px', color: '#e2e8f0' }}>
                          ✓ {req}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gap Analysis Stats Strip (Sections 7 & 8) */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Atlas ya posee</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
                      {planPreview.ambiguity_detected ? '—' : formatNumber(planPreview.atlas_existing_count)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Faltan para la meta</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>
                      {planPreview.ambiguity_detected ? '—' : formatNumber(planPreview.gap_to_acquire)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Supply Respaldado</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                      {planPreview.ambiguity_detected ? '—' : formatNumber(planPreview.supported_supply_estimate)}
                    </div>
                  </div>
                </div>

                {planPreview.ambiguity_detected && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '10px', textAlign: 'center' }}>
                    Se calculará después de elegir una opción.
                  </div>
                )}

                {/* Intent Action Buttons (Section 7 & 17) */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '10px' }}>
                  {planPreview.atlas_existing_count > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/productos?q=${encodeURIComponent(objective)}`);
                      }}
                      style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid #38bdf8',
                        color: '#38bdf8',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Ver existentes ({formatNumber(planPreview.atlas_existing_count)})
                    </button>
                  )}
                  {planPreview.gap_to_acquire > 0 && planPreview.atlas_existing_count > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetQuantity(planPreview.gap_to_acquire);
                        handleProceedToConfirmation();
                      }}
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid #f59e0b',
                        color: '#fbbf24',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Buscar los {formatNumber(planPreview.gap_to_acquire)} faltantes
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Ambiguity Clarification Gate (Concept or Geography) */}
            {(planPreview?.ambiguity_detected || (objective.toLowerCase().includes('buenos aires') && !geography.includes('CABA') && !geography.includes('BUENOS AIRES'))) && (
              <div className="idm-ambiguity-card" style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '8px',
                padding: '14px 16px',
                margin: '12px 0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '15px' }}>ℹ️</span>
                  <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '13px' }}>
                    Necesito una precisión para continuar
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '10px' }}>
                  {planPreview?.clarification_prompt || '¿Dónde querés buscar?'}
                </div>
                {planPreview?.candidate_concepts && planPreview.candidate_concepts.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {planPreview.candidate_concepts.map((cand: string, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setObjective(cand)}
                        style={{
                          padding: '8px 16px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          color: '#f0f9ff',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        [ {cand} ]
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        userExplicitlyChangedGeo.current = true;
                        setGeography('ARG_CABA');
                      }}
                      style={{
                        padding: '8px 16px',
                        background: (geography === 'ARG_CABA' || geography === 'ARG / CABA') ? '#0284c7' : 'rgba(255,255,255,0.06)',
                        border: (geography === 'ARG_CABA' || geography === 'ARG / CABA') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: (geography === 'ARG_CABA' || geography === 'ARG / CABA') ? 700 : 500
                      }}
                    >
                      [ CABA ]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        userExplicitlyChangedGeo.current = true;
                        setGeography('ARG_BUENOS_AIRES');
                      }}
                      style={{
                        padding: '8px 16px',
                        background: (geography === 'ARG_BUENOS_AIRES' || geography === 'ARG / BUENOS AIRES') ? '#0284c7' : 'rgba(255,255,255,0.06)',
                        border: (geography === 'ARG_BUENOS_AIRES' || geography === 'ARG / BUENOS AIRES') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: (geography === 'ARG_BUENOS_AIRES' || geography === 'ARG / BUENOS AIRES') ? 700 : 500
                      }}
                    >
                      [ Provincia de Buenos Aires ]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        userExplicitlyChangedGeo.current = true;
                        setGeography('ARG_BUENOS_AIRES_AMBAS');
                      }}
                      style={{
                        padding: '8px 16px',
                        background: (geography === 'ARG_BUENOS_AIRES_AMBAS' || geography === 'ARG / BUENOS AIRES (AMBAS)') ? '#0284c7' : 'rgba(255,255,255,0.06)',
                        border: (geography === 'ARG_BUENOS_AIRES_AMBAS' || geography === 'ARG / BUENOS AIRES (AMBAS)') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: (geography === 'ARG_BUENOS_AIRES_AMBAS' || geography === 'ARG / BUENOS AIRES (AMBAS)') ? 700 : 500
                      }}
                    >
                      [ Ambas ]
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Structured Criteria Grid */}
            <div className="idm-grid-row">
              <div className="idm-field">
                <label className="idm-label">Tipo de entidad objetivo</label>
                <select
                  className="idm-select"
                  value={entityType}
                  onChange={e => setEntityType(e.target.value)}
                >
                  <option value="FABRICANTE">Fabricante Industrial</option>
                  <option value="COMERCIO">Comercio / Distribuidor</option>
                  <option value="PROVEEDOR">Proveedor de Servicios / Equipamiento</option>
                  <option value="COMPRADOR">Comprador Industrial</option>
                  <option value="COMPANY">Empresa General</option>
                </select>
              </div>

              <div className="idm-field">
                <label className="idm-label">Ámbito Geográfico</label>
                <select
                  className="idm-select"
                  value={geography}
                  onChange={e => {
                    userExplicitlyChangedGeo.current = true;
                    setGeography(e.target.value);
                  }}
                >
                  {availableGeographies.length > 0 ? (
                    availableGeographies.map((g: any) => (
                      <option key={g.geography_id} value={g.geography_id}>
                        {g.display_name} {g.admin_level === 'PROVINCE' ? '(Provincia)' : (g.admin_level === 'MUNICIPALITY' ? `(${g.province})` : '')}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="ARG_NACIONAL">Argentina (Nivel Nacional)</option>
                      <option value="ARG_CABA">CABA (Ciudad Autónoma)</option>
                      <option value="ARG_BUENOS_AIRES">Provincia de Buenos Aires</option>
                      <option value="ARG_CORDOBA">Córdoba Capital</option>
                      <option value="ARG_SANTA_FE">Santa Fe</option>
                      <option value="ARG_MENDOZA">Mendoza</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Quantity Presets */}
            <div className="idm-field">
              <div className="idm-label-row">
                <label className="idm-label">Cantidad objetivo de nuevos registros certificados</label>
                <span className="idm-badge-limit">Máximo V1: 100.000</span>
              </div>
              <div className="idm-presets-row">
                {QUANTITY_PRESETS.map(qty => (
                  <button
                    key={qty}
                    type="button"
                    className={`idm-preset-btn ${targetQuantity === qty ? 'idm-preset-btn--active' : ''} ${qty === 100000 ? 'idm-preset-btn--100k' : ''}`}
                    onClick={() => setTargetQuantity(qty)}
                  >
                    {qty === 100000 && <span className="idm-preset-star">★</span>}
                    {formatNumber(qty)}
                  </button>
                ))}
              </div>
            </div>

            {/* Invariants strip */}
            <div className="idm-guarantee-card">
              <div className="idm-guarantee-item">
                <span className="idm-guarantee-ico">🛡️</span>
                <div>
                  <strong>Filtro Constitucional</strong>
                  <p>Ningún registro ingresa sin comprobante de autenticidad física.</p>
                </div>
              </div>
              <div className="idm-guarantee-item">
                <span className="idm-guarantee-ico">💎</span>
                <div>
                  <strong>True Net-New to Atlas</strong>
                  <p>Deduplicación global estricta. Registros preexistentes no cuentan al objetivo.</p>
                </div>
              </div>
              <div className="idm-guarantee-item">
                <span className="idm-guarantee-ico">🌐</span>
                <div>
                  <strong>Fuentes Públicas Abiertas</strong>
                  <p>Costo de licencias externas: $0 USD. Cumplimiento legal y normativo.</p>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="idm-actions">
              <button
                type="button"
                className="idm-btn-secondary"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                id="idm-btn-100k-buscar"
                className="idm-btn-primary"
                onClick={planPreview?.ambiguity_detected ? undefined : handleProceedToConfirmation}
                disabled={isCompiling || Boolean(planPreview?.ambiguity_detected)}
                style={{
                  cursor: planPreview?.ambiguity_detected ? 'not-allowed' : (isCompiling ? 'wait' : 'pointer'),
                  opacity: planPreview?.ambiguity_detected ? 0.45 : 1
                }}
              >
                {planPreview?.ambiguity_detected 
                  ? 'Elegí una opción para continuar' 
                  : (isCompiling ? 'Construyendo Mission Spec...' : `Buscar ${formatNumber(targetQuantity)} nuevos`)}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: CONFIRMATION MODAL ─── */}
        {step === 'CONFIRMATION' && activeMission && (
          <div className="idm-body idm-confirmation-body">
            <div className="idm-title-block">
              <span className="idm-badge-warning">CONFIRMACIÓN REQUERIDA</span>
              <h2>Confirmar Misión de Adquisición</h2>
              <p className="idm-subtitle">
                Revisa los parámetros estructurados de la misión.
                La ejecución correrá de forma asíncrona y continua en los servidores de Atlas.
              </p>
            </div>

            <div className="idm-spec-card">
              <div className="idm-spec-row">
                <span className="idm-spec-label">Objetivo compilado:</span>
                <span className="idm-spec-value">{activeMission.objective}</span>
              </div>
              <div className="idm-spec-row">
                <span className="idm-spec-label">Objetivo neto:</span>
                <span className="idm-spec-value idm-spec-highlight">
                  {formatNumber(activeMission.target_new_records)} registros CERTIFIED_NEW
                </span>
              </div>
              <div className="idm-spec-row">
                <span className="idm-spec-label">Tipo de entidad:</span>
                <span className="idm-spec-value">{activeMission.entity_type}</span>
              </div>
              {universalSpec && (
                <>
                  <div className="idm-spec-row">
                    <span className="idm-spec-label">Unidad Atómica (Row Unit):</span>
                    <span className="idm-spec-value" style={{ color: '#38bdf8', fontWeight: 600 }}>
                      {universalSpec.row_unit} ({universalSpec.relation_type})
                    </span>
                  </div>
                  <div className="idm-spec-row">
                    <span className="idm-spec-label">Estrategia de Deduplicación:</span>
                    <span className="idm-spec-value">{universalSpec.dedupe_strategy}</span>
                  </div>
                  <div className="idm-spec-row">
                    <span className="idm-spec-label">Requisitos de Contacto:</span>
                    <span className="idm-spec-value">
                      {universalSpec.contact_requirements?.email_required ? 'Email público requerido' : 'Sin exigencia de email'} (100% público y verificable)
                    </span>
                  </div>
                </>
              )}
              <div className="idm-spec-row">
                <span className="idm-spec-label">Geografía:</span>
                <span className="idm-spec-value">{activeMission.geography}</span>
              </div>
              <div className="idm-spec-row">
                <span className="idm-spec-label">Fuentes públicas:</span>
                <span className="idm-spec-value">
                  Catálogo Industrial PyME, Directorio Abierto de Proveedores, INPI, Datos Abiertos
                </span>
              </div>
              <div className="idm-spec-row">
                <span className="idm-spec-label">Costo externo de licencias:</span>
                <span className="idm-spec-value">$0 USD (Fuentes 100% abiertas)</span>
              </div>
              <div className="idm-spec-row">
                <span className="idm-spec-label">Requisito New-to-Atlas:</span>
                <span className="idm-spec-value">
                  Solo computan registros con comprobante legal no existentes en la autoridad Atlas.
                </span>
              </div>
            </div>

            {/* CAPACITY PRECHECK AUDIT (SECTION 15) */}
            {activeMission.criteria?.capacity_precheck && (
              <div className="idm-capacity-audit-card" style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                padding: '14px',
                margin: '12px 0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em' }}>
                    AUDITORÍA DE CAPACIDAD Y SUPPLY RESPALDADO
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: activeMission.criteria.capacity_precheck.supply_status === 'SUFFICIENT' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: activeMission.criteria.capacity_precheck.supply_status === 'SUFFICIENT' ? '#4ade80' : '#f87171'
                  }}>
                    {activeMission.criteria.capacity_precheck.supply_status === 'SUFFICIENT' ? 'SUPPLY SUFICIENTE' : 'INSUFICIENTE'}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px', lineHeight: '1.4' }}>
                  <strong>Objetivo solicitado:</strong> {formatNumber(activeMission.target_new_records)} registros<br/>
                  <strong>Supply actualmente respaldado:</strong> {formatNumber(activeMission.criteria.capacity_precheck.supported_supply)} registros
                </div>

                {activeMission.criteria.capacity_precheck.supported_supply < activeMission.target_new_records && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', marginBottom: '8px' }}>
                    ⚠️ <strong>Capacidad no alcanzada:</strong> El supply respaldado por fuentes públicas conocidas ({formatNumber(activeMission.criteria.capacity_precheck.supported_supply)}) es menor al objetivo solicitado ({formatNumber(activeMission.target_new_records)}). No se prometerán registros ficticios.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
                  <div>⏱️ Tiempo estimado: <strong style={{ color: '#cbd5e1' }}>{activeMission.criteria.capacity_precheck.estimated_runtime_range}</strong></div>
                  <div>💾 Seguridad DB/Disco: <strong style={{ color: '#cbd5e1' }}>{activeMission.criteria.capacity_precheck.disk_db_safety}</strong></div>
                  <div>⚡ Estado del Worker: <strong style={{ color: '#cbd5e1' }}>{activeMission.criteria.capacity_precheck.worker_readiness}</strong></div>
                  <div>🏛️ Autoridades evaluadas: <strong style={{ color: '#cbd5e1' }}>{activeMission.criteria.capacity_precheck.supported_sources?.length || 4} fuentes públicas</strong></div>
                </div>
              </div>
            )}

            <div className="idm-notice-box">
              ⚠️ <strong>Segundo click de seguridad:</strong> La misión comenzará a ejecutarse en segundo plano únicamente al presionar el botón <em>Iniciar misión</em>. Puedes pausarla o cancelarla en cualquier momento.
            </div>

            <div className="idm-actions">
              <button
                type="button"
                className="idm-btn-secondary"
                onClick={() => setStep('BUILDER')}
                disabled={isActionLoading}
              >
                Volver
              </button>
              <button
                type="button"
                id="idm-btn-confirm-start"
                className="idm-btn-primary idm-btn-start"
                onClick={handleStartMission}
                disabled={isActionLoading}
              >
                {isActionLoading ? 'Iniciando misión...' : 'Iniciar misión'}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: PROGRESS SCREEN ─── */}
        {step === 'PROGRESS' && activeMission && (
          <div className="idm-body idm-progress-body">
            
            {/* Status Strip */}
            <div className="idm-progress-top">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div className="idm-mission-tag">MISIÓN #{activeMission.mission_id.slice(-8)}</div>
                  {activeMission.geography && (
                    <span style={{ fontSize: '11px', fontWeight: 600, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                      📍 {activeMission.geography}
                    </span>
                  )}
                </div>
                <h3 className="idm-progress-title">
                  {activeMission.objective && activeMission.geography && !activeMission.objective.toLowerCase().includes(activeMission.geography.toLowerCase().replace('arg / ', ''))
                    ? `${activeMission.objective} en ${activeMission.geography.replace('ARG / ', '')}`
                    : activeMission.objective}
                </h3>
              </div>
              <span className={`idm-status-pill idm-status-pill--${getMissionStatusPillClass(activeMission)}`}>
                {getMissionStatusPillLabel(activeMission)}
              </span>
            </div>

            {/* Hero Certified Counter */}
            <div className="idm-hero-counter-card">
              <div className="idm-hero-label">RESULTADOS CERTIFICADOS</div>
              <div className="idm-hero-numbers">
                <span className="idm-hero-current">{formatNumber(activeMission.certified_new_searchable || activeMission.qualified_count || 0)}</span>
                <span className="idm-hero-divider">/</span>
                <span className="idm-hero-total">{formatNumber(activeMission.target_new_records)}</span>
              </div>

              {/* Progress Bar */}
              <div className="idm-progressbar-container">
                <div
                  className="idm-progressbar-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="idm-hero-metrics-strip">
                <div>
                  <span className="idm-meta-lbl">Progreso:</span>
                  <span className="idm-meta-val">{progressPercent}%</span>
                </div>
                <div>
                  <span className="idm-meta-lbl">Velocidad:</span>
                  <span className="idm-meta-val">{activeMission.speed_records_per_sec || 0} reg/seg</span>
                </div>
                <div>
                  <span className="idm-meta-lbl">Tiempo transcurrido:</span>
                  <span className="idm-meta-val">{formatSeconds(activeMission.status === 'RUNNING' ? liveElapsedSeconds : (activeMission.elapsed_seconds || 0))}</span>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown Grid: Escaneados, Candidatos válidos, Ya existentes en Atlas, Rechazados por calidad, Nuevos certificados */}
            <div className="idm-counters-grid">
              <div className="idm-counter-cell">
                <span className="idm-counter-num">{formatNumber(activeMission.scanned_count || activeMission.discovered_count || 0)}</span>
                <span className="idm-counter-lbl">Escaneados</span>
              </div>
              <div className="idm-counter-cell">
                <span className="idm-counter-num">{formatNumber(activeMission.candidates_count || activeMission.verified_count || 0)}</span>
                <span className="idm-counter-lbl">Candidatos preliminares</span>
              </div>
              <div className="idm-counter-cell idm-counter-cell--neutral">
                <span className="idm-counter-num" style={{ color: '#64748b' }}>{formatNumber(activeMission.duplicate_existing_count || 0)}</span>
                <span className="idm-counter-lbl">Ya existentes en Atlas</span>
              </div>
              <div className="idm-counter-cell idm-counter-cell--neutral">
                <span className="idm-counter-num" style={{ color: activeMission.rejected_count ? '#ef4444' : '#64748b' }}>{formatNumber(activeMission.rejected_count || 0)}</span>
                <span className="idm-counter-lbl">Rechazados por calidad</span>
              </div>
              <div className="idm-counter-cell" style={{ border: '1px solid #0284c7', background: 'rgba(2, 132, 199, 0.1)' }}>
                <span className="idm-counter-num" style={{ color: '#38bdf8' }}>{formatNumber(activeMission.certified_new_searchable || activeMission.qualified_count || 0)}</span>
                <span className="idm-counter-lbl" style={{ color: '#bae6fd', fontWeight: 600 }}>Nuevos certificados</span>
              </div>
            </div>

            {/* Authoritative Single Terminal State Renderer */}
            {isTerminalStatus(activeMission.status, activeMission.terminal_reason) && renderMissionTerminalState(activeMission)}

            {/* Controls */}
            <div className="idm-actions">
              {activeMission.status === 'RUNNING' && (
                <>
                  <button
                    type="button"
                    className="idm-btn-secondary"
                    onClick={handlePauseMission}
                    disabled={isActionLoading}
                  >
                    ⏸ Pausar misión
                  </button>
                  <button
                    type="button"
                    className="idm-btn-danger"
                    onClick={handleCancelMission}
                    disabled={isActionLoading}
                  >
                    ✕ Cancelar
                  </button>
                  <button
                    type="button"
                    className="idm-btn-secondary"
                    onClick={onClose}
                  >
                    Minimizar (sigue en segundo plano)
                  </button>
                </>
              )}

              {activeMission.status === 'PAUSED' && (
                <>
                  <button
                    type="button"
                    className="idm-btn-primary"
                    onClick={handleResumeMission}
                    disabled={isActionLoading}
                  >
                    ▶ Reanudar misión
                  </button>
                  <button
                    type="button"
                    className="idm-btn-danger"
                    onClick={handleCancelMission}
                    disabled={isActionLoading}
                  >
                    ✕ Cancelar
                  </button>
                </>
              )}

              {isTerminalStatus(activeMission.status, activeMission.terminal_reason) && (
                <>
                  <button
                    type="button"
                    className="idm-btn-secondary"
                    onClick={() => {
                      activeMissionIdRef.current = null;
                      setActiveMission(null);
                      setStep('BUILDER');
                    }}
                  >
                    Nueva misión
                  </button>
                  {activeMission.certified_new_searchable > 0 && (
                    <button
                      type="button"
                      id="idm-btn-ver-resultados"
                      className="idm-btn-primary idm-btn-results"
                      onClick={handleViewResults}
                    >
                      🔍 Ver {formatNumber(activeMission.certified_new_searchable)} nuevos resultados
                    </button>
                  )}
                </>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
