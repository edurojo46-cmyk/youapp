import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getAtlasUrl, getCurrentProduct } from '../../packages/config/products.ts';
import './PropuestaComercial.css';

interface ProposalData {
  proposal_id: string;
  user_id: string;
  buyer_name?: string;
  buyer_contact_email?: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency: string;
  valid_until: string;
  terms_conditions?: string;
  token: string;
  status: string;
  created_at: string;
}

interface OrderData {
  order_id: string;
  gross_amount: number;
  atlas_fee_amount: number;
  status: string;
  mp_preference_id?: string;
  paid_at?: string;
}

interface SellerInfo {
  organization_name?: string | null;
  representative_name?: string | null;
  tax_id?: string | null;
  website?: string | null;
}

export default function PropuestaComercial() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();

  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  useEffect(() => {
    // Check payment redirect params
    const paymentStatus = searchParams.get('payment') || searchParams.get('status');
    if (paymentStatus === 'success') {
      setPaymentNotice('¡Pago procesado con éxito! El comprobante y la confirmación se han registrado.');
    } else if (paymentStatus === 'failure') {
      setPaymentNotice('El pago no pudo completarse. Puedes intentar nuevamente.');
    } else if (paymentStatus === 'pending') {
      setPaymentNotice('El pago se encuentra pendiente de acreditación.');
    }

    fetchProposal();
  }, [token, searchParams]);

  const apiFetch = async (endpoint: string, options?: RequestInit) => {
    let res = await fetch(endpoint, options);
    let contentType = res.headers.get('content-type') || '';

    // If Vite development server returned HTML instead of JSON proxy, retry directly against backend port 5174
    if (!contentType.includes('application/json')) {
      const fallbackUrl = `http://localhost:5174${endpoint}`;
      try {
        const fallbackRes = await fetch(fallbackUrl, options);
        const fallbackContentType = fallbackRes.headers.get('content-type') || '';
        if (fallbackContentType.includes('application/json')) {
          res = fallbackRes;
          contentType = fallbackContentType;
        }
      } catch {
        // Keep initial response if fallback fails
      }
    }

    if (!contentType.includes('application/json')) {
      throw new Error('El servidor de propuestas no está disponible en este momento.');
    }

    const data = await res.json();
    return { res, data };
  };

  const fetchProposal = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const { res, data } = await apiFetch(`/api/commerce/proposals/${token}`);
      if (!res.ok || !data.proposal) {
        throw new Error(data.error || 'Propuesta no encontrada o enlace vencido');
      }
      setProposal(data.proposal);
      setOrder(data.order);
      if (data.seller_info) setSellerInfo(data.seller_info);
    } catch (err: any) {
      setError(err.message || 'Error al cargar la propuesta comercial');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!token) return;
    try {
      setActionLoading(true);
      setError(null);
      const { res, data } = await apiFetch(`/api/commerce/proposals/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo aceptar la propuesta');
      }
      setProposal(prev => prev ? { ...prev, status: 'ACCEPTED' } : null);
      setOrder(data.order);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token || !window.confirm('¿Seguro que deseas rechazar esta propuesta?')) return;
    try {
      setActionLoading(true);
      setError(null);
      const { res, data } = await apiFetch(`/api/commerce/proposals/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo rechazar la propuesta');
      }
      setProposal(prev => prev ? { ...prev, status: 'REJECTED' } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!token) return;
    try {
      setActionLoading(true);
      setError(null);
      const { res, data } = await apiFetch(`/api/commerce/proposals/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo generar el checkout');
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="propuesta-container propuesta-loading">
        <div className="propuesta-spinner"></div>
        <p>Cargando propuesta comercial...</p>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="propuesta-container">
        <div className="propuesta-card propuesta-error-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>📋</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            Propuesta no disponible
          </h2>
          <p style={{ color: '#64748b', fontSize: '15px', maxWidth: '440px', margin: '0 auto 24px', lineHeight: '1.5' }}>
            {error.includes('expired') || error.includes('vencido') || error.includes('not found') || error.includes('encontrada')
              ? 'El enlace de esta cotización comercial no existe, fue renovado o ha expirado su vigencia.'
              : error}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {getCurrentProduct() === 'INDUSTRIAL' ? (
              <a 
                href={getAtlasUrl('/mi-base', { sso: true })} 
                className="btn-accept" 
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px' }}
              >
                ← Ir a Mi Base de Prospectos (Atlas)
              </a>
            ) : (
              <Link 
                to="/mi-base" 
                className="btn-accept" 
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px' }}
              >
                ← Ir a Mi Base de Prospectos
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const total = Number(proposal.quantity) * Number(proposal.unit_price);
  const isExpired = new Date(proposal.valid_until).getTime() < Date.now();
  const isAccepted = proposal.status === 'ACCEPTED' || proposal.status === 'PAYMENT_PENDING' || proposal.status === 'PAID';
  const isPaid = proposal.status === 'PAID';
  const isRejected = proposal.status === 'REJECTED';

  return (
    <div className="propuesta-container">
      <div className="propuesta-header">
        <div className="propuesta-logo-badge">
          <span>ATLAS</span>
          <span className="propuesta-tag">B2B COMMERCE</span>
        </div>
        <div className="propuesta-test-pill">MODO PRUEBA (SANDBOX)</div>
      </div>

      {paymentNotice && (
        <div className="propuesta-notice-banner">
          {paymentNotice}
        </div>
      )}

      {error && (
        <div className="propuesta-error-banner">
          {error}
        </div>
      )}

      <div className="propuesta-card">
        <div className="propuesta-top-row">
          <div>
            <span className="propuesta-label">PROPUESTA COMERCIAL</span>
            <h1 className="propuesta-title">{proposal.title}</h1>
          </div>
          <div className={`propuesta-status-badge status-${proposal.status.toLowerCase()}`}>
            {isPaid ? '✓ PAGADA' : isRejected ? 'RECHAZADA' : isExpired ? 'VENCIDA' : isAccepted ? 'ACEPTADA' : 'PENDIENTE'}
          </div>
        </div>

        {/* Vendedor / Organización */}
        {sellerInfo && (sellerInfo.organization_name || sellerInfo.representative_name) && (
          <div className="propuesta-vendedor" style={{ margin: '8px 0 16px 0', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#475569' }}>
            <span style={{ fontWeight: 500 }}>Vendedor / Emisor: </span>
            <strong style={{ color: '#0f172a' }}>{sellerInfo.organization_name || sellerInfo.representative_name}</strong>
            {sellerInfo.organization_name && sellerInfo.representative_name && (
              <span style={{ color: '#64748b' }}> • Resp: {sellerInfo.representative_name}</span>
            )}
            {sellerInfo.tax_id && (
              <span style={{ color: '#64748b' }}> • CUIT/RUT: {sellerInfo.tax_id}</span>
            )}
            {sellerInfo.website && (
              <span style={{ color: '#2563eb', marginLeft: '6px' }}>({sellerInfo.website})</span>
            )}
          </div>
        )}

        {proposal.buyer_name && (
          <div className="propuesta-destinatario">
            <span>Para: <strong>{proposal.buyer_name}</strong></span>
            {proposal.buyer_contact_email && <span className="propuesta-email">({proposal.buyer_contact_email})</span>}
          </div>
        )}

        {proposal.description && (
          <div className="propuesta-section">
            <h3>Detalle del suministro o servicio</h3>
            <p className="propuesta-desc">{proposal.description}</p>
          </div>
        )}

        <div className="propuesta-items-table">
          <div className="propuesta-table-header">
            <span>Concepto</span>
            <span className="col-center">Cantidad</span>
            <span className="col-right">Precio unitario</span>
            <span className="col-right">Subtotal</span>
          </div>
          <div className="propuesta-table-row">
            <span>{proposal.title}</span>
            <span className="col-center">{proposal.quantity}</span>
            <span className="col-right">${Number(proposal.unit_price).toLocaleString('es-AR')} {proposal.currency}</span>
            <span className="col-right">${total.toLocaleString('es-AR')} {proposal.currency}</span>
          </div>
          <div className="propuesta-table-total">
            <span>Total a pagar</span>
            <span className="total-amount">${total.toLocaleString('es-AR')} {proposal.currency}</span>
          </div>
        </div>

        <div className="propuesta-meta-grid">
          <div>
            <span className="propuesta-label">Vigencia hasta:</span>
            <p>{new Date(proposal.valid_until).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
          {order && (
            <div>
              <span className="propuesta-label">Atlas Order ID (SSOT):</span>
              <p className="order-ssot-id">{order.order_id.substring(0, 13)}...</p>
            </div>
          )}
        </div>

        {proposal.terms_conditions && (
          <div className="propuesta-section">
            <h3>Condiciones comerciales</h3>
            <p className="propuesta-terms">{proposal.terms_conditions}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="propuesta-actions">
          {!isAccepted && !isRejected && !isExpired && (
            <>
              <button 
                className="btn-accept" 
                onClick={handleAccept} 
                disabled={actionLoading}
              >
                {actionLoading ? 'Procesando...' : '✓ Aceptar propuesta'}
              </button>
              <button 
                className="btn-reject" 
                onClick={handleReject} 
                disabled={actionLoading}
              >
                Rechazar
              </button>
            </>
          )}

          {isAccepted && !isPaid && (
            <button 
              className="btn-mercadopago" 
              onClick={handleCheckout} 
              disabled={actionLoading}
            >
              {actionLoading ? 'Preparando pasarela...' : 'Pagar con Mercado Pago'}
            </button>
          )}

          {isPaid && (
            <div className="propuesta-paid-box">
              <span className="paid-icon">✓</span>
              <div>
                <h4>Pago Confirmado y Conciliado</h4>
                <p>Orden de venta registrada en Atlas Commerce. Comprobante emitido.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
