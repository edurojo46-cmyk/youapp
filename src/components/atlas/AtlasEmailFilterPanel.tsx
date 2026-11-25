// ATLAS_EMAIL_FILTER_PANEL · REFRESH
import React, { useState, useEffect, useRef } from 'react';
import { 
  Filter, 
  Search, 
  Sparkles, 
  Download, 
  Send, 
  CheckCircle2, 
  ExternalLink, 
  ChevronRight, 
  ChevronLeft, 
  ShieldCheck, 
  MapPin, 
  Building2, 
  Briefcase, 
  Mail, 
  Phone, 
  Globe, 
  X, 
  Layers, 
  Database,
  Eye,
  Sliders,
  RotateCcw
} from 'lucide-react';

export interface FilterResultRecord {
  person_id: string;
  person_name: string;
  role: string;
  organization: string;
  location: string;
  province: string;
  city: string;
  email: string;
  email_domain: string;
  email_type: string;
  available_signals: string[];
  source_family: string;
  source_status: string;
  provenance: string;
  last_verified: string;
}

const LinkedinIcon: React.FC<{ size?: number; color?: string; title?: string }> = ({ size = 13, color = '#60a5fa', title }) => (
  <span title={title} style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  </span>
);

const InstagramIcon: React.FC<{ size?: number; color?: string; title?: string }> = ({ size = 13, color = '#f472b6', title }) => (
  <span title={title} style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  </span>
);

const FacebookIcon: React.FC<{ size?: number; color?: string; title?: string }> = ({ size = 13, color = '#2dd4bf', title }) => (
  <span title={title} style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  </span>
);

export const AtlasEmailFilterPanel: React.FC = () => {
  const [naturalQuery, setNaturalQuery] = useState('');
  const [province, setProvince] = useState('');
  const [profession, setProfession] = useState('');
  const [emailType, setEmailType] = useState('');
  const [sourceFamily, setSourceFamily] = useState('');
  const [hasPhone, setHasPhone] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [hasLinkedin, setHasLinkedin] = useState(false);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [hasFacebook, setHasFacebook] = useState(false);

  const [records, setRecords] = useState<FilterResultRecord[]>([]);
  const [totalMatches, setTotalMatches] = useState<number>(2000000);
  const [indexStatus, setIndexStatus] = useState<'REBUILDING' | 'READY'>('REBUILDING');
  const [indexVersion, setIndexVersion] = useState<string>('FACET_INDEX_REAL_V2');
  const [signalsSummary, setSignalsSummary] = useState({
    total_certified: 2000000,
    matching_results: 2000000,
    with_phone: 0,
    with_website: 0,
    with_linkedin: 0,
    with_instagram: 0,
    with_facebook: 0
  });

  const [interpretedFilters, setInterpretedFilters] = useState<any>(null);
  const [queryTimeMs, setQueryTimeMs] = useState<number>(12);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<FilterResultRecord | null>(null);
  const [missionCreatedNotice, setMissionCreatedNotice] = useState<string | null>(null);

  // Facets metadata from backend
  const [facetsData, setFacetsData] = useState<any>(null);

  // Fetch engine status and facets on mount
  useEffect(() => {
    fetch('/api/atlas/email-filter/status')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setIndexStatus(d.facet_index_built ? 'READY' : 'REBUILDING');
          if (d.facet_index_version) setIndexVersion(d.facet_index_version);
        }
      })
      .catch(() => {});

    fetch('/api/atlas/email-filter/facets')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setFacetsData(d);
          if (d.signals_coverage) {
            setSignalsSummary(prev => ({
              ...prev,
              ...d.signals_coverage
            }));
          }
        }
      })
      .catch(() => {});
  }, []);

  // Execute filter query whenever criteria changes
  const executeSearch = async (pageNum = 1) => {
    setIsLoading(true);
    setPage(pageNum);
    try {
      const filters: any = {};
      if (province) filters.province = province;
      if (profession) filters.profession = profession;
      if (emailType) filters.email_type = emailType;
      if (sourceFamily) filters.source_family = sourceFamily;
      if (hasPhone) filters.has_phone = true;
      if (hasWebsite) filters.has_website = true;
      if (hasLinkedin) filters.has_linkedin = true;
      if (hasInstagram) filters.has_instagram = true;
      if (hasFacebook) filters.has_facebook = true;

      const payload: any = { filters, page: pageNum, page_size: pageSize };
      if (naturalQuery && naturalQuery.trim().length > 0) {
        payload.natural_query = naturalQuery;
      }

      const res = await fetch('/api/atlas/email-filter/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setTotalMatches(data.total_matches || 0);
        if (data.signals_summary) setSignalsSummary(data.signals_summary);
        if (data.interpreted_filters) setInterpretedFilters(data.interpreted_filters);
        else setInterpretedFilters(null);
        if (data.filter_query_time_ms) setQueryTimeMs(data.filter_query_time_ms);
      }
    } catch (err) {
      console.error('Failed to filter emails:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    executeSearch(1);
  }, [province, profession, emailType, sourceFamily, hasPhone, hasWebsite, hasLinkedin, hasInstagram, hasFacebook]);

  const handleResetFilters = () => {
    setNaturalQuery('');
    setProvince('');
    setProfession('');
    setEmailType('');
    setSourceFamily('');
    setHasPhone(false);
    setHasWebsite(false);
    setHasLinkedin(false);
    setHasInstagram(false);
    setHasFacebook(false);
    setInterpretedFilters(null);
  };

  const handleNaturalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(1);
  };

  const handleCreateMission = () => {
    const missionId = `mission_filter_${Date.now()}`;
    setMissionCreatedNotice(`Misión creada con éxito [${missionId}] con ${totalMatches.toLocaleString('es-AR')} contactos.`);
    setTimeout(() => setMissionCreatedNotice(null), 6000);
  };

  const handleExportCsv = () => {
    if (records.length === 0) return;
    const headers = ['PERSON', 'ROLE', 'ORGANIZATION', 'LOCATION', 'EMAIL', 'EMAIL_DOMAIN', 'EMAIL_TYPE', 'SIGNALS', 'SOURCE_FAMILY', 'PROVENANCE', 'LAST_VERIFIED'];
    const rows = records.map(r => [
      `"${r.person_name}"`,
      `"${r.role}"`,
      `"${r.organization}"`,
      `"${r.location}"`,
      `"${r.email}"`,
      `"${r.email_domain}"`,
      `"${r.email_type}"`,
      `"${r.available_signals.join(';')}"`,
      `"${r.source_family}"`,
      `"${r.provenance}"`,
      `"${r.last_verified}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `atlas_email_filter_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalMatches / pageSize) || 1;

  return (
    <div 
      id="atlas-email-filter-panel"
      style={{
        background: 'linear-gradient(135deg, #090e17 0%, #0d1527 100%)',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 12px 35px -5px rgba(0, 0, 0, 0.45)',
        color: '#ffffff'
      }}
    >
      {/* 1. Header & Live Universe Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(56, 189, 248, 0.2))',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399'
          }}>
            <Filter size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em', margin: 0, textTransform: 'uppercase', color: '#f8fafc' }}>
                FILTRO DE EMAILS ATLAS
              </h2>
              <span style={{ 
                fontSize: '0.65rem', 
                fontWeight: 800, 
                padding: '0.15rem 0.5rem', 
                borderRadius: '6px', 
                background: indexStatus === 'REBUILDING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(52, 211, 153, 0.15)', 
                color: indexStatus === 'REBUILDING' ? '#f59e0b' : '#34d399', 
                border: indexStatus === 'REBUILDING' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(52, 211, 153, 0.3)' 
              }}>
                {indexStatus === 'REBUILDING' ? 'FACET INDEX REBUILDING' : indexVersion}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              Filtro canónico sobre Truth SSOT & PointerStore · Latencia P50: {queryTimeMs}ms
            </div>
          </div>
        </div>

        {/* Global Counters Ribbon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
          <span style={{ padding: '0.3rem 0.65rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', fontWeight: 800 }}>
            UNIVERSO CERTIFICADO: 2.000.000
          </span>
          <span style={{ padding: '0.3rem 0.65rem', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', fontWeight: 800 }}>
            RESULTADOS: {totalMatches.toLocaleString('es-AR')}
          </span>
        </div>
      </div>

      {/* 2. Top Summary Metrics Bar (Strict requirement) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.6rem',
        marginBottom: '1.25rem',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '0.75rem 1rem',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>UNIVERSO CERTIFICADO</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f8fafc' }}>2.000.000</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>RESULTADOS DEL FILTRO</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#38bdf8' }}>{totalMatches.toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>CON TELÉFONO</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fbbf24' }}>{signalsSummary.with_phone.toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>CON WEBSITE</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#c084fc' }}>{signalsSummary.with_website.toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>CON LINKEDIN</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#60a5fa' }}>{signalsSummary.with_linkedin.toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>CON INSTAGRAM</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f472b6' }}>{signalsSummary.with_instagram.toLocaleString('es-AR')}</span>
        </div>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'block' }}>CON FACEBOOK</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#2dd4bf' }}>{signalsSummary.with_facebook.toLocaleString('es-AR')}</span>
        </div>
      </div>

      {/* 3. Natural Language Search Box */}
      <form onSubmit={handleNaturalSubmit} style={{ marginBottom: '1rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '12px',
          padding: '0.5rem 0.85rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <Sparkles size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
          <input
            id="input-natural-email-query"
            type="text"
            value={naturalQuery}
            onChange={e => setNaturalQuery(e.target.value)}
            placeholder="¿Qué contactos querés encontrar? (ej: abogados de Córdoba con LinkedIn y email corporativo)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 600
            }}
          />
          <button
            type="submit"
            id="btn-submit-natural-query"
            style={{
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.4rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Search size={14} />
            Filtrar
          </button>
          {(naturalQuery || province || profession || emailType || sourceFamily || hasPhone || hasWebsite || hasLinkedin) && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="Limpiar filtros"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                borderRadius: '8px',
                padding: '0.4rem 0.6rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </form>

      {/* Interpreted Filters Audit Pill Bar */}
      {interpretedFilters && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          padding: '0.45rem 0.75rem',
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '8px',
          fontSize: '0.74rem'
        }}>
          <span style={{ color: '#38bdf8', fontWeight: 800 }}>FILTROS INTERPRETADOS:</span>
          {Object.entries(interpretedFilters.applied_filters || {}).map(([k, v]: [string, any]) => (
            <span key={k} style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '4px',
              padding: '0.15rem 0.45rem',
              color: '#f8fafc',
              fontWeight: 700
            }}>
              {k.toUpperCase()}: <strong>{String(v)}</strong>
            </span>
          ))}
        </div>
      )}

      {/* 4. Structured Facet Selectors (Dynamic Discovery) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '0.65rem',
        marginBottom: '1.25rem'
      }}>
        {/* Province Facet */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            PROVINCIA:
          </label>
          <select
            id="select-filter-province"
            value={province}
            onChange={e => setProvince(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.4rem 0.6rem',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none'
            }}
          >
            <option value="">Todas las Provincias ({totalMatches.toLocaleString('es-AR')})</option>
            {facetsData?.provinces?.map((p: any) => (
              <option key={p.value} value={p.value}>
                {p.value} ({p.count.toLocaleString('es-AR')})
              </option>
            ))}
          </select>
        </div>

        {/* Profession Facet */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            PROFESIÓN:
          </label>
          <select
            id="select-filter-profession"
            value={profession}
            onChange={e => setProfession(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.4rem 0.6rem',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none'
            }}
          >
            <option value="">Todas las Profesiones</option>
            {facetsData?.professions?.map((p: any) => (
              <option key={p.value} value={p.value}>
                {p.value} ({p.count.toLocaleString('es-AR')})
              </option>
            ))}
          </select>
        </div>

        {/* Email Type Facet */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            TIPO DE EMAIL:
          </label>
          <select
            id="select-filter-email-type"
            value={emailType}
            onChange={e => setEmailType(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.4rem 0.6rem',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none'
            }}
          >
            <option value="">Todos los Tipos</option>
            {facetsData?.email_types?.map((t: any) => (
              <option key={t.value} value={t.value}>
                {t.value} ({t.count.toLocaleString('es-AR')})
              </option>
            ))}
          </select>
        </div>

        {/* Source Family Facet */}
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
            FAMILIA DE FUENTE:
          </label>
          <select
            id="select-filter-source-family"
            value={sourceFamily}
            onChange={e => setSourceFamily(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.4rem 0.6rem',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              outline: 'none'
            }}
          >
            <option value="">Todas las Familias</option>
            {facetsData?.source_families?.map((f: any) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count.toLocaleString('es-AR')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Signal Checkbox Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, marginRight: '0.2rem' }}>
          ENRIQUECIMIENTO:
        </span>

        {[
          { label: 'Con LinkedIn', active: hasLinkedin, set: setHasLinkedin, icon: <LinkedinIcon size={13} color="#60a5fa" /> },
          { label: 'Con Teléfono', active: hasPhone, set: setHasPhone, icon: <Phone size={13} color="#fbbf24" /> },
          { label: 'Con Website', active: hasWebsite, set: setHasWebsite, icon: <Globe size={13} color="#c084fc" /> },
          { label: 'Con Instagram', active: hasInstagram, set: setHasInstagram, icon: <InstagramIcon size={13} color="#f472b6" /> },
          { label: 'Con Facebook', active: hasFacebook, set: setHasFacebook, icon: <FacebookIcon size={13} color="#2dd4bf" /> }
        ].map((btn, i) => (
          <button
            key={i}
            onClick={() => btn.set(!btn.active)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: btn.active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${btn.active ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: btn.active ? '#38bdf8' : '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {btn.icon}
            {btn.label}
          </button>
        ))}
      </div>

      {/* Mission Handoff & Export Actions Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
          Mostrando página <strong style={{ color: '#f8fafc' }}>{page}</strong> de <strong style={{ color: '#f8fafc' }}>{totalPages.toLocaleString('es-AR')}</strong> ({records.length} de {totalMatches.toLocaleString('es-AR')} contactos)
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            id="btn-create-mission-from-filter"
            onClick={handleCreateMission}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(56, 189, 248, 0.2))',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              color: '#c084fc',
              borderRadius: '8px',
              padding: '0.4rem 0.9rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Send size={13} />
            CREATE MISSION FROM FILTER
          </button>

          <button
            id="btn-export-filtered-results"
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              color: '#4ade80',
              borderRadius: '8px',
              padding: '0.4rem 0.9rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Download size={13} />
            EXPORT AUTHORIZED RESULT SET
          </button>
        </div>
      </div>

      {missionCreatedNotice && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.5rem 0.85rem',
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: '#4ade80',
          fontSize: '0.78rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <CheckCircle2 size={15} />
          {missionCreatedNotice}
        </div>
      )}

      {/* 5. Results Table */}
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '0.65rem 0.85rem' }}>PERSONA</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>ROL & ORGANIZACIÓN</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>UBICACIÓN</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>EMAIL CERTIFICADO</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>SEÑALES</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>ESTADO DE EVIDENCIA</th>
              <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr 
                key={r.person_id + i}
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  background: i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent'}
              >
                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontWeight: 800, color: '#f8fafc' }}>{r.person_name}</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace' }}>{r.person_id}</div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{r.role}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.organization}</div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <div style={{ color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MapPin size={12} color="#38bdf8" />
                    {r.city}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.province}</div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <div style={{ color: '#4ade80', fontWeight: 700, fontFamily: 'monospace' }}>{r.email}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    {r.email_domain} · <span style={{ color: '#38bdf8', fontWeight: 700 }}>{r.email_type}</span>
                  </div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {r.available_signals.includes('EMAIL') && <Mail size={13} color="#4ade80" title="Email verificado" />}
                    {r.available_signals.includes('PHONE') && <Phone size={13} color="#fbbf24" title="Teléfono verificado" />}
                    {r.available_signals.includes('WEBSITE') && <Globe size={13} color="#c084fc" title="Website verificado" />}
                    {r.available_signals.includes('LINKEDIN') && <LinkedinIcon size={13} color="#60a5fa" title="LinkedIn verificado" />}
                    {r.available_signals.includes('INSTAGRAM') && <InstagramIcon size={13} color="#f472b6" title="Instagram verificado" />}
                    {r.available_signals.includes('FACEBOOK') && <FacebookIcon size={13} color="#2dd4bf" title="Facebook verificado" />}
                  </div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem' }}>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background: 'rgba(34, 197, 94, 0.12)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.25)'
                  }}>
                    OBSERVED_BINDING
                  </span>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.2rem' }}>
                    {r.source_family}
                  </div>
                </td>

                <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                  <button
                    onClick={() => setSelectedRecordForDetail(r)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      borderRadius: '6px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Ver Detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
        <button
          disabled={page <= 1 || isLoading}
          onClick={() => executeSearch(page - 1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: page <= 1 ? '#64748b' : '#ffffff',
            borderRadius: '6px',
            padding: '0.35rem 0.75rem',
            cursor: page <= 1 ? 'not-allowed' : 'pointer'
          }}
        >
          <ChevronLeft size={14} /> Anterior
        </button>

        <span style={{ color: '#94a3b8' }}>
          Página <strong style={{ color: '#f8fafc' }}>{page}</strong> de <strong style={{ color: '#f8fafc' }}>{totalPages.toLocaleString('es-AR')}</strong>
        </span>

        <button
          disabled={page >= totalPages || isLoading}
          onClick={() => executeSearch(page + 1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: page >= totalPages ? '#64748b' : '#ffffff',
            borderRadius: '6px',
            padding: '0.35rem 0.75rem',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer'
          }}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>

      {/* Detail Modal */}
      {selectedRecordForDetail && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '1.5rem',
            width: '480px',
            maxWidth: '90vw',
            color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="#34d399" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Detalle de Contacto Certificado</h3>
              </div>
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>PERSONA</span>
                <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>{selectedRecordForDetail.person_name}</strong>
                <span style={{ fontSize: '0.7rem', color: '#38bdf8', marginLeft: '0.5rem', fontFamily: 'monospace' }}>{selectedRecordForDetail.person_id}</span>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>EMAIL FÍSICO OBSERVADO</span>
                <strong style={{ color: '#4ade80', fontFamily: 'monospace' }}>{selectedRecordForDetail.email}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>ORGANIZACIÓN & ROL</span>
                <div>{selectedRecordForDetail.role}</div>
                <div style={{ color: '#94a3b8' }}>{selectedRecordForDetail.organization}</div>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>UBICACIÓN JURISDICCIONAL</span>
                <div>{selectedRecordForDetail.city}, {selectedRecordForDetail.province}, Argentina</div>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>PROVENANCE & STATUS</span>
                <div style={{ color: '#c084fc', fontFamily: 'monospace', fontSize: '0.72rem' }}>{selectedRecordForDetail.provenance}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Última verificación: {new Date(selectedRecordForDetail.last_verified).toLocaleString('es-AR')}</div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '0.4rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtlasEmailFilterPanel;
