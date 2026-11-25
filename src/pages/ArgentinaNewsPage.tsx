import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  ExternalLink,
  Newspaper,
  Radio,
  RefreshCw,
  X
} from 'lucide-react';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { useSignalStore } from '../lib/tv/signalStore';
import { addSignalNewsSource } from '../lib/tv/signalMediaSourcesStore';

interface NewspaperDef {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  siteUrl: string;
  rssUrl: string;
}

interface NewsArticleItem {
  id: string;
  outletId: string;
  outletName: string;
  outletAccent: string;
  title: string;
  summary: string;
  link: string;
  thumbnail?: string;
  pubDate: string;
}

const ARGENTINA_NEWSPAPERS: NewspaperDef[] = [
  {
    id: 'infobae',
    name: 'Infobae',
    tagline: 'Últimas noticias de Argentina y el mundo',
    accent: '#ea580c',
    siteUrl: 'https://www.infobae.com',
    rssUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/'
  },
  {
    id: 'lanacion',
    name: 'La Nación',
    tagline: 'Política, economía y sociedad',
    accent: '#1d4ed8',
    siteUrl: 'https://www.lanacion.com.ar',
    rssUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/'
  },
  {
    id: 'clarin',
    name: 'Clarín',
    tagline: 'Lo último en Argentina',
    accent: '#dc2626',
    siteUrl: 'https://www.clarin.com',
    rssUrl: 'https://www.clarin.com/rss/lo-ultimo/'
  },
  {
    id: 'ambito',
    name: 'Ámbito',
    tagline: 'Economía, finanzas y política',
    accent: '#0f766e',
    siteUrl: 'https://www.ambito.com',
    rssUrl: 'https://www.ambito.com/rss/pages/home.xml'
  },
  {
    id: 'clarin-politica',
    name: 'Clarín Política',
    tagline: 'Actualidad política argentina',
    accent: '#991b1b',
    siteUrl: 'https://www.clarin.com/politica/',
    rssUrl: 'https://www.clarin.com/rss/politica/'
  },
  {
    id: 'clarin-deportes',
    name: 'Clarín Deportes',
    tagline: 'Fútbol, selección y deportes',
    accent: '#15803d',
    siteUrl: 'https://www.clarin.com/deportes/',
    rssUrl: 'https://www.clarin.com/rss/deportes/'
  }
];

const FEED_CACHE = new Map<string, { ts: number; items: NewsArticleItem[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPubTime(raw: string): string {
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return 'Reciente';
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

async function fetchOutletArticles(outlet: NewspaperDef, force = false): Promise<NewsArticleItem[]> {
  const cached = FEED_CACHE.get(outlet.id);
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.items;
  }
  try {
    const res = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(outlet.rssUrl)}`
    );
    const data = await res.json();
    if (data?.status !== 'ok' || !Array.isArray(data.items)) return [];

    const items: NewsArticleItem[] = data.items.slice(0, 6).map((it: any, idx: number) => {
      const thumb =
        (typeof it.thumbnail === 'string' && it.thumbnail.startsWith('http') ? it.thumbnail : '') ||
        (typeof it.enclosure?.link === 'string' && it.enclosure.link.startsWith('http')
          ? it.enclosure.link
          : '');
      const cleanDesc = stripHtml(it.description || it.content || '').slice(0, 320);
      return {
        id: `${outlet.id}-${idx}-${it.guid || it.link}`,
        outletId: outlet.id,
        outletName: outlet.name,
        outletAccent: outlet.accent,
        title: stripHtml(it.title || 'Sin título'),
        summary: cleanDesc,
        link: it.link || outlet.siteUrl,
        thumbnail: thumb || undefined,
        pubDate: it.pubDate || ''
      };
    });

    FEED_CACHE.set(outlet.id, { ts: Date.now(), items });
    return items;
  } catch {
    return [];
  }
}

export default function ArgentinaNewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeSignal = useSignalStore((s) => s.activeSignal);
  const signalId = searchParams.get('signal') || activeSignal?.id || 'justicia-social-signal-1';

  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');
  const [articlesByOutlet, setArticlesByOutlet] = useState<Record<string, NewsArticleItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [readerItem, setReaderItem] = useState<NewsArticleItem | null>(null);
  const [savedLinks, setSavedLinks] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const loadAllFeeds = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        ARGENTINA_NEWSPAPERS.map(async (outlet) => ({
          id: outlet.id,
          items: await fetchOutletArticles(outlet, force)
        }))
      );
      const map: Record<string, NewsArticleItem[]> = {};
      for (const e of entries) {
        if (e.items.length > 0) map[e.id] = e.items;
      }
      setArticlesByOutlet(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllFeeds(false);
  }, [loadAllFeeds]);

  const handleSaveToSignal = (article: NewsArticleItem) => {
    addSignalNewsSource(signalId, {
      title: article.title,
      sourceName: article.outletName,
      articleUrl: article.link,
      summary: article.summary || undefined
    });
    setSavedLinks((prev) => new Set(prev).add(article.link));
    setToast(`Nota de ${article.outletName} guardada en tu señal.`);
  };

  const visibleOutlets = ARGENTINA_NEWSPAPERS.filter((o) =>
    selectedOutletId === 'all' ? true : o.id === selectedOutletId
  );

  return (
    <div className="arn-page">
      <header className="arn-topnav">
        <div className="arn-left">
          <button
            type="button"
            className="arn-back-btn"
            onClick={() => navigate(`/misenal1?signal=${encodeURIComponent(signalId)}`)}
          >
            <ArrowLeft size={14} />
            <span>Mi Señal</span>
          </button>
          <div className="arn-divider" />
          <YouAppOfficialLogo theme="light" />
        </div>

        <div className="arn-right">
          <button
            type="button"
            className="arn-pill-btn"
            onClick={() => navigate(`/misenal-medios?signal=${encodeURIComponent(signalId)}`)}
          >
            <Radio size={13} />
            <span>Radio y Noticias</span>
          </button>
          <button
            type="button"
            className="arn-pill-btn"
            disabled={loading}
            onClick={() => void loadAllFeeds(true)}
          >
            <RefreshCw size={13} />
            <span>{loading ? 'Actualizando…' : 'Actualizar'}</span>
          </button>
          <TvUserSessionMenu />
        </div>
      </header>

      <main className="arn-shell">
        <section className="arn-hero">
          <div>
            <span className="arn-eyebrow">
              <Newspaper size={12} /> KIOSCO EN VIVO · DIARIOS ARGENTINOS
            </span>
            <h1>Las 6 últimas notas de cada diario</h1>
            <p>
              Titulares y bajadas oficiales actualizadas al minuto. Tocá cualquier nota para ver el resumen editorial o abrir el artículo completo en el diario original.
            </p>
          </div>

          <div className="arn-filter-bar" role="tablist" aria-label="Filtrar diario">
            <button
              type="button"
              role="tab"
              aria-selected={selectedOutletId === 'all'}
              className={`arn-filter-pill ${selectedOutletId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedOutletId('all')}
            >
              Todos
            </button>
            {ARGENTINA_NEWSPAPERS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={selectedOutletId === o.id}
                className={`arn-filter-pill ${selectedOutletId === o.id ? 'active' : ''}`}
                onClick={() => setSelectedOutletId(o.id)}
              >
                <span className="arn-dot" style={{ background: o.accent }} />
                <span>{o.name}</span>
              </button>
            ))}
          </div>
        </section>

        {toast && (
          <div className="arn-toast" role="status">
            {toast}
          </div>
        )}

        {loading && Object.keys(articlesByOutlet).length === 0 ? (
          <div className="arn-loading">Cargando las últimas 6 notas de cada diario argentino…</div>
        ) : (
          visibleOutlets.map((outlet) => {
            const list = articlesByOutlet[outlet.id] || [];
            if (list.length === 0) return null;

            return (
              <section key={outlet.id} className="arn-outlet-section">
                <div className="arn-outlet-head">
                  <div className="arn-outlet-title">
                    <span className="arn-outlet-badge" style={{ background: outlet.accent }}>
                      {outlet.name}
                    </span>
                    <span className="arn-outlet-sub">{outlet.tagline}</span>
                  </div>
                  <a
                    href={outlet.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="arn-outlet-link"
                  >
                    Ir a {outlet.name} <ExternalLink size={12} />
                  </a>
                </div>

                <div className="arn-grid">
                  {list.map((article) => {
                    const isSaved = savedLinks.has(article.link);
                    return (
                      <article key={article.id} className="arn-card">
                        <button
                          type="button"
                          className="arn-card-hit"
                          onClick={() => setReaderItem(article)}
                        >
                          {article.thumbnail && (
                            <div className="arn-thumb-wrap">
                              <img src={article.thumbnail} alt={article.title} loading="lazy" />
                            </div>
                          )}
                          <div className="arn-card-body">
                            <span className="arn-time">{formatPubTime(article.pubDate)}</span>
                            <h3>{article.title}</h3>
                            {article.summary && <p>{article.summary}</p>}
                          </div>
                        </button>

                        <div className="arn-card-foot">
                          <button
                            type="button"
                            className={`arn-save-btn ${isSaved ? 'saved' : ''}`}
                            onClick={() => handleSaveToSignal(article)}
                          >
                            {isSaved ? <Check size={12} /> : <BookmarkPlus size={12} />}
                            <span>{isSaved ? 'En Mi Señal' : 'Sumar a Mi Señal'}</span>
                          </button>

                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="arn-open-link"
                          >
                            Leer <ExternalLink size={11} />
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Modal de lectura rápida editorial dentro de YOUAPP (foto + titular + bajada oficial + link al diario) */}
      {readerItem && (
        <div
          className="arn-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setReaderItem(null)}
        >
          <div className="arn-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="arn-modal-close"
              onClick={() => setReaderItem(null)}
              aria-label="Cerrar lectura rápida"
            >
              <X size={16} />
            </button>

            {readerItem.thumbnail && (
              <div className="arn-modal-img">
                <img src={readerItem.thumbnail} alt={readerItem.title} />
              </div>
            )}

            <div className="arn-modal-body">
              <div className="arn-modal-meta">
                <span className="arn-outlet-badge" style={{ background: readerItem.outletAccent }}>
                  {readerItem.outletName}
                </span>
                <span className="arn-time">{formatPubTime(readerItem.pubDate)}</span>
              </div>

              <h2>{readerItem.title}</h2>
              {readerItem.summary && <p className="arn-modal-summary">{readerItem.summary}</p>}

              <div className="arn-modal-actions">
                <a
                  href={readerItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="arn-btn-primary"
                >
                  <span>Leer nota completa en {readerItem.outletName}</span>
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  className="arn-btn-secondary"
                  onClick={() => handleSaveToSignal(readerItem)}
                >
                  <BookmarkPlus size={14} />
                  <span>Sumar a Mi Señal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .arn-page {
          min-height: 100dvh;
          background: #f5f5f7;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          padding-bottom: 52px;
        }
        .arn-topnav {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .arn-left, .arn-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .arn-divider {
          width: 1px;
          height: 18px;
          background: rgba(0, 0, 0, 0.1);
        }
        .arn-back-btn, .arn-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .arn-shell {
          max-width: 1180px;
          margin: 0 auto;
          padding: 20px 18px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .arn-hero {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 24px;
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .arn-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .arn-hero h1 {
          margin: 4px 0 4px;
          font-size: 24px;
          font-weight: 760;
          letter-spacing: -0.028em;
        }
        .arn-hero p {
          margin: 0;
          font-size: 13.5px;
          color: #6e6e73;
        }
        .arn-filter-bar {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .arn-filter-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 13px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #424245;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .arn-filter-pill.active {
          background: #1d1d1f;
          color: #ffffff;
          border-color: #1d1d1f;
        }
        .arn-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          display: inline-block;
        }
        .arn-toast {
          padding: 10px 14px;
          border-radius: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12.5px;
          font-weight: 600;
        }
        .arn-loading {
          padding: 40px;
          text-align: center;
          color: #6e6e73;
          font-size: 14px;
        }
        .arn-outlet-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .arn-outlet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .arn-outlet-title {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .arn-outlet-badge {
          padding: 4px 11px;
          border-radius: 999px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 720;
        }
        .arn-outlet-sub {
          font-size: 12.5px;
          color: #6e6e73;
        }
        .arn-outlet-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: #0071e3;
          text-decoration: none;
        }
        .arn-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 14px;
        }
        .arn-card {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .arn-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.07);
        }
        .arn-card-hit {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .arn-thumb-wrap {
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #e5e5ea;
          overflow: hidden;
        }
        .arn-thumb-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .arn-card-body {
          padding: 13px 15px 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .arn-time {
          font-size: 11px;
          font-weight: 600;
          color: #86868b;
        }
        .arn-card-body h3 {
          margin: 0;
          font-size: 14.5px;
          font-weight: 700;
          line-height: 1.3;
          color: #1d1d1f;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .arn-card-body p {
          margin: 0;
          font-size: 12.5px;
          color: #6e6e73;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .arn-card-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 15px 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.04);
        }
        .arn-save-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 620;
          cursor: pointer;
        }
        .arn-save-btn.saved {
          background: #f0fdf4;
          border-color: #bbf7d0;
          color: #166534;
        }
        .arn-open-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 650;
          color: #0071e3;
          text-decoration: none;
        }
        .arn-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(29, 29, 31, 0.48);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .arn-modal {
          position: relative;
          width: 100%;
          max-width: 560px;
          max-height: 90dvh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
        }
        .arn-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 5;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: none;
          background: rgba(29, 29, 31, 0.72);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .arn-modal-img {
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #111216;
          overflow: hidden;
        }
        .arn-modal-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .arn-modal-body {
          padding: 18px 22px 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .arn-modal-meta {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .arn-modal-body h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 750;
          letter-spacing: -0.02em;
          line-height: 1.25;
        }
        .arn-modal-summary {
          margin: 0;
          font-size: 14px;
          color: #424245;
          line-height: 1.55;
        }
        .arn-modal-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .arn-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border-radius: 999px;
          background: #0071e3;
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
          text-decoration: none;
        }
        .arn-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 15px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 620;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
