import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Sparkles, CheckCircle2, ShoppingBag } from 'lucide-react';
import { AtlasMercadoLibreLinkHub } from '../lib/atlas/atlasMercadoLibreLinkHub';
import type { MercadoLibreProduct } from '../lib/atlas/atlasMercadoLibreLinkHub';

export const MercadoLibreCreatorHub: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<MercadoLibreProduct[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const videoFilter = searchParams.get('video');
  const productFilter = searchParams.get('id');

  useEffect(() => {
    setProducts(AtlasMercadoLibreLinkHub.getAllProducts());
  }, []);

  const handleVerEnMercadoLibre = (product: MercadoLibreProduct) => {
    // 1. Atlas registra el click antes de navegar
    const res = AtlasMercadoLibreLinkHub.recordClick(product.PRODUCT_ID);
    if (res) {
      setProducts(AtlasMercadoLibreLinkHub.getAllProducts());
      setLastClickedId(product.PRODUCT_ID);
    }

    // 2. Abrir el MERCADOLIBRE_AFFILIATE_URL original sin modificar ni ocultar
    window.open(product.AFFILIATE_URL, '_blank', 'noopener,noreferrer');
  };

  // Filter or prioritize if query parameter exists
  const displayedProducts = products.filter(p => {
    if (productFilter) return p.PRODUCT_ID === productFilter;
    if (videoFilter) return p.VIDEO_ID === videoFilter;
    return true;
  });

  return (
    <div
      id="creator-hub-page"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0b0f19 0%, #111827 100%)',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '24px 16px 60px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      {/* Mobile-first Container */}
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 230, 0, 0.12)',
              border: '1px solid rgba(255, 230, 0, 0.35)',
              color: '#ffe600',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              marginBottom: 12
            }}
          >
            <ShoppingBag size={13} />
            MERCADO LIBRE CREATOR HUB
          </div>

          <h1
            id="hub-title"
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: -0.5,
              margin: '0 0 6px',
              color: '#ffffff'
            }}
          >
            Productos recomendados
          </h1>

          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Selección exclusiva mencionada en nuestros videos
          </p>
        </header>

        {/* Product Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {displayedProducts.map((product) => {
            const isLastClicked = lastClickedId === product.PRODUCT_ID;

            return (
              <div
                key={product.PRODUCT_ID}
                id={`product-card-${product.PRODUCT_ID}`}
                data-testid={`product-card-${product.PRODUCT_ID}`}
                style={{
                  background: 'rgba(18, 24, 38, 0.95)',
                  border: isLastClicked ? '1.5px solid #ffe600' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Image */}
                <div style={{ position: 'relative', width: '100%', height: 220, background: '#0a0d14' }}>
                  <img
                    id={`product-img-${product.PRODUCT_ID}`}
                    src={product.PRODUCT_IMAGE}
                    alt={product.PRODUCT_TITLE}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      background: 'rgba(0, 0, 0, 0.65)',
                      backdropFilter: 'blur(8px)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#ffe600',
                      letterSpacing: 0.3
                    }}
                  >
                    {product.VIDEO_ID}
                  </div>
                </div>

                {/* Content */}
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <h2
                      id={`product-title-${product.PRODUCT_ID}`}
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        color: '#f1f5f9',
                        margin: 0
                      }}
                    >
                      {product.PRODUCT_TITLE}
                    </h2>
                  </div>

                  {/* CTA: VER EN MERCADO LIBRE */}
                  <button
                    id={`btn-ver-en-ml-${product.PRODUCT_ID}`}
                    data-testid={`btn-ver-en-ml-${product.PRODUCT_ID}`}
                    type="button"
                    onClick={() => handleVerEnMercadoLibre(product)}
                    style={{
                      width: '100%',
                      padding: '13px 18px',
                      fontSize: 13.5,
                      fontWeight: 800,
                      background: '#ffe600',
                      color: '#2d3277',
                      border: 'none',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 14px rgba(255, 230, 0, 0.35)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <span>VER EN MERCADO LIBRE</span>
                    <ExternalLink size={15} />
                  </button>

                  {/* Affiliate URL transparency verification & clicks */}
                  <div
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      borderRadius: 8,
                      fontSize: 10.5,
                      fontFamily: 'monospace',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#64748b' }}>CLICKS REGISTRADOS:</span>
                      <span id={`val-clicks-${product.PRODUCT_ID}`} style={{ color: '#34d399', fontWeight: 700 }}>
                        {product.CLICKS || 0}
                      </span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 9.5, wordBreak: 'break-all' }}>
                      URL AFILIADO: <span id={`val-affiliate-url-${product.PRODUCT_ID}`} style={{ color: '#94a3b8' }}>{product.AFFILIATE_URL}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <footer style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#64748b' }}>
          Atlas Creator Hub · Enlace oficial de YouTube
        </footer>
      </div>
    </div>
  );
};

export default MercadoLibreCreatorHub;
