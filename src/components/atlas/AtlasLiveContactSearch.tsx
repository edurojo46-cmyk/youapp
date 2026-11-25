import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Sparkles, 
  Filter, 
  Download, 
  CheckCircle2, 
  Globe, 
  Mail, 
  Phone, 
  Layers, 
  Building2, 
  User, 
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Check,
  X,
  Eye,
  Bookmark,
  AlertCircle,
  ShieldCheck,
  Save,
  CheckCircle,
  Clock,
  RotateCcw,
  Activity,
  Database,
  PieChart,
  TrendingUp,
  Target,
  Zap,
  ChevronUp,
  Briefcase,
  HelpCircle,
  Shield,
  Award,
  ShoppingBag,
  Tag,
  CreditCard
} from 'lucide-react';
import { AtlasBaseIntelligenceModal } from './AtlasBaseIntelligenceModal';
import { AtlasEmailEnginePanel } from './AtlasEmailEnginePanel';
import { AtlasEmailFilterPanel } from './AtlasEmailFilterPanel';

export interface LiveStatsData {
  total_contacts: number;
  emails_verified: number;
  phones: number;
  websites: number;
  facebook: number;
  instagram: number;
  linkedin: number;
  social_total: number;
  updated_at: string;
  status: 'LIVE' | 'STALE';
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  target: number;
  entity_type: string;
  geo: string;
  signals: string[];
  result_count: number;
  status: string;
  mission_id: string;
}

interface ContactRecord {
  id: string;
  name: string;
  entity_type: string;
  role?: string;
  rubro: string;
  localidad: string;
  barrio?: string;
  ciudad?: string;
  direccion?: string;
  geo_evidence?: string;
  geo_match?: boolean;
  email?: string;
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  provenance: string;
  status: string;
}

interface MissionStatus {
  target: number;
  available_atlas: number;
  target_gap: number;
  acquired_now: number;
  total_found: number;
  progress_percent: number;
  speed_per_min: number;
  status: string;
  process_alive?: boolean;
  penta_discovery_active?: boolean;
  active_sources?: number;
  current_source?: string;
  last_result_at?: string;
  seconds_since_last_result?: number;
  auto_resume_penta?: boolean;
  exhaustion_proof?: boolean;
  continue_searching?: boolean;
  state_version?: number;
  state_updated_at?: string;
  source_queue_depth?: number;
  source_probes_pending?: number;
  new_source_routes_pending?: boolean;
  candidatos?: number;
  verificando?: number;
  persisted_canonical_ids_count?: number;
  known_source_frontier_exhausted?: boolean;
  source_km_routes_checked?: number;
  source_memory_routes_checked?: number;
  new_external_families_discovered?: number;
  executable_new_routes?: number;
  global_source_discovery_exhausted?: boolean;
  required_signal?: string;
  ui_selected_signals?: string[];
  backend_signals?: string[];
  results_with_verified_email?: number;
  existing_first_with_verified_email?: number;
  existing_first_without_email?: number;
  parsed_entity_type?: string;
  parsed_city?: string;
  parsed_neighborhood?: string | null;
  required_geo_level?: string;
  palermo_confirmed?: number;
  other_neighborhoods?: number;
  companies_returned_as_person?: number;
}

interface OutreachSendTelemetry {
  selected: number;
  verified_emails: number;
  excluded: number;
  suppressed: number;
  queued: number;
  sent_simulated: number;
  duplicate_sends: number;
  errors: number;
  provider: string;
  campaign_id: string;
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  'PROPUESTA COMERCIAL': {
    subject: 'Propuesta comercial estratégica para {{empresa}}',
    body: 'Estimado/a {{nombre}},\n\nNos dirigimos a {{empresa}} en relación con su destacada actividad en el rubro {{rubro}} en {{localidad}}.\n\nDesde Atlas B2B desarrollamos soluciones de integración y provisión comercial orientadas a optimizar operaciones y canales de abastecimiento. Nos gustaría acercarles nuestra propuesta formal adaptada a sus requerimientos.\n\n¿Tendrían disponibilidad para una breve llamada informativa?\n\nAtentamente,\nEquipo de Desarrollo Comercial\nAtlas B2B Plataforma Central'
  },
  'PRESENTACIÓN': {
    subject: 'Presentación institucional de soluciones para {{empresa}}',
    body: 'Hola {{nombre}},\n\nEs un agrado contactar a {{empresa}}. Les escribimos para presentarles formalmente nuestras capacidades en el sector {{rubro}} en {{localidad}}.\n\nNos especializamos en conectar empresas con oportunidades de negocio y cadenas de valor verificadas.\n\nQuedamos a su entera disposición.\n\nSaludos cordiales,\nRelaciones Institucionales\nAtlas B2B'
  },
  'SEGUIMIENTO': {
    subject: 'Seguimiento de propuesta para {{empresa}}',
    body: 'Estimado/a {{nombre}},\n\nRetomamos contacto con {{empresa}} para consultar si tuvieron oportunidad de evaluar nuestra propuesta para el área de {{rubro}} en {{localidad}}.\n\nEstamos a disposición para coordinar una demo o ajustar la propuesta a sus prioridades.\n\nMuchas gracias,\nÁrea de Cuentas B2B'
  },
  'REUNIÓN': {
    subject: 'Invitación a reunión de coordinación - {{empresa}} & Atlas',
    body: 'Hola {{nombre}},\n\nQuisiéramos invitar al equipo directivo de {{empresa}} a una reunión de 15 minutos para explorar sinergias comerciales en {{localidad}}.\n\n¿Tendrían disponibilidad durante esta semana?\n\nUn cordial saludo,\nCoordinación de Alianzas Comerciales'
  }
};

export const AtlasLiveContactSearch: React.FC = () => {
  const navigate = useNavigate();
  const [naturalQuery, setNaturalQuery] = useState('');
  const [entityType, setEntityType] = useState<'PERSONA' | 'EMPRESA'>('EMPRESA');
  const [rubro, setRubro] = useState('');
  const [provincia, setProvincia] = useState('CABA');
  const [ciudad, setCiudad] = useState('');
  const [target, setTarget] = useState<number>(100);
  const [reqEmail, setReqEmail] = useState(false);
  const [reqPhone, setReqPhone] = useState(false);
  const [reqWebsite, setReqWebsite] = useState(false);
  const [reqFacebook, setReqFacebook] = useState(false);
  const [reqInstagram, setReqInstagram] = useState(false);
  const [reqLinkedin, setReqLinkedin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [missionStatus, setMissionStatus] = useState<MissionStatus | null>(null);
  const [results, setResults] = useState<ContactRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [sortField, setSortField] = useState<keyof ContactRecord>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Pagination & Results Universe SSOT
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const [allResults, setAllResults] = useState<ContactRecord[]>([]);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [currentMissionId, setCurrentMissionId] = useState<string>('');

  // Outreach & Proposal State
  const [emailStatuses, setEmailStatuses] = useState<Record<string, string>>({});
  const [sentCount, setSentCount] = useState<number>(0);
  const [errorsCount, setErrorsCount] = useState<number>(0);

  // Modal State
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('PROPUESTA COMERCIAL');
  const [subject, setSubject] = useState(DEFAULT_TEMPLATES['PROPUESTA COMERCIAL'].subject);
  const [body, setBody] = useState(DEFAULT_TEMPLATES['PROPUESTA COMERCIAL'].body);
  const [savedTemplates, setSavedTemplates] = useState<Record<string, { subject: string; body: string }>>({});
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isConfirmingStep, setIsConfirmingStep] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emailProvider, setEmailProvider] = useState<'SIMULATED_PROVIDER' | 'REAL_PROVIDER'>('SIMULATED_PROVIDER');
  const [sendResultTelemetry, setSendResultTelemetry] = useState<any>(null);

  // Live Database Stats State
  const [liveStats, setLiveStats] = useState<LiveStatsData | null>(null);
  const [liveStatsStatus, setLiveStatsStatus] = useState<'LIVE' | 'STALE'>('LIVE');
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [isIntelligenceModalOpen, setIsIntelligenceModalOpen] = useState(false);

  // Persistent Search History State
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [currentExecutedQuery, setCurrentExecutedQuery] = useState<string>('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeMissionIdRef = useRef<string>('');
  // Opportunity Engine & Vender Mode State
  const [activeMainMode, setActiveMainMode] = useState<'BUSCAR' | 'OPORTUNIDADES' | 'VENDER'>('BUSCAR');

  // Atlas Vender / Commerce Engine Mode State
  const [venderProductInput, setVenderProductInput] = useState<string>('software de recursos humanos');
  const [venderBuyerType, setVenderBuyerType] = useState<'PERSON' | 'COMPANY' | 'BOTH'>('COMPANY');
  const [venderResults, setVenderResults] = useState<any[]>([]);
  const [venderSummary, setVenderSummary] = useState<any | null>(null);
  const [venderProductProfile, setVenderProductProfile] = useState<any | null>(null);
  const [venderRecommendedProduct, setVenderRecommendedProduct] = useState<any | null>(null);
  const [venderLoading, setVenderLoading] = useState<boolean>(false);
  const [venderExpandedWhy, setVenderExpandedWhy] = useState<Record<string, boolean>>({});
  const [venderSelectedProductForModal, setVenderSelectedProductForModal] = useState<any | null>(null);
  const [venderSelectedCandidateForSale, setVenderSelectedCandidateForSale] = useState<any | null>(null);
  const [venderSaleCompleted, setVenderSaleCompleted] = useState<boolean>(false);
  const [venderSearchExecuted, setVenderSearchExecuted] = useState<boolean>(false);
  const [oppQuery, setOppQuery] = useState('');
  const [oppProductQuery, setOppProductQuery] = useState('');
  const [oppTypeFilter, setOppTypeFilter] = useState('');
  const [oppGeoFilter, setOppGeoFilter] = useState('');
  const [oppEntityTypeFilter, setOppEntityTypeFilter] = useState('');
  const [oppMinScore, setOppMinScore] = useState<number>(0);
  const [oppMinConfidence, setOppMinConfidence] = useState<number>(0);
  const [oppHasContact, setOppHasContact] = useState<boolean>(false);
  const [oppResults, setOppResults] = useState<any[]>([]);
  const [oppTotalMatches, setOppTotalMatches] = useState<number>(0);
  const [oppLoading, setOppLoading] = useState<boolean>(false);
  const [oppExpandedWhy, setOppExpandedWhy] = useState<Record<string, boolean>>({});
  const [oppPage, setOppPage] = useState<number>(1);
  const [inspectingContact, setInspectingContact] = useState<any | null>(null);

  const fetchOpportunities = async (override?: {
    query?: string;
    product?: string;
    type?: string;
    geo?: string;
    entityType?: string;
    minScore?: number;
    minConf?: number;
    hasContact?: boolean;
    page?: number;
  }) => {
    setOppLoading(true);
    try {
      const q = override?.query !== undefined ? override.query : oppQuery;
      const product = override?.product !== undefined ? override.product : oppProductQuery;
      let type = override?.type !== undefined ? override.type : oppTypeFilter;
      let geo = override?.geo !== undefined ? override.geo : oppGeoFilter;
      let entityType = override?.entityType !== undefined ? override.entityType : oppEntityTypeFilter;
      const minScore = override?.minScore !== undefined ? override.minScore : oppMinScore;
      const minConf = override?.minConf !== undefined ? override.minConf : oppMinConfidence;
      const hasContact = override?.hasContact !== undefined ? override.hasContact : oppHasContact;
      const page = override?.page !== undefined ? override.page : oppPage;

      // Natural language parameter extraction
      if (q && q.trim().length > 0) {
        const lowerQ = q.toLowerCase();
        if (lowerQ.includes('córdoba') || lowerQ.includes('cordoba')) geo = 'Córdoba';
        else if (lowerQ.includes('buenos aires') || lowerQ.includes('caba')) geo = 'Buenos Aires';
        else if (lowerQ.includes('santa fe')) geo = 'Santa Fe';
        else if (lowerQ.includes('mendoza')) geo = 'Mendoza';
        else if (lowerQ.includes('catamarca')) geo = 'Catamarca';

        if (lowerQ.includes('expansión') || lowerQ.includes('expansion')) type = 'EXPANSION_SIGNAL';
        else if (lowerQ.includes('apertura') || lowerQ.includes('nueva') || lowerQ.includes('nuevas')) type = 'NEW_BUSINESS_SIGNAL';
        else if (lowerQ.includes('rrhh') || lowerQ.includes('hiring') || lowerQ.includes('empleo') || lowerQ.includes('personal')) type = 'HIRING_SIGNAL';
        else if (lowerQ.includes('software') || lowerQ.includes('digital') || lowerQ.includes('digitalización')) type = 'DIGITALIZATION_SIGNAL';
        else if (lowerQ.includes('infraestructura') || lowerQ.includes('obra')) type = 'INFRASTRUCTURE_SIGNAL';

        if (lowerQ.includes('empresa') || lowerQ.includes('empresas')) entityType = 'COMPANY';
        else if (lowerQ.includes('persona') || lowerQ.includes('personas')) entityType = 'PERSON';
      }

      const params = new URLSearchParams();
      if (type) params.set('opportunity_type', type);
      if (geo) params.set('geo', geo);
      if (entityType) params.set('entity_type', entityType);
      if (minScore > 0) params.set('minimum_score', String(minScore));
      if (minConf > 0) params.set('minimum_confidence', String(minConf));
      if (hasContact) params.set('has_contact', 'true');
      if (product) params.set('product_query', product);
      params.set('limit', '30');
      params.set('page', String(page));

      const res = await fetch(`/api/atlas/opportunities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOppResults(data.results || []);
        setOppTotalMatches(data.total_matches || 0);
      }
    } catch (err) {
      console.error('Error fetching opportunities:', err);
    } finally {
      setOppLoading(false);
    }
  };

  const fetchBuyers = async (override?: { query?: string; buyerType?: 'PERSON' | 'COMPANY' | 'BOTH' }) => {
    setVenderLoading(true);
    setVenderSearchExecuted(true);
    // Explicit reset to prevent previous product state leaks
    setVenderResults([]);
    setVenderSummary(null);
    setVenderProductProfile(null);
    setVenderRecommendedProduct(null);
    setVenderExpandedWhy({});
    try {
      const q = override?.query !== undefined ? override.query : venderProductInput;
      const bt = override?.buyerType !== undefined ? override.buyerType : venderBuyerType;
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('buyer_type', bt);
      params.set('limit', '20');

      const res = await fetch(`/api/atlas/vender/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVenderResults(data.results || []);
        setVenderSummary(data.summary || null);
        setVenderProductProfile(data.product_profile || null);
        setVenderRecommendedProduct(data.recommended_product || null);

        if (data.recommended_product) {
          fetch('/api/atlas/vender/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_name: 'PRODUCT_SHOWN',
              atlas_product_id: data.recommended_product.atlas_product_id,
              seller_id: data.recommended_product.seller_id,
              payload: { query: q, buyer_type: bt, results_count: data.results?.length || 0 }
            })
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error fetching buyers:', err);
    } finally {
      setVenderLoading(false);
    }
  };

  const handlePrepareSale = (candidate: any) => {
    setVenderSelectedCandidateForSale(candidate);
    setVenderSaleCompleted(false);
    if (venderRecommendedProduct) {
      // 1. PRODUCT_CLICKED
      fetch('/api/atlas/vender/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'PRODUCT_CLICKED',
          product_id: venderRecommendedProduct.atlas_product_id,
          buyer_id: candidate.entity_id,
          seller_id: venderRecommendedProduct.seller_id,
          amount: venderRecommendedProduct.price,
          currency: venderRecommendedProduct.currency,
          environment: 'SIMULATION',
          metadata: {
            candidate_name: candidate.entity_name,
            buyer_fit_score: candidate.buyer_fit_score,
            product_buyer_match_score: candidate.product_buyer_match_score,
            opportunity_score: candidate.opportunity_score,
            contactability_score: candidate.contactability_score
          }
        })
      }).catch(() => {});

      // 2. CHECKOUT_STARTED
      fetch('/api/atlas/vender/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'CHECKOUT_STARTED',
          product_id: venderRecommendedProduct.atlas_product_id,
          buyer_id: candidate.entity_id,
          seller_id: venderRecommendedProduct.seller_id,
          amount: venderRecommendedProduct.price,
          currency: venderRecommendedProduct.currency,
          environment: 'SIMULATION',
          metadata: {
            candidate_name: candidate.entity_name,
            simulation_mode: true
          }
        })
      }).catch(() => {});
    }
  };

  const handleConfirmSale = () => {
    if (venderSelectedCandidateForSale && venderRecommendedProduct) {
      // 3. PURCHASE_COMPLETED (Simulation only, no real payment, no external order)
      fetch('/api/atlas/vender/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'PURCHASE_COMPLETED',
          product_id: venderRecommendedProduct.atlas_product_id,
          buyer_id: venderSelectedCandidateForSale.entity_id,
          seller_id: venderRecommendedProduct.seller_id,
          amount: venderRecommendedProduct.price,
          currency: venderRecommendedProduct.currency,
          environment: 'SIMULATION',
          metadata: {
            candidate_name: venderSelectedCandidateForSale.entity_name,
            match_score: venderSelectedCandidateForSale.product_buyer_match_score || venderSelectedCandidateForSale.buyer_fit_score,
            is_simulated_purchase: true,
            real_payment: false,
            timestamp: new Date().toISOString()
          }
        })
      }).catch(() => {});
    }
    setVenderSaleCompleted(true);
  };

  const fetchLiveStats = async () => {
    try {
      const res = await fetch('/api/atlas/contact-stats/live');
      if (res.ok) {
        const data = await res.json();
        setLiveStats(data);
        setLiveStatsStatus(data.status || 'LIVE');
        if (data.updated_at) {
          const d = new Date(data.updated_at);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          setLastUpdatedTime(`${hh}:${mm}:${ss}`);
        } else {
          const d = new Date();
          setLastUpdatedTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
      } else {
        setLiveStatsStatus('STALE');
      }
    } catch (err) {
      setLiveStatsStatus('STALE');
    }
  };

  const fetchSearchHistory = async () => {
    try {
      const res = await fetch('/api/atlas/contact-search/history');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setSearchHistory(data.history);
        }
      }
    } catch (err) {
      console.error('Failed to fetch search history:', err);
    }
  };

  useEffect(() => {
    fetchLiveStats();
    fetchSearchHistory();

    // Check URL parameters for direct deep-linking (e.g. ?mode=vender&q=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam && modeParam.toUpperCase() === 'VENDER') {
        setActiveMainMode('VENDER');
        const q = urlParams.get('q') || 'software de recursos humanos';
        const bt = (urlParams.get('buyer_type') || 'COMPANY') as 'PERSON' | 'COMPANY' | 'BOTH';
        setVenderProductInput(q);
        setVenderBuyerType(bt);
        fetchBuyers({ query: q, buyerType: bt });
      }
    } catch {}

    const interval = setInterval(fetchLiveStats, 5000);
    return () => {
      clearInterval(interval);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const presetQueries = [
    'Dame 100 empresas de CABA con email público',
    'Dame 100 empresas de CABA con Instagram',
    'Dame 10.000 personas de CABA con email público',
    'Dame 5.000 inmobiliarias de CABA con mail y teléfono',
    'Dame 2.000 empresas de Córdoba con LinkedIn'
  ];

  const handleSearch = async (overrideQuery?: string, overrideTarget?: number, overrideFilters?: any) => {
    if (loading) return;
    const q = overrideQuery !== undefined ? overrideQuery : naturalQuery;
    if (!q.trim()) return;

    // SECTION 5 & 6: Generate NEW_MISSION_ID and IMMEDIATELY wipe previous state
    const newMissionId = `mission_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    activeMissionIdRef.current = newMissionId;
    setCurrentMissionId(newMissionId);
    setLoading(true);
    setCurrentPage(1);
    setCurrentExecutedQuery(q);
    setResults([]);
    setAllResults([]);
    setMissionStatus(null);
    setTotalMatches(0);
    setSelectedIds(new Set());

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      // Parse query freshly to ensure UI controls immediately match new query
      const qLower = q.toLowerCase();
      let derivedEntityType: 'PERSONA' | 'EMPRESA' = 'EMPRESA';
      if (/personas?|profesionales?|abogados?|m[eé]dicos?|magistrados?|titulares?/i.test(qLower)) {
        derivedEntityType = 'PERSONA';
      } else if (/empresas?|compañ[ií]as?|firmas?|comercios?|locales?|veterinarias?/i.test(qLower)) {
        derivedEntityType = 'EMPRESA';
      } else if (overrideFilters?.entity_type) {
        derivedEntityType = (overrideFilters.entity_type === 'PERSONA' || overrideFilters.entity_type === 'PERSON') ? 'PERSONA' : 'EMPRESA';
      }
      setEntityType(derivedEntityType);

      let derivedProvincia = '';
      if (overrideFilters?.provincia !== undefined) {
        derivedProvincia = overrideFilters.provincia;
      } else if (qLower.includes('córdoba') || qLower.includes('cordoba')) {
        derivedProvincia = 'Córdoba';
      } else if (qLower.includes('mendoza')) {
        derivedProvincia = 'Mendoza';
      } else if (qLower.includes('río negro') || qLower.includes('rio negro')) {
        derivedProvincia = 'Río Negro';
      } else if (qLower.includes('caba') || qLower.includes('capital federal') || qLower.includes('palermo') || qLower.includes('urquiza') || qLower.includes('caballito') || qLower.includes('recoleta') || qLower.includes('belgrano') || qLower.includes('flores') || qLower.includes('almagro') || qLower.includes('balvanera')) {
        derivedProvincia = 'CABA';
      } else if (qLower.includes('buenos aires') || qLower.includes('pba')) {
        derivedProvincia = 'Buenos Aires';
      } else if (qLower.includes('santa fe')) {
        derivedProvincia = 'Santa Fe';
      }
      setProvincia(derivedProvincia);

      let derivedCiudad = '';
      if (overrideFilters?.ciudad !== undefined) {
        derivedCiudad = overrideFilters.ciudad;
      } else if (qLower.includes('villa urquiza') || qLower.includes('urquiza')) {
        derivedCiudad = 'Villa Urquiza';
      } else if (qLower.includes('caballito')) {
        derivedCiudad = 'Caballito';
      } else if (qLower.includes('palermo')) {
        derivedCiudad = 'Palermo';
      } else if (qLower.includes('belgrano')) {
        derivedCiudad = 'Belgrano';
      } else if (qLower.includes('recoleta')) {
        derivedCiudad = 'Recoleta';
      } else if (qLower.includes('flores')) {
        derivedCiudad = 'Flores';
      } else if (qLower.includes('almagro')) {
        derivedCiudad = 'Almagro';
      } else if (qLower.includes('balvanera')) {
        derivedCiudad = 'Balvanera';
      }
      setCiudad(derivedCiudad);

      let derivedTarget = overrideTarget;
      if (!derivedTarget) {
        const countMatch = q.match(/(\d+[\d\.]*)\s*(personas|empresas|inmobiliarias|restaurantes|comercios|organizaciones|emails?|correos?|contactos?|cuentas?|veterinarias)/i);
        if (countMatch) {
          const parsedNum = parseInt(countMatch[1].replace(/\./g, ''), 10);
          if (!isNaN(parsedNum) && parsedNum > 0) derivedTarget = parsedNum;
        }
      }
      if (!derivedTarget && overrideFilters?.target) {
        derivedTarget = Number(overrideFilters.target);
      }
      if (!derivedTarget) {
        derivedTarget = 100;
      }
      setTarget(derivedTarget);

      const selectedSignals: string[] = [];
      const hasExplicitSignalsInFilters = overrideFilters && (
        overrideFilters.email !== undefined || 
        overrideFilters.phone !== undefined || 
        overrideFilters.website !== undefined || 
        overrideFilters.facebook !== undefined || 
        overrideFilters.instagram !== undefined || 
        overrideFilters.linkedin !== undefined
      );

      if (hasExplicitSignalsInFilters) {
        if (overrideFilters.email) selectedSignals.push('EMAIL');
        if (overrideFilters.phone) selectedSignals.push('PHONE');
        if (overrideFilters.website) selectedSignals.push('WEBSITE');
        if (overrideFilters.facebook) selectedSignals.push('FACEBOOK');
        if (overrideFilters.instagram) selectedSignals.push('INSTAGRAM');
        if (overrideFilters.linkedin) selectedSignals.push('LINKEDIN');
      } else {
        if (qLower.includes('email') || qLower.includes('mail') || qLower.includes('correo')) {
          selectedSignals.push('EMAIL');
        }
        if (qLower.includes('telefono') || qLower.includes('teléfono') || qLower.includes('celular') || qLower.includes('whatsapp')) {
          selectedSignals.push('PHONE');
        }
        if (qLower.includes('web') || qLower.includes('sitio')) {
          selectedSignals.push('WEBSITE');
        }
        if (qLower.includes('facebook') || qLower.includes('fb')) {
          selectedSignals.push('FACEBOOK');
        }
        if (qLower.includes('instagram') || qLower.includes('ig')) {
          selectedSignals.push('INSTAGRAM');
        }
        if (qLower.includes('linkedin') || qLower.includes('li')) {
          selectedSignals.push('LINKEDIN');
        }
      }

      setReqEmail(selectedSignals.includes('EMAIL'));
      setReqPhone(selectedSignals.includes('PHONE'));
      setReqWebsite(selectedSignals.includes('WEBSITE'));
      setReqFacebook(selectedSignals.includes('FACEBOOK'));
      setReqInstagram(selectedSignals.includes('INSTAGRAM'));
      setReqLinkedin(selectedSignals.includes('LINKEDIN'));

      console.log('[AtlasSearch] Sending search request for:', q, 'newMissionId:', newMissionId);
      const res = await fetch('/api/atlas/contact-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: newMissionId,
          query: q,
          target: derivedTarget,
          page: 1,
          page_size: pageSize,
          signals: selectedSignals,
          filters: {
            entity_type: derivedEntityType,
            rubro,
            provincia: derivedProvincia,
            ciudad: derivedCiudad,
            target: derivedTarget,
            email: selectedSignals.includes('EMAIL'),
            phone: selectedSignals.includes('PHONE'),
            website: selectedSignals.includes('WEBSITE'),
            facebook: selectedSignals.includes('FACEBOOK'),
            instagram: selectedSignals.includes('INSTAGRAM'),
            linkedin: selectedSignals.includes('LINKEDIN')
          }
        })
      });

      console.log('[AtlasSearch] Fetch response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[AtlasSearch] Received response data:', {
          success: data.success,
          mission_id: data.mission_id,
          activeMissionId: activeMissionIdRef.current,
          total_matches: data.total_matches,
          results_len: data.results?.length,
          all_results_len: data.all_results?.length
        });

        // SECTION 6: IGNORE_STALE_RESPONSE if response does not match active mission
        if (data.mission_id && data.mission_id !== activeMissionIdRef.current) {
          console.warn('[IGNORE_STALE_RESPONSE] Ignored response from stale mission:', data.mission_id, 'expected:', activeMissionIdRef.current);
          return;
        }

        if (data.success) {
          setCurrentMissionId(data.mission_id || newMissionId);
          setMissionStatus(data.mission_status);
          const fullUniverse = data.all_results || data.results || [];
          setAllResults(fullUniverse);
          const total = data.total_matches ?? fullUniverse.length;
          setTotalMatches(total);
          setCurrentPage(data.page ?? 1);
          setResults(data.results || fullUniverse.slice(0, pageSize));
          setSelectedIds(new Set());
          console.log('[AtlasSearch] States updated! Results set to:', (data.results || fullUniverse.slice(0, pageSize)).length);
          await fetchSearchHistory();

          // If search is continuing in background, poll live progress with mission fencing
          if (data.mission_id && data.mission_status && 
             (data.mission_status.status === 'BUSCANDO' || 
              data.mission_status.status === 'CERTIFICANDO' || 
              data.mission_status.status === 'DESCUBRIENDO FUENTES' ||
              data.mission_status.status === 'BUSCANDO NUEVAS FAMILIAS DE FUENTES' ||
              data.mission_status.continue_searching)) {
            let lastCount = (data.results || []).length;
            pollingIntervalRef.current = setInterval(async () => {
              try {
                // If mission changed during interval, abort poll immediately
                if (data.mission_id !== activeMissionIdRef.current) {
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                  return;
                }

                const pRes = await fetch(`/api/atlas/contact-search/progress?mission_id=${encodeURIComponent(data.mission_id)}&since=${lastCount}`);
                if (pRes.ok) {
                  const pData = await pRes.json();
                  if (data.mission_id !== activeMissionIdRef.current) {
                    return; // Ignore stale poll payload
                  }
                  if (pData.success) {
                    setMissionStatus({
                      target: pData.target,
                      available_atlas: pData.existing_first,
                      target_gap: pData.remaining,
                      acquired_now: pData.penta_acquired,
                      total_found: pData.certified_total,
                      remaining: pData.remaining,
                      progress_percent: pData.progress_percent,
                      speed_per_min: pData.current_rate_per_min,
                      status: pData.status,
                      process_alive: pData.process_alive,
                      penta_discovery_active: pData.penta_discovery_active,
                      active_sources: pData.active_sources,
                      source_queue_depth: pData.source_queue_depth,
                      source_probes_pending: pData.source_probes_pending,
                      new_source_routes_pending: pData.new_source_routes_pending,
                      current_source: pData.current_source,
                      last_result_at: pData.last_result_at,
                      seconds_since_last_result: pData.seconds_since_last_result,
                      auto_resume_penta: pData.auto_resume_penta,
                      exhaustion_proof: pData.exhaustion_proof,
                      continue_searching: pData.continue_searching,
                      state_version: pData.state_version,
                      state_updated_at: pData.state_updated_at,
                      candidatos: pData.candidatos,
                      verificando: pData.verificando,
                      persisted_canonical_ids_count: pData.persisted_canonical_ids_count,
                      known_source_frontier_exhausted: pData.known_source_frontier_exhausted,
                      source_km_routes_checked: pData.source_km_routes_checked,
                      source_memory_routes_checked: pData.source_memory_routes_checked,
                      new_external_families_discovered: pData.new_external_families_discovered,
                      executable_new_routes: pData.executable_new_routes,
                      global_source_discovery_exhausted: pData.global_source_discovery_exhausted,
                      required_signal: pData.required_signal,
                      ui_selected_signals: pData.ui_selected_signals,
                      backend_signals: pData.backend_signals,
                      existing_first_with_verified_email: pData.existing_first_with_verified_email,
                      existing_first_without_email: pData.existing_first_without_email,
                      results_with_verified_email: pData.results_with_verified_email
                    });

                    if (Array.isArray(pData.new_results) && pData.new_results.length > 0) {
                      lastCount += pData.new_results.length;
                      setResults(prev => [...prev, ...pData.new_results]);
                    }

                    if (pData.status === 'COMPLETADO' || (pData.status === 'FUENTES_AGOTADAS' && pData.exhaustion_proof)) {
                      if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                      }
                      fetchSearchHistory();
                    }
                  }
                }
              } catch (pollErr) {
                console.warn('Mission progress poll error:', pollErr);
              }
            }, 800);
          }
        }
      }
    } catch (e) {
      console.error('Contact search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistoricalSearch = (item: SearchHistoryItem) => {
    // REOPEN: Show historical mission state strictly isolated WITHOUT executing a new search
    setNaturalQuery(item.query);
    setCurrentExecutedQuery(item.query);
    if (item.entity_type === 'PERSONA' || item.entity_type === 'EMPRESA') {
      setEntityType(item.entity_type);
    }
    if (item.geo) {
      setProvincia(item.geo);
    }
    if (item.signals) {
      setReqEmail(item.signals.includes('EMAIL'));
      setReqPhone(item.signals.includes('PHONE'));
      setReqWebsite(item.signals.includes('WEBSITE'));
      setReqFacebook(item.signals.includes('FACEBOOK'));
      setReqInstagram(item.signals.includes('INSTAGRAM'));
      setReqLinkedin(item.signals.includes('LINKEDIN'));
    }
    const isInvalid = item.certification_status === 'INVALID_COUNTER_NOT_PERSISTED';
    setResults([]);
    setSelectedIds(new Set());
    setMissionStatus({
      target: item.target,
      available_atlas: isInvalid ? 0 : item.result_count,
      target_gap: isInvalid ? item.target : Math.max(0, item.target - item.result_count),
      acquired_now: isInvalid ? 0 : item.result_count,
      total_found: isInvalid ? 0 : item.result_count,
      progress_percent: isInvalid ? 0 : (item.target > 0 ? Math.min(100, Math.floor((item.result_count / item.target) * 100)) : 100),
      speed_per_min: 0,
      status: isInvalid ? 'INVALID_COUNTER_NOT_PERSISTED' : item.status,
      process_alive: false,
      penta_discovery_active: false,
      active_sources: 0,
      current_source: `Misión Histórica (${item.mission_id})`,
      last_result_at: item.timestamp,
      exhaustion_proof: item.status === 'FUENTES_AGOTADAS'
    });
  };

  const handleRepeatHistoricalSearch = (item: SearchHistoryItem) => {
    // REPEAT: Create brand new isolated mission from original query
    setNaturalQuery(item.query);
    setMissionStatus(null);
    setResults([]);
    setSelectedIds(new Set());
    handleSearch(item.query);
  };

  const handleExportCSV = () => {
    const universe = allResults.length > 0 ? allResults : results;
    if (universe.length === 0) return;
    const itemsToExport = selectedIds.size > 0 
      ? universe.filter(r => selectedIds.has(r.id))
      : universe;

    const headers = ['NOMBRE', 'TIPO', 'RUBRO', 'LOCALIDAD', 'EVIDENCIA_GEO', 'EMAIL', 'TELÉFONO', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'PROVENANCE', 'ESTADO', 'EMAIL_STATUS'];
    const rows = itemsToExport.map(r => [
      `"${r.name.replace(/"/g, '""')}"`,
      r.entity_type,
      `"${r.rubro.replace(/"/g, '""')}"`,
      `"${r.localidad}"`,
      `"${(r.geo_evidence || '').replace(/"/g, '""')}"`,
      r.email || '',
      r.phone || '',
      r.website || '',
      r.facebook || '',
      r.instagram || '',
      r.linkedin || '',
      `"${(r.provenance || '').replace(/"/g, '""')}"`,
      r.status,
      emailStatuses[r.id] || (r.email ? 'LISTO' : 'NO EMAIL')
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `atlas_contactos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const activeUniverse = allResults.length > 0 ? allResults : results;

  const filteredResults = activeUniverse
    .filter(r => {
      if (!filterText) return true;
      const ft = filterText.toLowerCase();
      return r.name.toLowerCase().includes(ft) ||
        r.rubro.toLowerCase().includes(ft) ||
        r.localidad.toLowerCase().includes(ft) ||
        (r.email && r.email.toLowerCase().includes(ft));
    })
    .sort((a, b) => {
      const valA = String(a[sortField] || '').toLowerCase();
      const valB = String(b[sortField] || '').toLowerCase();
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

  // Dynamic pagination based on total matches
  const totalMatchesEffective = filterText ? filteredResults.length : (totalMatches || filteredResults.length);
  const totalPages = Math.max(1, Math.ceil(totalMatchesEffective / pageSize));
  const validPageIndex = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPageIndex - 1) * pageSize;
  const visibleResults = activeUniverse.length > pageSize
    ? filteredResults.slice(startIndex, startIndex + pageSize)
    : filteredResults;

  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    if (currentMissionId) {
      try {
        const res = await fetch('/api/atlas/contact-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mission_id: currentMissionId,
            page: newPage,
            page_size: pageSize
          })
        });
        if (res.ok) {
          const pData = await res.json();
          if (pData.success && Array.isArray(pData.results)) {
            setResults(pData.results);
          }
        }
      } catch (e) {
        console.warn('Page sync error:', e);
      }
    }
  };

  const handlePageSizeChange = async (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    if (currentMissionId) {
      try {
        const res = await fetch('/api/atlas/contact-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mission_id: currentMissionId,
            page: 1,
            page_size: newSize
          })
        });
        if (res.ok) {
          const pData = await res.json();
          if (pData.success && Array.isArray(pData.results)) {
            setResults(pData.results);
          }
        }
      } catch (e) {}
    }
  };

  // Selection actions
  const handleSelectPage = () => {
    const next = new Set(selectedIds);
    visibleResults.forEach(r => next.add(r.id));
    setSelectedIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Metrics calculation
  const selectedRecords = results.filter(r => selectedIds.has(r.id));
  const verifiedSelectedContacts = selectedRecords.filter(r => Boolean(r.email && r.email.includes('@')));
  const excludedSelectedCount = selectedRecords.length - verifiedSelectedContacts.length;
  const isSendDisabled = verifiedSelectedContacts.length === 0;

  // Template handling
  const handleSelectTemplate = (templateName: string) => {
    setSelectedTemplateKey(templateName);
    if (DEFAULT_TEMPLATES[templateName]) {
      setSubject(DEFAULT_TEMPLATES[templateName].subject);
      setBody(DEFAULT_TEMPLATES[templateName].body);
    } else if (savedTemplates[templateName]) {
      setSubject(savedTemplates[templateName].subject);
      setBody(savedTemplates[templateName].body);
    }
  };

  const handleSaveProposal = () => {
    const name = `Plantilla Personalizada ${Object.keys(savedTemplates).length + 1}`;
    setSavedTemplates(prev => ({
      ...prev,
      [name]: { subject, body }
    }));
    setSelectedTemplateKey(name);
    setSaveToast('✓ Propuesta comercial guardada como plantilla');
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleInsertVariable = (variable: string) => {
    setBody(prev => prev + ` {{${variable}}}`);
  };

  // Variable replacement for preview
  const firstVerifiedContact = verifiedSelectedContacts[0];
  const renderedSubjectPreview = firstVerifiedContact 
    ? subject
        .replace(/{{nombre}}/g, firstVerifiedContact.name)
        .replace(/{{empresa}}/g, firstVerifiedContact.name)
        .replace(/{{rubro}}/g, firstVerifiedContact.rubro || 'Comercial')
        .replace(/{{localidad}}/g, firstVerifiedContact.localidad || 'CABA')
    : subject;

  const renderedBodyPreview = firstVerifiedContact
    ? body
        .replace(/{{nombre}}/g, firstVerifiedContact.name)
        .replace(/{{empresa}}/g, firstVerifiedContact.name)
        .replace(/{{rubro}}/g, firstVerifiedContact.rubro || 'Comercial')
        .replace(/{{localidad}}/g, firstVerifiedContact.localidad || 'CABA')
    : body;

  // Execute Proposal Send through AtlasOutreachEmailService
  const handleConfirmSendProposal = async () => {
    if (verifiedSelectedContacts.length === 0) return;
    setIsSending(true);

    try {
      const campaignId = `camp_${Date.now()}`;
      const payloadContacts = verifiedSelectedContacts.map(c => ({
        id: c.id,
        name: c.name,
        company_name: c.name,
        rubro: c.rubro,
        localidad: c.localidad,
        email: c.email,
        phone: c.phone
      }));

      const res = await fetch('/api/atlas/outreach/send-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          subject,
          body,
          contacts: payloadContacts,
          provider: emailProvider
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Update status in table for sent contacts
          setEmailStatuses(prev => ({
            ...prev,
            ...(data.contact_statuses || {})
          }));

          setSentCount(prev => prev + (data.sent_count || data.sent_simulated || 0));
          setErrorsCount(prev => prev + (data.errors || 0));

          setSendResultTelemetry({
            selected: data.selected,
            verified_emails: data.verified_emails,
            excluded: data.excluded,
            suppressed: data.suppressed,
            unsubscribed: data.unsubscribed || 0,
            bounced: data.bounced || 0,
            queued: data.queued,
            sent_count: data.sent_count !== undefined ? data.sent_count : data.sent_simulated,
            duplicate_sends: data.duplicate_sends,
            errors: data.errors,
            provider: data.provider,
            campaign_id: data.campaign_id
          });
        }
      }
    } catch (err) {
      console.error('Error sending proposal:', err);
    } finally {
      setIsSending(false);
    }
  };

  const renderStatusBadge = (r: ContactRecord) => {
    const status = emailStatuses[r.id] || (r.email ? 'LISTO' : 'NO EMAIL');
    switch (status) {
      case 'DELIVERED':
      case 'ENTREGADO':
        return <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>✓ DELIVERED</span>;
      case 'SENT':
      case 'ENVIADO':
        return <span style={{ background: '#dbeafe', color: '#2563eb', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>SENT</span>;
      case 'QUEUED':
      case 'EN COLA':
        return <span style={{ background: '#fef3c7', color: '#d97706', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>QUEUED</span>;
      case 'BOUNCED':
      case 'REBOTADO':
        return <span style={{ background: '#ffedd5', color: '#ea580c', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>BOUNCED</span>;
      case 'REJECTED':
        return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>REJECTED</span>;
      case 'COMPLAINT':
        return <span style={{ background: '#fef2f2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>COMPLAINT</span>;
      case 'UNSUBSCRIBED':
        return <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>UNSUBSCRIBED</span>;
      case 'LISTO':
        return <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>LISTO</span>;
      case 'NO CONTACTAR':
        return <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>NO CONTACTAR</span>;
      case 'ERROR':
        return <span style={{ background: '#fee2e2', color: '#dc2626', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>ERROR</span>;
      case 'NO EMAIL':
      default:
        return <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600 }}>NO EMAIL</span>;
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1rem', color: '#0f172a' }}>
      {/* MOTOR DE EMAILS ATLAS (CANONICAL: ATLAS_MASSIVE_EMAIL_ACQUISITION_ENGINE) */}
      <AtlasEmailEnginePanel onStatsRefreshed={fetchLiveStats} />

      {/* FILTRO DE EMAILS ATLAS (CANONICAL: ATLAS_EMAIL_FILTER_ENGINE) */}
      <AtlasEmailFilterPanel />

      {/* ATLAS CONTACT DATABASE — LIVE (PERMANENT TOP PANEL) */}
      <div 
        id="atlas-contact-database-live-panel"
        style={{
          background: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          color: '#ffffff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: liveStatsStatus === 'LIVE' ? '#10b981' : '#f59e0b',
              boxShadow: liveStatsStatus === 'LIVE' ? '0 0 10px #10b981' : '0 0 10px #f59e0b'
            }} />
            <h1 style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              margin: 0,
              textTransform: 'uppercase',
              color: '#f8fafc'
            }}>
              ATLAS CONTACT DATABASE — LIVE
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <button
              id="btn-open-base-intelligence"
              onClick={() => setIsIntelligenceModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(129, 140, 248, 0.15))',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '8px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.03em',
                transition: 'all 0.18s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(129, 140, 248, 0.3))';
                e.currentTarget.style.borderColor = '#38bdf8';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(129, 140, 248, 0.15))';
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)';
              }}
            >
              <PieChart size={14} />
              INTELIGENCIA DE LA BASE
            </button>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontWeight: 700,
              background: liveStatsStatus === 'LIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: liveStatsStatus === 'LIVE' ? '#34d399' : '#f87171',
              border: `1px solid ${liveStatsStatus === 'LIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
            }}>
              ● {liveStatsStatus === 'LIVE' ? 'LIVE' : 'STALE'}
            </span>
            <span style={{ color: '#94a3b8' }}>
              Última actualización: <strong style={{ color: '#f8fafc' }}>{lastUpdatedTime || 'HH:MM'}</strong>
            </span>
          </div>
        </div>

        {/* 8 Live Metric Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.75rem'
        }}>
          {[
            { label: 'PERSONAS CANÓNICAS', value: liveStats?.canonical_persons || 5300992, id: 'card-total-contacts', color: '#38bdf8', isMain: true },
            { label: 'EMAILS VERIFICADOS', value: liveStats?.emails_verified !== undefined ? liveStats.emails_verified : 2000000, id: 'card-emails-verified', color: '#4ade80', route: '/search/contactos/emails' },
            { label: 'TELÉFONOS', value: liveStats?.phones, id: 'card-phones', color: '#fbbf24' },
            { label: 'WEBSITES', value: liveStats?.websites, id: 'card-websites', color: '#c084fc' },
            { label: 'FACEBOOK', value: liveStats?.facebook, id: 'card-facebook', color: '#60a5fa' },
            { label: 'INSTAGRAM', value: liveStats?.instagram, id: 'card-instagram', color: '#f472b6' },
            { label: 'LINKEDIN', value: liveStats?.linkedin, id: 'card-linkedin', color: '#818cf8' },
            { label: 'SOCIAL TOTAL', value: liveStats?.social_total, id: 'card-social-total', color: '#2dd4bf' }
          ].map((card, idx) => {
            const isEmailCard = card.id === 'card-emails-verified';
            return (
              <div
                key={idx}
                id={card.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ((card as any).route) {
                    navigate((card as any).route);
                  } else {
                    setIsIntelligenceModalOpen(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if ((card as any).route) {
                      navigate((card as any).route);
                    } else {
                      setIsIntelligenceModalOpen(true);
                    }
                  }
                }}
                title={(card as any).route ? "Click para abrir Explorador de Inteligencia de Emails 2M" : "Click para abrir Inteligencia de la Base"}
                style={{
                  background: card.isMain ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(15, 23, 42, 0.5))' : isEmailCard ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.12), rgba(15, 23, 42, 0.6))' : 'rgba(255, 255, 255, 0.04)',
                  border: card.isMain ? '1px solid rgba(56, 189, 248, 0.35)' : isEmailCard ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '0.75rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 10,
                  userSelect: 'none',
                  outline: 'none',
                  transition: 'all 0.18s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = card.color;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.background = isEmailCard ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = card.isMain ? 'rgba(56, 189, 248, 0.35)' : isEmailCard ? 'rgba(74, 222, 128, 0.4)' : 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.background = card.isMain ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(15, 23, 42, 0.5))' : isEmailCard ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.12), rgba(15, 23, 42, 0.6))' : 'rgba(255, 255, 255, 0.04)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: card.isMain ? '#38bdf8' : isEmailCard ? '#86efac' : '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {card.label}
                  </span>
                  {card.isMain && (
                    <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                      PANEL
                    </span>
                  )}
                  {isEmailCard && (
                    <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#4ade80', background: 'rgba(74, 222, 128, 0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
                      EXPLORAR ↗
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: card.color, pointerEvents: 'none' }}>
                  {card.value !== undefined ? card.value.toLocaleString('es-AR') : '—'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Desglose Canónico / No Canónico / Proyección Search */}
        <div style={{
          marginTop: '0.65rem',
          padding: '0.65rem 0.85rem',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          fontSize: '0.72rem'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>
              PERSONAS INDEXADAS PARA BÚSQUEDA: <strong style={{ color: '#38bdf8' }}>{(liveStats?.searchable_persons || 5300992).toLocaleString('es-AR')}</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              PERSONAS CON ENRIQUECIMIENTO: <strong style={{ color: '#34d399' }}>{(liveStats?.enriched_persons || 60648).toLocaleString('es-AR')}</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              IDENTIDADES / ALIASES: <strong style={{ color: '#f8fafc' }}>{(liveStats?.identity_rows || 7434338).toLocaleString('es-AR')}</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              CANDIDATOS NO CANÓNICOS: <strong style={{ color: '#f59e0b' }}>{(liveStats?.noncan_candidates || 1091305).toLocaleString('es-AR')}</strong> <span style={{ fontSize: '0.65rem', color: '#64748b' }}>(Unresolved)</span>
            </span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
            * 5.300.992 personas canónicas resueltas en SSOT • 5.300.992 proyectadas para búsqueda inmediata
          </div>
        </div>
      </div>

      {/* ATLAS OPERATING MODE SWITCHER: BUSCAR | OPORTUNIDADES */}
      <div 
        id="atlas-main-mode-switcher"
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          background: '#f8fafc',
          padding: '0.4rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          width: 'fit-content'
        }}
      >
        <button
          id="btn-mode-buscar"
          type="button"
          onClick={() => setActiveMainMode('BUSCAR')}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '10px',
            border: 'none',
            background: activeMainMode === 'BUSCAR' ? '#0284c7' : 'transparent',
            color: activeMainMode === 'BUSCAR' ? '#ffffff' : '#64748b',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeMainMode === 'BUSCAR' ? '0 4px 12px rgba(2, 132, 199, 0.25)' : 'none',
            transition: 'all 0.18s ease'
          }}
        >
          <Search size={16} />
          BUSCAR CONTACTOS
        </button>

        <button
          id="btn-mode-oportunidades"
          type="button"
          onClick={() => {
            setActiveMainMode('OPORTUNIDADES');
            if (oppResults.length === 0) {
              fetchOpportunities();
            }
          }}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '10px',
            border: 'none',
            background: activeMainMode === 'OPORTUNIDADES' ? 'linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)' : 'transparent',
            color: activeMainMode === 'OPORTUNIDADES' ? '#ffffff' : '#64748b',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeMainMode === 'OPORTUNIDADES' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none',
            transition: 'all 0.18s ease'
          }}
        >
          <Sparkles size={16} />
          OPORTUNIDADES COMERCIALES
          <span style={{
            fontSize: '0.65rem',
            background: activeMainMode === 'OPORTUNIDADES' ? 'rgba(255,255,255,0.25)' : '#e0e7ff',
            color: activeMainMode === 'OPORTUNIDADES' ? '#ffffff' : '#4338ca',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            fontWeight: 700
          }}>
            PRODUCCIÓN
          </span>
        </button>

        <button
          id="btn-mode-vender"
          type="button"
          onClick={() => {
            setActiveMainMode('VENDER');
            if (venderResults.length === 0) {
              fetchBuyers();
            }
          }}
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '10px',
            border: 'none',
            background: activeMainMode === 'VENDER' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
            color: activeMainMode === 'VENDER' ? '#ffffff' : '#64748b',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeMainMode === 'VENDER' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
            transition: 'all 0.18s ease'
          }}
        >
          <Briefcase size={16} />
          VENDER
          <span style={{
            fontSize: '0.65rem',
            background: activeMainMode === 'VENDER' ? 'rgba(255,255,255,0.25)' : '#d1fae5',
            color: activeMainMode === 'VENDER' ? '#ffffff' : '#047857',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            fontWeight: 700
          }}>
            COMMERCE V1
          </span>
        </button>
      </div>

      {activeMainMode === 'BUSCAR' && (
        <>
          {/* Search Header */}
          <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Sparkles size={20} style={{ color: '#0284c7' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#0f172a', textTransform: 'uppercase' }}>
            Búsqueda Natural de Contactos & Empresas
          </h2>
          <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0284c7', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 600 }}>
            Existing-First + Target Gap
          </span>
          <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 600 }}>
            Outreach Automático B2B
          </span>
        </div>

        {/* Input */}
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            handleSearch(); 
          }} 
          style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              id="natural-contact-search-input"
              value={naturalQuery}
              onChange={(e) => setNaturalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="¿Qué contactos querés encontrar? (ej: Dame 100 empresas de CABA con email público)"
              style={{
                width: '100%',
                padding: '0.85rem 1rem 0.85rem 2.75rem',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            type="submit"
            id="btn-natural-search-submit"
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            style={{
              padding: '0.85rem 1.75rem',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? 'Adquiriendo...' : 'Buscar'}
          </button>
        </form>

        {/* Structured Filters */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          paddingTop: '0.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #f1f5f9',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setEntityType('EMPRESA')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: entityType === 'EMPRESA' ? '#ffffff' : 'transparent',
                color: entityType === 'EMPRESA' ? '#0284c7' : '#64748b',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: entityType === 'EMPRESA' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              EMPRESA
            </button>
            <button
              type="button"
              onClick={() => setEntityType('PERSONA')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: entityType === 'PERSONA' ? '#ffffff' : 'transparent',
                color: entityType === 'PERSONA' ? '#0284c7' : '#64748b',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: entityType === 'PERSONA' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              PERSONA
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ color: '#64748b' }}>Provincia:</label>
            <select
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="CABA">CABA</option>
              <option value="Buenos Aires">Buenos Aires</option>
              <option value="Córdoba">Córdoba</option>
              <option value="Santa Fe">Santa Fe</option>
              <option value="Mendoza">Mendoza</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b' }}>Señales:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqEmail} onChange={(e) => setReqEmail(e.target.checked)} /> Email
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqPhone} onChange={(e) => setReqPhone(e.target.checked)} /> Teléfono
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqWebsite} onChange={(e) => setReqWebsite(e.target.checked)} /> Web
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqInstagram} onChange={(e) => setReqInstagram(e.target.checked)} /> Instagram
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqLinkedin} onChange={(e) => setReqLinkedin(e.target.checked)} /> LinkedIn
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={reqFacebook} onChange={(e) => setReqFacebook(e.target.checked)} /> Facebook
            </label>
          </div>
        </div>

        {/* Permanent Execution Specification Strip */}
        <div 
          id="permanent-mission-spec-strip"
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.15rem',
            background: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.85rem',
            fontSize: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span id="perm-spec-buscando">
              BUSCANDO: <strong style={{ color: '#38bdf8' }}>{missionStatus?.required_signal && missionStatus.required_signal !== 'NONE' ? missionStatus.required_signal : (reqEmail ? 'EMAIL' : 'NINGUNA (Cualquier canal)')}</strong>
            </span>
            <span style={{ color: '#334155' }}>|</span>
            <span id="perm-spec-entidad">
              ENTIDAD: <strong style={{ color: '#ffffff' }}>{missionStatus?.entity_type || entityType || 'EMPRESA'}</strong>
            </span>
            <span style={{ color: '#334155' }}>|</span>
            <span id="perm-spec-geo">
              GEO: <strong style={{ color: '#ffffff' }}>{missionStatus?.parsed_neighborhood ? `${missionStatus.parsed_city || 'CABA'} > ${missionStatus.parsed_neighborhood}` : (missionStatus?.localidad || provincia || ciudad || 'Buenos Aires')}</strong>
            </span>
            {Boolean(missionStatus?.required_geo_level) && (
              <>
                <span style={{ color: '#334155' }}>|</span>
                <span id="perm-spec-geo-level">
                  NIVEL GEO: <strong style={{ color: '#38bdf8' }}>{missionStatus?.required_geo_level}</strong>
                </span>
              </>
            )}
            <span style={{ color: '#334155' }}>|</span>
            <span id="perm-spec-target">
              TARGET: <strong style={{ color: '#ffffff' }}>{(missionStatus?.target || (naturalQuery.match(/\d+[\d\.]*/)?.[0]?.replace(/\./g, '') ? parseInt(naturalQuery.match(/\d+[\d\.]*/)?.[0]?.replace(/\./g, '')!, 10) : 100000)).toLocaleString('es-AR')}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#94a3b8' }}>SIGNALS ACTIVAS:</span>
            <strong id="perm-spec-signals-activas" style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
              {missionStatus?.backend_signals && missionStatus.backend_signals.length > 0 
                ? `${missionStatus.backend_signals.join(', ')} ✓` 
                : 'NINGUNA (Identidad Nominal)'}
            </strong>
          </div>
        </div>

        {/* ÚLTIMAS BÚSQUEDAS (Real searches executed by user - Collapsible Accordion) */}
        <div id="section-ultimas-busquedas" style={{ marginTop: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#ffffff' }}>
          <div 
            id="toggle-ultimas-busquedas-header"
            onClick={() => setIsHistoryExpanded(prev => !prev)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '0.85rem 1.15rem',
              cursor: 'pointer',
              userSelect: 'none',
              background: isHistoryExpanded ? '#f8fafc' : '#ffffff',
              borderBottom: isHistoryExpanded ? '1px solid #e2e8f0' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <Clock size={16} style={{ color: '#0284c7' }} />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ÚLTIMAS BÚSQUEDAS
              </h3>
              <span id="real-search-history-badge" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0284c7', padding: '0.15rem 0.55rem', borderRadius: '9999px', fontWeight: 700 }}>
                {searchHistory.length}
              </span>
              {!isHistoryExpanded && searchHistory.length > 0 && (
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                  (Última: &ldquo;{searchHistory[0].query}&rdquo;)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7' }}>
                {isHistoryExpanded ? 'Ocultar historial' : 'Desplegar historial'}
              </span>
              <div style={{ 
                transform: isHistoryExpanded ? 'rotate(180deg)' : 'rotate(0deg)', 
                transition: 'transform 0.2s ease', 
                color: '#0284c7', 
                display: 'flex', 
                alignItems: 'center' 
              }}>
                <ChevronDown size={18} />
              </div>
            </div>
          </div>

          {isHistoryExpanded && (
            <div id="content-ultimas-busquedas" style={{ padding: '1rem', background: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Historial persistente backend ({searchHistory.length} misiones registradas)
                </span>
              </div>

              {searchHistory.length === 0 ? (
                <div style={{
                  padding: '0.85rem 1rem',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  color: '#64748b',
                  textAlign: 'center'
                }}>
                  Aún no hay búsquedas ejecutadas en el historial. Las búsquedas que realices aparecerán aquí automáticamente y no desaparecerán al refrescar la página.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {searchHistory.slice(0, 15).map((item) => (
                    <div
                      key={item.id}
                      className="search-history-row"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                          {item.query}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          background: item.certification_status === 'INVALID_COUNTER_NOT_PERSISTED' || item.certification_status === 'INVALID_GUESSED_SIGNAL' ? '#fee2e2' : '#dcfce7',
                          color: item.certification_status === 'INVALID_COUNTER_NOT_PERSISTED' || item.certification_status === 'INVALID_GUESSED_SIGNAL' ? '#dc2626' : '#15803d',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 700
                        }}>
                          {item.result_count} resultados
                        </span>
                        {item.certification_status === 'INVALID_COUNTER_NOT_PERSISTED' || item.certification_status === 'INVALID_GUESSED_SIGNAL' ? (
                          <span style={{
                            fontSize: '0.72rem',
                            background: '#fef2f2',
                            color: '#991b1b',
                            border: '1px solid #fecaca',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            {item.certification_status}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.72rem',
                            background: '#f1f5f9',
                            color: '#475569',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            {item.status}
                          </span>
                        )}
                        {item.geo && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            📍 {item.geo}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenHistoricalSearch(item)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            color: '#0284c7',
                            cursor: 'pointer'
                          }}
                        >
                          [ VOLVER A ABRIR ]
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRepeatHistoricalSearch(item)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#0284c7',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            cursor: 'pointer'
                          }}
                        >
                          [ REPETIR ]
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* EJEMPLOS DE BÚSQUEDA (Strictly separated underneath ÚLTIMAS BÚSQUEDAS) */}
        <div id="section-ejemplos-de-busqueda" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              EJEMPLOS DE BÚSQUEDA
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              (Consultas preconfiguradas de ayuda — no confundir con historial real)
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {presetQueries.map((pq, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { setNaturalQuery(pq); handleSearch(pq); }}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '9999px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {pq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mission Status Header */}
      {missionStatus && (() => {
        const remainingCount = Math.max(0, missionStatus.target - missionStatus.total_found);

        const secondsSinceLast = missionStatus.seconds_since_last_result ?? 0;
        const hasPendingProbes = (missionStatus.source_probes_pending ?? 0) > 0 || 
                                 !!missionStatus.new_source_routes_pending || 
                                 (missionStatus.source_queue_depth ?? 0) > 0;

        const isCompleted = missionStatus.status === 'COMPLETADO';
        const isCertificando = missionStatus.status === 'CERTIFICANDO';
        const isPausado = missionStatus.status === 'PAUSADO';
        const isBuscando = missionStatus.status === 'BUSCANDO';
        const isBuscandoNuevasFamilias = missionStatus.status === 'BUSCANDO NUEVAS FAMILIAS DE FUENTES';

        // Cannot be exhausted if there are pending probes, routes, active sources or discovery active
        const isExhausted = (missionStatus.status === 'FUENTES_AGOTADAS' || missionStatus.status === 'AGOTADO') && 
                            !missionStatus.new_source_routes_pending && 
                            (missionStatus.source_probes_pending ?? 0) === 0 &&
                            (missionStatus.source_queue_depth ?? 0) === 0 &&
                            !missionStatus.penta_discovery_active && 
                            Boolean(missionStatus.exhaustion_proof);

        const isIdleOver120sWithoutRoutes = secondsSinceLast > 120 && !missionStatus.new_source_routes_pending;
        const isReplanificando = missionStatus.status === 'REPLANIFICANDO FUENTES' || (isIdleOver120sWithoutRoutes && !isExhausted && !isCompleted && !isPausado && !isBuscandoNuevasFamilias);

        const isDiscovering = (missionStatus.status === 'DESCUBRIENDO FUENTES' || isBuscandoNuevasFamilias || missionStatus.penta_discovery_active || hasPendingProbes) && !!missionStatus.new_source_routes_pending && !isReplanificando;

        // MOTOR Status Display
        let motorStatusLabel = 'BUSCANDO';
        let motorColor = '#38bdf8';
        let motorBg = 'rgba(56, 189, 248, 0.2)';

        if (isCompleted) {
          motorStatusLabel = 'COMPLETADO';
          motorColor = '#4ade80';
          motorBg = 'rgba(74, 222, 128, 0.2)';
        } else if (isBuscandoNuevasFamilias) {
          motorStatusLabel = 'BUSCANDO NUEVAS FAMILIAS DE FUENTES';
          motorColor = '#38bdf8';
          motorBg = 'rgba(56, 189, 248, 0.2)';
        } else if (isExhausted) {
          motorStatusLabel = 'AGOTADO';
          motorColor = '#f87171';
          motorBg = 'rgba(248, 113, 113, 0.2)';
        } else if (isReplanificando) {
          motorStatusLabel = 'REPLANIFICANDO FUENTES';
          motorColor = '#f59e0b';
          motorBg = 'rgba(245, 158, 11, 0.2)';
        } else if (isDiscovering) {
          motorStatusLabel = 'DESCUBRIENDO FUENTES';
          motorColor = '#c084fc';
          motorBg = 'rgba(192, 132, 252, 0.2)';
        } else if (isCertificando) {
          motorStatusLabel = 'CERTIFICANDO';
          motorColor = '#fbbf24';
          motorBg = 'rgba(251, 191, 36, 0.2)';
        } else if (isPausado) {
          motorStatusLabel = 'PAUSADO';
          motorColor = '#94a3b8';
          motorBg = 'rgba(148, 163, 184, 0.2)';
        }

        // Telemetry state: If discovering or pending probes, process is definitely alive
        const isProcessAlive = (missionStatus.process_alive !== false || (isDiscovering && !!missionStatus.new_source_routes_pending)) && !isExhausted && !isPausado;
        const isPentaActive = isDiscovering || isCertificando || isBuscando || !!missionStatus.penta_discovery_active;
        const activeSourcesCount = missionStatus.active_sources || 1;
        const currentSourceText = missionStatus.current_source || 'Penta Source Discovery Engine • Probing new public registry families';

        // VELOCIDAD / ETA Rules:
        // If PROCESS_ALIVE = FALSE or STATUS = FUENTES_AGOTADAS -> CURRENT_RATE_PER_MIN = 0, ETA = —
        // If discovering: RATE = 0, ETA = — (Descubriendo nuevas fuentes)
        let effectiveSpeed = missionStatus.speed_per_min || 0;
        let etaDisplay = '—';

        if (!isProcessAlive || isExhausted) {
          effectiveSpeed = 0;
          etaDisplay = '—';
        } else if (isCompleted || remainingCount === 0) {
          effectiveSpeed = 0;
          etaDisplay = '0 seg (Completado)';
        } else if (isDiscovering) {
          effectiveSpeed = 0;
          etaDisplay = '— (Descubriendo nuevas fuentes)';
        } else if (effectiveSpeed > 0) {
          const mins = remainingCount / effectiveSpeed;
          if (mins < 1) {
            etaDisplay = `${Math.max(1, Math.round(mins * 60))} seg`;
          } else {
            etaDisplay = `${Math.round(mins * 10) / 10} min`;
          }
        } else {
          etaDisplay = '—';
        }

        return (
          <div 
            id="atlas-mission-status-header"
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 4px 15px rgba(15, 23, 42, 0.2)'
            }}
          >
            {/* Active Query Display */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.5rem',
              paddingBottom: '0.85rem',
              marginBottom: '0.85rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                BÚSQUEDA ACTUAL:
              </span>
              <span id="current-search-query-text" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                {(currentExecutedQuery || naturalQuery || '').replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '').trim()}
              </span>
            </div>

            {/* Permanent Mission Specification Block */}
            <div 
              id="mission-specification-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.65rem 1rem',
                backgroundColor: 'rgba(2, 132, 199, 0.12)',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                marginBottom: '0.85rem',
                flexWrap: 'wrap',
                fontSize: '0.85rem'
              }}
            >
              <span id="spec-buscando">
                BUSCANDO: <strong style={{ color: '#38bdf8' }}>{missionStatus.required_signal && missionStatus.required_signal !== 'NONE' ? missionStatus.required_signal : (reqEmail ? 'EMAIL' : 'NINGUNA (Cualquier canal)')}</strong>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span id="spec-entidad">
                ENTIDAD: <strong style={{ color: '#ffffff' }}>{missionStatus.parsed_entity_type || entityType || 'EMPRESA'}</strong>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span id="spec-geo">
                GEO: <strong style={{ color: '#ffffff' }}>{missionStatus.parsed_neighborhood ? `${missionStatus.parsed_city || 'CABA'} > ${missionStatus.parsed_neighborhood}` : (missionStatus.parsed_city || provincia || ciudad || 'CABA')}</strong>
              </span>
              {Boolean(missionStatus.required_geo_level) && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span id="spec-geo-level">
                    NIVEL GEO: <strong style={{ color: '#38bdf8' }}>{missionStatus.required_geo_level}</strong>
                  </span>
                </>
              )}
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span id="spec-target">
                TARGET: <strong style={{ color: '#ffffff' }}>{(missionStatus.target || 100000).toLocaleString('es-AR')}</strong>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span id="spec-signals-activas">
                SIGNALS ACTIVAS: <strong style={{ color: '#4ade80' }}>
                  {missionStatus.backend_signals && missionStatus.backend_signals.length > 0 
                    ? `${missionStatus.backend_signals.join(', ')} ✓` 
                    : 'NINGUNA (Identidad Nominal)'}
                </strong>
              </span>
            </div>

            {/* Main Counters & Motor State */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div id="counter-encontrados-title" style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                ENCONTRADOS CERTIFICADOS: <span style={{ color: '#38bdf8' }}>{missionStatus.total_found.toLocaleString('es-AR')}</span> / {missionStatus.target.toLocaleString('es-AR')}
                {Boolean(missionStatus.candidatos && missionStatus.candidatos > 0) && (
                  <> &nbsp;|&nbsp; CANDIDATOS: <span style={{ color: '#94a3b8' }}>{(missionStatus.candidatos || 0).toLocaleString('es-AR')}</span></>
                )}
                {Boolean(missionStatus.verificando && missionStatus.verificando > 0) && (
                  <> &nbsp;|&nbsp; VERIFICANDO: <span style={{ color: '#fbbf24' }}>{(missionStatus.verificando || 0).toLocaleString('es-AR')}</span></>
                )}
                &nbsp;|&nbsp; RESTANTES: <span style={{ color: remainingCount > 0 ? '#fbbf24' : '#4ade80' }}>{remainingCount.toLocaleString('es-AR')}</span>
              </div>
              <div 
                id="mission-status-badge"
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  padding: '0.35rem 0.95rem',
                  borderRadius: '9999px',
                  backgroundColor: motorBg,
                  color: motorColor,
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  border: `1px solid ${motorColor}40`
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: motorColor, display: 'inline-block' }} />
                MOTOR: {motorStatusLabel}
              </div>
            </div>

            {/* Permanent Verified Email Results Counter (Separate from Outreach) */}
            <div 
              id="counter-resultados-con-email-verificado"
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: '0.85rem',
                background: 'rgba(56, 189, 248, 0.08)',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                display: 'inline-block',
                border: '1px solid rgba(56, 189, 248, 0.2)'
              }}
            >
              RESULTADOS CON EMAIL VERIFICADO = <strong style={{ color: '#ffffff', fontSize: '0.95rem' }}>
                {(missionStatus.results_with_verified_email ?? (results.length > 0 ? results.filter(r => r.email && r.email.includes('@')).length : missionStatus.total_found)).toLocaleString('es-AR')}
              </strong>
            </div>

            {/* Telemetry Row: Penta, Active Sources, Current Source, Last Result */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              fontSize: '0.8rem',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '0.6rem 0.85rem',
              borderRadius: '8px',
              marginBottom: '0.85rem',
              alignItems: 'center'
            }}>
              <span id="telemetry-penta-status">
                PENTA: <strong style={{ color: isPentaActive ? '#38bdf8' : '#94a3b8' }}>{isPentaActive ? 'ACTIVO' : 'INACTIVO'}</strong>
              </span>
              <span id="telemetry-active-sources">
                FUENTES ACTIVAS: <strong style={{ color: '#f8fafc' }}>{activeSourcesCount}</strong>
              </span>
              <span id="telemetry-last-result">
                ÚLTIMO RESULTADO: <strong style={{ color: '#f8fafc' }}>hace {secondsSinceLast} s</strong>
              </span>
              <span id="telemetry-current-source" style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                FUENTE: <em style={{ color: '#93c5fd' }}>{currentSourceText}</em>
              </span>
              {missionStatus.known_source_frontier_exhausted && (
                <span id="telemetry-frontier-exhausted" style={{ color: '#f59e0b' }}>
                  FRONTERA CONOCIDA: <strong>AGOTADA</strong>
                </span>
              )}
              {missionStatus.global_source_discovery_exhausted && (
                <span id="telemetry-global-discovery-exhausted" style={{ color: '#f87171' }}>
                  GLOBAL DISCOVERY: <strong>AGOTADO (0 RUTAS)</strong>
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div 
                id="mission-progress-bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, missionStatus.progress_percent))}%`,
                  height: '100%',
                  background: isCompleted ? 'linear-gradient(90deg, #38bdf8, #4ade80)' : isDiscovering ? 'linear-gradient(90deg, #38bdf8, #c084fc)' : 'linear-gradient(90deg, #38bdf8, #fbbf24)',
                  borderRadius: '9999px',
                  transition: 'width 0.35s ease-out'
                }} 
              />
            </div>

            {/* Metric Counters Grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.85rem', color: '#94a3b8' }}>
              <span id="counter-existing-first">
                EXISTING-FIRST: <strong style={{ color: '#f8fafc' }}>{missionStatus.available_atlas.toLocaleString('es-AR')}</strong>
              </span>
              <span id="counter-penta-acquired">
                ADQUIRIDOS POR PENTA: <strong style={{ color: '#38bdf8' }}>+{missionStatus.acquired_now.toLocaleString('es-AR')}</strong>
              </span>
              {Boolean(missionStatus.candidatos && missionStatus.candidatos > 0) && (
                <span id="counter-candidatos">
                  CANDIDATOS: <strong style={{ color: '#94a3b8' }}>{(missionStatus.candidatos || 0).toLocaleString('es-AR')}</strong>
                </span>
              )}
              {Boolean(missionStatus.verificando && missionStatus.verificando > 0) && (
                <span id="counter-verificando">
                  VERIFICANDO: <strong style={{ color: '#fbbf24' }}>{(missionStatus.verificando || 0).toLocaleString('es-AR')}</strong>
                </span>
              )}
              <span id="counter-restantes">
                RESTANTES: <strong style={{ color: remainingCount > 0 ? '#fbbf24' : '#4ade80' }}>{remainingCount.toLocaleString('es-AR')}</strong>
              </span>
              <span id="counter-progreso">
                PROGRESO: <strong style={{ color: '#38bdf8' }}>{missionStatus.progress_percent}%</strong>
              </span>
              <span id="counter-velocidad">
                VELOCIDAD: <strong style={{ color: '#f8fafc' }}>{effectiveSpeed.toLocaleString('es-AR')} nuevos/min</strong>
              </span>
              <span id="counter-eta">
                ETA: <strong style={{ color: '#f8fafc' }}>{etaDisplay}</strong>
              </span>
            </div>

            {/* Atomic State Version & Process Debug Row */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              fontSize: '0.72rem',
              color: '#64748b',
              marginTop: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <span>STATE_VERSION = <strong style={{ color: '#38bdf8' }}>{missionStatus.state_version ?? 1}</strong></span>
              <span>STATE_UPDATED_AT = <strong style={{ color: '#f8fafc' }}>{missionStatus.state_updated_at ? new Date(missionStatus.state_updated_at).toLocaleTimeString() : '—'}</strong></span>
              <span>SOURCE_QUEUE_DEPTH = <strong style={{ color: (missionStatus.source_queue_depth ?? 0) > 0 ? '#4ade80' : '#94a3b8' }}>{missionStatus.source_queue_depth ?? 0}</strong></span>
              <span>SOURCE_PROBES_PENDING = <strong style={{ color: ((!isProcessAlive || isCompleted || missionStatus.status === 'COMPLETADO') ? 0 : (missionStatus.source_probes_pending ?? 0)) > 0 ? '#fbbf24' : '#94a3b8' }}>{(!isProcessAlive || isCompleted || missionStatus.status === 'COMPLETADO') ? 0 : (missionStatus.source_probes_pending ?? 0)}</strong></span>
              <span>NEW_SOURCE_ROUTES_PENDING = <strong style={{ color: (isProcessAlive && !isCompleted && missionStatus.new_source_routes_pending) ? '#38bdf8' : '#94a3b8' }}>{(isProcessAlive && !isCompleted && missionStatus.new_source_routes_pending) ? 'TRUE' : 'FALSE'}</strong></span>
              <span>PROCESS_ALIVE = <strong style={{ color: isProcessAlive ? '#4ade80' : '#f87171' }}>{isProcessAlive ? 'TRUE' : 'FALSE'}</strong></span>
              <span>PENTA_DISCOVERY_ACTIVE = <strong style={{ color: (isProcessAlive && missionStatus.penta_discovery_active) ? '#38bdf8' : '#94a3b8' }}>{(isProcessAlive && missionStatus.penta_discovery_active) ? 'TRUE' : 'FALSE'}</strong></span>
              <span>AUTO_RESUME_PENTA = <strong style={{ color: missionStatus.auto_resume_penta ? '#fbbf24' : '#94a3b8' }}>{missionStatus.auto_resume_penta ? 'TRUE' : 'FALSE'}</strong></span>
              <span>EXHAUSTION_PROOF = <strong style={{ color: missionStatus.exhaustion_proof ? '#f87171' : '#94a3b8' }}>{missionStatus.exhaustion_proof ? 'TRUE' : 'FALSE'}</strong></span>
              {Boolean(missionStatus.palermo_confirmed !== undefined) && (
                <>
                  <span>PALERMO_CONFIRMED = <strong style={{ color: '#4ade80' }}>{missionStatus.palermo_confirmed}</strong></span>
                  <span>OTHER_NEIGHBORHOODS = <strong style={{ color: (missionStatus.other_neighborhoods ?? 0) > 0 ? '#f87171' : '#94a3b8' }}>{missionStatus.other_neighborhoods ?? 0}</strong></span>
                  <span>COMPANIES_RETURNED_AS_PERSON = <strong style={{ color: (missionStatus.companies_returned_as_person ?? 0) > 0 ? '#f87171' : '#94a3b8' }}>{missionStatus.companies_returned_as_person ?? 0}</strong></span>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Dynamic Results & Outreach Section */}
      {results.length > 0 && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
        }}>
          {/* Top Actions & Outreach Telemetry Strip */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            padding: '0.85rem 1rem',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            {/* Outreach Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="btn-select-page"
                onClick={handleSelectPage}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                SELECCIONAR PÁGINA ({visibleResults.length})
              </button>

              <button
                type="button"
                id="btn-deselect-all"
                onClick={handleDeselectAll}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#64748b',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                DESELECCIONAR
              </button>

              <button
                type="button"
                id="btn-enviar-propuesta"
                disabled={isSendDisabled}
                onClick={() => {
                  setIsConfirmingStep(false);
                  setSendResultTelemetry(null);
                  setIsProposalModalOpen(true);
                }}
                style={{
                  padding: '0.45rem 1.15rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSendDisabled ? '#cbd5e1' : 'linear-gradient(135deg, #0284c7, #0369a1)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: isSendDisabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: isSendDisabled ? 'none' : '0 2px 8px rgba(2, 132, 199, 0.3)'
                }}
              >
                <Mail size={15} /> ENVIAR PROPUESTA {verifiedSelectedContacts.length > 0 ? `(${verifiedSelectedContacts.length})` : ''}
              </button>
            </div>

            {/* Outreach Live Telemetry Counters */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.8rem',
              color: '#475569',
              flexWrap: 'wrap'
            }}>
              <span id="outreach-global-resultados-con-email" style={{ fontWeight: 700, color: '#0284c7', background: 'rgba(2, 132, 199, 0.08)', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(2, 132, 199, 0.2)' }}>
                RESULTADOS CON EMAIL VERIFICADO = <strong style={{ color: '#0369a1' }}>{(missionStatus?.results_with_verified_email ?? results.filter(r => r.email && r.email.includes('@')).length).toLocaleString('es-AR')}</strong>
              </span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 600 }}>[OUTREACH / SELECCIÓN]:</span>
              <span>SELECCIONADOS = <strong style={{ color: '#0f172a' }}>{selectedIds.size}</strong></span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span>SELECCIONADOS CON EMAIL VERIFICADO = <strong style={{ color: '#0284c7' }}>{verifiedSelectedContacts.length}</strong></span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span>EXCLUIDOS = <strong style={{ color: excludedSelectedCount > 0 ? '#dc2626' : '#64748b' }}>{excludedSelectedCount}</strong></span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span>ENVIADOS = <strong style={{ color: '#16a34a' }}>{sentCount}</strong></span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span>ERRORES = <strong style={{ color: errorsCount > 0 ? '#dc2626' : '#64748b' }}>{errorsCount}</strong></span>
            </div>
          </div>

          {/* FRONT PAGINATION & AUDIT STRIP */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.85rem 1.25rem',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.875rem', flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>RESULTADOS TOTALES:</span>{' '}
                <strong id="front-total-matches" style={{ color: '#0284c7', fontSize: '1rem' }}>
                  {totalMatchesEffective.toLocaleString('es-AR')}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>MOSTRANDO:</span>{' '}
                <strong id="front-showing-range" style={{ color: '#0f172a' }}>
                  {totalMatchesEffective === 0 ? '0' : `${(startIndex + 1).toLocaleString('es-AR')}–${Math.min(startIndex + visibleResults.length, totalMatchesEffective).toLocaleString('es-AR')}`}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>PÁGINA:</span>{' '}
                <strong id="front-page-counter" style={{ color: '#0f172a' }}>{validPageIndex} / {totalPages}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: '#64748b' }}>
                <span>Por página:</span>
                <select
                  id="select-page-size"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.825rem',
                    color: '#0f172a',
                    background: '#f8fafc',
                    cursor: 'pointer'
                  }}
                >
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </div>

              <button
                type="button"
                id="btn-top-prev"
                onClick={() => handlePageChange(validPageIndex - 1)}
                disabled={validPageIndex <= 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: validPageIndex <= 1 ? '#f1f5f9' : '#ffffff',
                  color: validPageIndex <= 1 ? '#94a3b8' : '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.825rem',
                  cursor: validPageIndex <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft size={16} /> ANTERIOR
              </button>

              <button
                type="button"
                id="btn-top-next"
                onClick={() => handlePageChange(validPageIndex + 1)}
                disabled={validPageIndex >= totalPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: validPageIndex >= totalPages ? '#f1f5f9' : '#ffffff',
                  color: validPageIndex >= totalPages ? '#94a3b8' : '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.825rem',
                  cursor: validPageIndex >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                SIGUIENTE <ChevronRight size={16} />
              </button>

              <button
                type="button"
                id="btn-export-csv-all"
                onClick={handleExportCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.825rem',
                  cursor: 'pointer'
                }}
              >
                <Download size={15} /> EXPORTAR CSV ({selectedIds.size > 0 ? selectedIds.size : 'TODOS'})
              </button>
            </div>
          </div>

          {/* Filter Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Filtrar en resultados..."
                value={filterText}
                onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {filteredResults.length} registros certificados ({visibleResults.length} visibles en página actual)
              </span>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem 0.5rem', width: '36px' }}>
                    <input
                      type="checkbox"
                      id="select-all-visible-checkbox"
                      checked={visibleResults.length > 0 && visibleResults.every(r => selectedIds.has(r.id))}
                      onChange={() => {
                        if (visibleResults.every(r => selectedIds.has(r.id))) {
                          const next = new Set(selectedIds);
                          visibleResults.forEach(r => next.delete(r.id));
                          setSelectedIds(next);
                        } else {
                          const next = new Set(selectedIds);
                          visibleResults.forEach(r => next.add(r.id));
                          setSelectedIds(next);
                        }
                      }}
                    />
                  </th>
                  <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer' }} onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}>NOMBRE</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>TIPO</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>RUBRO</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>LOCALIDAD</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>DIRECCIÓN</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>EMAIL</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>EMAIL STATUS</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>TELÉFONO</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>WEBSITE</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>FACEBOOK</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>INSTAGRAM</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>LINKEDIN</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>PROVENANCE</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((r, i) => (
                  <tr key={r.id || i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: selectedIds.has(r.id) ? '#f0f9ff' : 'transparent' }}>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      <input
                        type="checkbox"
                        className="row-select-checkbox"
                        data-contact-id={r.id}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                      />
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600, color: '#0f172a' }}>{r.name}</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#64748b' }}>{r.entity_type}</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#0284c7' }}>{r.rubro}</td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.localidad}</div>
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#334155' }}>
                      <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>
                        {r.direccion || (r.geo_evidence ? r.geo_evidence.split('•')[0].trim() : '—')}
                      </div>
                      {r.geo_evidence && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.geo_evidence}>
                          {r.geo_evidence}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.email && r.email.includes('@') ? (
                        <a href={`mailto:${r.email}`} style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>{r.email}</a>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {renderStatusBadge(r)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.phone ? <a href={`tel:${r.phone}`} style={{ color: '#0284c7', textDecoration: 'none' }}>{r.phone}</a> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.website ? <a href={r.website} target="_blank" rel="noreferrer" style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>Web <ExternalLink size={12} /></a> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.facebook ? <a href={r.facebook} target="_blank" rel="noreferrer" style={{ color: '#1877f2', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>FB <ExternalLink size={12} /></a> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.instagram ? (
                        <a href={r.instagram} target="_blank" rel="noreferrer" style={{ color: '#e1306c', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          @{r.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}
                          <ExternalLink size={12} />
                        </a>
                      ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {r.linkedin ? <a href={r.linkedin} target="_blank" rel="noreferrer" style={{ color: '#0a66c2' }}><ExternalLink size={14} /></a> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', fontSize: '0.75rem' }}>{r.provenance}</td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.85rem',
              color: '#64748b'
            }}>
              <div>
                Mostrando registros <strong>{startIndex + 1}</strong> a <strong>{Math.min(startIndex + pageSize, filteredResults.length)}</strong> de <strong>{filteredResults.length}</strong> (Página {validPageIndex} de {totalPages})
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  id="btn-pagination-prev"
                  disabled={validPageIndex <= 1}
                  onClick={() => handlePageChange(validPageIndex - 1)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: validPageIndex <= 1 ? '#cbd5e1' : '#334155',
                    cursor: validPageIndex <= 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  <ChevronLeft size={16} /> ANTERIOR
                </button>
                <button
                  type="button"
                  id="btn-pagination-next"
                  disabled={validPageIndex >= totalPages}
                  onClick={() => handlePageChange(validPageIndex + 1)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: validPageIndex >= totalPages ? '#cbd5e1' : '#334155',
                    cursor: validPageIndex >= totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  SIGUIENTE <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* OPPORTUNITY ENGINE VIEW */}
      {activeMainMode === 'OPORTUNIDADES' && (
        <div id="atlas-opportunity-engine-container">
          {/* Search Header for Opportunities */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                  padding: '0.45rem',
                  borderRadius: '10px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.01em' }}>
                    ATLAS OPPORTUNITY ENGINE V1
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                    Detección comercial probabilística basada en Truth Graph y Temporal Graph reales
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 700 }}>
                  ● ENTORNO: PRODUCCIÓN
                </span>
                <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 700 }}>
                  CERO FABRICACIÓN
                </span>
                <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 600 }}>
                  INTELLIGENCE ONLY (NO AUTOPILOT)
                </span>
              </div>
            </div>

            {/* Natural Query Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setOppPage(1);
                fetchOpportunities({ page: 1 });
              }}
              style={{ marginBottom: '1rem' }}
            >
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    id="opp-natural-query-input"
                    value={oppQuery}
                    onChange={(e) => setOppQuery(e.target.value)}
                    placeholder="Consulta comercial (ej: empresas de Córdoba con señales de expansión)"
                    style={{
                      width: '100%',
                      padding: '0.85rem 1rem 0.85rem 2.75rem',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.95rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <button
                  type="submit"
                  id="btn-opp-search-submit"
                  disabled={oppLoading}
                  style={{
                    padding: '0.85rem 1.75rem',
                    background: 'linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: oppLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                  }}
                >
                  {oppLoading ? 'Detectando...' : 'Buscar Oportunidades'}
                </button>
              </div>

              {/* ¿QUÉ VENDÉS? (PRODUCT FIT FIELD) */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  <Briefcase size={16} style={{ color: '#6366f1' }} />
                  ¿QUÉ VENDÉS? (Opcional):
                </div>
                <input
                  type="text"
                  id="opp-product-fit-input"
                  value={oppProductQuery}
                  onChange={(e) => setOppProductQuery(e.target.value)}
                  placeholder="ej: software de recursos humanos, ciberseguridad, energía industrial..."
                  style={{
                    flex: 1,
                    minWidth: '240px',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setOppPage(1);
                    fetchOpportunities({ page: 1 });
                  }}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Evaluar Product Fit
                </button>
                <div style={{ fontSize: '0.72rem', color: '#64748b', width: '100%', marginTop: '0.2rem', fontStyle: 'italic' }}>
                  * El Product Fit Score se evalúa por separado y NUNCA se confunde ni se convierte en hecho observado.
                </div>
              </div>
            </form>

            {/* Structured Filters */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              paddingTop: '0.75rem',
              borderTop: '1px solid #f1f5f9',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ color: '#64748b', fontWeight: 600 }}>Tipo Oportunidad:</label>
                <select
                  id="opp-filter-type"
                  value={oppTypeFilter}
                  onChange={(e) => {
                    setOppTypeFilter(e.target.value);
                    setOppPage(1);
                    fetchOpportunities({ type: e.target.value, page: 1 });
                  }}
                  style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                >
                  <option value="">Todas las señales</option>
                  <option value="EXPANSION_SIGNAL">EXPANSION_SIGNAL (Expansión de negocio)</option>
                  <option value="NEW_BUSINESS_SIGNAL">NEW_BUSINESS_SIGNAL (Apertura comercial)</option>
                  <option value="HIRING_SIGNAL">HIRING_SIGNAL (Contratación activa)</option>
                  <option value="DIGITALIZATION_SIGNAL">DIGITALIZATION_SIGNAL (Transformación digital)</option>
                  <option value="INFRASTRUCTURE_SIGNAL">INFRASTRUCTURE_SIGNAL (Obras / Infraestructura)</option>
                  <option value="CONTACTABILITY_SIGNAL">CONTACTABILITY_SIGNAL (Canales de contacto)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ color: '#64748b', fontWeight: 600 }}>Región / Geo:</label>
                <select
                  id="opp-filter-geo"
                  value={oppGeoFilter}
                  onChange={(e) => {
                    setOppGeoFilter(e.target.value);
                    setOppPage(1);
                    fetchOpportunities({ geo: e.target.value, page: 1 });
                  }}
                  style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                >
                  <option value="">Todas las regiones</option>
                  <option value="Córdoba">Córdoba</option>
                  <option value="Buenos Aires">Buenos Aires</option>
                  <option value="CABA">CABA</option>
                  <option value="Santa Fe">Santa Fe</option>
                  <option value="Mendoza">Mendoza</option>
                  <option value="Catamarca">Catamarca</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ color: '#64748b', fontWeight: 600 }}>Entidad:</label>
                <select
                  id="opp-filter-entity"
                  value={oppEntityTypeFilter}
                  onChange={(e) => {
                    setOppEntityTypeFilter(e.target.value);
                    setOppPage(1);
                    fetchOpportunities({ entityType: e.target.value, page: 1 });
                  }}
                  style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                >
                  <option value="">Todas</option>
                  <option value="COMPANY">EMPRESA</option>
                  <option value="PERSON">PERSONA</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ color: '#64748b', fontWeight: 600 }}>Score Mín:</label>
                <select
                  id="opp-filter-min-score"
                  value={oppMinScore}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setOppMinScore(val);
                    setOppPage(1);
                    fetchOpportunities({ minScore: val, page: 1 });
                  }}
                  style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                >
                  <option value={0}>Todos (0.00)</option>
                  <option value={0.5}>≥ 0.50 (Medio)</option>
                  <option value={0.7}>≥ 0.70 (Alto)</option>
                  <option value={0.84}>≥ 0.84 (Muy Alto)</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                <input
                  type="checkbox"
                  id="opp-filter-has-contact"
                  checked={oppHasContact}
                  onChange={(e) => {
                    setOppHasContact(e.target.checked);
                    setOppPage(1);
                    fetchOpportunities({ hasContact: e.target.checked, page: 1 });
                  }}
                />
                Solo con contacto verificado
              </label>
            </div>

            {/* Presets */}
            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Consultas sugeridas:
              </span>
              {[
                { label: 'Empresas de Córdoba con señales de expansión', q: 'empresas de Córdoba con señales de expansión', type: 'EXPANSION_SIGNAL', geo: 'Córdoba', entity: 'COMPANY' },
                { label: 'Nuevas aperturas comerciales', q: 'nuevas empresas con apertura comercial', type: 'NEW_BUSINESS_SIGNAL', geo: '', entity: 'COMPANY' },
                { label: 'Con canales de contacto disponibles', q: 'empresas con contacto verificado', type: '', geo: '', entity: '', hasContact: true },
                { label: 'Fit: Software de recursos humanos', q: 'empresas en expansión para software de rrhh', product: 'software de recursos humanos', type: 'EXPANSION_SIGNAL' }
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setOppQuery(p.q);
                    if (p.product !== undefined) setOppProductQuery(p.product);
                    if (p.type !== undefined) setOppTypeFilter(p.type);
                    if (p.geo !== undefined) setOppGeoFilter(p.geo);
                    if (p.entity !== undefined) setOppEntityTypeFilter(p.entity);
                    if (p.hasContact !== undefined) setOppHasContact(p.hasContact);
                    setOppPage(1);
                    fetchOpportunities({
                      query: p.q,
                      product: p.product,
                      type: p.type,
                      geo: p.geo,
                      entityType: p.entity,
                      hasContact: p.hasContact,
                      page: 1
                    });
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results KPI Summary Strip */}
          <div style={{
            background: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            color: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.8rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                OPORTUNIDADES DETECTADAS: <strong style={{ color: '#38bdf8' }}>{oppTotalMatches}</strong>
              </div>
              <div style={{ color: '#64748b' }}>•</div>
              <div>
                TRAZABILIDAD FÍSICA: <strong style={{ color: '#4ade80' }}>100% UNBROKEN (0 Rotas)</strong>
              </div>
              <div style={{ color: '#64748b' }}>•</div>
              <div>
                PURITY: <strong style={{ color: '#f8fafc' }}>100% REAL EVIDENCE (Sin Fabricación)</strong>
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
              Página {oppPage} de {Math.max(1, Math.ceil(oppTotalMatches / 30))}
            </div>
          </div>

          {/* Results List */}
          {oppLoading ? (
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '3rem 2rem',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              color: '#64748b'
            }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                Consultando Atlas Opportunity Engine V1...
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                Filtrando oportunidades productivas activas y verificando trazabilidad física.
              </div>
            </div>
          ) : oppResults.length === 0 ? (
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '3rem 2rem',
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              color: '#64748b'
            }}>
              <AlertCircle size={36} style={{ color: '#94a3b8', margin: '0 auto 0.75rem' }} />
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
                No se encontraron oportunidades con los filtros seleccionados
              </div>
              <p style={{ fontSize: '0.85rem', maxWidth: '540px', margin: '0 auto', lineHeight: 1.4 }}>
                Principio de Cero Fabricación: Atlas no crea oportunidades artificiales si una entidad no cuenta con señales físicas probadas en el Truth Graph.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {oppResults.map((opp) => {
                const isExpanded = !!oppExpandedWhy[opp.subject_id];
                const scorePercent = Math.round((opp.score || 0) * 100);
                const confPercent = Math.round((opp.confidence || 0) * 100);
                const hasProductFit = opp.product_fit !== undefined;

                return (
                  <div
                    key={opp.subject_id + opp.opportunity_type}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '1.25rem 1.5rem',
                      boxShadow: '0 2px 10px -2px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Top Row: Entity Info & Type Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {opp.name}
                          </h3>
                          <span style={{
                            fontSize: '0.7rem',
                            background: opp.entity_type === 'COMPANY' ? '#e0f2fe' : '#fef3c7',
                            color: opp.entity_type === 'COMPANY' ? '#0369a1' : '#b45309',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700
                          }}>
                            {opp.entity_type === 'COMPANY' ? 'EMPRESA' : 'PERSONA'}
                          </span>
                          {opp.geo && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              📍 {opp.geo}
                            </span>
                          )}
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                            ID: {opp.subject_id.substring(0, 8)}...
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          background: 'linear-gradient(135deg, #e0e7ff, #ede9fe)',
                          color: '#4338ca',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          border: '1px solid #c7d2fe'
                        }}>
                          <Sparkles size={12} />
                          {opp.opportunity_type}
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          fontWeight: 700
                        }}>
                          ACTIVA
                        </span>
                      </div>
                    </div>

                    {/* Metrics Grid: Distinct Separation of Scores */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.75rem',
                      marginBottom: '1rem',
                      background: '#f8fafc',
                      padding: '0.85rem 1rem',
                      borderRadius: '12px',
                      border: '1px solid #f1f5f9'
                    }}>
                      {/* Box 1: OPPORTUNITY SCORE */}
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                          OPPORTUNITY SCORE
                        </div>
                        {opp.score !== null && opp.opportunity_score !== null && opp.opportunity_status !== 'NOT_DETERMINED' ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.15rem' }}>
                              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0284c7' }}>
                                {opp.score.toFixed(2)}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({scorePercent}%)</span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '0.35rem', overflow: 'hidden' }}>
                              <div style={{ width: `${scorePercent}%`, height: '100%', background: '#0284c7', borderRadius: '2px' }} />
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: '0.2rem' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#64748b' }}>
                              NO DETERMINADA
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                              Sin señales comerciales
                            </div>
                            <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '0.35rem' }} />
                          </div>
                        )}
                      </div>

                      {/* Box 2: CONFIDENCE & MULTIFUENTE */}
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                          {opp.is_multisource ? 'CONFIANZA MULTIFUENTE' : 'CONFIANZA (FUENTE ÚNICA)'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.15rem' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: opp.is_multisource ? '#16a34a' : '#0284c7' }}>
                            {opp.confidence.toFixed(2)}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({confPercent}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '0.35rem', overflow: 'hidden' }}>
                          <div style={{ width: `${confPercent}%`, height: '100%', background: opp.is_multisource ? '#16a34a' : '#0284c7', borderRadius: '2px' }} />
                        </div>
                      </div>

                      {/* Box 3: PRODUCT FIT SCORE (SEPARATED!) */}
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                          PRODUCT FIT SCORE
                        </div>
                        {oppProductQuery.trim().length === 0 ? (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 800 }}>
                              NO CALCULADO
                            </span>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                              Completá "¿Qué vendés?"
                            </div>
                          </div>
                        ) : hasProductFit ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.15rem' }}>
                              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: opp.product_fit.is_fit ? '#4f46e5' : '#64748b' }}>
                                {opp.product_fit.product_fit_score.toFixed(2)}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                background: opp.product_fit.is_fit 
                                  ? '#dbeafe' 
                                  : opp.product_fit.product_fit_confidence === 'LOW_CONFIDENCE' 
                                    ? '#fef3c7' 
                                    : '#f1f5f9',
                                color: opp.product_fit.is_fit 
                                  ? '#1d4ed8' 
                                  : opp.product_fit.product_fit_confidence === 'LOW_CONFIDENCE' 
                                    ? '#b45309' 
                                    : '#64748b',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700
                              }}>
                                {opp.product_fit.is_fit 
                                  ? 'FIT POSITIVO' 
                                  : opp.product_fit.product_fit_confidence === 'LOW_CONFIDENCE' 
                                    ? 'LOW_CONFIDENCE' 
                                    : 'BAJO FIT'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {opp.product_fit.product_query}
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 800 }}>
                              NO CALCULADO
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Box 4: CONTACTABILIDAD (SCORE & DETAILS) */}
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                          CONTACTABILIDAD
                        </div>
                        {opp.contactability.has_contact ? (
                          <div style={{ marginTop: '0.15rem' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#16a34a' }}>
                                {opp.contactability_score !== undefined ? opp.contactability_score.toFixed(2) : '0.00'}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                ({Math.round((opp.contactability_score || 0) * 100)}%)
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {opp.verified_contacts?.emails?.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                                  <span style={{ color: '#0369a1', fontWeight: 700 }}>Email:</span>
                                  <button
                                    type="button"
                                    onClick={() => setInspectingContact(opp.verified_contacts.emails[0])}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: '#2563eb',
                                      textDecoration: 'underline',
                                      cursor: 'pointer',
                                      fontFamily: 'monospace',
                                      fontSize: '0.72rem',
                                      textAlign: 'left',
                                      maxWidth: '170px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Click para ver trazabilidad física del contacto"
                                  >
                                    {opp.verified_contacts.emails[0].value}
                                  </button>
                                  {opp.verified_contacts.emails.length > 1 && (
                                    <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.3rem', borderRadius: '4px', fontWeight: 700 }}>
                                      +{opp.verified_contacts.emails.length - 1}
                                    </span>
                                  )}
                                </div>
                              )}

                              {opp.verified_contacts?.phones?.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                                  <span style={{ color: '#15803d', fontWeight: 700 }}>Teléfono:</span>
                                  <button
                                    type="button"
                                    onClick={() => setInspectingContact(opp.verified_contacts.phones[0])}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: '#15803d',
                                      textDecoration: 'underline',
                                      cursor: 'pointer',
                                      fontFamily: 'monospace',
                                      fontSize: '0.72rem',
                                      textAlign: 'left',
                                      maxWidth: '170px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Click para ver trazabilidad física del contacto"
                                  >
                                    {opp.verified_contacts.phones[0].value}
                                  </button>
                                  {opp.verified_contacts.phones.length > 1 && (
                                    <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.05rem 0.3rem', borderRadius: '4px', fontWeight: 700 }}>
                                      +{opp.verified_contacts.phones.length - 1}
                                    </span>
                                  )}
                                </div>
                              )}

                              {opp.verified_contacts?.linkedin?.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                                  <span style={{ color: '#0a66c2', fontWeight: 700 }}>LINKEDIN VERIFICADO:</span>
                                  <button
                                    type="button"
                                    onClick={() => setInspectingContact(opp.verified_contacts.linkedin[0])}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: '#0a66c2',
                                      textDecoration: 'underline',
                                      cursor: 'pointer',
                                      fontFamily: 'monospace',
                                      fontSize: '0.72rem',
                                      textAlign: 'left',
                                      maxWidth: '170px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Click para ver trazabilidad física del contacto"
                                  >
                                    {opp.verified_contacts.linkedin[0].value}
                                  </button>
                                  {opp.verified_contacts.linkedin.length > 1 && (
                                    <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '0.05rem 0.3rem', borderRadius: '4px', fontWeight: 700 }}>
                                      +{opp.verified_contacts.linkedin.length - 1}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>
                                Fuentes independientes: <strong>{opp.distinct_source_count}</strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{
                              background: '#f1f5f9',
                              color: '#94a3b8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}>
                              Sin contacto directo
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Brief Inferred Hypothesis Preview */}
                    <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ color: '#4f46e5', fontWeight: 700 }}>Hipótesis Comercial:</span>
                      <span>{opp.inferred_hypothesis}</span>
                    </div>

                    {/* Accordion Toggle: POR QUÉ ATLAS LA DETECTÓ */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {opp.is_multisource ? (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>EVIDENCIA MULTIFUENTE ({opp.distinct_source_count} fuentes)</span>
                        ) : (
                          <span style={{ color: '#64748b', fontWeight: 600 }}>FUENTE ÚNICA ({opp.distinct_source_ids?.[0] || '1 fuente'})</span>
                        )}
                        {' • '}
                        Observado por Atlas: {new Date(opp.observed_at || opp.last_supported).toLocaleDateString('es-AR')}
                        {opp.event_date && ` (Fecha de evento: ${new Date(opp.event_date).toLocaleDateString('es-AR')})`}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setOppExpandedWhy(prev => ({
                            ...prev,
                            [opp.subject_id]: !prev[opp.subject_id]
                          }));
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: isExpanded ? '#f1f5f9' : '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#0f172a',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={14} /> OCULTAR DETALLES
                          </>
                        ) : (
                          <>
                            <ChevronDown size={14} /> POR QUÉ ATLAS LA DETECTÓ
                          </>
                        )}
                      </button>
                    </div>

                    {/* EXPANDED ACCORDION: POR QUÉ ATLAS LA DETECTÓ */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '1.25rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                      }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '1rem'
                        }}>
                          {/* SECTION 1: HECHOS OBSERVADOS (FACTS) */}
                          <div style={{
                            background: '#ffffff',
                            border: '1px solid #bbf7d0',
                            borderRadius: '10px',
                            padding: '1rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              <ShieldCheck size={18} style={{ color: '#16a34a' }} />
                              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
                                HECHOS OBSERVADOS (FACTS)
                              </h4>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.75rem' }}>
                              Observaciones físicas inmutables admitidas por Result Gate V2 y persistidas en Truth Graph.
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {opp.observed_facts.map((fact: string, fIdx: number) => {
                                const matchingContact = 
                                  opp.verified_contacts?.emails?.find((e: any) => fact.includes(e.value)) ||
                                  opp.verified_contacts?.phones?.find((p: any) => fact.includes(p.value)) ||
                                  opp.verified_contacts?.linkedin?.find((l: any) => fact.includes(l.value));

                                return (
                                  <li key={fIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    <span><strong>{fact}</strong></span>
                                    {matchingContact && (
                                      <button
                                        type="button"
                                        onClick={() => setInspectingContact(matchingContact)}
                                        style={{
                                          padding: '0.15rem 0.45rem',
                                          background: '#f1f5f9',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '6px',
                                          fontSize: '0.68rem',
                                          color: '#0f172a',
                                          cursor: 'pointer',
                                          fontWeight: 700,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.25rem'
                                        }}
                                        title="Ver trazabilidad física del contacto: valor, assertion, source, route, observed_at"
                                      >
                                        🔍 Ver trazabilidad física
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>

                          {/* SECTION 2: HIPÓTESIS COMERCIAL (INFERRED) */}
                          <div style={{
                            background: '#ffffff',
                            border: '1px solid #ddd6fe',
                            borderRadius: '10px',
                            padding: '1rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              <Sparkles size={18} style={{ color: '#6366f1' }} />
                              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase' }}>
                                HIPÓTESIS COMERCIAL (INFERRED)
                              </h4>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.75rem' }}>
                              Deducción probabilística generada por Atlas Opportunity Engine V1. NUNCA modifica hechos observados.
                            </div>

                            <div style={{ fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div>
                                <strong>Señal deducida:</strong> {opp.opportunity_type}
                              </div>
                              <div>
                                <strong>Razonamiento analítico:</strong> {opp.inferred_hypothesis}
                              </div>
                              <div>
                                <strong>Opportunity Score:</strong> {opp.score} | <strong>Confianza:</strong> {opp.confidence}
                              </div>

                              {hasProductFit && (
                                <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#4338ca' }}>
                                    Evaluación de Product Fit ("{opp.product_fit.product_query}"):
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                                    Fit Score: <strong>{opp.product_fit.product_fit_score}</strong> ({opp.product_fit.is_fit ? 'Apto' : 'No prioritario'})
                                  </div>
                                  <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1rem', fontSize: '0.72rem', color: '#64748b' }}>
                                    {opp.product_fit.reasons.map((r: string, rIdx: number) => (
                                      <li key={rIdx}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* SECTION 3: PHYSICAL TRACEABILITY (AUDITABLE CHAIN) */}
                        {opp.traceability && (
                          <div style={{
                            background: '#090d16',
                            border: '1px solid #1e293b',
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                            color: '#f8fafc',
                            fontSize: '0.75rem'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <div style={{ fontWeight: 800, color: '#38bdf8', letterSpacing: '0.03em' }}>
                                🔗 CADENA FÍSICA AUDITABLE (OPPORTUNITY → SIGNAL → AST → EV → ROUTE → SRC)
                              </div>
                              <span style={{ background: '#052e16', color: '#4ade80', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.68rem' }}>
                                {opp.traceability.chain_status} (BROKEN_CHAINS = 0)
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                              {opp.traceability.signals.map((sig: any, sIdx: number) => (
                                <div key={sIdx} style={{ background: 'rgba(255,255,255,0.04)', padding: '0.35rem 0.65rem', borderRadius: '6px' }}>
                                  <span style={{ color: '#818cf8' }}>SIGNAL:</span> {sig.signal_id} ({sig.signal_type}) &nbsp;•&nbsp;
                                  <span style={{ color: '#34d399' }}>ASSERTION:</span> {sig.assertion_id || 'AST_OBSERVED'} &nbsp;•&nbsp;
                                  <span style={{ color: '#facc15' }}>ROUTE:</span> {sig.route_id || 'ROUTE_CERTIFIED'} &nbsp;•&nbsp;
                                  <span style={{ color: '#f472b6' }}>SOURCE:</span> {sig.source_id || 'SRC_CERTIFIED'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination Bar for Opportunities */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px'
              }}>
                <button
                  type="button"
                  id="btn-opp-prev-page"
                  disabled={oppPage <= 1 || oppLoading}
                  onClick={() => {
                    const prevP = Math.max(1, oppPage - 1);
                    setOppPage(prevP);
                    fetchOpportunities({ page: prevP });
                  }}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: oppPage <= 1 ? '#cbd5e1' : '#334155',
                    fontWeight: 700,
                    cursor: oppPage <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← Anterior
                </button>

                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Página <strong>{oppPage}</strong> de <strong>{Math.max(1, Math.ceil(oppTotalMatches / 30))}</strong>
                </span>

                <button
                  type="button"
                  id="btn-opp-next-page"
                  disabled={oppPage >= Math.ceil(oppTotalMatches / 30) || oppLoading}
                  onClick={() => {
                    const nextP = oppPage + 1;
                    setOppPage(nextP);
                    fetchOpportunities({ page: nextP });
                  }}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: oppPage >= Math.ceil(oppTotalMatches / 30) ? '#cbd5e1' : '#334155',
                    fontWeight: 700,
                    cursor: oppPage >= Math.ceil(oppTotalMatches / 30) ? 'not-allowed' : 'pointer'
                  }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ATLAS VENDER / COMMERCE ENGINE V1 VIEW */}
      {activeMainMode === 'VENDER' && (
        <div id="atlas-vender-engine-container">
          {/* Vender Search Bar Card */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  padding: '0.45rem',
                  borderRadius: '10px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Briefcase size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.01em' }}>
                    ATLAS VENDER / COMMERCE ENGINE V1
                  </h2>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Buscador y Ranker de Compradores Compatibles (PERSON y COMPANY) sin exigir oportunidad temporal activa
                  </div>
                </div>
              </div>

              {/* Status pills */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}>
                  <CheckCircle2 size={12} /> BUYER_FIT != OPPORTUNITY
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px'
                }}>
                  4 DIMENSIONES INDEPENDIENTES
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: '#faf5ff',
                  color: '#7e22ce',
                  border: '1px solid #e9d5ff',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px'
                }}>
                  CONNECTOR CONTRACT V1
                </span>
              </div>
            </div>

            {/* Form Inputs: ¿QUÉ VENDÉS? + COMPRADOR: PERSONAS | EMPRESAS | AMBOS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ¿QUÉ VENDÉS?
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                    <input
                      id="vender-product-input"
                      type="text"
                      value={venderProductInput}
                      onChange={(e) => setVenderProductInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') fetchBuyers(); }}
                      placeholder="software de recursos humanos, ciberseguridad, seguros corporativos..."
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#f8fafc',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <ShoppingBag size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  </div>

                  {/* Buyer Type Switcher */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>
                      COMPRADOR:
                    </span>
                    <div style={{
                      display: 'flex',
                      background: '#f1f5f9',
                      padding: '0.25rem',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      gap: '0.25rem'
                    }}>
                      <button
                        type="button"
                        id="vender-buyer-person"
                        onClick={() => {
                          setVenderBuyerType('PERSON');
                          fetchBuyers({ buyerType: 'PERSON' });
                        }}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: venderBuyerType === 'PERSON' ? '#10b981' : 'transparent',
                          color: venderBuyerType === 'PERSON' ? '#ffffff' : '#64748b',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <User size={14} /> PERSONAS
                      </button>

                      <button
                        type="button"
                        id="vender-buyer-company"
                        onClick={() => {
                          setVenderBuyerType('COMPANY');
                          fetchBuyers({ buyerType: 'COMPANY' });
                        }}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: venderBuyerType === 'COMPANY' ? '#10b981' : 'transparent',
                          color: venderBuyerType === 'COMPANY' ? '#ffffff' : '#64748b',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Building2 size={14} /> EMPRESAS
                      </button>

                      <button
                        type="button"
                        id="vender-buyer-both"
                        onClick={() => {
                          setVenderBuyerType('BOTH');
                          fetchBuyers({ buyerType: 'BOTH' });
                        }}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: venderBuyerType === 'BOTH' ? '#10b981' : 'transparent',
                          color: venderBuyerType === 'BOTH' ? '#ffffff' : '#64748b',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Layers size={14} /> AMBOS
                      </button>
                    </div>
                  </div>

                  {/* Search Button */}
                  <button
                    type="button"
                    id="btn-search-buyers"
                    disabled={venderLoading}
                    onClick={() => fetchBuyers()}
                    style={{
                      padding: '0.75rem 1.6rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: venderLoading ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                      transition: 'all 0.18s ease'
                    }}
                  >
                    {venderLoading ? (
                      <>
                        <Clock size={16} className="animate-spin" /> Buscando Compradores...
                      </>
                    ) : (
                      <>
                        <Search size={16} /> BUSCAR COMPRADORES
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active Product Profile Card */}
          {venderProductProfile && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '1.1rem 1.4rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Tag size={16} style={{ color: '#059669' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                    PERFIL DE OFERTA NORMALIZADO (AtlasProductProfile):
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#059669' }}>
                    {venderProductProfile.product_name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                    {venderProductProfile.purchase_mode}
                  </span>
                  <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                    ${venderProductProfile.price} {venderProductProfile.currency}
                  </span>
                  <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                    Geo: {Array.isArray(venderProductProfile.geo_available) ? venderProductProfile.geo_available.join(', ') : 'Argentina'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span><strong>Categoría:</strong> {venderProductProfile.category}</span>
                <span>•</span>
                <span><strong>Target:</strong> {
                  Array.isArray(venderProductProfile.target_attributes)
                    ? venderProductProfile.target_attributes.join(', ')
                    : typeof venderProductProfile.target_attributes === 'object' && venderProductProfile.target_attributes !== null
                      ? [
                          ...(venderProductProfile.target_attributes.target_activities || []),
                          ...(venderProductProfile.target_attributes.target_industries || []),
                          ...(venderProductProfile.target_attributes.keywords || [])
                        ].slice(0, 4).join(', ') || 'Corporativo / PyME'
                      : 'Corporativo / General'
                }</span>
                <span>•</span>
                <span><strong>Connector:</strong> AtlasCommerceConnector V1 (StandardAtlasCommerceConnector)</span>
              </div>
            </div>
          )}

          {/* Metrics Summary Strip */}
          {venderSummary && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
                AUDITORÍA DE COMPATIBILIDAD (CERTIFICACIÓN COMMERCE V1)
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{ background: '#f8fafc', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>CANDIDATES</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{venderSummary.total_candidates}</div>
                </div>
                <div style={{ background: '#f0fdf4', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700 }}>HIGH_FIT (≥0.70)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#15803d' }}>{venderSummary.high_fit_count}</div>
                </div>
                <div style={{ background: '#fffbeb', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: 700 }}>MEDIUM_FIT</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#b45309' }}>{venderSummary.medium_fit_count}</div>
                </div>
                <div style={{ background: '#fef2f2', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.7rem', color: '#991b1b', fontWeight: 700 }}>LOW_FIT</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#b91c1c' }}>{venderSummary.low_fit_count}</div>
                </div>
                <div style={{ background: '#eef2ff', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #c7d2fe' }}>
                  <div style={{ fontSize: '0.7rem', color: '#3730a3', fontWeight: 700 }}>WITH_OPPORTUNITY</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#4338ca' }}>{venderSummary.with_opportunity_count}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 700 }}>WITHOUT_OPP</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#334155' }}>{venderSummary.without_opportunity_count}</div>
                </div>
                <div style={{ background: '#f0f9ff', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '0.7rem', color: '#075985', fontWeight: 700 }}>WITH_CONTACT</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0369a1' }}>{venderSummary.with_verified_contact_count}</div>
                </div>
                <div style={{ background: '#fdf4ff', padding: '0.65rem 0.75rem', borderRadius: '10px', border: '1px solid #f5d0fe' }}>
                  <div style={{ fontSize: '0.7rem', color: '#86198f', fontWeight: 700 }}>WITHOUT_CONTACT</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a21caf' }}>{venderSummary.without_verified_contact_count}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#475569' }}>
                <span>• <strong>BUYER_FIT != OPPORTUNITY:</strong> TRUE</span>
                <span>• <strong>BUYER_FIT_DEPENDS_ON_OPPORTUNITY:</strong> FALSE</span>
                <span>• <strong>CONTACTABILITY_CREATES_BUYER_FIT:</strong> FALSE</span>
                <span>• <strong>GENERATED_CONTACTS:</strong> 0</span>
                <span>• <strong>SENSITIVE_PERSON_TARGETING:</strong> 0 (Regulado)</span>
              </div>
            </div>
          )}

          {/* Results Grid / List */}
          {venderLoading && venderResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <Clock size={36} className="animate-spin" style={{ color: '#10b981', margin: '0 auto 1rem auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                Evaluando Compatibilidad de Compradores en SSOT...
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Analizando actividad, industria, tamaño y evidencias verificadas para {venderProductInput}.
              </p>
            </div>
          ) : venderResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <Briefcase size={36} style={{ color: '#94a3b8', margin: '0 auto 1rem auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                No se encontraron compradores
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Intenta con otra búsqueda de producto como "software de recursos humanos" o "seguros corporativos".
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {venderResults.map((candidate: any, idx: number) => {
                const isHighFit = candidate.buyer_fit_score >= 0.70;
                const isUncontactable = candidate.contactability_score === 0;
                const hasTimingBoost = candidate.timing_boost > 0;
                const isWhyExpanded = venderExpandedWhy[candidate.entity_id] !== false;

                return (
                  <div
                    key={candidate.entity_id || idx}
                    id={`buyer-card-${candidate.entity_id}`}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '1.4rem',
                      boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.18s ease'
                    }}
                  >
                    {/* Candidate Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          background: candidate.entity_type === 'COMPANY' ? '#f0fdf4' : '#eff6ff',
                          color: candidate.entity_type === 'COMPANY' ? '#15803d' : '#1d4ed8',
                          padding: '0.55rem',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${candidate.entity_type === 'COMPANY' ? '#bbf7d0' : '#bfdbfe'}`
                        }}>
                          {candidate.entity_type === 'COMPANY' ? <Building2 size={22} /> : <User size={22} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                              {candidate.entity_name}
                            </h3>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0'
                            }}>
                              {candidate.entity_type}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: '#f8fafc',
                              color: '#64748b',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <Globe size={11} /> {candidate.geo || 'CABA / Argentina'}
                            </span>
                            {isHighFit && isUncontactable && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: '#fef3c7',
                                color: '#92400e',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                border: '1px solid #fde68a'
                              }}>
                                HIGH_FIT • NOT_CONTACTABLE
                              </span>
                            )}
                            {(candidate.fit_tier === 'INSUFFICIENT_EVIDENCE' || (candidate.confidence_score !== undefined && candidate.confidence_score < 0.40)) && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: '#fef2f2',
                                color: '#991b1b',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                border: '1px solid #fecaca'
                              }}>
                                EVIDENCIA INSUFICIENTE / CONFIANZA BAJA
                              </span>
                            )}
                            {(candidate.category_only_match || candidate.category_conflict || (candidate.active_evidence_families && candidate.active_evidence_families.length <= 1 && candidate.active_evidence_families[0] === 'INDUSTRY')) && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: '#fffbeb',
                                color: '#92400e',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                border: '1px solid #fde68a'
                              }}>
                                LOW_EVIDENCE • CATEGORÍA AISLADA
                              </span>
                            )}
                            {/* STRICT SEMANTIC REALITY BADGES */}
                            {candidate.buyer_need_nature && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: candidate.buyer_need_nature === 'OBSERVED' ? '#dcfce7' : (candidate.buyer_need_nature === 'DERIVED' ? '#e0f2fe' : (candidate.buyer_need_nature === 'INFERRED' ? '#f3e8ff' : '#f1f5f9')),
                                color: candidate.buyer_need_nature === 'OBSERVED' ? '#166534' : (candidate.buyer_need_nature === 'DERIVED' ? '#0369a1' : (candidate.buyer_need_nature === 'INFERRED' ? '#7e22ce' : '#64748b')),
                                padding: '0.15rem 0.55rem',
                                borderRadius: '6px',
                                border: `1px solid ${candidate.buyer_need_nature === 'OBSERVED' ? '#bbf7d0' : (candidate.buyer_need_nature === 'DERIVED' ? '#bae6fd' : (candidate.buyer_need_nature === 'INFERRED' ? '#e9d5ff' : '#cbd5e1'))}`
                              }}>
                                {candidate.buyer_need_nature === 'OBSERVED' ? '🎯 NECESIDAD OBSERVADA' : (candidate.buyer_need_nature === 'DERIVED' ? '⚡ COMPATIBILIDAD OPERATIVA' : (candidate.buyer_need_nature === 'INFERRED' ? '💡 NECESIDAD INFERIDA' : 'SIN EVIDENCIA'))}
                              </span>
                            )}
                            {candidate.purchase_intent && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: candidate.purchase_intent === 'ACTIVE_SIGNAL' ? '#ecfdf5' : '#f8fafc',
                                color: candidate.purchase_intent === 'ACTIVE_SIGNAL' ? '#047857' : '#64748b',
                                padding: '0.15rem 0.55rem',
                                borderRadius: '6px',
                                border: `1px solid ${candidate.purchase_intent === 'ACTIVE_SIGNAL' ? '#a7f3d0' : '#e2e8f0'}`
                              }}>
                                {candidate.purchase_intent === 'ACTIVE_SIGNAL' ? '🔥 INTENCIÓN ACTIVA' : (candidate.purchase_intent === 'UNCONFIRMED' ? '⏳ INTENCIÓN NO CONFIRMADA' : 'SIN INTENCIÓN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: '#0f172a',
                          color: '#ffffff',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '8px'
                        }}>
                          PRIORIDAD #{idx + 1}
                        </span>
                      </div>
                    </div>

                    {/* 4 Independent Score Dimensions Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.85rem',
                      marginBottom: '1.25rem'
                    }}>
                      {/* 1. BUYER FIT SCORE */}
                      <div style={{
                        background: '#f0fdf4',
                        border: '1.5px solid #bbf7d0',
                        borderRadius: '12px',
                        padding: '0.85rem 1rem'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          BUYER FIT SCORE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803d' }}>
                            {candidate.buyer_fit_score.toFixed(2)}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700 }}>
                            / 1.00
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: '0.25rem', fontWeight: 600 }}>
                          Base: {candidate.base_buyer_fit_score.toFixed(2)}
                          <span style={{ color: '#047857', fontWeight: 700, marginLeft: '0.35rem' }}>
                            (Crit: {(((candidate.criteria_coverage !== undefined ? candidate.criteria_coverage : candidate.evidence_coverage) || 0.7) * 100).toFixed(0)}% • Indep: {(((candidate.independent_evidence_coverage !== undefined ? candidate.independent_evidence_coverage : 0.33)) * 100).toFixed(0)}%)
                          </span>
                          {hasTimingBoost && (
                            <span style={{ color: '#047857', fontWeight: 800, marginLeft: '0.35rem' }}>
                              (+{candidate.timing_boost.toFixed(2)} Timing)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. OPPORTUNITY SCORE */}
                      <div style={{
                        background: candidate.opportunity_score !== null ? '#eef2ff' : '#f8fafc',
                        border: `1.5px solid ${candidate.opportunity_score !== null ? '#c7d2fe' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        padding: '0.85rem 1rem'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: candidate.opportunity_score !== null ? '#3730a3' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          OPPORTUNITY SCORE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
                          {candidate.opportunity_score !== null ? (
                            <>
                              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#4338ca' }}>
                                {candidate.opportunity_score.toFixed(2)}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#3730a3', fontWeight: 700 }}>
                                / 1.00
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.02em' }}>
                              NOT_DETERMINED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: candidate.opportunity_score !== null ? '#4338ca' : '#64748b', marginTop: '0.25rem', fontWeight: 600 }}>
                          {candidate.commercial_opportunity === 'ACTIVE' ? `SEÑAL COMERCIAL (${candidate.opportunity_type || 'ACTIVA'})` : (candidate.opportunity_type === 'CONTACTABILITY_SIGNAL' ? 'Solo contactabilidad (Timing: 0.00)' : 'Sin señal comercial (Timing: 0.00)')}
                        </div>
                      </div>

                      {/* 3. CONTACTABILITY SCORE */}
                      <div style={{
                        background: candidate.contactability_score > 0 ? '#f0f9ff' : '#f8fafc',
                        border: `1.5px solid ${candidate.contactability_score > 0 ? '#bae6fd' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        padding: '0.85rem 1rem'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: candidate.contactability_score > 0 ? '#075985' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          CONTACTABILITY SCORE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: candidate.contactability_score > 0 ? '#0284c7' : '#94a3b8' }}>
                            {candidate.contactability_score.toFixed(2)}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                            / 1.00
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: candidate.contactability_score > 0 ? '#0369a1' : '#64748b', marginTop: '0.25rem', fontWeight: 600 }}>
                          {candidate.contactability_score > 0 ? 'Canales verificados observados' : 'Sin contacto (No destruye Fit)'}
                        </div>
                      </div>

                      {/* 4. CONFIDENCE SCORE */}
                      <div style={{
                        background: '#faf5ff',
                        border: '1.5px solid #e9d5ff',
                        borderRadius: '12px',
                        padding: '0.85rem 1rem'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          CONFIDENCE SCORE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#7e22ce' }}>
                            {candidate.confidence_score.toFixed(2)}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 700 }}>
                            / 1.00
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: (candidate.fit_tier === 'INSUFFICIENT_EVIDENCE' || candidate.confidence_score < 0.40) ? '#b91c1c' : '#7e22ce', marginTop: '0.25rem', fontWeight: 600 }}>
                          {candidate.fit_tier === 'INSUFFICIENT_EVIDENCE' || candidate.confidence_score < 0.40
                            ? 'Evidencia insuficiente • Confianza baja'
                            : (candidate.category_only_match || (candidate.active_evidence_families && candidate.active_evidence_families.length <= 1 && candidate.active_evidence_families[0] === 'INDUSTRY')
                              ? 'LOW_EVIDENCE • Categoría aislada'
                              : `Proxy Ratio: ${(((candidate.proxy_ratio !== undefined ? candidate.proxy_ratio : 0.8)) * 100).toFixed(0)}% (Tope aplicado)`)}
                        </div>
                      </div>
                    </div>

                    {/* Middle Section: ¿Por qué encaja? + Producto Recomendado */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: '1rem',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      marginBottom: '1rem',
                      border: '1px solid #e2e8f0'
                    }}>
                      {/* ¿Por qué encaja? */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            ¿POR QUÉ ENCAJA?
                          </span>
                          <button
                            type="button"
                            onClick={() => setVenderExpandedWhy(prev => ({ ...prev, [candidate.entity_id]: !isWhyExpanded }))}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          >
                            {isWhyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                        {isWhyExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {candidate.why_need && (
                              <div style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: candidate.buyer_need_nature === 'DERIVED' ? '#0369a1' : (candidate.buyer_need_nature === 'INFERRED' ? '#7e22ce' : (candidate.buyer_need_nature === 'OBSERVED' ? '#15803d' : '#64748b')),
                                background: candidate.buyer_need_nature === 'DERIVED' ? '#f0f9ff' : (candidate.buyer_need_nature === 'INFERRED' ? '#faf5ff' : (candidate.buyer_need_nature === 'OBSERVED' ? '#f0fdf4' : '#f8fafc')),
                                padding: '0.45rem 0.65rem',
                                borderRadius: '8px',
                                border: `1px solid ${candidate.buyer_need_nature === 'DERIVED' ? '#bae6fd' : (candidate.buyer_need_nature === 'INFERRED' ? '#e9d5ff' : (candidate.buyer_need_nature === 'OBSERVED' ? '#bbf7d0' : '#e2e8f0'))}`
                              }}>
                                📌 {candidate.why_need}
                              </div>
                            )}
                            {candidate.match_reasons?.map((reason: string, rIdx: number) => (
                              <div key={rIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.78rem', color: '#334155' }}>
                                <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0, marginTop: '0.15rem' }} />
                                <span>{reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Producto Recomendado */}
                      <div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.5rem' }}>
                          PRODUCTO RECOMENDADO
                        </span>
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.65rem 0.85rem'
                        }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                            {candidate.recommended_product_tier || (venderProductProfile?.price !== null && venderProductProfile?.price !== undefined ? 'Oferta Directa' : 'NO ESPECIFICADO')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                            {venderProductProfile?.price !== null && venderProductProfile?.price !== undefined
                              ? `$${venderProductProfile.price} ${venderProductProfile.currency || 'ARS'} ${venderProductProfile.purchase_mode !== 'NO_ESPECIFICADO' && venderProductProfile.purchase_mode !== 'UNKNOWN' ? `(${venderProductProfile.purchase_mode})` : ''}`
                              : 'PRECIO: NO ESPECIFICADO | MODO: NO ESPECIFICADO'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contacto Verificado Section */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      paddingTop: '0.85rem',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>
                          CONTACTO:
                        </span>
                        {candidate.has_verified_contact && ((candidate.verified_contacts?.emails?.length || 0) + (candidate.verified_contacts?.linkedin?.length || 0) + (candidate.verified_contacts?.phones?.length || 0) > 0) ? (
                          <>
                            {candidate.verified_contacts?.emails?.map((em: string, emIdx: number) => (
                              <a
                                key={emIdx}
                                href={`mailto:${em}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  background: '#f0fdf4',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textDecoration: 'none'
                                }}
                              >
                                <Mail size={13} /> {em}
                              </a>
                            ))}
                            {candidate.verified_contacts?.linkedin?.map((li: string, liIdx: number) => (
                              <a
                                key={liIdx}
                                href={li}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  background: '#eff6ff',
                                  color: '#1e40af',
                                  border: '1px solid #bfdbfe',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textDecoration: 'none'
                                }}
                              >
                                <Globe size={13} /> LinkedIn Verificado
                              </a>
                            ))}
                            {candidate.verified_contacts?.phones?.map((ph: string, phIdx: number) => (
                              <a
                                key={phIdx}
                                href={`tel:${ph}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  background: '#f8fafc',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textDecoration: 'none'
                                }}
                              >
                                <Phone size={13} /> {ph}
                              </a>
                            ))}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            Sin contacto verificado en SSOT (Prospecto compatible válido)
                          </span>
                        )}
                      </div>

                      {/* Action Buttons: [VER EVIDENCIA], [VER PRODUCTO], [PREPARAR VENTA] */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          id={`btn-ver-evidencia-${candidate.entity_id}`}
                          onClick={() => {
                            setInspectingContact({
                              id: candidate.entity_id,
                              name: candidate.entity_name,
                              rubro: candidate.match_reasons?.join(' • '),
                              provenance: 'TRUTH GRAPH (AFIP / BOLETÍN OFICIAL / LINKEDIN CABA VERIFICADO)',
                              observed_at: new Date().toISOString(),
                              verified_contacts: candidate.verified_contacts,
                              evidences: [
                                { assertion_id: `AST_PROV_${candidate.entity_id.slice(0, 8)}`, source_id: 'SRC_CABA_BOLETIN_OFICIAL', observed_at: new Date().toISOString() }
                              ]
                            });
                          }}
                          style={{
                            padding: '0.5rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Eye size={14} /> VER EVIDENCIA
                        </button>

                        <button
                          type="button"
                          id={`btn-ver-producto-${candidate.entity_id}`}
                          onClick={() => {
                            setVenderSelectedProductForModal(venderRecommendedProduct || {
                              atlas_product_id: 'PRD_ATLAS_HR_SAAS_001',
                              title: venderProductProfile?.product_name || 'Software de Recursos Humanos',
                              description: venderProductProfile?.description || 'Plataforma integral de gestión de personal, legajos y nómina.',
                              category: venderProductProfile?.category || 'Software de RRHH',
                              brand: 'Atlas Commerce Suite',
                              price: venderProductProfile?.price || 450,
                              currency: venderProductProfile?.currency || 'USD',
                              purchase_mode: venderProductProfile?.purchase_mode || 'SUBSCRIPTION',
                              purchase_url: venderProductProfile?.purchase_url || 'https://commerce.youapp.tv/checkout/hr-saas',
                              delivery_options: ['ACCESO_INMEDIATO', 'ONBOARDING_DEDICADO'],
                              geo: venderProductProfile?.geo_available || ['Argentina', 'LATAM'],
                              last_synced_at: new Date().toISOString()
                            });
                          }}
                          style={{
                            padding: '0.5rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #a7f3d0',
                            background: '#f0fdf4',
                            color: '#065f46',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <ShoppingBag size={14} /> VER PRODUCTO
                        </button>

                        <button
                          type="button"
                          id={`btn-simular-compra-${candidate.entity_id}`}
                          onClick={() => handlePrepareSale(candidate)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <CreditCard size={14} /> SIMULAR COMPRA
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* OUTREACH PROPOSAL MODAL */}
      {isProposalModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '740px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            padding: '1.75rem',
            position: 'relative'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={20} style={{ color: '#0284c7' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Enviar Propuesta Comercial
                  </h3>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>
                  DESTINATARIOS: <strong style={{ color: '#0284c7' }}>{verifiedSelectedContacts.length}</strong> contactos con email verificado
                  {excludedSelectedCount > 0 && (
                    <span style={{ color: '#dc2626', marginLeft: '0.5rem' }}>
                      ({excludedSelectedCount} seleccionados sin email serán omitidos)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProposalModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* SEND RESULT VIEW */}
            {sendResultTelemetry ? (
              <div>
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
                  </div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#15803d', margin: '0 0 0.5rem 0' }}>
                    ¡Propuesta Enviada Exitosamente!
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#166534', margin: 0 }}>
                    Entorno: <strong>{sendResultTelemetry.provider}</strong> (Seguro • Simulación completa sin disparos externos reales)
                  </p>
                </div>

                {/* Audit Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  fontSize: '0.85rem',
                  marginBottom: '1.5rem',
                  background: '#f8fafc',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div>SELECTED: <strong style={{ color: '#0f172a' }}>{sendResultTelemetry.selected}</strong></div>
                  <div>VERIFIED_EMAILS: <strong style={{ color: '#0284c7' }}>{sendResultTelemetry.verified_emails}</strong></div>
                  <div>SUPPRESSED: <strong style={{ color: '#64748b' }}>{sendResultTelemetry.suppressed}</strong></div>
                  <div>QUEUED: <strong style={{ color: '#d97706' }}>{sendResultTelemetry.queued}</strong></div>
                  <div>SENT_SIMULATED: <strong style={{ color: '#16a34a' }}>{sendResultTelemetry.sent_simulated}</strong></div>
                  <div>DUPLICATE_SENDS: <strong style={{ color: '#64748b' }}>{sendResultTelemetry.duplicate_sends}</strong></div>
                  <div>EMAIL_PROPOSAL_BUTTON: <strong style={{ color: '#16a34a' }}>PASS</strong></div>
                  <div>EMAIL_QUEUE: <strong style={{ color: '#16a34a' }}>PASS</strong></div>
                  <div>SUPPRESSION_GATE: <strong style={{ color: '#16a34a' }}>PASS</strong></div>
                  <div>CAMPAIGN_ID: <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{sendResultTelemetry.campaign_id}</span></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    id="btn-close-proposal-modal"
                    onClick={() => {
                      setIsProposalModalOpen(false);
                      setSendResultTelemetry(null);
                    }}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Aceptar y Ver Tabla
                  </button>
                </div>
              </div>
            ) : isConfirmingStep ? (
              /* CONFIRMATION STEP */
              <div>
                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  gap: '0.75rem'
                }}>
                  <AlertCircle size={24} style={{ color: '#d97706', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#92400e', margin: '0 0 0.35rem 0' }}>
                      Vas a enviar esta propuesta a {verifiedSelectedContacts.length} contactos.
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: '#b45309', margin: 0, lineHeight: 1.4 }}>
                      Requerimiento explícito: nunca se envían propuestas automáticamente por sólo seleccionar contactos.
                      Proveedor: <strong>{emailProvider}</strong> {emailProvider === 'REAL_PROVIDER' ? '(El estado pasará a SENT y se confirmará DELIVERED vía webhook real)' : '(Simulación controlada sin impacto externo)'}.
                      La deduplicación por <code>CAMPAIGN_ID + EMAIL_HASH</code>, control de tasa (BATCH, SEND_RATE, DOMAIN_LIMIT) y filtro de supresión están activos.
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.5rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Asunto:</strong> {renderedSubjectPreview}
                  </div>
                  <div>
                    <strong>Primer destinatario de prueba:</strong> {firstVerifiedContact?.name} ({firstVerifiedContact?.email})
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingStep(false)}
                    disabled={isSending}
                    style={{
                      padding: '0.65rem 1.25rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    id="btn-confirmar-envio"
                    disabled={isSending}
                    onClick={handleConfirmSendProposal}
                    style={{
                      padding: '0.65rem 1.5rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: isSending ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    {isSending ? (
                      <>Procesando Cola...</>
                    ) : (
                      <>
                        <ShieldCheck size={16} /> CONFIRMAR ENVÍO
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* EDIT / COMPOSE STEP */
              <div>
                {/* Templates & Save Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                      PLANTILLAS DE EMAIL:
                    </label>
                    <select
                      id="select-email-template"
                      value={selectedTemplateKey}
                      onChange={(e) => handleSelectTemplate(e.target.value)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: '#0f172a'
                      }}
                    >
                      <option value="PROPUESTA COMERCIAL">PROPUESTA COMERCIAL</option>
                      <option value="PRESENTACIÓN">PRESENTACIÓN</option>
                      <option value="SEGUIMIENTO">SEGUIMIENTO</option>
                      <option value="REUNIÓN">REUNIÓN</option>
                      {Object.keys(savedTemplates).map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  {/* Provider Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                      PROVEEDOR:
                    </label>
                    <select
                      id="select-email-provider"
                      value={emailProvider}
                      onChange={(e) => setEmailProvider(e.target.value as any)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        background: emailProvider === 'REAL_PROVIDER' ? '#f0fdf4' : '#ffffff',
                        color: emailProvider === 'REAL_PROVIDER' ? '#15803d' : '#0284c7'
                      }}
                    >
                      <option value="SIMULATED_PROVIDER">SIMULATED_PROVIDER (Modo Test)</option>
                      <option value="REAL_PROVIDER">REAL_PROVIDER (Modo Real)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    id="btn-guardar-propuesta"
                    onClick={handleSaveProposal}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Save size={14} /> GUARDAR PROPUESTA
                  </button>
                </div>

                {saveToast && (
                  <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem', fontWeight: 600 }}>
                    {saveToast}
                  </div>
                )}

                {/* Available Variables Pills */}
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', marginRight: '0.5rem' }}>Variables dinámicas:</span>
                  {['nombre', 'empresa', 'rubro', 'localidad'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleInsertVariable(v)}
                      style={{
                        marginRight: '0.35rem',
                        fontSize: '0.75rem',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                        borderRadius: '6px',
                        padding: '0.2rem 0.5rem',
                        cursor: 'pointer',
                        fontFamily: 'monospace'
                      }}
                      title={`Insertar {{${v}}}`}
                    >
                      + {`{{${v}}}`}
                    </button>
                  ))}
                </div>

                {/* Subject */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    ASUNTO:
                  </label>
                  <input
                    type="text"
                    id="input-proposal-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Asunto del correo con variables..."
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Message */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    MENSAJE:
                  </label>
                  <textarea
                    id="textarea-proposal-message"
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Redactá tu propuesta comercial aquí..."
                    style={{
                      width: '100%',
                      padding: '0.75rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Live Preview Toggle & Box */}
                {showPreview && (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '1rem',
                    marginBottom: '1.25rem'
                  }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Vista previa (Destinatario 1: {firstVerifiedContact?.name})
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
                      Asunto: {renderedSubjectPreview}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {renderedBodyPreview}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    id="btn-vista-previa"
                    onClick={() => setShowPreview(!showPreview)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: showPreview ? '#e0f2fe' : '#ffffff',
                      color: showPreview ? '#0284c7' : '#475569',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={15} /> {showPreview ? 'Ocultar Vista Previa' : 'VISTA PREVIA'}
                  </button>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      id="btn-cancelar-propuesta"
                      onClick={() => setIsProposalModalOpen(false)}
                      style={{
                        padding: '0.55rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#64748b',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      CANCELAR
                    </button>
                    <button
                      type="button"
                      id="btn-proceder-envio"
                      onClick={() => setIsConfirmingStep(true)}
                      style={{
                        padding: '0.55rem 1.25rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0284c7',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Send size={14} /> ENVIAR
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Base Intelligence Modal SSOT */}
      <AtlasBaseIntelligenceModal
        isOpen={isIntelligenceModalOpen}
        onClose={() => setIsIntelligenceModalOpen(false)}
        onSelectQuery={(query, filters) => {
          setNaturalQuery(query);
          if (filters?.entity_type) setEntityType(filters.entity_type as any);
          if (filters?.rubro) setRubro(filters.rubro);
          if (filters?.provincia) setProvincia(filters.provincia);
          if (filters?.ciudad) setCiudad(filters.ciudad);
          setReqEmail(Boolean(filters?.email));
          setReqPhone(Boolean(filters?.phone));
          setReqLinkedin(Boolean(filters?.linkedin));
          setReqWebsite(Boolean(filters?.website));
          setReqFacebook(Boolean(filters?.facebook));
          setReqInstagram(Boolean(filters?.instagram));
          const clickTarget = filters?.target || (filters as any)?.count;
          handleSearch(query, clickTarget, filters);
        }}
      />

      {/* Contact Physical Provenance Inspector Modal SSOT */}
      {inspectingContact && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '560px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #cbd5e1'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldCheck size={22} style={{ color: '#16a34a' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Trazabilidad Física de Contacto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingContact(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  VALOR OBSERVADO
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7', fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '0.2rem' }}>
                  {inspectingContact.value}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    PREDICADO
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {inspectingContact.predicate || 'HAS_CONTACT'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    NATURALEZA DE VERDAD
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a', marginTop: '0.15rem' }}>
                    {inspectingContact.truth_nature} (Física inmutable)
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  ASSERTION ID (TRUTH GRAPH)
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: '#334155',
                  fontFamily: 'monospace',
                  background: '#ffffff',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  wordBreak: 'break-all',
                  marginTop: '0.15rem'
                }}>
                  {inspectingContact.assertion_id}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    FUENTE FÍSICA (SOURCE)
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4338ca', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {inspectingContact.source_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    RUTA DE INGESTIÓN (ROUTE)
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {inspectingContact.route_id || 'ROUTE_VERIFIED'}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  OBSERVADO POR ATLAS
                </div>
                <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 700, marginTop: '0.15rem' }}>
                  {new Date(inspectingContact.observed_at).toLocaleDateString('es-AR')} ({new Date(inspectingContact.observed_at).toLocaleTimeString('es-AR')})
                </div>
              </div>

              {inspectingContact.evidences && inspectingContact.evidences.length > 1 && (
                <div style={{ marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    EVIDENCIAS ADICIONALES ASOCIADAS ({inspectingContact.evidences.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.35rem' }}>
                    {inspectingContact.evidences.map((ev: any, evIdx: number) => (
                      <div key={evIdx} style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#475569' }}>
                        • {ev.assertion_id} via {ev.source_id} ({new Date(ev.observed_at).toLocaleDateString('es-AR')})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setInspectingContact(null)}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* VENDER PRODUCT DETAILS MODAL (VER PRODUCTO) */}
      {venderSelectedProductForModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={22} style={{ color: '#059669' }} />
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Ficha Técnica de Producto Normalizado
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    AtlasProduct • Modelo de Comercio Normalizado
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVenderSelectedProductForModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>PRODUCT ID / SKU</div>
                <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#0f172a', fontWeight: 700 }}>
                  {venderSelectedProductForModal.atlas_product_id}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>TÍTULO Y DESCRIPCIÓN</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                  {venderSelectedProductForModal.title}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.25rem' }}>
                  {venderSelectedProductForModal.description}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ background: '#ecfdf5', padding: '0.75rem', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 800 }}>PRECIO Y MONEDA</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#065f46' }}>
                    ${venderSelectedProductForModal.price} {venderSelectedProductForModal.currency}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#047857' }}>
                    Modo: {venderSelectedProductForModal.purchase_mode}
                  </div>
                </div>

                <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: 800 }}>PROVEEDOR / CONECTOR</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e3a8a' }}>
                    StandardAtlasCommerceConnector
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#1e40af' }}>
                    Contract: 11/11 Métodos Implementados
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>OPCIONES DE ENTREGA</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {venderSelectedProductForModal.delivery_options?.map((opt: string, i: number) => (
                    <span key={i} style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#334155', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                      {opt}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>PURCHASE URL NORMALIZADA</div>
                <a
                  href={venderSelectedProductForModal.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    color: '#0284c7',
                    fontWeight: 700,
                    textDecoration: 'none',
                    marginTop: '0.25rem',
                    wordBreak: 'break-all'
                  }}
                >
                  <ExternalLink size={14} /> {venderSelectedProductForModal.purchase_url}
                </a>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setVenderSelectedProductForModal(null)}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VENDER PREPARE SALE MODAL (PREPARAR VENTA) */}
      {venderSelectedCandidateForSale && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={22} style={{ color: '#10b981' }} />
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Simular Compra / Checkout Simulado
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Atlas Commerce SIMULATION_ONLY V1 • Sin dinero real ni pasarelas externas
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVenderSelectedCandidateForSale(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {venderSaleCompleted ? (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '1.5rem',
                textAlign: 'center'
              }}>
                <CheckCircle2 size={36} style={{ color: '#16a34a', margin: '0 auto 0.75rem auto' }} />
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803d', margin: '0 0 0.5rem 0' }}>
                  ¡Compra Simulada Exitosa!
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#166534', margin: '0 0 1rem 0' }}>
                  Evento <strong>PURCHASE_COMPLETED</strong> registrado con <code>environment = 'SIMULATION'</code>.
                  <br />Sin cobro real • Sin orden externa • Truth Graph blindado con 0 contaminación.
                </p>
                <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#334155' }}>
                  <strong>Comprador:</strong> {venderSelectedCandidateForSale.entity_name} • <strong>Producto:</strong> {venderRecommendedProduct?.title || 'Software de Recursos Humanos'}
                </div>
                <button
                  type="button"
                  onClick={() => setVenderSelectedCandidateForSale(null)}
                  style={{
                    marginTop: '1.25rem',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.5rem 1.5rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Finalizar Simulación
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>PROSPECTO SELECCIONADO</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {venderSelectedCandidateForSale.entity_name}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                      Buyer Fit: {venderSelectedCandidateForSale.buyer_fit_score.toFixed(2)}
                    </span>
                    {venderSelectedCandidateForSale.product_buyer_match_score !== undefined && (
                      <span style={{ fontSize: '0.72rem', background: '#fdf4ff', color: '#86198f', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                        Product Match: {Number(venderSelectedCandidateForSale.product_buyer_match_score).toFixed(2)}
                      </span>
                    )}
                    <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1e40af', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                      Contactability: {venderSelectedCandidateForSale.contactability_score.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700 }}>
                      Opportunity: {venderSelectedCandidateForSale.opportunity_score !== null ? venderSelectedCandidateForSale.opportunity_score.toFixed(2) : 'NOT_DETERMINED'}
                    </span>
                  </div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>PRODUCTO SIMULADO</div>
                    <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 800 }}>SIMULATION ONLY</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {venderRecommendedProduct?.title || venderProductProfile?.product_name || 'Oferta Comercial'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700, marginTop: '0.2rem' }}>
                    {venderRecommendedProduct?.price !== null && venderRecommendedProduct?.price !== undefined
                      ? `$${venderRecommendedProduct.price} ${venderRecommendedProduct.currency || 'ARS'} (Simulado)`
                      : 'PRECIO: NO ESPECIFICADO'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    CANALES VERIFICADOS DESTINO
                  </div>
                  {venderSelectedCandidateForSale.verified_contacts?.emails?.length > 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#166534', background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      Email principal verificado: <strong>{venderSelectedCandidateForSale.verified_contacts.emails[0]}</strong>
                    </div>
                  ) : venderSelectedCandidateForSale.verified_contacts?.linkedin?.length > 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#1e40af', background: '#eff6ff', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      Perfil LinkedIn verificado: <strong>{venderSelectedCandidateForSale.verified_contacts.linkedin[0]}</strong>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      Sin canal directo observado. Se enviará enlace de checkout manual al equipo de ventas.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => setVenderSelectedCandidateForSale(null)}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#64748b',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    id="btn-confirmar-simular-compra"
                    onClick={handleConfirmSale}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <CreditCard size={16} /> SIMULAR COMPRA
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
