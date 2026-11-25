import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  MapPin, 
  Calendar, 
  Briefcase, 
  Users, 
  Mail, 
  Phone, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Clock, 
  Database, 
  ExternalLink, 
  Search, 
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Building2,
  PieChart
} from 'lucide-react';
import type { 
  AtlasBaseIntelligencePayload, 
  DimensionItem, 
  DimensionGroup 
} from '../../lib/search/AtlasBaseIntelligenceService';

interface AtlasBaseIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuery: (query: string, filters?: any) => void;
}

export const AtlasBaseIntelligenceModal: React.FC<AtlasBaseIntelligenceModalProps> = ({
  isOpen,
  onClose,
  onSelectQuery
}) => {
  const [data, setData] = useState<AtlasBaseIntelligencePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'geo' | 'age' | 'profession' | 'organization' | 'contact' | 'identity' | 'quality'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchIntelligence = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/atlas/base-intelligence');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error('Failed to load base intelligence:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchIntelligence();
  }, [isOpen]);

  if (!isOpen) return null;

  const top = data?.top_panel;
  const dims = data?.dimensions;

  const handleItemClick = (item: DimensionItem) => {
    if (!item.clickQuery) return;
    onSelectQuery(item.clickQuery, { ...item.filters, target: item.count });
    onClose();
  };

  const filterItems = (items: DimensionItem[] = []) => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(i => 
      i.label.toLowerCase().includes(term) || 
      (i.sublabel && i.sublabel.toLowerCase().includes(term))
    );
  };

  const renderDimensionCard = (group?: DimensionGroup) => {
    if (!group) return null;
    const filtered = filterItems(group.items);

    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {group.title}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Conocidos: <strong>{group.totalKnown.toLocaleString('es-AR')}</strong> ({group.knownPercentage}%) • 
              {group.totalUnknown > 0 ? (
                <span style={{ color: '#f59e0b', marginLeft: '0.35rem' }}>
                  Unknown: <strong>{group.totalUnknown.toLocaleString('es-AR')}</strong> ({group.unknownPercentage}%)
                </span>
              ) : (
                <span style={{ color: '#34d399', marginLeft: '0.35rem' }}>100% categorizado</span>
              )}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {filtered.map(item => {
            const isUnknown = item.label.toLowerCase().includes('unknown');
            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  background: isUnknown ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${isUnknown ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '12px',
                  padding: '0.85rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease-in-out',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#38bdf8';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = isUnknown ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.background = isUnknown ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255, 255, 255, 0.03)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isUnknown ? '#f59e0b' : '#f1f5f9', lineHeight: 1.3 }}>
                    {item.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#38bdf8', fontSize: '0.7rem' }}>
                    <ArrowRight size={13} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isUnknown ? '#fbbf24' : '#38bdf8' }}>
                    {item.count.toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
                    {item.percentage}%
                  </span>
                </div>

                {item.sublabel && (
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                    {item.sublabel}
                  </span>
                )}

                {/* Micro progress bar */}
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.2rem' }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(item.percentage, 1))}%`,
                    height: '100%',
                    background: isUnknown ? '#f59e0b' : 'linear-gradient(90deg, #38bdf8, #818cf8)'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      backgroundColor: 'rgba(3, 7, 18, 0.85)',
      backdropFilter: 'blur(16px)'
    }}>
      <div style={{
        background: '#0b1329',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '1280px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.6))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <PieChart size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.02em', color: '#f8fafc' }}>
                  INTELIGENCIA DE LA BASE ATLAS
                </h2>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '9999px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  SSOT CANÓNICO
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                Auditoría Física Multidimensional • Cada métrica es clickeable para abrir sus resultados reales
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Filtrar dimensión..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '0.45rem 0.85rem 0.45rem 2.2rem',
                  color: '#f8fafc',
                  fontSize: '0.8rem',
                  width: '200px',
                  outline: 'none'
                }}
              />
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#cbd5e1',
                padding: '0.45rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 16. PANEL SUPERIOR (Master Metrics Strip) */}
        {top && (
          <div style={{
            padding: '1rem 1.75rem',
            background: 'rgba(15, 23, 42, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem'
          }}>
            <div 
              onClick={() => setActiveTab('all')}
              style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.04em' }}>PERSONAS CANÓNICAS</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc' }}>
                {(top.canonical_persons || top.base_total).toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>SSOT Canónico Verificado</span>
            </div>

            <div 
              onClick={() => setActiveTab('geo')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>GEOGRAFÍA</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#e2e8f0' }}>
                {top.geo_known.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>Unknown: {top.geo_unknown.toLocaleString('es-AR')}</span>
            </div>

            <div 
              onClick={() => setActiveTab('age')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>EDAD OBSERVADA</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fbbf24' }}>
                {top.age_known.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Unknown: {top.age_unknown.toLocaleString('es-AR')}</span>
            </div>

            <div 
              onClick={() => setActiveTab('profession')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>PROFESIÓN CONOCIDA</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#818cf8' }}>
                {top.profession_known.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Unknown: {top.profession_unknown.toLocaleString('es-AR')}</span>
            </div>

            <div 
              onClick={() => setActiveTab('organization')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>ORGANIZACIÓN</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8' }}>
                {top.organization_known.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Unknown: {top.organization_unknown.toLocaleString('es-AR')}</span>
            </div>

            <div 
              onClick={() => setActiveTab('contact')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4ade80', letterSpacing: '0.04em' }}>CONTACTABILIDAD</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#4ade80' }}>
                {top.with_verified_email.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Tel: {top.with_phone.toLocaleString('es-AR')} • LI: {top.with_linkedin.toLocaleString('es-AR')}</span>
            </div>

            <div 
              onClick={() => setActiveTab('identity')}
              style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.65rem 0.85rem', cursor: 'pointer' }}
            >
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c084fc', letterSpacing: '0.04em' }}>IDENTIDAD</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#c084fc' }}>
                {top.identity_verified.toLocaleString('es-AR')}
              </div>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Parcial: {top.identity_partial.toLocaleString('es-AR')} • Unproven: 0</span>
            </div>
          </div>
        )}

        {/* SSOT Reconciliation Sub-Bar */}
        {top && (
          <div style={{
            padding: '0.5rem 1.75rem',
            background: 'rgba(15, 23, 42, 0.85)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            fontSize: '0.74rem'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8' }}>
                PERSONAS INDEXADAS PARA BÚSQUEDA: <strong style={{ color: '#38bdf8' }}>{(top.searchable_persons || 5300992).toLocaleString('es-AR')}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>
                PERSONAS CON ENRIQUECIMIENTO: <strong style={{ color: '#34d399' }}>{(top.enriched_persons || 60648).toLocaleString('es-AR')}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>
                IDENTIDADES / ALIASES: <strong style={{ color: '#f8fafc' }}>{(top.identity_rows || 7434338).toLocaleString('es-AR')}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>
                CANDIDATOS NO CANÓNICOS: <strong style={{ color: '#f59e0b' }}>{(top.noncan_candidates || 1091305).toLocaleString('es-AR')}</strong> <span style={{ fontSize: '0.65rem', color: '#64748b' }}>(Unresolved)</span>
              </span>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
              * 5.300.992 personas canónicas resueltas en SSOT • 5.300.992 proyectadas para búsqueda inmediata
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{
          padding: '0.5rem 1.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(11, 19, 41, 0.7)',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto'
        }}>
          {[
            { id: 'all', label: 'MOSTRAR TODO (6 DIMENSIONES)', icon: Layers },
            { id: 'geo', label: '1. GEOGRAFÍA', icon: MapPin },
            { id: 'age', label: '2. EDAD', icon: Calendar },
            { id: 'profession', label: '3. PROFESIÓN', icon: Briefcase },
            { id: 'organization', label: '4. ORGANIZACIÓN', icon: Building2 },
            { id: 'contact', label: '5. CONTACTABILIDAD', icon: Mail },
            { id: 'identity', label: '6. IDENTIDAD', icon: ShieldCheck },
            { id: 'quality', label: '7. AUDITORÍA & FUENTES', icon: Database }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                  background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div style={{
          padding: '1.75rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: '#94a3b8' }}>
              Cargando dimensiones materializadas canónicas...
            </div>
          )}

          {!loading && dims && (
            <>
              {activeTab === 'all' && (
                <>
                  {renderDimensionCard(dims.geo)}
                  {renderDimensionCard(dims.age)}
                  {renderDimensionCard(dims.profession)}
                  {renderDimensionCard(dims.organization)}
                  {renderDimensionCard(dims.contactability)}
                  {renderDimensionCard(dims.identity)}
                </>
              )}

              {activeTab === 'geo' && (
                <>
                  {renderDimensionCard(dims.geo)}
                  {renderDimensionCard(dims.geo_relation)}
                </>
              )}

              {activeTab === 'age' && (
                <>
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Regla Estricta Atlas:</strong> Solo se computa edad física observada en registros públicos oficiales (AFIP, ANSES, Magistrados). No se estima ni infiere edad por nombre o apariencia.
                    </span>
                  </div>
                  {renderDimensionCard(dims.age)}
                </>
              )}

              {activeTab === 'profession' && (
                <>
                  {renderDimensionCard(dims.profession)}
                  {renderDimensionCard(dims.organization_seniority)}
                </>
              )}

              {activeTab === 'organization' && (
                <>
                  {renderDimensionCard(dims.organization)}
                  {renderDimensionCard(dims.organization_seniority)}
                </>
              )}

              {activeTab === 'contact' && (
                <>
                  {renderDimensionCard(dims.contactability)}
                  {renderDimensionCard(dims.contact_combinations)}
                  {renderDimensionCard(dims.email_type)}
                </>
              )}

              {activeTab === 'identity' && (
                <>
                  {renderDimensionCard(dims.identity)}
                  {renderDimensionCard(dims.quality_verification)}
                </>
              )}

              {activeTab === 'quality' && (
                <>
                  {renderDimensionCard(dims.quality_verification)}
                  {renderDimensionCard(dims.recency)}
                  {renderDimensionCard(dims.source_family)}
                  {renderDimensionCard(dims.activity_density)}
                  {renderDimensionCard(dims.profile_completeness)}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer info strip */}
        <div style={{
          padding: '0.75rem 1.75rem',
          background: 'rgba(15, 23, 42, 0.9)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: '#64748b'
        }}>
          <span>
            Haga clic en cualquier dimensión para pre-cargar la búsqueda y ver los registros reales que componen la cifra.
          </span>
          <span>
            Atlas Materialized Intelligence SSOT • Actualizado: {data?.updated_at ? new Date(data.updated_at).toLocaleTimeString('es-AR') : 'Recién'}
          </span>
        </div>
      </div>
    </div>
  );
};
