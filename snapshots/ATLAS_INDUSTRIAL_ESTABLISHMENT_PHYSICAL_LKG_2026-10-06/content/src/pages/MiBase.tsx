import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { getIndustrialUrl } from '../../packages/config/products.ts';
import { 
  getAuthToken,
  getEffectiveUserId,
  type SavedRelation, 
  type CommercialStatus, 
  type Priority, 
  type SuggestedPriority,
  SUGGESTED_PRIORITY_LABELS,
  type UserSegment,
  type ContactEvidence,
  type PublicEmailItem,
  type PublicPhoneItem,
  type AssociatedPersonItem
} from '../lib/atlasSavedRelations';
import IndustrialGlobalHeader from '../components/IndustrialGlobalHeader';
import './MiBase.css';

/* ─── SVG Icons ─────────────────────────────────────────────────── */
const IconSearch = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const IconGlobe = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

const IconChevronDown = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const IconTrash = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const IconFileText = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconExternalLink = ({ size = 11 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);

const IconMapPin = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);

const IconMail = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

const IconPhone = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);

const IconCopy = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
  </svg>
);

const IconX = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconUser = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const IconForm = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </svg>
);

const IconShieldCheck = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const SUGGESTED_ACTIONS = [
  'Llamar',
  'Enviar email',
  'Revisar website',
  'Buscar contacto',
  'Seguimiento'
];

const trackHotEvent = (eventName: string, payload: any) => {
  console.log(`[HOT_TELEMETRY] ${eventName}`, payload);
};

export default function MiBase() {
  const { user } = useStore();
  const [savedItems, setSavedItems] = useState<SavedRelation[]>([]);
  const [segments, setSegments] = useState<UserSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  
  const [searchParams, setSearchParams] = useSearchParams();
  const validIntentTabs = ['ALL', 'HOT', 'WARM', 'CUSTOMER', 'DISCARDED'];
  const urlView = searchParams.get('view')?.toUpperCase() || 'ALL';
  const initialIntentTab = validIntentTabs.includes(urlView) ? urlView : 'ALL';
  
  const [intentTab, setIntentTabState] = useState<'ALL' | 'HOT' | 'WARM' | 'CUSTOMER' | 'DISCARDED'>(initialIntentTab as any);

  // Sync state from URL for back/forward navigation
  useEffect(() => {
    const currentView = searchParams.get('view')?.toUpperCase() || 'ALL';
    if (validIntentTabs.includes(currentView)) {
      setIntentTabState(currentView as any);
    } else {
      setIntentTabState('ALL');
    }
  }, [searchParams]);

  const setIntentTab = (newTab: 'ALL' | 'HOT' | 'WARM' | 'CUSTOMER' | 'DISCARDED') => {
    setIntentTabState(newTab);
    const newParams = new URLSearchParams(searchParams);
    if (newTab === 'ALL') {
      newParams.delete('view');
    } else {
      newParams.set('view', newTab.toLowerCase());
    }
    setSearchParams(newParams);
  };

  const [activeBase, setActiveBase] = useState<string>('ALL');
  const [activeSegmentId, setActiveSegmentId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [provinceFilter, setProvinceFilter] = useState<string>('ALL');
  
  // Real Commercial Contact Filters
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [hasPhoneFilter, setHasPhoneFilter] = useState(false);
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState(false);
  const [hasFormFilter, setHasFormFilter] = useState(false);
  const [hasPersonFilter, setHasPersonFilter] = useState(false);
  const [noContactFilter, setNoContactFilter] = useState(false);

  // Suggested Priority and Smart Filters
  const [suggestedPriorityFilter, setSuggestedPriorityFilter] = useState<string>('ALL');
  const [directContactFilter, setDirectContactFilter] = useState(false);
  const [constitutionalOnlyFilter, setConstitutionalOnlyFilter] = useState(false);
  const [highPriorityUncontactedFilter, setHighPriorityUncontactedFilter] = useState(false);
  const [explainingSavedId, setExplainingSavedId] = useState<string | null>(null);

  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [selectedFicha, setSelectedFicha] = useState<SavedRelation | null>(null);
  const [fichaNotes, setFichaNotes] = useState('');
  const [fichaStatus, setFichaStatus] = useState<CommercialStatus>('NEW');
  const [fichaPriority, setFichaPriority] = useState<Priority>(null);
  const [fichaNextAction, setFichaNextAction] = useState('');
  const [fichaNextDate, setFichaNextDate] = useState('');
  const [fichaTags, setFichaTags] = useState<string[]>([]);
  const [fichaNewTag, setFichaNewTag] = useState('');
  const [isSavingFicha, setIsSavingFicha] = useState(false);

  // Evidence modal state
  const [selectedEvidence, setSelectedEvidence] = useState<{
    channel: string;
    value: string;
    evidence: ContactEvidence;
  } | null>(null);

  // Segment creation modal
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentDesc, setNewSegmentDesc] = useState('');

  // Bulk tag modal
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState('');

  // Mercado Pago Commerce state
  const [sellerMpConnected, setSellerMpConnected] = useState(false);
  const [commerceSummary, setCommerceSummary] = useState({
    proposals_count: 0,
    accepted_count: 0,
    pending_payments_count: 0,
    paid_sales_count: 0,
    total_volume_ars: 0,
    total_atlas_commission_ars: 0
  });
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [proposalModalItem, setProposalModalItem] = useState<SavedRelation | null>(null);
  const [proposalForm, setProposalForm] = useState({
    title: '',
    description: '',
    quantity: 1,
    unitPrice: 50000,
    currency: 'ARS',
    validDays: 15,
    termsConditions: 'Pago anticipado vía Mercado Pago con protección comercial. Entrega inmediata.'
  });
  const [createdProposal, setCreatedProposal] = useState<any | null>(null);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [basesMeta, setBasesMeta] = useState<Record<string, any>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadCommerceData = async () => {
    try {
      const effectiveUserId = await getEffectiveUserId(user);
      const token = await getAuthToken();
      const headers: Record<string, string> = {
        'x-user-id': effectiveUserId,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      // Check seller connection status
      const mpRes = await fetch(`/api/mercadopago/seller-status`, { headers });
      const mpData = await mpRes.json();
      if (mpData.success && mpData.isConnected) {
        setSellerMpConnected(true);
      } else {
        setSellerMpConnected(false);
      }

      // Check commerce summary
      const sumRes = await fetch(`/api/commerce/summary`, { headers });
      const sumData = await sumRes.json();
      if (sumData.success && sumData.summary) {
        setCommerceSummary(sumData.summary);
      }
    } catch (err) {
      console.error('Error loading commerce data:', err);
    }
  };

  const handleConnectMp = async () => {
    try {
      const effectiveUserId = await getEffectiveUserId(user);
      const token = await getAuthToken();
      const res = await fetch('/api/mercadopago/test-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (data.success) {
        setSellerMpConnected(true);
        showToast('✓ Vendedor Mercado Pago conectado en Modo Sandbox');
        loadCommerceData();
      }
    } catch (err) {
      console.error('Error connecting MP:', err);
    }
  };

  const openProposalModal = (item: SavedRelation) => {
    setProposalModalItem(item);
    setProposalForm({
      title: item.product_name || 'Suministro Industrial',
      description: `Propuesta comercial para ${item.company_name}. Cotización basada en catálogo industrial verificado.`,
      quantity: 1,
      unitPrice: 50000,
      currency: 'ARS',
      validDays: 15,
      termsConditions: 'Pago contra entrega vía Mercado Pago. Entrega inmediata según disponibilidad de stock.'
    });
    setCreatedProposal(null);
    setIsProposalModalOpen(true);
  };

  const handleCreateProposal = async () => {
    if (!proposalModalItem) return;
    try {
      setIsSubmittingProposal(true);
      const effectiveUserId = await getEffectiveUserId(user);
      const token = await getAuthToken();
      const res = await fetch('/api/commerce/proposals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          savedRelationId: proposalModalItem.saved_id,
          buyerCompanyId: proposalModalItem.company_id,
          buyerName: proposalModalItem.company_name,
          buyerContactEmail: proposalModalItem.public_email,
          title: proposalForm.title,
          description: proposalForm.description,
          quantity: proposalForm.quantity,
          unitPrice: proposalForm.unitPrice,
          currency: proposalForm.currency,
          validDays: proposalForm.validDays,
          termsConditions: proposalForm.termsConditions
        })
      });
      const data = await res.json();
      if (data.success && data.proposal) {
        setCreatedProposal(data.proposal);
        showToast('✓ Propuesta creada exitosamente');
        loadCommerceData();
        loadSavedRelations();
      } else {
        alert(data.error || 'No se pudo crear la propuesta');
      }
    } catch (err: any) {
      alert(err.message || 'Error al crear la propuesta');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`✓ ${label} copiado al portapapeles: ${text}`);
  };

  // Load saved relations with contact enrichment
  const loadSavedRelations = async () => {
    setIsLoading(true);
    try {
      const effectiveUserId = await getEffectiveUserId(user);
      const token = await getAuthToken();
      const headers: Record<string, string> = {
        'x-user-id': effectiveUserId,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      let url = `http://localhost:5174/api/user/saved-relations`;
      const params = new URLSearchParams();
      if (activeBase !== 'ALL') params.append('base_name', activeBase);
      if (activeSegmentId !== 'ALL') params.append('segment_id', activeSegmentId);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setSavedItems(data.items);
      }

      // Fetch user bases metadata
      try {
        const metaRes = await fetch(`http://localhost:5174/api/user/bases`, { headers });
        const metaData = await metaRes.json();
        if (metaData.success && Array.isArray(metaData.bases)) {
          const map: Record<string, any> = {};
          metaData.bases.forEach((b: any) => { map[b.base_name] = b; });
          setBasesMeta(map);
        }
      } catch {}

      // Fetch user segments
      try {
        const segRes = await fetch(`http://localhost:5174/api/user/segments`, { headers });
        const segData = await segRes.json();
        if (segData.success && Array.isArray(segData.segments)) {
          setSegments(segData.segments);
        }
      } catch {}

    } catch (err) {
      console.error('Error loading saved relations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSavedRelations();
    loadCommerceData();
  }, [user?.id, activeBase, activeSegmentId]);

  // Update single commercial tracking record
  const updateCommercialField = async (savedId: string, payload: Partial<SavedRelation>) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`http://localhost:5174/api/user/saved-relations/${savedId}/commercial`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.updated) {
        setSavedItems(prev => prev.map(item => {
          if (item.saved_id === savedId) {
            return { ...item, ...data.updated };
          }
          return item;
        }));
        return true;
      }
    } catch (err) {
      console.error('Error updating commercial tracking:', err);
    }
    return false;
  };

  // Bulk actions handler
  const handleBulkAction = async (action: 'STATUS' | 'PRIORITY' | 'ADD_TAG' | 'DELETE', payload: any = {}) => {
    if (selectedIds.size === 0) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`http://localhost:5174/api/user/saved-relations/bulk-commercial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
          ...payload
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `✓ Acción masiva completada`);
        setSelectedIds(new Set());
        loadSavedRelations();
      }
    } catch (err) {
      console.error('Error executing bulk action:', err);
    }
  };

  // Create segment handler
  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegmentName.trim()) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`http://localhost:5174/api/user/segments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: newSegmentName.trim(),
          description: newSegmentDesc.trim() || null,
          saved_relation_ids: Array.from(selectedIds)
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Segmento "${newSegmentName.trim()}" creado`);
        setIsSegmentModalOpen(false);
        setNewSegmentName('');
        setNewSegmentDesc('');
        setSelectedIds(new Set());
        loadSavedRelations();
      }
    } catch (err) {
      console.error('Error creating segment:', err);
    }
  };

  // Open Ficha Comercial modal
  const openFichaModal = (item: SavedRelation) => {
    setSelectedFicha(item);
    setFichaNotes(item.notes || '');
    setFichaStatus(item.commercial_status || 'NEW');
    setFichaPriority(item.priority || null);
    setFichaNextAction(item.next_action || '');
    setFichaNextDate(item.next_action_date ? item.next_action_date.substring(0, 10) : '');
    setFichaTags(Array.isArray(item.tags) ? item.tags : []);
    setFichaNewTag('');

    if (item.commercial_intent?.intent_level === 'HOT') {
      trackHotEvent('HOT_OPENED', { saved_id: item.saved_id, is_customer: item.commercial_status === 'CUSTOMER' });
    }
  };

  // Save changes inside Ficha Comercial modal
  const handleSaveFicha = async () => {
    if (!selectedFicha) return;
    
    if (selectedFicha.commercial_intent?.intent_level === 'HOT' && fichaStatus !== selectedFicha.commercial_status) {
      trackHotEvent('HOT_STATUS_CHANGED', { saved_id: selectedFicha.saved_id, old_status: selectedFicha.commercial_status, new_status: fichaStatus });
    }

    setIsSavingFicha(true);
    const ok = await updateCommercialField(selectedFicha.saved_id, {
      commercial_status: fichaStatus,
      priority: fichaPriority,
      notes: fichaNotes,
      tags: fichaTags,
      next_action: fichaNextAction || null,
      next_action_date: fichaNextDate || null
    });
    setIsSavingFicha(false);
    if (ok) {
      showToast('✓ Seguimiento comercial guardado');
      setSelectedFicha(null);
    }
  };

  // Delete single item
  const handleDeleteSingle = async (savedId: string, prodName: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`http://localhost:5174/api/user/saved-relations/${savedId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setSavedItems(prev => prev.filter(it => it.saved_id !== savedId));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(savedId);
          return next;
        });
        showToast(`✓ Eliminado de Mi base: ${prodName}`);
      }
    } catch (err) {
      console.error('Error deleting saved relation:', err);
    }
  };

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(it => it.saved_id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Dynamic KPI calculations over user's enriched records
  const kpiStats = useMemo(() => {
    let total = savedItems.length;
    let conContacto = 0;
    let contactados = 0;
    let respondieron = 0;
    let clientes = 0;
    let hotCount = 0;
    let warmCount = 0;
    let customerCount = 0;
    let discardedCount = 0;

    savedItems.forEach(it => {
      if (!it.has_no_contact) conContacto++;
      if (it.commercial_status === 'CONTACTED') contactados++;
      if (it.commercial_status === 'RESPONDED') respondieron++;
      if (it.commercial_status === 'CUSTOMER') clientes++;
      if (it.commercial_status === 'DISCARDED') discardedCount++;

      const intent = it.commercial_intent?.intent_level || 'STANDARD';
      if (intent === 'HOT') hotCount++;
      else if (intent === 'WARM') warmCount++;
      if (it.commercial_status === 'CUSTOMER' || intent === 'CUSTOMER') customerCount++;
    });

    return { total, conContacto, contactados, respondieron, clientes, hotCount, warmCount, customerCount, discardedCount };
  }, [savedItems]);

  // Derived filter options
  const availableBases = useMemo(() => {
    return Array.from(new Set(savedItems.map(it => it.base_name || 'Mi base')));
  }, [savedItems]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(savedItems.map(it => it.category).filter(Boolean))).sort();
  }, [savedItems]);

  const availableProvinces = useMemo(() => {
    return Array.from(new Set(savedItems.map(it => it.province).filter(Boolean) as string[])).sort();
  }, [savedItems]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    savedItems.forEach(it => {
      if (Array.isArray(it.tags)) {
        it.tags.forEach(t => set.add(t));
      }
    });
    return Array.from(set).sort();
  }, [savedItems]);

  // Filtered list
  const filteredItems = useMemo(() => {
    const list = savedItems.filter(item => {
      // ─── Intent Tab Filter ──────────────────────────────────
      if (intentTab === 'HOT') {
        if (item.commercial_intent?.intent_level !== 'HOT') return false;
      } else if (intentTab === 'WARM') {
        if (item.commercial_intent?.intent_level !== 'WARM') return false;
      } else if (intentTab === 'CUSTOMER') {
        if (item.commercial_status !== 'CUSTOMER' && item.commercial_intent?.intent_level !== 'CUSTOMER') return false;
      } else if (intentTab === 'DISCARDED') {
        if (item.commercial_status !== 'DISCARDED') return false;
      }

      // Search query
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesQuery = (
          (item.product_name && item.product_name.toLowerCase().includes(q)) ||
          (item.company_name && item.company_name.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.province && item.province.toLowerCase().includes(q)) ||
          (item.notes && item.notes.toLowerCase().includes(q)) ||
          (item.public_email && item.public_email.toLowerCase().includes(q)) ||
          (item.tags && item.tags.some(t => t.toLowerCase().includes(q))) ||
          (item.commercial_intent?.intent_reason && item.commercial_intent.intent_reason.toLowerCase().includes(q)) ||
          (item.commercial_intent?.intent_product_context && item.commercial_intent.intent_product_context.toLowerCase().includes(q))
        );
        if (!matchesQuery) return false;
      }

      // Status
      if (statusFilter !== 'ALL' && item.commercial_status !== statusFilter) {
        return false;
      }

      // Priority
      if (priorityFilter !== 'ALL') {
        if (priorityFilter === 'NONE') {
          if (item.priority !== null && item.priority !== undefined) return false;
        } else if (item.priority !== priorityFilter) {
          return false;
        }
      }

      // Category
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
        return false;
      }

      // Province
      if (provinceFilter !== 'ALL' && item.province !== provinceFilter) {
        return false;
      }

      // Tag filter
      if (tagFilter !== 'ALL') {
        if (!Array.isArray(item.tags) || !item.tags.includes(tagFilter)) {
          return false;
        }
      }

      // ─── Commercial Contact Filters ─────────────────────────
      if (hasEmailFilter && !item.has_public_email) return false;
      if (hasPhoneFilter && !item.has_public_phone) return false;
      if (hasWebsiteFilter && !item.has_public_website) return false;
      if (hasFormFilter && !item.has_contact_form) return false;
      if (hasPersonFilter && !item.has_associated_person) return false;
      if (noContactFilter && !item.has_no_contact) return false;

      // ─── Suggested Priority and Smart Filters ────────────────
      if (suggestedPriorityFilter !== 'ALL' && item.suggested_priority !== suggestedPriorityFilter) {
        return false;
      }
      if (directContactFilter && !item.has_direct_contact) {
        return false;
      }
      if (constitutionalOnlyFilter && !item.is_constitutional) {
        return false;
      }
      if (highPriorityUncontactedFilter) {
        const isHigh = item.suggested_priority === 'HIGH';
        const isUncontacted = item.commercial_status !== 'CONTACTED' && 
                              item.commercial_status !== 'RESPONDED' && 
                              item.commercial_status !== 'CUSTOMER';
        if (!isHigh || !isUncontacted) return false;
      }

      return true;
    });

    // Ranking determinístico para Hot Clients:
    // 1. Señal de mayor intención (intent_weight)
    // 2. Recencia de última señal
    // 3. Cantidad de señales en timeline
    if (intentTab === 'HOT') {
      return [...list].sort((a, b) => {
        const weightA = a.commercial_intent?.intent_weight || 0;
        const weightB = b.commercial_intent?.intent_weight || 0;
        if (weightB !== weightA) return weightB - weightA;

        const timeA = a.commercial_intent?.last_signal_at ? new Date(a.commercial_intent.last_signal_at).getTime() : 0;
        const timeB = b.commercial_intent?.last_signal_at ? new Date(b.commercial_intent.last_signal_at).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;

        const countA = a.commercial_intent?.timeline?.length || 0;
        const countB = b.commercial_intent?.timeline?.length || 0;
        return countB - countA;
      });
    }

    return list;
  }, [
    savedItems,
    intentTab,
    searchQuery,
    statusFilter,
    priorityFilter,
    categoryFilter,
    provinceFilter,
    tagFilter,
    hasEmailFilter,
    hasPhoneFilter,
    hasWebsiteFilter,
    hasFormFilter,
    hasPersonFilter,
    noContactFilter,
    suggestedPriorityFilter,
    directContactFilter,
    constitutionalOnlyFilter,
    highPriorityUncontactedFilter
  ]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadgeClass = (status: CommercialStatus) => {
    switch (status) {
      case 'NEW': return 'mb-status--new';
      case 'REVIEW': return 'mb-status--review';
      case 'PROSPECT': return 'mb-status--prospect';
      case 'CONTACTED': return 'mb-status--contacted';
      case 'RESPONDED': return 'mb-status--responded';
      case 'CUSTOMER': return 'mb-status--customer';
      case 'DISCARDED': return 'mb-status--discarded';
      default: return 'mb-status--new';
    }
  };

  const getPriorityBadgeClass = (p?: Priority) => {
    switch (p) {
      case 'HIGH': return 'mb-prio--high';
      case 'MEDIUM': return 'mb-prio--med';
      case 'LOW': return 'mb-prio--low';
      default: return 'mb-prio--none';
    }
  };

  const getSuggestedPriorityBadgeClass = (sp?: SuggestedPriority) => {
    switch (sp) {
      case 'HIGH': return 'mb-sug-prio--high';
      case 'MEDIUM': return 'mb-sug-prio--med';
      case 'LOW': return 'mb-sug-prio--low';
      case 'INSUFFICIENT_DATA': return 'mb-sug-prio--insufficient';
      default: return 'mb-sug-prio--low';
    }
  };

  const getContactabilityBadgeClass = (level?: string) => {
    switch (level) {
      case 'HIGH': return 'mb-contact-lvl--high';
      case 'MEDIUM': return 'mb-contact-lvl--med';
      case 'LOW': return 'mb-contact-lvl--low';
      default: return 'mb-contact-lvl--none';
    }
  };

  return (
    <div className="mb-root">
      <div className="mb-bg" />

      {/* Navbar */}
      <IndustrialGlobalHeader />

      {/* Main Content */}
      <div className="mb-container">

        {/* Header Strip */}
        <div className="mb-header-card">
          <div className="mb-header-left">
            <div className="mb-header-title-row">
              <h1 className="mb-title">Mi base comercial</h1>
              <span className="mb-tag-clients">MIS POSIBLES CLIENTES</span>
              <span className="mb-count-badge">{savedItems.length} prospectos</span>
            </div>
            <p className="mb-subtitle">
              Gestión comercial privada enriquecida con contactos públicos reales verificados en Atlas.
            </p>
          </div>

          <div className="mb-header-right">
            <div className="mb-search-input-wrap">
              <IconSearch size={15} />
              <input 
                type="text"
                placeholder="Buscar prospectos, emails, notas..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="mb-search-input"
              />
              {searchQuery && (
                <button className="mb-clear-btn" onClick={() => setSearchQuery('')}>
                  <IconX size={13} />
                </button>
              )}
            </div>

            <a href={getIndustrialUrl('/productos', { sso: true })} className="mb-cta-link">
              + Descubrir más empresas
            </a>
          </div>
        </div>

        {/* ─── CLIENTES HOT V1: INTENT TABS & ALERT BAR ────────────────── */}
        <div className="mb-intent-strip">
          <div className="mb-intent-tabs">
            <button
              type="button"
              className={`mb-intent-tab ${intentTab === 'ALL' ? 'mb-intent-tab--active' : ''}`}
              onClick={() => setIntentTab('ALL')}
            >
              <span>Todos</span>
              <span className="mb-intent-count">{savedItems.length}</span>
            </button>

            <button
              type="button"
              className={`mb-intent-tab mb-intent-tab--hot ${intentTab === 'HOT' ? 'mb-intent-tab--active' : ''}`}
              onClick={() => setIntentTab('HOT')}
            >
              <span>🔥 Clientes Hot</span>
              <span className="mb-intent-count mb-intent-count--hot">{kpiStats.hotCount}</span>
            </button>

            <button
              type="button"
              className={`mb-intent-tab mb-intent-tab--warm ${intentTab === 'WARM' ? 'mb-intent-tab--active' : ''}`}
              onClick={() => setIntentTab('WARM')}
            >
              <span>🟠 Warm</span>
              <span className="mb-intent-count">{kpiStats.warmCount}</span>
            </button>

            <button
              type="button"
              className={`mb-intent-tab mb-intent-tab--customer ${intentTab === 'CUSTOMER' ? 'mb-intent-tab--active' : ''}`}
              onClick={() => setIntentTab('CUSTOMER')}
            >
              <span>💎 Clientes</span>
              <span className="mb-intent-count">{kpiStats.customerCount}</span>
            </button>

            <button
              type="button"
              className={`mb-intent-tab ${intentTab === 'DISCARDED' ? 'mb-intent-tab--active' : ''}`}
              onClick={() => setIntentTab('DISCARDED')}
            >
              <span>⚪ Descartados</span>
              <span className="mb-intent-count">{kpiStats.discardedCount}</span>
            </button>
          </div>

          {kpiStats.hotCount > 0 && intentTab !== 'HOT' && (
            <div className="mb-hot-alert-pill" onClick={() => setIntentTab('HOT')}>
              <span className="mb-hot-fire-icon">🔥</span>
              <span className="mb-hot-alert-text">
                <strong>{kpiStats.hotCount} {kpiStats.hotCount === 1 ? 'cliente hot muestra' : 'clientes hot muestran'} alta intención comercial</strong>
              </span>
              <span className="mb-hot-alert-cta">Ver clientes hot →</span>
            </div>
          )}
        </div>

        {/* ─── VISUAL PIPELINE STRIP (NUEVO → PROSPECTO → CONTACTADO → RESPONDIÓ → PROPUESTA → CLIENTE) ─── */}
        <div className="mb-pipeline-wrapper">
          <div className="mb-pipeline-header">
            <span className="mb-pipeline-label">FLUJO COMERCIAL:</span>
            <span className="mb-pipeline-hint">Filtrar por etapa del ciclo de venta</span>
          </div>
          <div className="mb-pipeline-steps">
            {[
              { id: 'NEW', label: 'NUEVO', count: savedItems.filter(i => i.commercial_status === 'NEW').length },
              { id: 'PROSPECT', label: 'PROSPECTO', count: savedItems.filter(i => i.commercial_status === 'PROSPECT').length },
              { id: 'CONTACTED', label: 'CONTACTADO', count: savedItems.filter(i => i.commercial_status === 'CONTACTED').length },
              { id: 'RESPONDED', label: 'RESPONDIÓ', count: savedItems.filter(i => i.commercial_status === 'RESPONDED').length },
              { id: 'REVIEW', label: 'PROPUESTA', count: commerceSummary.proposals_count || savedItems.filter(i => i.commercial_status === 'REVIEW').length },
              { id: 'CUSTOMER', label: 'CLIENTE', count: savedItems.filter(i => i.commercial_status === 'CUSTOMER').length }
            ].map((step, idx, arr) => {
              const isActive = statusFilter === step.id;
              return (
                <React.Fragment key={step.id}>
                  <button 
                    type="button"
                    className={`mb-pipeline-step ${isActive ? 'mb-pipeline-step--active' : ''}`}
                    onClick={() => setStatusFilter(isActive ? 'ALL' : step.id)}
                  >
                    <span className="mb-pstep-badge">{step.count}</span>
                    <span className="mb-pstep-name">{step.label}</span>
                  </button>
                  {idx < arr.length - 1 && <span className="mb-pstep-arrow">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ─── 3. RESUMEN COMERCIAL (KPI Cards) ─────────────────────────── */}
        <div className="mb-kpi-grid">
          <div className="mb-kpi-card" onClick={() => setStatusFilter('ALL')}>
            <span className="mb-kpi-label">POSIBLES CLIENTES</span>
            <div className="mb-kpi-value-row">
              <span className="mb-kpi-number">{kpiStats.total}</span>
              <span className="mb-kpi-pill">Total</span>
            </div>
            <span className="mb-kpi-hint">Base general activa</span>
          </div>

          <div className="mb-kpi-card" onClick={() => { setNoContactFilter(false); setHasEmailFilter(true); }}>
            <span className="mb-kpi-label">CON CONTACTO</span>
            <div className="mb-kpi-value-row">
              <span className="mb-kpi-number">{kpiStats.conContacto}</span>
              <span className="mb-kpi-pill mb-kpi-pill--blue">{Math.round((kpiStats.conContacto / (kpiStats.total || 1)) * 100)}%</span>
            </div>
            <span className="mb-kpi-hint">Canales públicos reales</span>
          </div>

          <div className="mb-kpi-card" onClick={() => setStatusFilter('CONTACTED')}>
            <span className="mb-kpi-label">CONTACTADOS</span>
            <div className="mb-kpi-value-row">
              <span className="mb-kpi-number">{kpiStats.contactados}</span>
              <span className="mb-kpi-pill mb-kpi-pill--amber">En proceso</span>
            </div>
            <span className="mb-kpi-hint">Primer contacto enviado</span>
          </div>

          <div className="mb-kpi-card" onClick={() => setStatusFilter('RESPONDED')}>
            <span className="mb-kpi-label">RESPONDIERON</span>
            <div className="mb-kpi-value-row">
              <span className="mb-kpi-number">{kpiStats.respondieron}</span>
              <span className="mb-kpi-pill mb-kpi-pill--purple">En diálogo</span>
            </div>
            <span className="mb-kpi-hint">Interacción iniciada</span>
          </div>

          <div className="mb-kpi-card" onClick={() => setStatusFilter('CUSTOMER')}>
            <span className="mb-kpi-label">CLIENTES</span>
            <div className="mb-kpi-value-row">
              <span className="mb-kpi-number">{kpiStats.clientes}</span>
              <span className="mb-kpi-pill mb-kpi-pill--green">Cerrados</span>
            </div>
            <span className="mb-kpi-hint">Conversión completada</span>
          </div>
        </div>

        {/* ─── ATLAS COMMERCE (MVP V1) KPI STRIP ─────────────────────── */}
        <div className="mb-commerce-strip">
          <div className="mb-commerce-header">
            <div className="mb-commerce-title-row">
              <span className="mb-commerce-badge">ATLAS COMMERCE</span>
              <span className="mb-commerce-title">Flujo Comercial & Ventas</span>
              <span className="mb-commerce-sandbox-pill">MODO PRUEBA (SANDBOX)</span>
            </div>
            <div className="mb-commerce-mp-status">
              {sellerMpConnected ? (
                <div className="mb-mp-connected-tag">
                  <span className="mb-mp-dot"></span>
                  <span>✓ Mercado Pago Conectado</span>
                </div>
              ) : (
                <button className="mb-mp-connect-btn" onClick={handleConnectMp}>
                  Conectar Mercado Pago
                </button>
              )}
            </div>
          </div>

          <div className="mb-commerce-kpi-grid">
            <div className="mb-commerce-card">
              <span className="mb-c-label">PROPUESTAS</span>
              <div className="mb-c-val">{commerceSummary.proposals_count}</div>
              <span className="mb-c-sub">Emitidas</span>
            </div>
            <div className="mb-commerce-card">
              <span className="mb-c-label">ACEPTADAS</span>
              <div className="mb-c-val mb-c-val--blue">{commerceSummary.accepted_count}</div>
              <span className="mb-c-sub">Listas para cobro</span>
            </div>
            <div className="mb-commerce-card">
              <span className="mb-c-label">PAGOS PENDIENTES</span>
              <div className="mb-c-val mb-c-val--amber">{commerceSummary.pending_payments_count}</div>
              <span className="mb-c-sub">En pasarela MP</span>
            </div>
            <div className="mb-commerce-card">
              <span className="mb-c-label">VENTAS</span>
              <div className="mb-c-val mb-c-val--green">{commerceSummary.paid_sales_count}</div>
              <span className="mb-c-sub">Pagadas y conciliadas</span>
            </div>
            <div className="mb-commerce-card">
              <span className="mb-c-label">VOLUMEN</span>
              <div className="mb-c-val mb-c-val--highlight">
                ${commerceSummary.total_volume_ars.toLocaleString('es-AR')}
              </div>
              <span className="mb-c-sub">ARS Total facturado</span>
            </div>
            <div className="mb-commerce-card">
              <span className="mb-c-label">COMISIÓN ATLAS (5%)</span>
              <div className="mb-c-val mb-c-val--purple">
                ${commerceSummary.total_atlas_commission_ars.toLocaleString('es-AR')}
              </div>
              <span className="mb-c-sub">Marketplace fee SSOT</span>
            </div>
          </div>
        </div>

        {/* ─── Base Search Metadata Info Strip ───────────────────────── */}
        {activeBase !== 'ALL' && basesMeta[activeBase] && (
          <div className="mb-meta-banner">
            <span>📁 <strong>Base:</strong> {activeBase}</span>
            {basesMeta[activeBase].original_query && (
              <span>• <strong>Búsqueda original:</strong> "{basesMeta[activeBase].original_query}"</span>
            )}
            {basesMeta[activeBase].total_results_at_save !== null && (
              <span>• <strong>Total en catálogo:</strong> {Number(basesMeta[activeBase].total_results_at_save).toLocaleString('es-MX')}</span>
            )}
            <span className="mb-meta-badge">
              ✓ Guardado seguro V1 (20 referencias)
            </span>
          </div>
        )}

        {/* ─── Segment & Base Tabs Bar ───────────────────────────────── */}
        <div className="mb-tabs-bar">
          <div className="mb-tab-group">
            <span className="mb-tab-group-lbl">Bases:</span>
            <button 
              className={`mb-base-tab ${activeBase === 'ALL' ? 'mb-base-tab--active' : ''}`}
              onClick={() => setActiveBase('ALL')}
            >
              Todas ({savedItems.length})
            </button>
            {availableBases.map(b => (
              <button 
                key={b}
                className={`mb-base-tab ${activeBase === b ? 'mb-base-tab--active' : ''}`}
                onClick={() => setActiveBase(b)}
              >
                {b} ({savedItems.filter(it => it.base_name === b).length})
              </button>
            ))}
          </div>

          {segments.length > 0 && (
            <div className="mb-tab-group">
              <span className="mb-tab-group-lbl">Segmentos:</span>
              <button 
                className={`mb-base-tab ${activeSegmentId === 'ALL' ? 'mb-base-tab--active' : ''}`}
                onClick={() => setActiveSegmentId('ALL')}
              >
                Todos
              </button>
              {segments.map(s => (
                <button 
                  key={s.id}
                  className={`mb-base-tab ${activeSegmentId === s.id ? 'mb-base-tab--active' : ''}`}
                  onClick={() => setActiveSegmentId(s.id)}
                >
                  🎯 {s.name} ({s.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── 6. COMMERCIAL CONTACT FILTERS ────────────────────────── */}
        <div className="mb-filters-bar">
          {/* Estado */}
          <div className="mb-filter-item">
            <label>Estado</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos los estados</option>
              <option value="NEW">Nuevo</option>
              <option value="REVIEW">Revisar</option>
              <option value="PROSPECT">Posible cliente</option>
              <option value="CONTACTED">Contactado</option>
              <option value="RESPONDED">Respondió</option>
              <option value="CUSTOMER">Cliente</option>
              <option value="DISCARDED">Descartado</option>
            </select>
          </div>

          {/* Prioridad manual (Usuario) */}
          <div className="mb-filter-item">
            <label>Mi Prioridad</label>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="ALL">Todas</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Media</option>
              <option value="LOW">Baja</option>
              <option value="NONE">Sin prioridad</option>
            </select>
          </div>

          {/* Prioridad sugerida (Algorítmica SSOT) */}
          <div className="mb-filter-item">
            <label>Prioridad sugerida</label>
            <select value={suggestedPriorityFilter} onChange={e => setSuggestedPriorityFilter(e.target.value)}>
              <option value="ALL">Todas las sugeridas</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Media</option>
              <option value="LOW">Baja</option>
              <option value="INSUFFICIENT_DATA">Datos insuficientes</option>
            </select>
          </div>

          {/* Rubro */}
          {availableCategories.length > 0 && (
            <div className="mb-filter-item">
              <label>Rubro</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="ALL">Todos los rubros</option>
                {availableCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact & Smart Filters Toggles */}
          <div className="mb-filter-toggles">
            <span className="mb-toggles-lbl">Filtros inteligentes:</span>

            <label className={`mb-toggle-pill ${directContactFilter ? 'mb-toggle-pill--active' : ''}`}>
              <input 
                type="checkbox" 
                checked={directContactFilter} 
                onChange={e => { setDirectContactFilter(e.target.checked); if (e.target.checked) setNoContactFilter(false); }} 
              />
              <IconMail size={12} />
              <span>Tiene contacto directo</span>
            </label>

            <label className={`mb-toggle-pill ${constitutionalOnlyFilter ? 'mb-toggle-pill--active' : ''}`}>
              <input 
                type="checkbox" 
                checked={constitutionalOnlyFilter} 
                onChange={e => setConstitutionalOnlyFilter(e.target.checked)} 
              />
              <IconShieldCheck size={12} />
              <span>Sólo constitucionales</span>
            </label>

            <label className={`mb-toggle-pill mb-toggle-pill--amber ${highPriorityUncontactedFilter ? 'mb-toggle-pill--active-amber' : ''}`}>
              <input 
                type="checkbox" 
                checked={highPriorityUncontactedFilter} 
                onChange={e => setHighPriorityUncontactedFilter(e.target.checked)} 
              />
              <span>Alta prioridad + no contactado</span>
            </label>
            
            <label className={`mb-toggle-pill ${hasEmailFilter ? 'mb-toggle-pill--active' : ''}`}>
              <input 
                type="checkbox" 
                checked={hasEmailFilter} 
                onChange={e => { setHasEmailFilter(e.target.checked); if (e.target.checked) setNoContactFilter(false); }} 
              />
              <IconMail size={12} />
              <span>Tiene email</span>
            </label>

            <label className={`mb-toggle-pill ${hasPhoneFilter ? 'mb-toggle-pill--active' : ''}`}>
              <input 
                type="checkbox" 
                checked={hasPhoneFilter} 
                onChange={e => { setHasPhoneFilter(e.target.checked); if (e.target.checked) setNoContactFilter(false); }} 
              />
              <IconPhone size={12} />
              <span>Tiene teléfono</span>
            </label>

            <label className={`mb-toggle-pill ${hasWebsiteFilter ? 'mb-toggle-pill--active' : ''}`}>
              <input 
                type="checkbox" 
                checked={hasWebsiteFilter} 
                onChange={e => { setHasWebsiteFilter(e.target.checked); if (e.target.checked) setNoContactFilter(false); }} 
              />
              <IconGlobe size={12} />
              <span>Tiene web</span>
            </label>

            <label className={`mb-toggle-pill mb-toggle-pill--danger ${noContactFilter ? 'mb-toggle-pill--active-danger' : ''}`}>
              <input 
                type="checkbox" 
                checked={noContactFilter} 
                onChange={e => {
                  setNoContactFilter(e.target.checked);
                  if (e.target.checked) {
                    setHasEmailFilter(false);
                    setHasPhoneFilter(false);
                    setHasWebsiteFilter(false);
                    setHasFormFilter(false);
                    setHasPersonFilter(false);
                    setDirectContactFilter(false);
                  }
                }} 
              />
              <span>Sin contacto</span>
            </label>
          </div>

          {(statusFilter !== 'ALL' || priorityFilter !== 'ALL' || suggestedPriorityFilter !== 'ALL' || categoryFilter !== 'ALL' || tagFilter !== 'ALL' || hasEmailFilter || hasPhoneFilter || hasWebsiteFilter || hasFormFilter || hasPersonFilter || noContactFilter || directContactFilter || constitutionalOnlyFilter || highPriorityUncontactedFilter) && (
            <button 
              className="mb-btn-reset-filters"
              onClick={() => {
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
                setSuggestedPriorityFilter('ALL');
                setCategoryFilter('ALL');
                setTagFilter('ALL');
                setHasEmailFilter(false);
                setHasPhoneFilter(false);
                setHasWebsiteFilter(false);
                setHasFormFilter(false);
                setHasPersonFilter(false);
                setNoContactFilter(false);
                setDirectContactFilter(false);
                setConstitutionalOnlyFilter(false);
                setHighPriorityUncontactedFilter(false);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ─── Bulk Actions Bar ────────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="mb-bulk-bar">
            <div className="mb-bulk-left">
              <span className="mb-bulk-count">{selectedIds.size} seleccionados</span>
            </div>

            <div className="mb-bulk-actions">
              <div className="mb-bulk-select-wrap">
                <select 
                  defaultValue="" 
                  onChange={e => {
                    if (e.target.value) {
                      handleBulkAction('STATUS', { commercial_status: e.target.value });
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled>Cambiar estado...</option>
                  <option value="NEW">Nuevo</option>
                  <option value="REVIEW">Revisar</option>
                  <option value="PROSPECT">Posible cliente</option>
                  <option value="CONTACTED">Contactado</option>
                  <option value="RESPONDED">Respondió</option>
                  <option value="CUSTOMER">Cliente</option>
                  <option value="DISCARDED">Descartado</option>
                </select>
              </div>

              <div className="mb-bulk-select-wrap">
                <select 
                  defaultValue="" 
                  onChange={e => {
                    if (e.target.value) {
                      handleBulkAction('PRIORITY', { priority: e.target.value === 'NONE' ? null : e.target.value });
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled>Cambiar prioridad...</option>
                  <option value="HIGH">Alta</option>
                  <option value="MEDIUM">Media</option>
                  <option value="LOW">Baja</option>
                  <option value="NONE">Sin prioridad</option>
                </select>
              </div>

              <button className="mb-bulk-btn" onClick={() => setIsBulkTagModalOpen(true)}>
                <span>Agregar etiqueta</span>
              </button>

              <button className="mb-bulk-btn mb-bulk-btn--segment" onClick={() => setIsSegmentModalOpen(true)}>
                <span>Crear segmento</span>
              </button>

              <button 
                className="mb-bulk-btn mb-bulk-btn--delete"
                onClick={() => {
                  if (window.confirm(`¿Eliminar ${selectedIds.size} registros de Mi base?`)) {
                    handleBulkAction('DELETE');
                  }
                }}
              >
                <IconTrash size={13} />
                <span>Eliminar</span>
              </button>

              <button className="mb-bulk-close" onClick={() => setSelectedIds(new Set())}>
                <IconX size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Main Table ────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="mb-loading-card">
            <div className="mb-spinner" />
            <span>Consultando Contact Search y cargando prospectos...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="mb-empty-card">
            <div className="mb-empty-icon">{intentTab === 'HOT' ? '🔥' : '📂'}</div>
            <h3 className="mb-empty-title">
              {intentTab === 'HOT' 
                ? 'Por ahora no hay clientes Hot' 
                : savedItems.length === 0
                  ? 'Todavía no guardaste posibles clientes'
                  : 'No hay posibles clientes que coincidan con los filtros aplicados'}
            </h3>
            <p className="mb-empty-sub">
              {intentTab === 'HOT'
                ? 'Cuando un prospecto muestre señales comerciales fuertes, va a aparecer acá.'
                : savedItems.length === 0
                  ? 'Explorá el directorio de organizaciones, personas o el catálogo industrial para guardar prospectos e iniciar su seguimiento comercial aquí.'
                  : 'Probá restableciendo los filtros de búsqueda para ver todos tus prospectos guardados.'}
            </p>
            {savedItems.length === 0 ? (
              <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/search/organizaciones" className="mb-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  Buscar posibles clientes →
                </Link>
                <a href={getIndustrialUrl('/productos', { sso: true })} className="mb-btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  Catálogo Industrial
                </a>
              </div>
            ) : intentTab !== 'HOT' ? (
              <button 
                type="button" 
                onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); setHasEmailFilter(false); setHasPhoneFilter(false); }}
                className="mb-btn-secondary" 
                style={{ marginTop: '16px' }}
              >
                Restablecer filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mb-table-wrap">
            <div className="mb-table">
              {/* Table Header */}
              <div className="mb-thead">
                <div className="mb-th mb-th-check">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleSelectAll}
                  />
                </div>
                <div className="mb-th mb-th-comp">Empresa</div>
                <div className="mb-th mb-th-prod">Producto / Servicio</div>
                <div className="mb-th mb-th-intent">Intención Comercial</div>
                <div className="mb-th mb-th-contact">Contacto Público Disponible</div>
                <div className="mb-th mb-th-sug-prio">Prioridad sugerida</div>
                <div className="mb-th mb-th-prio">Mi Prioridad</div>
                <div className="mb-th mb-th-status">Estado</div>
                <div className="mb-th mb-th-action">Próxima acción</div>
                <div className="mb-th mb-th-act">Acciones</div>
              </div>

              {/* Table Rows */}
              {filteredItems.map(item => {
                const totalContacts = (item.all_emails?.length || 0) + (item.all_phones?.length || 0) + (item.all_people?.length || 0);

                return (
                  <div key={item.saved_id} className={`mb-row ${selectedIds.has(item.saved_id) ? 'mb-row--selected' : ''}`}>
                    {/* Checkbox */}
                    <div className="mb-td mb-td-check">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(item.saved_id)}
                        onChange={() => toggleSelectOne(item.saved_id)}
                      />
                    </div>

                    {/* Empresa */}
                    <div className="mb-td mb-td-comp">
                      <div className="mb-comp-avatar">
                        {(item.company_name || 'E').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="mb-comp-meta">
                        <span className="mb-comp-name" title={item.company_name}>{item.company_name}</span>
                        {item.website ? (
                          <a 
                            href={item.website}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mb-comp-web"
                            title="Abrir sitio web oficial"
                          >
                            <IconGlobe size={11} />
                            <span>{item.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>
                            <IconExternalLink size={9} />
                          </a>
                        ) : (
                          <span className="mb-null-text">Sin web verificada</span>
                        )}
                      </div>
                    </div>

                    {/* Producto / Servicio */}
                    <div className="mb-td mb-td-prod">
                      <span className="mb-prod-name" title={item.product_name}>{item.product_name}</span>
                      <div className="mb-prod-sub-row">
                        <span className="mb-cat-badge">{item.category || 'Alimentos'}</span>
                        {item.province && (
                          <span className="mb-loc-wrap">
                            <IconMapPin size={10} />
                            {item.province}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ─── INTENCIÓN COMERCIAL (CLIENTES HOT V1) ─────────── */}
                    <div className="mb-td mb-td-intent">
                      {(() => {
                        const intent = item.commercial_intent || {
                          intent_level: item.commercial_status === 'CUSTOMER' ? 'CUSTOMER' : 'STANDARD',
                          intent_badge: item.commercial_status === 'CUSTOMER' ? '💎 CLIENTE' : '⚪ STANDARD',
                          intent_reason: item.commercial_status === 'CUSTOMER' ? 'Cliente confirmado' : 'Sin señales de alta intención',
                          intent_product_context: null,
                          last_signal_label: null,
                          timeline: []
                        };

                        const isCustomer = item.commercial_status === 'CUSTOMER' || intent.intent_level === 'CUSTOMER';
                        const levelClass = isCustomer ? 'mb-intent-pill--customer' :
                                           intent.intent_level === 'HOT' ? 'mb-intent-pill--hot' :
                                           intent.intent_level === 'WARM' ? 'mb-intent-pill--warm' :
                                           'mb-intent-pill--standard';

                        return (
                          <div className="mb-intent-cell">
                            <span className={`mb-intent-pill ${levelClass}`}>
                              {isCustomer ? '💎 CLIENTE' : intent.intent_badge}
                            </span>
                            <span className="mb-intent-reason-text">
                              {isCustomer ? 'Cliente confirmado' : intent.intent_reason}
                            </span>
                            {intent.intent_product_context && (
                              <span className="mb-intent-product-tag" title={intent.intent_product_context}>
                                {intent.intent_product_context}
                              </span>
                            )}
                            {intent.last_signal_label && (
                              <span className="mb-intent-time-sub">
                                {intent.last_signal_label}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* ─── 2. CONTACTO DISPONIBLE (Rich Cell) ─────────────── */}
                    <div className="mb-td mb-td-contact">
                      {item.has_no_contact ? (
                        <div className="mb-no-contact-pill">
                          <span>No encontramos contacto público todavía</span>
                        </div>
                      ) : (
                        <div className="mb-contact-cluster">
                          {/* Primary Email */}
                          {item.public_email && (
                            <div className="mb-channel-item">
                              <span className="mb-channel-badge mb-channel-badge--email">
                                <IconMail size={11} />
                                <span className="mb-channel-text" title={item.public_email}>{item.public_email}</span>
                              </span>
                              <div className="mb-channel-actions">
                                <button 
                                  className="mb-action-icon-btn" 
                                  title="Copiar email"
                                  onClick={() => copyToClipboard(item.public_email!, 'Email')}
                                >
                                  <IconCopy size={11} />
                                </button>
                                {item.all_emails?.[0]?.evidence && (
                                  <button 
                                    className="mb-action-icon-btn mb-btn-evidence" 
                                    title="Ver evidencia física"
                                    onClick={() => setSelectedEvidence({
                                      channel: 'Email Público',
                                      value: item.public_email!,
                                      evidence: item.all_emails![0].evidence
                                    })}
                                  >
                                    <IconShieldCheck size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Primary Phone */}
                          {item.public_phone && (
                            <div className="mb-channel-item">
                              <span className="mb-channel-badge mb-channel-badge--phone">
                                <IconPhone size={11} />
                                <span className="mb-channel-text">{item.public_phone}</span>
                              </span>
                              <div className="mb-channel-actions">
                                <button 
                                  className="mb-action-icon-btn" 
                                  title="Copiar teléfono"
                                  onClick={() => copyToClipboard(item.public_phone!, 'Teléfono')}
                                >
                                  <IconCopy size={11} />
                                </button>
                                {item.all_phones?.[0]?.evidence && (
                                  <button 
                                    className="mb-action-icon-btn mb-btn-evidence" 
                                    title="Ver evidencia física"
                                    onClick={() => setSelectedEvidence({
                                      channel: 'Teléfono Público',
                                      value: item.public_phone!,
                                      evidence: item.all_phones![0].evidence
                                    })}
                                  >
                                    <IconShieldCheck size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Contact Form Link */}
                          {item.public_contact_form && !item.public_email && (
                            <div className="mb-channel-item">
                              <a 
                                href={item.public_contact_form} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="mb-channel-badge mb-channel-badge--form"
                                title="Abrir formulario oficial de contacto"
                              >
                                <IconForm size={11} />
                                <span>Formulario Web</span>
                                <IconExternalLink size={9} />
                              </a>
                            </div>
                          )}

                          {/* Associated Person */}
                          {item.associated_person && (
                            <div className="mb-channel-item">
                              <span className="mb-channel-badge mb-channel-badge--person" title={`${item.associated_person.full_name} (${item.associated_person.role || ''})`}>
                                <IconUser size={11} />
                                <span className="mb-channel-text">{item.associated_person.full_name.split(' ')[0]} ({item.associated_person.role?.split(' ')[0] || 'Contacto'})</span>
                              </span>
                            </div>
                          )}

                          {/* Multi-contacts badge */}
                          {totalContacts > 1 && (
                            <button 
                              className="mb-badge-more-contacts"
                              onClick={() => openFichaModal(item)}
                              title="Ver todos los canales de contacto y autoridades"
                            >
                              +{totalContacts - 1} más
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ─── 3 & 5. PRIORIDAD SUGERIDA + POR QUÉ ─────────── */}
                    <div className="mb-td mb-td-sug-prio">
                      <div className="mb-sug-prio-container">
                        <span className={`mb-sug-prio-badge ${getSuggestedPriorityBadgeClass(item.suggested_priority)}`}>
                          {SUGGESTED_PRIORITY_LABELS[item.suggested_priority] || 'Baja'}
                        </span>
                        
                        <button 
                          type="button"
                          className="mb-btn-why"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExplainingSavedId(explainingSavedId === item.saved_id ? null : item.saved_id);
                          }}
                          title="Ver por qué sugerimos esta prioridad"
                        >
                          ¿Por qué?
                        </button>

                        {explainingSavedId === item.saved_id && (
                          <div className="mb-why-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="mb-why-hdr">
                              <span className="mb-why-title">Por qué sugerimos {SUGGESTED_PRIORITY_LABELS[item.suggested_priority]}:</span>
                              <button className="mb-why-close" onClick={() => setExplainingSavedId(null)}>
                                <IconX size={12} />
                              </button>
                            </div>
                            <ul className="mb-why-list">
                              {(item.suggested_priority_reasons || []).map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                            <div className="mb-why-action">
                              <button 
                                type="button"
                                className="mb-btn-adopt-sm"
                                onClick={() => {
                                  const adopted = item.suggested_priority === 'INSUFFICIENT_DATA' ? null : (item.suggested_priority as Priority);
                                  updateCommercialField(item.saved_id, { priority: adopted });
                                  setExplainingSavedId(null);
                                  showToast(`✓ Tu prioridad ha sido actualizada a ${SUGGESTED_PRIORITY_LABELS[item.suggested_priority]}`);
                                }}
                              >
                                Adoptar como mi prioridad
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ─── MI PRIORIDAD (User Priority - Independent) ──── */}
                    <div className="mb-td mb-td-prio">
                      <select 
                        className={`mb-prio-select ${getPriorityBadgeClass(item.priority)}`}
                        value={item.priority || ''}
                        onChange={e => {
                          const val = e.target.value ? (e.target.value as Priority) : null;
                          updateCommercialField(item.saved_id, { priority: val });
                        }}
                      >
                        <option value="">—</option>
                        <option value="HIGH">Alta</option>
                        <option value="MEDIUM">Media</option>
                        <option value="LOW">Baja</option>
                      </select>
                    </div>

                    {/* Estado comercial */}
                    <div className="mb-td mb-td-status">
                      <select 
                        className={`mb-status-select ${getStatusBadgeClass(item.commercial_status)}`}
                        value={item.commercial_status || 'NEW'}
                        onChange={e => {
                          const val = e.target.value as CommercialStatus;
                          updateCommercialField(item.saved_id, { commercial_status: val });
                        }}
                      >
                        <option value="NEW">Nuevo</option>
                        <option value="REVIEW">Revisar</option>
                        <option value="PROSPECT">Posible cliente</option>
                        <option value="CONTACTED">Contactado</option>
                        <option value="RESPONDED">Respondió</option>
                        <option value="CUSTOMER">Cliente</option>
                        <option value="DISCARDED">Descartado</option>
                      </select>
                    </div>

                    {/* Próxima acción */}
                    <div className="mb-td mb-td-action">
                      {item.next_action ? (
                        <div className="mb-next-action-cell" onClick={() => openFichaModal(item)}>
                          <span className="mb-action-text">{item.next_action}</span>
                          {item.next_action_date && (
                            <span className="mb-action-date">
                              {formatDate(item.next_action_date)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button className="mb-btn-add-action" onClick={() => openFichaModal(item)}>
                          + Asignar acción
                        </button>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="mb-td mb-td-act">
                      <button 
                        className="mb-btn-action mb-btn-propuesta"
                        title="Crear propuesta comercial para este cliente"
                        onClick={() => openProposalModal(item)}
                      >
                        <span className="mb-prop-zap">⚡</span>
                        <span>Propuesta</span>
                      </button>

                      <button 
                        className="mb-btn-action mb-btn-ficha"
                        title="Abrir ficha completa y evidencia de contactos"
                        onClick={() => openFichaModal(item)}
                      >
                        <IconFileText size={13} />
                        <span>Ficha</span>
                      </button>

                      <button 
                        className="mb-btn-action mb-btn-delete"
                        title="Eliminar de Mi base"
                        onClick={() => handleDeleteSingle(item.saved_id, item.product_name)}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── 4 & 15. DUAL-SECTION FICHA COMERCIAL & CONTACT EVIDENCE ─ */}
      {selectedFicha && (
        <div className="mb-modal-overlay" onClick={() => setSelectedFicha(null)}>
          <div className="mb-modal-card mb-modal-card--lg" onClick={e => e.stopPropagation()}>
            <div className="mb-modal-hdr">
              <div className="mb-modal-hdr-info">
                <div className="mb-modal-avatar">
                  {(selectedFicha.company_name || 'E').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="mb-modal-title">{selectedFicha.company_name}</h3>
                  <span className="mb-modal-subtitle">{selectedFicha.category} • {selectedFicha.product_name}</span>
                </div>
              </div>
              <button className="mb-modal-close" onClick={() => setSelectedFicha(null)}>
                <IconX size={18} />
              </button>
            </div>

            <div className="mb-ficha-layout">
              {/* ─── HOT ACTION PANEL V1 ────────────────────────────── */}
              {(() => {
                const intent = selectedFicha.commercial_intent;
                const isCustomer = selectedFicha.commercial_status === 'CUSTOMER';
                if (intent && intent.intent_level === 'HOT' && !isCustomer) {
                  let actionText = 'Hacer seguimiento';
                  const lastEvent = intent.timeline && intent.timeline.length > 0 ? intent.timeline[0] : null;
                  const signalType = lastEvent ? lastEvent.signal_type : '';
                  
                  if (signalType === 'CHECKOUT_STARTED') actionText = 'Contactar ahora';
                  else if (signalType === 'EMAIL_RESPONDED') actionText = 'Responder';
                  else if (signalType === 'PRODUCT_INTERESTED') actionText = 'Enviar propuesta';
                  else if (signalType === 'BUSINESS_CONTACTED') actionText = 'Hacer seguimiento';
                  else if (signalType === 'OFFER_REDEEMED') actionText = 'Seguimiento post-oferta';
                  else if (signalType) actionText = 'Contactar ahora';

                  const email = selectedFicha.all_emails?.[0]?.email || selectedFicha.public_email;
                  const phone = selectedFicha.all_phones?.[0]?.phone || selectedFicha.public_phone;
                  let contactUrl = '';
                  let contactLabel = '';
                  if (email) {
                    contactUrl = `mailto:${email}`;
                    contactLabel = 'Vía Email';
                  } else if (phone) {
                    contactUrl = `https://wa.me/${phone.replace(/\D/g, '')}`;
                    contactLabel = 'Vía WhatsApp';
                  }

                  const handleSetFollowUp = (daysStr: string) => {
                    const today = new Date();
                    if (daysStr === 'Mañana') today.setDate(today.getDate() + 1);
                    else if (daysStr === '3 días') today.setDate(today.getDate() + 3);
                    else if (daysStr === '1 semana') today.setDate(today.getDate() + 7);
                    
                    setFichaNextDate(today.toISOString().split('T')[0]);
                    setFichaNextAction(actionText);
                    trackHotEvent('HOT_FOLLOWUP_SET', { saved_id: selectedFicha.saved_id, option: daysStr });
                    showToast('✓ Seguimiento programado');
                  };

                  return (
                    <div className="mb-hot-action-panel" style={{ background: '#fff5f5', border: '1px solid #fed7d7', padding: '16px', borderRadius: '8px', margin: '0 0 16px 0', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>🔥</span>
                            <span style={{ fontWeight: 600, color: '#c53030' }}>Cliente Hot</span>
                            {intent.last_signal_label && (
                              <span style={{ fontSize: '0.8rem', color: '#718096' }}>• Última señal: {intent.last_signal_label}</span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#2d3748', fontWeight: 500 }}>
                            Motivo: {intent.intent_reason}
                          </p>
                          {intent.intent_product_context && (
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#4a5568' }}>
                              📌 {intent.intent_product_context}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                          {contactUrl ? (
                            <a 
                              href={contactUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="mb-btn-primary" 
                              style={{ background: '#e53e3e', borderColor: '#e53e3e', textDecoration: 'none' }}
                              onClick={() => {
                                trackHotEvent('HOT_CONTACT_ACTION', { saved_id: selectedFicha.saved_id, channel: contactLabel, action: actionText });
                              }}
                            >
                              {actionText} {contactLabel}
                            </a>
                          ) : (
                            <button disabled className="mb-btn-primary" style={{ background: '#cbd5e0', borderColor: '#cbd5e0', color: '#718096', cursor: 'not-allowed' }}>
                              Canal no disponible
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #fed7d7', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', color: '#4a5568', fontWeight: 500 }}>[Marcar seguimiento]:</span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {['Hoy', 'Mañana', '3 días', '1 semana'].map(opt => (
                            <button 
                              key={opt} 
                              type="button" 
                              onClick={() => handleSetFollowUp(opt)}
                              className="mb-btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* PARTE A: DATOS ATLAS & CONTACTOS REALES (Read-Only) */}
              <div className="mb-ficha-section mb-ficha-atlas">
                <div className="mb-ficha-section-hdr">
                  <span className="mb-ficha-badge-atlas">DATOS ATLAS & CONTACT SEARCH</span>
                  <span className="mb-ficha-section-sub">Información canónica y canales públicos certificados</span>
                </div>

                {/* Contactability Level Banner */}
                <div className={`mb-contact-lvl-banner ${getContactabilityBadgeClass(selectedFicha.contactability_level)}`}>
                  <div className="mb-lvl-title-row">
                    <strong>Nivel de Contactabilidad:</strong>
                    <span className="mb-lvl-badge">{selectedFicha.contactability_level || 'NONE'}</span>
                  </div>
                  <span className="mb-lvl-desc">
                    {selectedFicha.contactability_level === 'HIGH' && 'Canales directos de alta respuesta (email y/o teléfono público verificado).'}
                    {selectedFicha.contactability_level === 'MEDIUM' && 'Sitio web oficial con formulario o mesa de entradas.'}
                    {selectedFicha.contactability_level === 'LOW' && 'Presencia web institucional indexada sin correo directo.'}
                    {(!selectedFicha.contactability_level || selectedFicha.contactability_level === 'NONE') && 'No encontramos contacto público todavía en los registros de Atlas.'}
                  </span>
                </div>

                {/* Contact Channels List */}
                <div className="mb-atlas-group">
                  <span className="mb-modal-lbl">Canales de Contacto Públicos Reales</span>
                  
                  {selectedFicha.has_no_contact ? (
                    <div className="mb-contact-empty-state">
                      <span>No encontramos contacto público todavía para esta empresa.</span>
                    </div>
                  ) : (
                    <div className="mb-contact-channels-box">
                      {/* Emails */}
                      {selectedFicha.all_emails && selectedFicha.all_emails.length > 0 && (
                        <div className="mb-channel-group">
                          <span className="mb-group-title">Correos Electrónicos Públicos:</span>
                          {selectedFicha.all_emails.map(em => (
                            <div key={em.email} className="mb-channel-detail-row">
                              <IconMail size={13} />
                              <span className="mb-channel-val">{em.email}</span>
                              <div className="mb-channel-btns">
                                <button 
                                  className="mb-btn-xs" 
                                  onClick={() => copyToClipboard(em.email, 'Email')}
                                >
                                  Copiar
                                </button>
                                {em.evidence && (
                                  <button 
                                    className="mb-btn-xs mb-btn-xs--evidence"
                                    onClick={() => setSelectedEvidence({
                                      channel: 'Email Institucional',
                                      value: em.email,
                                      evidence: em.evidence
                                    })}
                                  >
                                    Ver evidencia
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Phones */}
                      {selectedFicha.all_phones && selectedFicha.all_phones.length > 0 && (
                        <div className="mb-channel-group">
                          <span className="mb-group-title">Teléfonos Públicos:</span>
                          {selectedFicha.all_phones.map(ph => (
                            <div key={ph.phone} className="mb-channel-detail-row">
                              <IconPhone size={13} />
                              <span className="mb-channel-val">{ph.phone}</span>
                              <div className="mb-channel-btns">
                                <button 
                                  className="mb-btn-xs" 
                                  onClick={() => copyToClipboard(ph.phone, 'Teléfono')}
                                >
                                  Copiar
                                </button>
                                {ph.evidence && (
                                  <button 
                                    className="mb-btn-xs mb-btn-xs--evidence"
                                    onClick={() => setSelectedEvidence({
                                      channel: 'Teléfono Institucional',
                                      value: ph.phone,
                                      evidence: ph.evidence
                                    })}
                                  >
                                    Ver evidencia
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Website */}
                      {selectedFicha.website && (
                        <div className="mb-channel-group">
                          <span className="mb-group-title">Sitio Web:</span>
                          <div className="mb-channel-detail-row">
                            <IconGlobe size={13} />
                            <a href={selectedFicha.website} target="_blank" rel="noopener noreferrer" className="mb-web-link">
                              {selectedFicha.website}
                              <IconExternalLink size={10} />
                            </a>
                            <div className="mb-channel-btns">
                              <a href={selectedFicha.website} target="_blank" rel="noopener noreferrer" className="mb-btn-xs">
                                Abrir website
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Contact Form */}
                      {selectedFicha.all_forms && selectedFicha.all_forms.length > 0 && (
                        <div className="mb-channel-group">
                          <span className="mb-group-title">Formulario de Contacto Web:</span>
                          {selectedFicha.all_forms.map(fm => (
                            <div key={fm.url} className="mb-channel-detail-row">
                              <IconForm size={13} />
                              <a href={fm.url} target="_blank" rel="noopener noreferrer" className="mb-web-link">
                                {fm.url}
                              </a>
                              <div className="mb-channel-btns">
                                <a href={fm.url} target="_blank" rel="noopener noreferrer" className="mb-btn-xs">
                                  Abrir formulario
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Associated People */}
                      {selectedFicha.all_people && selectedFicha.all_people.length > 0 && (
                        <div className="mb-channel-group">
                          <span className="mb-group-title">Personas / Autoridades Asociadas:</span>
                          {selectedFicha.all_people.map(p => (
                            <div key={p.contact_id} className="mb-channel-detail-row">
                              <IconUser size={13} />
                              <span className="mb-channel-val"><strong>{p.full_name}</strong> {p.role ? `(${p.role})` : ''}</span>
                              {p.email && (
                                <button className="mb-btn-xs" onClick={() => copyToClipboard(p.email!, 'Email')}>
                                  Copiar email
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ─── COMMERCIAL TIMELINE & INTENT EVIDENCE ─────────── */}
                <div className="mb-atlas-group" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="mb-modal-lbl" style={{ marginBottom: 0 }}>🔥 Actividad Comercial Reciente (Evidencia Física)</span>
                    {selectedFicha.commercial_intent && (
                      <span className={`mb-intent-pill ${
                        selectedFicha.commercial_status === 'CUSTOMER' || selectedFicha.commercial_intent.intent_level === 'CUSTOMER' ? 'mb-intent-pill--customer' :
                        selectedFicha.commercial_intent.intent_level === 'HOT' ? 'mb-intent-pill--hot' :
                        selectedFicha.commercial_intent.intent_level === 'WARM' ? 'mb-intent-pill--warm' :
                        'mb-intent-pill--standard'
                      }`}>
                        {selectedFicha.commercial_status === 'CUSTOMER' ? '💎 CLIENTE' : selectedFicha.commercial_intent.intent_badge}
                      </span>
                    )}
                  </div>

                  {selectedFicha.commercial_intent?.intent_reason && (
                    <div className="mb-timeline-highlight">
                      <strong>Motivo de intención:</strong> {selectedFicha.commercial_intent.intent_reason}
                    </div>
                  )}

                  {selectedFicha.commercial_intent?.intent_product_context && (
                    <div className="mb-timeline-product-highlight">
                      📌 <strong>Contexto comercial:</strong> {selectedFicha.commercial_intent.intent_product_context}
                    </div>
                  )}

                  {selectedFicha.commercial_intent && selectedFicha.commercial_intent.timeline && selectedFicha.commercial_intent.timeline.length > 0 ? (
                    <div className="mb-timeline-list">
                      {selectedFicha.commercial_intent.timeline.map(ev => (
                        <div key={ev.id} className="mb-timeline-item">
                          <div className="mb-timeline-dot" />
                          <div className="mb-timeline-content">
                            <div className="mb-timeline-row">
                              <span className="mb-timeline-label">{ev.label}</span>
                              <span className="mb-timeline-time">{ev.time_ago}</span>
                            </div>
                            {ev.product_name && (
                              <span className="mb-timeline-prod">Producto: {ev.product_name}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mb-timeline-empty">
                      Sin eventos comerciales físicos registrados aún.
                    </div>
                  )}
                </div>
              </div>

              {/* PARTE B: MI SEGUIMIENTO (Private User CRM) */}
              <div className="mb-ficha-section mb-ficha-crm">
                <div className="mb-ficha-section-hdr">
                  <span className="mb-ficha-badge-crm">MI SEGUIMIENTO</span>
                  <span className="mb-ficha-section-sub">Datos privados exclusivos de tu cuenta</span>
                </div>

                <div className="mb-crm-form">
                  {/* Prioridad Sugerida y Explicabilidad (SSOT) */}
                  <div className="mb-suggested-prio-card">
                    <div className="mb-sug-hdr">
                      <div className="mb-sug-left">
                        <span className="mb-sug-title">PRIORIDAD SUGERIDA:</span>
                        <span className={`mb-sug-prio-badge ${getSuggestedPriorityBadgeClass(selectedFicha.suggested_priority)}`}>
                          {SUGGESTED_PRIORITY_LABELS[selectedFicha.suggested_priority] || 'Baja'}
                        </span>
                      </div>
                      <button 
                        type="button"
                        className="mb-btn-adopt-sm"
                        onClick={() => {
                          const adopted = selectedFicha.suggested_priority === 'INSUFFICIENT_DATA' ? null : (selectedFicha.suggested_priority as Priority);
                          setFichaPriority(adopted);
                          showToast(`✓ Tu prioridad se estableció en ${SUGGESTED_PRIORITY_LABELS[selectedFicha.suggested_priority]}`);
                        }}
                      >
                        Copiar a mi prioridad
                      </button>
                    </div>
                    <div className="mb-why-box">
                      <span className="mb-why-title">Por qué:</span>
                      <ul className="mb-why-list">
                        {(selectedFicha.suggested_priority_reasons || []).map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Estado y Prioridad */}
                  <div className="mb-crm-row">
                    <div className="mb-crm-field">
                      <label className="mb-input-label">Estado Comercial</label>
                      <select 
                        className="mb-text-input"
                        value={fichaStatus}
                        onChange={e => setFichaStatus(e.target.value as CommercialStatus)}
                      >
                        <option value="NEW">Nuevo</option>
                        <option value="REVIEW">Revisar</option>
                        <option value="PROSPECT">Posible cliente</option>
                        <option value="CONTACTED">Contactado</option>
                        <option value="RESPONDED">Respondió</option>
                        <option value="CUSTOMER">Cliente</option>
                        <option value="DISCARDED">Descartado</option>
                      </select>
                    </div>

                    <div className="mb-crm-field">
                      <label className="mb-input-label">Prioridad</label>
                      <select 
                        className="mb-text-input"
                        value={fichaPriority || ''}
                        onChange={e => setFichaPriority(e.target.value ? (e.target.value as Priority) : null)}
                      >
                        <option value="">Sin prioridad</option>
                        <option value="HIGH">Alta</option>
                        <option value="MEDIUM">Media</option>
                        <option value="LOW">Baja</option>
                      </select>
                    </div>
                  </div>

                  {/* Próxima Acción */}
                  <div className="mb-crm-row">
                    <div className="mb-crm-field">
                      <label className="mb-input-label">Próxima Acción</label>
                      <input 
                        type="text" 
                        className="mb-text-input"
                        placeholder="Ej. Llamar, Enviar catálogo..."
                        value={fichaNextAction}
                        onChange={e => setFichaNextAction(e.target.value)}
                        list="suggested-actions"
                      />
                      <datalist id="suggested-actions">
                        {SUGGESTED_ACTIONS.map(a => <option key={a} value={a} />)}
                      </datalist>
                    </div>

                    <div className="mb-crm-field">
                      <label className="mb-input-label">Fecha Próxima Acción</label>
                      <input 
                        type="date" 
                        className="mb-text-input"
                        value={fichaNextDate}
                        onChange={e => setFichaNextDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Etiquetas */}
                  <div className="mb-crm-field">
                    <label className="mb-input-label">Etiquetas</label>
                    <div className="mb-ficha-tags-wrap">
                      {fichaTags.map(t => (
                        <span key={t} className="mb-ficha-tag">
                          {t}
                          <button 
                            type="button" 
                            onClick={() => setFichaTags(fichaTags.filter(item => item !== t))}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mb-add-tag-row">
                      <input 
                        type="text" 
                        className="mb-text-input mb-tag-input"
                        placeholder="Nueva etiqueta..."
                        value={fichaNewTag}
                        onChange={e => setFichaNewTag(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && fichaNewTag.trim()) {
                            e.preventDefault();
                            if (!fichaTags.includes(fichaNewTag.trim())) {
                              setFichaTags([...fichaTags, fichaNewTag.trim()]);
                            }
                            setFichaNewTag('');
                          }
                        }}
                      />
                      <button 
                        type="button" 
                        className="mb-btn-secondary"
                        onClick={() => {
                          if (fichaNewTag.trim() && !fichaTags.includes(fichaNewTag.trim())) {
                            setFichaTags([...fichaTags, fichaNewTag.trim()]);
                            setFichaNewTag('');
                          }
                        }}
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="mb-crm-field">
                    <label className="mb-input-label">Notas Comerciales</label>
                    <textarea 
                      className="mb-textarea"
                      rows={4}
                      placeholder="Escribe notas sobre llamadas, acuerdos de precios, requerimientos del cliente..."
                      value={fichaNotes}
                      onChange={e => setFichaNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-modal-ftr">
              <Link 
                to={`/buscaindustrial/productos?q=${encodeURIComponent(selectedFicha.product_name)}`}
                className="mb-btn-catalog"
                target="_blank"
              >
                Ver en Catálogo Industrial
              </Link>
              <div className="mb-modal-ftr-actions">
                <button className="mb-btn-secondary" onClick={() => setSelectedFicha(null)}>
                  Cerrar
                </button>
                <button 
                  className="mb-btn-primary" 
                  onClick={handleSaveFicha}
                  disabled={isSavingFicha}
                >
                  {isSavingFicha ? 'Guardando...' : 'Guardar Seguimiento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. MODAL: VER EVIDENCIA DE CONTACTO ──────────────────────── */}
      {selectedEvidence && (
        <div className="mb-modal-overlay" onClick={() => setSelectedEvidence(null)}>
          <div className="mb-modal-card mb-modal-card--evidence" onClick={e => e.stopPropagation()}>
            <div className="mb-modal-hdr">
              <div className="mb-evidence-title-row">
                <IconShieldCheck size={18} />
                <h3 className="mb-modal-title">Evidencia de Contacto Verificado</h3>
              </div>
              <button className="mb-modal-close" onClick={() => setSelectedEvidence(null)}>
                <IconX size={16} />
              </button>
            </div>

            <div className="mb-modal-body mb-evidence-body">
              <div className="mb-evidence-highlight">
                <span className="mb-evidence-type">{selectedEvidence.channel}</span>
                <span className="mb-evidence-value">{selectedEvidence.value}</span>
              </div>

              <div className="mb-evidence-table">
                <div className="mb-evidence-field">
                  <span className="mb-ev-lbl">Fuente de Certificación:</span>
                  <span className="mb-ev-val">{selectedEvidence.evidence.source}</span>
                </div>

                <div className="mb-evidence-field">
                  <span className="mb-ev-lbl">URL / Referencia Oficial:</span>
                  <span className="mb-ev-val">
                    {selectedEvidence.evidence.source_url.startsWith('http') ? (
                      <a 
                        href={selectedEvidence.evidence.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mb-web-link"
                      >
                        {selectedEvidence.evidence.source_url}
                        <IconExternalLink size={10} />
                      </a>
                    ) : (
                      selectedEvidence.evidence.source_url
                    )}
                  </span>
                </div>

                <div className="mb-evidence-field">
                  <span className="mb-ev-lbl">Última Verificación:</span>
                  <span className="mb-ev-val">{formatDate(selectedEvidence.evidence.last_verified_at)}</span>
                </div>

                <div className="mb-evidence-field">
                  <span className="mb-ev-lbl">Nivel de Confianza:</span>
                  <span className="mb-trust-badge mb-trust-badge--constitutional">
                    ✓ {selectedEvidence.evidence.trust_status || 'VERIFICADO'} ({Math.round(selectedEvidence.evidence.confidence * 100)}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-modal-ftr">
              <button className="mb-btn-primary" onClick={() => setSelectedEvidence(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREAR SEGMENTO ──────────────────────────────────── */}
      {isSegmentModalOpen && (
        <div className="mb-modal-overlay" onClick={() => setIsSegmentModalOpen(false)}>
          <div className="mb-modal-card mb-modal-card--sm" onClick={e => e.stopPropagation()}>
            <div className="mb-modal-hdr">
              <h3 className="mb-modal-title">Crear segmento comercial</h3>
              <button className="mb-modal-close" onClick={() => setIsSegmentModalOpen(false)}>
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSegment}>
              <div className="mb-modal-body">
                <p className="mb-move-desc">
                  Agrupa los <strong>{selectedIds.size} prospectos seleccionados</strong> en un segmento específico.
                </p>

                <div className="mb-crm-field">
                  <label className="mb-input-label">Nombre del segmento</label>
                  <input 
                    type="text"
                    value={newSegmentName}
                    onChange={e => setNewSegmentName(e.target.value)}
                    placeholder="Ej. Empresas con Email Verificado..."
                    className="mb-text-input"
                    required
                    autoFocus
                  />
                </div>

                <div className="mb-crm-field" style={{ marginTop: '12px' }}>
                  <label className="mb-input-label">Descripción (opcional)</label>
                  <textarea 
                    value={newSegmentDesc}
                    onChange={e => setNewSegmentDesc(e.target.value)}
                    placeholder="Criterio de prospección comercial..."
                    className="mb-textarea"
                    rows={2}
                  />
                </div>
              </div>

              <div className="mb-modal-ftr">
                <button type="button" className="mb-btn-secondary" onClick={() => setIsSegmentModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="mb-btn-primary">
                  Crear segmento ({selectedIds.size})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: AGREGAR ETIQUETA MASIVA ────────────────────────── */}
      {isBulkTagModalOpen && (
        <div className="mb-modal-overlay" onClick={() => setIsBulkTagModalOpen(false)}>
          <div className="mb-modal-card mb-modal-card--sm" onClick={e => e.stopPropagation()}>
            <div className="mb-modal-hdr">
              <h3 className="mb-modal-title">Agregar etiqueta</h3>
              <button className="mb-modal-close" onClick={() => setIsBulkTagModalOpen(false)}>
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={e => {
              e.preventDefault();
              if (bulkTagValue.trim()) {
                handleBulkAction('ADD_TAG', { add_tag: bulkTagValue.trim() });
                setIsBulkTagModalOpen(false);
                setBulkTagValue('');
              }
            }}>
              <div className="mb-modal-body">
                <p className="mb-move-desc">
                  Se añadirá esta etiqueta a los <strong>{selectedIds.size} prospectos seleccionados</strong>.
                </p>

                <label className="mb-input-label">Nombre de etiqueta</label>
                <input 
                  type="text"
                  value={bulkTagValue}
                  onChange={e => setBulkTagValue(e.target.value)}
                  placeholder="Ej. Distribuidor, Exportador..."
                  className="mb-text-input"
                  required
                  autoFocus
                />
              </div>

              <div className="mb-modal-ftr">
                <button type="button" className="mb-btn-secondary" onClick={() => setIsBulkTagModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="mb-btn-primary">
                  Aplicar etiqueta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── PROPOSAL CREATION MODAL (ATLAS COMMERCE MVP V1) ─────────── */}
      {isProposalModalOpen && proposalModalItem && (
        <div className="mb-modal-overlay" onClick={() => setIsProposalModalOpen(false)}>
          <div className="mb-modal-card mb-modal-card--md" onClick={e => e.stopPropagation()}>
            <div className="mb-modal-hdr">
              <div>
                <h3 className="mb-modal-title">⚡ Crear Propuesta Comercial</h3>
                <span className="mb-modal-subtitle">
                  Para: <strong>{proposalModalItem.company_name}</strong> • Catálogo Atlas
                </span>
              </div>
              <button className="mb-modal-close" onClick={() => setIsProposalModalOpen(false)}>
                <IconX size={18} />
              </button>
            </div>

            {!createdProposal ? (
              <form onSubmit={e => { e.preventDefault(); handleCreateProposal(); }}>
                <div className="mb-modal-body">
                  <div className="mb-proposal-field">
                    <label className="mb-input-label">Producto / Servicio</label>
                    <input 
                      type="text" 
                      className="mb-text-input" 
                      value={proposalForm.title} 
                      onChange={e => setProposalForm({ ...proposalForm, title: e.target.value })} 
                      required 
                    />
                  </div>

                  <div className="mb-proposal-field">
                    <label className="mb-input-label">Descripción y especificaciones</label>
                    <textarea 
                      className="mb-textarea" 
                      rows={3} 
                      value={proposalForm.description} 
                      onChange={e => setProposalForm({ ...proposalForm, description: e.target.value })} 
                    />
                  </div>

                  <div className="mb-proposal-grid-2">
                    <div>
                      <label className="mb-input-label">Cantidad</label>
                      <input 
                        type="number" 
                        min="1" 
                        className="mb-text-input" 
                        value={proposalForm.quantity} 
                        onChange={e => setProposalForm({ ...proposalForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })} 
                        required 
                      />
                    </div>
                    <div>
                      <label className="mb-input-label">Precio Unitario ({proposalForm.currency})</label>
                      <input 
                        type="number" 
                        min="0" 
                        step="any" 
                        className="mb-text-input" 
                        value={proposalForm.unitPrice} 
                        onChange={e => setProposalForm({ ...proposalForm, unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })} 
                        required 
                      />
                    </div>
                  </div>

                  <div className="mb-proposal-grid-2">
                    <div>
                      <label className="mb-input-label">Vigencia (Días)</label>
                      <input 
                        type="number" 
                        min="1" 
                        className="mb-text-input" 
                        value={proposalForm.validDays} 
                        onChange={e => setProposalForm({ ...proposalForm, validDays: Math.max(1, parseInt(e.target.value) || 1) })} 
                      />
                    </div>
                    <div>
                      <label className="mb-input-label">Total a Facturar</label>
                      <div className="mb-proposal-total-preview">
                        ${(proposalForm.quantity * proposalForm.unitPrice).toLocaleString('es-AR')} {proposalForm.currency}
                      </div>
                    </div>
                  </div>

                  <div className="mb-proposal-breakdown" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', margin: '14px 0', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#475569' }}>
                      <span>Monto Bruto (GROSS_AMOUNT):</span>
                      <strong>${(proposalForm.quantity * proposalForm.unitPrice).toLocaleString('es-AR')} {proposalForm.currency}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#6366f1' }}>
                      <span>Comisión Marketplace Atlas (5%):</span>
                      <strong>-${(proposalForm.quantity * proposalForm.unitPrice * 0.05).toLocaleString('es-AR')} {proposalForm.currency}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#0f172a', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                      <span>Subtotal previo a comisiones MP:</span>
                      <strong>${(proposalForm.quantity * proposalForm.unitPrice * 0.95).toLocaleString('es-AR')} {proposalForm.currency}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', textAlign: 'right' }}>
                      * Neto sujeto a costos de Mercado Pago
                    </div>
                  </div>

                  <div className="mb-proposal-field">
                    <label className="mb-input-label">Condiciones comerciales</label>
                    <textarea 
                      className="mb-textarea" 
                      rows={2} 
                      value={proposalForm.termsConditions} 
                      onChange={e => setProposalForm({ ...proposalForm, termsConditions: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="mb-modal-ftr">
                  <button type="button" className="mb-btn-secondary" onClick={() => setIsProposalModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="mb-btn-primary" disabled={isSubmittingProposal}>
                    {isSubmittingProposal ? 'Generando...' : 'Generar Propuesta y Enlace Seguro'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mb-proposal-success-box">
                <div className="mb-ps-icon">✓</div>
                <h4 className="mb-ps-title">¡Propuesta Generada con Éxito!</h4>
                <p className="mb-ps-desc">
                  Se ha generado el enlace único y opaco para el comprador con vigencia oficial y orden Atlas SSOT.
                </p>

                <div className="mb-ps-link-box">
                  <input 
                    type="text" 
                    readOnly 
                    className="mb-ps-link-input" 
                    value={getIndustrialUrl(`/propuesta/${createdProposal.token}`)} 
                  />
                  <button 
                    type="button" 
                    className="mb-btn-copy-link" 
                    onClick={() => copyToClipboard(getIndustrialUrl(`/propuesta/${createdProposal.token}`), 'Enlace de la propuesta')}
                  >
                    Copiar
                  </button>
                </div>

                <div className="mb-ps-actions">
                  <a 
                    href={getIndustrialUrl(`/propuesta/${createdProposal.token}`)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mb-btn-preview-link"
                  >
                    Ver página de compra del cliente →
                  </a>
                  <button 
                    type="button" 
                    className="mb-btn-secondary" 
                    onClick={() => {
                      setIsProposalModalOpen(false);
                      setCreatedProposal(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
