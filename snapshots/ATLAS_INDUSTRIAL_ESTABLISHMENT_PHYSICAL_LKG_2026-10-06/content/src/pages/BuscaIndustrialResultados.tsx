import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { getEffectiveUserId } from '../lib/atlasSavedRelations';
import IndustrialGlobalHeader from '../components/IndustrialGlobalHeader';
import IndustrialDiscoveryModal from '../components/industrial/IndustrialDiscoveryModal';
import './BuscaIndustrialResultados.css';

/* ─── Icons ─────────────────────────────────────────────────────── */
const IconSearch = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
const IconMic = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={18} height={18}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconFilter = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={15} height={15}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
  </svg>
);
const IconChevronDown = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);
const IconChevronUp = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
);
const IconMapPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={13} height={13}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={12} height={12}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.338c0-1.093.86-1.988 1.95-2.021C5.335 4.282 6.5 4.25 7.5 4.25c.415 0 .802.137 1.114.378l2.036 1.628a1.5 1.5 0 01.35 1.907l-.737 1.228a.75.75 0 00.012.832c.478.718 1.061 1.36 1.737 1.897a.75.75 0 00.83.028l1.264-.707a1.5 1.5 0 011.933.404l1.49 2.114c.213.302.32.666.304 1.034-.046 1.076-.5 2.09-1.27 2.826C14.85 19.416 13.4 20 12 20c-5.523 0-10-5.477-10-10V8a2 2 0 012-2z" />
  </svg>
);
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={12} height={12}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IconGlobe = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} width={10} height={10}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const IconVerified = () => (
  <svg viewBox="0 0 24 24" fill="#3b82f6" width={15} height={15}>
    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.491 4.491 0 01-3.497-1.307 4.491 4.491 0 01-1.307-3.497A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
  </svg>
);
const IconBookmark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={14} height={14}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
  </svg>
);
const IconDots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
    <path fillRule="evenodd" d="M4.5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" clipRule="evenodd" />
  </svg>
);
const IconSave = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={14} height={14}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
  </svg>
);

/* ─── Data ───────────────────────────────────────────────────────── */
// Static RESULTS removed, using API state now

const CATEGORIAS_DATA: any[] = [];
const PROVINCIAS_DATA: any[] = [];
const TIPOS_DATA: any[] = [];
const CERTS_DATA: any[] = []; // No certifications yet


function parseWebsiteUrl(rawUrl?: string | null): { label: string; href: string } | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed || 
    trimmed === '#' || 
    trimmed.startsWith('#') || 
    trimmed.toLowerCase().includes('localhost') || 
    trimmed.toLowerCase().includes('127.0.0.1')
  ) {
    return null;
  }
  let href = trimmed;
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(href);
    if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.localhost')) {
      return null;
    }
    const label = parsed.hostname.replace(/^www\./, '');
    return { label: `www.${label}`, href: parsed.href };
  } catch {
    return null;
  }
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button className={`bir-checkbox ${checked ? 'bir-checkbox--on' : ''}`} onClick={onChange} role="checkbox" aria-checked={checked}>
      {checked && <IconCheck />}
    </button>
  );
}

type FilterItem = { label: string; count: number; checked: boolean };
function FilterSection({ title, badge, items, onToggle }: {
  title: string; badge?: number;
  items: FilterItem[]; onToggle: (i: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bir-filter-section">
      <button className="bir-filter-title" onClick={() => setOpen(o => !o)}>
        <span>{title}{badge ? <span className="bir-filter-badge">{badge}</span> : null}</span>
        {open ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
      </button>
      {open && (
        <ul className="bir-filter-list">
          {items.map((item, i) => (
            <li key={item.label} className="bir-filter-item">
              <Checkbox checked={item.checked} onChange={() => onToggle(i)} />
              <span className="bir-filter-label">{item.label}</span>
              <span className="bir-filter-count">{item.count.toLocaleString('es-MX')}</span>
            </li>
          ))}
          <li><button className="bir-filter-more">Ver más {title.toLowerCase()} <IconChevronDown size={11} /></button></li>
        </ul>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function BuscaIndustrialResultados() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get('q') || '');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const missionIdParam = searchParams.get('mission_id') || searchParams.get('missionId') || undefined;
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState(0);
  const [categorias, setCategorias] = useState(CATEGORIAS_DATA);
  const [provincias, setProvincias] = useState(PROVINCIAS_DATA);
  const [tipos, setTipos] = useState(TIPOS_DATA);
  const [certs, setCerts] = useState(CERTS_DATA);
  const [productos, setProductos] = useState<FilterItem[]>([]);
  const [roles, setRoles] = useState<FilterItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [resultsData, setResultsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [coreExistingCount, setCoreExistingCount] = useState<number | undefined>(undefined);
  const [liveTemporaryCount, setLiveTemporaryCount] = useState<number | undefined>(undefined);
  const [newCount, setNewCount] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState('Producto A–Z');
  const [catalogStats, setCatalogStats] = useState<any>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Save Search Modal state
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [targetBaseName, setTargetBaseName] = useState('');
  const [isSavingSearch, setIsSavingSearch] = useState(false);

  const { user } = useStore();
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());
  const [saveFeedbackId, setSaveFeedbackId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSaved() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const activeUserId = await getEffectiveUserId(user);

        const cacheKey = `youapp_saved_products_${activeUserId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            setSavedProductIds(new Set(JSON.parse(cached)));
          } catch {}
        }

        const res = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${activeUserId}`, {
          headers: session?.access_token ? {
            'Authorization': `Bearer ${session.access_token}`,
            'x-user-id': activeUserId
          } : {
            'x-user-id': activeUserId
          }
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.items)) {
          const ids = new Set<string>(json.items.map((it: any) => String(it.product_id)));
          setSavedProductIds(ids);
          localStorage.setItem(cacheKey, JSON.stringify(Array.from(ids)));
        }
      } catch (err) {
        console.warn('Could not load saved relations:', err);
      }
    }
    loadSaved();
  }, [user?.id]);

  const handleSaveProduct = async (r: any) => {
    const prodId = r.PRODUCT_ID || r.id;
    if (!prodId) return;

    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = await getEffectiveUserId(user);

    const isAlreadySaved = savedProductIds.has(prodId);

    if (isAlreadySaved) {
      setSaveFeedbackId(prodId);
      setToastMessage('✓ Ya guardado en Mi base');
      setTimeout(() => setSaveFeedbackId(null), 2500);
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    try {
      if (r.IS_LIVE_TEMPORARY && r.temporary_row_id && r.run_id) {
        // Save live temporary row to Mi Base via Virtual Datasets Service
        const res = await fetch(`http://localhost:5174/api/atlas/live-runs/${r.run_id}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': activeUserId
          },
          body: JSON.stringify({
            selected_row_ids: [r.temporary_row_id],
            user_id: activeUserId,
            base_name: 'Mi Base'
          })
        });
        const json = await res.json();
        if (json.success) {
          setSavedProductIds(prev => {
            const next = new Set(prev);
            next.add(prodId);
            localStorage.setItem(`youapp_saved_products_${activeUserId}`, JSON.stringify(Array.from(next)));
            return next;
          });
          setSaveFeedbackId(prodId);
          setToastMessage('✓ Guardado en Mi Base');
          setTimeout(() => setSaveFeedbackId(null), 2500);
          setTimeout(() => setToastMessage(null), 3000);
        }
      } else {
        const res = await fetch('http://localhost:5174/api/user/saved-relations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
            'x-user-id': activeUserId
          },
          body: JSON.stringify({
            product_id: prodId,
            company_id: r.COMPANY_ID,
            relation_id: r.EVIDENCE_RELATION_ID,
            base_name: 'Mi Base'
          })
        });
        const json = await res.json();
        if (json.success) {
          setSavedProductIds(prev => {
            const next = new Set(prev);
            next.add(prodId);
            localStorage.setItem(`youapp_saved_products_${activeUserId}`, JSON.stringify(Array.from(next)));
            return next;
          });
          setSaveFeedbackId(prodId);
          setToastMessage('✓ Guardado en Mi Base');
          setTimeout(() => setSaveFeedbackId(null), 2500);
          setTimeout(() => setToastMessage(null), 3000);
        }
      }
    } catch (err) {
      console.error('Error saving relation:', err);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setNetworkError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const geoParam = searchParams.get('geo') || 'ARG_CABA';

      let response: Response;
      if (missionIdParam) {
        response = await fetch(`/api/industrial/missions/${encodeURIComponent(missionIdParam)}/results?page=${page}&limit=${pageSize}&sortBy=${encodeURIComponent(sortBy)}`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
      } else {
        response = await fetch('/api/industrial-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({ query, limit: pageSize, page, sortBy, geography: geoParam })
        });
      }

      if (!response.ok) {
        throw new Error(`Error de servidor (${response.status})`);
      }
      const data = await response.json();
      if (data.results) {
        setResultsData(data.results);
      }
      if (data.totalCount !== undefined) {
        setTotalCount(data.totalCount);
      }
      if (data.objective && !query) {
        setQuery(data.objective);
        setInputValue(data.objective);
      }
      if (data.coreExistingCount !== undefined) {
        setCoreExistingCount(data.coreExistingCount);
      }
      if (data.liveTemporaryCount !== undefined) {
        setLiveTemporaryCount(data.liveTemporaryCount);
      }
      if (data.newCount !== undefined) {
        setNewCount(data.newCount);
      }
      if (data.catalogStats) {
        setCatalogStats(data.catalogStats);
      }
      if (data.facets) {
        setCategorias(data.facets.categories || []);
        setProvincias(data.facets.provinces || []);
        setTipos(data.facets.types || []);
        setRoles(data.facets.roles || []);
        setProductos(data.facets.products || []);
      }
    } catch (err: any) {
      console.error('Error fetching industrial search:', err);
      setNetworkError('No pudimos cargar los resultados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [query, page, pageSize, sortBy, missionIdParam]);

  const toggleSel = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExp = (id: string) => {
    setExpandedId(p => p === id ? null : id);
    setShowAllProducts(false); // Reset when changing row
  };

  // Filtered results memoized
  const filteredResults = useMemo(() => {
    const activeCats = new Set(categorias.filter(c => c.checked).map(c => c.label));
    const activeProvs = new Set(provincias.filter(c => c.checked).map(c => c.label));
    const activeTypes = new Set(tipos.filter(t => t.checked).map(t => t.label));
    const activeRoles = new Set(roles.filter(r => r.checked).map(r => r.label));
    const activeProds = new Set(productos.filter(c => c.checked).map(c => c.label));
    
    return resultsData.filter(r => {
      const matchCat = activeCats.size === 0 || activeCats.has(r.CATEGORY) || activeCats.has(r.CATEGORY?.split(',')[0]?.trim());
      const matchProv = activeProvs.size === 0 || activeProvs.has(r.PROVINCE);
      const matchType = activeTypes.size === 0 || activeTypes.has(r.ENTITY_TYPE);
      const matchRole = activeRoles.size === 0 || activeRoles.has(r.ROLE);
      const matchProd = activeProds.size === 0 || (r.PRODUCTS || []).some((p: any) => activeProds.has(p.name));
      return matchCat && matchProv && matchType && matchRole && matchProd;
    });
  }, [resultsData, categorias, provincias, tipos, roles, productos]);

  // Open Save Search confirmation modal
  const handleOpenSaveSearch = () => {
    const cleanQ = query.trim();
    const suggested = cleanQ ? (cleanQ.charAt(0).toUpperCase() + cleanQ.slice(1)) : 'Catálogo Industrial';
    setTargetBaseName(suggested);
    setShowSaveSearchModal(true);
  };

  // Confirm Save Search with Safety Invariant V1 (MAX_SAVE_RESULTS = 20)
  const handleConfirmSaveSearch = async () => {
    const MAX_SAVE_RESULTS = 20;
    const itemsToSave = filteredResults.slice(0, MAX_SAVE_RESULTS);
    if (itemsToSave.length === 0) return;

    setIsSavingSearch(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const activeUserId = await getEffectiveUserId(user);
      const baseNameFinal = targetBaseName.trim() || 'Mi base';

      const payloadItems = itemsToSave.map(r => ({
        product_id: r.PRODUCT_ID || r.id,
        company_id: r.COMPANY_ID || null,
        relation_id: r.EVIDENCE_RELATION_ID || null
      }));

      const res = await fetch('http://localhost:5174/api/user/saved-relations/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          'x-user-id': activeUserId
        },
        body: JSON.stringify({
          items: payloadItems,
          base_name: baseNameFinal,
          metadata: {
            original_query: query,
            filters: {
              categories: categorias.filter(c => c.checked).map(c => c.label),
              provinces: provincias.filter(p => p.checked).map(p => p.label),
              types: tipos.filter(t => t.checked).map(t => t.label),
              roles: roles.filter(r => r.checked).map(r => r.label)
            },
            sort: sortBy,
            total_results_at_save: totalCount
          }
        })
      });

      const json = await res.json();
      if (json.success) {
        setSavedProductIds(prev => {
          const next = new Set(prev);
          payloadItems.forEach(it => next.add(it.product_id));
          localStorage.setItem(`youapp_saved_products_${activeUserId}`, JSON.stringify(Array.from(next)));
          return next;
        });
        setShowSaveSearchModal(false);
        setToastMessage(json.message || `✓ ${json.savedCount} guardados en "${baseNameFinal}" (${json.duplicatesSkipped} ya existían)`);
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        setToastMessage(json.error || 'Error al guardar búsqueda');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('Error bulk saving search:', err);
      setToastMessage('Error de conexión al guardar búsqueda');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSavingSearch(false);
    }
  };

  return (
    <div className="bir-root">
      <div className="bir-bg" />

      {/* Navbar */}
      <IndustrialGlobalHeader />

      {/* Search bar */}
      <div className="bir-searchbar-wrap">
        <div className="bir-searchbar">
          <span className="bir-searchbar-icon"><IconSearch size={17} /></span>
          <input 
            className="bir-searchbar-input" 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)} 
            onKeyDown={e => { if (e.key === 'Enter') { setQuery(inputValue); setSearchParams({ q: inputValue }); } }}
          />
          {inputValue && <button className="bir-searchbar-clear" onClick={() => setInputValue('')}><IconX /></button>}
          <button className="bir-mic-btn"><IconMic /></button>
          <button className="bir-search-btn" onClick={() => { setQuery(inputValue); setPage(1); setSearchParams({ q: inputValue }); }}>Buscar</button>
        </div>
      </div>

      {/* Body */}
      <div className="bir-body">

        {/* Sidebar */}
        <aside className="bir-sidebar">
          <div className="bir-sidebar-hdr">
            <span className="bir-sidebar-title"><IconFilter /> Filtros</span>
            <button className="bir-clear-btn">Limpiar filtros</button>
          </div>
          <FilterSection title="Categoría" badge={3} items={categorias}
            onToggle={i => setCategorias(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
          <FilterSection title="Provincia" badge={2} items={provincias}
            onToggle={i => setProvincias(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
          <FilterSection title="Producto" badge={productos.length > 0 ? 1 : 0} items={productos}
            onToggle={i => setProductos(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
          <FilterSection title="Tipo de entidad" badge={1} items={tipos}
            onToggle={i => setTipos(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
          <FilterSection title="Rol industrial" items={roles}
            onToggle={i => setRoles(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
        </aside>

        {/* Main */}
        <main className="bir-main">

          {/* Results header */}
          <div className="bir-results-hdr">
            <div>
              <h1 className="bir-results-title">
                {missionIdParam ? (
                  <>Resultados del objetivo de búsqueda (Misión <em>#{missionIdParam.slice(-8)}</em>)</>
                ) : query ? (
                  <>Resultados para <em>"{query}"</em></>
                ) : (
                  <>Catálogo Industrial Completo</>
                )}
              </h1>
              <p className="bir-results-sub">
                {isLoading ? (
                  <span>Cargando resultados...</span>
                ) : networkError ? (
                  <span style={{ color: '#ef4444', fontWeight: 500 }}>
                    No pudimos cargar los resultados.
                  </span>
                ) : coreExistingCount !== undefined && liveTemporaryCount !== undefined ? (
                  <span id="bir-results-distinction" style={{ fontSize: '13px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ color: '#94a3b8' }}>En Atlas: <strong style={{ color: '#f1f5f9' }}>{coreExistingCount}</strong></span>
                    <span>·</span>
                    <span style={{ color: '#10b981' }}>Encontrados ahora: <strong style={{ color: '#34d399' }}>{liveTemporaryCount}</strong></span>
                    <span>·</span>
                    <span style={{ color: '#38bdf8' }}>Fuentes ejecutadas: <strong style={{ color: '#7dd3fc' }}>1</strong></span>
                    <span>·</span>
                    <span style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                      Cobertura: LIMITADA
                    </span>
                  </span>
                ) : (
                  <>
                    {totalCount.toLocaleString('es-MX')} resultados encontrados
                    {newCount !== undefined && newCount > 0 && newCount < totalCount && (
                      <span style={{ marginLeft: '8px', color: '#38bdf8' }}>
                        ({newCount} nuevos de esta misión + {totalCount - newCount} preexistentes reutilizados)
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="bir-results-actions">
              <button 
                type="button"
                id="bir-ampliar-base-btn"
                className="bir-expand-search-btn" 
                onClick={() => setIsDiscoveryOpen(true)}
                title="Ampliar Atlas Core: acción explícita de adquisición persistente para la base central"
              >
                <span style={{ marginRight: '4px' }}>⚡</span> Ampliar Atlas Core
              </button>
              <button 
                type="button"
                className="bir-save-search-btn" 
                onClick={handleOpenSaveSearch}
                title="Guardar los primeros 20 resultados de esta búsqueda en Mi base"
              >
                <IconSave /> Guardar búsqueda
              </button>
              <div className="bir-sort-wrap">
                <span className="bir-sort-label">Ordenar por</span>
                <select className="bir-sort-select" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
                  <option>Producto A-Z</option>
                  <option>Empresa A-Z</option>
                  <option>Provincia</option>
                  <option>Más recientes</option>
                </select>
                <IconChevronDown size={13} />
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="bir-stats-strip">
            {catalogStats ? [
              { icon: '📦', value: catalogStats.totalRelations.toLocaleString('es-MX'), label: 'Relaciones industriales' },
              { icon: '🔩', value: catalogStats.totalProducts.toLocaleString('es-MX'), label: 'Productos' },
              { icon: '🏭', value: catalogStats.totalEntities.toLocaleString('es-MX'), label: 'Empresas / Entidades' },
              { icon: '🛡️', value: `${catalogStats.constitutionalCoveragePercent || 0.50}% (${(catalogStats.certifiedRelations || 1000).toLocaleString('es-MX')})`, label: 'Cobertura Constitucional' },
              { icon: '📍', value: (catalogStats.totalProvinces || 28).toLocaleString('es-MX'), label: 'Provincias / Estados' },
            ].map(s => (
              <div key={s.label} className="bir-stat-card">
                <span className="bir-stat-ico">{s.icon}</span>
                <div>
                  <div className="bir-stat-val">{s.value}</div>
                  <div className="bir-stat-lbl">{s.label}</div>
                </div>
              </div>
            )) : [
              { icon: '📦', value: (isLoading || networkError) ? '—' : totalCount.toLocaleString('es-MX'), label: 'Resultados' },
              { icon: '🏭', value: '—', label: 'Fabricantes' },
            ].map(s => (
              <div key={s.label} className="bir-stat-card">
                <span className="bir-stat-ico">{s.icon}</span>
                <div>
                  <div className="bir-stat-val">{s.value}</div>
                  <div className="bir-stat-lbl">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bir-table">
            {/* Head */}
            <div className="bir-thead">
              <div className="bir-th bir-th-chk" />
              <div className="bir-th">Producto / Servicio</div>
              <div className="bir-th">Empresa</div>
              <div className="bir-th">Rol y Categoría</div>
              <div className="bir-th">Ubicación</div>
              <div className="bir-th">Evidencia</div>
              <div className="bir-th">Fuente</div>
              <div className="bir-th" style={{ textAlign: 'center', width: '110px' }}>Mi base</div>
            </div>

            {/* Rows */}
            {isLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Buscando resultados...</div>
            ) : (() => {
              const activeCats = new Set(categorias.filter(c => c.checked).map(c => c.label));
              const activeProvs = new Set(provincias.filter(c => c.checked).map(c => c.label));
              const activeTypes = new Set(tipos.filter(c => c.checked).map(c => c.label));
              const activeRoles = new Set(roles.filter(c => c.checked).map(c => c.label));
              const activeProds = new Set(productos.filter(c => c.checked).map(c => c.label));
              
              const filteredResults = resultsData.filter(r => {
                const matchCat = activeCats.size === 0 || activeCats.has(r.CATEGORY) || activeCats.has(r.CATEGORY?.split(',')[0]?.trim());
                const matchProv = activeProvs.size === 0 || activeProvs.has(r.PROVINCE);
                const matchType = activeTypes.size === 0 || activeTypes.has(r.ENTITY_TYPE);
                const matchRole = activeRoles.size === 0 || activeRoles.has(r.ROLE);
                const matchProd = activeProds.size === 0 || (r.PRODUCTS || []).some((p: any) => activeProds.has(p.name));
                return matchCat && matchProv && matchType && matchRole && matchProd;
              });

              if (networkError) {
                return (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: '#f87171' }}>{networkError}</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                      No se pudo conectar con el servidor Atlas. Por favor, verifica la conexión.
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchData()}
                      style={{ marginTop: '16px', padding: '8px 18px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
                    >
                      Reintentar
                    </button>
                  </div>
                );
              }

              if (filteredResults.length === 0) {
                return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No se encontraron empresas para "{query}"</div>;
              }

              return filteredResults.map(r => (
                <div key={r.id}>
                  <div
                    className={`bir-row ${selected.has(r.id) ? 'bir-row--sel' : ''} ${expandedId === r.id ? 'bir-row--expanded' : ''}`}
                    onClick={() => toggleExp(r.id)}
                  >
                  <div className="bir-td bir-td-chk" onClick={e => { e.stopPropagation(); toggleSel(r.id); }}>
                    <Checkbox checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                  </div>
                  <div className="bir-td">
                    {r.PRODUCTS && r.PRODUCTS.length > 0 ? (
                      <div className="bir-prov-name" style={{ color: '#16a34a' }}>{r.PRODUCTS[0].name}</div>
                    ) : (
                      <div className="bir-prov-name" style={{ color: '#94a3b8', fontStyle: 'italic' }}>Catálogo general</div>
                    )}
                    {r.PRODUCTS && r.PRODUCTS.length > 1 && (
                      <span className="bir-prov-type">+{r.PRODUCTS.length - 1} más</span>
                    )}
                  </div>
                  <div className="bir-td bir-td-prov">
                    <div className="bir-avatar" style={{ background: r.color || '#1e4d8c' }}>{r.initials || r.COMPANY_NAME?.substring(0,2).toUpperCase()}</div>
                    <div>
                      <div className="bir-prov-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{r.COMPANY_NAME}</span>
                        {r.IS_LIVE_TEMPORARY ? (
                          <span className="bir-badge-live" style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }}>
                            ⚡ ENCONTRADO EN VIVO
                          </span>
                        ) : (
                          <span className="bir-badge-core" style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(148, 163, 184, 0.15)',
                            color: '#94a3b8',
                            border: '1px solid rgba(148, 163, 184, 0.3)'
                          }}>
                            YA EN ATLAS
                          </span>
                        )}
                      </div>
                      <span className="bir-prov-type">{r.ENTITY_TYPE}</span>
                    </div>
                  </div>
                  <div className="bir-td bir-td-cat">
                    <div className="bir-cat-sub" style={{ fontWeight: 600, color: '#334155' }}>{r.ROLE}</div>
                    <div 
                      className="bir-cat-name" 
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                        marginTop: '4px'
                      }}
                      title={r.CATEGORY}
                    >
                      {r.CATEGORY}
                    </div>
                  </div>
                  <div className="bir-td bir-td-loc">
                    <span className="bir-loc-icon"><IconMapPin /></span>
                    <div>
                      {r.CITY && <div className="bir-loc-city">{r.CITY}</div>}
                      {r.PROVINCE && <div className="bir-loc-state">{r.PROVINCE}</div>}
                    </div>
                  </div>
                  <div className="bir-td bir-td-certs">
                    {r.IS_CONSTITUTIONAL ? (
                      <span className="bir-cert bir-cert--verified" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                        ✓ CONSTITUCIONAL
                      </span>
                    ) : r.TRUST_LEVEL === 'LEGACY' ? (
                      <span className="bir-cert bir-cert--legacy" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1' }}>
                        LEGACY
                      </span>
                    ) : (
                      <span className="bir-cert bir-cert--pending" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                        PENDIENTE
                      </span>
                    )}
                    {r.EVIDENCE_COUNT > 0 && (
                      <span className="bir-cert bir-cert--more" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggleExp(r.id); setActiveTab(1); }}>
                        Ver evidencia
                      </span>
                    )}
                  </div>
                  <div className="bir-td bir-td-source">
                    <IconGlobe size={12} />
                    <span>{r.SOURCE}</span>
                  </div>
                  <div className="bir-td bir-td-action" onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <button
                      className={`bir-save-btn ${savedProductIds.has(r.PRODUCT_ID || r.id) ? 'bir-save-btn--saved' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveProduct(r);
                      }}
                      title={savedProductIds.has(r.PRODUCT_ID || r.id) ? 'Guardado en Mi base' : 'Guardar en Mi base'}
                    >
                      {saveFeedbackId === (r.PRODUCT_ID || r.id) || savedProductIds.has(r.PRODUCT_ID || r.id) ? (
                        <>✓ Guardado</>
                      ) : (
                        <><IconBookmark size={12} /> Guardar</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {expandedId === r.id && (
                  <div className="bir-panel">
                    {/* Panel header */}
                    <div className="bir-panel-hdr">
                      <div className="bir-panel-provider">
                        <div className="bir-panel-avatar" style={{ background: r.color }}>{r.initials}</div>
                        <div>
                          <div className="bir-panel-name">
                            {r.COMPANY_NAME} {r.IS_CONSTITUTIONAL && <IconVerified />}
                          </div>
                          <div className="bir-panel-meta">
                            <span className="bir-prov-type">{r.ENTITY_TYPE}</span>
                            <span className="bir-panel-dot">·</span>
                            <span className="bir-panel-years">{r.ROLE}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bir-panel-actions">
                        <button className="bir-contact-btn"><IconMail /> Contactar proveedor</button>
                        <button 
                          className={`bir-action-btn ${savedProductIds.has(r.PRODUCT_ID || r.id) ? 'bir-action-btn--saved' : ''}`}
                          onClick={() => handleSaveProduct(r)}
                        >
                          <IconBookmark /> {saveFeedbackId === (r.PRODUCT_ID || r.id) || savedProductIds.has(r.PRODUCT_ID || r.id) ? '✓ Guardado' : 'Guardar'}
                        </button>
                        <button className="bir-action-btn bir-action-btn--icon"><IconDots /></button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="bir-tabs">
                      {['Información general', 'Evidencia'].map((tab, i) => (
                        <button key={tab} className={`bir-tab ${activeTab === i ? 'bir-tab--active' : ''}`} onClick={() => setActiveTab(i)}>
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Información general */}
                    {activeTab === 0 && (() => {
                      const isEntityConsistent = Boolean(
                        r.COMPANY_ID &&
                        r.COMPANY_METADATA_ENTITY_ID &&
                        r.COMPANY_ID === r.COMPANY_METADATA_ENTITY_ID &&
                        r.PRODUCT_ID &&
                        r.EVIDENCE_RELATION_ID
                      );

                      if (!isEntityConsistent) {
                        return (
                          <div className="bir-panel-body" style={{ padding: '24px', color: '#64748b' }}>
                            <em>Datos de la entidad no verificados o inconsistentes. Metadatos de empresa restringidos.</em>
                          </div>
                        );
                      }

                      const parsedWeb = parseWebsiteUrl(r.WEBSITE);
                      const infoItems: { ico: string; label: string; val: string; href?: string }[] = [];

                      if (r.TAX_ID && typeof r.TAX_ID === 'string' && r.TAX_ID.trim()) {
                        infoItems.push({ ico: '📋', label: 'CUIT / RFC / ID Fiscal', val: r.TAX_ID.trim() });
                      }
                      if (r.EMPLOYEE_RANGE && typeof r.EMPLOYEE_RANGE === 'string' && r.EMPLOYEE_RANGE.trim()) {
                        infoItems.push({ ico: '👥', label: 'Tamaño de la empresa', val: r.EMPLOYEE_RANGE.trim() });
                      }
                      if (parsedWeb) {
                        infoItems.push({ ico: '🌐', label: 'Sitio web', val: parsedWeb.label, href: parsedWeb.href });
                      }
                      if (r.FOUNDED_YEAR) {
                        infoItems.push({ ico: '📅', label: 'Año de fundación', val: String(r.FOUNDED_YEAR) });
                      }

                      // Extract real certifications from products and metadata
                      const certList: { code: string; desc: string }[] = [];
                      if (Array.isArray(r.CERTIFICATIONS)) {
                        r.CERTIFICATIONS.forEach((c: any) => {
                          if (typeof c === 'string' && c.trim()) certList.push({ code: c.trim(), desc: 'Certificación Oficial' });
                          else if (c && c.code) certList.push({ code: c.code, desc: c.desc || 'Certificación' });
                        });
                      }
                      (r.PRODUCTS || []).forEach((p: any) => {
                        if (p.evidence?.certificate_id && !certList.some(c => c.code === p.evidence.certificate_id)) {
                          certList.push({ code: p.evidence.certificate_id, desc: p.name });
                        }
                      });

                      // Extract real sectors / categories
                      const sectorList: string[] = [];
                      if (r.CATEGORY && typeof r.CATEGORY === 'string') {
                        r.CATEGORY.split(',').forEach((c: string) => {
                          const trimmed = c.trim();
                          if (trimmed && !sectorList.includes(trimmed)) sectorList.push(trimmed);
                        });
                      }
                      if (Array.isArray(r.SECTORS)) {
                        r.SECTORS.forEach((s: string) => {
                          if (s && typeof s === 'string' && !sectorList.includes(s.trim())) sectorList.push(s.trim());
                        });
                      }

                      const hasLeftContent = Boolean(r.DESCRIPTION || infoItems.length > 0);
                      const hasRightContent = Boolean(certList.length > 0 || sectorList.length > 0);

                      return (
                        <div className="bir-panel-body">
                          {/* Left: about + info grid */}
                          <div className="bir-panel-col bir-panel-col--left">
                            {r.DESCRIPTION && (
                              <p className="bir-about">{r.DESCRIPTION}</p>
                            )}
                            {infoItems.length > 0 && (
                              <div className="bir-info-grid">
                                {infoItems.map(item => (
                                  <div key={item.label} className="bir-info-item">
                                    <span className="bir-info-ico">{item.ico}</span>
                                    <div>
                                      <div className="bir-info-lbl">{item.label}</div>
                                      {item.href ? (
                                        <a href={item.href} target="_blank" rel="noopener noreferrer" className="bir-info-link">
                                          {item.val} ↗
                                        </a>
                                      ) : (
                                        <div className="bir-info-val">{item.val}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!hasLeftContent && (
                              <div style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', padding: '8px 0' }}>
                                Sin descripción comercial adicional registrada.
                              </div>
                            )}
                          </div>

                          {/* Mid: products */}
                          <div className="bir-panel-col bir-panel-col--mid">
                            <div className="bir-section-hdr">
                              <span>Productos principales</span>
                              <span className="bir-see-all">({(r.PRODUCTS || []).length})</span>
                            </div>
                            <div className="bir-products-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                              {(r.PRODUCTS || []).slice(0, showAllProducts ? undefined : 4).map((p: any) => (
                                <div key={p.name} className="bir-product-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                                  <div className="bir-product-img">
                                    <svg viewBox="0 0 56 56" fill="none" width={52} height={52}>
                                      <circle cx="28" cy="28" r="24" fill="#dbeafe" />
                                      <circle cx="28" cy="28" r="10" fill="none" stroke="#3b82f6" strokeWidth="2.5" />
                                      <circle cx="28" cy="28" r="4" fill="#3b82f6" />
                                    </svg>
                                  </div>
                                  <div className="bir-product-name">{p.name}</div>
                                  {p.evidence && p.evidence.url && (
                                    <a href={p.evidence.url} target="_blank" rel="noreferrer" className="bir-product-sub" style={{ color: '#3b82f6', marginTop: 'auto' }}>
                                      Ver evidencia ↗
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                            {(r.PRODUCTS || []).length > 4 && (
                              <button 
                                onClick={() => setShowAllProducts(!showAllProducts)}
                                style={{ marginTop: '12px', padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', color: '#475569', fontSize: '13px', cursor: 'pointer', width: '100%', transition: 'all 0.2s' }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                              >
                                {showAllProducts ? 'Mostrar menos' : `Mostrar más (${(r.PRODUCTS || []).length - 4})`}
                              </button>
                            )}
                          </div>

                          {/* Right: certs + sectors (strictly real, no mocks) */}
                          {hasRightContent && (
                            <div className="bir-panel-col bir-panel-col--right">
                              {certList.length > 0 && (
                                <>
                                  <div className="bir-section-hdr">
                                    <span>Certificaciones</span>
                                    <span className="bir-see-all">({certList.length})</span>
                                  </div>
                                  <div className="bir-certs-grid">
                                    {certList.map(c => (
                                      <div key={c.code} className="bir-cert-row">
                                        <span className="bir-cert-code">{c.code}</span>
                                        <span className="bir-cert-desc">{c.desc}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {sectorList.length > 0 && (
                                <>
                                  <div className="bir-section-hdr" style={{ marginTop: certList.length > 0 ? 12 : 0 }}>
                                    <span>Sectores que atiende</span>
                                  </div>
                                  <div className="bir-sectors">
                                    {sectorList.map(s => (
                                      <span key={s} className="bir-sector-tag">{s}</span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Evidencia Drawer */}
                    {activeTab === 1 && (
                      <div className="bir-panel-body" style={{ flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '15px', color: '#1e293b', marginBottom: '16px' }}>Evidencia de Productos / Servicios</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {(r.PRODUCTS || []).slice(0, showAllProducts ? undefined : 4).map((p: any, idx: number) => (
                            <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>{p.name}</div>
                                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                    <span style={{ 
                                      color: r.IS_CONSTITUTIONAL ? '#059669' : '#64748b', 
                                      fontWeight: 600,
                                      fontSize: '11px',
                                      background: r.IS_CONSTITUTIONAL ? '#ecfdf5' : '#f1f5f9',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      border: r.IS_CONSTITUTIONAL ? '1px solid #a7f3d0' : '1px solid #e2e8f0'
                                    }}>
                                      {r.IS_CONSTITUTIONAL ? 'VERIFICADO CONSTITUCIONAL' : 'REGISTRO FÍSICO LEGACY'}
                                    </span> • {p.evidence?.last_verified_at ? new Date(p.evidence.last_verified_at).toLocaleDateString() : 'Reciente'}
                                  </div>
                                </div>
                                {p.evidence?.url && (
                                  <a href={p.evidence.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500, background: '#eff6ff', padding: '6px 12px', borderRadius: '4px' }}>
                                    <IconGlobe size={14} /> Fuente Original
                                  </a>
                                )}
                              </div>
                              <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, background: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <strong>Extracto:</strong> "{p.evidence?.matched_text || 'No hay extracto disponible.'}"
                              </div>
                              <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b', display: 'flex', gap: '16px' }}>
                                <div><strong>Rol:</strong> {r.ROLE}</div>
                                <div><strong>Categoría:</strong> {r.CATEGORY}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(r.PRODUCTS || []).length > 4 && (
                          <button 
                            onClick={() => setShowAllProducts(!showAllProducts)}
                            style={{ marginTop: '16px', padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', color: '#475569', fontSize: '14px', cursor: 'pointer', alignSelf: 'flex-start' }}
                          >
                            {showAllProducts ? 'Ocultar evidencia' : `Cargar ${r.PRODUCTS.length - 4} más...`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))})()}
          </div>

          {/* Pagination */}
          {!isLoading && resultsData.length > 0 && (
            <div className="bir-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#64748b' }}>
                  Mostrar:
                </span>
                <select 
                  value={pageSize} 
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>
                {Math.min((page - 1) * pageSize + 1, totalCount)}–{Math.min(page * pageSize, totalCount)} de {totalCount.toLocaleString('es-MX')}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: page === 1 ? '#f8fafc' : 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Anterior
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * pageSize >= totalCount}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: page * pageSize >= totalCount ? '#f8fafc' : 'white', cursor: page * pageSize >= totalCount ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal Guardar Búsqueda en Mi base - Seguro V1 */}
      {showSaveSearchModal && (
        <div className="bir-modal-overlay" onClick={() => setShowSaveSearchModal(false)}>
          <div className="bir-modal-card" onClick={e => e.stopPropagation()}>
            <div className="bir-modal-hdr">
              <h3 className="bir-modal-title">Guardar búsqueda en Mi base</h3>
              <button className="bir-modal-close-btn" onClick={() => setShowSaveSearchModal(false)}>✕</button>
            </div>
            <div className="bir-modal-body">
              <div className="bir-modal-info-box">
                <div className="bir-modal-info-row">
                  <span className="bir-modal-info-label">Búsqueda:</span>
                  <span className="bir-modal-info-val">{query ? `"${query}"` : 'Catálogo general'}</span>
                </div>
                <div className="bir-modal-info-row">
                  <span className="bir-modal-info-label">Resultados encontrados:</span>
                  <span className="bir-modal-info-val">{totalCount.toLocaleString('es-MX')}</span>
                </div>
                <div className="bir-modal-info-row">
                  <span className="bir-modal-info-label">Resultados que se guardarán ahora:</span>
                  <span className="bir-modal-info-badge">{Math.min(20, filteredResults.length)}</span>
                </div>
              </div>

              <div className="bir-modal-field">
                <label className="bir-modal-field-label">Nombre de la base:</label>
                <input 
                  type="text" 
                  className="bir-modal-input" 
                  value={targetBaseName}
                  onChange={e => setTargetBaseName(e.target.value)}
                  placeholder="Ej: Válvulas, Alimentos, etc."
                />
              </div>

              <div className="bir-modal-safe-note">
                🛡️ <strong>Modo seguro V1 activo:</strong> Guarda únicamente los primeros 20 resultados visibles como referencias canónicas sin duplicar el catálogo.
              </div>
            </div>
            <div className="bir-modal-footer">
              <button 
                type="button" 
                className="bir-modal-btn-cancel" 
                onClick={() => setShowSaveSearchModal(false)}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="bir-modal-btn-confirm" 
                onClick={handleConfirmSaveSearch}
                disabled={isSavingSearch || filteredResults.length === 0}
              >
                {isSavingSearch ? 'Guardando...' : `Guardar estos ${Math.min(20, filteredResults.length)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {toastMessage && (
        <div className="bir-toast-feedback">
          <IconBookmark size={15} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Discovery Mission Modal */}
      <IndustrialDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        initialObjective={query}
        onNavigateToResults={(mId) => {
          setSearchParams({ mission_id: mId });
        }}
      />
    </div>
  );
}
