import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Heart,
  Plus,
  Radio,
  RefreshCw,
  Scale,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { AtlasCompareResult, ComparedOutletItem } from '../lib/tv/atlasComparaEngine';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { useSignalStore } from '../lib/tv/signalStore';
import { addSignalNewsSource } from '../lib/tv/signalMediaSourcesStore';
import {
  fetchArticleReaderContent,
  fetchPortalsLatest,
  loadCachedPortalsLatest,
  loadLecturasFromCloud,
  loadLecturasWorkspace,
  PORTAL_FEED_DEFS,
  resolveWebPointer,
  saveLecturasWorkspace,
  type LecturaItem,
  type LecturasWorkspace,
  type PortalLatestGroup,
  type ReaderArticleContent
} from '../lib/tv/youLecturasStore';

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(ts));
  } catch {
    return null;
  }
}

export default function YouLecturasPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSignal = useSignalStore((s) => s.activeSignal);

  const [workspace, setWorkspace] = useState<LecturasWorkspace>(() => loadLecturasWorkspace());
  const [portalGroups, setPortalGroups] = useState<PortalLatestGroup[]>(() => loadCachedPortalsLatest() || []);
  const [portalsLoading, setPortalsLoading] = useState<boolean>(() => !loadCachedPortalsLatest());
  const [selectedPortalId, setSelectedPortalId] = useState<string>('all');
  const [urlInput, setUrlInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('Portales');
  const [saveTopic, setSaveTopic] = useState<string>('Actualidad');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newTopicDraft, setNewTopicDraft] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeReaderItem, setActiveReaderItem] = useState<LecturaItem | null>(null);
  const [readerContent, setReaderContent] = useState<ReaderArticleContent | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [forceReaderMode, setForceReaderMode] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'paper' | 'sepia' | 'night'>('paper');
  const [readerFontSize, setReaderFontSize] = useState<number>(17);
  const [readerProgress, setReaderProgress] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<AtlasCompareResult | null>(null);
  const [compareTab, setCompareTab] = useState<'coincidencias' | 'enfoques' | 'fuentes'>('coincidencias');
  const [compareTopicInput, setCompareTopicInput] = useState('');

  useEffect(() => {
    setReaderProgress(0);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    if (!activeReaderItem) {
      setReaderContent(null);
      setReaderLoading(false);
      setForceReaderMode(false);
      return;
    }
    if (activeReaderItem.embeddable && !forceReaderMode) return;
    let cancelled = false;
    setReaderLoading(true);
    setReaderContent(null);
    fetchArticleReaderContent(activeReaderItem.url)
      .then((res) => {
        if (!cancelled) setReaderContent(res);
      })
      .finally(() => {
        if (!cancelled) setReaderLoading(false);
      });
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [activeReaderItem, forceReaderMode]);

  const handleToggleSpeakArticle = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setToast('Tu navegador no admite lectura en voz alta.');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const parts: string[] = [];
    if (readerContent?.title || activeReaderItem?.title) {
      parts.push(readerContent?.title || activeReaderItem?.title || '');
    }
    if (readerContent?.paragraphs?.length) {
      parts.push(...readerContent.paragraphs.slice(0, 40));
    } else if (activeReaderItem?.description) {
      parts.push(activeReaderItem.description);
    }
    const text = parts.join('. ').trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-AR';
    utter.rate = 1.02;
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    if (!activeReaderItem && !compareOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveReaderItem(null);
        setCompareOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeReaderItem, compareOpen]);

  const runAtlasCompare = async (params: {
    title: string;
    description?: string;
    url?: string;
    sourceName?: string;
  }) => {
    const q = params.title.trim();
    if (q.length < 4) {
      setToast('Escribí al menos 4 caracteres para comparar coberturas.');
      return;
    }
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    setCompareTab('coincidencias');
    try {
      const qs = new URLSearchParams({ title: q });
      if (params.description) qs.set('desc', params.description);
      if (params.url) qs.set('url', params.url);
      if (params.sourceName) qs.set('source', params.sourceName);
      const res = await fetch(`/api/lecturas/compare?${qs.toString()}`);
      const data = await res.json();
      if (!data?.ok) {
        setCompareError(data?.error || 'No se pudieron consultar los medios RSS.');
        return;
      }
      setCompareResult(data as AtlasCompareResult);
    } catch {
      setCompareError('Error de red consultando los feeds RSS.');
    } finally {
      setCompareLoading(false);
    }
  };

  const handleSendComparedToMiSenal = (m: ComparedOutletItem) => {
    const signalId = activeSignal?.id || 'justicia-social-signal-1';
    addSignalNewsSource(signalId, {
      title: m.title,
      sourceName: m.outletName,
      articleUrl: m.url,
      summary: m.description || undefined
    });
    setToast(`«${m.outletName}» sumado a Mi Señal.`);
  };

  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);
  const handledAddRef = useRef<string | null>(null);
  const hydratedIdsRef = useRef<Set<string>>(new Set());

  const updateWorkspace = (updater: (prev: LecturasWorkspace) => LecturasWorkspace) => {
    setWorkspace((prev) => saveLecturasWorkspace(updater(prev)));
  };

  useEffect(() => {
    loadLecturasFromCloud()
      .then((merged) => {
        if (merged) setWorkspace(merged);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedPortalsLatest();
    if (cached && cached.some((g) => g.items.length > 0)) {
      setPortalGroups(cached);
      setPortalsLoading(false);
      return;
    }
    setPortalsLoading(true);
    fetchPortalsLatest(3)
      .then((groups) => {
        if (!cancelled) setPortalGroups(groups);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPortalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefreshPortals = async () => {
    setPortalsLoading(true);
    try {
      const fresh = await fetchPortalsLatest(3, true);
      setPortalGroups(fresh);
      setToast('Últimas 3 notas por portal actualizadas.');
    } finally {
      setPortalsLoading(false);
    }
  };

  const handleSavePortalItem = (item: LecturaItem) => {
    const exists = workspace.items.some((x) => x.url === item.url);
    if (exists) {
      setToast('Esta nota ya está en Mis Guardadas.');
      return;
    }
    const savedItem: LecturaItem = {
      ...item,
      id: `lec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      addedAt: new Date().toISOString()
    };
    updateWorkspace((prev) => ({
      ...prev,
      items: [savedItem, ...prev.items]
    }));
    setToast(`Guardada en Mis Lecturas: ${item.title.slice(0, 48)}…`);
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Bookmarklet "+ Lecturas" para PC (1 clic desde cualquier diario, blog o artículo)
  useEffect(() => {
    const el = bookmarkletRef.current;
    if (!el || typeof window === 'undefined') return;
    const origin = window.location.origin;
    el.setAttribute(
      'href',
      `javascript:(function(){window.open('${origin}/lecturas?add='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title),'youapp_lecturas');})();`
    );
  }, []);

  // Auto-hidrata fotos, bajadas y soporte iframe (embeddable) en artículos ya guardados
  useEffect(() => {
    const missing = workspace.items
      .filter((it) => (!it.thumbnailUrl || !it.description || !it.embeddable) && !hydratedIdsRef.current.has(it.id))
      .slice(0, 6);
    if (missing.length === 0) return;

    let cancelled = false;
    missing.forEach((it) => hydratedIdsRef.current.add(it.id));

    Promise.all(
      missing.map(async (it) => {
        const res = await resolveWebPointer(it.url, it.topic, it.title);
        if (!res.ok) return null;
        return { id: it.id, resolved: res.item };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const updates = new Map(
          results
            .filter((r): r is { id: string; resolved: LecturaItem } => Boolean(r))
            .map((r) => [r.id, r.resolved])
        );
        if (updates.size === 0) return;

        setWorkspace((prev) => {
          let changed = false;
          const nextItems = prev.items.map((it) => {
            const up = updates.get(it.id);
            if (!up) return it;
            const nextThumb = it.thumbnailUrl || up.thumbnailUrl;
            const nextDesc = it.description || up.description;
            const nextTitle =
              it.title.toLowerCase() === it.sourceName.toLowerCase() && up.title
                ? up.title
                : it.title;
            const nextPub = it.publishedAt || up.publishedAt;
            const nextEmbed = it.embeddable || up.embeddable;
            if (
              nextThumb !== it.thumbnailUrl ||
              nextDesc !== it.description ||
              nextTitle !== it.title ||
              nextPub !== it.publishedAt ||
              nextEmbed !== it.embeddable
            ) {
              changed = true;
              return {
                ...it,
                thumbnailUrl: nextThumb,
                description: nextDesc,
                title: nextTitle,
                publishedAt: nextPub,
                embeddable: nextEmbed
              };
            }
            return it;
          });
          if (!changed) return prev;
          return saveLecturasWorkspace({ ...prev, items: nextItems });
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspace.items]);

  // Recepción automática /lecturas?add=<URL>&t=<Title>
  useEffect(() => {
    const addUrl = searchParams.get('add')?.trim();
    if (!addUrl || handledAddRef.current === addUrl) return;
    handledAddRef.current = addUrl;
    const titleHint = searchParams.get('t')?.trim() || undefined;
    setIsAdding(true);
    setErrorMsg(null);

    resolveWebPointer(addUrl, saveTopic, titleHint)
      .then((res) => {
        if (!res.ok) {
          setErrorMsg(res.error);
          return;
        }
        const currentWs = loadLecturasWorkspace();
        const existingItem = currentWs.items.find((x) => x.url === res.item.url);
        if (existingItem) {
          setActiveReaderItem(existingItem);
          setToast(`Ya estaba guardado en Mis Lecturas: ${existingItem.title}`);
        } else {
          const nextWs = saveLecturasWorkspace({
            ...currentWs,
            items: [res.item, ...currentWs.items]
          });
          setWorkspace(nextWs);
          setActiveReaderItem(res.item);
          setToast(`Guardado en Mis Lecturas: ${res.item.title}`);
        }
      })
      .finally(() => {
        setIsAdding(false);
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, setSearchParams, saveTopic]);

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isAdding) return;
    setErrorMsg(null);
    setIsAdding(true);
    try {
      const targetTopic = selectedTopic === 'Todas' || selectedTopic === 'Portales' ? saveTopic : selectedTopic;
      const res = await resolveWebPointer(urlInput, targetTopic);
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      const exists = workspace.items.some((x) => x.url === res.item.url);
      if (exists) {
        setToast(`Este enlace ya está en Mis Lecturas.`);
      } else {
        updateWorkspace((prev) => ({
          ...prev,
          items: [res.item, ...prev.items]
        }));
        setToast(`Guardado en «${targetTopic}»: ${res.item.title}`);
      }
      setUrlInput('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTopicDraft.trim();
    if (!cleaned) return;
    if (!workspace.topics.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      updateWorkspace((prev) => ({
        ...prev,
        topics: [...prev.topics, cleaned]
      }));
    }
    setSelectedTopic(cleaned);
    setSaveTopic(cleaned);
    setNewTopicDraft('');
    setIsCreatingTopic(false);
    setToast(`Tema «${cleaned}» creado.`);
  };

  const handleToggleRead = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, read: !it.read } : it))
    }));
  };

  const handleToggleFav = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, favorite: !it.favorite } : it))
    }));
  };

  const handleDeleteItem = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id)
    }));
  };

  const handleSendToMiSenal = (item: LecturaItem) => {
    const signalId = activeSignal?.id || 'justicia-social-signal-1';
    addSignalNewsSource(signalId, {
      title: item.title,
      sourceName: item.sourceName,
      articleUrl: item.url,
      summary: item.description || undefined
    });
    setToast(`Sumado a «${activeSignal?.name || 'Mi Señal'}» (Radio, Música y Noticias).`);
  };

  const handleShareItem = async (item: LecturaItem) => {
    await shareContentUniversal({
      title: item.title,
      text: `${item.title} (${item.sourceName}) · YOUAPP Lecturas`,
      url: item.url
    });
  };

  const savedUrlSet = useMemo(() => new Set(workspace.items.map((it) => it.url)), [workspace.items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspace.items.filter((it) => {
      if (selectedTopic !== 'Todas' && selectedTopic !== 'Portales' && it.topic !== selectedTopic) return false;
      if (statusFilter === 'unread' && it.read) return false;
      if (statusFilter === 'read' && !it.read) return false;
      if (statusFilter === 'favorites' && !it.favorite) return false;
      if (q) {
        const hay = `${it.title} ${it.description} ${it.sourceName} ${it.domain} ${it.topic}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [workspace.items, selectedTopic, statusFilter, searchQuery]);

  const visiblePortalGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return portalGroups
      .filter((g) => selectedPortalId === 'all' || g.portalId === selectedPortalId)
      .map((g) => ({
        ...g,
        items: q
          ? g.items.filter((it) =>
              `${it.title} ${it.description} ${it.sourceName}`.toLowerCase().includes(q)
            )
          : g.items
      }))
      .filter((g) => g.items.length > 0);
  }, [portalGroups, selectedPortalId, searchQuery]);

  const ambientThumb =
    visiblePortalGroups.flatMap((g) => g.items).find((i) => i.thumbnailUrl)?.thumbnailUrl ||
    filteredItems.find((i) => i.thumbnailUrl)?.thumbnailUrl ||
    '';
  const unreadCount = workspace.items.filter((i) => !i.read).length;

  return (
    <div className="yl-page">
      <div
        className="yl-ambient-bg"
        aria-hidden="true"
        style={ambientThumb ? { backgroundImage: `url(${ambientThumb})` } : undefined}
      />
      <div className="yl-ambient-veil" aria-hidden="true" />

      <header className="yl-header">
        <div className="yl-header-left">
          <button type="button" className="yl-logo-btn" onClick={() => navigate('/misenal1')}>
            <YouAppOfficialLogo theme="dark" />
          </button>
          <span className="yl-pill-brand">LECTURAS</span>
        </div>

        <nav className="yl-nav">
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/misenal1')}>
            MI SEÑAL
          </button>
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/mitv')}>
            MITV
          </button>
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/reels')}>
            REELS
          </button>
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/dial')}>
            YOU DIAL
          </button>
          <button type="button" className="yl-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button
            type="button"
            className="yl-nav-btn"
            onClick={() => navigate('/search')}
            title="Buscar en YOUAPP"
            aria-label="Buscar"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px' }}
          >
            <Search size={16} />
          </button>
        </nav>

        <TvUserSessionMenu variant="glass" />
      </header>

      <main className="yl-main">
        {toast && (
          <div className="yl-toast" role="status">
            <Check size={14} />
            <span>{toast}</span>
          </div>
        )}

        {/* 1. BARRA SUTIL DESPLEGABLE ARRIBA (Mis Lecturas · Guardar URL · ATLAS Compara · Buscar) */}
        <section className={`yl-tools-collapsible ${isToolsOpen ? 'is-open' : ''}`} aria-label="Herramientas de Lecturas">
          <button
            type="button"
            className="yl-tools-toggle"
            onClick={() => setIsToolsOpen((v) => !v)}
            aria-expanded={isToolsOpen}
          >
            <span className="yl-tools-toggle-left">
              <BookOpen size={13} color="#64d2ff" />
              <strong>Mis Lecturas</strong>
              <span className="yl-tools-toggle-sub">
                · {workspace.items.length} guardadas · Pegar URL · ATLAS Compara
              </span>
            </span>
            <ChevronDown
              size={15}
              style={{
                transition: 'transform 0.18s ease',
                transform: isToolsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                opacity: 0.78
              }}
            />
          </button>

          {isToolsOpen && (
            <div className="yl-tools-panel">
              <div className="yl-tools-top-actions">
                <button
                  type="button"
                  className="yl-compara-hero-btn"
                  onClick={() => {
                    setCompareOpen(true);
                    setCompareError(null);
                  }}
                  title="ATLAS COMPARA: comparar cómo informan 10 medios distintos sobre el mismo acontecimiento"
                >
                  <Scale size={14} />
                  <span>ATLAS COMPARA</span>
                </button>
                <div className="yl-stats-pill">
                  <strong>{workspace.items.length}</strong> guardados · <strong>{unreadCount}</strong> pendientes
                </div>
              </div>

              <form className="yl-add-form" onSubmit={handleAddUrl}>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="+ Pegá el enlace de cualquier artículo, diario, blog o investigación…"
                  aria-label="Pegar enlace del artículo"
                />
                <select
                  value={selectedTopic === 'Todas' || selectedTopic === 'Portales' ? saveTopic : selectedTopic}
                  onChange={(e) => {
                    setSaveTopic(e.target.value);
                    if (selectedTopic !== 'Todas' && selectedTopic !== 'Portales') setSelectedTopic(e.target.value);
                  }}
                  aria-label="Tema del artículo"
                  className="yl-topic-select"
                >
                  {workspace.topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button type="submit" className="yl-btn-primary" disabled={isAdding || !urlInput.trim()}>
                  <Plus size={14} />
                  <span>{isAdding ? 'Leyendo…' : 'Guardar'}</span>
                </button>
                <a
                  ref={bookmarkletRef}
                  href="#lecturas-bookmarklet"
                  className="yl-bookmarklet"
                  draggable
                  onClick={(e) => {
                    e.preventDefault();
                    setToast(
                      'Arrastrá «+ Lecturas» a tu barra de marcadores. Después, en cualquier diario o artículo, hacé clic ahí para guardarlo en 1 clic.'
                    );
                  }}
                  title="Arrastrá a tu barra de marcadores para guardar cualquier página web en 1 clic"
                >
                  <Plus size={12} /> Lecturas
                </a>
              </form>
              {errorMsg && <div className="yl-error">{errorMsg}</div>}

              <div className="yl-subfilters">
                <div className="yl-status-pills">
                  {(
                    [
                      ['all', 'Todas'],
                      ['unread', 'Pendientes'],
                      ['read', 'Leídas'],
                      ['favorites', 'Favoritas']
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`yl-status-btn ${statusFilter === key ? 'active' : ''}`}
                      onClick={() => setStatusFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="yl-search-wrap">
                  <Search size={13} color="rgba(245,245,247,0.58)" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar por título o medio…"
                    aria-label="Buscar en Mis Lecturas"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2. CARRUSELES HORIZONTALES DE 1 FILA (Portales en vivo + Temas) */}
        <section className="yl-carousels-stack">
          <div className="yl-quick-portals" aria-label="Portales de noticias rápidos">
            <button
              type="button"
              className={`yl-portal-chip ${selectedTopic === 'Portales' && selectedPortalId === 'all' ? 'active' : ''}`}
              onClick={() => {
                setSelectedTopic('Portales');
                setSelectedPortalId('all');
              }}
            >
              Todos (3 c/u)
            </button>
            {PORTAL_FEED_DEFS.map((portal) => (
              <button
                key={portal.id}
                type="button"
                className={`yl-portal-chip ${selectedTopic === 'Portales' && selectedPortalId === portal.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTopic('Portales');
                  setSelectedPortalId(portal.id);
                }}
              >
                {portal.name}
              </button>
            ))}
            <button
              type="button"
              className="yl-portal-chip yl-portal-refresh"
              onClick={() => void handleRefreshPortals()}
              disabled={portalsLoading}
              title="Actualizar las 3 últimas notas de cada portal"
              aria-label="Actualizar portales"
            >
              <RefreshCw size={12} className={portalsLoading ? 'yl-spin' : ''} />
            </button>
          </div>

          <div className="yl-topics-row" role="tablist" aria-label="Temas de lectura">
            <button
              type="button"
              role="tab"
              aria-selected={selectedTopic === 'Portales'}
              className={`yl-topic-chip ${selectedTopic === 'Portales' ? 'active' : ''}`}
              onClick={() => setSelectedTopic('Portales')}
            >
              Últimas por portal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedTopic === 'Todas'}
              className={`yl-topic-chip ${selectedTopic === 'Todas' ? 'active' : ''}`}
              onClick={() => setSelectedTopic('Todas')}
            >
              Mis Guardadas ({workspace.items.length})
            </button>
            {workspace.topics.map((t) => {
              const cnt = workspace.items.filter((i) => i.topic === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={selectedTopic === t}
                  className={`yl-topic-chip ${selectedTopic === t ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTopic(t);
                    setSaveTopic(t);
                  }}
                >
                  {t} {cnt > 0 ? `(${cnt})` : ''}
                </button>
              );
            })}
            {isCreatingTopic ? (
              <form className="yl-new-topic-form" onSubmit={handleCreateTopic}>
                <input
                  type="text"
                  value={newTopicDraft}
                  onChange={(e) => setNewTopicDraft(e.target.value)}
                  placeholder="Ej. IA, Política, Recetas…"
                  autoFocus
                />
                <button type="submit" className="yl-mini-ok" aria-label="Crear tema">
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  className="yl-mini-x"
                  onClick={() => setIsCreatingTopic(false)}
                  aria-label="Cancelar"
                >
                  <X size={12} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="yl-topic-chip add"
                onClick={() => setIsCreatingTopic(true)}
              >
                <Plus size={12} /> Tema
              </button>
            )}
          </div>
        </section>

        {/* 3. VISTA POR DEFECTO: 3 ÚLTIMAS NOTAS DE CADA PORTAL | O BIBLIOTECA GUARDADA */}
        {selectedTopic === 'Portales' ? (
          portalsLoading && visiblePortalGroups.length === 0 ? (
            <section className="yl-card yl-empty">
              <RefreshCw size={28} color="#64d2ff" className="yl-spin" />
              <strong>Cargando las 3 últimas notas de cada portal…</strong>
              <span>Infobae · Clarín · La Nación · TN · BBC Mundo · El País</span>
            </section>
          ) : visiblePortalGroups.length === 0 ? (
            <section className="yl-card yl-empty">
              <BookOpen size={30} color="#64d2ff" />
              <strong>No se encontraron titulares en este momento.</strong>
              <button
                type="button"
                className="yl-btn-primary"
                onClick={() => void handleRefreshPortals()}
              >
                <RefreshCw size={13} />
                <span>Reintentar</span>
              </button>
            </section>
          ) : (
            <div className="yl-portals-feed">
              {visiblePortalGroups.map((group) => (
                <section key={group.portalId} className="yl-portal-section" aria-label={group.portalName}>
                  <div className="yl-portal-section-head">
                    <div className="yl-portal-section-title">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(group.domain)}&sz=64`}
                        alt=""
                        className="yl-favicon"
                      />
                      <h2>{group.portalName}</h2>
                      <span className="yl-portal-count">{group.items.length} últimas</span>
                    </div>
                    <button
                      type="button"
                      className="yl-portal-home-btn"
                      onClick={() =>
                        setActiveReaderItem({
                          id: `quick-${group.domain}`,
                          url: group.homeUrl,
                          domain: group.domain,
                          title: `${group.portalName} — Portada en vivo`,
                          description: `Portada completa de ${group.portalName}`,
                          sourceName: group.portalName,
                          thumbnailUrl: '',
                          faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(group.domain)}&sz=64`,
                          publishedAt: null,
                          topic: 'Actualidad',
                          read: false,
                          favorite: false,
                          embeddable: false,
                          addedAt: new Date().toISOString()
                        })
                      }
                    >
                      <span>Portada</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>

                  <div className="yl-grid yl-portal-grid">
                    {group.items.map((item) => {
                      const dateLabel = formatShortDate(item.publishedAt || item.addedAt);
                      const isSaved = savedUrlSet.has(item.url);
                      return (
                        <article key={item.id} className="yl-article-card">
                          <button
                            type="button"
                            className="yl-cover-link"
                            onClick={() => setActiveReaderItem(item)}
                            aria-label={`Leer ${item.title}`}
                          >
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="yl-cover-fallback">
                                <img src={item.faviconUrl} alt="" className="yl-fallback-fav" />
                                <span>{item.sourceName}</span>
                              </div>
                            )}
                          </button>

                          <div className="yl-article-body">
                            <div className="yl-source-line">
                              <img src={item.faviconUrl} alt="" className="yl-favicon" />
                              <span className="yl-source-name">{item.sourceName}</span>
                              {dateLabel && (
                                <>
                                  <span>·</span>
                                  <span>{dateLabel}</span>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              className="yl-article-title"
                              onClick={() => setActiveReaderItem(item)}
                            >
                              {item.title}
                            </button>

                            {item.description && <p className="yl-article-desc">{item.description}</p>}

                            <div className="yl-article-actions">
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="yl-read-original-btn"
                                  onClick={() => setActiveReaderItem(item)}
                                >
                                  <BookOpen size={12} />
                                  <span>Leer</span>
                                </button>
                                <button
                                  type="button"
                                  className="yl-compare-pill-btn"
                                  onClick={() =>
                                    void runAtlasCompare({
                                      title: item.title,
                                      description: item.description,
                                      url: item.url,
                                      sourceName: item.sourceName
                                    })
                                  }
                                  title="Comparar cómo cubren este mismo acontecimiento 10 diarios"
                                >
                                  <Scale size={12} />
                                  <span>Comparar</span>
                                </button>
                              </div>

                              <div className="yl-icon-actions">
                                <button
                                  type="button"
                                  className={`yl-ico-btn ${isSaved ? 'active-green' : ''}`}
                                  onClick={() => handleSavePortalItem(item)}
                                  title={isSaved ? 'Guardada en Mis Lecturas' : 'Guardar en Mis Lecturas'}
                                >
                                  <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  className="yl-ico-btn"
                                  onClick={() => handleSendToMiSenal(item)}
                                  title="Enviar este artículo a Mi Señal"
                                >
                                  <Radio size={14} color="#64d2ff" />
                                </button>
                                <button
                                  type="button"
                                  className="yl-ico-btn"
                                  onClick={() => void handleShareItem(item)}
                                  title="Compartir nota"
                                >
                                  <Share2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : filteredItems.length === 0 ? (
          <section className="yl-card yl-empty">
            <BookOpen size={34} color="#64d2ff" />
            <strong>Tu biblioteca de lecturas está lista.</strong>
            <span>
              Pegá el enlace de cualquier diario, investigación o blog arriba, o arrastrá el botón{' '}
              <b>+ Lecturas</b> a tu barra de marcadores para guardar páginas en 1 clic.
            </span>
          </section>
        ) : (
          <section className="yl-grid" aria-label="Artículos guardados">
            {filteredItems.map((item) => {
              const dateLabel = formatShortDate(item.publishedAt || item.addedAt);
              return (
                <article key={item.id} className={`yl-article-card ${item.read ? 'is-read' : ''}`}>
                  <button
                    type="button"
                    className="yl-cover-link"
                    onClick={() => setActiveReaderItem(item)}
                    aria-label={`Abrir vista rápida de ${item.title}`}
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="yl-cover-fallback">
                        <img src={item.faviconUrl} alt="" className="yl-fallback-fav" />
                        <span>{item.sourceName}</span>
                      </div>
                    )}
                    <span className="yl-topic-badge">{item.topic}</span>
                  </button>

                  <div className="yl-article-body">
                    <div className="yl-source-line">
                      <img src={item.faviconUrl} alt="" className="yl-favicon" />
                      <span className="yl-source-name">{item.sourceName}</span>
                      {dateLabel && (
                        <>
                          <span>·</span>
                          <span>{dateLabel}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="yl-article-title"
                      onClick={() => setActiveReaderItem(item)}
                    >
                      {item.title}
                    </button>

                    {item.description && <p className="yl-article-desc">{item.description}</p>}

                    <div className="yl-article-actions">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="yl-read-original-btn"
                          onClick={() => setActiveReaderItem(item)}
                        >
                          <BookOpen size={12} />
                          <span>{item.embeddable ? 'Leer aquí' : 'Vista rápida'}</span>
                        </button>
                        <button
                          type="button"
                          className="yl-compare-pill-btn"
                          onClick={() =>
                            void runAtlasCompare({
                              title: item.title,
                              description: item.description,
                              url: item.url,
                              sourceName: item.sourceName
                            })
                          }
                          title="Comparar cómo cubren este mismo acontecimiento 10 diarios"
                        >
                          <Scale size={12} />
                          <span>Comparar</span>
                        </button>
                      </div>

                      <div className="yl-icon-actions">
                        <button
                          type="button"
                          className={`yl-ico-btn ${item.read ? 'active-green' : ''}`}
                          onClick={() => handleToggleRead(item.id)}
                          title={item.read ? 'Marcar como pendiente' : 'Marcar como leída'}
                        >
                          {item.read ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                        <button
                          type="button"
                          className={`yl-ico-btn ${item.favorite ? 'active-fav' : ''}`}
                          onClick={() => handleToggleFav(item.id)}
                          title={item.favorite ? 'Quitar de favoritas' : 'Marcar favorita'}
                        >
                          <Heart size={14} fill={item.favorite ? '#ff375f' : 'none'} />
                        </button>
                        <button
                          type="button"
                          className="yl-ico-btn"
                          onClick={() => handleSendToMiSenal(item)}
                          title="Enviar este artículo a Mi Señal"
                        >
                          <Radio size={14} color="#64d2ff" />
                        </button>
                        <button
                          type="button"
                          className="yl-ico-btn"
                          onClick={() => void handleShareItem(item)}
                          title="Compartir enlace original"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="yl-ico-btn danger"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Quitar de Mis Lecturas"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* VISOR INTEGRADO INTELIGENTE (iframe en vivo si el sitio lo permite; ficha editorial + original si bloquea X-Frame-Options) */}
      {activeReaderItem && (
        <div
          className="yl-reader-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={activeReaderItem.title}
          onClick={() => setActiveReaderItem(null)}
        >
          <div
            className={`yl-reader-modal ${activeReaderItem.embeddable ? 'is-embed' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="yl-reader-head">
              <div className="yl-reader-source">
                <img src={activeReaderItem.faviconUrl} alt="" className="yl-favicon" />
                <strong>{activeReaderItem.sourceName}</strong>
                <span className="yl-reader-topic">{activeReaderItem.topic}</span>
              </div>
              <div className="yl-reader-head-actions">
                {activeReaderItem.embeddable && (
                  <button
                    type="button"
                    className="yl-reader-pill"
                    onClick={() => setForceReaderMode((v) => !v)}
                  >
                    <BookOpen size={13} color="#64d2ff" />
                    <span>{forceReaderMode ? 'Vista web' : 'Modo lectura'}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="yl-reader-pill"
                  onClick={() => handleSendToMiSenal(activeReaderItem)}
                >
                  <Radio size={13} color="#64d2ff" />
                  <span>Mi Señal</span>
                </button>
                <a
                  href={activeReaderItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="yl-reader-pill primary"
                >
                  <span>Abrir original</span>
                  <ExternalLink size={13} />
                </a>
                <button
                  type="button"
                  className="yl-reader-close"
                  onClick={() => setActiveReaderItem(null)}
                  aria-label="Cerrar visor"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {activeReaderItem.embeddable && !forceReaderMode ? (
              <div className="yl-reader-iframe-wrap">
                <iframe
                  title={activeReaderItem.title}
                  src={activeReaderItem.url}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            ) : (
              <>
                <div className="yl-reader-progress-track" aria-hidden="true">
                  <div className="yl-reader-progress-fill" style={{ width: `${readerProgress}%` }} />
                </div>
                <div className="yl-reader-controls-bar">
                  <div className="yl-reader-ctrl-group">
                    <button
                      type="button"
                      className="yl-reader-ctrl-btn"
                      onClick={() => setReaderFontSize((s) => Math.max(14, s - 1))}
                      title="Achicar letra"
                    >
                      A−
                    </button>
                    <button
                      type="button"
                      className="yl-reader-ctrl-btn"
                      onClick={() => setReaderFontSize((s) => Math.min(23, s + 1))}
                      title="Agrandar letra"
                    >
                      A+
                    </button>
                  </div>

                  <div className="yl-reader-ctrl-group">
                    <button
                      type="button"
                      className={`yl-reader-ctrl-btn ${readerTheme === 'paper' ? 'active' : ''}`}
                      onClick={() => setReaderTheme('paper')}
                    >
                      ☀️ Papel
                    </button>
                    <button
                      type="button"
                      className={`yl-reader-ctrl-btn ${readerTheme === 'sepia' ? 'active' : ''}`}
                      onClick={() => setReaderTheme('sepia')}
                    >
                      Sepia
                    </button>
                    <button
                      type="button"
                      className={`yl-reader-ctrl-btn ${readerTheme === 'night' ? 'active' : ''}`}
                      onClick={() => setReaderTheme('night')}
                    >
                      🌙 Noche
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`yl-reader-ctrl-btn yl-reader-speak-btn ${isSpeaking ? 'active' : ''}`}
                    onClick={handleToggleSpeakArticle}
                    title={isSpeaking ? 'Detener lectura en voz alta' : 'Escuchar nota en voz alta'}
                  >
                    {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    <span>{isSpeaking ? 'Detener' : 'Escuchar'}</span>
                  </button>
                </div>

                <div
                  className={`yl-reader-sheet yl-theme-${readerTheme}`}
                  style={{ ['--yl-reader-fs' as any]: `${readerFontSize}px` }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const max = el.scrollHeight - el.clientHeight;
                    setReaderProgress(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0);
                  }}
                >
                  {activeReaderItem.thumbnailUrl && (
                    <div className="yl-reader-hero-img">
                      <img src={activeReaderItem.thumbnailUrl} alt={activeReaderItem.title} referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <h2>{readerContent?.title || activeReaderItem.title}</h2>
                  {activeReaderItem.description && (
                    <p className="yl-reader-excerpt">{activeReaderItem.description}</p>
                  )}

                  {readerLoading ? (
                    <div className="yl-reader-loading">
                      Cargando modo lectura de <strong>{activeReaderItem.sourceName}</strong>…
                    </div>
                  ) : readerContent && readerContent.paragraphs.length > 0 ? (
                    <div className="yl-reader-article-body">
                      {readerContent.paragraphs.map((p, idx) => (
                        <p key={`p-${idx}`}>{p}</p>
                      ))}
                    </div>
                  ) : null}

                  <div className="yl-reader-policy-note">
                    <span>
                      Fuente original: <strong>{activeReaderItem.sourceName}</strong>.
                    </span>
                    <a
                      href={activeReaderItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="yl-btn-primary"
                      style={{ textDecoration: 'none' }}
                    >
                      <span>Ver nota en {activeReaderItem.sourceName}</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL ATLAS COMPARA V1 (10 RSS públicos · Coincidencias · Enfoques · Fuentes) */}
      {compareOpen && (
        <div
          className="yl-reader-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="ATLAS COMPARA"
          onClick={() => setCompareOpen(false)}
        >
          <div className="yl-reader-modal yl-compara-modal" onClick={(e) => e.stopPropagation()}>
            <div className="yl-reader-head">
              <div className="yl-reader-source">
                <Scale size={16} color="#64d2ff" />
                <strong>ATLAS COMPARA</strong>
                <span className="yl-reader-topic">10 RSS Oficiales · US$ 0</span>
              </div>
              <button
                type="button"
                className="yl-reader-close"
                onClick={() => setCompareOpen(false)}
                aria-label="Cerrar ATLAS COMPARA"
              >
                <X size={16} />
              </button>
            </div>

            <div className="yl-compara-body">
              <form
                className="yl-compara-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAtlasCompare({ title: compareTopicInput });
                }}
              >
                <input
                  type="text"
                  value={compareTopicInput}
                  onChange={(e) => setCompareTopicInput(e.target.value)}
                  placeholder="Comparar cualquier acontecimiento actual (ej. inflación, dólar, Milei, Boca, FMI)…"
                />
                <button type="submit" className="yl-btn-primary" disabled={compareLoading}>
                  <Sparkles size={13} />
                  <span>{compareLoading ? 'Buscando…' : 'Comparar'}</span>
                </button>
              </form>

              {compareLoading && (
                <div className="yl-compara-loading">
                  Consultando 10 medios RSS en tiempo real y agrupando por protagonistas y hechos…
                </div>
              )}

              {compareError && <div className="yl-error">{compareError}</div>}

              {!compareLoading && compareResult && (
                <>
                  <div className="yl-compara-event-head">
                    <span className="yl-eyebrow">ACONTECIMIENTO ANALIZADO</span>
                    <h3>{compareResult.queryTitle}</h3>
                    <div className="yl-compara-stats">
                      <span>
                        <strong>{compareResult.matchedCount}</strong>{' '}
                        {compareResult.matchedCount === 1 ? 'otra cobertura encontrada' : 'otras coberturas encontradas'}
                      </span>
                      <span>·</span>
                      <span>
                        {compareResult.sourcesChecked}/{compareResult.totalRssFeeds} feeds RSS activos
                      </span>
                      {compareResult.querySource && (
                        <>
                          <span>·</span>
                          <span>Base: {compareResult.querySource}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="yl-compara-tabs" role="tablist">
                    {(
                      [
                        ['coincidencias', 'Coincidencias'],
                        ['enfoques', 'Enfoques y Diferencias'],
                        ['fuentes', `Fuentes (${compareResult.matchedCount})`]
                      ] as const
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={compareTab === k}
                        className={`yl-compara-tab ${compareTab === k ? 'active' : ''}`}
                        onClick={() => setCompareTab(k)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {compareResult.matchedCount === 0 ? (
                    <div className="yl-compara-empty">
                      No se encontraron otras coberturas coincidentes en los últimos titulares de los {compareResult.sourcesChecked} feeds RSS consultados. Probá con un tema más reciente o buscá por protagonista arriba.
                    </div>
                  ) : (
                    <>
                      {compareTab === 'coincidencias' && (
                        <div className="yl-compara-panel">
                          <div className="yl-compara-box">
                            <strong>Protagonistas y conceptos compartidos entre fuentes</strong>
                            <div className="yl-compara-chips">
                              {compareResult.sharedConcepts.map((c) => (
                                <span key={c} className="yl-compara-chip">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="yl-compara-list">
                            {compareResult.matches.map((m) => (
                              <div key={m.url} className="yl-compara-row">
                                <div className="yl-compara-row-top">
                                  <span className="yl-compara-outlet">{m.outletName}</span>
                                  <span className="yl-compara-score">
                                    Coincidencia {m.matchScore} · {m.sharedSignals.slice(0, 3).join(', ')}
                                  </span>
                                </div>
                                <a href={m.url} target="_blank" rel="noopener noreferrer">
                                  {m.title}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {compareTab === 'enfoques' && (
                        <div className="yl-compara-list">
                          {compareResult.matches.map((m) => (
                            <div key={m.url} className="yl-compara-row">
                              <div className="yl-compara-row-top">
                                <span className="yl-compara-outlet">{m.outletName}</span>
                                {m.figuresMentioned.length > 0 && (
                                  <span className="yl-compara-score">
                                    Cifras: {m.figuresMentioned.join(' · ')}
                                  </span>
                                )}
                              </div>
                              <a href={m.url} target="_blank" rel="noopener noreferrer">
                                {m.title}
                              </a>
                              {m.description && <p className="yl-compara-desc">{m.description}</p>}
                              {m.uniqueFocusTerms.length > 0 && (
                                <div className="yl-compara-focus">
                                  Enfoque propio del titular: {m.uniqueFocusTerms.join(' · ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {compareTab === 'fuentes' && (
                        <div className="yl-compara-list">
                          {compareResult.matches.map((m) => (
                            <div key={m.url} className="yl-compara-row">
                              <div className="yl-compara-row-top">
                                <span className="yl-compara-outlet">{m.outletName}</span>
                                <span className="yl-compara-score">
                                  {formatShortDate(m.publishedAt) || m.domain}
                                </span>
                              </div>
                              <a href={m.url} target="_blank" rel="noopener noreferrer">
                                {m.title}
                              </a>
                              <div className="yl-compara-row-actions">
                                <a
                                  href={m.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="yl-read-original-btn"
                                >
                                  <span>Leer original</span>
                                  <ExternalLink size={12} />
                                </a>
                                <button
                                  type="button"
                                  className="yl-compare-pill-btn"
                                  onClick={() => handleSendComparedToMiSenal(m)}
                                >
                                  <Radio size={12} />
                                  <span>Sumar a Mi Señal</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <p className="yl-compara-note">{compareResult.methodologyNote}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .yl-page {
          position: relative;
          min-height: 100dvh;
          background: #14161a;
          color: #f5f5f7;
          font-family: var(--you-font-sans, 'Geist', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          padding-bottom: 56px;
          overflow-x: clip;
          isolation: isolate;
        }
        .yl-ambient-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background-color: #1a1d24;
          background-image:
            radial-gradient(ellipse 46% 48% at 22% 20%, rgba(100, 210, 255, 0.34) 0%, transparent 62%),
            radial-gradient(ellipse 48% 46% at 78% 36%, rgba(88, 128, 214, 0.38) 0%, transparent 64%),
            radial-gradient(ellipse 52% 44% at 50% 90%, rgba(148, 163, 184, 0.30) 0%, transparent 66%),
            linear-gradient(155deg, #141820 0%, #1f2634 48%, #14171e 100%);
          background-size: cover;
          background-position: center;
          filter: blur(22px) brightness(0.72);
          transform: scale(1.06) translateZ(0);
          contain: strict;
          pointer-events: none;
        }
        .yl-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: linear-gradient(
            180deg,
            rgba(16, 18, 24, 0.42) 0%,
            rgba(20, 22, 28, 0.30) 48%,
            rgba(12, 14, 18, 0.54) 100%
          );
          pointer-events: none;
        }
        .yl-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 22px;
          background: rgba(24, 26, 30, 0.44);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .yl-header-left, .yl-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .yl-logo-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
        }
        .yl-pill-brand {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #64d2ff;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.28);
          padding: 3px 10px;
          border-radius: 999px;
        }
        .yl-nav-btn {
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.8);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 11px;
          border-radius: 999px;
          cursor: pointer;
        }
        .yl-nav-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .yl-main {
          position: relative;
          z-index: 1;
          max-width: 1120px;
          margin: 0 auto;
          padding: 22px 18px 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .yl-toast {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(28, 28, 30, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 600;
          align-self: flex-start;
        }
        .yl-card {
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.09) 100%
          );
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 22px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            0 12px 32px rgba(0, 0, 0, 0.26);
        }
        .yl-hero-card {
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .yl-hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .yl-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.07em;
          color: #64d2ff;
        }
        .yl-hero-top h1 {
          margin: 4px 0 4px;
          font-size: 24px;
          font-weight: 760;
          letter-spacing: -0.025em;
          color: #ffffff;
        }
        .yl-hero-top p {
          margin: 0;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.76);
          max-width: 620px;
        }
        .yl-stats-pill {
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.18);
          font-size: 12px;
          color: rgba(245, 245, 247, 0.82);
          white-space: nowrap;
        }
        .yl-stats-pill strong {
          color: #ffffff;
        }
        .yl-add-form {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 6px 8px;
          border-radius: 18px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .yl-add-form input {
          flex: 1 1 240px;
          min-width: 0;
          padding: 7px 12px;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 13.5px;
          outline: none;
        }
        .yl-add-form input::placeholder {
          color: rgba(245, 245, 247, 0.55);
        }
        .yl-topic-select {
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(24, 28, 36, 0.9);
          color: #f5f5f7;
          font-size: 12px;
          font-weight: 600;
          outline: none;
        }
        .yl-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 8px 16px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .yl-btn-primary:hover:not(:disabled) {
          background: #0a84ff;
        }
        .yl-btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .yl-bookmarklet {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.26);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          cursor: grab;
          white-space: nowrap;
        }
        .yl-error {
          padding: 8px 12px;
          border-radius: 12px;
          background: rgba(255, 69, 58, 0.22);
          border: 1px solid rgba(255, 69, 58, 0.45);
          color: #ffd3d0;
          font-size: 12.5px;
          font-weight: 600;
        }
        .yl-filters-bar {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yl-topics-row {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .yl-topic-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.85);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .yl-topic-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yl-topic-chip.add {
          border-style: dashed;
          color: #64d2ff;
        }
        .yl-new-topic-form {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 6px;
          border-radius: 999px;
          background: rgba(20, 22, 28, 0.88);
          border: 1px solid rgba(100, 210, 255, 0.45);
        }
        .yl-new-topic-form input {
          width: 130px;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 12px;
          padding: 3px 6px;
          outline: none;
        }
        .yl-mini-ok, .yl-mini-x {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .yl-mini-ok { background: #0071e3; color: #ffffff; }
        .yl-mini-x { background: rgba(255, 255, 255, 0.14); color: #ffffff; }
        .yl-subfilters {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .yl-status-pills {
          display: inline-flex;
          gap: 4px;
          padding: 3px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .yl-status-btn {
          padding: 5px 12px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.74);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .yl-status-btn.active {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }
        .yl-search-wrap {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.16);
          min-width: 220px;
        }
        .yl-search-wrap input {
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 12.5px;
          outline: none;
          width: 100%;
        }
        .yl-empty {
          padding: 42px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .yl-empty strong {
          font-size: 16px;
          color: #ffffff;
        }
        .yl-empty span {
          font-size: 13px;
          color: rgba(245, 245, 247, 0.74);
          max-width: 480px;
          line-height: 1.45;
        }
        .yl-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 16px;
        }
        .yl-article-card {
          border-radius: 20px;
          overflow: hidden;
          background: rgba(22, 26, 34, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.16);
          display: flex;
          flex-direction: column;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .yl-article-card:hover {
          transform: translateY(-2px);
          border-color: rgba(100, 210, 255, 0.45);
        }
        .yl-article-card.is-read {
          opacity: 0.74;
        }
        .yl-cover-link {
          position: relative;
          aspect-ratio: 16 / 9;
          background: linear-gradient(135deg, #1b2434 0%, #0f131a 100%);
          overflow: hidden;
          display: block;
          text-decoration: none;
        }
        .yl-cover-link img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .yl-cover-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: rgba(245, 245, 247, 0.8);
          font-size: 13px;
          font-weight: 700;
        }
        .yl-fallback-fav {
          width: 34px !important;
          height: 34px !important;
          border-radius: 8px;
          object-fit: contain !important;
        }
        .yl-topic-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(16, 18, 24, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #64d2ff;
          font-size: 10.5px;
          font-weight: 700;
        }
        .yl-article-body {
          padding: 14px 16px 15px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }
        .yl-source-line {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
        }
        .yl-favicon {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          object-fit: contain;
        }
        .yl-source-name {
          font-weight: 650;
          color: #64d2ff;
        }
        .yl-article-title {
          font-size: 15.5px;
          font-weight: 700;
          line-height: 1.3;
          color: #ffffff;
          text-decoration: none;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .yl-article-title:hover {
          color: #64d2ff;
        }
        .yl-article-desc {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.45;
          color: rgba(245, 245, 247, 0.74);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .yl-article-actions {
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .yl-read-original-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.24);
          border: 1px solid rgba(100, 210, 255, 0.44);
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          text-decoration: none;
        }
        .yl-read-original-btn:hover {
          background: #0071e3;
        }
        .yl-icon-actions {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .yl-ico-btn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .yl-ico-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
        .yl-ico-btn.active-green { color: #30d158; }
        .yl-ico-btn.active-fav { color: #ff375f; }
        .yl-ico-btn.danger:hover { color: #ff6961; }
        @media (max-width: 680px) {
          .yl-nav { display: none; }
          .yl-search-wrap { width: 100%; }
        }

        /* --- Visor integrado inteligente Apple Glass --- */
        .yl-cover-link {
          width: 100%;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
        }
        .yl-article-title {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }
        .yl-read-original-btn {
          cursor: pointer;
        }
        .yl-reader-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(10, 12, 16, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }
        .yl-reader-modal {
          width: 100%;
          max-width: 720px;
          max-height: 92dvh;
          border-radius: 22px;
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.12);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #111827;
        }
        .yl-reader-modal.yl-compara-modal {
          background: rgba(20, 24, 32, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #f8fafc;
        }
        .yl-reader-modal.is-embed {
          max-width: 1060px;
          height: 88dvh;
        }
        .yl-reader-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
        }
        .yl-compara-modal .yl-reader-head {
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
        }
        .yl-reader-source {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #0f172a;
        }
        .yl-compara-modal .yl-reader-source {
          color: #ffffff;
        }
        .yl-reader-topic {
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          font-size: 10.5px;
          font-weight: 700;
        }
        .yl-reader-head-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .yl-reader-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #111827;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
        .yl-reader-pill.primary {
          background: #0071e3;
          border-color: #0071e3;
          color: #ffffff;
        }
        .yl-reader-close {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #111827;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .yl-compara-modal .yl-reader-close {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }
        .yl-reader-iframe-wrap {
          flex: 1;
          min-height: 0;
          background: #ffffff;
        }
        .yl-reader-iframe-wrap iframe {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
        .yl-reader-sheet {
          padding: 20px 22px 28px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: #ffffff;
        }
        .yl-reader-hero-img {
          width: 100%;
          max-height: 320px;
          border-radius: 16px;
          overflow: hidden;
          background: #f1f5f9;
        }
        .yl-reader-hero-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .yl-reader-sheet h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.25;
          color: #0f172a;
        }
        .yl-reader-excerpt {
          margin: 0;
          font-size: 15px;
          line-height: 1.58;
          color: #475569;
          font-weight: 500;
        }
        .yl-reader-loading {
          padding: 14px 16px;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          font-size: 13.5px;
        }
        .yl-reader-article-body {
          display: flex;
          flex-direction: column;
          gap: 15px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }
        .yl-reader-article-body p {
          margin: 0;
          font-size: 16px;
          line-height: 1.75;
          color: #1f2937;
          letter-spacing: -0.005em;
        }
        .yl-reader-policy-note {
          padding: 14px 16px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          font-size: 12.5px;
          color: #475569;
        }

        /* --- ATLAS COMPARA V1 --- */
        .yl-compara-hero-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.55);
          background: rgba(10, 132, 255, 0.28);
          color: #ffffff;
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.03em;
          cursor: pointer;
        }
        .yl-compara-hero-btn:hover {
          background: #0071e3;
        }
        .yl-compare-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.10);
          color: #d9f3ff;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .yl-compare-pill-btn:hover {
          background: rgba(10, 132, 255, 0.34);
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yl-compara-modal {
          max-width: 820px;
        }
        .yl-compara-body {
          padding: 16px 20px 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .yl-compara-search {
          display: flex;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.32);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .yl-compara-search input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
          padding: 6px 10px;
          outline: none;
        }
        .yl-compara-loading,
        .yl-compara-empty {
          padding: 20px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 13px;
          color: rgba(245, 245, 247, 0.8);
          text-align: center;
        }
        .yl-compara-event-head h3 {
          margin: 4px 0 6px;
          font-size: 18px;
          color: #ffffff;
          line-height: 1.3;
        }
        .yl-compara-stats {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.72);
        }
        .yl-compara-stats strong {
          color: #64d2ff;
        }
        .yl-compara-tabs {
          display: flex;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.34);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .yl-compara-tab {
          flex: 1;
          padding: 7px 12px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(245, 245, 247, 0.76);
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .yl-compara-tab.active {
          background: #0071e3;
          color: #ffffff;
        }
        .yl-compara-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .yl-compara-box {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(10, 132, 255, 0.14);
          border: 1px solid rgba(100, 210, 255, 0.32);
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 12.5px;
          color: #ffffff;
        }
        .yl-compara-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .yl-compara-chip {
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #d9f3ff;
          font-size: 11.5px;
          font-weight: 650;
        }
        .yl-compara-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yl-compara-row {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yl-compara-row-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .yl-compara-outlet {
          font-size: 11.5px;
          font-weight: 750;
          color: #64d2ff;
        }
        .yl-compara-score {
          font-size: 11px;
          color: rgba(245, 245, 247, 0.65);
        }
        .yl-compara-row > a {
          font-size: 14px;
          font-weight: 680;
          color: #ffffff;
          text-decoration: none;
          line-height: 1.32;
        }
        .yl-compara-row > a:hover {
          color: #64d2ff;
        }
        .yl-compara-desc {
          margin: 0;
          font-size: 12px;
          color: rgba(245, 245, 247, 0.74);
          line-height: 1.4;
        }
        .yl-compara-focus {
          font-size: 11.5px;
          color: #ffd180;
          font-weight: 600;
        }
        .yl-compara-row-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
          flex-wrap: wrap;
        }
        .yl-compara-note {
          margin: 0;
          font-size: 11px;
          color: rgba(245, 245, 247, 0.58);
          line-height: 1.4;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 10px;
        }
        .yl-quick-portals {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .yl-quick-portals-label {
          font-size: 11.5px;
          font-weight: 700;
          color: rgba(245, 245, 247, 0.65);
          margin-right: 2px;
        }
        .yl-portal-chip {
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.32);
          background: rgba(10, 132, 255, 0.14);
          color: #e6f4ff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .yl-portal-chip:hover {
          background: rgba(10, 132, 255, 0.3);
          border-color: rgba(100, 210, 255, 0.7);
          color: #ffffff;
        }
        /* --- REDISEÑO APPLE NEWS + POCKET PARA LECTURAS MÓVIL --- */
        .yl-tools-collapsible {
          border-radius: 14px;
          background: rgba(16, 20, 30, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          overflow: hidden;
        }
        .yl-tools-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 14px;
          background: transparent;
          border: 0;
          color: rgba(245, 245, 247, 0.92);
          font-size: 12.5px;
          cursor: pointer;
        }
        .yl-tools-toggle:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .yl-tools-toggle-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .yl-tools-toggle-sub {
          font-size: 11.5px;
          color: rgba(235, 240, 255, 0.56);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .yl-tools-panel {
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yl-tools-top-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .yl-carousels-stack {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yl-quick-portals,
        .yl-topics-row {
          display: flex;
          flex-wrap: nowrap !important;
          align-items: center;
          gap: 7px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
          margin-top: 0 !important;
          padding: 2px 0;
        }
        .yl-quick-portals::-webkit-scrollbar,
        .yl-topics-row::-webkit-scrollbar {
          display: none;
        }
        .yl-portal-chip,
        .yl-topic-chip {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .yl-reader-progress-track {
          width: 100%;
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .yl-reader-progress-fill {
          height: 100%;
          background: #0a84ff;
          transition: width 0.12s linear;
        }
        .yl-reader-controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          padding: 8px 14px;
          background: rgba(16, 20, 30, 0.94);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          flex-shrink: 0;
        }
        .yl-reader-ctrl-group {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .yl-reader-ctrl-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .yl-reader-ctrl-btn.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yl-reader-speak-btn.active {
          background: rgba(255, 55, 95, 0.25);
          border-color: rgba(255, 100, 130, 0.6);
          color: #ffd0da;
        }
        .yl-reader-sheet .yl-reader-article-body p {
          font-size: var(--yl-reader-fs, 17px) !important;
        }
        .yl-reader-sheet.yl-theme-sepia {
          background: #f8f1e3 !important;
          color: #2b2116 !important;
        }
        .yl-reader-sheet.yl-theme-sepia h2,
        .yl-reader-sheet.yl-theme-sepia .yl-reader-article-body p {
          color: #2b2116 !important;
        }
        .yl-reader-sheet.yl-theme-night {
          background: #111318 !important;
          color: #e6e8ee !important;
        }
        .yl-reader-sheet.yl-theme-night h2,
        .yl-reader-sheet.yl-theme-night .yl-reader-article-body p {
          color: #e6e8ee !important;
        }
        .yl-reader-sheet.yl-theme-night .yl-reader-excerpt {
          color: rgba(230, 232, 238, 0.72) !important;
        }
        .yl-portal-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .yl-portal-refresh {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 5px 9px;
        }
        @keyframes ylSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .yl-spin {
          animation: ylSpin 0.9s linear infinite;
        }
        .yl-portals-feed {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .yl-portal-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .yl-portal-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 2px 2px 0;
        }
        .yl-portal-section-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .yl-portal-section-title h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 760;
          letter-spacing: -0.015em;
          color: #ffffff;
        }
        .yl-portal-count {
          font-size: 11px;
          font-weight: 650;
          color: rgba(235, 240, 255, 0.56);
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .yl-portal-home-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: rgba(245, 245, 247, 0.85);
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .yl-portal-home-btn:hover {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.5);
          color: #ffffff;
        }
        .yl-portal-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        @media (max-width: 960px) {
          .yl-portal-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .yl-grid,
          .yl-portal-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          /* Tarjetas 2+ en formato revista móvil compacto: texto izquierda + foto cuadrada derecha */
          .yl-grid .yl-article-card:not(:first-child) {
            flex-direction: row-reverse !important;
            align-items: center;
            padding: 10px !important;
            gap: 10px;
          }
          .yl-grid .yl-article-card:not(:first-child) .yl-cover-link {
            width: 86px !important;
            height: 86px !important;
            aspect-ratio: 1 / 1 !important;
            border-radius: 12px !important;
            flex-shrink: 0;
          }
          .yl-grid .yl-article-card:not(:first-child) .yl-article-body {
            padding: 0 !important;
            min-width: 0;
          }
          .yl-grid .yl-article-card:not(:first-child) .yl-article-desc {
            display: none !important;
          }
          .yl-grid .yl-article-card:not(:first-child) .yl-article-title {
            font-size: 13.5px !important;
            -webkit-line-clamp: 2 !important;
          }
        }
      `}</style>
    </div>
  );
}
