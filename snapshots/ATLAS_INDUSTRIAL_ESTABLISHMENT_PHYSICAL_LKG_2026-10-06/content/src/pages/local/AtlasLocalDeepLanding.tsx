import React, { useEffect, useState, useId } from 'react';
import { useParams, useSearchParams, useLocation, Link, useNavigate } from 'react-router-dom';
import IndustrialGlobalHeader from '../../components/IndustrialGlobalHeader';
import { AtlasViralShareEngine, type ShareableContentType } from '../../lib/atlasLocal/viralShare';
import { getIndustrialUrl } from '../../../packages/config/products';
import { supabase } from '../../lib/supabase';
import { generateCouponQrMatrix } from '../../lib/atlasLocal/qrGenerator';
import './AtlasLocalCommerceV3.css';
import './AtlasLocalCaballito.css';

interface OfferDetail {
  offer_id: string;
  organization_id: string;
  neighborhood_id: string;
  title: string;
  description: string;
  price_text: string | null;
  valid_from: string;
  valid_until: string;
  status: string;
  category?: string;
  image_url?: string | null;
  offer_code?: string | null;
  organization_name?: string;
  organization_address?: string;
  organization_category?: string;
  contact_summary?: any;
  created_at?: string;
}

interface BusinessDetail {
  organization_id: string;
  name: string;
  category: string;
  industry: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  neighborhood_id: string;
  neighborhood_name: string;
  contact_summary?: any;
  products?: string[];
  is_verified_in_polygon: boolean;
  description?: string | null;
  opening_hours?: string | null;
  public_phone?: string | null;
  public_whatsapp?: string | null;
  public_website?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  is_claimed?: boolean;
  claimed_by_user_id?: string | null;
  verified_owner?: boolean;
  environment?: string;
}

export const AtlasLocalDeepLanding: React.FC = () => {
  const params = useParams<{
    barrioId?: string;
    contentType?: string;
    id?: string;
  }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Resolve target identifier & content type
  const targetId = params.id || '';
  const barrioId = params.barrioId || 'caballito';
  const isBusinessRoute = location.pathname.includes('/comercio') || params.contentType === 'comercio' || params.contentType === 'business';
  const isOfferRoute = !isBusinessRoute && (location.pathname.includes('/oferta') || params.contentType === 'oferta' || params.contentType === 'offer');

  const incomingRef = searchParams.get('ref') || searchParams.get('sid') || null;

  // Data state
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [businessOffers, setBusinessOffers] = useState<OfferDetail[]>([]);
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authority & Follow state
  const [isOwner, setIsOwner] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // User session
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modals state
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({
    claimant_name: '',
    claimant_email: '',
    claimant_phone: '',
    verification_method: 'EMAIL_DOMAIN',
    notes: ''
  });
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    description: '',
    opening_hours: '',
    public_phone: '',
    public_whatsapp: '',
    public_website: '',
    logo_url: '',
    cover_image_url: ''
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const [isCreateOfferModalOpen, setIsCreateOfferModalOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({
    title: '',
    description: '',
    price_text: '',
    category: 'COMERCIOS',
    valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    offer_code: ''
  });
  const [createOfferLoading, setCreateOfferLoading] = useState(false);
  const [createOfferMsg, setCreateOfferMsg] = useState<string | null>(null);

  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [metricsData, setMetricsData] = useState<any | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [isRedeemConfirmModalOpen, setIsRedeemConfirmModalOpen] = useState(false);
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemConfirmLoading, setRedeemConfirmLoading] = useState(false);
  const [redeemConfirmMsg, setRedeemConfirmMsg] = useState<string | null>(null);

  // User redemption popup state
  const [activeRedemption, setActiveRedemption] = useState<{
    redemption_code: string;
    status: string;
    offer_title: string;
  } | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Report Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Información incorrecta');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  // Contact Modal
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // More offers in retention loop
  const [moreOffers, setMoreOffers] = useState<OfferDetail[]>([]);

  // 1. Initial Auth Check
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setCurrentUserId(session.user.id);
      } else {
        // Check test user from localStorage if in test mode
        const testUid = localStorage.getItem('atlas_test_user_id');
        if (testUid) setCurrentUserId(testUid);
      }
    }
    checkAuth();
  }, []);

  // 2. Fetch Content Data
  const loadContent = async () => {
    if (!targetId) return;
    setIsLoading(true);
    setErrorMessage(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      if (isBusinessRoute) {
        const res = await fetch(`/api/atlas/local/caballito/comercio/${targetId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setBusiness(data.business);
          setBusinessOffers(data.offers || []);
          setIsOwner(Boolean(data.is_owner));
          setIsFollowing(Boolean(data.is_following));
          setFollowersCount(data.followers_count || 0);
          setClaimStatus(data.claim_status || null);

          // Populate edit form defaults
          setEditForm({
            description: data.business.description || '',
            opening_hours: data.business.opening_hours || '',
            public_phone: data.business.public_phone || '',
            public_whatsapp: data.business.public_whatsapp || '',
            public_website: data.business.public_website || '',
            logo_url: data.business.logo_url || '',
            cover_image_url: data.business.cover_image_url || ''
          });
        } else {
          setErrorMessage('No se encontró el comercio solicitado.');
        }
      } else {
        // Offer Route
        const res = await fetch(`/api/atlas/local/caballito/oferta/${targetId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setOffer(data.offer);
        } else {
          setErrorMessage('No se encontró la oferta solicitada o ha expirado.');
        }
      }
    } catch (e: any) {
      setErrorMessage('Error de conexión al cargar contenido.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [targetId, isBusinessRoute, currentUserId]);

  // Load more offers for bottom retention loop
  useEffect(() => {
    async function loadRetentionOffers() {
      try {
        const res = await fetch('/api/atlas/local/caballito/offers');
        if (res.ok) {
          const data = await res.json();
          const filtered = (data.offers || []).filter((o: any) => o.offer_id !== targetId).slice(0, 4);
          setMoreOffers(filtered);
        }
      } catch (e) {
        console.warn('Retention offers fetch failed:', e);
      }
    }
    loadRetentionOffers();
  }, [targetId]);

  // Track visit
  useEffect(() => {
    if (incomingRef) {
      fetch(`/api/atlas/local/share/${encodeURIComponent(incomingRef)}`).catch(() => {});
    }
    fetch('/api/atlas/local/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'CONTENT_VIEWED',
        share_id: incomingRef,
        barrio_id: barrioId,
        content_type: isBusinessRoute ? 'BUSINESS' : 'OFFER',
        content_id: targetId
      })
    }).catch(() => {});
  }, [incomingRef, barrioId, isBusinessRoute, targetId]);

  // Handle Follow Commerce
  const handleToggleFollow = async () => {
    if (!business) return;
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch(`/api/atlas/local/business/${business.organization_id}/follow`, {
        method: 'POST',
        headers
      });

      if (res.status === 401) {
        navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.is_following);
        setFollowersCount(data.followers_count);
      }
    } catch (e) {
      console.error('Follow toggle error:', e);
    }
  };

  // Handle Claim Business
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setClaimLoading(true);
    setClaimMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch(`/api/atlas/local/business/${business.organization_id}/claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify(claimForm)
      });

      if (res.status === 401) {
        setClaimMsg('Se requiere iniciar sesión para reclamar este comercio.');
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setClaimStatus('PENDING');
        setClaimMsg('✓ Reclamo registrado como PENDIENTE. Verificación en curso.');

        // If test isolated method is selected, allow instant verification flow
        if (claimForm.verification_method === 'TEST_ISOLATED') {
          const verifyRes = await fetch(`/api/atlas/local/business/${business.organization_id}/claim/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              verification_method: 'TEST_ISOLATED',
              evidence_data: { test_suite: true }
            })
          });
          if (verifyRes.ok) {
            setClaimStatus('VERIFIED');
            setIsOwner(true);
            setClaimMsg('✓ ¡Comercio verificado exitosamente mediante canal de test!');
            setTimeout(() => {
              setIsClaimModalOpen(false);
              loadContent();
            }, 1200);
          }
        }
      } else {
        setClaimMsg(data.message || 'Error al procesar reclamo.');
      }
    } catch (err: any) {
      setClaimMsg('Error de conexión al enviar reclamo.');
    } finally {
      setClaimLoading(false);
    }
  };

  // Handle Owner Edit Business
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setEditLoading(true);
    setEditMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch(`/api/atlas/local/business/${business.organization_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editForm)
      });

      const data = await res.json();
      if (res.ok) {
        setEditMsg('✓ Datos comerciales actualizados exitosamente.');
        setTimeout(() => {
          setIsEditModalOpen(false);
          loadContent();
        }, 800);
      } else {
        setEditMsg(data.message || 'Error al guardar cambios.');
      }
    } catch (err: any) {
      setEditMsg('Error de red al actualizar perfil comercial.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Owner Create Offer
  const handleCreateOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setCreateOfferLoading(true);
    setCreateOfferMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch('/api/atlas/local/caballito/offers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...offerForm,
          organization_id: business.organization_id,
          neighborhood_id: 'caballito'
        })
      });

      const data = await res.json();
      if (res.ok) {
        setCreateOfferMsg('✓ Oferta publicada exitosamente.');
        setTimeout(() => {
          setIsCreateOfferModalOpen(false);
          loadContent();
        }, 900);
      } else {
        setCreateOfferMsg(data.message || 'Error al publicar oferta.');
      }
    } catch (err: any) {
      setCreateOfferMsg('Error de red al crear la oferta.');
    } finally {
      setCreateOfferLoading(false);
    }
  };

  // Handle Fetch Metrics
  const handleOpenMetrics = async () => {
    if (!business) return;
    setIsMetricsModalOpen(true);
    setMetricsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch(`/api/atlas/local/business/${business.organization_id}/metrics`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMetricsData(data.metrics);
      }
    } catch (e) {
      console.error('Metrics fetch error:', e);
    } finally {
      setMetricsLoading(false);
    }
  };

  // Handle Owner Confirm Redemption
  const handleConfirmRedemptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemConfirmLoading(true);
    setRedeemConfirmMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch('/api/atlas/local/redemptions/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ redemption_code: redeemCodeInput.trim().toUpperCase() })
      });

      const data = await res.json();
      if (res.ok) {
        setRedeemConfirmMsg(`✓ ${data.message || 'Canje validado con éxito.'}`);
        setRedeemCodeInput('');
      } else {
        setRedeemConfirmMsg(data.message || 'No se pudo validar el canje.');
      }
    } catch (err: any) {
      setRedeemConfirmMsg('Error de conexión al validar canje.');
    } finally {
      setRedeemConfirmLoading(false);
    }
  };

  // Handle Neighbor [Usar oferta] -> Generate Redemption Code + QR
  const handleRedeemOffer = async (targetOffer: OfferDetail) => {
    setRedeemLoading(true);
    setRedeemError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    try {
      const res = await fetch(`/api/atlas/local/offers/${targetOffer.offer_id}/redeem`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_ref: currentUserId || 'session-visitor' })
      });

      const data = await res.json();
      if (res.ok) {
        setActiveRedemption({
          redemption_code: data.redemption.redemption_code,
          status: data.redemption.status,
          offer_title: targetOffer.title
        });
      } else {
        setRedeemError(data.message || 'No fue posible generar el cupón de la oferta.');
      }
    } catch (e: any) {
      setRedeemError('Error de conexión al reclamar el cupón.');
    } finally {
      setRedeemLoading(false);
    }
  };

  // Handle Share WhatsApp
  const handleViralShare = async () => {
    const isBiz = isBusinessRoute && business;
    const shareableType: ShareableContentType = isBiz ? 'BUSINESS' : 'OFFER';
    const contentId = isBiz ? business.organization_id : offer?.offer_id || '';
    const title = isBiz ? business.name : offer?.title || 'Contenido en Caballito';
    const summary = isBiz
      ? `${business.category} • ${business.address}`
      : `${offer?.organization_name || 'Comercio'} • ${offer?.price_text || 'Oferta Exclusiva'}`;

    const { whatsappUrl } = await AtlasViralShareEngine.createTrackedShare({
      content_type: shareableType,
      content_id: contentId,
      barrio_id: barrioId,
      organization_id: isBiz ? business.organization_id : offer?.organization_id,
      parent_share_id: incomingRef,
      title,
      summary,
      valid_until: offer?.valid_until
    });

    window.open(whatsappUrl, '_blank');
  };

  // Handle Submit Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    if (currentUserId) headers['x-user-id'] = currentUserId;

    const reportTargetId = isBusinessRoute ? business?.organization_id : offer?.offer_id;
    const reportTargetType = isBusinessRoute ? 'BUSINESS' : 'OFFER';

    try {
      await fetch('/api/atlas/local/report', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_type: reportTargetType,
          target_id: reportTargetId,
          reason: reportReason,
          description: reportDesc
        })
      });
      setReportSuccess(true);
      setTimeout(() => {
        setIsReportModalOpen(false);
        setReportSuccess(false);
        setReportDesc('');
      }, 1500);
    } catch (e) {
      console.error('Report submission error:', e);
    }
  };

  // Helper for Offer Expiration Check
  const isOfferExpired = (off: OfferDetail) => {
    return off.status === 'EXPIRED' || new Date(off.valid_until).getTime() < Date.now();
  };

  // Deterministic SVG QR renderer
  const renderQrSvg = (code: string) => {
    const matrix = generateCouponQrMatrix(code, 25);
    const size = matrix.length;
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) => (cell ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#0f172a" /> : null))
        )}
      </svg>
    );
  };

  return (
    <div className="v3-profile-wrapper">
      <IndustrialGlobalHeader />

      <main className="v3-profile-container">
        {/* Breadcrumb Navigation */}
        <nav className="v3-breadcrumb" aria-label="Navegación">
          <Link to="/buscaindustrial">Busca Industrial</Link>
          <span>/</span>
          <Link to={`/industrial/local/${barrioId}`}>Mercado Local ({barrioId.toUpperCase()})</Link>
          <span>/</span>
          {isBusinessRoute ? (
            <Link to={`/industrial/local/${barrioId}?tab=COMERCIOS`}>Comercios</Link>
          ) : (
            <Link to={`/industrial/local/${barrioId}?tab=COMUNIDAD`}>Ofertas</Link>
          )}
          <span>/</span>
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>
            {isBusinessRoute ? (business?.name || 'Comercio') : (offer?.title || 'Oferta')}
          </span>
        </nav>

        {/* Loading state */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.8rem' }}>🔄</div>
            <div>Cargando datos certificados de Atlas Local...</div>
          </div>
        )}

        {/* Error state */}
        {errorMessage && !isLoading && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '14px',
            padding: '2rem',
            textAlign: 'center',
            color: '#f87171'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#fca5a5' }}>Contenido no disponible</h3>
            <p style={{ margin: '0 0 1.5rem 0' }}>{errorMessage}</p>
            <Link to={`/industrial/local/${barrioId}`} className="v3-btn v3-btn-primary">
              ← Volver al mapa de Caballito
            </Link>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW A: BUSINESS PUBLIC PROFILE V3                      */}
        {/* ======================================================== */}
        {!isLoading && !errorMessage && isBusinessRoute && business && (
          <div>
            {/* Header Profile Card */}
            <div className="v3-header-card">
              {/* Cover Banner */}
              <div className="v3-cover-banner">
                {business.cover_image_url ? (
                  <img src={business.cover_image_url} alt={`Portada de ${business.name}`} className="v3-cover-img" />
                ) : (
                  <div style={{ width: '100%', height: '100%', opacity: 0.15, background: 'radial-gradient(circle, #38bdf8 10%, transparent 70%)' }} />
                )}
              </div>

              {/* Profile Body */}
              <div className="v3-header-body">
                <div className="v3-avatar-row">
                  <div className="v3-avatar-box">
                    {business.logo_url ? (
                      <img src={business.logo_url} alt={business.name} className="v3-avatar-img" />
                    ) : (
                      <span className="v3-avatar-placeholder">🏬</span>
                    )}
                  </div>

                  {/* Trust Badges */}
                  <div className="v3-badge-list">
                    {business.is_verified_in_polygon && (
                      <span className="v3-badge v3-badge-verified-comm" title="Ubicación verificada dentro del polígono de Comuna 6">
                        ✓ Comercio verificado
                      </span>
                    )}

                    {/* Trust Rule 13: Only VERIFIED owner badge if verified_owner is true */}
                    {business.verified_owner && business.is_claimed && (
                      <span className="v3-badge v3-badge-verified-owner" id="badge-propietario-verificado" title="Propietario comercial con identidad verificada">
                        ★ Propietario verificado
                      </span>
                    )}

                    {claimStatus === 'PENDING' && (
                      <span className="v3-badge v3-badge-pending-claim" title="Reclamo en proceso de verificación">
                        ⏳ Reclamo en revisión
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Metadata */}
                <div className="v3-title-section">
                  <h1 id="business-profile-title">{business.name}</h1>
                  <div className="v3-meta-sub">
                    <span>{business.category}</span>
                    <span>•</span>
                    <span>{business.industry}</span>
                  </div>
                  <div className="v3-address-sub">
                    <span>📍</span>
                    <span>{business.address}</span>
                  </div>
                </div>

                {/* Public Actions Toolbar */}
                <div className="v3-actions-toolbar">
                  <button
                    type="button"
                    id="btn-v3-contact"
                    className="v3-btn v3-btn-whatsapp"
                    onClick={() => setIsContactModalOpen(true)}
                  >
                    ✉️ Contactar
                  </button>

                  <button
                    type="button"
                    id="btn-v3-follow"
                    className={`v3-btn ${isFollowing ? 'v3-btn-following' : 'v3-btn-secondary'}`}
                    onClick={handleToggleFollow}
                  >
                    {isFollowing ? '✓ Siguiendo' : '+ Seguir comercio'} ({followersCount})
                  </button>

                  <button
                    type="button"
                    id="btn-v3-save"
                    className="v3-btn v3-btn-secondary"
                    onClick={() => setIsSaved(!isSaved)}
                  >
                    {isSaved ? '⭐ Guardado' : '☆ Guardar'}
                  </button>

                  <button
                    type="button"
                    id="btn-v3-share"
                    className="v3-btn v3-btn-secondary"
                    onClick={handleViralShare}
                  >
                    📲 Compartir
                  </button>

                  <Link
                    to={`/industrial/local/${barrioId}?tab=MAPA&selected=${business.organization_id}`}
                    id="btn-v3-view-map"
                    className="v3-btn v3-btn-secondary"
                  >
                    🗺️ Ver en mapa
                  </Link>

                  {/* Claim Button: Visible if unverified or visitor */}
                  {!business.verified_owner && !isOwner && claimStatus !== 'PENDING' && (
                    <button
                      type="button"
                      id="btn-v3-claim-business"
                      className="v3-btn v3-btn-claim"
                      onClick={() => setIsClaimModalOpen(true)}
                    >
                      🏛️ Este comercio es mío
                    </button>
                  )}

                  <button
                    type="button"
                    id="btn-v3-report"
                    className="v3-btn v3-btn-secondary"
                    style={{ marginLeft: 'auto', color: '#94a3b8' }}
                    onClick={() => setIsReportModalOpen(true)}
                  >
                    🚩 Reportar
                  </button>
                </div>
              </div>
            </div>

            {/* OWNER MANAGEMENT BAR (Certified Authority Only) */}
            {isOwner && (
              <div className="v3-owner-bar" id="owner-management-panel">
                <div className="v3-owner-title">
                  <span>👑</span>
                  <span>Panel de Propietario Verificado — {business.name}</span>
                </div>
                <div className="v3-owner-buttons">
                  <button
                    type="button"
                    id="btn-owner-edit"
                    className="v3-btn v3-btn-secondary"
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    ✏️ Editar comercio
                  </button>
                  <button
                    type="button"
                    id="btn-owner-create-offer"
                    className="v3-btn v3-btn-primary"
                    onClick={() => setIsCreateOfferModalOpen(true)}
                  >
                    📢 Publicar oferta
                  </button>
                  <button
                    type="button"
                    id="btn-owner-metrics"
                    className="v3-btn v3-btn-secondary"
                    onClick={handleOpenMetrics}
                  >
                    📊 Métricas
                  </button>
                  <button
                    type="button"
                    id="btn-owner-validate-redeem"
                    className="v3-btn v3-btn-secondary"
                    style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                    onClick={() => setIsRedeemConfirmModalOpen(true)}
                  >
                    🎟️ Validar canje
                  </button>
                </div>
              </div>
            )}

            {/* 2-Column Content Layout */}
            <div className="v3-grid-2col">
              {/* Left Column: Description & Active Offers */}
              <div>
                {/* Description */}
                <div className="v3-card">
                  <h2 className="v3-card-title">📖 Sobre el comercio</h2>
                  <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                    {business.description || 'Comercio radicado y activo en el barrio Caballito, con verificación geográfica en Comuna 6.'}
                  </p>
                </div>

                {/* Active Offers Section */}
                <div className="v3-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h2 className="v3-card-title" style={{ margin: 0 }}>
                      🏷️ Ofertas activas ({businessOffers.length})
                    </h2>
                    {isOwner && (
                      <button
                        type="button"
                        className="v3-btn v3-btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => setIsCreateOfferModalOpen(true)}
                      >
                        + Nueva oferta
                      </button>
                    )}
                  </div>

                  {businessOffers.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px' }}>
                      <p style={{ margin: '0 0 0.5rem 0' }}>Este comercio no tiene ofertas activas en este momento.</p>
                      {isOwner && (
                        <button
                          type="button"
                          className="v3-btn v3-btn-primary"
                          onClick={() => setIsCreateOfferModalOpen(true)}
                        >
                          Publicar la primera oferta
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="v3-offers-grid">
                      {businessOffers.map((off) => (
                        <div key={off.offer_id} className="v3-offer-card" id={`offer-card-${off.offer_id}`}>
                          <div className="v3-offer-card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <span className="v3-badge v3-badge-active">OFERTA VIGENTE</span>
                              {off.offer_code && (
                                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {off.offer_code}
                                </span>
                              )}
                            </div>
                            <h3 className="v3-offer-card-title">{off.title}</h3>
                            <p className="v3-offer-card-desc">{off.description}</p>
                            {off.price_text && (
                              <div className="v3-offer-card-price">{off.price_text}</div>
                            )}
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Vigencia hasta: {new Date(off.valid_until).toLocaleDateString('es-AR')}
                            </div>
                          </div>
                          <div className="v3-offer-card-footer">
                            <Link
                              to={`/industrial/local/${barrioId}/oferta/${off.offer_id}`}
                              className="v3-btn v3-btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            >
                              Ver detalle
                            </Link>
                            <button
                              type="button"
                              className="v3-btn v3-btn-primary"
                              style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                              onClick={() => handleRedeemOffer(off)}
                              disabled={redeemLoading}
                            >
                              🎟️ Usar oferta
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Products & Services */}
                {business.products && business.products.length > 0 && (
                  <div className="v3-card">
                    <h2 className="v3-card-title">📦 Productos y servicios disponibles</h2>
                    <div className="v3-pills-list">
                      {business.products.map((p, idx) => (
                        <span key={idx} className="v3-pill">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Commercial Info, Hours & Map */}
              <div>
                {/* Commercial Contact & Hours Card */}
                <div className="v3-card">
                  <h2 className="v3-card-title">ℹ️ Información Comercial</h2>

                  <div className="v3-info-row">
                    <span className="v3-info-icon">🕒</span>
                    <div>
                      <div className="v3-info-label">Horarios de atención</div>
                      <div className="v3-info-value" id="val-opening-hours">
                        {business.opening_hours || 'Lunes a Viernes: 09:00 a 19:00 | Sábados: 09:00 a 13:00'}
                      </div>
                    </div>
                  </div>

                  <div className="v3-info-row">
                    <span className="v3-info-icon">📞</span>
                    <div>
                      <div className="v3-info-label">Teléfono comercial</div>
                      <div className="v3-info-value" id="val-public-phone">
                        {business.public_phone ? (
                          <a href={`tel:${business.public_phone}`}>{business.public_phone}</a>
                        ) : (
                          'No especificado'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="v3-info-row">
                    <span className="v3-info-icon">💬</span>
                    <div>
                      <div className="v3-info-label">WhatsApp de atención</div>
                      <div className="v3-info-value" id="val-public-whatsapp">
                        {business.public_whatsapp ? (
                          <a href={`https://wa.me/${business.public_whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer">
                            {business.public_whatsapp}
                          </a>
                        ) : (
                          'No especificado'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="v3-info-row">
                    <span className="v3-info-icon">🌐</span>
                    <div>
                      <div className="v3-info-label">Sitio web</div>
                      <div className="v3-info-value" id="val-public-website">
                        {business.public_website ? (
                          <a href={business.public_website} target="_blank" rel="noopener noreferrer">
                            {business.public_website}
                          </a>
                        ) : (
                          'No especificado'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="v3-info-row">
                    <span className="v3-info-icon">📍</span>
                    <div>
                      <div className="v3-info-label">Dirección en Caballito</div>
                      <div className="v3-info-value">{business.address}</div>
                    </div>
                  </div>
                </div>

                {/* Map Link Card */}
                <div className="v3-card" style={{ textAlign: 'center' }}>
                  <h2 className="v3-card-title" style={{ justifyContent: 'center' }}>🗺️ Ubicación en Caballito</h2>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                    Visualizá este comercio directamente en el mapa cartográfico oficial de Caballito.
                  </p>
                  <Link
                    to={`/industrial/local/${barrioId}?tab=MAPA&selected=${business.organization_id}`}
                    className="v3-btn v3-btn-primary"
                    style={{ width: '100%' }}
                  >
                    Abrir en el Mapa
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW B: OFFER DETAIL V3                                  */}
        {/* ======================================================== */}
        {!isLoading && !errorMessage && isOfferRoute && offer && (
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <div className="v3-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <span className="v3-badge v3-badge-verified-comm">
                  🏷️ OFERTA EN CABALLITO
                </span>

                {isOfferExpired(offer) ? (
                  <span className="v3-badge v3-badge-expired" id="badge-oferta-vencida">
                    ⛔ OFERTA VENCIDA
                  </span>
                ) : (
                  <span className="v3-badge v3-badge-active" id="badge-oferta-vigente">
                    ✓ VIGENTE HASTA {new Date(offer.valid_until).toLocaleDateString('es-AR')}
                  </span>
                )}
              </div>

              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 0.5rem 0', lineHeight: 1.2 }}>
                {offer.title}
              </h1>

              {offer.price_text && (
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80', marginBottom: '1.2rem' }}>
                  {offer.price_text}
                </div>
              )}

              {offer.image_url && (
                <div style={{ width: '100%', maxHeight: '280px', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.2rem', background: '#0f172a' }}>
                  <img src={offer.image_url} alt={offer.title} style={{ width: '100%', maxHeight: '280px', objectFit: 'cover' }} />
                </div>
              )}

              <p style={{ fontSize: '1.05rem', lineHeight: '1.6', color: '#cbd5e1', marginBottom: '1.5rem' }}>
                {offer.description}
              </p>

              {/* Issuer Box */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1.8rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Comercio Emisor
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.2rem' }}>
                    {offer.organization_name || 'Comercio Local'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                    📍 {offer.organization_address || 'Caballito, Comuna 6'}
                  </div>
                </div>

                <Link
                  to={`/comercio/${offer.organization_id}`}
                  className="v3-btn v3-btn-secondary"
                  id="btn-goto-business-profile"
                >
                  🏬 Ver perfil del comercio
                </Link>
              </div>

              {/* Expiration check & Redemption Action */}
              {isOfferExpired(offer) ? (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  padding: '1rem',
                  color: '#f87171',
                  marginBottom: '1.5rem'
                }}>
                  ⚠️ Esta oferta ha vencido. Por normativa comercial no se permite la generación de nuevos canjes.
                </div>
              ) : (
                <div style={{ marginBottom: '1.5rem' }}>
                  <button
                    type="button"
                    id="btn-usar-oferta-main"
                    className="v3-btn v3-btn-primary"
                    style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem', fontWeight: 700 }}
                    onClick={() => handleRedeemOffer(offer)}
                    disabled={redeemLoading}
                  >
                    {redeemLoading ? 'Generando cupón...' : '🎟️ Usar oferta / Generar código'}
                  </button>
                  {redeemError && (
                    <div style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                      {redeemError}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="v3-actions-toolbar" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  className="v3-btn v3-btn-whatsapp"
                  onClick={handleViralShare}
                >
                  📲 Compartir por WhatsApp
                </button>
                <button
                  type="button"
                  className="v3-btn v3-btn-secondary"
                  onClick={() => setIsSaved(!isSaved)}
                >
                  {isSaved ? '⭐ Guardado' : '☆ Guardar'}
                </button>
                <button
                  type="button"
                  className="v3-btn v3-btn-secondary"
                  style={{ marginLeft: 'auto', color: '#94a3b8' }}
                  onClick={() => setIsReportModalOpen(true)}
                >
                  🚩 Reportar oferta
                </button>
              </div>
            </div>

            {/* Retention Strip: Más ofertas de Caballito */}
            <div className="v3-card" style={{ marginTop: '2rem' }}>
              <h2 className="v3-card-title">Más ofertas en Caballito</h2>
              <div className="v3-offers-grid">
                {moreOffers.map((mo) => (
                  <div key={mo.offer_id} className="v3-offer-card">
                    <div className="v3-offer-card-body">
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                        {mo.organization_name || 'Comercio de Caballito'}
                      </div>
                      <h4 style={{ margin: '0.3rem 0', color: '#ffffff', fontSize: '1rem' }}>{mo.title}</h4>
                      {mo.price_text && (
                        <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1rem' }}>{mo.price_text}</div>
                      )}
                    </div>
                    <div className="v3-offer-card-footer">
                      <Link
                        to={`/industrial/local/${barrioId}/oferta/${mo.offer_id}`}
                        className="v3-btn v3-btn-secondary"
                        style={{ width: '100%', textAlign: 'center', fontSize: '0.8rem' }}
                      >
                        Ver Oferta
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 1: CLAIM BUSINESS & VERIFICATION                  */}
        {/* ======================================================== */}
        {isClaimModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsClaimModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">🏛️ Reclamar comercio: {business.name}</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsClaimModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.2rem 0' }}>
                  Para proteger a la comunidad, los permisos de administración solo se otorgan tras verificar fehacientemente la titularidad.
                </p>

                {claimMsg && (
                  <div style={{
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    background: claimMsg.startsWith('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: claimMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                    fontSize: '0.88rem'
                  }}>
                    {claimMsg}
                  </div>
                )}

                <form onSubmit={handleClaimSubmit}>
                  <div className="v3-form-group">
                    <label className="v3-form-label">Nombre y Apellido del Titular *</label>
                    <input
                      type="text"
                      className="v3-input"
                      required
                      placeholder="Ej. Roberto Martínez"
                      value={claimForm.claimant_name}
                      onChange={(e) => setClaimForm({ ...claimForm, claimant_name: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Email de Contacto Comercial *</label>
                    <input
                      type="email"
                      className="v3-input"
                      required
                      placeholder="titular@comercio.com"
                      value={claimForm.claimant_email}
                      onChange={(e) => setClaimForm({ ...claimForm, claimant_email: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Teléfono Comercial *</label>
                    <input
                      type="tel"
                      className="v3-input"
                      required
                      placeholder="+54 11 4900-0000"
                      value={claimForm.claimant_phone}
                      onChange={(e) => setClaimForm({ ...claimForm, claimant_phone: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Método de Verificación</label>
                    <select
                      className="v3-select"
                      value={claimForm.verification_method}
                      onChange={(e) => setClaimForm({ ...claimForm, verification_method: e.target.value })}
                    >
                      <option value="EMAIL_DOMAIN">Dominio de Email Corporativo (@comercio.com)</option>
                      <option value="COMMERCIAL_PHONE">Línea Telefónica Comercial Oficial</option>
                      <option value="MANUAL_ADMIN_REVIEW">Revisión Manual con Constancia AFIP/ARBA</option>
                      <option value="TEST_ISOLATED">TEST AISLADO (Activación instantánea para suite E2E)</option>
                    </select>
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Notas adicionales de evidencia</label>
                    <textarea
                      className="v3-textarea"
                      placeholder="Información que acredite tu vínculo comercial con este local."
                      value={claimForm.notes}
                      onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsClaimModalOpen(false)}>
                      Cancelar
                    </button>
                    <button type="submit" id="btn-submit-claim" className="v3-btn v3-btn-primary" disabled={claimLoading}>
                      {claimLoading ? 'Enviando...' : 'Enviar Reclamo'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 2: OWNER EDIT BUSINESS PROFILE                    */}
        {/* ======================================================== */}
        {isEditModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsEditModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">✏️ Editar Datos Comerciales: {business.name}</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsEditModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                {editMsg && (
                  <div style={{
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    background: editMsg.startsWith('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: editMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                    fontSize: '0.88rem'
                  }}>
                    {editMsg}
                  </div>
                )}

                <form onSubmit={handleEditSubmit}>
                  <div className="v3-form-group">
                    <label className="v3-form-label">Descripción Comercial</label>
                    <textarea
                      id="input-edit-description"
                      className="v3-textarea"
                      rows={3}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="Contale a los vecinos de Caballito qué ofrecés..."
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Horarios de Atención</label>
                    <input
                      type="text"
                      id="input-edit-hours"
                      className="v3-input"
                      value={editForm.opening_hours}
                      onChange={(e) => setEditForm({ ...editForm, opening_hours: e.target.value })}
                      placeholder="Lun a Vie: 09:00 a 19:00 | Sáb: 09:00 a 13:00"
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Teléfono Público</label>
                    <input
                      type="text"
                      id="input-edit-phone"
                      className="v3-input"
                      value={editForm.public_phone}
                      onChange={(e) => setEditForm({ ...editForm, public_phone: e.target.value })}
                      placeholder="+54 11 4900-0000"
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">WhatsApp Público</label>
                    <input
                      type="text"
                      id="input-edit-whatsapp"
                      className="v3-input"
                      value={editForm.public_whatsapp}
                      onChange={(e) => setEditForm({ ...editForm, public_whatsapp: e.target.value })}
                      placeholder="+54 9 11 4900-0000"
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Sitio Web / Enlace</label>
                    <input
                      type="url"
                      id="input-edit-website"
                      className="v3-input"
                      value={editForm.public_website}
                      onChange={(e) => setEditForm({ ...editForm, public_website: e.target.value })}
                      placeholder="https://comercio.com"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsEditModalOpen(false)}>
                      Cancelar
                    </button>
                    <button type="submit" id="btn-submit-edit" className="v3-btn v3-btn-primary" disabled={editLoading}>
                      {editLoading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 3: OWNER CREATE OFFER WITH CODE                   */}
        {/* ======================================================== */}
        {isCreateOfferModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsCreateOfferModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">📢 Publicar Nueva Oferta: {business.name}</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsCreateOfferModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                {createOfferMsg && (
                  <div style={{
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    background: createOfferMsg.startsWith('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: createOfferMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                    fontSize: '0.88rem'
                  }}>
                    {createOfferMsg}
                  </div>
                )}

                <form onSubmit={handleCreateOfferSubmit}>
                  <div className="v3-form-group">
                    <label className="v3-form-label">Título de la Oferta *</label>
                    <input
                      type="text"
                      id="input-create-offer-title"
                      className="v3-input"
                      required
                      placeholder="Ej. 25% Off en compras mayores a $10.000"
                      value={offerForm.title}
                      onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Descripción del beneficio *</label>
                    <textarea
                      id="input-create-offer-desc"
                      className="v3-textarea"
                      required
                      placeholder="Detallá las condiciones de la promoción..."
                      value={offerForm.description}
                      onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Texto de Precio o Descuento (opcional)</label>
                    <input
                      type="text"
                      id="input-create-offer-price"
                      className="v3-input"
                      placeholder="Ej. 25% OFF o $4.500"
                      value={offerForm.price_text}
                      onChange={(e) => setOfferForm({ ...offerForm, price_text: e.target.value })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Código de Canje Sugerido (opcional)</label>
                    <input
                      type="text"
                      id="input-create-offer-code"
                      className="v3-input"
                      placeholder="Ej. CAB-VERANO (se generará uno si se deja vacío)"
                      value={offerForm.offer_code}
                      onChange={(e) => setOfferForm({ ...offerForm, offer_code: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="v3-form-group">
                    <label className="v3-form-label">Válido hasta *</label>
                    <input
                      type="date"
                      id="input-create-offer-date"
                      className="v3-input"
                      required
                      value={offerForm.valid_until}
                      onChange={(e) => setOfferForm({ ...offerForm, valid_until: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsCreateOfferModalOpen(false)}>
                      Cancelar
                    </button>
                    <button type="submit" id="btn-submit-offer" className="v3-btn v3-btn-primary" disabled={createOfferLoading}>
                      {createOfferLoading ? 'Publicando...' : 'Publicar Oferta'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 4: OWNER METRICS MODAL                            */}
        {/* ======================================================== */}
        {isMetricsModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsMetricsModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">📊 Métricas Físicas: {business.name}</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsMetricsModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1.2rem 0' }}>
                  Auditoría física de eventos reales. No se infieren ventas, facturación ni proyecciones hipotéticas.
                </p>

                {metricsLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    Cargando métricas...
                  </div>
                ) : metricsData ? (
                  <div>
                    <div className="v3-metrics-grid">
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-views">{metricsData.views}</div>
                        <div className="v3-metric-label">Vistas totales</div>
                      </div>
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-unique-visitors">{metricsData.unique_visitors}</div>
                        <div className="v3-metric-label">Visitantes únicos</div>
                      </div>
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-shares">{metricsData.shares}</div>
                        <div className="v3-metric-label">Compartidos WA</div>
                      </div>
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-contacts">{metricsData.contacts}</div>
                        <div className="v3-metric-label">Contactos iniciados</div>
                      </div>
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-saves">{metricsData.saves}</div>
                        <div className="v3-metric-label">Guardados en Mi Base</div>
                      </div>
                      <div className="v3-metric-card">
                        <div className="v3-metric-val" id="metric-redemptions-created">{metricsData.redemptions_created}</div>
                        <div className="v3-metric-label">Cupones generados</div>
                      </div>
                      <div className="v3-metric-card" style={{ gridColumn: 'span 2', background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' }}>
                        <div className="v3-metric-val" id="metric-redemptions-confirmed" style={{ color: '#4ade80' }}>
                          {metricsData.redemptions_confirmed}
                        </div>
                        <div className="v3-metric-label" style={{ color: '#86efac' }}>Canjes físicos confirmados en local</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', textAlign: 'center' }}>No hay métricas disponibles aún.</div>
                )}

                <div style={{ textAlign: 'right', marginTop: '1.2rem' }}>
                  <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsMetricsModalOpen(false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 5: OWNER CONFIRM REDEMPTION CODE                  */}
        {/* ======================================================== */}
        {isRedeemConfirmModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsRedeemConfirmModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">🎟️ Validar y Confirmar Canje</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsRedeemConfirmModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                  Ingresá el código alfanumérico que te presente el vecino en el mostrador para asentar el canje físico.
                </p>

                {redeemConfirmMsg && (
                  <div style={{
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    background: redeemConfirmMsg.startsWith('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: redeemConfirmMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                    fontSize: '0.9rem'
                  }}>
                    {redeemConfirmMsg}
                  </div>
                )}

                <form onSubmit={handleConfirmRedemptionSubmit}>
                  <div className="v3-form-group">
                    <label className="v3-form-label">Código de Canje *</label>
                    <input
                      type="text"
                      id="input-redemption-code"
                      className="v3-input"
                      required
                      placeholder="Ej. CAB-AZLN"
                      value={redeemCodeInput}
                      onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                      style={{ fontSize: '1.2rem', fontFamily: 'monospace', letterSpacing: '0.1em', textAlign: 'center' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsRedeemConfirmModalOpen(false)}>
                      Cerrar
                    </button>
                    <button type="submit" id="btn-confirm-redeem-submit" className="v3-btn v3-btn-primary" disabled={redeemConfirmLoading}>
                      {redeemConfirmLoading ? 'Validando...' : 'Confirmar Canje'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 6: NEIGHBOR REDEMPTION VOUCHER & QR               */}
        {/* ======================================================== */}
        {activeRedemption && (
          <div className="v3-modal-backdrop" onClick={() => setActiveRedemption(null)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">🎟️ Tu Cupón de Oferta</h3>
                <button type="button" className="v3-modal-close" onClick={() => setActiveRedemption(null)}>✕</button>
              </div>
              <div className="v3-modal-body" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  {activeRedemption.offer_title}
                </div>

                <div className="v3-coupon-box">
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                    CÓDIGO DE CANJE FÍSICO
                  </div>
                  <div className="v3-coupon-code" id="coupon-display-code">
                    {activeRedemption.redemption_code}
                  </div>
                  <div className="v3-qr-container" id="coupon-qr-visual">
                    {renderQrSvg(activeRedemption.redemption_code)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                    ✓ Cupón activo para presentar en mostrador
                  </div>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 1.2rem 0' }}>
                  Mostrá este código o escaneá el QR directamente en el local para acceder a tu promoción. No requiere pago online ni comisión.
                </p>

                <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="v3-btn v3-btn-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(activeRedemption.redemption_code);
                      alert('Código copiado al portapapeles');
                    }}
                  >
                    📋 Copiar código
                  </button>
                  <button
                    type="button"
                    className="v3-btn v3-btn-secondary"
                    onClick={() => setActiveRedemption(null)}
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 7: REPORT COMMUNITY CONTENT                        */}
        {/* ======================================================== */}
        {isReportModalOpen && (
          <div className="v3-modal-backdrop" onClick={() => setIsReportModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">🚩 Reportar a la Comunidad</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsReportModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                {reportSuccess ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: '#4ade80' }}>
                    ✓ Gracias por tu reporte. El equipo de moderación revisará la información para preservar la calidad del directorio.
                  </div>
                ) : (
                  <form onSubmit={handleSubmitReport}>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                      Los reportes comunitarios ayudan a mantener veraz el directorio sin bajas automáticas indebidas.
                    </p>

                    <div className="v3-form-group">
                      <label className="v3-form-label">Motivo del Reporte *</label>
                      <select
                        id="select-report-reason"
                        className="v3-select"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                      >
                        <option value="Información incorrecta">Información comercial incorrecta</option>
                        <option value="Comercio cerrado">Comercio cerrado permanentemente</option>
                        <option value="Oferta engañosa">Oferta engañosa o no respetada</option>
                        <option value="Contenido inadecuado">Contenido inadecuado o sospechoso</option>
                      </select>
                    </div>

                    <div className="v3-form-group">
                      <label className="v3-form-label">Detalles adicionales</label>
                      <textarea
                        id="textarea-report-desc"
                        className="v3-textarea"
                        placeholder="Contanos brevemente qué sucedió..."
                        value={reportDesc}
                        onChange={(e) => setReportDesc(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                      <button type="button" className="v3-btn v3-btn-secondary" onClick={() => setIsReportModalOpen(false)}>
                        Cancelar
                      </button>
                      <button type="submit" id="btn-submit-report" className="v3-btn v3-btn-primary">
                        Enviar Reporte
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 8: DIRECT CONTACT POPUP                            */}
        {/* ======================================================== */}
        {isContactModalOpen && business && (
          <div className="v3-modal-backdrop" onClick={() => setIsContactModalOpen(false)}>
            <div className="v3-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="v3-modal-header">
                <h3 className="v3-modal-title">✉️ Canales de Contacto: {business.name}</h3>
                <button type="button" className="v3-modal-close" onClick={() => setIsContactModalOpen(false)}>✕</button>
              </div>
              <div className="v3-modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
                  {business.public_phone && (
                    <a
                      href={`tel:${business.public_phone}`}
                      className="v3-btn v3-btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '0.8rem 1rem' }}
                    >
                      📞 Llamar al {business.public_phone}
                    </a>
                  )}

                  {business.public_whatsapp && (
                    <a
                      href={`https://wa.me/${business.public_whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="v3-btn v3-btn-whatsapp"
                      style={{ justifyContent: 'flex-start', padding: '0.8rem 1rem' }}
                    >
                      💬 Escribir por WhatsApp ({business.public_whatsapp})
                    </a>
                  )}

                  {business.public_website && (
                    <a
                      href={business.public_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="v3-btn v3-btn-secondary"
                      style={{ justifyContent: 'flex-start', padding: '0.8rem 1rem' }}
                    >
                      🌐 Visitar sitio web oficial
                    </a>
                  )}

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem 1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>DIRECCIÓN FÍSICA</div>
                    <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.92rem', marginTop: '0.2rem' }}>
                      📍 {business.address}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="v3-btn v3-btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setIsContactModalOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default AtlasLocalDeepLanding;
