import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Globe,
  Link2,
  Lock,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Tv,
  X
} from 'lucide-react';
import { CURATED_SIGNALS_PILOT, channelEntryToScheduleBlock } from '../lib/tv/curatedSignalsCatalog';
import { resolveKnownChannelAvatar } from '../lib/tv/channelIdentityCatalog';
import { resolveUrlToScheduleBlock } from '../components/tv/AddSignalContentModal';
import { persistSignal } from '../lib/tv/signalPersistence';
import { createCreatorChannelAndSignal } from '../lib/tv/associationsService';
import {
  saveSignalEventMeta,
  type SignalEventCategory
} from '../lib/tv/signalEventsStore';
import { useSignalStore } from '../lib/tv/signalStore';
import { useStore } from '../store/useStore';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { AtlasBuildSignalBox } from '../components/tv/AtlasBuildSignalBox';
import type { ScheduleBlock } from '../lib/tv/signalTypes';

const SIGNAL_BRANDING_KEY = 'youapp_signal_branding_v1';

interface SuggestedChannelCard {
  id: string;
  channelName: string;
  category: 'Actualidad' | 'Fútbol' | 'Historia' | 'Ciencia';
  originUrl: string;
  avatarUrl?: string;
  block: ScheduleBlock;
}

function compressImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function saveSignalBranding(signalId: string, avatarDataUrl?: string, coverDataUrl?: string) {
  if (!avatarDataUrl && !coverDataUrl) return;
  try {
    const raw = localStorage.getItem(SIGNAL_BRANDING_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[signalId] = {
      ...(avatarDataUrl ? { avatarDataUrl } : {}),
      ...(coverDataUrl ? { coverDataUrl } : {})
    };
    localStorage.setItem(SIGNAL_BRANDING_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export default function CreateSignal() {
  const navigate = useNavigate();
  const setSignal = useSignalStore((s) => s.setSignal);
  const setPersistStatus = useSignalStore((s) => s.setPersistStatus);
  const { savedAlgorithms, activeAlgorithmId } = useStore();
  const activeAlgo =
    savedAlgorithms?.find((a) => a.id === activeAlgorithmId) ||
    savedAlgorithms?.[0] || { name: 'Equilibrado' };

  const [signalName, setSignalName] = useState('');
  const [topicNote, setTopicNote] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [isEventSignal, setIsEventSignal] = useState(false);
  const [eventCategory, setEventCategory] = useState<SignalEventCategory>('Deporte');
  const [eventStartsAt, setEventStartsAt] = useState(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [eventEndsAt, setEventEndsAt] = useState(() => {
    const d = new Date(Date.now() + 6 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);

  const [activeCategory, setActiveCategory] = useState<'Todos' | 'Actualidad' | 'Fútbol' | 'Historia' | 'Ciencia'>('Todos');
  const [selectedBlocks, setSelectedBlocks] = useState<ScheduleBlock[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const suggestedChannels = useMemo<SuggestedChannelCard[]>(() => {
    const base: SuggestedChannelCard[] = [
      {
        id: 'sug-justicia-social',
        channelName: 'Justicia Social TV',
        category: 'Actualidad',
        originUrl: 'https://www.youtube.com/@justiciasocial-h7h',
        avatarUrl: resolveKnownChannelAvatar('Justicia Social TV'),
        block: {
          id: 'blk-sug-jstv',
          position: 0,
          startOffsetSec: 0,
          durationSec: 600,
          topic: 'Documental histórico · Justicia Social TV',
          role: 'opening',
          contentItem: {
            id: '0cjWa3Eizqw',
            providerId: '0cjWa3Eizqw',
            type: 'video',
            provider: 'youtube',
            title: '¿Qué es la Rerum Novarum? · La encíclica que defendió al trabajador',
            thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
            thumbnail: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=0cjWa3Eizqw',
            channelName: 'Justicia Social TV',
            channelTitle: 'Justicia Social TV',
            channelId: 'UCMir5GQGvJYqsUxPkbTbEhw',
            originUrl: 'https://www.youtube.com/@justiciasocial-h7h',
            isLive: false,
            isVerified: true
          } as any
        }
      },
      {
        id: 'sug-canal22',
        channelName: 'CANAL 22',
        category: 'Actualidad',
        originUrl: 'https://www.youtube.com/@CANAL22WEB',
        avatarUrl: resolveKnownChannelAvatar('CANAL 22'),
        block: {
          id: 'blk-sug-c22',
          position: 1,
          startOffsetSec: 600,
          durationSec: 1800,
          topic: 'Actualidad Política · CANAL 22 Oficial',
          role: 'explainer',
          contentItem: {
            id: 'tKfcRkuxG5s',
            providerId: 'tKfcRkuxG5s',
            type: 'video',
            provider: 'youtube',
            title: 'LA REVANCHA DEL UNO (19-11-26) · Santiago Cúneo Oficial',
            thumbnailUrl: 'https://i.ytimg.com/vi/tKfcRkuxG5s/hqdefault.jpg',
            thumbnail: 'https://i.ytimg.com/vi/tKfcRkuxG5s/hqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=tKfcRkuxG5s',
            channelName: 'CANAL 22',
            channelTitle: 'CANAL 22',
            channelId: 'UCiPqb8qbvCBjAFHc-KMujBw',
            originUrl: 'https://www.youtube.com/@CANAL22WEB',
            isLive: false,
            isVerified: true
          } as any
        }
      }
    ];

    const seenNames = new Set(base.map((c) => c.channelName.toLowerCase()));
    const slugToCat: Record<string, SuggestedChannelCard['category']> = {
      futbol: 'Fútbol',
      historia: 'Historia',
      ciencia: 'Ciencia'
    };

    for (const curated of CURATED_SIGNALS_PILOT) {
      const cat = slugToCat[curated.slug] || 'Historia';
      for (const ch of curated.channels) {
        const norm = ch.channelName.toLowerCase();
        if (seenNames.has(norm)) continue;
        seenNames.add(norm);
        base.push({
          id: `sug-${ch.id}`,
          channelName: ch.channelName,
          category: cat,
          originUrl: ch.originUrl,
          avatarUrl: resolveKnownChannelAvatar(ch.channelName),
          block: channelEntryToScheduleBlock(ch, base.length, base.length * 600)
        });
      }
    }
    return base;
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (activeCategory === 'Todos') return suggestedChannels;
    return suggestedChannels.filter((c) => c.category === activeCategory);
  }, [activeCategory, suggestedChannels]);

  const selectedVideoIds = useMemo(
    () => new Set(selectedBlocks.map((b) => b.contentItem.providerId || b.contentItem.id)),
    [selectedBlocks]
  );

  const toggleSuggestedChannel = (item: SuggestedChannelCard) => {
    const vid = item.block.contentItem.providerId || item.block.contentItem.id;
    setFeedback(null);
    if (selectedVideoIds.has(vid)) {
      setSelectedBlocks((prev) => prev.filter((b) => (b.contentItem.providerId || b.contentItem.id) !== vid));
    } else {
      setSelectedBlocks((prev) => [...prev, item.block]);
    }
  };

  const applyTopicPreset = (cat: 'Actualidad' | 'Fútbol' | 'Historia' | 'Ciencia') => {
    const matching = suggestedChannels.filter((c) => c.category === cat);
    setActiveCategory(cat);
    if (!signalName.trim()) {
      setSignalName(`Mi Señal de ${cat}`);
    }
    setSelectedBlocks((prev) => {
      const existing = new Set(prev.map((b) => b.contentItem.providerId || b.contentItem.id));
      const additions = matching
        .map((m) => m.block)
        .filter((b) => !existing.has(b.contentItem.providerId || b.contentItem.id));
      return [...prev, ...additions];
    });
    setFeedback(`Sumamos canales sugeridos de ${cat}. Podés quitar o agregar los que quieras.`);
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw || isAddingUrl) return;
    setIsAddingUrl(true);
    setFeedback(null);
    try {
      const { block, kind } = await resolveUrlToScheduleBlock(raw, selectedBlocks.length);
      const vid = block.contentItem.providerId || block.contentItem.id;
      if (selectedVideoIds.has(vid)) {
        setFeedback('Ese video o canal ya está en tu selección.');
      } else {
        setSelectedBlocks((prev) => [...prev, block]);
        setUrlInput('');
        setFeedback(`${kind === 'channel' ? 'Canal' : 'Video'} sumado: ${block.contentItem.title}`);
      }
    } catch {
      setFeedback('No pudimos leer ese enlace. Probá con un link de YouTube o @canal.');
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleUploadImage = async (kind: 'avatar' | 'cover', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImage(
        file,
        kind === 'avatar' ? 256 : 960,
        kind === 'avatar' ? 256 : 360
      );
      if (kind === 'avatar') setAvatarDataUrl(dataUrl);
      else setCoverDataUrl(dataUrl);
    } catch {
      setFeedback('No se pudo cargar esa imagen. Probá con JPG o PNG.');
    }
  };

  const handleCreateAndLaunch = () => {
    if (isCreating) return;
    const finalName = signalName.trim() || 'Mi Nueva Señal';
    const blocksToUse =
      selectedBlocks.length > 0
        ? selectedBlocks
        : suggestedChannels.slice(0, 3).map((s) => s.block);

    setIsCreating(true);
    const slugBase = finalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mi-senal';
    const newId = `signal-${slugBase}-${Date.now().toString(36)}`;

    let offset = 0;
    const normalizedSchedule: ScheduleBlock[] = blocksToUse.map((b, idx) => {
      const nextBlock: ScheduleBlock = {
        ...b,
        id: `${newId}-blk-${idx}`,
        position: idx,
        startOffsetSec: offset
      };
      offset += Math.max(60, b.durationSec || 600);
      return nextBlock;
    });

    const newSignal: any = {
      id: newId,
      name: finalName,
      seedVersion: 5,
      prompt: topicNote.trim() || `Señal personalizada · ${finalName}`,
      visibility,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule: normalizedSchedule
    };

    saveSignalBranding(newId, avatarDataUrl, coverDataUrl);
    if (isEventSignal) {
      saveSignalEventMeta({
        signalId: newId,
        category: eventCategory,
        startsAt: new Date(eventStartsAt).toISOString(),
        endsAt: new Date(eventEndsAt).toISOString()
      });
    }
    setSignal(newSignal);
    setPersistStatus('saving');
    persistSignal(newSignal)
      .then((ok) => setPersistStatus(ok ? 'saved' : 'failed'))
      .catch(() => setPersistStatus('failed'));

    // Publica automáticamente la nueva señal en el directorio de Repetidoras / ATLAS Red Viva
    if (visibility === 'public') {
      const firstBlk = normalizedSchedule[0];
      void createCreatorChannelAndSignal({
        channelName: finalName,
        signalName: finalName,
        category: activeCategory === 'Todos' ? 'Curaduría YOUAPP' : activeCategory,
        originPlatform: 'YOUAPP',
        originUrl: `https://youapp.tv/misenal1?signal=${encodeURIComponent(newId)}`,
        featuredVideoUrl: firstBlk?.contentItem?.videoUrl || undefined,
        featuredVideoTitle: firstBlk?.contentItem?.title || undefined,
        description: topicNote.trim() || `Señal curada en YOUAPP · ${finalName}`
      }).catch(() => {});
    }

    navigate(`/misenal1?signal=${encodeURIComponent(newId)}`);
  };

  return (
    <div className="cs-page">
      <div className="cs-shell">
        {/* Cabecera superior minimalista */}
        <header className="cs-header">
          <button
            type="button"
            className="cs-back-btn"
            onClick={() => navigate('/misenal1')}
          >
            <ArrowLeft size={14} />
            <span>Volver a Mi Señal</span>
          </button>

          <YouAppOfficialLogo theme="light" />

          <button
            type="button"
            className="cs-algo-btn"
            onClick={() => navigate('/my-algorithm')}
            title="Ver y editar Mi Algoritmo"
          >
            <SlidersHorizontal size={13} />
            <span>Mi algoritmo · <strong>{activeAlgo.name}</strong></span>
          </button>
        </header>

        <div className="cs-intro">
          <h1>Creá tu propia señal</h1>
          <p>Escribí un tema para que ATLAS la arme al instante, o personalizala paso a paso abajo.</p>
        </div>

        <AtlasBuildSignalBox />

        {/* PASO 1: IDENTIDAD DE LA SEÑAL CON VISTA PREVIA VIVA */}
        <section className="cs-card">
          <div className="cs-step-label">1 · Identidad de tu señal</div>

          <div className="cs-preview-box">
            <div
              className="cs-preview-cover"
              style={coverDataUrl ? { backgroundImage: `url(${coverDataUrl})` } : undefined}
            >
              <button
                type="button"
                className="cs-cover-btn"
                onClick={() => coverInputRef.current?.click()}
              >
                <Camera size={12} />
                <span>{coverDataUrl ? 'Cambiar portada' : 'Subir portada (opcional)'}</span>
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => void handleUploadImage('cover', e)}
              />
            </div>

            <div className="cs-preview-row">
              <button
                type="button"
                className="cs-avatar-btn"
                onClick={() => avatarInputRef.current?.click()}
                title="Subir foto de perfil de la señal"
                aria-label="Subir foto de perfil de la señal"
              >
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt="Perfil de la señal" />
                ) : (
                  <Camera size={18} />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => void handleUploadImage('avatar', e)}
              />

              <div className="cs-identity-inputs">
                <input
                  type="text"
                  value={signalName}
                  onChange={(e) => setSignalName(e.target.value)}
                  maxLength={48}
                  placeholder="Nombre de tu señal (ej. Fútbol y Política)"
                  className="cs-name-input"
                  autoFocus
                />
                <input
                  type="text"
                  value={topicNote}
                  onChange={(e) => setTopicNote(e.target.value)}
                  maxLength={120}
                  placeholder="Descripción corta o tema (opcional)"
                  className="cs-desc-input"
                />
              </div>
            </div>
          </div>

          <div className="cs-visibility-row">
            <span className="cs-vis-label">Visibilidad</span>
            <div className="cs-segmented">
              <button
                type="button"
                className={`cs-seg-opt ${visibility === 'public' ? 'active' : ''}`}
                onClick={() => setVisibility('public')}
              >
                <Globe size={13} />
                <span>Pública</span>
              </button>
              <button
                type="button"
                className={`cs-seg-opt ${visibility === 'private' ? 'active' : ''}`}
                onClick={() => setVisibility('private')}
              >
                <Lock size={13} />
                <span>Privada</span>
              </button>
            </div>
          </div>

          {/* Capa 3B: Modo opcional Señal de Acontecimiento / Evento temporal */}
          <div className="cs-event-box">
            <label className="cs-event-toggle">
              <input
                type="checkbox"
                checked={isEventSignal}
                onChange={(e) => setIsEventSignal(e.target.checked)}
              />
              <Calendar size={14} color="#0071e3" />
              <span>Señal de Acontecimiento (Final, Elecciones, Festival — con inicio y cierre)</span>
            </label>

            {isEventSignal && (
              <div className="cs-event-grid">
                <label>
                  <span>Tipo</span>
                  <select
                    value={eventCategory}
                    onChange={(e) => setEventCategory(e.target.value as SignalEventCategory)}
                    className="cs-desc-input"
                  >
                    <option value="Deporte">Deporte / Final</option>
                    <option value="Política / Elecciones">Política / Elecciones</option>
                    <option value="Cultura / Festival">Cultura / Festival</option>
                    <option value="Especial">Especial</option>
                  </select>
                </label>
                <label>
                  <span>Inicio</span>
                  <input
                    type="datetime-local"
                    value={eventStartsAt}
                    onChange={(e) => setEventStartsAt(e.target.value)}
                    className="cs-desc-input"
                  />
                </label>
                <label>
                  <span>Cierre (pasa a Archivo)</span>
                  <input
                    type="datetime-local"
                    value={eventEndsAt}
                    onChange={(e) => setEventEndsAt(e.target.value)}
                    className="cs-desc-input"
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        {/* PASO 2: ELEGIR CANALES, LINKS O TEMA RÁPIDO */}
        <section className="cs-card">
          <div className="cs-step-head">
            <div className="cs-step-label">2 · Sumá canales o videos</div>
            <div className="cs-quick-themes">
              {(['Actualidad', 'Fútbol', 'Historia', 'Ciencia'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="cs-theme-pill"
                  onClick={() => applyTopicPreset(cat)}
                >
                  <Sparkles size={11} />
                  <span>Armar de {cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pegar link de YouTube o @canal */}
          <form onSubmit={handleAddUrl} className="cs-url-form">
            <div className="cs-url-wrap">
              <Link2 size={14} className="cs-url-ico" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Pegá un link de YouTube o @canal para sumarlo…"
                className="cs-url-input"
              />
            </div>
            <button
              type="submit"
              disabled={!urlInput.trim() || isAddingUrl}
              className="cs-url-btn"
            >
              <Plus size={13} />
              <span>{isAddingUrl ? 'Sumando…' : 'Sumar'}</span>
            </button>
          </form>

          {feedback && (
            <div className="cs-feedback" role="status">
              {feedback}
            </div>
          )}

          {/* Filtro por categoría */}
          <div className="cs-cat-tabs" role="tablist">
            {(['Todos', 'Actualidad', 'Fútbol', 'Historia', 'Ciencia'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                className={`cs-cat-tab ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grilla de canales sugeridos con globito de perfil */}
          <div className="cs-channels-grid">
            {filteredSuggestions.map((item) => {
              const vid = item.block.contentItem.providerId || item.block.contentItem.id;
              const isSelected = selectedVideoIds.has(vid);
              const initial = (item.channelName[0] || 'C').toUpperCase();

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`cs-channel-chip ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSuggestedChannel(item)}
                >
                  <span className="cs-ch-avatar">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt={item.channelName} />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </span>
                  <span className="cs-ch-meta">
                    <strong>{item.channelName}</strong>
                    <span>{item.category}</span>
                  </span>
                  <span className="cs-ch-check" aria-hidden="true">
                    {isSelected ? <Check size={13} /> : <Plus size={13} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* PASO 3: RESUMEN Y ENCENDIDO */}
        <section className="cs-footer-card">
          <div className="cs-selected-summary">
            <div className="cs-summary-title">
              {selectedBlocks.length === 0
                ? 'Todavía no elegiste canales (si creás ahora, sumamos 3 sugeridos para arrancar)'
                : `${selectedBlocks.length} ${selectedBlocks.length === 1 ? 'canal / video elegido' : 'canales y videos elegidos'}`}
            </div>

            {selectedBlocks.length > 0 && (
              <div className="cs-selected-pills">
                {selectedBlocks.map((b) => {
                  const name = b.contentItem.channelTitle || (b.contentItem as any).channelName || b.contentItem.title;
                  const vid = b.contentItem.providerId || b.contentItem.id;
                  return (
                    <span key={vid} className="cs-selected-pill">
                      <span>{name}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${name}`}
                        onClick={() =>
                          setSelectedBlocks((prev) =>
                            prev.filter((x) => (x.contentItem.providerId || x.contentItem.id) !== vid)
                          )
                        }
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="cs-launch-btn"
            disabled={isCreating}
            onClick={handleCreateAndLaunch}
          >
            <Tv size={16} />
            <span>{isCreating ? 'Creando señal…' : 'Crear y encender señal'}</span>
          </button>
        </section>
      </div>

      <style>{`
        .cs-page {
          min-height: 100dvh;
          background: #f5f5f7;
          color: #1d1d1f;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif;
          -webkit-font-smoothing: antialiased;
          padding: 18px 16px 56px;
        }
        .cs-shell {
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .cs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .cs-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .cs-back-btn:hover {
          background: #ebebef;
        }
        .cs-algo-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 550;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
        }
        .cs-algo-btn:hover {
          border-color: #0071e3;
          color: #0071e3;
          background: rgba(0, 113, 227, 0.05);
        }
        .cs-algo-btn strong {
          font-weight: 700;
          color: #0071e3;
        }
        .cs-intro {
          text-align: center;
          padding: 4px 8px;
        }
        .cs-intro h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 750;
          letter-spacing: -0.03em;
          color: #1d1d1f;
        }
        .cs-intro p {
          margin: 6px 0 0;
          font-size: 14px;
          color: #6e6e73;
        }
        .cs-card {
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 24px;
          padding: 18px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .cs-step-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .cs-step-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #6e6e73;
        }
        .cs-preview-box {
          border-radius: 20px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #ffffff;
          overflow: hidden;
        }
        .cs-preview-cover {
          position: relative;
          height: 82px;
          background: linear-gradient(125deg, #1d1d1f 0%, #2c2c34 45%, #0071e3 100%);
          background-size: cover;
          background-position: center;
        }
        .cs-cover-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(29, 29, 31, 0.58);
          backdrop-filter: blur(10px);
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .cs-preview-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
        }
        .cs-avatar-btn {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #f5f5f7;
          color: #6e6e73;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06);
        }
        .cs-avatar-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cs-identity-inputs {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 0;
        }
        .cs-name-input {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.09);
          border-radius: 12px;
          padding: 9px 12px;
          font-size: 15px;
          font-weight: 650;
          color: #1d1d1f;
          background: #f5f5f7;
          outline: none;
          box-sizing: border-box;
        }
        .cs-name-input:focus {
          background: #ffffff;
          border-color: #0071e3;
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.14);
        }
        .cs-desc-input {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 10px;
          padding: 7px 12px;
          font-size: 12.5px;
          color: #424245;
          background: #f5f5f7;
          outline: none;
          box-sizing: border-box;
        }
        .cs-desc-input:focus {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.45);
        }
        .cs-visibility-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .cs-vis-label {
          font-size: 13px;
          font-weight: 600;
          color: #424245;
        }
        .cs-segmented {
          display: inline-flex;
          padding: 3px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.12);
          gap: 2px;
        }
        .cs-seg-opt {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 13px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #424245;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .cs-seg-opt.active {
          background: #ffffff;
          color: #1d1d1f;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .cs-event-box {
          padding-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cs-event-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
          font-weight: 620;
          color: #1d1d1f;
          cursor: pointer;
        }
        .cs-event-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }
        .cs-event-grid label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11px;
          font-weight: 650;
          color: #6e6e73;
        }
        .cs-quick-themes {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .cs-theme-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: rgba(0, 113, 227, 0.08);
          color: #0071e3;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .cs-theme-pill:hover {
          background: rgba(0, 113, 227, 0.15);
        }
        .cs-url-form {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cs-url-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          height: 38px;
          border-radius: 999px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.07);
        }
        .cs-url-ico {
          color: #86868b;
          flex-shrink: 0;
        }
        .cs-url-input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 13px;
          color: #1d1d1f;
          outline: none;
        }
        .cs-url-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 38px;
          padding: 0 15px;
          border-radius: 999px;
          border: none;
          background: #1d1d1f;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .cs-url-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cs-feedback {
          padding: 8px 12px;
          border-radius: 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          font-size: 12px;
          font-weight: 600;
        }
        .cs-cat-tabs {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .cs-cat-tab {
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #f5f5f7;
          color: #424245;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .cs-cat-tab.active {
          background: #1d1d1f;
          color: #ffffff;
          border-color: #1d1d1f;
        }
        .cs-channels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 9px;
        }
        .cs-channel-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.07);
          background: #ffffff;
          color: #1d1d1f;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .cs-channel-chip:hover {
          border-color: rgba(0, 113, 227, 0.35);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .cs-channel-chip.selected {
          background: rgba(0, 113, 227, 0.07);
          border-color: #0071e3;
        }
        .cs-ch-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .cs-ch-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cs-ch-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .cs-ch-meta strong {
          font-size: 12.5px;
          font-weight: 650;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cs-ch-meta span {
          font-size: 11px;
          color: #6e6e73;
        }
        .cs-ch-check {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.1);
          color: #424245;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .cs-channel-chip.selected .cs-ch-check {
          background: #0071e3;
          color: #ffffff;
        }
        .cs-footer-card {
          position: sticky;
          bottom: 12px;
          z-index: 20;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: saturate(190%) blur(24px);
          -webkit-backdrop-filter: saturate(190%) blur(24px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 22px;
          padding: 14px 16px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .cs-selected-summary {
          flex: 1 1 280px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .cs-summary-title {
          font-size: 12.5px;
          font-weight: 650;
          color: #424245;
        }
        .cs-selected-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .cs-selected-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 8px 4px 10px;
          border-radius: 999px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.07);
          font-size: 11.5px;
          font-weight: 600;
        }
        .cs-selected-pill button {
          border: none;
          background: transparent;
          color: #86868b;
          padding: 0;
          display: inline-flex;
          cursor: pointer;
        }
        .cs-launch-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 12px 22px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 14px;
          font-weight: 680;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 113, 227, 0.32);
          transition: background 0.16s ease, transform 0.16s ease;
        }
        .cs-launch-btn:hover:not(:disabled) {
          background: #0077ed;
          transform: translateY(-1px);
        }
        .cs-launch-btn:disabled {
          opacity: 0.6;
        }
        @media (max-width: 640px) {
          .cs-header-spacer { display: none; }
          .cs-intro h1 { font-size: 22px; }
          .cs-launch-btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
