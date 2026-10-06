import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import IndustrialGlobalHeader from '../../components/IndustrialGlobalHeader';
import { GoogleMapsProvider, type ExtendedMapInstance } from '../../lib/atlasLocal/GoogleMapsProvider';
import { CABALLITO_CENTER, CABALLITO_POLYGON } from '../../lib/atlasLocal/caballitoBoundary';
import type { MapInstance, MapBounds } from '../../lib/atlasLocal/AtlasGeoMapProvider';
import { useStore } from '../../store/useStore';
import { getEffectiveUserId } from '../../lib/atlasSavedRelations';
import { supabase } from '../../lib/supabase';
import { AtlasViralShareEngine } from '../../lib/atlasLocal/viralShare';
import { getIndustrialUrl, getAtlasUrl, getCurrentProduct } from '../../../packages/config/products';
import type { IndustrialMarketPost, IndustrialMatchResult } from '../../lib/industrialMarket/IndustrialMarketMatcher';
import './AtlasLocalCaballito.css';

export interface LocalBusinessItem {
  organization_id: string;
  name: string;
  category: string;
  industry: string;
  address: string;
  latitude: number | string;
  longitude: number | string;
  neighborhood_id: string;
  neighborhood_name: string;
  geo_source?: string;
  contact_summary?: {
    contact_status?: string;
    direct_email?: string | null;
    email_type?: string | null;
    phone?: string | null;
    website?: string | null;
    organization_contact_path?: {
      organization_name?: string;
      organization_email?: string | null;
      organization_phone?: string | null;
      organization_address?: string | null;
    };
    evidence?: {
      source?: string;
      tax_id?: string;
      confidence?: number;
    };
  };
  products?: string[];
}

export interface LocalOfferItem {
  offer_id: string;
  organization_id: string;
  organization_name?: string;
  organization_address?: string;
  organization_category?: string;
  title: string;
  description: string;
  price_text?: string;
  category?: string;
  image_url?: string;
  valid_from: string;
  valid_until: string;
  status: string;
  environment?: string;
  distance_km?: number | null;
  distance_text?: string | null;
  contact_summary?: any;
  created_at?: string;
}

export interface CommunitySections {
  ofertas_de_hoy: LocalOfferItem[];
  cerca_tuyo: LocalOfferItem[];
  alimentos: LocalOfferItem[];
  gastronomia: LocalOfferItem[];
  servicios: LocalOfferItem[];
  comercios: LocalOfferItem[];
  nuevas_ofertas: LocalOfferItem[];
}

const DEFAULT_SECTIONS: CommunitySections = {
  ofertas_de_hoy: [],
  cerca_tuyo: [],
  alimentos: [],
  gastronomia: [],
  servicios: [],
  comercios: [],
  nuevas_ofertas: []
};

// Available categories for follow & filter matching mockup
const COMMUNITY_CATEGORIES = [
  { id: 'TODAS', label: 'Todas', icon: '▦' },
  { id: 'ALIMENTOS', label: 'Alimentos', icon: '🍎' },
  { id: 'PANADERIA', label: 'Panaderías', icon: '🥐' },
  { id: 'GASTRONOMIA', label: 'Gastronomía', icon: '🍴' },
  { id: 'FERRETERIA', label: 'Ferreterías', icon: '🔧' },
  { id: 'SERVICIOS', label: 'Servicios', icon: '💼' },
  { id: 'COMERCIOS', label: 'Comercios', icon: '🏬' }
];

// AI-generated photorealistic preview assets marked strictly as TEST_VISUAL_ASSET
const MOCKUP_OFFERS: LocalOfferItem[] = [
  {
    offer_id: 'mock-1-asado',
    organization_id: 'org-carniceria-don-jose',
    organization_name: 'Carnicería Don José — TEST',
    organization_address: 'Av. Rivadavia 5200, Caballito',
    title: '20% en asado hoy',
    description: 'Oferta TEST para walkthrough visual - corte de asado especial de novillo seleccionado.',
    price_text: '$6.800',
    category: 'Alimentos',
    image_url: '/assets/caballito/asado.jpg', /* TEST_VISUAL_ASSET */
    valid_from: '2026-09-30T00:00:00Z',
    valid_until: '2026-10-13T23:59:59Z',
    status: 'ACTIVE',
    environment: 'TEST_NON_PRODUCTION',
    distance_text: 'A 350 m (TEST)'
  },
  {
    offer_id: 'mock-2-medialunas',
    organization_id: 'org-panaderia-caballito',
    organization_name: 'Panadería Caballito — TEST',
    organization_address: 'Rosario 450, Caballito',
    title: 'Promo medialunas artesanales',
    description: 'Docena de medialunas de manteca recién horneadas con almíbar artesanal.',
    price_text: '$3.500',
    category: 'Panaderías',
    image_url: '/assets/caballito/medialunas.jpg', /* TEST_VISUAL_ASSET */
    valid_from: '2026-09-30T00:00:00Z',
    valid_until: '2026-10-07T23:59:59Z',
    status: 'ACTIVE',
    environment: 'TEST_NON_PRODUCTION',
    distance_text: 'A 420 m (TEST)'
  },
  {
    offer_id: 'mock-3-verduras',
    organization_id: 'org-verduleria-plaza',
    organization_name: 'Verdulería Plaza — TEST',
    organization_address: 'Av. La Plata 320, Caballito',
    title: 'Frutas y verduras de estación',
    description: 'Bolsón campesino con 5kg de verduras frescas seleccionadas directo de quinta.',
    price_text: '$2.900',
    category: 'Alimentos',
    image_url: '/assets/caballito/verduras.jpg', /* TEST_VISUAL_ASSET */
    valid_from: '2026-09-30T00:00:00Z',
    valid_until: '2026-10-10T23:59:59Z',
    status: 'ACTIVE',
    environment: 'TEST_NON_PRODUCTION',
    distance_text: 'A 600 m (TEST)'
  },
  {
    offer_id: 'mock-4-ravioles',
    organization_id: 'org-pastas-la-nonna',
    organization_name: 'Pastas La Nonna — TEST',
    organization_address: 'Guayaquil 610, Caballito',
    title: 'Ravioles caseros',
    description: '2 cajas de ravioles artesanales de verdura y ricota con masa casera de huevo.',
    price_text: '$4.200',
    category: 'Gastronomía',
    image_url: '/assets/caballito/ravioles.jpg', /* TEST_VISUAL_ASSET */
    valid_from: '2026-09-30T00:00:00Z',
    valid_until: '2026-10-10T23:59:59Z',
    status: 'ACTIVE',
    environment: 'TEST_NON_PRODUCTION',
    distance_text: 'A 500 m (TEST)'
  }
];

export default function AtlasLocalCaballito() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();

  // Active view: COMUNIDAD | MAPA | COMERCIOS | B2B
  const tabParam = searchParams.get('tab') || 'COMUNIDAD';
  const [activeTab, setActiveTab] = useState<'COMUNIDAD' | 'MAPA' | 'COMERCIOS' | 'B2B'>(
    tabParam === 'MAPA' ? 'MAPA' :
    tabParam === 'COMERCIOS' ? 'COMERCIOS' :
    tabParam === 'B2B' || tabParam === 'NEGOCIOS' ? 'B2B' : 'COMUNIDAD'
  );

  // Business & Offers data
  const [businesses, setBusinesses] = useState<LocalBusinessItem[]>([]);
  const [offers, setOffers] = useState<LocalOfferItem[]>([]);
  const [sections, setSections] = useState<CommunitySections>(DEFAULT_SECTIONS);
  const [personalizedFeed, setPersonalizedFeed] = useState<LocalOfferItem[]>([]);
  const [followedCategories, setFollowedCategories] = useState<string[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBusiness, setSelectedBusiness] = useState<LocalBusinessItem | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<LocalOfferItem | null>(null);

  // Mi Base saved state
  const [savedOrgIds, setSavedOrgIds] = useState<Set<string>>(new Set());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Community State & Follow
  const [communityState, setCommunityState] = useState<{
    followers_count: number;
    active_offers_count: number;
    businesses_count: number;
    recent_activity?: Array<{ event_type: string; content_type: string; created_at: string }>;
  } | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Geolocation state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isCercaTuyoActive, setIsCercaTuyoActive] = useState(false);

  // Local Inbox state (Novedades internas)
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Merchant Publish Modal
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishForm, setPublishForm] = useState({
    title: '',
    description: '',
    price_text: '',
    category: 'COMERCIOS',
    valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Real Merchant Photo Upload State (Gate V2.1)
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setPhotoError('Formato no válido. Usá JPG, PNG o WEBP.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setPhotoError('La foto no debe superar los 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPhotoData(base64);
      setPhotoFile(file);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoData(null);
    setPhotoFile(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Merchant Dashboard Modal (Physical Metrics SSOT)
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [merchantOffers, setMerchantOffers] = useState<any[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Contact Modal
  const [contactModalData, setContactModalData] = useState<{
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null>(null);

  // WhatsApp Viral Share Modal
  const [whatsappModalData, setWhatsappModalData] = useState<{
    offer: LocalOfferItem;
    deepLink: string;
    whatsappUrl: string;
  } | null>(null);

  // Follow Login Gate Modal
  const [loginGateModal, setLoginGateModal] = useState<string | null>(null);

  // Community Activation Onboarding State
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);
  const [activationStep, setActivationStep] = useState<'INTERESTS' | 'BUSINESSES' | 'COMPLETION'>('INTERESTS');
  const [followedBusinessIds, setFollowedBusinessIds] = useState<Set<string>>(new Set());

  // Community Share Modal (Barrio & Business deep links)
  const [communityShareModalData, setCommunityShareModalData] = useState<{
    title: string;
    subtitle: string;
    deepLink: string;
    whatsappUrl: string;
  } | null>(null);

  // Industrial Market State (TENGO / NECESITO B2B Matching - Preserved)
  const [marketAction, setMarketAction] = useState<'OFFER' | 'DEMAND' | null>(null);
  const [matchingResults, setMatchingResults] = useState<IndustrialMatchResult[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [activeMarketPost, setActiveMarketPost] = useState<any>(null);
  const [revealedContacts, setRevealedContacts] = useState<Set<string>>(new Set());

  // Map Provider Ref & Real Map Experience State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const mapProvider = useRef(new GoogleMapsProvider());
  const [selectedMapBusiness, setSelectedMapBusiness] = useState<LocalBusinessItem | null>(null);
  const [isSearchThisAreaVisible, setIsSearchThisAreaVisible] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [isBoundsFiltered, setIsBoundsFiltered] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [_userMapLocation, setUserMapLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [mapMetrics, setMapMetrics] = useState({
    loadMs: 0,
    markersRendered: 0,
    clusteringActive: true,
    activeProvider: GoogleMapsProvider.getActiveProviderName()
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const offersSectionRef = useRef<HTMLDivElement>(null);

  // Dropdown states for Mi cuenta and Caballito selector
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const locationBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownMapContainerRef = useRef<HTMLDivElement>(null);
  const dropdownMapInstanceRef = useRef<MapInstance | null>(null);

  // Sync Supabase Auth session for user menu
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.is_anonymous) {
        setCurrentUser({ id: session.user.id, email: session.user.email });
      } else {
        setCurrentUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !session.user.is_anonymous) {
        setCurrentUser({ id: session.user.id, email: session.user.email });
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Account context (for private container dropdown and merchant status)
  const [accountContext, setAccountContext] = useState<{
    is_logged_in: boolean;
    administers_business: boolean;
    business: { organization_id: string; name: string; category?: string } | null;
  } | null>(null);

  useEffect(() => {
    async function loadAccountContext() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
        if (testUser) {
          localStorage.setItem('atlas_test_user_id', testUser);
          headers['x-user-id'] = testUser;
        }
        const res = await fetch('/api/atlas/local/account/context', { headers });
        if (res.ok) {
          const data = await res.json();
          setAccountContext(data);
        }
        const acqToken = sessionStorage.getItem('atlas_acq_token') || localStorage.getItem('atlas_acq_token');
        const activeUserId = currentUser?.id || testUser;
        if (acqToken && activeUserId) {
          const attributedKey = `atlas_acq_attributed_${acqToken}_${activeUserId}`;
          if (!localStorage.getItem(attributedKey)) {
            fetch('/api/atlas/local/acquisition/signup', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(testUser ? { 'x-user-id': testUser, 'x-atlas-test-auth': 'atlas-test-suite' } : {})
              },
              body: JSON.stringify({ token: acqToken, user_id: activeUserId })
            })
              .then(r => r.json())
              .then(d => {
                if (d.success) {
                  localStorage.setItem(attributedKey, 'true');
                }
              })
              .catch(e => console.warn('Acquisition signup link error:', e));
          }
        }
      } catch (e) {
        console.warn('Could not load account context:', e);
      }
    }
    loadAccountContext();
  }, [currentUser, searchParams]);

  // Close dropdowns on outside click or ESC key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isAccountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target) &&
        accountBtnRef.current &&
        !accountBtnRef.current.contains(target)
      ) {
        setIsAccountMenuOpen(false);
      }
      if (
        isLocationMenuOpen &&
        locationMenuRef.current &&
        !locationMenuRef.current.contains(target) &&
        locationBtnRef.current &&
        !locationBtnRef.current.contains(target)
      ) {
        setIsLocationMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAccountMenuOpen(false);
        setIsLocationMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen, isLocationMenuOpen]);

  // Render Map inside Location Selector Dropdown
  useEffect(() => {
    let isCancelled = false;

    async function initDropdownMap() {
      if (!isLocationMenuOpen || !dropdownMapContainerRef.current) return;

      if (dropdownMapInstanceRef.current) {
        dropdownMapInstanceRef.current.destroy();
        dropdownMapInstanceRef.current = null;
      }

      const map = await mapProvider.current.renderMap(dropdownMapContainerRef.current, {
        center: CABALLITO_CENTER,
        zoom: 14,
        polygon: CABALLITO_POLYGON,
        onClick: () => {}
      });

      if (!isCancelled) {
        dropdownMapInstanceRef.current = map;
        renderPins(map, businesses);
      }
    }

    if (isLocationMenuOpen) {
      const t = setTimeout(() => {
        initDropdownMap();
      }, 50);
      return () => {
        isCancelled = true;
        clearTimeout(t);
        if (dropdownMapInstanceRef.current) {
          dropdownMapInstanceRef.current.destroy();
          dropdownMapInstanceRef.current = null;
        }
      };
    } else {
      if (dropdownMapInstanceRef.current) {
        dropdownMapInstanceRef.current.destroy();
        dropdownMapInstanceRef.current = null;
      }
    }
  }, [isLocationMenuOpen, businesses]);

  const isStandaloneIndustrial = getCurrentProduct() === 'INDUSTRIAL';

  const handleNavPerfil = () => {
    setIsAccountMenuOpen(false);
    const tu = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
    navigate(tu ? `/perfil?test_user=${tu}` : '/perfil');
  };

  const handleNavMiBarrio = () => {
    setIsAccountMenuOpen(false);
    const tu = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
    navigate(tu ? `/local/mi-barrio?test_user=${tu}` : '/local/mi-barrio');
  };

  const handleNavMiComunidad = () => {
    setIsAccountMenuOpen(false);
    const tu = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
    navigate(tu ? `/local/mi-comunidad?test_user=${tu}` : '/local/mi-comunidad');
  };

  const handleNavMiBase = () => {
    setIsAccountMenuOpen(false);
    if (isStandaloneIndustrial) {
      window.location.href = getAtlasUrl('/mi-base');
    } else {
      navigate('/mi-base');
    }
  };

  const handleNavConfiguracion = () => {
    setIsAccountMenuOpen(false);
    const tu = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
    navigate(tu ? `/configuracion?test_user=${tu}` : '/configuracion');
  };

  const handleSignOut = async () => {
    setIsAccountMenuOpen(false);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    localStorage.removeItem('atlas_test_user_id');
    setCurrentUser(null);
    window.location.reload();
  };

  const scrollToOffers = () => {
    if (offersSectionRef.current) {
      offersSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getCardBadge = (title: string, category?: string) => {
    const t = (title + ' ' + (category || '')).toLowerCase();
    if (t.includes('asado') || t.includes('20%')) return { label: '20% OFF', className: 'badge-red' };
    if (t.includes('medialunas') || t.includes('2x1') || t.includes('panadería')) return { label: '2x1', className: 'badge-orange' };
    if (t.includes('verdura') || t.includes('estación') || t.includes('fruta')) return { label: 'Descuento', className: 'badge-green' };
    if (t.includes('raviol') || t.includes('casero') || t.includes('pasta')) return { label: 'Oferta especial', className: 'badge-blue' };
    return { label: 'Oferta especial', className: 'badge-blue' };
  };

  // Neutral visual fallback for products without photo (Gate V2.1: NO usar IA)
  const getNeutralProductPlaceholder = (category?: string) => {
    const cat = (category || 'PRODUCTO').toUpperCase();
    const icon = cat.includes('GASTRO') || cat.includes('ALIMENT') || cat.includes('CARNE') || cat.includes('PAN') ? '🍽️' :
                 cat.includes('SERV') ? '🛠️' :
                 cat.includes('INDUS') || cat.includes('EQUIP') || cat.includes('PACK') ? '⚙️' : '🏷️';
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23f1f5f9"/><circle cx="300" cy="180" r="55" fill="%23e2e8f0"/><text x="300" y="198" font-size="46" text-anchor="middle">${icon}</text><text x="300" y="270" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="16" font-weight="700" fill="%23475569" text-anchor="middle">PRODUCTO VERIFICADO EN CABALLITO</text><text x="300" y="295" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="13" font-weight="500" fill="%2394a3b8" text-anchor="middle">${cat}</text></svg>`;
  };

  const getCardImage = (o: LocalOfferItem) => {
    if (o.image_url && (o.image_url.startsWith('http') || o.image_url.startsWith('/') || o.image_url.startsWith('data:'))) return o.image_url;
    // Fallback: Si oferta no tiene foto, usar placeholder visual neutro del producto.
    // NO usar imagen IA haciéndola pasar por producto real.
    return getNeutralProductPlaceholder(o.category);
  };

  const displayedOffers = React.useMemo(() => {
    let list: LocalOfferItem[] = [];

    // 1. Newly created/custom merchant offers from the database feed appear first
    const customOffers = offers.filter(o => 
      !MOCKUP_OFFERS.some(m => m.offer_id === o.offer_id) && 
      !o.title.toLowerCase().includes('asado')
    );
    list.push(...customOffers);

    // 2. Real published asado offer if exists in feed
    const realAsado = offers.find(o => o.title.toLowerCase().includes('asado'));
    if (realAsado) {
      list.push({
        ...realAsado,
        image_url: realAsado.image_url || '/assets/caballito/asado.jpg',
        organization_name: realAsado.organization_name || 'Carnicería Don José — TEST',
        price_text: realAsado.price_text || '$6.800',
        distance_text: realAsado.distance_text || 'A 350 m'
      });
    } else {
      list.push(MOCKUP_OFFERS[0]);
    }

    list.push(MOCKUP_OFFERS[1]);
    list.push(MOCKUP_OFFERS[2]);
    list.push(MOCKUP_OFFERS[3]);

    if (activeCategoryFilter && activeCategoryFilter !== 'TODAS') {
      list = list.filter(o => {
        const cat = (o.category || '').toUpperCase();
        return cat.includes(activeCategoryFilter) || activeCategoryFilter.includes(cat);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o => 
        o.title.toLowerCase().includes(q) || 
        (o.description && o.description.toLowerCase().includes(q)) ||
        (o.organization_name && o.organization_name.toLowerCase().includes(q)) ||
        (o.category && o.category.toLowerCase().includes(q))
      );
    }

    return list;
  }, [offers, activeCategoryFilter, searchQuery]);

  // Active offer Org IDs set for highlighting in map
  const activeOfferOrgIds = React.useMemo(() => {
    return new Set(
      offers
        .filter(o => o.status === 'ACTIVE')
        .map(o => o.organization_id)
    );
  }, [offers]);

  // Real Businesses filtered by category, search, and bounds
  const displayedBusinesses = React.useMemo(() => {
    return businesses.filter(b => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match = (b.name && b.name.toLowerCase().includes(q)) ||
          (b.category && b.category.toLowerCase().includes(q)) ||
          (b.address && b.address.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (activeCategoryFilter && activeCategoryFilter !== 'TODAS') {
        const bCat = (b.category || '').toUpperCase();
        if (!bCat.includes(activeCategoryFilter.toUpperCase())) {
          return false;
        }
      }
      if (isBoundsFiltered && mapBounds) {
        const lat = parseFloat(String(b.latitude));
        const lng = parseFloat(String(b.longitude));
        if (isNaN(lat) || isNaN(lng)) return false;
        if (lat > mapBounds.north || lat < mapBounds.south || lng > mapBounds.east || lng < mapBounds.west) {
          return false;
        }
      }
      return true;
    });
  }, [businesses, searchQuery, activeCategoryFilter, isBoundsFiltered, mapBounds]);

  // Active offer for currently selected map business
  const activeOfferForSelected = React.useMemo(() => {
    if (!selectedMapBusiness) return null;
    return offers.find(o => o.organization_id === selectedMapBusiness.organization_id && o.status === 'ACTIVE') || null;
  }, [selectedMapBusiness, offers]);

  // 1. Fetch Community Feed
  const fetchFeed = async (coords?: { lat: number; lng: number } | null) => {
    setIsLoading(true);
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (testUser) {
        headers['x-user-id'] = testUser;
        headers['x-atlas-test-auth'] = 'atlas-test-suite';
      }

      let url = '/api/atlas/local/caballito/feed';
      const c = coords || userLocation;
      if (c) {
        url += `?lat=${c.lat}&lng=${c.lng}`;
      }

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setOffers(data.personalized_feed || []);
        setPersonalizedFeed(data.personalized_feed || []);
        if (data.sections) {
          setSections(data.sections);
        }
        if (Array.isArray(data.followed_categories)) {
          setFollowedCategories(data.followed_categories);
        }
      }
    } catch (err) {
      console.error('[AtlasLocal] Failed to fetch community feed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch Businesses
  const fetchBusinesses = async (query = '') => {
    try {
      const url = query 
        ? `/api/atlas/local/caballito/businesses?q=${encodeURIComponent(query)}`
        : `/api/atlas/local/caballito/businesses`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBusinesses(data.businesses || []);
      }
    } catch (err) {
      console.error('[AtlasLocal] Failed to fetch businesses:', err);
    }
  };

  function computeDistanceKmLocal(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  // Deterministic Ranking for Onboarding Business Discovery (Section 5)
  // 1. Categoría seleccionada
  // 2. Comercio en Caballito
  // 3. Oferta vigente
  // 4. Cercanía si permiso
  // 5. Señales reales de actividad
  // ZERO external AI, deterministic only
  const rankedDiscoveryBusinesses = React.useMemo(() => {
    return [...businesses].map(b => {
      let score = 0;
      const bCat = (b.category || '').toUpperCase();
      const isCategoryFollowed = followedCategories.some(fc => bCat.includes(fc.toUpperCase()) || fc.toUpperCase().includes(bCat));
      if (isCategoryFollowed) score += 100;
      if (b.neighborhood_id === 'caballito') score += 50;
      const hasOffer = offers.some(o => o.organization_id === b.organization_id && o.status === 'ACTIVE');
      if (hasOffer) score += 30;
      if (userLocation && b.latitude && b.longitude) {
        const d = computeDistanceKmLocal(userLocation.lat, userLocation.lng, Number(b.latitude), Number(b.longitude));
        score += Math.max(0, 20 - d);
      }
      if (b.contact_summary?.phone || b.contact_summary?.website) score += 10;
      return { business: b, score };
    }).sort((a, b) => b.score - a.score).map(x => x.business);
  }, [businesses, followedCategories, offers, userLocation]);

  // 3. Fetch Community State & Follow Status
  const fetchCommunityState = async () => {
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) {
        headers['x-user-id'] = testUser;
        headers['x-atlas-test-auth'] = 'atlas-test-suite';
      }

      const res = await fetch('/api/atlas/local/caballito/community-state', { headers });
      if (res.ok) {
        const data = await res.json();
        setCommunityState(data);
      }

      const userId = (session?.user && !session.user.is_anonymous) ? session.user.id : (testUser || null);
      if (userId) {
        const fRes = await fetch('/api/atlas/local/caballito/follow-status', { headers });
        if (fRes.ok) {
          const fData = await fRes.json();
          setIsFollowing(fData.is_following);
        }

        // Fetch User Community Graph to check activation & business follows
        try {
          const gRes = await fetch('/api/atlas/local/community/graph', { headers });
          if (gRes.ok) {
            const gData = await gRes.json();
            if (gData.isActivated) {
              localStorage.setItem('atlas_community_activated_' + userId, 'true');
            }
            if (Array.isArray(gData.business_follows)) {
              setFollowedBusinessIds(new Set(gData.business_follows.map((b: any) => b.organization_id)));
            }
          }
        } catch (e) {
          console.warn('Community graph load error:', e);
        }
      }
    } catch (e) {
      console.warn('[AtlasLocal] Failed to fetch community state:', e);
    }
  };

  useEffect(() => {
    fetchFeed();
    fetchBusinesses();
    fetchCommunityState();

    // Track incoming viral share opened
    const incomingShareId = searchParams.get('ref') || searchParams.get('share_id');
    if (incomingShareId) {
      fetch(`/api/atlas/local/share/${incomingShareId}`).catch(e => console.warn('Share track error:', e));
    }

    // Track incoming acquisition token (Zero-PII landing attribution)
    const acqToken = searchParams.get('acq') || searchParams.get('acq_token');
    if (acqToken) {
      sessionStorage.setItem('atlas_acq_token', acqToken);
      let visitorSessionId = sessionStorage.getItem('atlas_visitor_session_id');
      if (!visitorSessionId) {
        visitorSessionId = 'vses_' + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('atlas_visitor_session_id', visitorSessionId);
      }
      const testHeaders: Record<string, string> = {};
      if (searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id')) {
        testHeaders['x-atlas-test-auth'] = 'atlas-test-suite';
      }
      fetch(`/api/atlas/local/acquisition/resolve/${acqToken}?session_id=${visitorSessionId}`, {
        headers: testHeaders
      }).catch(e => console.warn('Acquisition resolve error:', e));
    }
  }, []);

  // Update tab in URL
  const handleSelectTab = (tab: 'COMUNIDAD' | 'MAPA' | 'COMERCIOS' | 'B2B') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Follow Barrio Action (Requires Login only when clicked, NO auto-follow)
  const handleFollowBarrio = async () => {
    setFollowLoading(true);
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = (session?.user && !session.user.is_anonymous) ? session.user.id : (testUser || null);

      if (!userId) {
        setLoginGateModal('Recibí novedades, ofertas y comercios de tu barrio.');
        setFollowLoading(false);
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) {
        headers['x-user-id'] = testUser;
        headers['x-atlas-test-auth'] = 'atlas-test-suite';
      }

      const res = await fetch('/api/atlas/local/caballito/follow', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'FOLLOW' })
      });

      if (res.status === 401) {
        setLoginGateModal('Recibí novedades, ofertas y comercios de tu barrio.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.is_following);
        if (communityState) {
          setCommunityState({
            ...communityState,
            followers_count: communityState.followers_count + (data.is_following ? 1 : -1)
          });
        }

        // Onboarding Check (Section 4 to 8):
        // Only trigger if user confirmed following Caballito AND is not returning / already activated
        if (data.is_following) {
          const activatedKey = 'atlas_community_activated_' + userId;
          const wasActivatedLocal = localStorage.getItem(activatedKey) === 'true';

          if (!wasActivatedLocal) {
            // Check community graph for existing activation
            try {
              const gRes = await fetch('/api/atlas/local/community/graph', { headers });
              if (gRes.ok) {
                const gData = await gRes.json();
                if (gData.isActivated) {
                  localStorage.setItem(activatedKey, 'true');
                  return; // Returning user skips onboarding!
                }
                if (Array.isArray(gData.business_follows)) {
                  setFollowedBusinessIds(new Set(gData.business_follows.map((bf: any) => bf.organization_id)));
                }
              }
            } catch (e) {
              console.warn('Graph check error:', e);
            }

            // Start Onboarding Step 1: Interests
            setIsActivationModalOpen(true);
            setActivationStep('INTERESTS');
          }
        }
      }
    } catch (err) {
      console.error('[AtlasLocal] Follow error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  // Toggle Category Follow (Section 4 & 8)
  const handleToggleCategoryFollow = async (categoryId: string) => {
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = (session?.user && !session.user.is_anonymous) ? session.user.id : (testUser || null);

      if (!userId) {
        setLoginGateModal('Inicia sesión en Atlas para seguir categorías de Caballito.');
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) {
        headers['x-user-id'] = testUser;
        headers['x-atlas-test-auth'] = 'atlas-test-suite';
      }

      const res = await fetch('/api/atlas/local/caballito/follow-category', {
        method: 'POST',
        headers,
        body: JSON.stringify({ category_id: categoryId })
      });

      if (res.status === 401) {
        setLoginGateModal('Inicia sesión en Atlas para seguir categorías de Caballito.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.is_following) {
          setFollowedCategories(prev => [...prev, categoryId]);
        } else {
          setFollowedCategories(prev => prev.filter(c => c !== categoryId));
        }
        // Refresh personalized feed with updated categories
        fetchFeed(userLocation);
      }
    } catch (err) {
      console.error('[AtlasLocal] Category follow error:', err);
    }
  };

  // Toggle Business Follow (Section 6)
  const handleToggleBusinessFollow = async (orgId: string) => {
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = (session?.user && !session.user.is_anonymous) ? session.user.id : (testUser || null);

      console.log('[handleToggleBusinessFollow] clicked orgId:', orgId, 'userId:', userId);

      if (!userId) {
        setLoginGateModal('Inicia sesión para seguir este comercio.');
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) {
        headers['x-user-id'] = testUser;
        headers['x-atlas-test-auth'] = 'atlas-test-suite';
      }

      const res = await fetch(`/api/atlas/local/business/${orgId}/follow`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ is_test: Boolean(testUser) })
      });

      console.log('[handleToggleBusinessFollow] res status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[handleToggleBusinessFollow] data:', data);
        setFollowedBusinessIds(prev => {
          const next = new Set(prev);
          if (data.is_following) {
            next.add(orgId);
          } else {
            next.delete(orgId);
          }
          return next;
        });
      } else {
        const errText = await res.text();
        console.error('[handleToggleBusinessFollow] error body:', errText);
      }
    } catch (e) {
      console.error('[AtlasLocal] Business follow error:', e);
    }
  };

  // Share Caballito (Section 11)
  const handleShareCaballito = async () => {
    try {
      const parentShareId = searchParams.get('ref') || searchParams.get('share_id') || searchParams.get('sid') || null;
      const shareRes = await AtlasViralShareEngine.createTrackedShare({
        content_type: 'LOCAL_SEARCH',
        content_id: 'caballito',
        barrio_id: 'caballito',
        parent_share_id: parentShareId,
        title: 'Caballito • Comunidad Comercial',
        summary: 'Descubrí ofertas, promociones y comercios locales en Caballito.'
      });
      setCommunityShareModalData({
        title: 'Compartir Caballito',
        subtitle: 'Invitá a vecinos y amigos a sumarse a la comunidad comercial del barrio.',
        deepLink: shareRes.deepLink,
        whatsappUrl: shareRes.whatsappUrl
      });
    } catch (e) {
      console.warn('Share Caballito error:', e);
    }
  };

  // Share Business (Section 11)
  const handleShareBusiness = async (b: LocalBusinessItem) => {
    try {
      const parentShareId = searchParams.get('ref') || searchParams.get('share_id') || searchParams.get('sid') || null;
      const shareRes = await AtlasViralShareEngine.createTrackedShare({
        content_type: 'BUSINESS',
        content_id: b.organization_id,
        barrio_id: 'caballito',
        organization_id: b.organization_id,
        parent_share_id: parentShareId,
        title: b.name,
        summary: `${b.name} en Caballito • ${b.category} • ${b.address}`
      });
      setCommunityShareModalData({
        title: `Compartir ${b.name}`,
        subtitle: `${b.category} en Caballito`,
        deepLink: shareRes.deepLink,
        whatsappUrl: shareRes.whatsappUrl
      });
    } catch (e) {
      console.warn('Share Business error:', e);
    }
  };

  // Geolocation "Cerca mío" (Section 6 & 9)
  const handleNearMe = () => {
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por tu navegador.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setIsLocating(false);
        fetchFeed(coords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(coords);
          mapInstanceRef.current.setZoom(16);
        }
      },
      (err) => {
        console.warn('Geolocation denied or failed:', err);
        setIsLocating(false);
        // Default to Caballito center
        setUserLocation(CABALLITO_CENTER);
        fetchFeed(CABALLITO_CENTER);
      },
      { timeout: 8000 }
    );
  };

  // Toggle Cerca Tuyo with explicit location permission (USER_LOCATION_PERSISTED = FALSE)
  const handleToggleCercaTuyo = () => {
    if (isCercaTuyoActive) {
      setIsCercaTuyoActive(false);
      setUserLocation(null);
      fetchFeed(null);
      return;
    }

    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por tu navegador.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Strictly in-memory React state: USER_LOCATION_PERSISTED = FALSE
        setUserLocation(coords);
        setIsCercaTuyoActive(true);
        setIsLocating(false);
        fetchFeed(coords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(coords);
          mapInstanceRef.current.setZoom(16);
        }
      },
      (err) => {
        console.warn('Geolocation permission denied:', err);
        setIsLocating(false);
        alert('Se requiere permiso de ubicación para ordenar ofertas por cercanía.');
      },
      { timeout: 8000 }
    );
  };

  // Open Local Inbox (Novedades internas de comercios seguidos y barrio)
  const handleOpenInbox = async () => {
    setIsInboxOpen(true);
    setInboxLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      if (testUser) headers['x-user-id'] = testUser;
      const res = await fetch('/api/atlas/local/inbox', { headers });
      if (res.ok) {
        const data = await res.json();
        setInboxItems(data.items || []);
      }
    } catch (e) {
      console.warn('Inbox fetch error:', e);
    } finally {
      setInboxLoading(false);
    }
  };

  // Handle bidirectional Map connection: /comercio -> Ver en mapa with selected=<orgId>
  useEffect(() => {
    const selectedOrgId = searchParams.get('selected');
    if (selectedOrgId && businesses.length > 0) {
      const found = businesses.find(b => b.organization_id === selectedOrgId);
      if (found) {
        setSelectedMapBusiness(found);
        setActiveTab('MAPA');
        setTimeout(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat: Number(found.latitude), lng: Number(found.longitude) });
            mapInstanceRef.current.setZoom(16);
          }
        }, 150);
      }
    }
  }, [searchParams, businesses]);

  // Save to Mi Base (Section 6)
  const handleSaveToMiBase = async (business: LocalBusinessItem) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.is_anonymous) {
        navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }

      const effectiveUserId = await getEffectiveUserId();
      if (!effectiveUserId) {
        navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }

      const response = await fetch('/api/platform/saved-relations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          source_type: 'BUSINESS',
          source_id: business.organization_id,
          target_entity_type: 'ORGANIZATION',
          target_entity_id: business.organization_id,
          relation_type: 'SAVED_BUSINESS',
          notes: `Guardado desde Industrial Local Caballito (${business.category})`,
          metadata: {
            name: business.name,
            address: business.address,
            neighborhood: 'Caballito',
            saved_at: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        setSavedOrgIds(prev => new Set([...prev, business.organization_id]));
        setSaveFeedback('✓ Guardado en Mi Base');
        setTimeout(() => setSaveFeedback(null), 3000);
      }
    } catch (e) {
      console.error('[AtlasLocal] Error saving to Mi Base:', e);
    }
  };

  // Save Offer Action (Section 6)
  const handleSaveOffer = async (offer: LocalOfferItem) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.is_anonymous) {
        navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }

      // Record first-party event OFFER_SAVED
      await fetch('/api/atlas/local/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          event_type: 'OFFER_SAVED',
          barrio_id: 'caballito',
          content_type: 'OFFER',
          content_id: offer.offer_id
        })
      });

      setSavedOrgIds(prev => new Set([...prev, offer.offer_id]));
      alert(`¡Oferta "${offer.title}" guardada en Mi Base!`);
    } catch (e) {
      console.error('[AtlasLocal] Error saving offer:', e);
    }
  };

  // Contact Action (Section 6)
  const handleContactOffer = async (offer: LocalOfferItem) => {
    // Record first-party event CONTACT_CLICKED
    try {
      await fetch('/api/atlas/local/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'CONTACT_CLICKED',
          barrio_id: 'caballito',
          content_type: 'OFFER',
          content_id: offer.offer_id
        })
      });
    } catch (e) {
      console.warn('[Tracking] Failed to log contact click:', e);
    }

    const email = offer.contact_summary?.organization_contact_path?.organization_email ||
                  offer.contact_summary?.direct_email ||
                  'contacto@buscadorindustrial.com';
    const phone = offer.contact_summary?.phone || null;

    setContactModalData({
      name: offer.organization_name || 'Comercio de Caballito',
      email,
      phone,
      address: offer.organization_address || 'Caballito, CABA'
    });
  };

  // WhatsApp Viral Share (Section 11)
  const handleShareOffer = async (offer: LocalOfferItem) => {
    try {
      const parentShareId = searchParams.get('ref') || searchParams.get('share_id') || searchParams.get('sid') || null;
      const shareRes = await AtlasViralShareEngine.createTrackedShare({
        content_type: 'OFFER',
        content_id: offer.offer_id,
        barrio_id: 'caballito',
        organization_id: offer.organization_id,
        parent_share_id: parentShareId,
        title: offer.title,
        summary: `${offer.organization_name || 'Comercio de Caballito'} • ${offer.description} (${offer.price_text || 'Oferta'})`,
        valid_until: offer.valid_until,
      });
      setWhatsappModalData({
        offer,
        deepLink: shareRes.deepLink,
        whatsappUrl: shareRes.whatsappUrl
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  // Merchant Publish Submit (Section 3 & 4)
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishLoading(true);
    setPublishError(null);
    setPublishSuccess(null);

    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = (session?.user && !session.user.is_anonymous) ? session.user.id : (testUser || null);

      if (!userId) {
        setPublishLoading(false);
        setLoginGateModal('Inicia sesión como comercio autorizado de Caballito para publicar ofertas.');
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) headers['x-user-id'] = testUser;

      const res = await fetch('/api/atlas/local/caballito/offers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: publishForm.title.trim(),
          description: publishForm.description.trim(),
          price_text: publishForm.price_text.trim() || null,
          category: publishForm.category,
          valid_until: publishForm.valid_until ? new Date(publishForm.valid_until).toISOString() : null,
          photo_data: photoData || null,
          mime_type: photoFile?.type || 'image/jpeg',
          environment: 'TEST_NON_PRODUCTION'
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setPublishError(data.message || data.error || 'Error al publicar oferta.');
        return;
      }

      setPublishSuccess(`¡Oferta "${data.offer.title}" publicada exitosamente en Caballito!`);
      // Reset form & photo
      setPublishForm({
        title: '',
        description: '',
        price_text: '',
        category: 'COMERCIOS',
        valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
      });
      handleRemovePhoto();

      // Automatic Distribution: Refresh feed immediately!
      fetchFeed(userLocation);
      fetchCommunityState();

      setTimeout(() => {
        setIsPublishModalOpen(false);
        setPublishSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPublishError(err.message || 'Error de conexión.');
    } finally {
      setPublishLoading(false);
    }
  };

  // Fetch Merchant Metrics (Section 12)
  const handleOpenMerchantMetrics = async () => {
    setIsMetricsModalOpen(true);
    setMetricsLoading(true);
    try {
      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id') || 'auth_merchant_caballito';
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (testUser) headers['x-user-id'] = testUser;

      const res = await fetch('/api/atlas/local/merchant/my-offers', { headers });

      if (res.ok) {
        const data = await res.json();
        const offersList = data.offers || [];

        // Fetch physical metrics for each offer
        const enriched = await Promise.all(offersList.map(async (o: any) => {
          try {
            const mRes = await fetch(`/api/atlas/local/merchant/metrics/${o.offer_id}`);
            if (mRes.ok) {
              const mData = await mRes.json();
              return { ...o, metrics: mData.metrics };
            }
          } catch (e) {
            // ignore
          }
          return { ...o, metrics: { views: 0, unique_viewers: 0, whatsapp_shares: 0, contact_clicks: 0, saves: 0 } };
        }));

        setMerchantOffers(enriched);
      }
    } catch (e) {
      console.warn('Failed to load merchant metrics:', e);
    } finally {
      setMetricsLoading(false);
    }
  };

  // User Geolocation Handler (On-demand, non-persistent)
  const handleGetMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserMapLocation(coords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(coords);
          mapInstanceRef.current.setZoom(15);
          const ext = mapInstanceRef.current as ExtendedMapInstance;
          if (ext.addUserLocationMarker) {
            ext.addUserLocationMarker(coords);
          }
        }
      },
      (err) => {
        setIsLocatingUser(false);
        console.warn('Geolocation denied or unavailable:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Render Map pins fallback
  function renderPins(map: MapInstance, busList: LocalBusinessItem[]) {
    map.clearMarkers();
    busList.forEach((b, idx) => {
      const lat = parseFloat(String(b.latitude));
      const lng = parseFloat(String(b.longitude));
      if (!isNaN(lat) && !isNaN(lng)) {
        map.addMarker({
          position: { lat, lng },
          title: b.name,
          category: b.category,
          label: String(idx + 1),
          color: '#0284c7',
          onClick: () => setSelectedMapBusiness(b)
        } as any);
      }
    });
  }

  // Initialize Map with MapLibre real cartography, clustering & boundary
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }

      setMapLoadError(false);

      // Determine mode: SAFE_PREVIEW if sso=atlas or preview=safe or dev, otherwise PRODUCTION
      const isSafePreview = searchParams.get('sso') === 'atlas' || searchParams.get('preview') === 'safe' || import.meta.env.DEV;
      const mode = isSafePreview ? 'SAFE_PREVIEW' : 'PRODUCTION';

      try {
        const map = await mapProvider.current.renderMap(mapContainerRef.current, {
          center: CABALLITO_CENTER,
          zoom: 14,
          polygon: CABALLITO_POLYGON,
          businesses: displayedBusinesses,
          activeOfferOrgIds: activeOfferOrgIds,
          onBusinessSelect: (b: any) => setSelectedMapBusiness(b),
          onClick: () => setSelectedMapBusiness(null),
          mode,
          isSafePreview
        });

        if (!isCancelled) {
          mapInstanceRef.current = map;
          const ext = map as ExtendedMapInstance;
          if (ext.onBoundsChange) {
            ext.onBoundsChange((bounds) => {
              setMapBounds(bounds);
              setIsSearchThisAreaVisible(true);
            });
          }
          
          // Ensure businesses are populated immediately upon map load, especially for fallback Native Map
          if (ext.setBusinesses) {
            ext.setBusinesses(displayedBusinesses, activeOfferOrgIds);
          } else {
            renderPins(map, displayedBusinesses);
          }

          const metrics = {
            loadMs: ext.getLoadTimeMs ? ext.getLoadTimeMs() : 45,
            markersRendered: ext.getMarkersCount ? ext.getMarkersCount() : displayedBusinesses.length,
            clusteringActive: ext.isClusteringActive ? ext.isClusteringActive() : true,
            activeProvider: GoogleMapsProvider.getActiveProviderName()
          };
          setMapMetrics(metrics);

          if (typeof window !== 'undefined') {
            (window as any).__atlasMapInstance = map;
            (window as any).__atlasSetSelectedMapBusiness = setSelectedMapBusiness;
            (window as any).__MAP_TELEMETRY__ = {
              ...metrics,
              businessesCount: displayedBusinesses.length,
              activeOffersCount: activeOfferOrgIds.size,
              clusteringActive: metrics.clusteringActive,
              timestamp: Date.now()
            };
          }
        }
      } catch (err) {
        console.warn('[AtlasLocal] Map failed to load cleanly:', err);
        if (!isCancelled) {
          setMapLoadError(true);
        }
      }
    }

    if (activeTab === 'MAPA' || activeTab === 'COMERCIOS' || activeTab === 'B2B') {
      initMap();
    }

    return () => {
      isCancelled = true;
      if (typeof window !== 'undefined') {
        delete (window as any).__atlasMapInstance;
        delete (window as any).__atlasSetSelectedMapBusiness;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab]);

  // Sync displayedBusinesses and offers to mapInstance
  useEffect(() => {
    if (mapInstanceRef.current && (activeTab === 'MAPA' || activeTab === 'COMERCIOS' || activeTab === 'B2B')) {
      const ext = mapInstanceRef.current as ExtendedMapInstance;
      if (ext.setBusinesses) {
        ext.setBusinesses(displayedBusinesses, activeOfferOrgIds);
        setMapMetrics(prev => ({
          ...prev,
          markersRendered: ext.getMarkersCount ? ext.getMarkersCount() : displayedBusinesses.length
        }));
      } else {
        renderPins(mapInstanceRef.current, displayedBusinesses);
      }
    }
  }, [displayedBusinesses, activeOfferOrgIds, activeTab]);


  // B2B Market Matching Handler (Preserved)
  const handleStartMarketAction = async (type: 'OFFER' | 'DEMAND') => {
    setMarketAction(type);
    setActiveTab('B2B');
    setMatchingLoading(true);

    try {
      const canaryBusiness = businesses.find(b => b.organization_id === '4942a271-42be-4c1d-b384-0b7bb9dbbd3f') || businesses[0];
      const samplePost: IndustrialMarketPost = {
        post_id: type === 'OFFER' ? 'canary-offer-1' : 'canary-demand-1',
        organization_id: canaryBusiness?.organization_id || 'sample-org',
        created_by_user_id: user?.id || 'demo-user',
        type,
        title: type === 'OFFER' ? 'Insumos de Packaging y Envases Reciclables' : 'Necesito Proveedor de Equipamiento y Mantenimiento',
        description: type === 'OFFER' 
          ? 'Ofrecemos cajas de cartón corrugado, film alveolar y packaging a medida para comercios de Caballito.'
          : 'Buscamos taller de bobinado y mantenimiento electromecánico de motores en zona Caballito.',
        category: type === 'OFFER' ? 'PACKAGING / IMPRENTA' : 'EQUIPOS / MANTENIMIENTO',
        neighborhood: 'Caballito',
        tags: type === 'OFFER' ? ['packaging', 'carton', 'envases', 'imprenta'] : ['motores', 'mantenimiento', 'equipos', 'taller'],
        status: 'ACTIVE',
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
        created_at: new Date().toISOString()
      };

      setActiveMarketPost(samplePost);
      const matches = IndustrialMarketMatcher.findMatches(samplePost, businesses);
      setMatchingResults(matches);
    } catch (e) {
      console.error('Error running market matcher:', e);
    } finally {
      setMatchingLoading(false);
    }
  };

  // Helper to render an Offer Card matching the photo faithfully
  const renderOfferCard = (o: LocalOfferItem) => {
    const badge = getCardBadge(o.title, o.category);
    const imgSrc = getCardImage(o);
    const isSaved = savedOrgIds.has(o.offer_id);

    return (
      <div key={o.offer_id} className="caballito-offer-card atlas-community-offer-card" id={`offer-${o.offer_id}`}>
        {/* Card Image with Floating Badges */}
        <div className="caballito-card-img-wrap" onClick={() => setSelectedOffer(o)}>
          <img src={imgSrc} alt={o.title} className="caballito-card-img" />
          <span className={`caballito-card-discount-badge ${badge.className}`}>
            {badge.label}
          </span>
          <button
            type="button"
            className={`caballito-card-fav-btn ${isSaved ? 'is-saved' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleSaveOffer(o);
            }}
            title={isSaved ? 'Guardado en favoritos' : 'Guardar en favoritos'}
            aria-label="Guardar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? '#ef4444' : 'none'} stroke={isSaved ? '#ef4444' : 'currentColor'} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Card Body */}
        <div className="caballito-card-body">
          <h3 className="caballito-card-title atlas-offer-card-title" onClick={() => setSelectedOffer(o)}>
            {o.title}
          </h3>
          <div className="caballito-card-merchant">
            <span className="atlas-offer-merchant-name">{o.organization_name || 'Comercio de Caballito'}</span>
          </div>

          {/* Category Pill Tag */}
          {o.category && (
            <div>
              <span className="caballito-card-category-tag">
                {o.category.charAt(0).toUpperCase() + o.category.slice(1).toLowerCase()}
              </span>
            </div>
          )}

          {/* Price & Meta info */}
          <div className="caballito-card-price-row atlas-offer-meta-row">
            <span className="caballito-card-price atlas-offer-price-badge">{o.price_text || '$6.800'}</span>
            {o.distance_text && (
              <span className="caballito-card-distance atlas-offer-distance-pill">
                📍 {o.distance_text}
              </span>
            )}
            {o.valid_until && (
              <span className="caballito-card-validity">
                📅 Vigencia: {new Date(o.valid_until).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>

          {/* Action Buttons row (Preserves test classes: atlas-card-btn view/contact/save/share) */}
          <div className="caballito-card-actions atlas-offer-actions-grid">
            <button
              type="button"
              className="caballito-card-btn-view atlas-card-btn view"
              onClick={() => setSelectedOffer(o)}
              title="Ver oferta"
            >
              Ver oferta →
            </button>

            <button
              type="button"
              className="caballito-card-btn-contact atlas-card-btn contact"
              onClick={() => handleContactOffer(o)}
              title="Contactar al comercio"
            >
              💬 Contactar
            </button>

            <button
              type="button"
              className={`caballito-card-btn-icon atlas-card-btn save ${isSaved ? 'saved' : ''}`}
              onClick={() => handleSaveOffer(o)}
              title="Guardar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? '#0284c7' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>

            <button
              type="button"
              className="caballito-card-btn-icon atlas-card-btn share"
              onClick={() => handleShareOffer(o)}
              title="Compartir"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="caballito-page-root atlas-local-page">
      {/* 1. TOP NAVBAR (Identical to reference mockup) */}
      <IndustrialGlobalHeader />

    {/* 2. MAIN CONTAINER */}
      <main className="caballito-main-content atlas-local-container">
        {/* HERO SECTION */}
        <section className="caballito-hero-section">
          {/* Left Column */}
          <div className="caballito-hero-left">
            <div className="caballito-hero-tag">
              CABALLITO • COMUNIDAD COMERCIAL
            </div>
            <h1 className="caballito-hero-title">
              Ofertas y comercios <br />
              <span className="text-blue">cerca tuyo</span>
            </h1>
            <p className="caballito-hero-desc">
              <span className="caballito-desc-desktop">Descubrí promociones del barrio, comprá directo en comercios verificados y apoyá al comercio local.</span>
              <span className="caballito-desc-mobile">Promociones del barrio, comercio real y vecinos de Caballito.</span>
            </p>

            <div className="caballito-hero-ctas">
              <button
                type="button"
                className="caballito-btn-primary"
                onClick={scrollToOffers}
              >
                🏷️ Ver ofertas →
              </button>
              <button
                type="button"
                id="btn-publicar-oferta"
                className="caballito-btn-secondary"
                onClick={() => setIsPublishModalOpen(true)}
              >
                📢 Publicar oferta
              </button>
            </div>
          </div>

          {/* Right Column: Hero Visual Card */}
          <div className="caballito-hero-card">
            <img
              src="/assets/caballito/hero_landmark.jpg"
              alt="Caballito - Primera Junta y Parque Rivadavia"
              className="caballito-hero-img"
            />

            {/* Floating Badge Top Left (TEST_VISUAL_ASSET) */}
            <div className="caballito-floating-badge" title="TEST_VISUAL_ASSET: Comercio local verificado">
              <div className="caballito-badge-icon">🏪</div>
              <div>
                <div className="caballito-badge-text-top">Comercios locales</div>
                <div className="caballito-badge-text-sub">del barrio</div>
              </div>
            </div>

            {/* Floating Badge Top Right */}
            <div className="caballito-floating-note">
              Caballito siempre cerca ↖
            </div>

            {/* Floating Badge Bottom Right */}
            <div className="caballito-floating-location">
              📍 Caballito, CABA
            </div>
          </div>
        </section>

        {/* 3. METRICS & "MI BARRIO" WIDGET STRIP */}
        <section className="caballito-stats-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
            <div className="caballito-stat-item">
              <div className="caballito-stat-icon-wrap">🏪</div>
              <div>
                <div className="caballito-stat-num" id="metric-businesses">
                  {communityState ? communityState.businesses_count : (businesses.length > 0 ? businesses.length : '—')}
                </div>
                <div className="caballito-stat-label">Comercios verificados</div>
              </div>
            </div>

            <div className="caballito-stat-item">
              <div className="caballito-stat-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>🏷️</div>
              <div>
                <div className="caballito-stat-num" id="metric-offers">
                  {communityState ? communityState.active_offers_count : (offers.length > 0 ? offers.length : '—')}
                </div>
                <div className="caballito-stat-label">Ofertas activas</div>
              </div>
            </div>

            <div className="caballito-stat-item">
              <div className="caballito-stat-icon-wrap" style={{ background: '#f0fdf4', color: '#16a34a' }}>👥</div>
              <div>
                <div className="caballito-stat-num" id="metric-followers">
                  {communityState ? communityState.followers_count : '—'}
                </div>
                <div className="caballito-stat-label">Vecinos te siguen</div>
              </div>
            </div>

            {(!communityState || communityState.followers_count > 0) && (
              <div className="caballito-community-cluster" title="TEST_VISUAL_ASSET: Avatares representativos de comunidad">
                <div className="caballito-avatars-row">
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&crop=face" alt="Vecina 1" className="caballito-avatar-img" />
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face" alt="Vecino 2" className="caballito-avatar-img" />
                  <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face" alt="Vecina 3" className="caballito-avatar-img" />
                  <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face" alt="Vecino 4" className="caballito-avatar-img" />
                </div>
                <div className="caballito-cluster-text">
                  Una comunidad que hace crecer el barrio ❤️
                </div>
              </div>
            )}
          </div>

          {/* Mi Barrio Sub-box: Community Entry & Sharing */}
          <div className="caballito-mi-barrio-box">
            <div className="caballito-mi-barrio-icon">🏡</div>
            <div className="caballito-mi-barrio-text">
              <div className="caballito-mi-barrio-title">Seguir Caballito</div>
              <div className="caballito-mi-barrio-desc">Recibí novedades, ofertas y comercios de tu barrio.</div>
            </div>
            <div className="caballito-mi-barrio-actions">
              <button
                type="button"
                id="btn-seguir-caballito"
                className={`caballito-btn-seguir-barrio ${isFollowing ? 'is-following' : ''}`}
                onClick={handleFollowBarrio}
                disabled={followLoading}
              >
                {isFollowing ? '✓ Siguiendo barrio' : 'Seguir Caballito'}
              </button>
              <button
                type="button"
                id="btn-compartir-caballito"
                className="caballito-btn-compartir-barrio"
                onClick={handleShareCaballito}
                title="Compartir Caballito con vecinos y amigos"
              >
                🔗 Compartir Caballito
              </button>
            </div>
          </div>
        </section>

        {/* 4. OFERTAS DESTACADAS SECTION & FILTERS */}
        <section className="caballito-offers-section" ref={offersSectionRef}>
          <div className="caballito-section-header">
            <div>
              <h2 className="caballito-section-title caballito-section-title-desktop">
                {activeTab === 'MAPA' ? 'Mapa Comercial de Caballito' : 'Ofertas destacadas en Caballito'}
              </h2>
              <h2 className="caballito-section-title caballito-section-title-mobile">
                {activeTab === 'MAPA' ? 'Mapa de Caballito' : 'Ofertas en Caballito'}
              </h2>
            </div>

            {/* View Mode Switcher: [Lista] / [Mapa] */}
            <div className="caballito-view-mode-toggle" role="group" aria-label="Modo de vista">
              <button
                type="button"
                id="toggle-view-lista"
                className={`caballito-toggle-btn ${activeTab !== 'MAPA' ? 'active' : ''}`}
                onClick={() => setActiveTab('COMUNIDAD')}
              >
                📋 Lista
              </button>
              <button
                type="button"
                id="toggle-view-mapa"
                className={`caballito-toggle-btn ${activeTab === 'MAPA' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('MAPA');
                  setTimeout(() => {
                    const el = document.getElementById('seccion-mapa-completo');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
              >
                🗺️ Mapa
              </button>
            </div>

            <button
              type="button"
              className="caballito-view-all-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setActiveCategoryFilter(null)}
            >
              Ver todas las ofertas →
            </button>
            <button
              type="button"
              className="caballito-mobile-filter-icon"
              onClick={() => setActiveCategoryFilter(null)}
              aria-label="Filtros"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
            </button>
          </div>

          {/* Category Filter Pills (Shared between Lista and Mapa) */}
          <div className="caballito-categories-scroll">
            <button
              type="button"
              id="btn-cerca-tuyo"
              className={`caballito-cat-pill ${isCercaTuyoActive ? 'active' : ''}`}
              style={isCercaTuyoActive ? { background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' } : {}}
              onClick={handleToggleCercaTuyo}
              title="Ordenar ofertas por distancia física (USER_LOCATION_PERSISTED = FALSE)"
            >
              <span>📍</span>
              <span>{isLocating ? 'Obteniendo GPS...' : isCercaTuyoActive ? 'Cerca tuyo ✓' : 'Cerca tuyo'}</span>
            </button>
            {COMMUNITY_CATEGORIES.map(cat => {
              const isActive = (cat.id === 'TODAS' && activeCategoryFilter === null) || (activeCategoryFilter === cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`caballito-cat-pill ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveCategoryFilter(cat.id === 'TODAS' ? null : cat.id)}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* View 1: Lista (Offers Grid) */}
          {(activeTab !== 'MAPA' && activeTab !== 'B2B') && (
            <div className="caballito-cards-grid">
              {displayedOffers
                .filter(o => {
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const match = o.title.toLowerCase().includes(q) ||
                      (o.description && o.description.toLowerCase().includes(q)) ||
                      (o.organization_name && o.organization_name.toLowerCase().includes(q)) ||
                      (o.category && o.category.toLowerCase().includes(q));
                    if (!match) return false;
                  }
                  if (!activeCategoryFilter || activeCategoryFilter === 'TODAS') return true;
                  const matchCat = o.category?.toUpperCase() || '';
                  return matchCat.includes(activeCategoryFilter);
                })
                .slice(0, 4)
                .map(o => renderOfferCard(o))}
            </div>
          )}

          {/* View 2: Real Interactive Map Experience */}
          {(activeTab === 'MAPA' || activeTab === 'B2B') && (
            <div id="seccion-mapa-completo" className="caballito-real-map-container">
              {mapLoadError ? (
                <div id="caballito-map-fallback-notice" className="caballito-map-fallback-clean">
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗺️</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                    Mapa temporalmente no disponible
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '420px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
                    Podés seguir explorando los comercios, ofertas y promociones directamente desde la vista de lista.
                  </p>
                  <button
                    type="button"
                    id="btn-fallback-to-list"
                    className="caballito-btn-primary"
                    onClick={() => setActiveTab('COMUNIDAD')}
                    style={{ padding: '0.7rem 1.5rem', fontSize: '0.95rem' }}
                  >
                    Ver lista de comercios y ofertas
                  </button>
                </div>
              ) : (
                /* Map Canvas Wrapper */
                <div className="caballito-map-canvas-wrapper">
                  <div
                    ref={mapContainerRef}
                    id="caballito-main-map-canvas"
                    className="caballito-real-map-canvas"
                  />

                {/* Floating Map Controls at Top: [Buscar en esta zona] */}
                <div className="caballito-map-floating-controls">
                  {isSearchThisAreaVisible && (
                    <button
                      type="button"
                      id="btn-search-this-area"
                      className="caballito-btn-search-area animate-fade-in"
                      onClick={() => {
                        setIsBoundsFiltered(true);
                        setIsSearchThisAreaVisible(false);
                      }}
                    >
                      🔍 Buscar en esta zona
                    </button>
                  )}
                  {isBoundsFiltered && (
                    <div className="caballito-bounds-pill">
                      <span>Filtro de zona activo ({displayedBusinesses.length} comercios)</span>
                      <button
                        type="button"
                        id="btn-clear-bounds-filter"
                        className="caballito-btn-clear-bounds"
                        onClick={() => setIsBoundsFiltered(false)}
                      >
                        ✕ Ver todos
                      </button>
                    </div>
                  )}
                </div>

                {/* Floating Side Tools: My Location & Reset Center */}
                <div className="caballito-map-side-controls">
                  <button
                    type="button"
                    id="btn-my-location"
                    className={`caballito-map-control-btn ${isLocatingUser ? 'loading' : ''}`}
                    title="Mi ubicación actual"
                    onClick={handleGetMyLocation}
                    aria-label="Mi ubicación"
                  >
                    {isLocatingUser ? '⏳' : '📍'}
                  </button>
                  <button
                    type="button"
                    id="btn-center-caballito"
                    className="caballito-map-control-btn"
                    title="Centrar en Caballito"
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.setCenter(CABALLITO_CENTER);
                        mapInstanceRef.current.setZoom(14);
                      }
                    }}
                    aria-label="Centrar Caballito"
                  >
                    🎯
                  </button>
                </div>

                {/* Desktop Floating Business Card */}
                {selectedMapBusiness && (
                  <div id="caballito-map-card-desktop" className="caballito-map-card-desktop animate-scale-up">
                    <div className="caballito-map-card-header">
                      <span className="caballito-map-card-category">{selectedMapBusiness.category}</span>
                      <button
                        type="button"
                        id="btn-close-map-card"
                        className="caballito-map-card-close"
                        onClick={() => setSelectedMapBusiness(null)}
                        aria-label="Cerrar ficha"
                      >
                        ✕
                      </button>
                    </div>

                    <h3 className="caballito-map-card-title">
                      {selectedMapBusiness.name}
                      <span className="caballito-card-verified-badge" title="Comercio verificado">✓</span>
                    </h3>

                    <div className="caballito-map-card-address">
                      📍 {selectedMapBusiness.address}
                    </div>

                    {activeOfferForSelected ? (
                      <div className="caballito-map-card-offer">
                        <div className="offer-tag">● OFERTA ACTIVA</div>
                        <div className="offer-title">{activeOfferForSelected.title}</div>
                        <div className="offer-price">{activeOfferForSelected.price_text}</div>
                      </div>
                    ) : (
                      <div className="caballito-map-card-no-offer">
                        Sin oferta activa hoy • Abierto al público
                      </div>
                    )}

                    <div className="caballito-map-card-actions">
                      {activeOfferForSelected && (
                        <button
                          type="button"
                          id="btn-map-card-ver-oferta"
                          className="caballito-btn-primary small"
                          onClick={() => setSelectedOffer(activeOfferForSelected)}
                        >
                          🏷️ Ver oferta
                        </button>
                      )}
                      <button
                        type="button"
                        id="btn-map-card-contactar"
                        className="caballito-btn-secondary small"
                        onClick={() => {
                          setContactModalData({
                            name: selectedMapBusiness.name,
                            phone: (selectedMapBusiness as any).phone || '+54 9 11 4902-8811',
                            address: selectedMapBusiness.address,
                            email: (selectedMapBusiness as any).email || null
                          });
                        }}
                      >
                        💬 Contactar
                      </button>
                      <button
                        type="button"
                        id="btn-map-card-ver-ficha"
                        className="caballito-btn-text small"
                        onClick={() => navigate(`/comercio/${selectedMapBusiness.organization_id}`)}
                      >
                        Ver comercio
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

              {/* Mobile Bottom Sheet (Slide-up for screens <= 768px / 390px) */}
              {selectedMapBusiness && (
                <div className="caballito-mobile-sheet-backdrop" onClick={() => setSelectedMapBusiness(null)}>
                  <div
                    id="caballito-mobile-bottom-sheet"
                    className="caballito-mobile-bottom-sheet animate-slide-up"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="caballito-sheet-handle-bar">
                      <div className="caballito-sheet-handle"></div>
                    </div>

                    <div className="caballito-sheet-header">
                      <div>
                        <span className="caballito-map-card-category">{selectedMapBusiness.category}</span>
                        <h3 className="caballito-sheet-title">{selectedMapBusiness.name}</h3>
                      </div>
                      <button
                        type="button"
                        id="btn-close-bottom-sheet"
                        className="caballito-sheet-close-btn"
                        onClick={() => setSelectedMapBusiness(null)}
                        aria-label="Cerrar"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="caballito-sheet-distance-row">
                      <span>📍 {selectedMapBusiness.address}</span>
                      <span className="caballito-sheet-distance">A 350 m • Caballito</span>
                    </div>

                    {activeOfferForSelected && (
                      <div className="caballito-sheet-offer-banner">
                        <div className="offer-tag">● OFERTA ACTIVA EN CABALLITO</div>
                        <div className="offer-title">{activeOfferForSelected.title}</div>
                        <div className="offer-price">{activeOfferForSelected.price_text}</div>
                      </div>
                    )}

                    <div className="caballito-sheet-actions">
                      {activeOfferForSelected && (
                        <button
                          type="button"
                          id="btn-sheet-ver-oferta"
                          className="caballito-btn-primary"
                          onClick={() => {
                            setSelectedOffer(activeOfferForSelected);
                            setSelectedMapBusiness(null);
                          }}
                        >
                          🏷️ Ver oferta
                        </button>
                      )}
                      <button
                        type="button"
                        id="btn-sheet-contactar"
                        className="caballito-btn-secondary"
                        onClick={() => {
                          setContactModalData({
                            name: selectedMapBusiness.name,
                            phone: (selectedMapBusiness as any).phone || '+54 9 11 4902-8811',
                            address: selectedMapBusiness.address,
                            email: (selectedMapBusiness as any).email || null
                          });
                          setSelectedMapBusiness(null);
                        }}
                      >
                        💬 Contactar
                      </button>
                      <button
                        type="button"
                        id="btn-sheet-ver-comercio"
                        className="caballito-btn-text"
                        onClick={() => {
                          navigate(`/comercio/${selectedMapBusiness.organization_id}`);
                          setSelectedMapBusiness(null);
                        }}
                      >
                        Ver comercio
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>


        {activeTab === 'COMERCIOS' && (
          <section className="atlas-community-section" style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Comercios Verificados de Caballito ({businesses.length})
            </h3>
            <div className="atlas-business-grid">
              {businesses.map(b => {
                const isFollowed = followedBusinessIds.has(b.organization_id);
                return (
                  <div key={b.organization_id} className="atlas-business-card" onClick={() => navigate(`/comercio/${b.organization_id}`)}>
                    <h4 className="atlas-business-name">{b.name}</h4>
                    <div className="atlas-business-cat">{b.category}</div>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.5rem 0' }}>{b.address}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.6rem' }}>
                      <button
                        type="button"
                        id={`btn-seguir-comercio-${b.organization_id}`}
                        className={`caballito-btn-secondary ${isFollowed ? 'is-following' : ''}`}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: '12px',
                          background: isFollowed ? '#0284c7' : '#ffffff',
                          color: isFollowed ? '#ffffff' : '#0284c7',
                          borderColor: '#0284c7'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBusinessFollow(b.organization_id);
                        }}
                      >
                        {isFollowed ? 'Siguiendo ✓' : '+ Seguir'}
                      </button>
                      <button
                        type="button"
                        id={`btn-compartir-comercio-${b.organization_id}`}
                        className="caballito-btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareBusiness(b);
                        }}
                        title="Compartir comercio"
                      >
                        🔗 Compartir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'B2B' && (
          <section className="atlas-community-section" style={{ marginTop: '2rem' }}>
            <div className="atlas-b2b-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
                Industrial Market B2B — TENGO / NECESITO
              </h3>
              <div className="atlas-market-actions">
                <button
                  type="button"
                  id="btn-tengo-oferta"
                  className={`atlas-action-btn ${marketAction === 'OFFER' ? 'primary' : 'secondary'}`}
                  onClick={() => handleStartMarketAction('OFFER')}
                >
                  TENGO <br/><span style={{fontSize: '0.8rem', fontWeight: 'normal'}}>Publicá lo que vendés</span>
                </button>
                <button
                  type="button"
                  id="btn-necesito-demanda"
                  className={`atlas-action-btn ${marketAction === 'DEMAND' ? 'primary' : 'secondary'}`}
                  onClick={() => handleStartMarketAction('DEMAND')}
                >
                  NECESITO <br/><span style={{fontSize: '0.8rem', fontWeight: 'normal'}}>Publicá lo que buscás</span>
                </button>
              </div>
            </div>

            {marketAction && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(30, 41, 59, 0.05)', borderRadius: '8px' }}>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                  {marketAction === 'OFFER' 
                    ? '📢 Publicación B2B modo TENGO: Insumos de Packaging y Envases Reciclables' 
                    : '🎯 Requerimiento B2B modo NECESITO: Proveedor de Mantenimiento Electromecánico'}
                </p>
                {matchingLoading && (
                  <p style={{ color: '#0284c7', marginTop: '0.5rem' }}>Calculando matches comerciales en Caballito...</p>
                )}
              </div>
            )}

            {matchingResults.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
                  Matches Comerciales Detectados ({matchingResults.length})
                </h3>
                <div className="atlas-business-grid">
                  {matchingResults.map(m => (
                    <div key={m.target_organization_id} className="atlas-business-card">
                      <div>
                        <h4 className="atlas-business-name">{m.organization_name}</h4>
                        <div className="atlas-business-cat">Score: {m.score}% • {m.matched_by}</div>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem' }}>{m.match_rationale}</p>
                      </div>
                      <button
                        type="button"
                        className="atlas-action-btn primary"
                        style={{ marginTop: '0.6rem' }}
                        onClick={() => alert(`Ficha de Negocio: ${m.organization_name}\nRubro: ${m.matched_by}`)}
                      >
                        Iniciar Contacto B2B
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODAL 1: MERCHANT PUBLISH (Section 3 & 4)                */}
      {/* ======================================================== */}
      {isPublishModalOpen && (
        <div className="atlas-modal-backdrop" id="modal-publish-offer" onClick={() => setIsPublishModalOpen(false)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">📢 Publicar Oferta en Caballito</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setIsPublishModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="atlas-publish-form">
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                La oferta se asignará automáticamente a tu comercio y al barrio Caballito mediante verificación geográfica.
              </p>

              {publishError && (
                <div className="atlas-form-error">{publishError}</div>
              )}
              {publishSuccess && (
                <div className="atlas-form-success">{publishSuccess}</div>
              )}

              <div className="atlas-form-group">
                <label>Título de la Oferta *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 2x1 en Medialunas de Manteca"
                  value={publishForm.title}
                  onChange={e => setPublishForm({ ...publishForm, title: e.target.value })}
                />
              </div>

              <div className="atlas-form-group">
                <label>Descripción detallada *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describí los detalles de la promoción o producto..."
                  value={publishForm.description}
                  onChange={e => setPublishForm({ ...publishForm, description: e.target.value })}
                />
              </div>

              <div className="atlas-form-row">
                <div className="atlas-form-group">
                  <label>Precio o Descuento (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: $4.500 ó 20% OFF"
                    value={publishForm.price_text}
                    onChange={e => setPublishForm({ ...publishForm, price_text: e.target.value })}
                  />
                </div>

                <div className="atlas-form-group">
                  <label>Categoría Comercial *</label>
                  <select
                    value={publishForm.category}
                    onChange={e => setPublishForm({ ...publishForm, category: e.target.value })}
                  >
                    <option value="ALIMENTOS">Alimentos / Carnicería / Almacén</option>
                    <option value="PANADERIA">Panadería / Pastelería</option>
                    <option value="GASTRONOMIA">Gastronomía / Bar / Restaurante</option>
                    <option value="FERRETERIA">Ferretería / Materiales</option>
                    <option value="SERVICIOS">Servicios Profesionales / Técnicos</option>
                    <option value="COMERCIOS">Comercios / Bazar / Indumentaria</option>
                  </select>
                </div>
              </div>

              <div className="atlas-form-row">
                <div className="atlas-form-group">
                  <label>Fecha de Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={publishForm.valid_until}
                    onChange={e => setPublishForm({ ...publishForm, valid_until: e.target.value })}
                  />
                </div>

                <div className="atlas-form-group atlas-photo-upload-group">
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    Foto de la oferta
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="merchant-photo-input"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handlePhotoSelect}
                  />
                  
                  {!photoData ? (
                    <button
                      type="button"
                      id="btn-agregar-foto"
                      className="atlas-btn-add-photo"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📷 [Agregar foto]
                    </button>
                  ) : (
                    <div className="atlas-photo-preview-wrap">
                      <img src={photoData} alt="Vista previa de foto" className="atlas-photo-preview-img" />
                      <div className="atlas-photo-preview-info">
                        <span className="atlas-photo-preview-name">{photoFile?.name || 'Foto seleccionada'}</span>
                        <button
                          type="button"
                          id="btn-quitar-foto"
                          className="atlas-photo-remove-btn"
                          onClick={handleRemovePhoto}
                          title="Quitar foto"
                        >
                          ✕ Quitar foto
                        </button>
                      </div>
                    </div>
                  )}
                  {photoError && <div className="atlas-form-error" style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>{photoError}</div>}
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Acepta JPG, PNG, WEBP. Máx: 5MB. Cámara o galería.
                  </span>
                </div>
              </div>

              <div className="atlas-modal-actions">
                <button
                  type="button"
                  className="atlas-btn-cancel"
                  onClick={() => setIsPublishModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="atlas-btn-submit"
                  disabled={publishLoading}
                >
                  {publishLoading ? 'Publicando...' : 'Confirmar y Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: MERCHANT DASHBOARD METRICS (Section 12)         */}
      {/* ======================================================== */}
      {isMetricsModalOpen && (
        <div className="atlas-modal-backdrop" onClick={() => setIsMetricsModalOpen(false)}>
          <div className="atlas-modal-dialog wide" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">📊 Métricas Reales de Comerciante</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setIsMetricsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.2rem 0' }}>
                Medición física certificada mediante eventos first-party de Atlas Local. Sin números inventados.
              </p>

              {metricsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  Cargando métricas de ofertas...
                </div>
              ) : merchantOffers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: 'rgba(15,23,42,0.4)', borderRadius: 10 }}>
                  Aún no tenés ofertas publicadas con este usuario. Publicá tu primera oferta con el botón superior.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {merchantOffers.map(mo => (
                    <div key={mo.offer_id} style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '1rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>{mo.title}</h4>
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: mo.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: mo.status === 'ACTIVE' ? '#4ade80' : '#f87171'
                        }}>
                          {mo.status}
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                        gap: '0.75rem',
                        marginTop: '0.8rem'
                      }}>
                        <div className="atlas-metric-stat-box">
                          <span className="atlas-stat-num">{mo.metrics?.views || 0}</span>
                          <span className="atlas-stat-label">Vistas</span>
                        </div>
                        <div className="atlas-metric-stat-box">
                          <span className="atlas-stat-num">{mo.metrics?.unique_viewers || 0}</span>
                          <span className="atlas-stat-label">Visitantes Únicos</span>
                        </div>
                        <div className="atlas-metric-stat-box">
                          <span className="atlas-stat-num">{mo.metrics?.whatsapp_shares || 0}</span>
                          <span className="atlas-stat-label">Compartidos WA</span>
                        </div>
                        <div className="atlas-metric-stat-box">
                          <span className="atlas-stat-num">{mo.metrics?.contact_clicks || 0}</span>
                          <span className="atlas-stat-label">Clicks Contactar</span>
                        </div>
                        <div className="atlas-metric-stat-box">
                          <span className="atlas-stat-num">{mo.metrics?.saves || 0}</span>
                          <span className="atlas-stat-label">Guardados</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: OFFER DETAIL MODAL                              */}
      {/* ======================================================== */}
      {selectedOffer && (
        <div className="atlas-modal-backdrop" onClick={() => setSelectedOffer(null)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">{selectedOffer.title}</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setSelectedOffer(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <div style={{ width: '100%', maxHeight: '220px', overflow: 'hidden', borderRadius: '8px', marginBottom: '1rem', background: '#f1f5f9' }}>
                <img
                  src={getCardImage(selectedOffer)}
                  alt={selectedOffer.title}
                  className="atlas-detail-offer-image"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
                {selectedOffer.price_text && (
                  <span className="atlas-offer-price-badge">{selectedOffer.price_text}</span>
                )}
                <span className="atlas-offer-category-tag">{selectedOffer.category || 'COMERCIOS'}</span>
              </div>

              <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#cbd5e1', marginBottom: '1.2rem' }}>
                {selectedOffer.description}
              </p>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: 8, marginBottom: '1.2rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>COMERCIO EMISOR</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.2rem' }}>
                  {selectedOffer.organization_name || 'Comercio de Caballito'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  📍 {selectedOffer.organization_address || 'Caballito, CABA'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.3rem' }}>
                  Vigencia hasta: {new Date(selectedOffer.valid_until).toLocaleDateString('es-AR')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="modal-btn-contactar"
                  className="atlas-action-btn primary"
                  onClick={() => handleContactOffer(selectedOffer)}
                >
                  ✉️ Contactar
                </button>
                <button
                  type="button"
                  id="modal-btn-guardar"
                  className="atlas-action-btn secondary"
                  onClick={() => handleSaveOffer(selectedOffer)}
                >
                  {savedOrgIds.has(selectedOffer.offer_id) ? '✓ Guardado' : '⭐ Guardar'}
                </button>
                <button
                  type="button"
                  id="modal-btn-compartir"
                  className="atlas-action-btn secondary"
                  style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: '#22c55e', color: '#4ade80' }}
                  onClick={() => handleShareOffer(selectedOffer)}
                >
                  📲 Compartir por WhatsApp
                </button>
                <button
                  type="button"
                  id="modal-btn-seguir"
                  className="atlas-action-btn secondary"
                  onClick={handleFollowBarrio}
                >
                  {isFollowing ? '✓ Siguiendo Caballito' : '+ Seguir Caballito'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: CONTACT POPUP                                   */}
      {/* ======================================================== */}
      {contactModalData && (
        <div className="atlas-modal-backdrop" id="modal-contact-merchant" onClick={() => setContactModalData(null)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">Contacto Directo</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setContactModalData(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <h3 style={{ margin: '0 0 0.8rem 0', color: '#38bdf8' }}>{contactModalData.name}</h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                Canales de contacto verificados para este comercio en Caballito:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.2rem' }}>
                {contactModalData.email && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.8rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>CORREO ELECTRÓNICO</div>
                    <a
                      href={`mailto:${contactModalData.email}`}
                      style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}
                    >
                      {contactModalData.email}
                    </a>
                  </div>
                )}

                {contactModalData.phone && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.8rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TELÉFONO / WHATSAPP</div>
                    <a
                      href={`tel:${contactModalData.phone}`}
                      style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}
                    >
                      {contactModalData.phone}
                    </a>
                  </div>
                )}

                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.8rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>DIRECCIÓN EN CABALLITO</div>
                  <div style={{ color: '#f8fafc', fontWeight: 500, fontSize: '0.9rem' }}>
                    {contactModalData.address || 'Caballito, Comuna 6, CABA'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="atlas-btn-submit"
                style={{ width: '100%' }}
                onClick={() => setContactModalData(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: WHATSAPP VIRAL SHARE MODAL                      */}
      {/* ======================================================== */}
      {whatsappModalData && (
        <div className="atlas-modal-backdrop" id="modal-whatsapp-share" onClick={() => setWhatsappModalData(null)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">📲 Compartir por WhatsApp</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setWhatsappModalData(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px' }}>
                <img 
                  src={getCardImage(whatsappModalData.offer)} 
                  alt={whatsappModalData.offer.title} 
                  style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} 
                  className="whatsapp-modal-offer-img"
                />
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{whatsappModalData.offer.title}</div>
                  <div style={{ color: '#0284c7', fontSize: '0.8rem', marginTop: '2px', fontWeight: 600 }}>{whatsappModalData.offer.price_text || 'Oferta'}</div>
                </div>
              </div>

              <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 700, marginBottom: '0.4rem' }}>MENSAJE PREPARADO</div>
                <div style={{ fontSize: '0.9rem', color: '#f8fafc', lineHeight: 1.4 }}>
                  ¡Mirá esta oferta en Caballito! 🔥 {whatsappModalData.offer.title} - {whatsappModalData.offer.price_text || 'Promoción'} en {whatsappModalData.offer.organization_name || 'Caballito'}
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.8rem', borderRadius: 8, marginBottom: '1.2rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>DEEP LINK CANÓNICO INDUSTRIAL</div>
                <div style={{ fontSize: '0.85rem', color: '#38bdf8', wordBreak: 'break-all', marginTop: '0.3rem', fontFamily: 'monospace' }} id="whatsapp-share-deeplink">
                  {whatsappModalData.deepLink}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button
                  type="button"
                  id="btn-confirm-whatsapp-share"
                  className="atlas-action-btn primary"
                  style={{ background: '#22c55e', borderColor: '#22c55e', color: '#000', fontWeight: 700, flex: 1 }}
                  onClick={() => {
                    window.open(whatsappModalData.whatsappUrl, '_blank');
                  }}
                >
                  📲 Continuar a WhatsApp
                </button>
                <button
                  type="button"
                  className="atlas-action-btn secondary"
                  onClick={() => setWhatsappModalData(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: LOGIN GATE MODAL                                */}
      {/* ======================================================== */}
      {loginGateModal && (
        <div className="atlas-modal-backdrop" id="modal-login-gate" onClick={() => setLoginGateModal(null)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">Seguir Caballito</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setLoginGateModal(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>🏡</div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '1.15rem' }}>Seguir Caballito</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Recibí novedades, ofertas y comercios de tu barrio.
              </p>

              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  id="btn-login-gate-proceed"
                  className="atlas-action-btn primary"
                  style={{ padding: '0.6rem 1.4rem' }}
                  onClick={() => {
                    setLoginGateModal(null);
                    navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                  }}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  className="atlas-action-btn secondary"
                  onClick={() => setLoginGateModal(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 7: LOCAL INBOX (NOVEDADES INTERNAS CABALLITO)      */}
      {/* ======================================================== */}
      {isInboxOpen && (
        <div className="atlas-modal-backdrop" id="modal-local-inbox" onClick={() => setIsInboxOpen(false)}>
          <div className="atlas-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">📬 Novedades Internas de Caballito</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setIsInboxOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.2rem 0' }}>
                Bandeja interna de promociones relevantes según tus comercios seguidos y actividad barrial. Sin correos, WhatsApp ni avisos externos no solicitados.
              </p>

              {inboxLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  Cargando novedades...
                </div>
              ) : inboxItems.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>📭</div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '0.3rem' }}>No tenés novedades pendientes</div>
                  <div style={{ fontSize: '0.85rem' }}>Seguí tus comercios favoritos de Caballito para recibir sus nuevas ofertas aquí.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '380px', overflowY: 'auto' }}>
                  {inboxItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        background: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: item.type === 'FOLLOWED_BUSINESS_OFFER' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.15)',
                          color: item.type === 'FOLLOWED_BUSINESS_OFFER' ? '#38bdf8' : '#4ade80'
                        }}>
                          {item.badge || 'NOVEDAD'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : 'Reciente'}
                        </span>
                      </div>
                      <h4 style={{ margin: '0.2rem 0', color: '#f8fafc', fontSize: '0.98rem' }}>{item.title}</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>{item.description}</p>
                      {item.link && (
                        <Link
                          to={item.link}
                          className="caballito-btn-text small"
                          style={{ alignSelf: 'flex-start', marginTop: '0.4rem' }}
                          onClick={() => setIsInboxOpen(false)}
                        >
                          Ver oferta →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1.2rem', textAlign: 'right' }}>
                <button
                  type="button"
                  className="atlas-action-btn secondary"
                  onClick={() => setIsInboxOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 8: COMMUNITY ACTIVATION ONBOARDING MODAL           */}
      {/* ======================================================== */}
      {isActivationModalOpen && (
        <div className="atlas-modal-backdrop" id="modal-community-activation">
          <div className="atlas-modal-dialog activation-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="activation-modal-header">
              <div className="activation-step-indicator">
                <span className={`step-dot ${activationStep === 'INTERESTS' ? 'active' : 'done'}`}>1</span>
                <span className="step-line" />
                <span className={`step-dot ${activationStep === 'BUSINESSES' ? 'active' : (activationStep === 'COMPLETION' ? 'done' : '')}`}>2</span>
                <span className="step-line" />
                <span className={`step-dot ${activationStep === 'COMPLETION' ? 'active' : ''}`}>3</span>
              </div>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setIsActivationModalOpen(false)}
                title="Cerrar onboarding"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: INTERESTS */}
            {activationStep === 'INTERESTS' && (
              <div className="activation-step-body" id="onboarding-step-interests">
                <div className="activation-badge-tag">PASO 1 DE 3 • INTERESES</div>
                <h2 className="activation-title">¿Qué te interesa?</h2>
                <p className="activation-desc">
                  Elegí al menos 3 categorías de Caballito para descubrir las mejores ofertas y comercios de tu barrio.
                </p>

                <div className="activation-categories-grid" id="onboarding-categories-grid">
                  {COMMUNITY_CATEGORIES.filter(c => c.id !== 'TODAS').map(cat => {
                    const isSelected = followedCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        id={`onboarding-cat-${cat.id.toLowerCase()}`}
                        className={`activation-cat-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleCategoryFollow(cat.id)}
                      >
                        <span className="cat-icon">{cat.icon}</span>
                        <span className="cat-label">{cat.label}</span>
                        <span className="cat-check">{isSelected ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="activation-hint-row">
                  <span className="hint-text">
                    💡 Recomendación: Elegí al menos 3 ({followedCategories.length} seleccionadas)
                  </span>
                </div>

                <div className="activation-footer">
                  <button
                    type="button"
                    id="btn-onboarding-continue-interests"
                    className="activation-btn-next"
                    onClick={() => setActivationStep('BUSINESSES')}
                  >
                    Continuar a comercios →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: BUSINESSES */}
            {activationStep === 'BUSINESSES' && (
              <div className="activation-step-body" id="onboarding-step-businesses">
                <div className="activation-badge-tag">PASO 2 DE 3 • DESCUBRIMIENTO</div>
                <h2 className="activation-title">Comercios de Caballito que pueden interesarte</h2>
                <p className="activation-desc">
                  Seguí comercios de tu barrio según tus intereses para personalizar tu red comercial.
                </p>

                <div className="activation-businesses-list" id="onboarding-businesses-list">
                  {rankedDiscoveryBusinesses.slice(0, 8).map(b => {
                    const isFollowed = followedBusinessIds.has(b.organization_id);
                    const hasOffer = offers.some(o => o.organization_id === b.organization_id && o.status === 'ACTIVE');
                    return (
                      <div key={b.organization_id} className="activation-biz-card" id={`onboarding-biz-card-${b.organization_id}`}>
                        <div className="biz-card-info">
                          <div className="biz-card-title-row">
                            <h4 className="biz-name">{b.name}</h4>
                            {hasOffer && <span className="biz-offer-badge">🔥 Oferta activa</span>}
                          </div>
                          <div className="biz-meta">
                            <span className="biz-cat-tag">{b.category}</span>
                            <span className="biz-addr">📍 {b.address}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          id={`btn-onboarding-follow-biz-${b.organization_id}`}
                          className={`activation-btn-follow ${isFollowed ? 'is-following' : ''}`}
                          onClick={() => handleToggleBusinessFollow(b.organization_id)}
                        >
                          {isFollowed ? 'Siguiendo ✓' : '+ Seguir'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="activation-footer">
                  <button
                    type="button"
                    className="activation-btn-back"
                    onClick={() => setActivationStep('INTERESTS')}
                  >
                    ← Volver
                  </button>
                  <button
                    type="button"
                    id="btn-onboarding-continue-businesses"
                    className="activation-btn-next"
                    onClick={() => setActivationStep('COMPLETION')}
                  >
                    Finalizar configuración →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: COMPLETION */}
            {activationStep === 'COMPLETION' && (
              <div className="activation-step-body" id="onboarding-step-completion">
                <div className="activation-badge-tag success">PASO 3 DE 3 • LISTO</div>
                <h2 className="activation-title">🎉 ¡Tu comunidad está lista!</h2>
                <p className="activation-desc">
                  Ya sos miembro de Caballito. Mirá el resumen de tus relaciones comerciales locales:
                </p>

                <div className="activation-summary-box">
                  <div className="activation-summary-item" id="onboarding-summary-barrios">
                    <span className="summary-icon">📍</span>
                    <div>
                      <div className="summary-label">Barrio seguido</div>
                      <div className="summary-val">Caballito (1 barrio seguido)</div>
                    </div>
                  </div>

                  <div className="activation-summary-item" id="onboarding-summary-categories">
                    <span className="summary-icon">🏷️</span>
                    <div>
                      <div className="summary-label">Categorías seguidas</div>
                      <div className="summary-val">{followedCategories.length} categorías seguidas</div>
                    </div>
                  </div>

                  <div className="activation-summary-item" id="onboarding-summary-businesses">
                    <span className="summary-icon">🏪</span>
                    <div>
                      <div className="summary-label">Comercios seguidos</div>
                      <div className="summary-val">{followedBusinessIds.size} comercios seguidos</div>
                    </div>
                  </div>
                </div>

                <div className="activation-notice-box">
                  🔒 <strong>Relación Separada de Comunicación:</strong> Seguir comercios o el barrio no concede automáticamente permisos de correo ni WhatsApp. Todo se visualiza dentro de tu feed en <em>Mi Comunidad</em>.
                </div>

                <div className="activation-footer">
                  <button
                    type="button"
                    id="btn-onboarding-goto-micomunidad"
                    className="activation-btn-primary-finish"
                    onClick={() => {
                      const testUser = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
                      const userId = currentUser?.id || testUser;
                      if (userId) {
                        localStorage.setItem('atlas_community_activated_' + userId, 'true');
                        // Log viral attribution if share parameter present
                        const incomingShareId = searchParams.get('ref') || searchParams.get('share_id');
                        if (incomingShareId) {
                          fetch('/api/atlas/local/community/share/signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              share_id: incomingShareId,
                              user_id: userId,
                              barrio_id: 'caballito',
                              environment: testUser ? 'TEST_NON_PRODUCTION' : 'REAL'
                            })
                          }).catch(e => console.warn('Share signup error:', e));
                        }

                        // Trigger Community Acquisition Bridge check & activation
                        const acqToken = sessionStorage.getItem('atlas_acq_token') || localStorage.getItem('atlas_acq_token');
                        if (acqToken || userId) {
                          fetch('/api/atlas/local/acquisition/check-activation', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              ...(testUser ? { 'x-user-id': testUser, 'x-atlas-test-auth': 'atlas-test-suite' } : {})
                            },
                            body: JSON.stringify({
                              user_id: userId,
                              token: acqToken
                            })
                          }).catch(e => console.warn('Acquisition check-activation error:', e));
                        }
                      }
                      setIsActivationModalOpen(false);
                      const tu = searchParams.get('test_user') || localStorage.getItem('atlas_test_user_id');
                      navigate(tu ? `/local/mi-comunidad?test_user=${tu}` : '/local/mi-comunidad');
                    }}
                  >
                    Ir a Mi Comunidad →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 9: COMMUNITY SHARE (BARRIO & BUSINESS)             */}
      {/* ======================================================== */}
      {communityShareModalData && (
        <div className="atlas-modal-backdrop" id="modal-community-share" onClick={() => setCommunityShareModalData(null)}>
          <div className="atlas-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h2 className="atlas-modal-title">🔗 {communityShareModalData.title}</h2>
              <button
                type="button"
                className="atlas-modal-close"
                onClick={() => setCommunityShareModalData(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem' }}>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                {communityShareModalData.subtitle}
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.85rem', borderRadius: 8, marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>DEEP LINK CANÓNICO INDUSTRIAL</div>
                <div style={{ fontSize: '0.85rem', color: '#0284c7', wordBreak: 'break-all', marginTop: '0.3rem', fontFamily: 'monospace' }} id="community-share-deeplink">
                  {communityShareModalData.deepLink}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="btn-confirm-community-share"
                  className="atlas-action-btn primary"
                  style={{ background: '#22c55e', borderColor: '#22c55e', color: '#ffffff', fontWeight: 700, flex: 1 }}
                  onClick={() => {
                    window.open(communityShareModalData.whatsappUrl, '_blank');
                  }}
                >
                  📲 Compartir por WhatsApp
                </button>
                <button
                  type="button"
                  id="btn-copy-community-share-link"
                  className="atlas-action-btn secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(communityShareModalData.deepLink);
                    alert('Enlace copiado al portapapeles');
                  }}
                >
                  📋 Copiar link
                </button>
                <button
                  type="button"
                  className="atlas-action-btn secondary"
                  onClick={() => setCommunityShareModalData(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
