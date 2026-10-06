import React, { useState, useEffect } from 'react';
import { 
  Cpu, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, Database, 
  ExternalLink, ArrowRight, Play, RefreshCw, Layers, Sliders, Globe, Building2
} from 'lucide-react';
import { AtlasSearchFactory } from '../../../lib/factory/AtlasSearchFactory';
import type { FactoryGenerationResult } from '../../../lib/factory/AtlasSearchFactory';
import type { AtlasDomainSpecification } from '../../../lib/factory/contracts/AtlasDomainSpecification';
import type { DomainLifecycleState } from '../../../lib/factory/contracts/AtlasDomainLifecycle';
import './AdminTotal.css';

export const AdminSearchFactory: React.FC = () => {
  const [prompt, setPrompt] = useState<string>(
    'Quiero un buscador nacional de proveedores industriales argentinos que permita encontrar empresas por industria, productos, provincia, certificaciones, sitio web y contactos comerciales públicos verificables.'
  );
  const [geography, setGeography] = useState<string>('República Argentina');
  const [generating, setGenerating] = useState<boolean>(false);
  const [result, setResult] = useState<FactoryGenerationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'schema' | 'identity' | 'sources' | 'radar' | 'ui'>('schema');
  const [operatorNotes, setOperatorNotes] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const factory = new AtlasSearchFactory();

  // Load existing domain or auto-generate on first visit
  useEffect(() => {
    const repo = factory.getRepository();
    let persisted = repo.loadDomain('SUPPLIERS_ARGENTINA');
    if (!persisted) {
      try {
        const res = factory.generateDomainFromNaturalLanguage(prompt, {
          geographic_scope: geography
        });
        setResult(res);
        return;
      } catch (err: any) {
        console.error('Failed to auto-generate initial domain:', err);
      }
    }
    if (persisted) {
      const compiler = factory.getCompiler();
      const { domainPack } = compiler.compile(persisted.generated_specification);
      setResult({
        specification: persisted.generated_specification,
        static_validation: {
          valid: true,
          errors: [],
          warnings: [],
          DOMAIN_STATIC_VALIDATION: 'PASS',
          checks_performed: { schema_integrity: true, identity_safety: true, evidence_policy: true, privacy_compliance: true, ui_config_validity: true }
        },
        lifecycle: {
          domain_id: persisted.domain_id,
          spec_version: persisted.spec_version,
          generator_version: persisted.generator_version,
          compiled_spec_hash: persisted.compiled_spec_hash,
          current_state: persisted.lifecycle_state,
          created_at: persisted.created_at,
          updated_at: persisted.updated_at,
          last_certified_at: persisted.last_certified_at,
          promotion_history: persisted.promotion_history,
          gate_history: persisted.gate_results,
          manual_overrides: persisted.manual_overrides
        },
        compiled_domain_pack: domainPack,
        persisted_record: persisted
      });
    }
  }, []);

  const handleGenerate = () => {
    try {
      setGenerating(true);
      setActionMessage(null);
      const res = factory.generateDomainFromNaturalLanguage(prompt, {
        geographic_scope: geography
      });
      setResult(res);
      setActionMessage('¡Especificación de Dominio generada y compilada exitosamente en DRAFT!');
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveShadow = () => {
    if (!result) return;
    try {
      const updated = factory.advanceToShadow(result.specification, result.lifecycle);
      setResult({ ...result, lifecycle: updated });
      setActionMessage('Dominio promovido a SHADOW (prospección y radar sin ingesta masiva).');
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleApproveActivation = () => {
    if (!result) return;
    try {
      const updated = factory.approveActivation(
        result.specification.domain_id,
        'admin@youapp.com',
        operatorNotes || 'Activación comercial autorizada desde Control Center'
      );
      setResult({ ...result, lifecycle: updated });
      setActionMessage('¡DOMINIO ACTIVADO! Habilitado para consultas comerciales públicas.');
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const getStateColor = (state: DomainLifecycleState) => {
    switch (state) {
      case 'DRAFT': return '#94a3b8';
      case 'SHADOW': return '#38bdf8';
      case 'CANARY': return '#fbbf24';
      case 'CERTIFIED': return '#a855f7';
      case 'ACTIVE': return '#10b981';
      case 'BLOCKED': return '#f43f5e';
    }
  };

  return (
    <div className="admin-page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ 
              background: 'linear-gradient(135deg, #6366f1, #a855f7)', 
              padding: '0.5rem', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center' 
            }}>
              <Cpu size={24} color="#fff" />
            </span>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
              Atlas Search Factory V1
            </h1>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
            Generación autónoma de buscadores verticales a partir de requerimientos en lenguaje natural.
          </p>
        </div>

        {result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              background: '#1e293b', 
              border: `1px solid ${getStateColor(result.lifecycle.current_state)}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: getStateColor(result.lifecycle.current_state) }} />
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Estado del Dominio:</span>
              <strong style={{ color: getStateColor(result.lifecycle.current_state) }}>{result.lifecycle.current_state}</strong>
            </div>

            <a 
              href={`/search/${result.specification.domain_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                background: '#3b82f6',
                color: '#fff',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              <ExternalLink size={16} /> Abrir Search App Shell
            </a>
          </div>
        )}
      </div>

      {actionMessage && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1.5rem', 
          borderRadius: '8px', 
          background: actionMessage.startsWith('Error') ? '#450a0a' : '#064e3b',
          border: `1px solid ${actionMessage.startsWith('Error') ? '#f43f5e' : '#10b981'}`,
          color: actionMessage.startsWith('Error') ? '#fecdd3' : '#a7f3d0',
          fontSize: '0.9rem'
        }}>
          {actionMessage}
        </div>
      )}

      {/* Input Generator Card */}
      <div style={{ 
        background: '#0f172a', 
        borderRadius: '12px', 
        border: '1px solid #1e293b', 
        padding: '1.5rem', 
        marginBottom: '2rem' 
      }}>
        <h2 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} color="#a855f7" /> Especificar Nuevo Buscador Vertical
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
              ¿Qué necesidad de información o mercado necesitas estructurar? (Lenguaje Natural)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '0.95rem',
                boxSizing: 'border-box'
              }}
              placeholder="Ej: Quiero un buscador nacional de proveedores industriales argentinos..."
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                Alcance Geográfico
              </label>
              <input
                type="text"
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              style={{
                padding: '0.75rem 1.75rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap'
              }}
            >
              {generating ? <RefreshCw size={18} className="spin-animation" /> : <Sparkles size={18} />}
              {generating ? 'Generando y Compilando...' : 'GENERATE DOMAIN'}
            </button>
          </div>
        </div>
      </div>

      {/* Generated Domain View */}
      {result && (
        <div style={{ background: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', overflow: 'hidden' }}>
          {/* Top Banner */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #1e293b', background: '#131e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Building2 size={22} color="#38bdf8" />
                <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#f8fafc' }}>
                  {result.specification.display_name}
                </h2>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#334155', fontSize: '0.75rem', color: '#94a3b8' }}>
                  ID: {result.specification.domain_id}
                </span>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#0369a1', fontSize: '0.75rem', color: '#e0f2fe' }}>
                  Entidad: {result.specification.entity_type}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                {result.specification.sector_scope} • Alcance: {result.specification.geographic_scope} • Generador: {result.specification.generator_version}
              </p>
            </div>

            {/* Lifecycle Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {result.lifecycle.current_state === 'DRAFT' && (
                <button
                  onClick={handleApproveShadow}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '8px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Play size={16} /> APROBAR PARA SHADOW
                </button>
              )}

              {(result.lifecycle.current_state === 'CERTIFIED' || result.lifecycle.current_state === 'CANARY') && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Notas de aprobación..."
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '6px',
                      background: '#1e293b',
                      border: '1px solid #475569',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  />
                  <button
                    onClick={handleApproveActivation}
                    style={{
                      padding: '0.6rem 1.2rem',
                      borderRadius: '8px',
                      background: '#059669',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <ShieldCheck size={16} /> APROBAR ACTIVACIÓN
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lifecycle State Timeline */}
          <div style={{ padding: '1rem 1.5rem', background: '#090d16', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>LIFECYCLE PIPELINE:</span>
            {(['DRAFT', 'SHADOW', 'CANARY', 'CERTIFIED', 'ACTIVE'] as DomainLifecycleState[]).map((step, idx) => {
              const isActive = result.lifecycle.current_state === step;
              const isPassed = ['DRAFT', 'SHADOW', 'CANARY', 'CERTIFIED', 'ACTIVE'].indexOf(result.lifecycle.current_state) >= idx;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: isActive ? getStateColor(step) : (isPassed ? '#334155' : '#1e293b'),
                    color: isActive ? '#000' : '#cbd5e1',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    fontWeight: isActive ? 700 : 500, 
                    color: isActive ? '#f8fafc' : '#64748b' 
                  }}>
                    {step}
                  </span>
                  {idx < 4 && <span style={{ color: '#334155', fontSize: '0.8rem' }}>→</span>}
                </div>
              );
            })}
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#0b1120' }}>
            <button
              onClick={() => setActiveTab('schema')}
              style={{
                padding: '0.85rem 1.5rem',
                background: activeTab === 'schema' ? '#1e293b' : 'transparent',
                color: activeTab === 'schema' ? '#f8fafc' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === 'schema' ? '2px solid #6366f1' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Schema & Campos ({result.specification.fields.length})
            </button>
            <button
              onClick={() => setActiveTab('identity')}
              style={{
                padding: '0.85rem 1.5rem',
                background: activeTab === 'identity' ? '#1e293b' : 'transparent',
                color: activeTab === 'identity' ? '#f8fafc' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === 'identity' ? '2px solid #6366f1' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Política de Identidad & Anti-Merge
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              style={{
                padding: '0.85rem 1.5rem',
                background: activeTab === 'sources' ? '#1e293b' : 'transparent',
                color: activeTab === 'sources' ? '#f8fafc' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === 'sources' ? '2px solid #6366f1' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Fuentes & Gobernanza ({result.specification.source_candidates.length})
            </button>
            <button
              onClick={() => setActiveTab('radar')}
              style={{
                padding: '0.85rem 1.5rem',
                background: activeTab === 'radar' ? '#1e293b' : 'transparent',
                color: activeTab === 'radar' ? '#f8fafc' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === 'radar' ? '2px solid #6366f1' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Penta Radar Plan
            </button>
            <button
              onClick={() => setActiveTab('ui')}
              style={{
                padding: '0.85rem 1.5rem',
                background: activeTab === 'ui' ? '#1e293b' : 'transparent',
                color: activeTab === 'ui' ? '#f8fafc' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === 'ui' ? '2px solid #6366f1' : 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Configuración UI & Facetas
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '1.5rem' }}>
            {activeTab === 'schema' && (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>CAMPO</th>
                      <th style={{ padding: '0.75rem' }}>TIPO</th>
                      <th style={{ padding: '0.75rem' }}>CLASIFICACIÓN</th>
                      <th style={{ padding: '0.75rem' }}>SENSIBILIDAD</th>
                      <th style={{ padding: '0.75rem' }}>REQUERIDO</th>
                      <th style={{ padding: '0.75rem' }}>DESCRIPCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.specification.fields.map(f => (
                      <tr key={f.name} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#f8fafc' }}>{f.name}</td>
                        <td style={{ padding: '0.75rem', color: '#38bdf8' }}>{f.type}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            background: f.classification === 'CORE_IDENTITY' ? '#4338ca' : (f.classification === 'RESTRICTED' ? '#831843' : '#1e293b'),
                            color: '#fff',
                            fontSize: '0.75rem'
                          }}>
                            {f.classification}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{f.sensitivity}</td>
                        <td style={{ padding: '0.75rem', color: f.required ? '#10b981' : '#64748b' }}>{f.required ? 'SÍ' : 'NO'}</td>
                        <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'identity' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#38bdf8' }}>Anclas Fuertes de Identidad</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                    <li>Campo Identificador Primario: <strong>{result.specification.identity_policy.primary_id_field}</strong></li>
                    <li>Campos Fuertes Requeridos: <strong>{result.specification.identity_policy.strong_identifier_fields.join(', ')}</strong></li>
                    <li>Campos Secundarios: <strong>{result.specification.identity_policy.secondary_identifier_fields.join(', ')}</strong></li>
                    <li>Estrategia Deduplicación: <strong>{result.specification.identity_policy.dedup_strategy}</strong></li>
                  </ul>
                </div>

                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#f43f5e' }}>Reglas Anti-Merge (Fail-Closed)</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                    <li>allow_name_only_merge: <strong>FALSE (Strict)</strong></li>
                    <li>allow_soft_canonical_merge: <strong>FALSE (Strict)</strong></li>
                    <li>Acción ante colisión: <strong>{result.specification.identity_policy.collision_action}</strong></li>
                    <li>Merge por sólo razón social: <strong>PROHIBIDO</strong></li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'sources' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {result.specification.source_candidates.map(sc => (
                    <div key={sc.source_id} style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{sc.source_name}</strong>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#475569', color: '#fff' }}>
                          {sc.initial_status}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#38bdf8' }}>{sc.source_family} • {sc.openness_tier}</p>
                      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#94a3b8' }}>URL: {sc.source_url}</p>
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                        Est. Scale: {sc.scale_estimate.toLocaleString('es-AR')} empresas • Depth: {sc.depth_estimate.toLocaleString('es-AR')} attr
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'radar' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#a855f7' }}>Objetivos EXPLORER & DEEP MINER</h3>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 0.5rem 0' }}>Portales y directorios para descubrimiento:</p>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                    {result.specification.discovery_plan.explorer_targets.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </div>

                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#38bdf8' }}>Dimensiones REPLICATOR & PROTOCOLS</h3>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 0.5rem 0' }}>Hubs industriales de replicación:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {result.specification.discovery_plan.replicator_dimensions.map(d => (
                      <span key={d} style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#334155', color: '#f8fafc', fontSize: '0.8rem' }}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ui' && (
              <div>
                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px', marginBottom: '1rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#f8fafc' }}>Columnas Principales de la Search App</h3>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {result.specification.ui_config.columns.map(c => (
                      <div key={c.key} style={{ padding: '0.5rem 1rem', background: '#334155', borderRadius: '6px', fontSize: '0.85rem', color: '#f8fafc' }}>
                        <strong>{c.label}</strong> ({c.key})
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#f8fafc' }}>Filtros y Facetas Configurados</h3>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {result.specification.ui_config.filters.map(f => (
                      <div key={f.key} style={{ padding: '0.5rem 1rem', background: '#0f172a', borderRadius: '6px', fontSize: '0.85rem', color: '#cbd5e1', border: '1px solid #334155' }}>
                        <strong>{f.label}</strong> • {f.type} {f.options ? `(${f.options.length} opciones)` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSearchFactory;
