import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Plus,
  Camera,
  VolumeX,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
  Check,
  BookmarkPlus,
  Link2,
  Pencil,
  X,
  Share2,
  ChevronDown,
  ChevronUp,
  Copy,
  Repeat,
  Radio,
  Search,
  Play,
  Pause,
  ExternalLink,
  Code2,
  Activity,
  Heart,
  UserPlus,
  UserCheck,
  MoreHorizontal,
  Sliders,
  SkipBack,
  SkipForward,
  Volume2,
  Cast,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Tv,
  LayoutGrid,
  Bell,
  BellRing
} from 'lucide-react';
import { RemoteBridge } from '../utils/remoteBridge';
import { useSignalStore } from '../lib/tv/signalStore';
import { generateSurpriseBlock } from '../lib/tv/surpriseGenerator';
import { YouAppPlayer, type YouAppPlayerHandle } from '../components/player/YouAppPlayer';
import {
  DailymotionOfficialPlayer,
  extractDailymotionVideoId
} from '../components/player/DailymotionOfficialPlayer';
import { MosaicPlayerGrid } from '../components/player/MosaicPlayerGrid';
import { YouRing } from '../components/player/YouRing';
import { SmartBar } from '../components/smartbar/SmartBar';
import { PlayerControlsDrawer } from '../components/player/PlayerControlsDrawer';
import { useLandscapeAutoFullscreen } from '../hooks/useLandscapeAutoFullscreen';
import { EpistemicBadge } from '../components/epistemic/EpistemicBadge';
import { evaluateEpistemicNature } from '../lib/field/epistemicGuard';
import {
  canAutoSkip,
  isUnplayableYouTubeError,
  reportUnplayableYouTubeVideo,
  resetAutoSkip
} from '../lib/player/videoResilience';
import { usePlayerStore } from '../store/usePlayerStore';
import { TvUserSessionMenu } from '../components/tv/TvUserSessionMenu';
import { YouAppOfficialLogo } from '../components/ui/YouAppOfficialLogo';
import { shareContentUniversal } from '../components/ui/GlobalShareSheet';
import { SignalAssociatedRepeatersRail } from '../components/tv/SignalAssociatedRepeatersRail';
import { CuratedSignalsDiscoverSection } from '../components/tv/CuratedSignalsDiscoverSection';
import { SignalPollsDrawer } from '../components/tv/SignalPollsDrawer';
import { SignalStationHubDrawer } from '../components/tv/SignalStationHubDrawer';
import { SignalEventCoverageDrawer } from '../components/tv/SignalEventCoverageDrawer';
import { DigitalAntennaModal } from '../components/tv/DigitalAntennaModal';
import { SignalInviteFollowersModal } from '../components/tv/SignalInviteFollowersModal';
import { SignalLiveMapModal } from '../components/tv/SignalLiveMapModal';
import { recordBridgeFollow, recordBridgeVisit } from '../lib/tv/audienceBridgeStore';
import { supabase } from '../lib/supabase';
import {
  buildYouTubeSubscribeUrl,
  fetchYouTubeVideoMeta,
  formatCompactViews,
  formatPublishedDateEs,
  loadSocialGraph,
  loadSocialGraphFromCloud,
  saveSocialGraph,
  toggleFollowCreatorWithMeta,
  toggleInList,
  toggleLikeVideoWithMeta,
  type VideoPublicMeta,
  type YouAppSocialGraph
} from '../lib/tv/youappSocialStore';
import {
  buildYouAppFullSignalShareUrl,
  openWhatsAppSignalShare,
  shareYouAppVideo
} from '../lib/tv/youappShareHelper';
import {
  atlasSmartOrderSchedule,
  buildBlockFromContribution,
  loadSignalCollabConfig,
  saveSignalCollabConfig,
  validateAndBuildContribution,
  type SignalCollabConfig,
  type SignalContribution
} from '../lib/tv/signalCollabStore';
import {
  QUICK_LIVE_CITIES,
  QUICK_LIVE_GREETINGS,
  SignalLivePresenceClient,
  loadSavedLiveCity,
  requestApproxZone7Km,
  saveLiveCity,
  type LiveGreetingEvent,
  type LiveParticipant
} from '../lib/tv/signalLivePresence';
import {
  loadCloudBranding,
  loadCloudSignalsForUser,
  loadPublicSignalById,
  persistSignal,
  syncCloudBranding
} from '../lib/tv/signalPersistence';
import {
  getTrialProgressInfo,
  readRedVivaState,
  recordRedVivaMetric,
  type RedVivaTrial
} from '../lib/tv/atlasRedVivaStore';
import {
  isPlayableAudioUrl,
  readSignalMediaBundle,
  type SignalAudioSource,
  type SignalMediaBundle
} from '../lib/tv/signalMediaSourcesStore';
import {
  getSignalEventPhase,
  readSignalEventMeta,
  type SignalEventMeta
} from '../lib/tv/signalEventsStore';
import {
  AddSignalContentModal,
  resolveUrlToScheduleBlock
} from '../components/tv/AddSignalContentModal';
import type { ScheduleBlock } from '../lib/tv/signalTypes';
import {
  CURATED_SIGNALS_PILOT,
  findCuratedSignalById,
  buildCustomSignalFromCurated,
  mergeCuratedIntoPersonalSignal,
  readCuratedPilotState,
  toggleFollowCuratedSignal
} from '../lib/tv/curatedSignalsCatalog';
import {
  findSignal100ById,
  buildCustomSignalFrom100
} from '../lib/tv/signals100Catalog';
import {
  buildShareableSignalUrl,
  hydrateSharedSignalFromParams
} from '../lib/tv/atlasSignalBuilder';
import {
  listMyOwnSignals,
  listSignalMemberships,
  listSwitchableSignals,
  type SignalMembershipItem,
  type UserSignalSummary
} from '../lib/tv/associationsService';
import { getMomentsForVideo, requestSemanticAnalysis } from '../lib/moments/momentEngine';
import type { VideoMoment } from '../lib/moments/momentTypes';
import { logAudienceEvent } from '../lib/player/telemetry/playerEvents';
import {
  fetchChannelGridSnapshot,
  resolveKnownChannelAvatar,
  resolveKnownChannelBanner,
  resolveKnownChannelId,
  slugifyChannelName,
  type ChannelGridSnapshot,
  type ChannelVideoItem
} from '../lib/tv/channelIdentityCatalog';

type MobileTab = 'schedule' | 'network';

const SIGNAL_BRANDING_KEY = 'youapp_signal_branding_v1';
const LAST_OWN_SIGNAL_ID_KEY = 'youapp_last_own_signal_id_v1';

interface SignalBrandingEntry {
  avatarDataUrl?: string;
  coverDataUrl?: string;
}

function readAllSignalBranding(): Record<string, SignalBrandingEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SIGNAL_BRANDING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllSignalBranding(map: Record<string, SignalBrandingEntry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIGNAL_BRANDING_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function compressImageFile(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function buildSignalScheduleByProfile(
  id: string,
  name: string,
  promptText?: string | null,
  options?: { selectedChannelIds?: string[]; quick15Min?: boolean }
) {
  const curatedMatch = findCuratedSignalById(id) || findCuratedSignalById(name.replace(/^✦\s*/, ''));
  if (curatedMatch) {
    return buildCustomSignalFromCurated(curatedMatch, options);
  }
  const catalog100Match = findSignal100ById(id) || findSignal100ById(name);
  if (catalog100Match) {
    return buildCustomSignalFrom100(catalog100Match);
  }

  const isTelefe = /telefe/i.test(name);
  if (isTelefe) {
    return {
      id,
      name,
      seedVersion: 3,
      prompt: promptText || 'Actualidad nacional y coberturas en Argentina',
      visibility: 'public' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule: [
        {
          id: `${id}-b1`,
          position: 0,
          startOffsetSec: 0,
          durationSec: 480,
          topic: 'Cobertura especial en Argentina · Discursos Completos',
          role: 'opening' as const,
          contentItem: {
            id: 'RPYfIrlMYos',
            providerId: 'RPYfIrlMYos',
            type: 'video' as const,
            provider: 'youtube' as const,
            title: 'Papa León XIV · Discursos Completos en Argentina',
            thumbnailUrl: 'https://i.ytimg.com/vi/RPYfIrlMYos/hqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=RPYfIrlMYos',
            channelName: 'Telefe Noticias',
            channelTitle: 'Telefe Noticias',
            channelId: 'telefe-noticias',
            isLive: false,
            isVerified: true
          }
        },
        {
          id: `${id}-b2`,
          position: 1,
          startOffsetSec: 480,
          durationSec: 600,
          topic: 'Sociedad e Historia · Derechos del Trabajo',
          role: 'deep_dive' as const,
          contentItem: {
            id: '0cjWa3Eizqw',
            providerId: '0cjWa3Eizqw',
            type: 'video' as const,
            provider: 'youtube' as const,
            title: '¿Qué es la Rerum Novarum? · Crónica documental',
            thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=0cjWa3Eizqw',
            channelName: 'Telefe Noticias',
            channelTitle: 'Telefe Noticias',
            channelId: 'telefe-noticias',
            isLive: false,
            isVerified: true
          }
        }
      ]
    };
  }

  return {
    id,
    name,
    seedVersion: 5,
    prompt: promptText || 'Papa León XIV en Argentina, Rerum Novarum y Actualidad',
    visibility: 'public' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    schedule: [
      {
        id: `${id}-rerum-1`,
        position: 0,
        startOffsetSec: 0,
        durationSec: 600,
        topic: 'Documental histórico · León XIII (1891–1896)',
        role: 'opening' as const,
        contentItem: {
          id: '0cjWa3Eizqw',
          providerId: '0cjWa3Eizqw',
          type: 'video' as const,
          provider: 'youtube' as const,
          title: '¿Qué es la Rerum Novarum? · La encíclica que defendió al trabajador',
          thumbnailUrl: 'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg',
          videoUrl: 'https://www.youtube.com/watch?v=0cjWa3Eizqw',
          channelName: name,
          channelTitle: name,
          channelId: 'justicia-social',
          originUrl: 'https://www.youtube.com/@justiciasocial-h7h',
          isLive: false,
          isVerified: true
        } as any
      },
      {
        id: `${id}-leonxiv-2`,
        position: 1,
        startOffsetSec: 600,
        durationSec: 480,
        topic: 'Papa León XIV en Argentina · Cobertura especial',
        role: 'deep_dive' as const,
        contentItem: {
          id: 'RPYfIrlMYos',
          providerId: 'RPYfIrlMYos',
          type: 'video' as const,
          provider: 'youtube' as const,
          title: 'Papa León XIV · Discursos Completos en Argentina',
          thumbnailUrl: 'https://i.ytimg.com/vi/RPYfIrlMYos/hqdefault.jpg',
          videoUrl: 'https://www.youtube.com/watch?v=RPYfIrlMYos',
          channelName: name,
          channelTitle: name,
          channelId: 'justicia-social',
          originUrl: 'https://www.youtube.com/@justiciasocial-h7h',
          isLive: false,
          isVerified: true
        } as any
      },
      {
        id: `${id}-canal22-3`,
        position: 2,
        startOffsetSec: 1080,
        durationSec: 1800,
        topic: 'Actualidad Política · CANAL 22 Oficial',
        role: 'explainer' as const,
        contentItem: {
          id: 'tKfcRkuxG5s',
          providerId: 'tKfcRkuxG5s',
          type: 'video' as const,
          provider: 'youtube' as const,
          title: 'LA REVANCHA DEL UNO (19-11-26) · Santiago Cúneo Oficial',
          thumbnailUrl: 'https://i.ytimg.com/vi/tKfcRkuxG5s/hqdefault.jpg',
          videoUrl: 'https://www.youtube.com/watch?v=tKfcRkuxG5s',
          channelName: 'CANAL 22',
          channelTitle: 'CANAL 22',
          channelId: 'UCiPqb8qbvCBjAFHc-KMujBw',
          originUrl: 'https://www.youtube.com/@CANAL22WEB',
          isLive: false,
          isVerified: true
        } as any
      },
      {
        id: `${id}-canal22-4`,
        position: 3,
        startOffsetSec: 2880,
        durationSec: 1620,
        topic: 'Programa diario · CANAL 22 Oficial',
        role: 'close' as const,
        contentItem: {
          id: 'U5N-CySWnT4',
          providerId: 'U5N-CySWnT4',
          type: 'video' as const,
          provider: 'youtube' as const,
          title: 'Estamos De Vuelta (19-11-26) · CANAL 22',
          thumbnailUrl: 'https://i.ytimg.com/vi/U5N-CySWnT4/hqdefault.jpg',
          videoUrl: 'https://www.youtube.com/watch?v=U5N-CySWnT4',
          channelName: 'CANAL 22',
          channelTitle: 'CANAL 22',
          channelId: 'UCiPqb8qbvCBjAFHc-KMujBw',
          originUrl: 'https://www.youtube.com/@CANAL22WEB',
          isLive: false,
          isVerified: true
        } as any
      }
    ]
  };
}

export default function MiSenal1() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSignalParam = searchParams.get('signal') || '';
  const requestedChannelsParam = searchParams.get('channels') || '';
  const requestedQuick15Param = searchParams.get('quick15') === '1';
  const isSharedSignalView = searchParams.get('sharedSignal') === '1';
  const [socialGraph, setSocialGraph] = useState<YouAppSocialGraph>(() => loadSocialGraph());
  const [playingVideoMeta, setPlayingVideoMeta] = useState<VideoPublicMeta | null>(null);

  useEffect(() => {
    loadSocialGraphFromCloud()
      .then((merged) => {
        if (merged) setSocialGraph(merged);
      })
      .catch(() => {});
  }, []);

  const {
    activeSignal,
    currentBlockIndex,
    persistStatus,
    setSignal,
    mergeCloudSignals,
    renameSignal,
    getSavedSignal,
    moveChannelGroup,
    removeChannelGroup,
    next,
    previous,
    insert,
    remove,
    jumpTo
  } = useSignalStore();

  const [collabConfig, setCollabConfig] = useState<SignalCollabConfig>(() =>
    loadSignalCollabConfig(activeSignal?.id || '')
  );
  const [collabFormOpen, setCollabFormOpen] = useState(false);
  const [collabPendingOpen, setCollabPendingOpen] = useState(false);
  const [collabUrlInput, setCollabUrlInput] = useState('');
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSignal?.id) return;
    setCollabConfig(loadSignalCollabConfig(activeSignal.id));
  }, [activeSignal?.id]);

  const handleToggleCollabMode = () => {
    if (!activeSignal?.id) return;
    const next = saveSignalCollabConfig(activeSignal.id, (prev) => ({
      ...prev,
      mode: prev.mode === 'open' ? 'closed' : 'open'
    }));
    setCollabConfig(next);
    setCuratedToast(
      next.mode === 'open'
        ? 'Señal abierta: la comunidad ya puede aportar videos según tus reglas.'
        : 'Señal cerrada: solo vos podés sumar videos (se conservan todos los aceptados).'
    );
  };

  const handleToggleCollabModeration = () => {
    if (!activeSignal?.id) return;
    const next = saveSignalCollabConfig(activeSignal.id, (prev) => ({
      ...prev,
      moderation: prev.moderation === 'review' ? 'direct' : 'review'
    }));
    setCollabConfig(next);
    setCuratedToast(
      next.moderation === 'direct'
        ? 'Regla cambiada a Publicación directa.'
        : 'Regla cambiada a Revisión previa (recomendado).'
    );
  };

  const handleAtlasOrderSignal = () => {
    if (!activeSignal || activeSignal.schedule.length < 2) {
      setCuratedToast('Necesitás al menos 2 videos para que ATLAS ordene tu señal.');
      return;
    }
    const { ordered, uniqueChannels, removedDuplicates } = atlasSmartOrderSchedule(
      activeSignal.schedule,
      collabConfig.blockMeta
    );
    const updated = {
      ...activeSignal,
      schedule: ordered,
      updated_at: new Date().toISOString()
    };
    setSignal(updated);
    void persistSignal(updated);
    setCuratedToast(
      `✨ ATLAS ordenó ${ordered.length} videos alternando ${uniqueChannels} canales` +
        (removedDuplicates > 0 ? ` (${removedDuplicates} duplicados quitados).` : '.')
    );
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSignal || !collabUrlInput.trim() || collabBusy) return;
    setCollabError(null);
    setCollabBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user || user.is_anonymous) {
        setCollabError('Iniciá sesión en YOUAPP para aportar videos a esta señal.');
        return;
      }
      const contributorName =
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        (user.email ? user.email.split('@')[0] : 'Colaborador');
      const isOwner = !activeSignal.user_id || activeSignal.user_id === user.id;

      const res = await validateAndBuildContribution({
        signalId: activeSignal.id,
        rawUrl: collabUrlInput,
        contributorName,
        existingSchedule: activeSignal.schedule,
        config: collabConfig,
        isOwner
      });

      if (!res.ok) {
        setCollabError(res.error);
        return;
      }

      const d = new Date();
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}:${contributorName.toLowerCase().trim()}`;

      if (collabConfig.moderation === 'direct' || isOwner) {
        insert(res.block, activeSignal.schedule.length - 1);
        const nextCfg = saveSignalCollabConfig(activeSignal.id, (prev) => ({
          ...prev,
          blockMeta: {
            ...prev.blockMeta,
            [res.block.id]: { by: contributorName, votes: 1, addedAt: new Date().toISOString() }
          },
          dailyCounts: { ...prev.dailyCounts, [dayKey]: (prev.dailyCounts[dayKey] || 0) + 1 }
        }));
        setCollabConfig(nextCfg);
        setCuratedToast(`✅ Video sumado a la programación por ${contributorName}.`);
      } else {
        const nextCfg = saveSignalCollabConfig(activeSignal.id, (prev) => ({
          ...prev,
          pending: [res.contribution, ...prev.pending],
          dailyCounts: { ...prev.dailyCounts, [dayKey]: (prev.dailyCounts[dayKey] || 0) + 1 }
        }));
        setCollabConfig(nextCfg);
        setCuratedToast(`Aporte enviado a revisión: «${res.contribution.title.slice(0, 42)}».`);
      }
      setCollabUrlInput('');
      setCollabFormOpen(false);
    } finally {
      setCollabBusy(false);
    }
  };

  const handleApproveContribution = (c: SignalContribution) => {
    if (!activeSignal) return;
    const block = buildBlockFromContribution(c, activeSignal.schedule.length);
    insert(block, activeSignal.schedule.length - 1);
    const nextCfg = saveSignalCollabConfig(activeSignal.id, (prev) => ({
      ...prev,
      pending: prev.pending.filter((p) => p.id !== c.id),
      blockMeta: {
        ...prev.blockMeta,
        [block.id]: { by: c.contributedBy, votes: 1, addedAt: c.contributedAt }
      }
    }));
    setCollabConfig(nextCfg);
    setCuratedToast(`✓ Aprobado en programación: «${c.title.slice(0, 40)}».`);
  };

  const handleRejectContribution = (id: string) => {
    if (!activeSignal) return;
    const nextCfg = saveSignalCollabConfig(activeSignal.id, (prev) => ({
      ...prev,
      pending: prev.pending.filter((p) => p.id !== id)
    }));
    setCollabConfig(nextCfg);
    setCuratedToast('Aporte rechazado.');
  };

  // SEÑAL VIVA V1 — Presencia voluntaria (Supabase Presence) + Saludos efímeros (Broadcast)
  const [liveParticipants, setLiveParticipants] = useState<LiveParticipant[]>([]);
  const [isLiveVisible, setIsLiveVisible] = useState(false);
  const [liveCity, setLiveCity] = useState<string>(() => loadSavedLiveCity());
  const [liveCityPickerOpen, setLiveCityPickerOpen] = useState(false);
  const [liveMapOpen, setLiveMapOpen] = useState(false);
  const [liveGreetings, setLiveGreetings] = useState<LiveGreetingEvent[]>([]);
  const liveClientRef = useRef<SignalLivePresenceClient | null>(null);
  const liveUserNameRef = useRef<string>('Espectador');
  const liveUserIdRef = useRef<string>('');
  const liveApproxCoordsRef = useRef<{ approxLat: number; approxLon: number } | null>(null);

  useEffect(() => {
    if (!activeSignal?.id || !collabConfig.liveEnabled) {
      liveClientRef.current?.destroy();
      liveClientRef.current = null;
      setLiveParticipants([]);
      setIsLiveVisible(false);
      return;
    }

    const clientKey = `u-${Math.random().toString(36).slice(2, 10)}`;
    const client = new SignalLivePresenceClient(activeSignal.id, clientKey);
    liveClientRef.current = client;

    client.onParticipants((list) => {
      setLiveParticipants(list);
    });

    client.onGreeting((g) => {
      setLiveGreetings((prev) => [...prev.slice(-2), g]);
      window.setTimeout(() => {
        setLiveGreetings((prev) => prev.filter((item) => item.id !== g.id));
      }, 4500);
    });

    return () => {
      client.destroy();
      if (liveClientRef.current === client) liveClientRef.current = null;
      setIsLiveVisible(false);
      setLiveParticipants([]);
    };
  }, [activeSignal?.id, collabConfig.liveEnabled]);

  const handleToggleLiveEnabled = () => {
    if (!activeSignal?.id) return;
    const next = saveSignalCollabConfig(activeSignal.id, (prev) => ({
      ...prev,
      liveEnabled: !prev.liveEnabled
    }));
    setCollabConfig(next);
    setCuratedToast(
      next.liveEnabled
        ? 'Señal viva activada: quienes sintonizan pueden coincidir y saludarse.'
        : 'Señal viva desactivada en esta señal.'
    );
  };

  const handleJoinLivePresence = async (
    chosenCity: string,
    approxCoords?: { approxLat: number; approxLon: number } | null
  ) => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user || user.is_anonymous) {
      setCuratedToast('Iniciá sesión en YOUAPP para mostrarte en Señal viva.');
      return;
    }
    const cleanCity = chosenCity.trim() || 'Zona ~7 km';
    const userName =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      (user.email ? user.email.split('@')[0] : 'Espectador');
    liveUserNameRef.current = userName;
    liveUserIdRef.current = user.id;
    liveApproxCoordsRef.current = approxCoords || null;
    setLiveCity(cleanCity);
    saveLiveCity(cleanCity);
    setLiveCityPickerOpen(false);
    setIsLiveVisible(true);
    await liveClientRef.current?.setVisible({
      key: user.id,
      name: userName,
      city: cleanCity,
      watchingTitle: currentBlock?.contentItem?.title || activeSignal?.name || undefined,
      approxLat: approxCoords?.approxLat,
      approxLon: approxCoords?.approxLon,
      radiusKm: 7,
      joinedAt: new Date().toISOString()
    });
    setCuratedToast(`📍 Visible en el mapa (${cleanCity} · radio ~7 km).`);
  };

  const handleJoinApproxZone7Km = async () => {
    const res = await requestApproxZone7Km();
    if (!res.ok) {
      setCuratedToast(res.error);
      return;
    }
    await handleJoinLivePresence('Mi zona (~7 km)', {
      approxLat: res.approxLat,
      approxLon: res.approxLon
    });
  };

  const handleLeaveLivePresence = async () => {
    setIsLiveVisible(false);
    await liveClientRef.current?.setVisible(null);
    setCuratedToast('Ya no sos visible en esta señal.');
  };

  const handleSendLiveGreeting = (emoji: string, text: string) => {
    if (!isLiveVisible) {
      setLiveCityPickerOpen(true);
      setCuratedToast('Primero elegí tu ciudad y tocá «Estoy aquí» para saludar.');
      return;
    }
    liveClientRef.current?.sendGreeting(liveUserNameRef.current, liveCity, emoji, text);
  };

  const playbackState = usePlayerStore((state) => state.playbackState);
  const isPlaying = playbackState === 'playing';
  const isMuted = usePlayerStore((state) => state.isMuted);
  const userAudioUnlocked = usePlayerStore((state) => state.userAudioUnlocked);
  const isAnalyzingYOU4 = usePlayerStore((state) => state.isAnalyzingYOU4);
  const setIsAnalyzingYOU4 = usePlayerStore((state) => state.setIsAnalyzingYOU4);

  const playerRef = useRef<YouAppPlayerHandle>(null);
  const [viewMode, setViewMode] = useState<'single' | 'mosaic' | 'you4'>('single');
  const [you4AudioSlot, setYou4AudioSlot] = useState<number>(0);
  const [you4Offset, setYou4Offset] = useState<number>(0);
  const you4AudioSlotRef = useRef<number>(0);
  you4AudioSlotRef.current = you4AudioSlot;
  const you4IframesRef = useRef<(HTMLIFrameElement | null)[]>([]);
  const you4VideosRef = useRef<(HTMLVideoElement | null)[]>([]);
  const you4ProgressRef = useRef<{ currentTime: number; duration: number; playing: boolean }[]>([
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true },
    { currentTime: 0, duration: 0, playing: true }
  ]);

  // Escucha los eventos de tiempo/duración de los 4 iframes de YouTube en modo YOU4
  // y sincroniza la SmartBar con la pantalla que está desmutada (you4AudioSlot)
  useEffect(() => {
    if (viewMode !== 'you4') return;

    const requestListening = () => {
      for (let i = 0; i < 4; i++) {
        const win = you4IframesRef.current[i]?.contentWindow;
        if (!win) continue;
        try {
          win.postMessage(JSON.stringify({ event: 'listening', id: i, channel: 'widget' }), '*');
        } catch {
          // ignore
        }
      }
    };

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string' || !ev.data.startsWith('{')) return;
      let parsed: any;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!parsed || parsed.event !== 'infoDelivery' || !parsed.info) return;
      const slotIdx = you4IframesRef.current.findIndex((f) => f && f.contentWindow === ev.source);
      if (slotIdx < 0 || slotIdx > 3) return;

      const cur = you4ProgressRef.current[slotIdx] || { currentTime: 0, duration: 0, playing: true };
      const ct = typeof parsed.info.currentTime === 'number' ? parsed.info.currentTime : cur.currentTime;
      const dur =
        typeof parsed.info.duration === 'number' && parsed.info.duration > 0
          ? parsed.info.duration
          : cur.duration;
      const playing =
        typeof parsed.info.playerState === 'number'
          ? parsed.info.playerState === 1 || parsed.info.playerState === 3
          : cur.playing;

      you4ProgressRef.current[slotIdx] = { currentTime: ct, duration: dur, playing };

      if (slotIdx === you4AudioSlotRef.current) {
        usePlayerStore.getState().setProgress(ct, dur > 0 ? dur : 240);
        if (typeof parsed.info.playerState === 'number') {
          usePlayerStore
            .getState()
            .setPlaybackState(parsed.info.playerState === 2 ? 'paused' : 'playing');
        }
      }
    };

    window.addEventListener('message', onMessage);
    const t1 = window.setTimeout(requestListening, 600);
    const t2 = window.setTimeout(requestListening, 1800);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [viewMode, you4Offset]);

  const handleYou4Seek = useCallback((seconds: number) => {
    const slotIdx = you4AudioSlotRef.current;
    const safeSec = Math.max(0, seconds);
    const cur = you4ProgressRef.current[slotIdx] || { currentTime: 0, duration: 240, playing: true };
    you4ProgressRef.current[slotIdx] = { ...cur, currentTime: safeSec };
    usePlayerStore.getState().setProgress(safeSec, cur.duration > 0 ? cur.duration : 240);

    const iframe = you4IframesRef.current[slotIdx];
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [safeSec, true] }),
          '*'
        );
      } catch {
        // ignore
      }
    }
    const vid = you4VideosRef.current[slotIdx];
    if (vid) {
      vid.currentTime = safeSec;
    }
  }, []);

  const handleSelectYou4Audio = useCallback((slotIdx: number) => {
    setYou4AudioSlot(slotIdx);
    you4AudioSlotRef.current = slotIdx;
    // Actualiza la SmartBar al instante con el tiempo/duración del cuadro desmutado
    const vidEl = you4VideosRef.current[slotIdx];
    if (vidEl && Number.isFinite(vidEl.duration) && vidEl.duration > 0) {
      usePlayerStore.getState().setProgress(vidEl.currentTime || 0, vidEl.duration);
      usePlayerStore.getState().setPlaybackState(vidEl.paused ? 'paused' : 'playing');
    } else {
      const snap = you4ProgressRef.current[slotIdx];
      if (snap) {
        usePlayerStore
          .getState()
          .setProgress(snap.currentTime, snap.duration > 0 ? snap.duration : 240);
        usePlayerStore.getState().setPlaybackState(snap.playing ? 'playing' : 'paused');
      }
    }
    // Audio exclusivo instantáneo vía YouTube postMessage + HTML5 video (sin recargar iframes)
    for (let i = 0; i < 4; i++) {
      const iframe = you4IframesRef.current[i];
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: i === slotIdx ? 'unMute' : 'mute', args: [] }),
            '*'
          );
          if (i === slotIdx) {
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
              '*'
            );
            iframe.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
          }
        } catch {
          // ignore
        }
      }
      const vid = you4VideosRef.current[i];
      if (vid) {
        vid.muted = i !== slotIdx;
        if (i === slotIdx) void vid.play().catch(() => {});
      }
    }
  }, []);
  const [mobileTab, setMobileTab] = useState<MobileTab>('schedule');
  const [quick15Only, setQuick15Only] = useState<boolean>(requestedQuick15Param);
  const [followedCuratedIds, setFollowedCuratedIds] = useState<string[]>(
    () => readCuratedPilotState().followedSignalIds
  );
  const [curatedToast, setCuratedToast] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAntennaModalOpen, setIsAntennaModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(`youapp_signal_alerts_${activeSignal?.id || 'default'}`) === '1';
    } catch {
      return false;
    }
  });
  const isFollowInvitePrompt = searchParams.get('follow') === '1';
  const incomingBridgeSource = searchParams.get('src');
  const handledDeepVideoRef = useRef<string | null>(null);

  // Registra visita real de procedencia cuando alguien llega desde un enlace etiquetado de redes
  useEffect(() => {
    const sigParam = searchParams.get('signal')?.trim();
    if (!sigParam) return;
    if (searchParams.get('sharedSignal') === '1' || searchParams.get('follow') === '1' || incomingBridgeSource) {
      recordBridgeVisit(sigParam, incomingBridgeSource);
    }
  }, [searchParams, incomingBridgeSource]);

  // Si el enlace de invitación trae ?v=<videoId>, abre directamente ese video dentro de Mi Señal
  useEffect(() => {
    const vParam = searchParams.get('v')?.trim();
    if (!vParam || !activeSignal || handledDeepVideoRef.current === vParam) return;
    const match = activeSignal.schedule.find(
      (b) => b.contentItem.providerId === vParam || b.contentItem.id === vParam
    );
    if (match) {
      handledDeepVideoRef.current = vParam;
      jumpTo(match.id);
    }
  }, [searchParams, activeSignal, jumpTo]);

  const handleToggleSignalAlerts = async () => {
    const storageKey = `youapp_signal_alerts_${activeSignal?.id || 'default'}`;
    if (alertsEnabled) {
      setAlertsEnabled(false);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      setCuratedToast('Avisos de esta señal desactivados.');
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setCuratedToast(
        'En iPhone/Safari agregá YOUAPP a tu pantalla de inicio (Compartir → Añadir a inicio) para habilitar avisos web.'
      );
      return;
    }
    try {
      const perm =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      if (perm === 'granted') {
        setAlertsEnabled(true);
        try {
          localStorage.setItem(storageKey, '1');
        } catch {
          // ignore
        }
        setCuratedToast(`Avisos activados para «${activeSignal?.name || 'Mi Señal'}».`);
      } else {
        setCuratedToast('Permiso de notificaciones no concedido en tu navegador.');
      }
    } catch {
      setCuratedToast('No se pudieron activar las notificaciones en este navegador.');
    }
  };
  const [quickUrlInput, setQuickUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const [channelFilter, setChannelFilter] = useState<'all' | 'live' | 'new'>('all');
  const [watchedVideoIds, setWatchedVideoIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('youapp_watched_videos_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [channelSnapshots, setChannelSnapshots] = useState<Record<string, ChannelGridSnapshot>>({});
  const fetchedChannelKeysRef = useRef<Set<string>>(new Set());
  const [signalBrandingMap, setSignalBrandingMap] = useState<Record<string, SignalBrandingEntry>>(
    () => readAllSignalBranding()
  );
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditingSignalName, setIsEditingSignalName] = useState(false);
  const [signalNameDraft, setSignalNameDraft] = useState('');
  const signalNameInputRef = useRef<HTMLInputElement | null>(null);
  const [switchableSignals, setSwitchableSignals] = useState<UserSignalSummary[]>([]);
  const [showSignalSwitcher, setShowSignalSwitcher] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [isStageExpanded, setIsStageExpanded] = useState(false);
  useLandscapeAutoFullscreen(true, setIsStageExpanded);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [castTargetCodeInput, setCastTargetCodeInput] = useState('');
  const [connectedCastCode, setConnectedCastCode] = useState<string | null>(null);
  const [isReceivingCast, setIsReceivingCast] = useState(false);
  const [myTvCode] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const castSenderBridgeRef = useRef<RemoteBridge | null>(null);
  const castBoxRef = useRef<HTMLDivElement | null>(null);

  const isChromePresentationSupported =
    typeof window !== 'undefined' && 'PresentationRequest' in window;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStageExpanded) {
        setIsStageExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStageExpanded]);

  useEffect(() => {
    if (!isCastOpen) return;
    const onDown = (e: MouseEvent) => {
      if (castBoxRef.current && !castBoxRef.current.contains(e.target as Node)) {
        setIsCastOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isCastOpen]);

  useEffect(() => {
    return () => {
      castSenderBridgeRef.current?.destroy();
      castSenderBridgeRef.current = null;
    };
  }, []);

  const handleChromeNativeCast = async () => {
    if (!isChromePresentationSupported) {
      setCuratedToast('El selector nativo requiere Google Chrome o Edge.');
      return;
    }
    setIsCastOpen(false);
    try {
      const PresentationReq = (window as unknown as {
        PresentationRequest: new (urls: string[]) => { start: () => Promise<unknown> };
      }).PresentationRequest;
      const targetUrl =
        typeof window !== 'undefined' ? window.location.href : 'https://youapp.tv/misenal1';
      const request = new PresentationReq([targetUrl]);
      await request.start();
      setCuratedToast('Conectado al dispositivo desde Chrome.');
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      if (name === 'NotFoundError') {
        setCuratedToast('No se encontraron Chromecast o Smart TVs disponibles en tu Wi-Fi.');
        return;
      }
      setCuratedToast('Usá el menú de Chrome (⋮ → Transmitir) o vinculá con el código de 4 dígitos.');
    }
  };

  const handleConnectCastCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = castTargetCodeInput.replace(/\D/g, '').slice(0, 6);
    if (code.length < 4) {
      setCuratedToast('Ingresá el código de 4 dígitos que aparece en la otra pantalla.');
      return;
    }
    castSenderBridgeRef.current?.destroy();
    const bridge = new RemoteBridge(code, 'remote');
    castSenderBridgeRef.current = bridge;
    setConnectedCastCode(code);
    setIsCastOpen(false);
    setCuratedToast(`Transmitiendo a TV ${code}.`);
    if (currentBlock) {
      const itemAny = currentBlock.contentItem as any;
      const payloadItem = {
        id: currentBlock.id,
        provider: itemAny.provider || 'youtube',
        providerId: itemAny.providerId || itemAny.id,
        title: currentBlock.contentItem.title,
        author: itemAny.channelTitle || itemAny.channelName || activeSignal?.name || 'Mi Señal',
        thumbnailUrl: activeBlockThumb,
        sourceUrl:
          itemAny.videoUrl ||
          `https://www.youtube.com/watch?v=${itemAny.providerId || itemAny.id}`
      };
      window.setTimeout(() => {
        bridge.sendAction('MITV_PLAY_ITEM', { item: payloadItem });
      }, 650);
    }
  };

  const handleDisconnectCast = () => {
    castSenderBridgeRef.current?.destroy();
    castSenderBridgeRef.current = null;
    setConnectedCastCode(null);
    setCuratedToast('Transmisión finalizada.');
  };
  const [continuousChannelMode, setContinuousChannelMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('youapp_continuous_channel_mode_v1');
    return saved === null ? true : saved === '1';
  });
  const [followedUserSignalIds, setFollowedUserSignalIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('youapp_followed_user_signals_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [redVivaTrial, setRedVivaTrial] = useState<RedVivaTrial | null>(
    () => readRedVivaState().activeTrial
  );
  const [showMediaDrawer, setShowMediaDrawer] = useState(false);
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);
  const [signalMediaBundle, setSignalMediaBundle] = useState<SignalMediaBundle>(() =>
    readSignalMediaBundle(activeSignal?.id || 'justicia-social-signal-1')
  );
  const [signalEventMeta, setSignalEventMeta] = useState<SignalEventMeta | null>(() =>
    readSignalEventMeta(activeSignal?.id || 'justicia-social-signal-1')
  );
  const [eventCoverageOpenTick, setEventCoverageOpenTick] = useState(0);
  const [playingGridAudio, setPlayingGridAudio] = useState<SignalAudioSource | null>(null);
  const [isGridAudioPlaying, setIsGridAudioPlaying] = useState(false);
  const gridAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const id = activeSignal?.id || 'justicia-social-signal-1';
    setSignalMediaBundle(readSignalMediaBundle(id));
    setSignalEventMeta(readSignalEventMeta(id));
  }, [activeSignal?.id]);

  const handleToggleGridAudio = (item: SignalAudioSource) => {
    if (!isPlayableAudioUrl(item.streamUrl)) {
      window.open(item.originUrl || item.streamUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const el = gridAudioRef.current;
    if (!el) return;
    if (playingGridAudio?.id === item.id) {
      if (isGridAudioPlaying) {
        el.pause();
        setIsGridAudioPlaying(false);
      } else {
        playerRef.current?.pause();
        el.play()
          .then(() => setIsGridAudioPlaying(true))
          .catch(() => setIsGridAudioPlaying(false));
      }
      return;
    }
    playerRef.current?.pause();
    setPlayingGridAudio(item);
    el.pause();
    el.src = item.streamUrl;
    el.load();
    el.play()
      .then(() => setIsGridAudioPlaying(true))
      .catch(() => {
        setIsGridAudioPlaying(false);
        setCuratedToast('No se pudo reproducir ese stream directo. Podés abrir la fuente original.');
      });
  };

  // #3: Sincronización inicial con la nube (Supabase: señales + branding PC ↔ Celular)
  useEffect(() => {
    let cancelled = false;
    loadCloudSignalsForUser()
      .then((cloudSignals) => {
        if (!cancelled && cloudSignals.length > 0) {
          mergeCloudSignals(cloudSignals);
        }
      })
      .catch(() => {});

    loadCloudBranding()
      .then((cloudBranding) => {
        if (!cancelled && Object.keys(cloudBranding).length > 0) {
          setSignalBrandingMap((prev) => {
            const merged = { ...cloudBranding, ...prev };
            writeAllSignalBranding(merged);
            return merged;
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mergeCloudSignals]);

  // #4: Si llega por enlace compartido de señal completa (?signal=...&sharedSignal=1), intenta cargarla desde la nube
  useEffect(() => {
    if (!isSharedSignalView || !requestedSignalParam) return;
    if (findCuratedSignalById(requestedSignalParam)) return;
    loadPublicSignalById(requestedSignalParam)
      .then((pubSig) => {
        if (pubSig) setSignal(pubSig, { saveToOwn: false });
      })
      .catch(() => {});
  }, [isSharedSignalView, requestedSignalParam, setSignal]);

  const removeSavedSignal = useSignalStore((s) => s.removeSavedSignal);
  const savedSignalsCount = useSignalStore((s) => Object.keys(s.savedSignalsById || {}).length);

  useEffect(() => {
    listMyOwnSignals()
      .then(setSwitchableSignals)
      .catch(() => {});
  }, [activeSignal?.id, activeSignal?.name, savedSignalsCount]);

  useEffect(() => {
    setIsEditingSignalName(false);
  }, [activeSignal?.id]);

  const startEditingSignalName = () => {
    setSignalNameDraft(activeSignal?.name || 'Mi Señal Personal');
    setIsEditingSignalName(true);
    window.setTimeout(() => {
      signalNameInputRef.current?.focus();
      signalNameInputRef.current?.select();
    }, 10);
  };

  const commitSignalName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = signalNameDraft.trim();
    if (!cleaned) {
      setIsEditingSignalName(false);
      return;
    }
    renameSignal(cleaned);
    setIsEditingSignalName(false);
    setCuratedToast(`Nombre de tu señal actualizado a "${cleaned}".`);
  };

  const activeSignalKey = activeSignal?.id || 'justicia-social-signal-1';
  const activeBranding = signalBrandingMap[activeSignalKey] || {};
  // Mi Señal mantiene su propia identidad independiente de los canales que incluye:
  // solo muestra portada/avatar cuando el dueño los sube expresamente.
  const resolvedTopCover = activeBranding.coverDataUrl;
  const resolvedTopAvatar = activeBranding.avatarDataUrl;

  const handleUploadBrandingImage = async (
    kind: 'avatar' | 'cover',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(
        file,
        kind === 'avatar' ? 256 : 960,
        kind === 'avatar' ? 256 : 360
      );
      setSignalBrandingMap((prev) => {
        const next = {
          ...prev,
          [activeSignalKey]: {
            ...(prev[activeSignalKey] || {}),
            ...(kind === 'avatar' ? { avatarDataUrl: dataUrl } : { coverDataUrl: dataUrl })
          }
        };
        writeAllSignalBranding(next);
        void syncCloudBranding(next);
        return next;
      });
      setCuratedToast(
        kind === 'avatar' ? 'Foto de perfil de la señal actualizada.' : 'Foto de portada de la señal actualizada.'
      );
    } catch {
      setCuratedToast('No se pudo cargar esa imagen. Probá con JPG o PNG.');
    }
  };
  const [isFallbackMoments, setIsFallbackMoments] = useState(false);
  const [isGeneratingSurprise, setIsGeneratingSurprise] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const [previewBlockId, setPreviewBlockId] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  const startPillPreview = useCallback((blockId: string) => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      setPreviewBlockId(blockId);
    }, 220);
  }, []);

  const stopPillPreview = useCallback((blockId?: string) => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewBlockId((cur) => (!blockId || cur === blockId ? null : cur));
  }, []);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  const [moments, setMoments] = useState<VideoMoment[]>([]);
  const [signalMemberships, setSignalMemberships] = useState<SignalMembershipItem[]>([]);
  const currentBlock = activeSignal?.schedule[currentBlockIndex] || null;

  // Si ya estás visible en Señal viva, al cambiar de video (ej. Tango, Rock) actualiza automáticamente qué estás viendo en el mapa
  useEffect(() => {
    if (!isLiveVisible || !liveClientRef.current || !liveUserIdRef.current) return;
    const watchingTitle = currentBlock?.contentItem?.title || activeSignal?.name || undefined;
    void liveClientRef.current.setVisible({
      key: liveUserIdRef.current,
      name: liveUserNameRef.current,
      city: liveCity,
      watchingTitle,
      approxLat: liveApproxCoordsRef.current?.approxLat,
      approxLon: liveApproxCoordsRef.current?.approxLon,
      radiusKm: 7,
      joinedAt: new Date().toISOString()
    });
  }, [isLiveVisible, currentBlock?.contentItem?.title, activeSignal?.name, liveCity]);

  useEffect(() => {
    const ci = currentBlock?.contentItem as any;
    const vid =
      ci?.provider === 'youtube' ? String(ci.providerId || ci.id || '').trim() : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) {
      setPlayingVideoMeta(null);
      return;
    }
    let cancelled = false;
    setPlayingVideoMeta(null);
    fetchYouTubeVideoMeta(vid)
      .then((meta) => {
        if (!cancelled) setPlayingVideoMeta(meta);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentBlock?.id, currentBlock?.contentItem]);
  const currentBlockIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentBlockIdRef.current = currentBlock?.id || null;
    const vid = currentBlock?.contentItem?.providerId || currentBlock?.contentItem?.id;
    if (!vid) return;
    setWatchedVideoIds((prev) => {
      if (prev.includes(vid)) return prev;
      const nextList = [vid, ...prev].slice(0, 200);
      try {
        localStorage.setItem('youapp_watched_videos_v1', JSON.stringify(nextList));
      } catch {
        // ignore quota errors
      }
      return nextList;
    });
  }, [currentBlock?.id, currentBlock?.contentItem?.id, currentBlock?.contentItem?.providerId]);

  // Auto-ocultamiento rápido del aro sobre el video mientras reproduce (< 1 segundo)
  const revealStageControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    if (isPlaying && viewMode === 'single') {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 650);
    }
  }, [isPlaying, viewMode]);

  useEffect(() => {
    if (!isPlaying || viewMode === 'mosaic') {
      setControlsVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 650);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, viewMode, currentBlock?.id]);

  const refreshMemberships = useCallback(() => {
    listSignalMemberships(activeSignal?.id || 'justicia-social-signal-1')
      .then(setSignalMemberships)
      .catch(() => {});
  }, [activeSignal?.id]);

  useEffect(() => {
    refreshMemberships();
  }, [refreshMemberships]);

  const handleSelectSignal = useCallback(
    (sig: UserSignalSummary) => {
      const targetId = sig.clientSignalId || sig.id;
      setViewMode('single');
      setSearchParams({ signal: targetId }, { replace: true });
      const saved = getSavedSignal(targetId) || getSavedSignal(sig.id);
      if (saved && saved.schedule.length > 0) {
        setSignal(saved);
      } else {
        setSignal(buildSignalScheduleByProfile(targetId, sig.name, sig.prompt) as any);
      }
    },
    [getSavedSignal, setSearchParams, setSignal]
  );

  // Sincronización inicial y soporte de enlaces compartidos (?signal=...&channels=...&quick15=1)
  useEffect(() => {
    setQuick15Only(requestedQuick15Param);
    const chosenIds = requestedChannelsParam
      ? requestedChannelsParam.split(',').map((x) => x.trim()).filter(Boolean)
      : undefined;

    if (requestedSignalParam) {
      const direct100 = findSignal100ById(requestedSignalParam);
      if (direct100) {
        if (activeSignal?.id !== direct100.id) {
          const saved100 = getSavedSignal(direct100.id);
          if (saved100 && saved100.schedule.length > 0) {
            setSignal(saved100, { saveToOwn: false });
          } else {
            setSignal(buildCustomSignalFrom100(direct100) as any, { saveToOwn: false });
          }
        }
        return;
      }

      const directCurated = findCuratedSignalById(requestedSignalParam);
      if (directCurated) {
        if (
          activeSignal?.id !== directCurated.id ||
          Boolean(chosenIds?.length) ||
          requestedQuick15Param
        ) {
          const savedCurated =
            !chosenIds?.length && !requestedQuick15Param ? getSavedSignal(directCurated.id) : null;
          if (savedCurated && savedCurated.schedule.length > 0) {
            setSignal(savedCurated, { saveToOwn: false });
          } else {
            setSignal(
              buildCustomSignalFromCurated(directCurated, {
                selectedChannelIds: chosenIds,
                quick15Min: requestedQuick15Param
              }) as any,
              { saveToOwn: false }
            );
          }
        }
        return;
      }

      if (activeSignal?.id !== requestedSignalParam) {
        const savedDirect = getSavedSignal(requestedSignalParam);
        if (savedDirect && savedDirect.schedule.length > 0) {
          setSignal(savedDirect);
          return;
        }
        const sharedFromUrl = hydrateSharedSignalFromParams(searchParams);
        if (sharedFromUrl) {
          setSignal(sharedFromUrl as any, { saveToOwn: false });
          return;
        }
        listSwitchableSignals()
          .then((all) => {
            const found = all.find(
              (s) =>
                s.id === requestedSignalParam ||
                s.name.toLowerCase() === requestedSignalParam.toLowerCase()
            );
            if (found) {
              const savedFound = getSavedSignal(found.id);
              setSignal(
                savedFound && savedFound.schedule.length > 0
                  ? savedFound
                  : (buildSignalScheduleByProfile(found.id, found.name, found.prompt) as any)
              );
            } else if (!activeSignal) {
              setSignal(buildSignalScheduleByProfile('justicia-social-signal-1', 'Justicia Social TV') as any);
            }
          })
          .catch(() => {});
        return;
      }
    }

    const hasLegacyMock =
      activeSignal?.id === 'mock-signal-1' ||
      activeSignal?.schedule?.some((b: any) =>
        ['TLkA0RELQ1g', 'sKzBwDTeYqA', 'w4w8a5k_tes', 'rayo_muerte_tes', 'Ha4zNj41OTI', '8dczCXXASQg'].includes(
          b?.contentItem?.id
        )
      );
    const isOldUnseededDefault =
      activeSignal?.id === 'justicia-social-signal-1' &&
      Number((activeSignal as any)?.seedVersion || 0) < 5;

    if (!activeSignal || hasLegacyMock || isOldUnseededDefault) {
      setSignal(buildSignalScheduleByProfile('justicia-social-signal-1', 'Justicia Social TV') as any);
    }
  }, [
    activeSignal,
    getSavedSignal,
    requestedSignalParam,
    requestedChannelsParam,
    requestedQuick15Param,
    setSignal
  ]);

  const fetchMoments = useCallback(
    async (knownDuration?: number) => {
      if (!currentBlock) return;
      const requestedBlockId = currentBlock.id;
      const duration = knownDuration || currentBlock.durationSec || 120;
      try {
        const playbackItem: any = {
          id: currentBlock.contentItem.id,
          title: currentBlock.contentItem.title,
          durationSec: duration,
          videoUrl: currentBlock.contentItem.videoUrl || '',
          provider: currentBlock.contentItem.provider || 'youtube',
          providerId:
            (currentBlock.contentItem as any).providerContentId ||
            currentBlock.contentItem.providerId ||
            currentBlock.contentItem.id
        };
        const res = await getMomentsForVideo(playbackItem);
        if (currentBlockIdRef.current !== requestedBlockId) return;

        if (res && res.moments && res.moments.length >= 4) {
          setMoments(res.moments);
          setIsFallbackMoments(Boolean(res.isFallback));
        } else {
          const fallbacks: VideoMoment[] = [0.15, 0.38, 0.62, 0.85].map((ratio, index) => {
            const startSec = Math.floor(duration * ratio);
            return {
              id: `fallback-${index}-${currentBlock.id}`,
              contentKey: currentBlock.contentItem.id,
              startSec,
              title: `Momento ${index + 1}`,
              summary: `Punto destacado en ${Math.floor(startSec / 60)}:${(startSec % 60).toString().padStart(2, '0')}`,
              type: 'key_point',
              confidence: 0.8,
              source: 'fallback'
            };
          });
          setMoments(fallbacks);
          setIsFallbackMoments(true);
        }
      } catch (err) {
        console.error('Error fetching moments:', err);
      }
    },
    [currentBlock]
  );

  useEffect(() => {
    if (currentBlock) {
      void fetchMoments();
    }
  }, [currentBlock, fetchMoments]);

  const handleMomentClick = (moment: VideoMoment, index = 0) => {
    if (!currentBlock) return;
    if (viewMode === 'mosaic') {
      setViewMode('single');
    }

    const actualDuration = playerRef.current?.getDuration() || 0;
    let targetSec = moment.startSec;

    if (actualDuration > 10 && targetSec >= actualDuration - 5) {
      const ratios = [0.15, 0.38, 0.62, 0.82];
      targetSec = Math.floor(actualDuration * (ratios[index % 4] || 0.25));
    }

    void playerRef.current?.seek(targetSec);
    void playerRef.current?.play();
    logAudienceEvent('moment_clicked', {
      signalId: activeSignal?.id,
      blockId: currentBlock.id,
      contentId: currentBlock.contentItem.id,
      momentStartSec: targetSec
    });
  };

  const handlePlayPause = () => {
    if (viewMode === 'mosaic') {
      const nextPlaying = !isPlaying;
      usePlayerStore.getState().setPlaybackState(nextPlaying ? 'playing' : 'paused');
      return;
    }
    if (viewMode === 'you4') {
      const slotIdx = you4AudioSlotRef.current;
      const iframe = you4IframesRef.current[slotIdx];
      const vid = you4VideosRef.current[slotIdx];
      const nextPlaying = !isPlaying;
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: nextPlaying ? 'playVideo' : 'pauseVideo',
              args: []
            }),
            '*'
          );
        } catch {
          // ignore
        }
      }
      if (vid) {
        if (nextPlaying) void vid.play().catch(() => {});
        else vid.pause();
      }
      usePlayerStore.getState().setPlaybackState(nextPlaying ? 'playing' : 'paused');
      return;
    }
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  };

  const handleNext = () => {
    setViewMode('single');
    next();
  };

  const handlePrevious = () => {
    setViewMode('single');
    previous();
  };

  const handleDirector = async () => {
    if (!currentBlock) return;
    if (viewMode === 'mosaic') {
      setViewMode('single');
      return;
    }

    setViewMode('mosaic');
    if (isFallbackMoments && !isAnalyzingYOU4) {
      setIsAnalyzingYOU4(true);
      try {
        const playbackItem: any = {
          id: currentBlock.contentItem.id,
          title: currentBlock.contentItem.title,
          durationSec: playerRef.current?.getDuration() || currentBlock.durationSec || 120,
          videoUrl: currentBlock.contentItem.videoUrl || '',
          provider: currentBlock.contentItem.provider || 'youtube',
          providerId:
            (currentBlock.contentItem as any).providerContentId ||
            currentBlock.contentItem.providerId ||
            currentBlock.contentItem.id
        };
        const res = await requestSemanticAnalysis(playbackItem);
        if (res && res.moments && res.moments.length >= 4) {
          setMoments(res.moments);
          setIsFallbackMoments(false);
        }
      } catch (err) {
        console.error('Semantic analysis failed:', err);
      } finally {
        setIsAnalyzingYOU4(false);
      }
    }
  };

  const handleAddBlockToSignal = useCallback(
    (block: ScheduleBlock) => {
      const newSignal = {
        ...activeSignal,
        schedule: [...activeSignal.schedule, { ...block, position: activeSignal.schedule.length }]
      };
      if (!activeSignal || activeSignal.schedule.length === 0) {
        const created = {
          id: activeSignal?.id || 'justicia-social-signal-1',
          name: activeSignal?.name || 'Mi Señal Personal',
          seedVersion: 5,
          prompt: activeSignal?.prompt || 'Mi señal armada por URLs',
          visibility: 'public',
          created_at: activeSignal?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          schedule: [{ ...block, position: 0, startOffsetSec: 0 }]
        } as any;
        setSignal(created);
        void persistSignal(created);
      } else {
        insert(block, activeSignal.schedule.length - 1);
        void persistSignal(newSignal as any);
      }
      setCuratedToast(`Sumado a tu señal: ${block.contentItem.title}`);
    },
    [activeSignal, insert, setSignal]
  );

  const handleQuickAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = quickUrlInput.trim();
    if (!raw || isAddingUrl) return;
    setIsAddingUrl(true);
    try {
      const { block, kind } = await resolveUrlToScheduleBlock(raw, activeSignal?.schedule.length || 0);
      handleAddBlockToSignal(block);
      setQuickUrlInput('');
      setCuratedToast(
        `${kind === 'channel' ? 'Canal' : 'Video'} agregado a tu señal: ${block.contentItem.title}`
      );
    } finally {
      setIsAddingUrl(false);
    }
  };

  // Recepción automática de enlace (?add=<URL>) desde el botón arrastrable "+ Mi Señal" o Compartir
  const handledAddParamRef = useRef<string | null>(null);
  const handleAddBlockRef = useRef(handleAddBlockToSignal);
  handleAddBlockRef.current = handleAddBlockToSignal;
  const jumpToRef = useRef(jumpTo);
  jumpToRef.current = jumpTo;
  const miSenalBookmarkletRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const el = miSenalBookmarkletRef.current;
    if (!el || typeof window === 'undefined') return;
    const origin = window.location.origin;
    el.setAttribute(
      'href',
      `javascript:(function(){window.open('${origin}/misenal1?add='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title),'_blank');})();`
    );
  }, [activeSignal?.id]);

  useEffect(() => {
    const addUrl = searchParams.get('add')?.trim();
    if (!addUrl || !activeSignal || handledAddParamRef.current === addUrl) return;
    handledAddParamRef.current = addUrl;
    const titleHint = searchParams.get('t')?.trim() || undefined;
    setIsAddingUrl(true);

    resolveUrlToScheduleBlock(addUrl, activeSignal.schedule.length, titleHint)
      .then(({ block, kind }) => {
        handleAddBlockRef.current(block);
        window.setTimeout(() => {
          jumpToRef.current(block.id);
          setViewMode('single');
        }, 60);
        setCuratedToast(
          `${kind === 'channel' ? 'Canal' : 'Video'} sumado a Mi Señal: ${block.contentItem.title}`
        );
      })
      .catch(() => {
        setCuratedToast('No se pudo sumar ese enlace automáticamente. Probá pegarlo en la barra URL.');
      })
      .finally(() => {
        setIsAddingUrl(false);
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.delete('add');
        nextParams.delete('t');
        setSearchParams(nextParams, { replace: true });
      });
  }, [searchParams, setSearchParams, activeSignal]);

  const handleSurprise = async () => {
    if (isGeneratingSurprise || !activeSignal || !currentBlock) return;
    setIsGeneratingSurprise(true);
    try {
      const surprise = await generateSurpriseBlock(activeSignal, currentBlockIndex);
      if (surprise) {
        insert(surprise, currentBlockIndex);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingSurprise(false);
    }
  };

  const rawSchedule = activeSignal?.schedule || [];
  const schedule = quick15Only
    ? rawSchedule.filter((b) => (b.durationSec || 60) <= 900)
    : rawSchedule;
  const effectiveSchedule = schedule.length > 0 ? schedule : rawSchedule;
  const channelGroups = (() => {
    const groups: {
      key: string;
      name: string;
      originUrl?: string;
      avatarUrl?: string;
      coverUrl?: string;
      blocks: typeof effectiveSchedule;
    }[] = [];
    const byKey = new Map<string, (typeof groups)[number]>();
    for (const blk of effectiveSchedule) {
      const chName =
        blk.contentItem.channelTitle ||
        (blk.contentItem as any).channelName ||
        activeSignal?.name ||
        'Canal original';
      const key = chName.trim().toLowerCase();
      const resolvedAvatar = resolveKnownChannelAvatar(chName, (blk.contentItem as any).channelAvatarUrl);
      const resolvedCover = resolveKnownChannelBanner(chName, (blk.contentItem as any).channelCoverUrl);
      let grp = byKey.get(key);
      if (!grp) {
        grp = {
          key,
          name: chName,
          originUrl: (blk.contentItem as any).originUrl || undefined,
          avatarUrl: resolvedAvatar,
          coverUrl: resolvedCover,
          blocks: []
        };
        byKey.set(key, grp);
        groups.push(grp);
      }
      if (!grp.originUrl && (blk.contentItem as any).originUrl) {
        grp.originUrl = (blk.contentItem as any).originUrl;
      }
      if (!grp.avatarUrl && resolvedAvatar) {
        grp.avatarUrl = resolvedAvatar;
      }
      if (!grp.coverUrl && resolvedCover) {
        grp.coverUrl = resolvedCover;
      }
      grp.blocks.push(blk);
    }
    return groups;
  })();

  const channelKeysSignature = channelGroups.map((g) => g.key).join('|');
  useEffect(() => {
    let cancelled = false;
    const toFetch = channelGroups.filter((g) => !fetchedChannelKeysRef.current.has(g.key));
    if (toFetch.length === 0) return;

    toFetch.forEach((g) => fetchedChannelKeysRef.current.add(g.key));

    Promise.all(
      toFetch.map(async (g) => {
        const cid = resolveKnownChannelId(g.name, (g.blocks[0]?.contentItem as any)?.channelId);
        if (!cid) return null;
        const snap = await fetchChannelGridSnapshot(cid, g.name, g.originUrl);
        return { key: g.key, snap };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const updates: Record<string, ChannelGridSnapshot> = {};
        for (const r of results) {
          if (r && (r.snap.liveVideo || r.snap.latestVideos.length > 0)) {
            updates[r.key] = r.snap;
          }
        }
        if (Object.keys(updates).length > 0) {
          setChannelSnapshots((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKeysSignature]);

  const playExtraChannelVideo = useCallback(
    (v: ChannelVideoItem) => {
      const currentSchedule = activeSignal?.schedule || [];
      const existing = currentSchedule.find(
        (b) => b.contentItem.providerId === v.videoId || b.contentItem.id === v.videoId
      );
      if (existing) {
        jumpTo(existing.id);
        setViewMode('single');
        return;
      }
      const newBlk: ScheduleBlock = {
        id: `live-extra-${v.videoId}-${Date.now()}`,
        position: currentSchedule.length,
        startOffsetSec: currentSchedule.length * 600,
        durationSec: v.isLive ? 3600 : v.durationSec || 600,
        topic: v.isLive ? `EN VIVO · ${v.channelName}` : v.topic || v.channelName,
        role: 'explainer',
        contentItem: {
          id: v.videoId,
          providerId: v.videoId,
          type: 'video',
          provider: 'youtube',
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          thumbnail: v.thumbnailUrl,
          videoUrl: v.videoUrl,
          channelName: v.channelName,
          channelTitle: v.channelName,
          channelId: slugifyChannelName(v.channelName),
          originUrl: v.originUrl,
          isLive: Boolean(v.isLive),
          isVerified: true
        } as any
      };
      insert(newBlk, Math.max(0, currentBlockIndex));
      window.setTimeout(() => {
        jumpTo(newBlk.id);
        setViewMode('single');
      }, 20);
    },
    [activeSignal?.schedule, currentBlockIndex, insert, jumpTo]
  );
  const isFollowingActiveShared = Boolean(
    activeSignal?.id && followedUserSignalIds.includes(activeSignal.id)
  );

  const handleToggleFollowSharedSignal = () => {
    if (!activeSignal?.id) return;
    setFollowedUserSignalIds((prev) => {
      const exists = prev.includes(activeSignal.id);
      const nextList = exists
        ? prev.filter((id) => id !== activeSignal.id)
        : [activeSignal.id, ...prev];
      try {
        localStorage.setItem('youapp_followed_user_signals_v1', JSON.stringify(nextList));
      } catch {
        // ignore
      }
      setCuratedToast(
        exists
          ? `Dejaste de seguir «${activeSignal.name}».`
          : `Ahora seguís la señal «${activeSignal.name}».`
      );
      return nextList;
    });
  };

  const handleCloneSignalToOwn = () => {
    if (!activeSignal || !activeSignal.schedule.length) return;
    const clonedId = `signal-clon-${Date.now().toString(36)}`;
    const clonedName = `${activeSignal.name} (Mi copia)`;
    const clonedSignal: any = {
      ...activeSignal,
      id: clonedId,
      name: clonedName,
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      schedule: activeSignal.schedule.map((b, idx) => ({
        ...b,
        id: `${clonedId}-b-${idx}`,
        position: idx
      }))
    };
    setSignal(clonedSignal);
    setSearchParams({ signal: clonedId }, { replace: true });
    void persistSignal(clonedSignal);
    setCuratedToast(`Clonaste «${activeSignal.name}» en tu cuenta. Ya podés editarla.`);
  };

  const handleVideoEndedWithContinuousMode = useCallback(() => {
    if (!continuousChannelMode || channelGroups.length <= 1 || !currentBlock) {
      next();
      return;
    }
    const currentChName = (
      currentBlock.contentItem.channelTitle ||
      (currentBlock.contentItem as any).channelName ||
      activeSignal?.name ||
      ''
    )
      .trim()
      .toLowerCase();
    const curGroupIdx = channelGroups.findIndex((g) => g.key === currentChName);
    if (curGroupIdx === -1) {
      next();
      return;
    }
    const nextGroup = channelGroups[(curGroupIdx + 1) % channelGroups.length];
    const nextTargetBlock = nextGroup?.blocks[0];
    if (nextTargetBlock && nextTargetBlock.id !== currentBlock.id) {
      jumpTo(nextTargetBlock.id);
      setCuratedToast(`Emisión continua · Pasando a ${nextGroup.name}`);
    } else {
      next();
    }
  }, [activeSignal?.name, channelGroups, continuousChannelMode, currentBlock, jumpTo, next]);

  const curatedActiveDef = findCuratedSignalById(activeSignal?.id);
  const isViewingOtherSignal = Boolean(curatedActiveDef || isSharedSignalView);

  // Recuerda siempre cuál era tu propia señal antes de visitar la de otra persona
  useEffect(() => {
    if (!isViewingOtherSignal && activeSignal?.id) {
      try {
        localStorage.setItem(LAST_OWN_SIGNAL_ID_KEY, activeSignal.id);
      } catch {
        // ignore
      }
    }
  }, [activeSignal?.id, isViewingOtherSignal]);

  const handleReturnToMyOwnSignal = useCallback(() => {
    let targetId = 'justicia-social-signal-1';
    try {
      const remembered = localStorage.getItem(LAST_OWN_SIGNAL_ID_KEY);
      if (remembered && !findCuratedSignalById(remembered)) {
        targetId = remembered;
      }
    } catch {
      // ignore
    }

    const savedOwn =
      getSavedSignal(targetId) ||
      (switchableSignals[0] ? getSavedSignal(switchableSignals[0].id) : null) ||
      getSavedSignal('justicia-social-signal-1');

    setSearchParams({}, { replace: true });
    if (savedOwn && savedOwn.schedule.length > 0) {
      setSignal(savedOwn);
      setCuratedToast(`Volviste a tu señal «${savedOwn.name}».`);
    } else if (switchableSignals[0]) {
      const fallbackSig = buildSignalScheduleByProfile(
        switchableSignals[0].id,
        switchableSignals[0].name,
        switchableSignals[0].prompt
      ) as any;
      setSignal(fallbackSig);
      setCuratedToast(`Volviste a tu señal «${switchableSignals[0].name}».`);
    } else {
      const defSig = buildSignalScheduleByProfile(
        'justicia-social-signal-1',
        'Justicia Social TV'
      ) as any;
      setSignal(defSig);
      setCuratedToast('Volviste a tu señal personal.');
    }
  }, [getSavedSignal, setSearchParams, setSignal, switchableSignals]);

  // Si entran por link directo /misenal1?own=1, vuelve automáticamente a su propia señal
  useEffect(() => {
    if (searchParams.get('own') === '1') {
      handleReturnToMyOwnSignal();
    }
  }, [handleReturnToMyOwnSignal, searchParams]);

  const isCuratedFollowed = curatedActiveDef
    ? followedCuratedIds.includes(curatedActiveDef.id)
    : false;
  const totalSeconds = effectiveSchedule.reduce((acc, b) => acc + (b.durationSec || 0), 0);
  const elapsedSeconds = effectiveSchedule.slice(0, currentBlockIndex).reduce((acc, b) => acc + (b.durationSec || 0), 0);
  const signalProgress = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;
  const associatedCount = signalMemberships.filter((m) => m.membershipRole !== 'owned').length;

  const currentAssessment = evaluateEpistemicNature(
    currentBlock?.contentItem,
    activeSignal?.prompt || activeSignal?.name || 'Justicia Social TV',
    currentBlock?.role
  );

  const activeBlockThumb =
    currentBlock?.contentItem?.thumbnail ||
    (currentBlock?.contentItem as any)?.thumbnailUrl ||
    'https://i.ytimg.com/vi/0cjWa3Eizqw/hqdefault.jpg';

  return (
    <div className="ms-container fade-in">
      <div
        className="ms-ambient-bg"
        aria-hidden="true"
        style={activeBlockThumb ? { backgroundImage: `url(${activeBlockThumb})` } : undefined}
      />
      <div className="ms-ambient-veil" aria-hidden="true" />
      <audio
        ref={gridAudioRef}
        onPause={() => setIsGridAudioPlaying(false)}
        onPlay={() => setIsGridAudioPlaying(true)}
      />
      {/* --- CABECERA MINIMALISTA ADAPTABLE: 4 ÁREAS YOUAPP 2026 --- */}
      <nav className="ms-topnav">
        <div className="ms-logo-area">
          <YouAppOfficialLogo theme="dark" />
          <div className="ms-divider" />
          <div className="ms-breadcrumb">
            <span className="ms-breadcrumb-root">Mi Señal</span>
            <span className="ms-dot">•</span>
            <span className="ms-breadcrumb-current">{activeSignal?.name || 'Mi Señal Personal'}</span>
          </div>
        </div>

        <div className="ms-nav-scroller" aria-label="Áreas principales de YOUAPP">
          <button
            type="button"
            className="ms-nav-btn active"
            onClick={() => {
              if (isViewingOtherSignal) {
                navigate('/senales');
              } else {
                navigate('/senales');
              }
            }}
            title="Ir a Señales (Mis Señales + 100 Señales Temáticas)"
          >
            SEÑALES
          </button>
          <button type="button" className="ms-nav-pill" onClick={() => navigate('/mitv')}>
            <SlidersHorizontal size={13} /> MITV
          </button>
          <button type="button" className="ms-nav-btn" onClick={() => navigate('/youmusic')}>
            YOU MUSIC
          </button>
          <button type="button" className="ms-nav-btn" onClick={() => navigate('/reels')}>
            REELS
          </button>
          <button type="button" className="ms-nav-btn" onClick={() => navigate('/lecturas')}>
            LECTURAS
          </button>
          <button type="button" className="ms-nav-btn" onClick={() => navigate('/my-lists')}>
            MIS LISTAS
          </button>
          <button type="button" className="ms-nav-btn" onClick={() => navigate('/perfil')}>
            MI PERFIL
          </button>
          <button
            type="button"
            className="ms-nav-btn"
            title="Buscar videos, canales y música en YOUAPP"
            aria-label="Buscar"
            onClick={() => navigate('/search')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px' }}
          >
            <Search size={16} />
          </button>
        </div>

        <div className="ms-user-area">
          <TvUserSessionMenu variant="glass" />
        </div>
      </nav>

      {/* --- HERO DE LA SEÑAL: PORTADA GRANDE DEBAJO DE YOUAPP TV + FOTO DE PERFIL A LA IZQUIERDA --- */}
      <section className="ms-hero-shell" aria-label={`Identidad de ${activeSignal?.name || 'Mi Señal'}`}>
        {isFollowInvitePrompt && (
          <div className="ms-follow-invite-banner" role="region" aria-label="Invitación a seguir esta señal">
            <span>
              <Sparkles size={14} color="#64d2ff" />
              Te invitaron a seguir <strong>«{activeSignal?.name || 'esta señal'}»</strong> en YOUAPP
            </span>
            <button
              type="button"
              className="ms-hero-primary-btn"
              onClick={async () => {
                const sigKey = activeSignal?.id || 'default-signal';
                const { data } = await supabase.auth.getSession();
                const user = data.session?.user;
                if (!user || user.is_anonymous) {
                  setCuratedToast('Iniciá sesión en 1 paso para seguir esta señal y guardarla en tu cuenta.');
                  const backUrl = `${window.location.pathname}${window.location.search}`;
                  navigate(`/login?next=${encodeURIComponent(backUrl)}`);
                  return;
                }
                setSocialGraph((prev) => {
                  const nextIds = prev.followedSignalIds.includes(sigKey)
                    ? prev.followedSignalIds
                    : [sigKey, ...prev.followedSignalIds];
                  return saveSocialGraph({ ...prev, followedSignalIds: nextIds });
                });
                recordBridgeFollow(sigKey, incomingBridgeSource);
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete('follow');
                setSearchParams(nextParams, { replace: true });
                setCuratedToast(`¡Ahora seguís a «${activeSignal?.name || 'esta señal'}» en YOUAPP!`);
              }}
            >
              <UserPlus size={13} />
              <span>Seguir en 1 clic</span>
            </button>
          </div>
        )}
        <div className="ms-hero-card">
          <div
            className="ms-hero-cover"
            style={
              curatedActiveDef
                ? {
                    background: `linear-gradient(125deg, #1d1d1f 0%, #2c2c34 45%, ${curatedActiveDef.accentColor} 100%)`
                  }
                : resolvedTopCover
                ? { backgroundImage: `url(${resolvedTopCover})` }
                : undefined
            }
          >
            <div className="ms-signal-cover-scrim" />
            <span className="ms-live-air-pill" aria-label="Señal al aire">
              <span className="ms-live-air-dot" />
              <span>AL AIRE</span>
            </span>
            {isViewingOtherSignal ? (
              <div className="ms-recommended-cover-bar">
                <span className="ms-recommended-pill">
                  {curatedActiveDef ? '✦ Señal recomendada' : '✦ Señal de otro creador'}
                </span>
                <button
                  type="button"
                  className="ms-cover-edit-btn ms-back-own-btn"
                  onClick={handleReturnToMyOwnSignal}
                  title="Volver a tu señal personal"
                >
                  ← Volver a Mi Señal
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="ms-cover-edit-btn"
                  onClick={() => coverFileInputRef.current?.click()}
                  title="Subir o cambiar foto de portada de esta señal"
                >
                  <Camera size={12} />
                  <span>{resolvedTopCover ? 'Cambiar portada' : 'Subir portada'}</span>
                </button>
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleUploadBrandingImage('cover', e)}
                />
              </>
            )}
          </div>

          <div className="ms-hero-bar">
            <div className="ms-hero-left">
              {curatedActiveDef ? (
                <div
                  className="ms-hero-avatar-readonly"
                  style={{
                    background: `linear-gradient(135deg, ${curatedActiveDef.accentColor} 0%, #1d1d1f 100%)`
                  }}
                  aria-hidden="true"
                >
                  <Sparkles size={22} />
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="ms-hero-avatar-btn"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title="Subir o cambiar foto de perfil de esta señal"
                    aria-label="Cambiar foto de perfil de esta señal"
                  >
                    {resolvedTopAvatar ? (
                      <img
                        src={resolvedTopAvatar}
                        alt={activeSignal?.name || 'Perfil de señal'}
                        className="ms-signal-avatar-img"
                      />
                    ) : (
                      <span className="ms-signal-avatar-empty" aria-hidden="true">
                        <Camera size={22} />
                      </span>
                    )}
                    <span className="ms-signal-avatar-hover" aria-hidden="true">
                      <Camera size={16} />
                    </span>
                  </button>
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => void handleUploadBrandingImage('avatar', e)}
                  />
                </>
              )}

              <div className="ms-hero-title-col">
                <div className="ms-hero-name-line">
                  {curatedActiveDef ? (
                    <h1 className="ms-hero-title">{activeSignal?.name || curatedActiveDef.title}</h1>
                  ) : isEditingSignalName ? (
                    <form onSubmit={commitSignalName} className="ms-signal-name-form">
                      <input
                        ref={signalNameInputRef}
                        type="text"
                        value={signalNameDraft}
                        onChange={(e) => setSignalNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsEditingSignalName(false);
                          }
                        }}
                        maxLength={48}
                        placeholder="Nombre de tu señal…"
                        className="ms-signal-name-input"
                        aria-label="Editar nombre de mi señal"
                      />
                      <button
                        type="submit"
                        className="ms-signal-name-action save"
                        title="Guardar nombre"
                        aria-label="Guardar nombre"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        className="ms-signal-name-action cancel"
                        onClick={() => setIsEditingSignalName(false)}
                        title="Cancelar"
                        aria-label="Cancelar edición"
                      >
                        <X size={12} />
                      </button>
                    </form>
                  ) : (
                    <div className="ms-signal-name-display">
                      <h1
                        className="ms-hero-title"
                        onClick={startEditingSignalName}
                        title="Hacé clic para editar el nombre de tu señal"
                        style={{ cursor: 'pointer' }}
                      >
                        {activeSignal?.name || 'Mi Señal Personal'}
                      </h1>
                      <button
                        type="button"
                        className="ms-signal-name-edit-btn"
                        onClick={startEditingSignalName}
                        title="Editar nombre de mi señal"
                        aria-label="Editar nombre de mi señal"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="ms-hero-sub">
                  {(() => {
                    const sigKey = activeSignal?.id || 'default-signal';
                    const selfFollows =
                      socialGraph.followedSignalIds.includes(sigKey) ||
                      isFollowingActiveShared ||
                      isCuratedFollowed;
                    const realFollowers = (selfFollows ? 1 : 0) + associatedCount;
                    const realFollowing = new Set([
                      ...socialGraph.followedSignalIds,
                      ...followedUserSignalIds,
                      ...followedCuratedIds
                    ]).size;
                    return (
                      <>
                        <span className="ms-hero-fb-stat" title="Seguidores reales registrados en YOUAPP">
                          <strong className="ms-hero-stat-num">{realFollowers}</strong>{' '}
                          {realFollowers === 1 ? 'seguidor' : 'seguidores'}
                        </span>
                        <span>·</span>
                        <span className="ms-hero-fb-stat" title="Señales y canales que seguís en YOUAPP">
                          <strong className="ms-hero-stat-num">{realFollowing}</strong>{' '}
                          {realFollowing === 1 ? 'seguido' : 'seguidos'}
                        </span>
                        <span>·</span>
                      </>
                    );
                  })()}
                  {signalEventMeta && (() => {
                    const ev = getSignalEventPhase(signalEventMeta);
                    return (
                      <>
                        <span className={`ms-event-phase-pill ${ev.phase.toLowerCase()}`}>
                          {ev.phase === 'LIVE' ? '● ' : ''}
                          {ev.badge} · {signalEventMeta.category}
                        </span>
                        <span>{ev.detail}</span>
                        <span>·</span>
                      </>
                    );
                  })()}
                  <span
                    className="ms-sync-tag"
                    title={`${curatedActiveDef ? 'Señal recomendada' : isSharedSignalView ? 'Señal compartida' : 'Mi Señal'} · ${channelGroups.length} ${channelGroups.length === 1 ? 'canal' : 'canales'}${!curatedActiveDef ? ` · ${persistStatus === 'saving' ? 'Guardando…' : persistStatus === 'saved' ? 'Nube activa' : 'Local'}` : ''}`}
                    aria-label="Señal activa"
                  >
                    <Radio size={13} />
                  </span>
                </div>

                {/* Botón de Suscripción Universal debajo del perfil (YOUAPP + YouTube oficial) */}
                {(() => {
                  const sigKey = activeSignal?.id || 'default-signal';
                  const isSub = socialGraph.followedSignalIds.includes(sigKey);
                  const curItem = currentBlock?.contentItem as any;
                  const heroYtSubUrl = curItem
                    ? buildYouTubeSubscribeUrl({
                        channelId: curItem.channelId,
                        sourceUrl: curItem.originUrl || curItem.videoUrl
                      })
                    : null;
                  return (
                    <div className="ms-hero-sub-cta-row">
                      <button
                        type="button"
                        className={`ms-hero-subscribe-btn ${isSub ? 'subscribed' : ''}`}
                        onClick={() => {
                          const willSubscribe = !isSub;
                          setSocialGraph((prev) => {
                            const { next } = toggleInList(prev.followedSignalIds, sigKey);
                            return saveSocialGraph({ ...prev, followedSignalIds: next });
                          });
                          if (willSubscribe && heroYtSubUrl) {
                            window.open(
                              heroYtSubUrl,
                              'youapp_yt_sub',
                              'width=540,height=660,noopener,noreferrer'
                            );
                            setCuratedToast(
                              `Suscripto a «${activeSignal?.name || 'Mi Señal'}» en YOUAPP · Confirmá también en YouTube.`
                            );
                          } else {
                            setCuratedToast(
                              willSubscribe
                                ? `Suscripto a «${activeSignal?.name || 'Mi Señal'}» en YOUAPP.`
                                : `Suscripción quitada de «${activeSignal?.name || 'Mi Señal'}».`
                            );
                          }
                        }}
                        title={
                          heroYtSubUrl
                            ? `${isSub ? 'Suscripto' : 'Suscribite'} · Suscripción universal (YOUAPP + YouTube)`
                            : isSub
                            ? 'Suscripto a esta señal'
                            : 'Suscribite a esta señal'
                        }
                        aria-label={isSub ? 'Suscripto' : 'Suscribite'}
                      >
                        {isSub ? <UserCheck size={13} /> : <UserPlus size={13} />}
                        <span>{isSub ? 'Suscripto' : 'Suscribite'}</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="ms-hero-actions">
              {isViewingOtherSignal && (
                <>
                  <button
                    type="button"
                    className="ms-hero-pill-btn active-follow"
                    onClick={handleReturnToMyOwnSignal}
                    title="Volver a tu propia señal"
                  >
                    <span>← Volver a Mi Señal</span>
                  </button>
                  <button
                    type="button"
                    className={`ms-hero-pill-btn ${isFollowingActiveShared ? 'active-follow' : ''}`}
                    onClick={handleToggleFollowSharedSignal}
                  >
                    <Check size={13} />
                    <span>{isFollowingActiveShared ? 'Siguiendo' : 'Seguir señal'}</span>
                  </button>
                  <button
                    type="button"
                    className="ms-hero-primary-btn"
                    onClick={handleCloneSignalToOwn}
                    title="Copiar todos los canales de esta señal a tu propia cuenta"
                  >
                    <Copy size={13} />
                    <span>Clonar en Mi Señal</span>
                  </button>
                </>
              )}

              {/* 0. Explorar las 100 señales + Armá tu señal con ATLAS */}
              <button
                type="button"
                className="ms-hero-pill-btn ms-hero-icon-reveal"
                onClick={() => navigate('/senales')}
                title="Explorar las 100 señales temáticas o armar tu señal con ATLAS"
                aria-label="Explorar señales"
                style={{
                  background: 'rgba(0, 113, 227, 0.28)',
                  borderColor: 'rgba(100, 210, 255, 0.5)'
                }}
              >
                <Sparkles size={14} color="#7dd3fc" />
                <span className="ms-hero-reveal-label">+ Señales</span>
              </button>

              {/* 1. Cambiar señal + Nueva señal */}
              <div style={{ position: 'relative', zIndex: 80 }}>
                <button
                  type="button"
                  className="ms-hero-pill-btn ms-hero-icon-reveal"
                  onClick={() => {
                    setShowShareMenu(false);
                    setShowToolsMenu(false);
                    setShowSignalSwitcher((v) => !v);
                  }}
                  title={`Cambiar señal${switchableSignals.length > 0 ? ` (${switchableSignals.length})` : ''} · Mis señales guardadas o crear una nueva`}
                  aria-label="Cambiar señal"
                >
                  <Tv size={14} />
                  <span className="ms-hero-reveal-label">
                    Cambiar señal{switchableSignals.length > 0 ? ` (${switchableSignals.length})` : ''}
                  </span>
                </button>
                {showSignalSwitcher && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 180 }}
                      onClick={() => setShowSignalSwitcher(false)}
                      aria-hidden="true"
                    />
                    <div
                      className="ms-hero-switcher-menu"
                      style={{ zIndex: 200, maxHeight: '320px', overflowY: 'auto' }}
                      role="listbox"
                      aria-label="Mis señales guardadas"
                    >
                      <div
                        style={{
                          padding: '6px 10px 4px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: 'rgba(245, 245, 247, 0.58)'
                        }}
                      >
                        Mis señales
                      </div>
                      {switchableSignals.map((sig) => {
                        const sigBranding = signalBrandingMap[sig.id];
                        const sigCover = sigBranding?.coverDataUrl || sigBranding?.avatarDataUrl || '';
                        return (
                          <div
                            key={sig.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <button
                              type="button"
                              className={`ms-hero-switcher-item ${sig.id === activeSignal?.id ? 'current' : ''}`}
                              style={{ flex: 1, gap: '9px' }}
                              onClick={() => {
                                setShowSignalSwitcher(false);
                                handleSelectSignal(sig);
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '9px',
                                  minWidth: 0,
                                  flex: 1
                                }}
                              >
                                {sigCover && (
                                  <img
                                    src={sigCover}
                                    alt={`Portada de ${sig.name}`}
                                    style={{
                                      width: '44px',
                                      height: '26px',
                                      borderRadius: '6px',
                                      objectFit: 'cover',
                                      flexShrink: 0,
                                      border: '1px solid rgba(255, 255, 255, 0.22)',
                                      background: 'rgba(0, 0, 0, 0.35)'
                                    }}
                                  />
                                )}
                                <span
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {sig.name}
                                </span>
                              </span>
                              {sig.id === activeSignal?.id && <Check size={13} color="#64d2ff" />}
                            </button>
                            {sig.id !== activeSignal?.id && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSavedSignal(sig.id);
                                  setSwitchableSignals((prev) =>
                                    prev.filter((item) => item.id !== sig.id)
                                  );
                                }}
                                title={`Quitar «${sig.name}» de esta lista`}
                                aria-label={`Quitar ${sig.name}`}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'rgba(245, 245, 247, 0.55)',
                                  cursor: 'pointer',
                                  padding: '5px',
                                  borderRadius: '8px',
                                  display: 'inline-flex',
                                  alignItems: 'center'
                                }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <div
                        style={{
                          height: '1px',
                          background: 'rgba(255, 255, 255, 0.12)',
                          margin: '5px 4px'
                        }}
                      />
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        style={{ color: '#64d2ff', fontWeight: 650 }}
                        onClick={() => {
                          setShowSignalSwitcher(false);
                          navigate('/create-signal');
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                          <Plus size={13} />
                          <span>Nueva señal</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 2. Compartir (Video + Link señal + Antena web) */}
              <div style={{ position: 'relative', zIndex: 80 }}>
                <button
                  type="button"
                  className="ms-hero-pill-btn ms-hero-icon-reveal"
                  onClick={() => {
                    setShowSignalSwitcher(false);
                    setShowToolsMenu(false);
                    setShowShareMenu((v) => !v);
                  }}
                  title="Compartir · Video, enlace de señal, QR o Antena web"
                  aria-label="Compartir"
                >
                  <Share2 size={14} />
                  <span className="ms-hero-reveal-label">Compartir</span>
                </button>
                {showShareMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 180 }}
                      onClick={() => setShowShareMenu(false)}
                      aria-hidden="true"
                    />
                    <div
                      className="ms-hero-switcher-menu"
                      style={{ zIndex: 200, minWidth: '245px' }}
                      role="menu"
                      aria-label="Opciones para compartir"
                    >
                      {!curatedActiveDef && (
                        <button
                          type="button"
                          className="ms-hero-switcher-item"
                          onClick={() => {
                            setShowShareMenu(false);
                            openWhatsAppSignalShare({
                              signalId: activeSignal?.id || 'justicia-social-signal-1',
                              signalName: activeSignal?.name || 'Mi Señal',
                              itemCount: activeSignal?.schedule?.length || 0,
                              description: activeSignal?.prompt || ''
                            });
                            setCuratedToast('Abriendo WhatsApp para compartir tu señal…');
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <Share2 size={13} color="#25D366" />
                            <span style={{ fontWeight: 700, color: '#9bf5bd' }}>
                              Compartir señal por WhatsApp
                            </span>
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={async () => {
                          setShowShareMenu(false);
                          const vid =
                            currentBlock?.contentItem?.providerId ||
                            currentBlock?.contentItem?.id ||
                            '';
                          const res = await shareYouAppVideo({
                            videoId: vid,
                            startSec: usePlayerStore.getState().currentTime,
                            title: currentBlock?.contentItem?.title || activeSignal?.name || 'YOUAPP TV',
                            channelName:
                              currentBlock?.contentItem?.channelTitle || activeSignal?.name || 'YOUAPP TV'
                          });
                          if (res.status === 'copied') {
                            setCuratedToast('Enlace del video en YOUAPP copiado al portapapeles.');
                          }
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Share2 size={13} color="#64d2ff" />
                          <span>Compartir video actual</span>
                        </span>
                      </button>
                      {!curatedActiveDef && !isSharedSignalView && (
                        <button
                          type="button"
                          className="ms-hero-switcher-item"
                          onClick={async () => {
                            setShowShareMenu(false);
                            const url = buildYouAppFullSignalShareUrl(
                              activeSignal?.id || 'justicia-social-signal-1'
                            );
                            try {
                              await navigator.clipboard.writeText(url);
                              setCuratedToast(
                                'Enlace de tu señal completa copiado (otros pueden seguirla o clonarla).'
                              );
                            } catch {
                              setCuratedToast(url);
                            }
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <Copy size={13} color="#64d2ff" />
                            <span>Copiar link de la señal</span>
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={() => {
                          setShowShareMenu(false);
                          setIsInviteModalOpen(true);
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <UserPlus size={13} color="#64d2ff" />
                          <span>Invitar seguidores (QR y bio)</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={() => {
                          setShowShareMenu(false);
                          setIsAntennaModalOpen(true);
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Code2 size={13} color="#64d2ff" />
                          <span>Antena web (insertar)</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 3. Herramientas (Cobertura, Radio y Noticias, Repetidoras, Studio) */}
              <div style={{ position: 'relative', zIndex: 80 }}>
                <button
                  type="button"
                  className="ms-hero-pill-btn ms-hero-icon-reveal"
                  onClick={() => {
                    setShowSignalSwitcher(false);
                    setShowShareMenu(false);
                    setShowToolsMenu((v) => !v);
                  }}
                  title="Herramientas · Cobertura, Radio y Noticias, Repetidoras, Studio"
                  aria-label="Herramientas"
                >
                  <MoreHorizontal size={14} />
                  <span className="ms-hero-reveal-label">Herramientas</span>
                </button>
                {showToolsMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 180 }}
                      onClick={() => setShowToolsMenu(false)}
                      aria-hidden="true"
                    />
                    <div
                      className="ms-hero-switcher-menu"
                      style={{ zIndex: 200, minWidth: '220px' }}
                      role="menu"
                      aria-label="Herramientas de señal"
                    >
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={() => {
                          setShowToolsMenu(false);
                          setMobileTab('schedule');
                          setShowToolsDrawer(true);
            setEventCoverageOpenTick((t) => t + 1);
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Activity size={13} color="#ff6961" />
                          <span>Cobertura en vivo</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={() => {
                          setShowToolsMenu(false);
                          navigate(
                            `/misenal-medios?signal=${encodeURIComponent(
                              activeSignal?.id || 'justicia-social-signal-1'
                            )}`
                          );
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Radio size={13} color="#64d2ff" />
                          <span>Radio y Noticias</span>
                        </span>
                      </button>
                      <div
                        style={{
                          height: '1px',
                          background: 'rgba(255, 255, 255, 0.12)',
                          margin: '4px'
                        }}
                      />
                      <button
                        type="button"
                        className="ms-hero-switcher-item"
                        onClick={() => {
                          setShowToolsMenu(false);
                          navigate('/repetidoras');
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Repeat size={13} color="#64d2ff" />
                          <span>Repetidoras</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- ESCENARIO PRINCIPAL (REPRODUCTOR + SMARTBAR + GRILLA VERTICAL) --- */}
      <main className="ms-main">
        {/* COLUMNA IZQUIERDA: REPRODUCTOR IDÉNTICO A MITV */}
        <div className="ms-player-section">
          {/* Tarjeta unificada del reproductor (Video + Franja MiTV + SmartBar 3 puntos) */}
          <section className={`ms-player-card ${isStageExpanded ? 'is-expanded' : ''}`}>
          {liveGreetings.length > 0 && (
            <div className="ms-live-greetings-overlay" aria-live="polite">
              {liveGreetings.map((g) => (
                <div key={g.id} className="ms-live-greeting-pill">
                  <span>{g.emoji}</span>
                  <span>
                    <strong>{g.from}:</strong> {g.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div
            className="you-tv-stage ms-stage-box"
            onMouseMove={revealStageControls}
            onTouchStart={revealStageControls}
            onClick={revealStageControls}
          >
            {isStageExpanded && (
              <button
                type="button"
                className="ms-fs-exit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsStageExpanded(false);
                }}
                title="Salir de pantalla ampliada (Esc)"
                aria-label="Salir de pantalla ampliada"
              >
                <Minimize2 size={15} />
                <span>Salir</span>
              </button>
            )}
            {currentBlock ? (
              viewMode === 'you4' ? (() => {
                // Construye 4 pantallas reales con los videos de las señales (priorizando la señal activa + resto de señales)
                const pool: {
                  id: string;
                  blockId?: string;
                  title: string;
                  channelName: string;
                  provider: string;
                  providerId: string;
                  videoUrl?: string;
                  thumbnailUrl?: string;
                }[] = [];
                const seenIds = new Set<string>();
                const totalOwn = effectiveSchedule.length;
                for (let step = 0; step < totalOwn; step++) {
                  const idx = (currentBlockIndex + you4Offset + step) % totalOwn;
                  const blk = effectiveSchedule[idx];
                  if (!blk) continue;
                  const ci = blk.contentItem as any;
                  const pid = String(ci.providerId || ci.id || '').trim();
                  if (!pid || seenIds.has(pid)) continue;
                  seenIds.add(pid);
                  pool.push({
                    id: blk.id,
                    blockId: blk.id,
                    title: ci.title || blk.topic || 'Video de señal',
                    channelName: ci.channelTitle || ci.channelName || activeSignal?.name || 'Mi Señal',
                    provider: ci.provider || 'youtube',
                    providerId: pid,
                    videoUrl: ci.videoUrl,
                    thumbnailUrl: ci.thumbnail || ci.thumbnailUrl
                  });
                  if (pool.length >= 4) break;
                }
                if (pool.length < 4) {
                  for (const sig of CURATED_SIGNALS_PILOT) {
                    for (const ch of sig.channels) {
                      if (seenIds.has(ch.videoId)) continue;
                      seenIds.add(ch.videoId);
                      pool.push({
                        id: `cur-${sig.id}-${ch.id}`,
                        title: ch.videoTitle,
                        channelName: `${ch.channelName} · ${sig.title}`,
                        provider: 'youtube',
                        providerId: ch.videoId,
                        videoUrl: `https://www.youtube.com/watch?v=${ch.videoId}`,
                        thumbnailUrl: `https://i.ytimg.com/vi/${ch.videoId}/hqdefault.jpg`
                      });
                      if (pool.length >= 4) break;
                    }
                    if (pool.length >= 4) break;
                  }
                }
                const quadItems = pool.slice(0, 4);
                const ytOrigin =
                  typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

                return (
                  <div className="ms-you4-grid" aria-label="YOU4 · 4 pantallas simultáneas de señales">
                    {quadItems.map((slot, slotIdx) => {
                      const isAudioActive = you4AudioSlot === slotIdx;
                      const isDirect =
                        slot.provider === 'direct' ||
                        Boolean(slot.videoUrl && /\.(mp4|webm|m3u8)(\?|$)/i.test(slot.videoUrl));

                      return (
                        <div
                          key={`${slot.id}-${slotIdx}`}
                          className={`ms-you4-tile ${isAudioActive ? 'audio-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectYou4Audio(slotIdx);
                          }}
                        >
                          {isDirect && slot.videoUrl ? (
                            <video
                              ref={(el) => {
                                you4VideosRef.current[slotIdx] = el;
                              }}
                              src={slot.videoUrl}
                              autoPlay
                              loop
                              playsInline
                              muted={!isAudioActive}
                              onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                const dur = Number.isFinite(v.duration) ? v.duration : 0;
                                you4ProgressRef.current[slotIdx] = {
                                  currentTime: v.currentTime || 0,
                                  duration: dur,
                                  playing: !v.paused
                                };
                                if (slotIdx === you4AudioSlotRef.current && dur > 0) {
                                  usePlayerStore.getState().setProgress(v.currentTime || 0, dur);
                                }
                              }}
                              className="ms-you4-media"
                            />
                          ) : (
                            <iframe
                              ref={(el) => {
                                you4IframesRef.current[slotIdx] = el;
                              }}
                              title={`YOU4 · ${slot.title}`}
                              src={`https://www.youtube.com/embed/${encodeURIComponent(slot.providerId)}?autoplay=1&mute=${slotIdx === 0 ? 0 : 1}&controls=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${ytOrigin ? `&origin=${ytOrigin}` : ''}`}
                              onLoad={(e) => {
                                try {
                                  e.currentTarget.contentWindow?.postMessage(
                                    JSON.stringify({ event: 'listening', id: slotIdx, channel: 'widget' }),
                                    '*'
                                  );
                                } catch {
                                  // ignore
                                }
                              }}
                              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                              allowFullScreen
                              className="ms-you4-media"
                            />
                          )}

                          <div className="ms-you4-top-bar">
                            <span className="ms-you4-ch-badge">
                              {slotIdx + 1} · {slot.channelName}
                            </span>
                            <div className="ms-you4-tile-actions">
                              <button
                                type="button"
                                className={`ms-you4-chip ${isAudioActive ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectYou4Audio(slotIdx);
                                }}
                                title={isAudioActive ? 'Audio activo en esta pantalla' : 'Escuchar esta pantalla'}
                              >
                                {isAudioActive ? <Volume2 size={11} /> : <VolumeX size={11} />}
                                <span>{isAudioActive ? 'Audio' : 'Mudo'}</span>
                              </button>
                              <button
                                type="button"
                                className="ms-you4-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (slot.blockId) {
                                    jumpTo(slot.blockId);
                                  }
                                  setViewMode('single');
                                }}
                                title="Ver esta pantalla en grande"
                                aria-label="Ver esta pantalla en grande"
                              >
                                <Maximize2 size={11} />
                              </button>
                            </div>
                          </div>

                          <div className="ms-you4-bottom-bar">
                            <span className="ms-you4-title">{slot.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : viewMode === 'mosaic' && moments.length >= 4 ? (
                <div style={{ position: 'absolute', inset: 0 }}>
                  <MosaicPlayerGrid
                    moments={moments}
                    currentBlock={currentBlock}
                    onSelect={(m) => handleMomentClick(m)}
                    thumbnailFallbackUrl={activeBlockThumb}
                    isPlaying={isPlaying}
                  />
                  {isAnalyzingYOU4 && (
                    <div className="ms-analyzing-pill">
                      <Sparkles size={16} /> ✦ Analizando video...
                    </div>
                  )}
                  <YouRing
                    playing={isPlaying}
                    signalProgress={signalProgress}
                    onPlayPause={handlePlayPause}
                    onNext={handleNext}
                    onPrevious={handlePrevious}
                    onSurprise={handleSurprise}
                    onDirector={handleDirector}
                    isMosaic={true}
                    onExitMosaic={() => setViewMode('single')}
                  />
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0 }}>
                  {currentBlock.contentItem.provider === 'dailymotion' ||
                  Boolean(extractDailymotionVideoId(currentBlock.contentItem.videoUrl || '')) ? (
                    <DailymotionOfficialPlayer
                      videoIdOrUrl={
                        currentBlock.contentItem.videoUrl ||
                        currentBlock.contentItem.providerId ||
                        currentBlock.contentItem.id
                      }
                    />
                  ) : (
                    <YouAppPlayer
                      key={`${currentBlock.id}-${currentBlock.contentItem.providerId || currentBlock.contentItem.id}`}
                      ref={playerRef}
                      item={{
                        blockId: currentBlock.id,
                        provider: currentBlock.contentItem.provider as any,
                        providerContentId: currentBlock.contentItem.providerId || currentBlock.contentItem.id,
                        playbackUrl: currentBlock.contentItem.videoUrl,
                        title: currentBlock.contentItem.title,
                        durationSec: currentBlock.durationSec,
                        autoplay: true,
                        muted: !userAudioUnlocked
                      }}
                      onEnded={handleVideoEndedWithContinuousMode}
                      onError={(err) => {
                        console.error(err);
                        if (isUnplayableYouTubeError(err)) {
                          const ytId = currentBlock.contentItem.providerId || currentBlock.contentItem.id;
                          void reportUnplayableYouTubeVideo(ytId, err, 'MiSenal1');
                          if (canAutoSkip('MiSenal1')) {
                            handleVideoEndedWithContinuousMode();
                          }
                        }
                      }}
                      onReady={(duration) => {
                        resetAutoSkip('MiSenal1');
                        if (
                          !currentBlock?.durationSec ||
                          currentBlock.durationSec <= 0 ||
                          Math.abs(duration - currentBlock.durationSec) > 10
                        ) {
                          void fetchMoments(duration);
                        }
                      }}
                      hideResumePrompt
                    />
                  )}

                  {/* Capa sutil que se atenúa sola mientras reproduce (video limpio sin textos superpuestos) */}
                  <div className={`ms-stage-hud ${controlsVisible ? 'visible' : 'hidden-hud'}`}>
                    <YouRing
                      playing={isPlaying}
                      signalProgress={signalProgress}
                      onPlayPause={handlePlayPause}
                      onNext={handleNext}
                      onPrevious={handlePrevious}
                      onSurprise={() => {
                        setViewMode((prev) => {
                          const nextMode = prev === 'you4' ? 'single' : 'you4';
                          if (nextMode === 'you4') {
                            setYou4AudioSlot(0);
                            setYou4Offset(0);
                          }
                          return nextMode;
                        });
                      }}
                      onDirector={handleDirector}
                      isMosaic={false}
                    />
                  </div>
                </div>
              )
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                Iniciando emisión...
              </div>
            )}
          </div>

          {/* BARRA EDITORIAL + SMARTBAR DESPLEGABLES CON BOTÓN BLANCO + PUNTO ROJO ATLAS */}
          <PlayerControlsDrawer
            quickSaveItem={
              currentBlock
                ? {
                    id: currentBlock.contentItem?.id || currentBlock.id,
                    videoId: (currentBlock.contentItem as { providerId?: string })?.providerId,
                    title: currentBlock.contentItem?.title || activeSignal?.name || 'Video',
                    author:
                      (currentBlock.contentItem as { channelTitle?: string; author?: string })?.channelTitle ||
                      (currentBlock.contentItem as { author?: string })?.author ||
                      activeSignal?.name,
                    thumbnailUrl: currentBlock.contentItem?.thumbnailUrl,
                    sourceUrl: (currentBlock.contentItem as { sourceUrl?: string; url?: string })?.sourceUrl ||
                      (currentBlock.contentItem as { url?: string })?.url,
                    provider: currentBlock.contentItem?.provider || 'youtube'
                  }
                : null
            }
          >
          {currentBlock && (() => {
            const ci = currentBlock.contentItem as any;
            const ytId =
              (ci?.providerId && /^[A-Za-z0-9_-]{11}$/.test(String(ci.providerId)) && String(ci.providerId)) ||
              (ci?.id && /^[A-Za-z0-9_-]{11}$/.test(String(ci.id)) && String(ci.id)) ||
              '';
            const sourceUrl =
              ci?.sourceUrl ||
              ci?.url ||
              (ytId ? `https://www.youtube.com/watch?v=${ytId}` : window.location.href);
            const authorName = ci?.channelTitle || ci?.author || activeSignal?.name || 'YOUAPP';
            const likeKey = ytId ? `yt:${ytId}` : `ms:${ci?.id || currentBlock.id}`;
            const isLiked = Boolean(socialGraph?.likedVideoKeys?.includes(likeKey));
            const likeCount = socialGraph?.videoLikeCounts?.[likeKey] ?? 0;
            const followKey = `creator:${authorName.toLowerCase()}`;
            const isFollowed = Boolean(socialGraph?.followedCreatorKeys?.includes(followKey));
            const ytSubUrl = buildYouTubeSubscribeUrl({
              channelId: ci?.channelId,
              sourceUrl: ci?.originUrl || sourceUrl
            });
            const channelAvatar = resolveKnownChannelAvatar(authorName, ci?.channelAvatarUrl);
            const viewsLabel = formatCompactViews(playingVideoMeta?.viewCount, Boolean(playingVideoMeta?.isLive));
            const dateLabel = formatPublishedDateEs(playingVideoMeta?.publishedAt || ci?.publishedAt);

            return (
              <div className="ms-mitv-info-bar">
                <div className="ms-mitv-top-row">
                  <div className="ms-mitv-social-left">
                    <button
                      type="button"
                      className="ms-channel-profile-pill"
                      onClick={() =>
                        navigate(`/canal/${slugifyChannelName(authorName)}`, {
                          state: {
                            channelName: authorName,
                            originUrl: ci?.originUrl || sourceUrl,
                            avatarUrl: channelAvatar
                          }
                        })
                      }
                      title={`Ver perfil del canal ${authorName}`}
                    >
                      {channelAvatar ? (
                        <img
                          src={channelAvatar}
                          alt=""
                          style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: 'rgba(10, 132, 255, 0.35)',
                            color: '#ffffff',
                            fontSize: 10,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          {(authorName.trim()[0] || 'C').toUpperCase()}
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{authorName}</span>
                    </button>

                    <button
                      type="button"
                      className={`ms-top-icon-btn ${likeCount > 0 ? 'has-count' : ''} ${isLiked ? 'is-liked' : ''}`}
                      onClick={() => {
                        setSocialGraph((prev) => {
                          const res = toggleLikeVideoWithMeta(prev, {
                            key: likeKey,
                            title: ci?.title || 'Video',
                            author: authorName,
                            thumbnailUrl:
                              ci?.thumbnail ||
                              ci?.thumbnailUrl ||
                              (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''),
                            sourceUrl
                          });
                          setCuratedToast(res.active ? `❤️ Te gusta (${res.count})` : 'Me gusta quitado.');
                          return res.graph;
                        });
                      }}
                      title={isLiked ? `Te gusta (${likeCount})` : 'Me gusta'}
                      aria-label="Me gusta"
                      aria-pressed={isLiked}
                    >
                      <Heart size={14} fill={isLiked ? '#ff375f' : 'none'} strokeWidth={2.1} />
                      {likeCount > 0 && <span className="ms-like-count">{likeCount}</span>}
                    </button>

                    <button
                      type="button"
                      className={`ms-top-icon-btn ${isFollowed ? 'is-subbed' : ''}`}
                      onClick={() => {
                        const willSub = !isFollowed;
                        setSocialGraph((prev) =>
                          toggleFollowCreatorWithMeta(prev, {
                            key: followKey,
                            name: authorName,
                            provider: ci?.provider || 'youtube',
                            sourceUrl
                          }).graph
                        );
                        const isApk = Boolean((window as unknown as { YouAppAndroidPiP?: unknown }).YouAppAndroidPiP) || /;\s*wv\)/i.test(navigator.userAgent || '');
                        if (willSub && ytSubUrl && !isApk) {
                          window.open(ytSubUrl, 'youapp_yt_sub', 'width=540,height=660,noopener,noreferrer');
                          setCuratedToast(`Siguiendo a «${authorName}» en YOUAPP y YouTube.`);
                        } else {
                          setCuratedToast(
                            willSub ? `Siguiendo a «${authorName}».` : `Dejaste de seguir a «${authorName}».`
                          );
                        }
                      }}
                      title={isFollowed ? 'Siguiendo canal' : 'Seguir / Suscribirse al canal'}
                      aria-label={isFollowed ? 'Siguiendo canal' : 'Seguir canal'}
                      aria-pressed={isFollowed}
                    >
                      {isFollowed ? <UserCheck size={15} strokeWidth={2.2} /> : <UserPlus size={15} strokeWidth={2.1} />}
                    </button>
                  </div>

                  <div className="ms-mitv-actions-right">
                    <button
                      type="button"
                      className="ms-top-icon-btn"
                      onClick={async () => {
                        const shareUrl = ytId
                          ? `https://youapptv.com/mitv?add=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}`
                          : window.location.href;
                        await shareContentUniversal({
                          title: `${ci?.title || activeSignal?.name || 'Mi Señal'} · YOUAPP`,
                          text: 'Mi señal en YOUAPP',
                          url: shareUrl,
                          thumbnailUrl: ci?.thumbnailUrl || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined),
                          subtitle: `${activeSignal?.name || 'Mi Señal'} · ${authorName}`,
                          badge: 'MI SEÑAL'
                        });
                      }}
                      title="Compartir este video"
                      aria-label="Compartir"
                    >
                      <Share2 size={14} />
                    </button>

                    <button
                      type="button"
                      className="ms-top-icon-btn"
                      onClick={async () => {
                        const androidBridge = (window as any).YouAppAndroidPiP;
                        if (androidBridge && typeof androidBridge.enterPiP === 'function') {
                          androidBridge.enterPiP();
                          return;
                        }
                        const docPiP = (window as any).documentPictureInPicture;
                        if (docPiP && typeof docPiP.requestWindow === 'function' && ytId) {
                          try {
                            if (docPiP.window && !docPiP.window.closed) {
                              docPiP.window.close();
                              return;
                            }
                            const pipParams = new URLSearchParams({ provider: 'youtube', id: ytId });
                            const pipWin: Window = await docPiP.requestWindow({ width: 420, height: 245 });
                            pipWin.document.title = `${ci?.title || 'YOUAPP'} · YOUAPP`;
                            pipWin.document.body.style.cssText =
                              'margin:0;background:#000;overflow:hidden;width:100vw;height:100vh;';
                            const ifr = pipWin.document.createElement('iframe');
                            ifr.src = `${window.location.origin}/pip-frame?${pipParams.toString()}`;
                            ifr.allow =
                              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
                            ifr.allowFullscreen = true;
                            ifr.style.cssText = 'border:0;width:100%;height:100%;display:block;';
                            pipWin.document.body.appendChild(ifr);
                            return;
                          } catch {
                            // ignore
                          }
                        }
                        setCuratedToast('En la APK Android o PC Chrome/Edge abre la ventana flotante PiP.');
                      }}
                      title="Ventana flotante (Picture-in-Picture)"
                      aria-label="Ventana flotante PiP"
                    >
                      <PictureInPicture2 size={14} />
                    </button>

                    <button
                      type="button"
                      className="ms-top-icon-btn"
                      onClick={() => setIsStageExpanded((v) => !v)}
                      title={isStageExpanded ? 'Salir de pantalla ampliada' : 'Agrandar pantalla'}
                      aria-label={isStageExpanded ? 'Salir de pantalla ampliada' : 'Agrandar pantalla'}
                    >
                      {isStageExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  </div>
                </div>

                <strong className="ms-mitv-title">{ci?.title || activeSignal?.name}</strong>
                {(viewsLabel || dateLabel) && (
                  <span className="ms-mitv-meta">
                    {[viewsLabel, dateLabel].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            );
          })()}

          {/* BARRA INTELIGENTE UNIFICADA ESTILO MITV (3 puntos: 🟠 Momentos · 🔵 YOU4 · 🟢 Transmitir + Controles) */}
          <div className="ms-smartbar-slot" style={{ position: 'relative' }} ref={castBoxRef}>
            {isCastOpen && (
              <div className="ms-cast-popover" role="dialog" aria-label="Transmitir YOUAPP">
                <div className="ms-cast-head">Transmitir a tu TV</div>

                {typeof (window as any).YouAppAndroidPiP?.openCastSettings === 'function' && (
                  <>
                    <button
                      type="button"
                      className="ms-hero-switcher-item"
                      onClick={() => {
                        setIsCastOpen(false);
                        (window as any).YouAppAndroidPiP.openCastSettings();
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                        <Cast size={14} color="#30d158" />
                        <span>Elegir mi TV / Chromecast ahora</span>
                      </span>
                    </button>
                    <div className="ms-cast-divider" />
                  </>
                )}

                {isChromePresentationSupported && (
                  <>
                    <button
                      type="button"
                      className="ms-hero-switcher-item"
                      onClick={() => void handleChromeNativeCast()}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                        <Cast size={14} color="#64d2ff" />
                        <span>Buscar TV / Chromecast (Chrome)</span>
                      </span>
                    </button>
                    <div className="ms-cast-divider" />
                  </>
                )}

                {connectedCastCode ? (
                  <div className="ms-cast-connected">
                    <span>
                      Transmitiendo a <strong>TV {connectedCastCode}</strong>
                    </span>
                    <button
                      type="button"
                      className="ms-cast-stop-btn"
                      onClick={handleDisconnectCast}
                    >
                      Desconectar
                    </button>
                  </div>
                ) : (
                  <form className="ms-cast-code-form" onSubmit={handleConnectCastCode}>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={castTargetCodeInput}
                      onChange={(e) => setCastTargetCodeInput(e.target.value)}
                      placeholder="Código de TV (ej. 4829)"
                      aria-label="Código de TV"
                    />
                    <button type="submit" className="ms-cast-connect-btn">
                      Conectar
                    </button>
                  </form>
                )}

                <div className="ms-cast-divider" />

                <button
                  type="button"
                  className="ms-hero-switcher-item"
                  onClick={() => setIsReceivingCast((v) => !v)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                    <Tv size={14} color="#64d2ff" />
                    <span>
                      {isReceivingCast
                        ? `Esta pantalla · Código ${myTvCode}`
                        : 'Recibir en esta pantalla (Modo TV)'}
                    </span>
                  </span>
                </button>

                {isReceivingCast && (
                  <div className="ms-cast-mycode">
                    <span>Código de esta TV</span>
                    <strong>{myTvCode}</strong>
                  </div>
                )}
              </div>
            )}

            <SmartBar
              unifiedAppleMode
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onSeek={(t) => {
                if (viewMode === 'you4') {
                  handleYou4Seek(t);
                } else {
                  void playerRef.current?.seek(t);
                }
              }}
              isMosaic={viewMode === 'mosaic'}
              onToggleMosaic={handleDirector}
              isYou4={viewMode === 'you4'}
              onToggleYou4={() => {
                setViewMode((prev) => {
                  const nextMode = prev === 'you4' ? 'single' : 'you4';
                  if (nextMode === 'you4') {
                    setYou4AudioSlot(0);
                    setYou4Offset(0);
                  }
                  return nextMode;
                });
              }}
              isCasting={Boolean(isCastOpen || connectedCastCode || isReceivingCast)}
              onToggleCast={() => setIsCastOpen((v) => !v)}
              isMutedExternal={isMuted}
              onToggleMuteExternal={() => {
                if (isMuted) void playerRef.current?.unmute();
                else void playerRef.current?.mute();
              }}
              isFullscreen={isStageExpanded}
              onToggleFullscreen={() => setIsStageExpanded((v) => !v)}
              moments={moments}
              onSelectMoment={(m, i) => handleMomentClick(m, i)}
              onNextBlock={
                effectiveSchedule.length > 1
                  ? () => {
                      if (viewMode === 'you4') {
                        setYou4Offset((prev) => (prev + 4) % Math.max(1, effectiveSchedule.length));
                      } else {
                        handleNext();
                      }
                    }
                  : undefined
              }
              onPreviousBlock={
                effectiveSchedule.length > 1
                  ? () => {
                      if (viewMode === 'you4') {
                        setYou4Offset(
                          (prev) =>
                            (prev - 4 + Math.max(4, effectiveSchedule.length)) %
                            Math.max(1, effectiveSchedule.length)
                        );
                      } else {
                        handlePrevious();
                      }
                    }
                  : undefined
              }
            />
          </div>
          </PlayerControlsDrawer>
          </section>

          {/* BARRA COMPACTA DE SEÑAL ACTIVA (portada completa vive en /perfil) */}
          <div className="ms-compact-bar" aria-label="Señal en pantalla">
            <div className="ms-compact-left">
              <span className="ms-live-air-dot" />
              <strong>{activeSignal?.name || 'Mi Señal'}</strong>
            </div>
            <div className="ms-compact-actions">
              <button
                type="button"
                className="ms-compact-btn"
                onClick={() => navigate('/senales')}
                title="Explorar las 100 señales o armar una nueva con ATLAS"
              >
                <Sparkles size={11} />
                <span>+ Señales</span>
              </button>
              <button
                type="button"
                className="ms-compact-btn ghost"
                onClick={() => navigate('/perfil')}
                title="Ir a Mi Perfil y mis señales"
              >
                <span>Mi Perfil</span>
              </button>
            </div>
          </div>

          {/* SELECTOR TÁCTIL SOLO EN CELULAR / TABLET (< 1024px) */}
          <div className="ms-mobile-tabs" role="tablist" aria-label="Secciones de Mi Señal">
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === 'schedule'}
              className={`ms-mobile-tab ${mobileTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setMobileTab('schedule')}
            >
              Programación ({effectiveSchedule.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === 'network'}
              className={`ms-mobile-tab ${mobileTab === 'network' ? 'active' : ''}`}
              onClick={() => setMobileTab('network')}
            >
              Repetidoras ({associatedCount})
            </button>
          </div>
        </div>

        {/* COLUMNA DERECHA EN ESCRITORIO / LISTA VERTICAL EN CELULAR: GRILLA DE EMISIÓN VIVA */}
        <aside
          aria-label="Guía de programación de esta señal"
          className={`ms-schedule-rail ${mobileTab === 'schedule' ? 'mobile-show' : 'mobile-hide'}`}
        >
          <section className="ms-schedule-panel">
            <div className="ms-rail-head">
              <h3>Canales en esta señal</h3>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  className="ms-continuous-pill on"
                  style={{
                    background: 'rgba(0, 113, 227, 0.28)',
                    borderColor: 'rgba(100, 210, 255, 0.55)',
                    color: '#e0f2fe'
                  }}
                  onClick={() => {
                    const sigObj = {
                      id: activeSignal?.id || 'justicia-social-signal-1',
                      name: activeSignal?.name || 'Mi Señal en YOUAPP',
                      schedule: effectiveSchedule
                    };
                    const shareUrl = buildShareableSignalUrl(sigObj);
                    const coverThumb =
                      currentBlock?.contentItem?.thumbnailUrl ||
                      effectiveSchedule[0]?.contentItem?.thumbnailUrl ||
                      '';
                    void shareContentUniversal({
                      title: `${sigObj.name} · Mi señal en YOUAPP`,
                      text: `Mirá mi señal «${sigObj.name}» (${effectiveSchedule.length} videos) en YOUAPP`,
                      url: shareUrl,
                      thumbnailUrl: coverThumb,
                      subtitle: `${effectiveSchedule.length} videos · YOUAPP TV`,
                      badge: 'MI SEÑAL EN YOUAPP'
                    });
                  }}
                  title="Compartir esta señal completa por WhatsApp o enlace"
                >
                  <Share2 size={11} />
                  <span>Compartir señal</span>
                </button>
                <button
                  type="button"
                  className={`ms-continuous-pill ${continuousChannelMode ? 'on' : ''}`}
                  onClick={() => {
                    setContinuousChannelMode((prev) => {
                      const nextVal = !prev;
                      try {
                        localStorage.setItem('youapp_continuous_channel_mode_v1', nextVal ? '1' : '0');
                      } catch {
                        // ignore
                      }
                      setCuratedToast(
                        nextVal
                          ? 'Emisión continua activada: al terminar un video pasa al siguiente canal.'
                          : 'Emisión continua desactivada.'
                      );
                      return nextVal;
                    });
                  }}
                  title="Al terminar un video, salta automáticamente al siguiente canal de tu señal"
                >
                  <Repeat size={11} />
                  <span>{continuousChannelMode ? 'Continua' : 'Manual'}</span>
                </button>
              </div>
            </div>

            {/* PANELES ACTIVOS DE SEÑAL VIVA / APORTES COLABORATIVOS */}
            {(collabConfig.liveEnabled ||
              (collabFormOpen && collabConfig.mode === 'open') ||
              (collabPendingOpen && collabConfig.pending.length > 0)) && (
            <div className="ms-collab-bar">
              {collabConfig.liveEnabled && (
                <div className="ms-live-presence-strip" aria-label="Personas sintonizando ahora">
                  <div className="ms-live-presence-top">
                    {liveParticipants.length > 0 ? (
                      <span className="ms-live-presence-info">
                        <span className="ms-live-pulse-dot" />
                        <strong>{liveParticipants.length}</strong>{' '}
                        {liveParticipants.length === 1 ? 'sintonizando' : 'sintonizando ahora'}
                        {(() => {
                          const cities = Array.from(
                            new Set(liveParticipants.map((p) => p.city).filter(Boolean))
                          ).slice(0, 3);
                          return cities.length > 0 ? ` · ${cities.join(' · ')}` : '';
                        })()}
                      </span>
                    ) : (
                      <span className="ms-live-presence-info">
                        👋 Sintonizá en compañía y saludá sin chat
                      </span>
                    )}

                    <div className="ms-live-presence-actions">
                      <button
                        type="button"
                        className="ms-live-btn"
                        onClick={() => setLiveMapOpen(true)}
                        title="Abrir mapa opcional de ciudades sintonizando ahora"
                      >
                        🗺️ Mapa
                      </button>
                      {!isLiveVisible ? (
                        <button
                          type="button"
                          className="ms-live-btn primary"
                          onClick={() => setLiveCityPickerOpen((v) => !v)}
                        >
                          👋 Estoy aquí
                        </button>
                      ) : (
                        <>
                          {QUICK_LIVE_GREETINGS.map((gr) => (
                            <button
                              key={gr.emoji}
                              type="button"
                              className="ms-live-btn"
                              onClick={() =>
                                handleSendLiveGreeting(gr.emoji, gr.buildText(liveCity))
                              }
                              title={gr.label}
                            >
                              {gr.emoji}
                              {gr.emoji === '👋' ? ' Saludar' : ''}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="ms-live-btn subtle"
                            onClick={() => void handleLeaveLivePresence()}
                            title="Dejar de mostrarte en esta señal"
                          >
                            Ocultarme
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {liveCityPickerOpen && !isLiveVisible && (
                    <div className="ms-live-city-picker">
                      <span className="ms-live-city-hint">
                        Elegí tu ciudad aproximada (opcional, nunca GPS):
                      </span>
                      <div className="ms-live-city-chips">
                        {QUICK_LIVE_CITIES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`ms-live-city-chip ${liveCity === c ? 'active' : ''}`}
                            onClick={() => void handleJoinLivePresence(c)}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {collabFormOpen && (
                <form className="ms-collab-form" onSubmit={(e) => void handleSubmitContribution(e)}>
                  <input
                    type="text"
                    value={collabUrlInput}
                    onChange={(e) => setCollabUrlInput(e.target.value)}
                    placeholder="Pegá enlace de YouTube, Vimeo o MP4 (ATLAS valida y evita duplicados)…"
                    aria-label="Enlace del video a aportar"
                  />
                  <button type="submit" disabled={collabBusy || !collabUrlInput.trim()}>
                    {collabBusy ? 'Validando…' : 'Enviar'}
                  </button>
                  {collabError && <div className="ms-collab-error">{collabError}</div>}
                </form>
              )}

              {collabPendingOpen && collabConfig.pending.length > 0 && (
                <div className="ms-collab-pending-list">
                  {collabConfig.pending.map((c) => (
                    <div key={c.id} className="ms-collab-pending-row">
                      {c.thumbnailUrl && <img src={c.thumbnailUrl} alt={c.title} />}
                      <div className="ms-collab-pending-info">
                        <strong>{c.title}</strong>
                        <span>
                          {c.author} · Aportado por {c.contributedBy}
                        </span>
                      </div>
                      <div className="ms-collab-pending-actions">
                        <button
                          type="button"
                          className="ok"
                          onClick={() => handleApproveContribution(c)}
                          title="Aprobar y sumar a la programación"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="no"
                          onClick={() => handleRejectContribution(c.id)}
                          title="Rechazar aporte"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Barra integrada neutra: Ordenar · Señal viva · Señal cerrada/abierta */}
            <div className="ms-pulse-filter" role="group" aria-label="Controles de la señal">
              <button
                type="button"
                className="ms-pulse-tab"
                onClick={handleAtlasOrderSignal}
                title="ATLAS ordena tu señal alternando canales, quitando duplicados y priorizando aportes valorados"
              >
                <span>Ordenar</span>
              </button>

              <button
                type="button"
                className={`ms-pulse-tab ${collabConfig.liveEnabled ? 'active' : ''}`}
                onClick={handleToggleLiveEnabled}
                aria-pressed={collabConfig.liveEnabled}
                title="Activar o desactivar encuentros en vivo (presencia voluntaria y saludos)"
              >
                <span>Señal viva</span>
              </button>

              <button
                type="button"
                className={`ms-pulse-tab ${collabConfig.mode === 'open' ? 'active' : ''}`}
                onClick={handleToggleCollabMode}
                aria-pressed={collabConfig.mode === 'open'}
                title="Cambiar entre Señal Abierta (comunidad aporta videos) y Señal Cerrada (solo propietario)"
              >
                <span>{collabConfig.mode === 'open' ? 'Señal abierta' : 'Señal cerrada'}</span>
              </button>
            </div>

            {(collabConfig.mode === 'open' || collabConfig.pending.length > 0) && (
              <div className="ms-pulse-filter" style={{ marginTop: 6 }}>
                {collabConfig.mode === 'open' && (
                  <button
                    type="button"
                    className="ms-pulse-tab"
                    onClick={handleToggleCollabModeration}
                    title="Regla de publicación para aportes de la comunidad"
                  >
                    <span>
                      {collabConfig.moderation === 'direct' ? 'Directa' : 'Revisión previa'}
                    </span>
                  </button>
                )}

                {collabConfig.mode === 'open' && (
                  <button
                    type="button"
                    className={`ms-pulse-tab ${collabFormOpen ? 'active' : ''}`}
                    onClick={() => {
                      setCollabFormOpen((v) => !v);
                      setCollabError(null);
                    }}
                  >
                    <Plus size={11} />
                    <span>Agregar video</span>
                  </button>
                )}

                {collabConfig.pending.length > 0 && (
                  <button
                    type="button"
                    className={`ms-pulse-tab ${collabPendingOpen ? 'active' : ''}`}
                    onClick={() => setCollabPendingOpen((v) => !v)}
                  >
                    <span>Pendientes ({collabConfig.pending.length})</span>
                  </button>
                )}
              </div>
            )}

            {/* Sector rápido Apple minimalista: Agregar URL de video o canal (solo en señales propias) */}
            {!curatedActiveDef && (
              <>
                <form onSubmit={handleQuickAddUrl} className="ms-url-bar" aria-label="Agregar video o canal por URL">
                  <div className="ms-url-input-wrap">
                    <Link2 size={14} className="ms-url-icon" />
                    <input
                      type="text"
                      value={quickUrlInput}
                      onChange={(e) => setQuickUrlInput(e.target.value)}
                      placeholder="Pegar URL de video o canal (@canal, YouTube, Twitch)…"
                      className="ms-url-input"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!quickUrlInput.trim() || isAddingUrl}
                    className="ms-url-submit"
                  >
                    <Plus size={13} />
                    <span>{isAddingUrl ? 'Sumando…' : 'Sumar'}</span>
                  </button>
                </form>

                <div className="ms-quick-send">
                  <a
                    ref={miSenalBookmarkletRef}
                    href="#bookmarklet-misenal"
                    className="ms-bookmarklet-pill"
                    draggable
                    onClick={(e) => {
                      e.preventDefault();
                      setCuratedToast(
                        'Arrastrá «+ Mi Señal» a la barra de marcadores de tu navegador. Después, en cualquier video o canal, hacé clic ahí para sumarlo sin copiar ni pegar.'
                      );
                    }}
                    title="Arrastrá este botón a tu barra de marcadores para sumar videos o canales en 1 clic"
                  >
                    <Plus size={12} />
                    <span>+ Mi Señal</span>
                  </a>
                  <span>Arrastralo a tus marcadores para sumar sin copiar/pegar</span>
                </div>
              </>
            )}

            {curatedActiveDef && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 16,
                  background: 'rgba(118, 118, 128, 0.07)',
                  border: '1px solid rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  fontSize: 11.8
                }}
              >
                <div style={{ color: '#1d1d1f', fontWeight: 650, letterSpacing: '-0.01em' }}>
                  ✦ {curatedActiveDef.curatorRole}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSt = toggleFollowCuratedSignal(curatedActiveDef.id);
                      setFollowedCuratedIds(nextSt.followedSignalIds);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: 'none',
                      background: isCuratedFollowed ? '#30d158' : '#0071e3',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 650,
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={11} />
                    {isCuratedFollowed ? 'Siguiendo señal' : 'Seguir señal'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const personalBase = buildSignalScheduleByProfile(
                        'justicia-social-signal-1',
                        'Justicia Social TV'
                      ) as any;
                      const { updatedSignal, addedCount } = mergeCuratedIntoPersonalSignal(
                        personalBase,
                        curatedActiveDef
                      );
                      setSignal(updatedSignal);
                      setSearchParams({ signal: updatedSignal.id }, { replace: true });
                      setCuratedToast(
                        addedCount > 0
                          ? `Se guardaron ${addedCount} bloques en tu señal personal.`
                          : 'Esta selección ya estaba guardada en tu señal personal.'
                      );
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      background: '#ffffff',
                      color: '#1d1d1f',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <BookmarkPlus size={11} color="#0071e3" /> Guardar en Mi Señal
                  </button>
                </div>
              </div>
            )}

            {curatedToast && (
              <div
                role="status"
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: 11.8,
                  fontWeight: 600
                }}
              >
                {curatedToast}
              </div>
            )}

            <div className="ms-timeline-track">
              {(() => {
                const watchedSet = new Set(watchedVideoIds);
                const visibleGroups = channelGroups.filter((group) => {
                  const snap = channelSnapshots[group.key];
                  const hasLiveCh =
                    group.blocks.some((b) => Boolean(b.contentItem.isLive)) || Boolean(snap?.liveVideo);
                  if (channelFilter === 'live') return hasLiveCh;
                  if (channelFilter === 'new') {
                    const hasUnwatchedBlock = group.blocks
                      .slice(0, 2)
                      .some((b) => !watchedSet.has(b.contentItem.providerId || b.contentItem.id));
                    const hasUnwatchedSupp = Boolean(
                      snap?.latestVideos?.slice(0, 2).some((sv) => !watchedSet.has(sv.videoId))
                    );
                    return hasUnwatchedBlock || hasUnwatchedSupp;
                  }
                  return true;
                });

                if (visibleGroups.length === 0 && channelGroups.length > 0) {
                  return (
                    <div className="ms-filter-empty">
                      <p>
                        {channelFilter === 'live'
                          ? 'Ninguno de tus canales está transmitiendo en vivo ahora.'
                          : 'Ya viste todos los videos recientes de tus canales.'}
                      </p>
                      <button
                        type="button"
                        className="ms-filter-reset-btn"
                        onClick={() => setChannelFilter('all')}
                      >
                        Ver todos los canales
                      </button>
                    </div>
                  );
                }

                return visibleGroups.map((group) => {
                const groupOrderIdx = channelGroups.findIndex((g) => g.key === group.key);
                const isExpanded = Boolean(expandedChannels[group.key]);
                const snap = channelSnapshots[group.key];
                const liveBlockInSchedule = group.blocks.find((b) => Boolean(b.contentItem.isLive)) || null;
                const liveExtraVideo =
                  !liveBlockInSchedule && snap?.liveVideo ? snap.liveVideo : null;
                const hasLive = Boolean(liveBlockInSchedule || liveExtraVideo);

                const nonLiveScheduleBlocks = group.blocks.filter((b) => !b.contentItem.isLive);
                const visibleBlocks = isExpanded
                  ? nonLiveScheduleBlocks
                  : nonLiveScheduleBlocks.slice(0, 2);
                const hiddenCount = Math.max(0, nonLiveScheduleBlocks.length - 2);

                const existingVids = new Set(
                  group.blocks.map((b) => b.contentItem.providerId || b.contentItem.id)
                );
                const supplementalVideos: ChannelVideoItem[] =
                  !isExpanded && visibleBlocks.length < 2 && snap?.latestVideos?.length
                    ? snap.latestVideos
                        .filter((v) => !existingVids.has(v.videoId))
                        .slice(0, 2 - visibleBlocks.length)
                    : [];

                const initial = (group.name.trim()[0] || 'C').toUpperCase();

                const openChannelPage = () => {
                  navigate(`/canal/${slugifyChannelName(group.name)}`, {
                    state: {
                      channelName: group.name,
                      originUrl: group.originUrl,
                      avatarUrl: group.avatarUrl,
                      coverUrl: group.coverUrl,
                      blocks: group.blocks
                    }
                  });
                };

                return (
                  <div key={group.key} className="ms-channel-group">
                    {/* Portada completa del canal + Foto de perfil circular (clic abre página interna del canal en YOUAPP) */}
                    <div
                      className={`ms-channel-banner ${group.coverUrl ? 'has-img' : ''}`}
                      onClick={openChannelPage}
                      style={{ cursor: 'pointer' }}
                      title={`Ver canal ${group.name} en YOUAPP`}
                    >
                      {group.coverUrl && (
                        <img
                          src={group.coverUrl}
                          alt={`Portada de ${group.name}`}
                          className="ms-channel-banner-img"
                        />
                      )}
                      {group.originUrl && (
                        <a
                          href={group.originUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ms-channel-ext-link"
                          title={`Abrir canal oficial de ${group.name} en YouTube`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ↗
                        </a>
                      )}
                    </div>

                    <div className="ms-channel-head">
                      <button
                        type="button"
                        className="ms-channel-title-wrap ms-channel-open-btn"
                        onClick={openChannelPage}
                        title={`Abrir página de ${group.name} en YOUAPP`}
                      >
                        <span className="ms-channel-avatar" aria-hidden="true">
                          {group.avatarUrl ? (
                            <img src={group.avatarUrl} alt={group.name} />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </span>
                        <div className="ms-channel-name-col">
                          <span className="ms-channel-name">{group.name}</span>
                          <span className="ms-channel-latest-tag">
                            {hasLive && (
                              <span className="ms-channel-live-pill">
                                <span className="ms-channel-live-dot" /> EN VIVO
                              </span>
                            )}
                            {visibleBlocks.length + supplementalVideos.length === 1
                              ? 'Último video · Ver canal'
                              : isExpanded
                              ? `${nonLiveScheduleBlocks.length} videos · Ver canal`
                              : 'Últimos 2 videos · Ver canal'}
                          </span>
                        </div>
                      </button>

                      <div className="ms-channel-head-actions">
                        {!curatedActiveDef && channelGroups.length > 1 && (
                          <div className="ms-channel-order-btns" aria-label={`Ordenar ${group.name}`}>
                            <button
                              type="button"
                              className="ms-ch-ctrl-btn"
                              disabled={groupOrderIdx <= 0}
                              onClick={() => moveChannelGroup(group.key, 'up')}
                              title="Subir canal"
                              aria-label={`Subir ${group.name}`}
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              className="ms-ch-ctrl-btn"
                              disabled={groupOrderIdx >= channelGroups.length - 1}
                              onClick={() => moveChannelGroup(group.key, 'down')}
                              title="Bajar canal"
                              aria-label={`Bajar ${group.name}`}
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>
                        )}

                        {!curatedActiveDef && (
                          <button
                            type="button"
                            className="ms-ch-ctrl-btn danger"
                            onClick={() => {
                              removeChannelGroup(group.key);
                              setCuratedToast(`Canal «${group.name}» quitado de tu señal.`);
                            }}
                            title={`Quitar el canal ${group.name} de tu señal`}
                            aria-label={`Quitar el canal ${group.name}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            className="ms-channel-more-btn"
                            onClick={() =>
                              setExpandedChannels((prev) => ({
                                ...prev,
                                [group.key]: !prev[group.key]
                              }))
                            }
                          >
                            {isExpanded ? 'Ver 2' : `+${hiddenCount} más`}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="ms-channel-videos">
                      {/* Tarjeta EN VIVO si el canal está transmitiendo en directo */}
                      {liveBlockInSchedule && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            stopPillPreview();
                            jumpTo(liveBlockInSchedule.id);
                            setViewMode('single');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              jumpTo(liveBlockInSchedule.id);
                              setViewMode('single');
                            }
                          }}
                          className={`ms-program-card ms-live-card ${
                            currentBlock?.id === liveBlockInSchedule.id ? 'active' : ''
                          }`}
                        >
                          <div className="ms-program-thumb-wrap ring-live">
                            <img
                              src={
                                liveBlockInSchedule.contentItem.thumbnail ||
                                (liveBlockInSchedule.contentItem as any).thumbnailUrl ||
                                activeBlockThumb
                              }
                              alt={liveBlockInSchedule.contentItem.title}
                            />
                          </div>
                          <div className="ms-program-info">
                            <div className="ms-program-status-row">
                              <span className="ms-program-badge live-red">
                                <span className="ms-channel-live-dot" /> EN VIVO
                              </span>
                            </div>
                            <h4>{liveBlockInSchedule.contentItem.title}</h4>
                            <div className="ms-program-meta-line">
                              <span className="ms-program-topic">Transmisión en directo</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {liveExtraVideo && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => playExtraChannelVideo(liveExtraVideo)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              playExtraChannelVideo(liveExtraVideo);
                            }
                          }}
                          className="ms-program-card ms-live-card"
                        >
                          <div className="ms-program-thumb-wrap ring-live">
                            <img src={liveExtraVideo.thumbnailUrl} alt={liveExtraVideo.title} />
                          </div>
                          <div className="ms-program-info">
                            <div className="ms-program-status-row">
                              <span className="ms-program-badge live-red">
                                <span className="ms-channel-live-dot" /> EN VIVO
                              </span>
                            </div>
                            <h4>{liveExtraVideo.title}</h4>
                            <div className="ms-program-meta-line">
                              <span className="ms-program-topic">Transmisión en directo · {group.name}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {visibleBlocks.map((block) => {
                        const realIdx = rawSchedule.findIndex((b) => b.id === block.id);
                        const idx = realIdx >= 0 ? realIdx : 0;
                        const isCurrent = idx === currentBlockIndex;
                        const isPast = idx < currentBlockIndex;
                        const thumb =
                          block.contentItem.thumbnail ||
                          (block.contentItem as any).thumbnailUrl ||
                          activeBlockThumb;
                        const totalSec = Math.max(1, Math.round(block.durationSec || 60));
                        const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
                        const ss = String(totalSec % 60).padStart(2, '0');
                        const formattedDur = `${mm}:${ss}`;

                        const previewYtId = (() => {
                          const cands = [block.contentItem.providerId, block.contentItem.id];
                          for (const c of cands) {
                            if (typeof c === 'string' && /^[A-Za-z0-9_-]{11}$/.test(c)) return c;
                          }
                          const u = block.contentItem.videoUrl || '';
                          const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([A-Za-z0-9_-]{11})/);
                          return m ? m[1] : null;
                        })();
                        const isDirectMp4 =
                          !previewYtId &&
                          typeof block.contentItem.videoUrl === 'string' &&
                          /\.(mp4|webm)(\?|$)/i.test(block.contentItem.videoUrl);
                        const isPreviewing = previewBlockId === block.id;

                        return (
                          <div
                            key={block.id}
                            role="button"
                            tabIndex={0}
                            onMouseEnter={() => startPillPreview(block.id)}
                            onMouseLeave={() => stopPillPreview(block.id)}
                            onClick={() => {
                              stopPillPreview();
                              jumpTo(block.id);
                              setViewMode('single');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                stopPillPreview();
                                jumpTo(block.id);
                                setViewMode('single');
                              }
                            }}
                            className={`ms-program-card ${isCurrent ? 'active' : isPast ? 'past' : ''}`}
                          >
                            {/* Miniatura Cápsula Redonda (+30%) con video en miniatura en vivo al pasar el cursor */}
                            <div className={`ms-program-thumb-wrap ${isCurrent ? 'ring-live' : ''} ${isPreviewing ? 'previewing' : ''}`}>
                              <img src={thumb} alt={block.contentItem.title} />
                              {isPreviewing && previewYtId && (
                                <iframe
                                  className="ms-program-preview-media"
                                  src={`https://www.youtube.com/embed/${previewYtId}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3`}
                                  title={`Vista previa de ${block.contentItem.title}`}
                                  allow="autoplay; encrypted-media"
                                  tabIndex={-1}
                                />
                              )}
                              {isPreviewing && isDirectMp4 && (
                                <video
                                  className="ms-program-preview-media"
                                  src={block.contentItem.videoUrl}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                />
                              )}
                              {isCurrent && !isPreviewing && (
                                <div className="ms-program-thumb-center" aria-hidden="true">
                                  <span className="ms-program-live-indicator">
                                    <span className="ms-program-live-dot" />
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Columna editorial limpia */}
                            <div className="ms-program-info">
                              <div className="ms-program-status-row">
                                <span className={`ms-program-badge ${isCurrent ? 'live' : ''}`}>
                                  {isCurrent ? (
                                    <>
                                      <span className="ms-playing-eq" aria-hidden="true">
                                        <span className="eq-bar" />
                                        <span className="eq-bar" />
                                        <span className="eq-bar" />
                                      </span>
                                      <span>Al aire · <strong className="ms-program-mono">{formattedDur}</strong></span>
                                    </>
                                  ) : (
                                    <span className="ms-badge-inline">
                                      {!watchedSet.has(block.contentItem.providerId || block.contentItem.id) && (
                                        <span className="ms-new-blue-dot" title="Video nuevo sin ver" />
                                      )}
                                      <span>
                                        {isPast ? 'Emitido' : 'Sigue'} · <strong className="ms-program-mono">{formattedDur}</strong>
                                      </span>
                                    </span>
                                  )}
                                </span>

                                <button
                                  type="button"
                                  className="ms-program-remove-btn"
                                  title="Eliminar este video de la grilla"
                                  aria-label={`Eliminar ${block.contentItem.title} de la grilla`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    remove(block.id);
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>

                              <h4>{block.contentItem.title}</h4>

                              <div className="ms-program-meta-line">
                                <span className="ms-program-topic">{block.topic}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Segundo último video real cuando el canal solo tenía 1 bloque en la grilla */}
                      {supplementalVideos.map((sv) => {
                        const sec = Math.max(1, Math.round(sv.durationSec || 60));
                        const durLabel = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(
                          sec % 60
                        ).padStart(2, '0')}`;
                        return (
                          <div
                            key={`supp-${sv.videoId}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => playExtraChannelVideo(sv)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                playExtraChannelVideo(sv);
                              }
                            }}
                            className="ms-program-card"
                          >
                            <div className="ms-program-thumb-wrap">
                              <img src={sv.thumbnailUrl} alt={sv.title} />
                            </div>
                            <div className="ms-program-info">
                              <div className="ms-program-status-row">
                                <span className="ms-program-badge">
                                  <span className="ms-badge-inline">
                                    {!watchedSet.has(sv.videoId) && (
                                      <span className="ms-new-blue-dot" title="Video nuevo sin ver" />
                                    )}
                                    <span>
                                      Reciente · <strong className="ms-program-mono">{durLabel}</strong>
                                    </span>
                                  </span>
                                </span>
                              </div>
                              <h4>{sv.title}</h4>
                              <div className="ms-program-meta-line">
                                <span className="ms-program-topic">{sv.topic}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
              })()}

              {rawSchedule.length === 0 && (
                <button
                  type="button"
                  className="ms-block-add"
                  onClick={() =>
                    setSignal(
                      buildSignalScheduleByProfile(
                        activeSignal?.id || 'justicia-social-signal-1',
                        activeSignal?.name || 'Justicia Social TV',
                        activeSignal?.prompt
                      ) as any
                    )
                  }
                >
                  <RotateCcw size={16} color="#2563eb" />
                  <span>Restaurar grilla de esta señal</span>
                </button>
              )}
            </div>

            {/* Desplegable unificado de Herramientas (agrupa los 4 paneles inferiores de la grilla) */}
            <div className="ms-media-drawer">
              <button
                type="button"
                className={`ms-media-drawer-toggle ${showToolsDrawer ? 'open' : ''}`}
                onClick={() => setShowToolsDrawer((v) => !v)}
                aria-expanded={showToolsDrawer}
              >
                <span className="ms-media-drawer-title">
                  <Sliders size={13} />
                  <span>Herramientas</span>
                </span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: showToolsDrawer ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.18s ease'
                  }}
                />
              </button>

              {showToolsDrawer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {/* Sector desplegable: Radio, Música y Noticias agregadas a esta señal */}
            {(() => {
              const totalMedia = signalMediaBundle.audio.length + signalMediaBundle.news.length;
              return (
                <div className="ms-media-drawer">
                  <button
                    type="button"
                    className={`ms-media-drawer-toggle ${showMediaDrawer ? 'open' : ''}`}
                    onClick={() => setShowMediaDrawer((v) => !v)}
                    aria-expanded={showMediaDrawer}
                  >
                    <span className="ms-media-drawer-title">
                      <Radio size={13} color="#0071e3" />
                      <span>Radio, Música y Noticias</span>
                      <span className="ms-media-count-badge">{totalMedia}</span>
                    </span>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: showMediaDrawer ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.18s ease'
                      }}
                    />
                  </button>

                  {showMediaDrawer && (
                    <div className="ms-media-drawer-body">
                      {totalMedia === 0 ? (
                        <div className="ms-media-empty">
                          Todavía no agregaste radios, música ni noticias a esta señal.
                        </div>
                      ) : (
                        <>
                          {signalMediaBundle.audio.length > 0 && (
                            <div className="ms-media-sublist">
                              <span className="ms-media-subhead">Radio y Música</span>
                              {signalMediaBundle.audio.map((aud) => {
                                const playing = playingGridAudio?.id === aud.id && isGridAudioPlaying;
                                return (
                                  <div key={aud.id} className={`ms-media-row ${playing ? 'playing' : ''}`}>
                                    <button
                                      type="button"
                                      className="ms-media-play-btn"
                                      onClick={() => handleToggleGridAudio(aud)}
                                      aria-label={playing ? `Pausar ${aud.title}` : `Escuchar ${aud.title}`}
                                    >
                                      {playing ? <Pause size={12} /> : <Play size={12} />}
                                    </button>
                                    <div className="ms-media-row-meta">
                                      <strong>{aud.title}</strong>
                                      <span>
                                        {aud.kind === 'radio'
                                          ? 'Radio'
                                          : aud.kind === 'music'
                                          ? 'Música'
                                          : 'Podcast'}{' '}
                                        · {aud.author}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {signalMediaBundle.news.length > 0 && (
                            <div className="ms-media-sublist">
                              <span className="ms-media-subhead">Noticias y Artículos</span>
                              {signalMediaBundle.news.map((n) => (
                                <a
                                  key={n.id}
                                  href={n.articleUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ms-media-row link"
                                >
                                  <div className="ms-media-row-meta">
                                    <strong>{n.title}</strong>
                                    <span>{n.sourceName}</span>
                                  </div>
                                  <ExternalLink size={12} color="#6e6e73" />
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        className="ms-media-manage-btn"
                        onClick={() =>
                          navigate(
                            `/diarios?signal=${encodeURIComponent(
                              activeSignal?.id || 'justicia-social-signal-1'
                            )}`
                          )
                        }
                      >
                        <ExternalLink size={12} />
                        <span>Ver Diarios Argentinos (6 notas por diario)</span>
                      </button>

                      <button
                        type="button"
                        className="ms-media-manage-btn"
                        onClick={() =>
                          navigate(
                            `/misenal-medios?signal=${encodeURIComponent(
                              activeSignal?.id || 'justicia-social-signal-1'
                            )}`
                          )
                        }
                      >
                        <Plus size={12} />
                        <span>Agregar o editar Radio, Música y Noticias</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Capa 3B — Señal en vivo de acontecimientos (Marcador + Minuto a Minuto + Fuentes + Comentarios) */}
            <SignalEventCoverageDrawer
              signalId={activeSignalKey}
              signalName={activeSignal?.name || 'Mi Señal'}
              isOwner={!curatedActiveDef && !isSharedSignalView}
              eventMeta={signalEventMeta}
              mediaBundle={signalMediaBundle}
              playingAudioId={playingGridAudio?.id || null}
              isAudioPlaying={isGridAudioPlaying}
              onToggleAudio={handleToggleGridAudio}
              onPlayVideoUrl={async (url, title) => {
                try {
                  const resolved = await resolveUrlToScheduleBlock(
                    url,
                    rawSchedule.length,
                    title
                  );
                  insert(resolved.block, Math.max(0, currentBlockIndex));
                  window.setTimeout(() => {
                    jumpTo(resolved.block.id);
                    setViewMode('single');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }, 25);
                  setCuratedToast(
                    `En reproductor: ${resolved.block.contentItem.title}`
                  );
                } catch {
                  setCuratedToast(
                    'No se pudo cargar ese enlace en el reproductor. Verificá que sea una URL de YouTube o video MP4.'
                  );
                }
              }}
              onOpenMediaManager={() =>
                navigate(`/misenal-medios?signal=${encodeURIComponent(activeSignalKey)}`)
              }
              openRequestTick={eventCoverageOpenTick}
            />

            {/* Capa 3A — Señal Interactiva: Encuestas en vivo desplegables */}
            <SignalPollsDrawer
              signalId={activeSignalKey}
              isOwner={!curatedActiveDef && !isSharedSignalView}
            />

            {/* Capa 4 — Datos en vivo (Clima + Dólar AR), Editorial propia y Agenda (.ics) */}
            <SignalStationHubDrawer
              signalId={activeSignalKey}
              signalName={activeSignal?.name || 'Mi Señal'}
              isOwner={!curatedActiveDef && !isSharedSignalView}
            />
                </div>
              )}
            </div>

            {/* Espacio único ATLAS Red Viva: máximo 1 repetidora invitada (7 días) */}
            {redVivaTrial && redVivaTrial.status === 'ACTIVE_7D' && (() => {
              const info = getTrialProgressInfo(redVivaTrial);
              return (
                <div className="ms-redviva-guest-card">
                  <div className="ms-rv-head">
                    <span className="ms-rv-badge">✦ REPETIDORA INVITADA · DÍA {info.dayNumber}/7</span>
                    <span className="ms-rv-score">S {redVivaTrial.scorePct}%</span>
                  </div>
                  <div className="ms-rv-body">
                    <strong>{redVivaTrial.guestChannelName}</strong>
                    <span>{redVivaTrial.reason}</span>
                  </div>
                  <div className="ms-rv-actions">
                    <button
                      type="button"
                      className="ms-rv-open-btn"
                      onClick={() => {
                        const updated = recordRedVivaMetric(redVivaTrial.id, 'playsFromCard');
                        setRedVivaTrial(updated.activeTrial);
                        if (redVivaTrial.isCuratorSignal) {
                          navigate(
                            `/misenal1?signal=${encodeURIComponent(
                              redVivaTrial.guestChannelId.replace(/^curator-/, '')
                            )}`
                          );
                        } else {
                          navigate(`/canal/${slugifyChannelName(redVivaTrial.guestChannelName)}`);
                        }
                      }}
                    >
                      Explorar canal invitado →
                    </button>
                    <button
                      type="button"
                      className="ms-rv-manage-btn"
                      onClick={() => navigate('/repetidoras')}
                    >
                      Ver resumen
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="ms-schedule-footer-btns">
              <button
                type="button"
                className="ms-block-add"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus size={16} color="#64d2ff" />
                <span>Agregar por URL, sugerencias o Atlas</span>
              </button>
            </div>
          </section>
        </aside>
      </main>

      <AddSignalContentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddBlock={handleAddBlockToSignal}
        existingCount={rawSchedule.length}
      />

      <DigitalAntennaModal
        isOpen={isAntennaModalOpen}
        onClose={() => setIsAntennaModalOpen(false)}
        signalId={activeSignalKey}
        signalName={activeSignal?.name || 'Mi Señal'}
        featuredVideoId={currentBlock?.contentItem?.providerId || currentBlock?.contentItem?.id}
      />

      <SignalInviteFollowersModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        signalId={activeSignalKey}
        signalName={activeSignal?.name || 'Mi Señal'}
        channelCount={channelGroups.length}
        featuredVideoId={currentBlock?.contentItem?.providerId || currentBlock?.contentItem?.id}
        featuredVideoTitle={currentBlock?.contentItem?.title}
      />

      {/* --- SECCIÓN INFERIOR: REPETIDORAS + SEÑALES CURADAS --- */}
      <footer className="ms-bottom-section">
        <div className={mobileTab === 'network' ? 'mobile-show' : 'mobile-hide'}>
          <SignalAssociatedRepeatersRail
            signalId={activeSignal?.id}
            memberships={signalMemberships}
            onRefreshRequested={refreshMemberships}
            variant="glass"
          />
        </div>
        <div style={{ marginTop: 18 }}>
          <CuratedSignalsDiscoverSection />
        </div>
      </footer>

      <SignalLiveMapModal
        isOpen={liveMapOpen}
        onClose={() => setLiveMapOpen(false)}
        signalName={activeSignal?.name || 'Mi Señal'}
        currentVideoTitle={currentBlock?.contentItem?.title}
        participants={liveParticipants}
        isLiveVisible={isLiveVisible}
        liveCity={liveCity}
        onJoinWithCity={(city) => void handleJoinLivePresence(city)}
        onJoinApproxZone={() => void handleJoinApproxZone7Km()}
        onGreetCity={(city) =>
          handleSendLiveGreeting('👋', `¡Saludos para ${city} desde ${liveCity}!`)
        }
      />

      <style>{`
        .ms-container {
          background-color: #f5f5f7;
          min-height: 100dvh;
          font-family: var(--you-font-sans, 'Geist', -apple-system, BlinkMacSystemFont, sans-serif);
          -webkit-font-smoothing: antialiased;
          color: #1d1d1f;
          display: flex;
          flex-direction: column;
        }

        .fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* --- Barra superior Apple Glass --- */
        .ms-topnav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 11px 32px;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: saturate(190%) blur(24px);
          -webkit-backdrop-filter: saturate(190%) blur(24px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          position: sticky;
          top: 0;
          z-index: 60;
        }
        .ms-logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .ms-divider {
          width: 1px;
          height: 22px;
          background: #e2e8f0;
          flex-shrink: 0;
        }
        .ms-breadcrumb {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-breadcrumb-root { font-weight: 700; color: #0f172a; }
        .ms-dot { color: #2563eb; }
        .ms-breadcrumb-current { color: #64748b; font-weight: 500; }

        .ms-nav-scroller {
          display: flex;
          align-items: center;
          gap: 16px;
          overflow-x: auto;
          scrollbar-width: none;
          padding: 2px 0;
        }
        .ms-nav-scroller::-webkit-scrollbar { display: none; }
        .ms-nav-btn {
          background: none;
          border: none;
          font-size: 13.5px;
          font-weight: 550;
          color: #64748b;
          cursor: pointer;
          white-space: nowrap;
          padding: 4px 2px;
          border-bottom: 2px solid transparent;
          transition: color 0.16s ease, border-color 0.16s ease;
        }
        .ms-nav-btn:hover { color: #0f172a; }
        .ms-nav-btn.active {
          color: #2563eb;
          font-weight: 700;
          border-bottom-color: #2563eb;
        }
        .ms-nav-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          padding: 5px 12px;
          font-size: 12.5px;
          font-weight: 700;
          color: #1d4ed8;
          cursor: pointer;
          white-space: nowrap;
        }
        .ms-nav-pill:hover { background: #dbeafe; }
        .ms-user-area {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        /* --- Hero Superior de la Señal (Portada grande + Foto de perfil a la izquierda) --- */
        .ms-hero-shell {
          position: relative;
          z-index: 60;
          max-width: 1480px;
          width: 100%;
          margin: 0 auto;
          padding: 14px 32px 0;
          box-sizing: border-box;
        }
        .ms-hero-card {
          position: relative;
          z-index: 60;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
          overflow: visible;
        }
        .ms-hero-cover {
          position: relative;
          height: 116px;
          border-radius: 23px 23px 0 0;
          background: linear-gradient(125deg, #1d1d1f 0%, #2c2c34 45%, #0071e3 100%);
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }
        .ms-hero-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 20px 14px;
          flex-wrap: wrap;
        }
        .ms-hero-left {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1 1 280px;
        }
        .ms-hero-avatar-btn,
        .ms-hero-avatar-readonly {
          position: relative;
          width: 62px;
          height: 62px;
          border-radius: 999px;
          padding: 0;
          border: 2.5px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.06);
          overflow: hidden;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ms-hero-avatar-btn {
          cursor: pointer;
        }
        .ms-hero-avatar-btn:hover .ms-signal-avatar-hover,
        .ms-hero-avatar-btn:focus-visible .ms-signal-avatar-hover {
          opacity: 1;
        }
        .ms-hero-title-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .ms-hero-name-line {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .ms-hero-title {
          margin: 0;
          font-size: 20px;
          font-weight: 750;
          letter-spacing: -0.028em;
          color: #1d1d1f;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-hero-sub {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 520;
          color: #6e6e73;
          flex-wrap: wrap;
        }
        .ms-hero-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ms-hero-pill-btn {
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
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ms-hero-pill-btn:hover {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.15);
        }
        .ms-hero-pill-btn.active-follow {
          background: rgba(52, 199, 89, 0.14);
          border-color: rgba(52, 199, 89, 0.35);
          color: #1c7c34;
        }
        .ms-sync-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #0071e3;
          font-weight: 600;
        }
        .ms-event-phase-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.02em;
        }
        .ms-event-phase-pill.live {
          background: rgba(255, 59, 48, 0.14);
          color: #d70015;
        }
        .ms-event-phase-pill.upcoming {
          background: rgba(245, 158, 11, 0.16);
          color: #b45309;
        }
        .ms-event-phase-pill.archive {
          background: rgba(118, 118, 128, 0.14);
          color: #424245;
        }
        .ms-continuous-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(118, 118, 128, 0.09);
          color: #6e6e73;
          font-size: 11px;
          font-weight: 620;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .ms-continuous-pill.on {
          background: rgba(0, 113, 227, 0.11);
          border-color: rgba(0, 113, 227, 0.28);
          color: #0071e3;
        }
        .ms-redviva-guest-card {
          padding: 12px 13px;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(0, 113, 227, 0.07) 0%, rgba(255, 255, 255, 0.92) 100%);
          border: 1px solid rgba(0, 113, 227, 0.22);
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .ms-rv-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ms-rv-badge {
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.03em;
          color: #0071e3;
        }
        .ms-rv-score {
          font-size: 10.5px;
          font-weight: 750;
          color: #1d1d1f;
          background: rgba(255, 255, 255, 0.85);
          padding: 2px 7px;
          border-radius: 999px;
        }
        .ms-rv-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ms-rv-body strong {
          font-size: 13.5px;
          font-weight: 700;
          color: #1d1d1f;
        }
        .ms-rv-body span {
          font-size: 11.5px;
          color: #6e6e73;
          line-height: 1.3;
        }
        .ms-rv-actions {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 2px;
        }
        .ms-rv-open-btn {
          flex: 1;
          padding: 6px 11px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .ms-rv-manage-btn {
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .ms-media-drawer {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        .ms-media-drawer-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 13px;
          border: none;
          background: transparent;
          color: #1d1d1f;
          font-size: 12.5px;
          font-weight: 660;
          cursor: pointer;
        }
        .ms-media-drawer-toggle:hover {
          background: rgba(0, 0, 0, 0.025);
        }
        .ms-media-drawer-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .ms-media-count-badge {
          padding: 1px 7px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .ms-media-drawer-body {
          padding: 0 11px 11px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          padding-top: 9px;
        }
        .ms-media-empty {
          font-size: 12px;
          color: #6e6e73;
          padding: 4px 2px;
        }
        .ms-media-sublist {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ms-media-subhead {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #86868b;
          padding-left: 2px;
        }
        .ms-media-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 7px 9px;
          border-radius: 12px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.04);
          text-decoration: none;
          color: #1d1d1f;
        }
        .ms-media-row.playing {
          background: rgba(0, 113, 227, 0.08);
          border-color: rgba(0, 113, 227, 0.25);
        }
        .ms-media-row.link:hover {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.25);
        }
        .ms-media-play-btn {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: pointer;
        }
        .ms-media-row-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .ms-media-row-meta strong {
          font-size: 12px;
          font-weight: 650;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-media-row-meta span {
          font-size: 11px;
          color: #6e6e73;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-media-manage-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 100%;
          padding: 7px 11px;
          border-radius: 999px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: rgba(0, 113, 227, 0.07);
          color: #0071e3;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .ms-media-manage-btn:hover {
          background: rgba(0, 113, 227, 0.14);
        }
        .ms-hero-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .ms-hero-primary-btn:hover {
          background: #0077ed;
        }
        .ms-hero-switcher-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          min-width: 220px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          padding: 6px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.14);
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 80;
        }
        .ms-hero-switcher-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #1d1d1f;
          font-size: 12.5px;
          font-weight: 560;
          text-align: left;
          cursor: pointer;
        }
        .ms-hero-switcher-item:hover,
        .ms-hero-switcher-item.current {
          background: rgba(0, 113, 227, 0.08);
          color: #0071e3;
        }
        .ms-rail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }
        .ms-rail-head h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #1d1d1f;
        }
        .ms-pulse-filter {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.1);
        }
        .ms-pulse-tab {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #424245;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .ms-pulse-tab.active {
          background: #ffffff;
          color: #1d1d1f;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        }
        .ms-new-blue-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #0071e3;
          display: inline-block;
          flex-shrink: 0;
        }
        .ms-badge-inline {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .ms-filter-empty {
          padding: 20px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(0, 0, 0, 0.06);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .ms-filter-empty p {
          margin: 0;
          font-size: 12.5px;
          color: #6e6e73;
        }
        .ms-filter-reset-btn {
          padding: 6px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ms-channel-head-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .ms-channel-order-btns {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .ms-ch-ctrl-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(118, 118, 128, 0.08);
          color: #424245;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.14s ease, color 0.14s ease;
        }
        .ms-ch-ctrl-btn:hover:not(:disabled) {
          background: #ffffff;
          color: #0071e3;
          border-color: rgba(0, 113, 227, 0.25);
        }
        .ms-ch-ctrl-btn.danger:hover {
          background: rgba(255, 59, 48, 0.12);
          color: #d70015;
          border-color: rgba(255, 59, 48, 0.25);
        }
        .ms-ch-ctrl-btn:disabled {
          opacity: 0.28;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .ms-hero-shell {
            padding: 10px 12px 0;
          }
          .ms-hero-cover {
            height: 82px;
          }
          .ms-hero-bar {
            padding: 10px 14px 12px;
          }
          .ms-hero-avatar-btn,
          .ms-hero-avatar-readonly {
            width: 50px;
            height: 50px;
          }
          .ms-hero-title {
            font-size: 17px;
          }
        }

        /* --- Escenario principal (Izquierda reproductor, derecha grilla vertical) --- */
        .ms-main {
          display: flex;
          align-items: flex-start;
          gap: 22px;
          padding: 20px 32px 14px;
          max-width: 1480px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .ms-player-section {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ms-now-playing-header {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 11px;
          padding: 9px 13px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.84);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          min-width: 0;
        }
        .ms-np-yt-link {
          color: #c81e1e;
          font-weight: 600;
          text-decoration: none;
        }
        .ms-np-yt-link:hover {
          text-decoration: underline;
        }
        .ms-np-social {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
          flex-wrap: wrap;
        }
        .ms-np-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: rgba(15, 23, 42, 0.04);
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .ms-np-pill:hover {
          background: rgba(15, 23, 42, 0.09);
        }
        .ms-np-pill.liked {
          background: rgba(255, 45, 85, 0.12);
          border-color: rgba(255, 45, 85, 0.35);
          color: #d7003a;
        }
        .ms-np-pill.following {
          background: rgba(0, 113, 227, 0.12);
          border-color: rgba(0, 113, 227, 0.35);
          color: #0071e3;
        }
        .ms-np-pill.mitv {
          background: #0071e3;
          border-color: #0071e3;
          color: #ffffff;
        }
        .ms-np-pill.mitv:hover {
          background: #0a84ff;
        }
        .ms-np-avatar-btn {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          padding: 0;
          border: 1.5px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
          transition: transform 0.16s ease;
        }
        .ms-np-avatar-btn:hover {
          transform: scale(1.05);
        }
        .ms-np-avatar-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ms-np-meta {
          display: flex;
          flex-direction: column;
          gap: 1.5px;
          min-width: 0;
          flex: 1;
        }
        .ms-np-title {
          margin: 0;
          font-size: 14.5px;
          font-weight: 680;
          letter-spacing: -0.02em;
          color: #1d1d1f;
          line-height: 1.25;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ms-np-sub {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          font-weight: 500;
          color: #6e6e73;
          min-width: 0;
        }
        .ms-np-channel-link {
          border: none;
          background: transparent;
          padding: 0;
          color: #424245;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s ease;
        }
        .ms-np-channel-link:hover {
          color: #0071e3;
        }
        .ms-np-sep {
          color: #aeaeb2;
        }
        .ms-stage-box {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000000;
          border-radius: 24px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.08),
            0 24px 54px -18px rgba(0, 0, 0, 0.28);
        }
        .ms-analyzing-pill {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 25;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 15px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.85);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
        }
        .ms-unmute-pill {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 30;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          background: rgba(15, 23, 42, 0.82);
          backdrop-filter: blur(8px);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
        }
        .ms-unmute-pill:hover { background: #2563eb; border-color: #60a5fa; }

        .ms-stage-hud {
          position: absolute;
          inset: 0;
          pointer-events: none;
          transition: opacity 0.22s ease;
        }
        .ms-stage-hud.visible { opacity: 1; }
        .ms-stage-hud.hidden-hud { opacity: 0; }
        .ms-stage-hud > * { pointer-events: auto; }
        .ms-stage-hud.hidden-hud > * { pointer-events: none; }

        .ms-stage-caption {
          position: absolute;
          top: 18px;
          left: 20px;
          right: 20px;
          max-width: 72%;
          pointer-events: none;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.65);
        }
        .ms-now-label {
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.9);
          color: #ffffff;
        }
        .ms-stage-topic {
          margin: 0;
          font-size: 19px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.25;
        }
        .ms-stage-sub {
          margin-top: 3px;
          font-size: 12.5px;
          font-weight: 500;
          color: rgba(241, 245, 249, 0.9);
        }

        .ms-smartbar-slot {
          position: relative;
          bottom: auto;
          z-index: 20;
        }

        .ms-mobile-tabs {
          display: none;
        }

        /* --- Columna derecha: Grilla de programación vertical --- */
        .ms-schedule-rail {
          width: 405px;
          flex-shrink: 0;
        }
        .ms-bottom-section {
          max-width: 1480px;
          width: 100%;
          margin: 0 auto;
          padding: 8px 32px 38px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .ms-schedule-panel {
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: saturate(190%) blur(28px);
          -webkit-backdrop-filter: saturate(190%) blur(28px);
          border: 1px solid rgba(0, 0, 0, 0.07);
          border-radius: 24px;
          padding: 18px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.92),
            0 2px 6px rgba(0, 0, 0, 0.03),
            0 18px 40px -14px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ms-schedule-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }
        .ms-url-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
        }
        .ms-url-bar:focus-within {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.45);
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
        }
        .ms-url-input-wrap {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 1;
          min-width: 0;
          padding-left: 9px;
        }
        .ms-url-icon {
          color: #86868b;
          flex-shrink: 0;
        }
        .ms-url-input {
          width: 100%;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 12px;
          color: #1d1d1f;
          outline: none;
        }
        .ms-url-input::placeholder {
          color: #86868b;
        }
        .ms-url-submit {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 11.8px;
          font-weight: 650;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s ease, opacity 0.15s ease;
        }
        .ms-url-submit:hover:not(:disabled) {
          background: #0077ed;
        }
        .ms-url-submit:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }
        .ms-signal-profile-card {
          display: flex;
          flex-direction: column;
          margin: -18px -18px 2px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          padding-bottom: 12px;
        }
        .ms-signal-cover {
          position: relative;
          height: 76px;
          border-radius: 23px 23px 0 0;
          background: linear-gradient(125deg, #1d1d1f 0%, #2c2c34 45%, #0071e3 100%);
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }
        .ms-signal-cover-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.06) 0%, rgba(0, 0, 0, 0.22) 100%);
          pointer-events: none;
        }
        .ms-cover-edit-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(29, 29, 31, 0.58);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f5f5f7;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.16s ease, transform 0.16s ease;
        }
        .ms-cover-edit-btn:hover {
          background: rgba(29, 29, 31, 0.82);
          transform: translateY(-0.5px);
        }
        .ms-signal-profile-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 11px;
          padding: 12px 16px 0;
          position: relative;
          z-index: 2;
        }
        .ms-signal-avatar-btn {
          position: relative;
          width: 48px;
          height: 48px;
          border-radius: 999px;
          padding: 0;
          border: 2px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
          overflow: hidden;
          flex-shrink: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ms-signal-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ms-signal-avatar-empty {
          width: 100%;
          height: 100%;
          background: #f5f5f7;
          color: #86868b;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ms-signal-avatar-hover {
          position: absolute;
          inset: 0;
          background: rgba(29, 29, 31, 0.52);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.16s ease;
        }
        .ms-signal-avatar-btn:hover .ms-signal-avatar-hover,
        .ms-signal-avatar-btn:focus-visible .ms-signal-avatar-hover {
          opacity: 1;
        }
        .ms-schedule-title-group {
          display: flex;
          align-items: center;
          min-width: 0;
          flex: 1;
        }
        .ms-signal-name-display {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }
        .ms-schedule-title-group h3 {
          margin: 0;
          font-size: 16.5px;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1d1d1f;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-signal-name-edit-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(118, 118, 128, 0.09);
          color: #6e6e73;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .ms-signal-name-edit-btn:hover {
          background: #ffffff;
          color: #0071e3;
          border-color: rgba(0, 113, 227, 0.28);
        }
        .ms-signal-name-form {
          display: flex;
          align-items: center;
          gap: 5px;
          width: 100%;
          min-width: 0;
        }
        .ms-signal-name-input {
          flex: 1;
          min-width: 0;
          height: 30px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 113, 227, 0.45);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.015em;
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
        }
        .ms-signal-name-action {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: pointer;
          transition: opacity 0.15s ease, background 0.15s ease;
        }
        .ms-signal-name-action.save {
          background: #0071e3;
          color: #ffffff;
        }
        .ms-signal-name-action.save:hover {
          background: #0077ed;
        }
        .ms-signal-name-action.cancel {
          background: rgba(118, 118, 128, 0.14);
          color: #1d1d1f;
        }
        .ms-signal-name-action.cancel:hover {
          background: rgba(118, 118, 128, 0.24);
        }
        .ms-schedule-count-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.09);
          border: 1px solid rgba(0, 0, 0, 0.04);
          font-size: 11px;
          font-weight: 550;
          font-variant-numeric: tabular-nums;
          color: #6e6e73;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ms-schedule-count-pill strong {
          color: #1d1d1f;
          font-weight: 700;
        }
        .ms-link-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          font-weight: 600;
          color: #1d1d1f;
          text-decoration: none;
          background: rgba(118, 118, 128, 0.09);
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 999px;
          padding: 5px 11px;
          flex-shrink: 0;
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .ms-link-pill:hover {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        }
        .ms-add-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #1d1d1f;
          background: rgba(118, 118, 128, 0.09);
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 999px;
          padding: 9px 14px;
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .ms-add-pill:hover {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .ms-recommended-cover-bar {
          position: absolute;
          inset: 10px 12px auto 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          z-index: 2;
        }
        .ms-recommended-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(29, 29, 31, 0.56);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f5f5f7;
          font-size: 10.5px;
          font-weight: 650;
          letter-spacing: 0.01em;
        }
        .ms-back-own-btn {
          position: static;
        }
        .ms-signal-avatar-readonly {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.06);
        }
        .ms-timeline-track {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 660px;
          overflow-y: auto;
          padding: 2px 3px 8px 0;
          -webkit-overflow-scrolling: touch;
        }
        .ms-timeline-track::-webkit-scrollbar { width: 4px; }
        .ms-timeline-track::-webkit-scrollbar-thumb { background: rgba(142, 142, 147, 0.35); border-radius: 999px; }

        .ms-channel-group {
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          gap: 10px;
          padding: 0 0 12px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          overflow: hidden;
        }
        .ms-channel-banner {
          position: relative;
          width: 100%;
          aspect-ratio: 1138 / 188;
          min-height: 58px;
          background: #ffffff;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ms-channel-banner:not(.has-img) .ms-channel-ext-link {
          background: rgba(118, 118, 128, 0.1);
          border-color: rgba(0, 0, 0, 0.06);
          color: #6e6e73;
        }
        .ms-channel-banner:not(.has-img) .ms-channel-ext-link:hover {
          background: rgba(118, 118, 128, 0.18);
          color: #1d1d1f;
        }
        .ms-channel-banner.has-img {
          aspect-ratio: auto;
          background: #111216;
          border-bottom: none;
          min-height: 0;
        }
        .ms-channel-banner-img {
          width: 100%;
          height: auto;
          max-height: 112px;
          object-fit: contain;
          display: block;
        }
        .ms-channel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 12px;
          position: relative;
          z-index: 2;
        }
        .ms-channel-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .ms-channel-open-btn {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }
        .ms-channel-open-btn:hover .ms-channel-name {
          color: #0071e3;
        }
        .ms-channel-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: linear-gradient(135deg, #0071e3 0%, #1d1d1f 100%);
          color: #ffffff;
          font-size: 13px;
          font-weight: 750;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
        }
        .ms-channel-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ms-channel-name-col {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 1px;
          min-width: 0;
        }
        .ms-channel-name {
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #1d1d1f;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.22;
        }
        .ms-channel-latest-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 500;
          color: #6e6e73;
          white-space: nowrap;
        }
        .ms-channel-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1.5px 6px;
          border-radius: 999px;
          background: rgba(255, 59, 48, 0.12);
          color: #d70015;
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.03em;
        }
        .ms-channel-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #ff3b30;
          display: inline-block;
        }
        .ms-live-card {
          border-color: rgba(255, 59, 48, 0.24) !important;
          background: rgba(255, 59, 48, 0.04) !important;
        }
        .ms-program-badge.live-red {
          color: #d70015;
          font-weight: 750;
          gap: 5px;
        }
        .ms-channel-more-btn {
          border: none;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ms-channel-more-btn:hover {
          background: rgba(0, 113, 227, 0.18);
        }
        .ms-channel-ext-link {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: rgba(29, 29, 31, 0.56);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #f5f5f7;
          font-size: 11.5px;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }
        .ms-channel-ext-link:hover {
          background: rgba(0, 113, 227, 0.88);
        }
        .ms-channel-videos {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 0 10px;
        }

        .ms-program-card {
          width: 100%;
          text-align: left;
          background: rgba(255, 255, 255, 0.76);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 18px;
          padding: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
          box-sizing: border-box;
        }
        .ms-program-card:hover {
          background: #ffffff;
          border-color: rgba(0, 113, 227, 0.32);
          box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }
        .ms-program-card.past { opacity: 0.62; }
        .ms-program-card.active {
          background: rgba(0, 113, 227, 0.06);
          border: 1.5px solid #0071e3;
          box-shadow: 0 8px 22px -8px rgba(0, 113, 227, 0.24);
        }
        .ms-schedule-footer-btns {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 4px;
        }
        .ms-program-thumb-wrap {
          position: relative;
          width: 122px;
          height: 73px;
          border-radius: 999px;
          overflow: hidden;
          flex-shrink: 0;
          background: #1d1d1f;
          border: 1px solid rgba(0, 0, 0, 0.1);
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }
        .ms-program-thumb-wrap.ring-live {
          border-color: #0071e3;
          animation: msCapsuleRingPulse 2.2s ease-in-out infinite;
        }
        @keyframes msCapsuleRingPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #0071e3, 0 0 12px rgba(0, 113, 227, 0.28);
          }
          50% {
            box-shadow: 0 0 0 3px #0071e3, 0 0 18px rgba(0, 113, 227, 0.45);
          }
        }
        .ms-program-thumb-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.25s ease;
        }
        .ms-program-card:hover .ms-program-thumb-wrap {
          transform: scale(1.03);
        }
        .ms-program-card:hover .ms-program-thumb-wrap img {
          transform: scale(1.06);
        }
        .ms-program-thumb-wrap.previewing {
          border-color: #0071e3;
          box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.35);
        }
        .ms-program-preview-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          object-fit: cover;
          pointer-events: none;
          transform: scale(1.38);
          transform-origin: center;
          z-index: 2;
        }
        .ms-program-thumb-center {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 3;
        }
        .ms-program-live-indicator {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: rgba(29, 29, 31, 0.62);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ms-program-live-dot {
          width: 8.5px;
          height: 8.5px;
          border-radius: 999px;
          background: #2997ff;
          box-shadow: 0 0 8px rgba(41, 151, 255, 0.9);
        }
        .ms-program-mono {
          font-variant-numeric: tabular-nums;
          font-weight: 650;
          letter-spacing: 0.01em;
        }
        .ms-program-info {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .ms-program-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }
        .ms-program-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #86868b;
        }
        .ms-program-badge.live {
          color: #0071e3;
          font-weight: 650;
        }
        .ms-program-remove-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(118, 118, 128, 0.08);
          color: #86868b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
          transition: 0.16s ease;
        }
        .ms-program-remove-btn:hover {
          background: rgba(255, 59, 48, 0.12);
          border-color: rgba(255, 59, 48, 0.25);
          color: #d70015;
        }
        .ms-program-info h4 {
          margin: 0;
          font-size: 12.8px;
          font-weight: 650;
          letter-spacing: -0.015em;
          color: #1d1d1f;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.28;
        }
        .ms-program-meta-line {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          min-width: 0;
        }
        .ms-program-origin {
          font-weight: 650;
          color: #0071e3;
          flex-shrink: 0;
        }
        .ms-program-dot {
          color: #a1a1a6;
          flex-shrink: 0;
        }
        .ms-program-topic {
          color: #6e6e73;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .ms-playing-eq {
          display: inline-flex;
          gap: 2px;
          align-items: flex-end;
          height: 12px;
          flex-shrink: 0;
        }
        .eq-bar {
          width: 2.5px;
          background: #0071e3;
          border-radius: 2px;
          animation: eq 0.65s infinite alternate ease-in-out;
        }
        .eq-bar:nth-child(1) { height: 5px; animation-delay: 0s; }
        .eq-bar:nth-child(2) { height: 12px; animation-delay: 0.15s; }
        .eq-bar:nth-child(3) { height: 8px; animation-delay: 0.3s; }
        @keyframes eq { 0% { height: 4px; } 100% { height: 12px; } }

        .ms-block-add {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: rgba(0, 113, 227, 0.08);
          padding: 9px 14px;
          border-radius: 999px;
          color: #0071e3;
          font-size: 12.2px;
          font-weight: 650;
          text-align: center;
          cursor: pointer;
          transition: background 0.16s ease, border-color 0.16s ease;
        }
        .ms-block-add:hover { background: rgba(0, 113, 227, 0.14); border-color: rgba(0, 113, 227, 0.4); }

        /* --- Adaptación tablet y celular (< 1024px y < 640px) --- */
        @media (max-width: 1024px) {
          .ms-topnav {
            padding: 10px 16px;
            flex-wrap: wrap;
            gap: 10px;
          }
          .ms-divider,
          .ms-breadcrumb {
            display: none;
          }
          .ms-nav-scroller {
            order: 3;
            width: 100%;
            gap: 16px;
            padding-top: 6px;
            border-top: 1px solid #f1f5f9;
          }
          .ms-main {
            flex-direction: column;
            padding: 12px 16px 8px;
            gap: 14px;
          }
          .ms-player-section,
          .ms-schedule-rail {
            width: 100%;
          }
          .ms-timeline-track {
            max-height: none;
          }
          .ms-smartbar-slot {
            position: relative;
            bottom: 0;
          }
          .ms-mobile-tabs {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
            background: #e2e8f0;
            padding: 4px;
            border-radius: 14px;
          }
          .ms-mobile-tab {
            border: none;
            background: transparent;
            color: #475569;
            font-size: 12px;
            font-weight: 700;
            padding: 9px 6px;
            border-radius: 10px;
            cursor: pointer;
            white-space: nowrap;
          }
          .ms-mobile-tab.active {
            background: #ffffff;
            color: #1d4ed8;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
          }
          .ms-bottom-section {
            padding: 4px 16px 28px;
            gap: 12px;
          }
          .mobile-hide {
            display: none !important;
          }
          .mobile-show {
            display: flex !important;
            flex-direction: column;
          }
        }

        @media (max-width: 640px) {
          .ms-stage-box {
            border-radius: 16px;
          }
          .ms-stage-caption {
            top: 12px;
            left: 14px;
            right: 14px;
            max-width: 92%;
          }
          .ms-stage-topic {
            font-size: 15px;
          }
          .ms-stage-sub {
            font-size: 11px;
          }
          .ms-schedule-panel {
            padding: 14px;
          }
          .ms-program-thumb-wrap {
            width: 109px;
            height: 68px;
          }
        }

        /* =====================================================================
           APPLE GLASS DARK FROSTED SKIN (Unificado con MiTV / YOU MUSIC / Reels)
           GPU-friendly: blur(22px) + contain: strict en fondo, blur(14px) solo
           en contenedores superiores, CERO backdrop-filter en filas de grilla.
           ===================================================================== */
        .ms-container {
          position: relative;
          background-color: #14161a;
          color: #f5f5f7;
          isolation: isolate;
          overflow-x: clip;
        }
        .ms-ambient-bg {
          position: fixed;
          inset: -24px;
          z-index: 0;
          background-color: #1c1e24;
          background-image:
            radial-gradient(ellipse 42% 46% at 24% 20%, rgba(214, 224, 238, 0.48) 0%, transparent 62%),
            radial-gradient(ellipse 44% 46% at 76% 32%, rgba(92, 134, 184, 0.44) 0%, transparent 64%),
            radial-gradient(ellipse 50% 42% at 50% 88%, rgba(164, 174, 188, 0.38) 0%, transparent 65%),
            linear-gradient(155deg, #161920 0%, #232a36 48%, #15181e 100%);
          background-size: cover;
          background-position: center;
          filter: blur(22px) brightness(0.74);
          transform: scale(1.06) translateZ(0);
          contain: strict;
          pointer-events: none;
          transition: background-image 0.45s ease;
        }
        .ms-ambient-veil {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: linear-gradient(
            180deg,
            rgba(18, 20, 24, 0.40) 0%,
            rgba(22, 24, 28, 0.28) 48%,
            rgba(14, 16, 20, 0.52) 100%
          );
          pointer-events: none;
        }
        .ms-hero-shell,
        .ms-main,
        .ms-bottom-section {
          position: relative;
          z-index: 1;
        }
        .ms-hero-shell {
          z-index: 40;
        }
        .ms-follow-invite-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 10px;
          padding: 10px 16px;
          border-radius: 16px;
          background: rgba(10, 132, 255, 0.22);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #ffffff;
          font-size: 13px;
        }
        .ms-follow-invite-banner span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .ms-topnav {
          z-index: 70;
          background: rgba(24, 26, 30, 0.44);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ms-divider {
          background: rgba(255, 255, 255, 0.18);
        }
        .ms-breadcrumb-root {
          color: #ffffff;
        }
        .ms-dot {
          color: #64d2ff;
        }
        .ms-breadcrumb-current {
          color: rgba(245, 245, 247, 0.72);
        }
        .ms-nav-btn {
          color: rgba(245, 245, 247, 0.78);
        }
        .ms-nav-btn:hover {
          color: #ffffff;
        }
        .ms-nav-btn.active {
          color: #64d2ff;
          border-bottom-color: #64d2ff;
        }
        .ms-nav-pill {
          background: rgba(10, 132, 255, 0.22);
          border: 1px solid rgba(100, 210, 255, 0.36);
          color: #ffffff;
        }
        .ms-nav-pill:hover {
          background: rgba(10, 132, 255, 0.38);
        }

        /* Tarjetas principales Apple Glass (solo contenedores de primer nivel) */
        .ms-hero-card,
        .ms-now-playing-header,
        .ms-schedule-panel {
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.09) 100%
          );
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            0 12px 32px rgba(0, 0, 0, 0.26);
          color: #f5f5f7;
        }
        .ms-hero-avatar-btn,
        .ms-hero-avatar-readonly,
        .ms-np-avatar-btn,
        .ms-channel-avatar,
        .ms-signal-avatar-btn,
        .ms-signal-avatar-readonly {
          border-color: rgba(255, 255, 255, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }
        .ms-signal-avatar-empty {
          background: rgba(255, 255, 255, 0.14);
          color: rgba(245, 245, 247, 0.8);
        }
        .ms-hero-title,
        .ms-hero-stat-num,
        .ms-np-title,
        .ms-rail-head h3,
        .ms-schedule-title-group h3,
        .ms-schedule-count-pill strong,
        .ms-channel-name,
        .ms-program-info h4,
        .ms-rv-body strong {
          color: #ffffff;
        }
        .ms-hero-sub,
        .ms-np-sub,
        .ms-channel-latest-tag,
        .ms-program-badge,
        .ms-program-topic,
        .ms-rv-body span,
        .ms-media-empty,
        .ms-media-subhead,
        .ms-media-row-meta span,
        .ms-filter-empty p {
          color: rgba(245, 245, 247, 0.72);
        }
        .ms-np-channel-link {
          color: rgba(245, 245, 247, 0.9);
        }
        .ms-np-channel-link:hover,
        .ms-channel-open-btn:hover .ms-channel-name {
          color: #64d2ff;
        }
        .ms-np-sep,
        .ms-program-dot {
          color: rgba(245, 245, 247, 0.42);
        }
        .ms-np-yt-link {
          color: #ff8a80;
        }
        .ms-sync-tag,
        .ms-program-badge.live,
        .ms-program-origin,
        .ms-rv-badge {
          color: #64d2ff;
        }
        .ms-new-blue-dot,
        .eq-bar {
          background: #64d2ff;
        }

        /* Botones y pastillas translúcidas */
        .ms-hero-pill-btn,
        .ms-np-pill,
        .ms-link-pill,
        .ms-add-pill,
        .ms-rv-manage-btn {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #f5f5f7;
        }
        .ms-hero-pill-btn:hover,
        .ms-np-pill:hover,
        .ms-link-pill:hover,
        .ms-add-pill:hover,
        .ms-rv-manage-btn:hover {
          background: rgba(255, 255, 255, 0.22);
          border-color: rgba(255, 255, 255, 0.36);
          color: #ffffff;
          box-shadow: none;
        }
        .ms-hero-pill-btn.active-follow {
          background: rgba(48, 209, 88, 0.22);
          border-color: rgba(48, 209, 88, 0.48);
          color: #8ce99a;
        }
        .ms-hero-sub-cta-row {
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ms-hero-subscribe-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12.2px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 113, 227, 0.34);
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ms-hero-subscribe-btn:hover {
          background: #0a84ff;
        }
        .ms-hero-subscribe-btn.subscribed {
          background: rgba(48, 209, 88, 0.22);
          border-color: rgba(48, 209, 88, 0.55);
          color: #d7ffe1;
          box-shadow: none;
        }
        .ms-hero-icon-reveal {
          gap: 0 !important;
          padding: 7px 10px !important;
          transition: padding 0.18s ease, background 0.15s ease, border-color 0.15s ease;
        }
        .ms-hero-icon-reveal .ms-hero-reveal-label {
          display: inline-block;
          max-width: 0;
          opacity: 0;
          margin-left: 0;
          overflow: hidden;
          white-space: nowrap;
          transition: max-width 0.2s ease, opacity 0.16s ease, margin-left 0.18s ease;
        }
        .ms-hero-icon-reveal:hover,
        .ms-hero-icon-reveal:focus-visible {
          padding: 7px 13px !important;
        }
        .ms-hero-icon-reveal:hover .ms-hero-reveal-label,
        .ms-hero-icon-reveal:focus-visible .ms-hero-reveal-label {
          max-width: 185px;
          opacity: 1;
          margin-left: 6px;
        }
        .ms-np-pill.liked {
          background: rgba(255, 55, 95, 0.24);
          border-color: rgba(255, 100, 130, 0.5);
          color: #ff9eb5;
        }
        .ms-np-pill.following {
          background: rgba(10, 132, 255, 0.26);
          border-color: rgba(100, 210, 255, 0.48);
          color: #d9f3ff;
        }
        .ms-continuous-pill {
          background: rgba(255, 255, 255, 0.10);
          border-color: rgba(255, 255, 255, 0.18);
          color: rgba(245, 245, 247, 0.78);
        }
        .ms-continuous-pill.on {
          background: rgba(10, 132, 255, 0.26);
          border-color: rgba(100, 210, 255, 0.46);
          color: #64d2ff;
        }
        .ms-event-phase-pill.live {
          background: rgba(255, 69, 58, 0.24);
          color: #ff9f99;
        }
        .ms-event-phase-pill.upcoming {
          background: rgba(255, 159, 10, 0.24);
          color: #ffd180;
        }
        .ms-event-phase-pill.archive {
          background: rgba(255, 255, 255, 0.14);
          color: rgba(245, 245, 247, 0.85);
        }

        /* Dropdown "Cambiar señal" */
        .ms-hero-switcher-menu {
          background: rgba(20, 22, 28, 0.94);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.5);
        }
        .ms-hero-switcher-item {
          color: #f5f5f7;
        }
        .ms-hero-switcher-item:hover,
        .ms-hero-switcher-item.current {
          background: rgba(10, 132, 255, 0.26);
          color: #ffffff;
        }

        /* Reproductor y SmartBar (Apple Glass alto contraste, igual que MiTV) */
        .ms-stage-box {
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.18),
            0 24px 54px -18px rgba(0, 0, 0, 0.55);
        }
        .ms-smartbar-slot .bv-root {
          background: rgba(20, 22, 28, 0.78) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255, 255, 255, 0.24) !important;
          color: #f5f5f7 !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            0 12px 32px rgba(0, 0, 0, 0.36) !important;
        }
        .ms-smartbar-slot .bv-compact-btn,
        .ms-smartbar-slot .bv-more-btn,
        .ms-smartbar-slot .bv-native-ctrl-btn,
        .ms-smartbar-slot .bv-step-btn,
        .ms-smartbar-slot .bv-icon-btn,
        .ms-smartbar-slot .bv-moment-chip,
        .ms-smartbar-slot .bv-saved-toggle-btn,
        .ms-smartbar-slot .bv-save-moment-btn,
        .ms-smartbar-slot .bv-follow-btn {
          background: rgba(255, 255, 255, 0.14) !important;
          border: 1px solid rgba(255, 255, 255, 0.24) !important;
          color: #f5f5f7 !important;
        }
        .ms-smartbar-slot .bv-compact-btn:hover,
        .ms-smartbar-slot .bv-more-btn:hover,
        .ms-smartbar-slot .bv-native-ctrl-btn:hover,
        .ms-smartbar-slot .bv-step-btn:hover:not(:disabled),
        .ms-smartbar-slot .bv-icon-btn:hover,
        .ms-smartbar-slot .bv-moment-chip:hover,
        .ms-smartbar-slot .bv-saved-toggle-btn:hover,
        .ms-smartbar-slot .bv-save-moment-btn:hover,
        .ms-smartbar-slot .bv-follow-btn:hover {
          background: rgba(255, 255, 255, 0.24) !important;
          border-color: rgba(255, 255, 255, 0.44) !important;
          color: #ffffff !important;
        }
        .ms-smartbar-slot .bv-compact-btn.active,
        .ms-smartbar-slot .bv-more-btn.active,
        .ms-smartbar-slot .bv-saved-toggle-btn.open {
          background: rgba(255, 255, 255, 0.94) !important;
          border-color: #ffffff !important;
          color: #1d1d1f !important;
        }
        .ms-smartbar-slot .bv-compact-btn.accent {
          background: rgba(10, 132, 255, 0.28) !important;
          border-color: rgba(100, 210, 255, 0.5) !important;
          color: #d9f3ff !important;
        }
        .ms-smartbar-slot .bv-compact-btn.accent:hover {
          background: rgba(10, 132, 255, 0.42) !important;
        }
        .ms-smartbar-slot .bv-compact-btn.primary {
          background: #0071e3 !important;
          border-color: rgba(255, 255, 255, 0.28) !important;
          color: #ffffff !important;
        }
        .ms-smartbar-slot .bv-native-scrub-row {
          border-bottom-color: rgba(255, 255, 255, 0.16) !important;
        }
        .ms-smartbar-slot .bv-mono-time,
        .ms-smartbar-slot .bv-tl-time,
        .ms-smartbar-slot .bv-signal-line strong,
        .ms-smartbar-slot .bv-saved-meta strong,
        .ms-smartbar-slot .bv-saved-drawer-head {
          color: #ffffff !important;
        }
        .ms-smartbar-slot .bv-mono-time.muted,
        .ms-smartbar-slot .bv-signal-sub,
        .ms-smartbar-slot .bv-saved-meta span,
        .ms-smartbar-slot .bv-saved-drawer-sub,
        .ms-smartbar-slot .bv-saved-empty,
        .ms-smartbar-slot .bv-share-head,
        .ms-smartbar-slot .bv-share-origin {
          color: rgba(245, 245, 247, 0.78) !important;
        }
        .ms-smartbar-slot .bv-share-menu,
        .ms-smartbar-slot .bv-saved-drawer {
          background: rgba(20, 22, 28, 0.94) !important;
          backdrop-filter: blur(24px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          border: 1px solid rgba(255, 255, 255, 0.24) !important;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.48) !important;
          color: #f5f5f7 !important;
        }
        .ms-smartbar-slot .bv-more-item,
        .ms-smartbar-slot .bv-share-item {
          color: #f5f5f7 !important;
        }
        .ms-smartbar-slot .bv-more-item:hover,
        .ms-smartbar-slot .bv-share-item:hover {
          background: rgba(255, 255, 255, 0.14) !important;
          color: #64d2ff !important;
        }
        .ms-smartbar-slot .bv-share-divider {
          background: rgba(255, 255, 255, 0.14) !important;
        }
        .ms-smartbar-slot .bv-saved-item {
          background: rgba(255, 255, 255, 0.1) !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
        }
        .ms-smartbar-slot .bv-signal-hairline {
          background: rgba(255, 255, 255, 0.18) !important;
        }

        /* Grilla derecha (SIN backdrop-filter en filas individuales) */
        .ms-rail-head,
        .ms-schedule-header,
        .ms-signal-profile-card {
          border-bottom-color: rgba(255, 255, 255, 0.12);
        }
        .ms-pulse-filter {
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ms-pulse-tab {
          color: rgba(245, 245, 247, 0.74);
        }
        .ms-pulse-tab.active {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
          box-shadow: none;
        }
        .ms-url-bar {
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .ms-url-bar:focus-within {
          background: rgba(0, 0, 0, 0.42);
          border-color: rgba(100, 210, 255, 0.55);
          box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.22);
        }
        .ms-url-icon {
          color: rgba(245, 245, 247, 0.58);
        }
        .ms-url-input {
          color: #ffffff;
        }
        .ms-url-input::placeholder {
          color: rgba(245, 245, 247, 0.52);
        }
        .ms-schedule-count-pill {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.16);
          color: rgba(245, 245, 247, 0.78);
        }
        .ms-channel-group {
          background: rgba(18, 22, 30, 0.46);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: none;
        }
        .ms-channel-banner {
          background: rgba(255, 255, 255, 0.06);
          border-bottom-color: rgba(255, 255, 255, 0.1);
        }
        .ms-channel-banner:not(.has-img) .ms-channel-ext-link {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.2);
          color: #f5f5f7;
        }
        .ms-channel-more-btn {
          background: rgba(10, 132, 255, 0.22);
          color: #64d2ff;
        }
        .ms-channel-more-btn:hover {
          background: rgba(10, 132, 255, 0.36);
        }
        .ms-channel-live-pill {
          background: rgba(255, 69, 58, 0.22);
          color: #ff9f99;
        }
        .ms-program-card {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ms-program-card:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(100, 210, 255, 0.45);
          box-shadow: none;
        }
        .ms-program-card.active {
          background: rgba(10, 132, 255, 0.24);
          border: 1.5px solid #64d2ff;
          box-shadow: 0 6px 20px -8px rgba(10, 132, 255, 0.45);
        }
        .ms-live-card {
          border-color: rgba(255, 69, 58, 0.42) !important;
          background: rgba(255, 69, 58, 0.14) !important;
        }
        .ms-program-badge.live-red {
          color: #ff9f99;
        }
        .ms-program-thumb-wrap {
          border-color: rgba(255, 255, 255, 0.2);
        }
        .ms-program-remove-btn,
        .ms-ch-ctrl-btn,
        .ms-signal-name-edit-btn {
          background: rgba(255, 255, 255, 0.10);
          border-color: rgba(255, 255, 255, 0.16);
          color: rgba(245, 245, 247, 0.8);
        }
        .ms-ch-ctrl-btn:hover:not(:disabled),
        .ms-signal-name-edit-btn:hover {
          background: rgba(255, 255, 255, 0.22);
          color: #64d2ff;
          border-color: rgba(100, 210, 255, 0.4);
        }
        .ms-signal-name-input {
          background: rgba(0, 0, 0, 0.42);
          color: #ffffff;
          border-color: rgba(100, 210, 255, 0.55);
        }
        .ms-signal-name-action.cancel {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .ms-block-add {
          background: rgba(10, 132, 255, 0.20);
          border-color: rgba(100, 210, 255, 0.42);
          color: #d9f3ff;
        }
        .ms-block-add:hover {
          background: rgba(10, 132, 255, 0.34);
          border-color: rgba(100, 210, 255, 0.65);
          color: #ffffff;
        }
        .ms-media-drawer {
          background: rgba(18, 22, 30, 0.46);
          border-color: rgba(255, 255, 255, 0.14);
        }
        .ms-media-drawer-toggle {
          color: #f5f5f7;
        }
        .ms-media-drawer-toggle:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .ms-media-drawer-body {
          border-top-color: rgba(255, 255, 255, 0.1);
        }
        .ms-media-count-badge {
          background: rgba(10, 132, 255, 0.24);
          color: #64d2ff;
        }
        .ms-media-row {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
          color: #f5f5f7;
        }
        .ms-media-row.playing {
          background: rgba(10, 132, 255, 0.22);
          border-color: rgba(100, 210, 255, 0.42);
        }
        .ms-media-row.link:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(100, 210, 255, 0.4);
        }
        .ms-media-manage-btn {
          background: rgba(10, 132, 255, 0.18);
          border-color: rgba(100, 210, 255, 0.38);
          color: #d9f3ff;
        }
        .ms-redviva-guest-card {
          background: linear-gradient(135deg, rgba(10, 132, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 100%);
          border-color: rgba(100, 210, 255, 0.36);
        }
        .ms-rv-score {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .ms-filter-empty {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.14);
        }
        @media (max-width: 1024px) {
          .ms-nav-scroller {
            border-top-color: rgba(255, 255, 255, 0.12);
          }
          .ms-mobile-tabs {
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.16);
          }
          .ms-mobile-tab {
            color: rgba(245, 245, 247, 0.78);
          }
          .ms-mobile-tab.active {
            background: rgba(10, 132, 255, 0.34);
            color: #ffffff;
            box-shadow: none;
          }
        }

        /* --- Tarjeta unificada del reproductor (Video + Botonera + SmartBar como en MiTV) --- */
        .ms-player-card {
          position: relative;
          display: flex;
          flex-direction: column;
          border-radius: 22px;
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.09) 100%
          );
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            0 16px 38px rgba(0, 0, 0, 0.34);
          overflow: visible;
        }
        .ms-player-card .ms-stage-box {
          border-radius: 21px 21px 0 0;
          box-shadow: none;
        }
        .ms-player-card.is-expanded {
          position: fixed;
          inset: 0;
          z-index: 9999;
          border-radius: 0;
          border: none;
          background: #06080c;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          box-shadow: none;
        }
        .ms-player-card.is-expanded .ms-stage-box {
          flex: 1;
          min-height: 0;
          aspect-ratio: auto;
          border-radius: 0;
        }
        .ms-player-card.is-expanded .ms-mitv-info-bar,
        .ms-player-card.is-expanded .ms-smartbar-slot {
          display: none;
        }
        .ms-player-card .ms-smartbar-slot {
          padding: 0 14px 14px;
        }
        .ms-player-card .ms-smartbar-slot .bv-root {
          background: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 8px 24px rgba(0, 0, 0, 0.18) !important;
          color: #f5f5f7 !important;
        }
        .ms-live-air-pill {
          position: absolute;
          top: 10px;
          left: 12px;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          background: rgba(10, 14, 22, 0.72);
          border: 1px solid rgba(100, 210, 255, 0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #e0f2fe;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          pointer-events: none;
        }
        .ms-live-air-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #38bdf8;
          box-shadow: 0 0 8px #38bdf8;
        }
        .ms-hero-card {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.28),
            0 14px 36px rgba(0, 0, 0, 0.34) !important;
        }
        .ms-hero-avatar-btn,
        .ms-hero-avatar-readonly {
          box-shadow:
            0 0 0 2.5px rgba(100, 210, 255, 0.82),
            0 6px 18px rgba(0, 113, 227, 0.42) !important;
        }
        /* Portada movida a Mi Perfil (/perfil): Mi Señal queda 100% enfocada en ver TV + programación + repetidoras */
        .ms-hero-shell {
          display: none !important;
        }
        .ms-compact-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 14px;
          background: rgba(16, 20, 30, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          margin-bottom: 10px;
        }
        .ms-compact-left {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          flex: 1;
        }
        .ms-compact-left strong {
          font-size: 13.5px;
          font-weight: 760;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-compact-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .ms-compact-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(100, 210, 255, 0.42);
          background: rgba(0, 113, 227, 0.24);
          color: #e0f2fe;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .ms-compact-btn.ghost {
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.9);
        }
        @media (max-width: 768px) {
          .ms-player-card:not(.is-expanded) {
            position: fixed !important;
            top: calc(48px + env(safe-area-inset-top)) !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            z-index: 250 !important;
            margin: 0 !important;
            border-radius: 0 0 14px 14px !important;
            border-top: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
            background: #0e1118 !important;
            box-shadow: 0 14px 32px rgba(0, 0, 0, 0.82) !important;
          }
          .ms-player-card:not(.is-expanded) .ms-stage-box {
            border-radius: 0 !important;
          }
          .ms-main {
            padding-top: calc(56.25vw + 52px) !important;
            transition: padding-top 0.18s ease;
          }
          .ms-page:has(.yapp-pcd-root.is-open) .ms-main {
            padding-top: calc(56.25vw + 172px) !important;
          }
        }
        @media (max-width: 640px) {
          .ms-player-card .ms-smartbar-slot {
            padding: 0 8px 8px;
          }
        }
        .ms-fs-exit-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(18, 20, 26, 0.78);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.48);
        }
        .ms-fs-exit-btn:hover {
          background: rgba(10, 132, 255, 0.88);
        }
        .ms-player-controls-bar {
          position: relative;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 16px;
          background: transparent;
          border: none;
          box-shadow: none;
        }
        .ms-pc-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex: 1 1 220px;
        }
        .ms-pc-live-pill {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.32);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #d9f3ff;
          flex-shrink: 0;
        }
        .ms-pc-pos {
          font-size: 12px;
          font-weight: 550;
          color: rgba(245, 245, 247, 0.8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-pc-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ms-ctrl-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.30);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ms-ctrl-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.26);
          border-color: rgba(255, 255, 255, 0.46);
        }
        .ms-ctrl-btn:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
        .ms-ctrl-btn.active {
          background: rgba(10, 132, 255, 0.34);
          border-color: rgba(100, 210, 255, 0.65);
        }
        .ms-popover-anchor {
          position: relative;
          display: inline-flex;
        }
        .ms-mitv-info-bar {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 12px 16px 10px;
          background: transparent;
          border-top: none;
        }
        .ms-mitv-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          flex-wrap: nowrap;
        }
        .ms-mitv-social-left {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          flex: 1;
        }
        .ms-mitv-actions-right {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }
        @media (max-width: 640px) {
          .ms-hero-shell {
            padding-left: 10px !important;
            padding-right: 10px !important;
            padding-bottom: 0 !important;
          }
          .ms-hero-card {
            border-radius: 18px !important;
          }
          .ms-hero-cover {
            height: 76px !important;
            border-radius: 17px 17px 0 0 !important;
          }
          .ms-hero-bar {
            padding: 10px 12px 10px !important;
            gap: 8px !important;
            flex-wrap: nowrap !important;
            align-items: flex-end !important;
            justify-content: space-between !important;
          }
          .ms-hero-left {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            gap: 10px !important;
            align-items: flex-end !important;
          }
          .ms-hero-sub-cta-row {
            margin-top: 4px !important;
          }
          .ms-hero-subscribe-btn {
            height: 26px !important;
            padding: 0 10px !important;
            font-size: 11px !important;
            gap: 4px !important;
            line-height: 1 !important;
          }
          .ms-hero-actions .ms-hero-pill-btn {
            height: 26px !important;
            min-height: 26px !important;
            padding: 0 8px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .ms-hero-avatar-btn,
          .ms-hero-avatar-readonly {
            width: 44px !important;
            height: 44px !important;
            margin-top: -22px !important;
          }
          .ms-hero-actions {
            width: auto !important;
            flex-shrink: 0 !important;
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 6px !important;
            overflow: visible !important;
            padding-bottom: 0 !important;
          }
          .ms-hero-actions > * {
            flex-shrink: 0;
          }
          .ms-mitv-info-bar {
            padding: 9px 10px 7px !important;
          }
          .ms-mitv-top-row {
            gap: 6px !important;
          }
          .ms-mitv-social-left {
            gap: 5px !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
          }
          .ms-mitv-actions-right {
            gap: 4px !important;
            flex-shrink: 0 !important;
          }
          .ms-channel-profile-pill {
            max-width: 132px !important;
            height: 28px !important;
            padding: 0 8px 0 5px !important;
            font-size: 11.5px !important;
          }
          .ms-top-icon-btn {
            height: 28px !important;
            min-width: 28px !important;
            padding: 0 6px !important;
          }
        }
        .ms-top-icon-btn {
          height: 30px;
          min-width: 30px;
          padding: 0 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .ms-top-icon-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(100, 210, 255, 0.45);
        }
        .ms-top-icon-btn.is-liked {
          background: rgba(255, 55, 95, 0.2);
          border-color: rgba(255, 55, 95, 0.55);
          color: #ff6b8a;
        }
        .ms-top-icon-btn.is-subbed {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.6);
          color: #7dd3fc;
        }
        .ms-like-count {
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .ms-en-pantalla-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.22);
          border: 1px solid rgba(100, 210, 255, 0.45);
          color: #7dd3fc;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .ms-channel-profile-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 170px;
          height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #e6f4ff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-channel-profile-pill:hover {
          background: rgba(10, 132, 255, 0.24);
          border-color: rgba(100, 210, 255, 0.55);
          color: #ffffff;
        }
        .ms-mitv-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ms-mitv-meta {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.64);
        }
        .ms-collab-bar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ms-collab-chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .ms-collab-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(245, 245, 247, 0.9);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .ms-collab-chip.is-open {
          background: rgba(48, 209, 88, 0.2);
          border-color: rgba(48, 209, 88, 0.5);
          color: #a7f3d0;
        }
        .ms-collab-chip.is-atlas {
          background: rgba(10, 132, 255, 0.2);
          border-color: rgba(100, 210, 255, 0.45);
          color: #bfe9ff;
        }
        .ms-collab-chip.is-add {
          background: #0071e3;
          border-color: rgba(100, 210, 255, 0.6);
          color: #ffffff;
        }
        .ms-collab-chip.is-pending {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(252, 211, 77, 0.55);
          color: #fde68a;
        }
        .ms-collab-form {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ms-collab-form input {
          flex: 1 1 180px;
          min-width: 0;
          padding: 7px 11px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.34);
          color: #ffffff;
          font-size: 12px;
          outline: none;
        }
        .ms-collab-form button {
          padding: 7px 12px;
          border-radius: 10px;
          border: 1px solid rgba(100, 210, 255, 0.55);
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ms-collab-error {
          width: 100%;
          font-size: 11.5px;
          color: #fca5a5;
        }
        .ms-collab-pending-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ms-collab-pending-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .ms-collab-pending-row img {
          width: 48px;
          height: 32px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ms-collab-pending-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .ms-collab-pending-info strong {
          font-size: 11.5px;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-collab-pending-info span {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.65);
        }
        .ms-collab-pending-actions {
          display: inline-flex;
          gap: 4px;
        }
        .ms-collab-pending-actions button {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #ffffff;
        }
        .ms-collab-pending-actions button.ok { background: rgba(48, 209, 88, 0.35); }
        .ms-collab-pending-actions button.no { background: rgba(239, 68, 68, 0.35); }
        .ms-collab-chip.is-live-on {
          background: rgba(16, 185, 129, 0.22);
          border-color: rgba(52, 211, 153, 0.55);
          color: #a7f3d0;
        }
        .ms-live-greetings-overlay {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 45;
          display: flex;
          flex-direction: column;
          gap: 6px;
          pointer-events: none;
          max-width: 78%;
        }
        .ms-live-greeting-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 11px;
          border-radius: 999px;
          background: rgba(14, 18, 28, 0.86);
          border: 1px solid rgba(52, 211, 153, 0.55);
          backdrop-filter: blur(12px);
          color: #ffffff;
          font-size: 12px;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.38);
        }
        .ms-live-presence-strip {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 7px 9px;
          border-radius: 12px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(52, 211, 153, 0.26);
        }
        .ms-live-presence-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ms-live-presence-info {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: rgba(235, 250, 245, 0.9);
        }
        .ms-live-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #34d399;
          box-shadow: 0 0 8px #34d399;
          flex-shrink: 0;
        }
        .ms-live-presence-actions {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }
        .ms-live-btn {
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .ms-live-btn.primary {
          background: rgba(16, 185, 129, 0.35);
          border-color: rgba(52, 211, 153, 0.7);
        }
        .ms-live-btn.subtle {
          background: transparent;
          color: rgba(245, 245, 247, 0.65);
        }
        .ms-live-city-picker {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-top: 4px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ms-live-city-hint {
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.65);
        }
        .ms-live-city-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .ms-live-city-chip {
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .ms-live-city-chip.active,
        .ms-live-city-chip:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .ms-cast-popover {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          z-index: 90;
          width: 256px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(20, 22, 28, 0.95);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.52);
          color: #f5f5f7;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ms-cast-head {
          padding: 4px 8px 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64d2ff;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ms-cast-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
          margin: 3px 4px;
        }
        .ms-cast-code-form {
          display: flex;
          gap: 6px;
          padding: 4px 2px 2px;
        }
        .ms-cast-code-form input {
          flex: 1;
          min-width: 0;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-size: 12px;
          outline: none;
        }
        .ms-cast-code-form input::placeholder {
          color: rgba(245, 245, 247, 0.55);
        }
        .ms-cast-connect-btn {
          padding: 7px 11px;
          border-radius: 10px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          white-space: nowrap;
        }
        .ms-cast-connect-btn:hover {
          background: #0a84ff;
        }
        .ms-cast-connected {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          font-size: 12px;
          color: #d9f3ff;
        }
        .ms-cast-stop-btn {
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255, 69, 58, 0.45);
          background: rgba(255, 69, 58, 0.22);
          color: #ffd3d0;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }
        .ms-cast-mycode {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-radius: 10px;
          background: rgba(10, 132, 255, 0.18);
          border: 1px solid rgba(100, 210, 255, 0.32);
          font-size: 12px;
        }
        .ms-cast-mycode strong {
          font-size: 15px;
          letter-spacing: 0.12em;
          color: #64d2ff;
        }

        /* =====================================================================
           SUBCOMPONENTES EN MODO APPLE GLASS (Cajones laterales + Señales curadas)
           ===================================================================== */
        /* 1. Cajones de la columna derecha: Cobertura, Encuestas, Datos/Editorial/Agenda */
        .ms-container .ms-evcov-drawer,
        .ms-container .spd-drawer,
        .ms-container .shd-drawer {
          background: rgba(18, 22, 30, 0.48) !important;
          border: 1px solid rgba(255, 255, 255, 0.16) !important;
          box-shadow: none !important;
          color: #f5f5f7 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
        .ms-container .ms-evcov-toggle,
        .ms-container .spd-toggle,
        .ms-container .shd-toggle {
          color: #f5f5f7 !important;
        }
        .ms-container .ms-evcov-toggle:hover,
        .ms-container .spd-toggle:hover,
        .ms-container .shd-toggle:hover {
          background: rgba(255, 255, 255, 0.06) !important;
        }
        .ms-container .ms-evcov-toggle-texts strong,
        .ms-container .spd-poll-head strong,
        .ms-container .shd-weather-card strong,
        .ms-container .shd-dollar-card strong,
        .ms-container .shd-item-hit strong,
        .ms-container .ms-evcov-source-meta strong,
        .ms-container .ms-evcov-cmt-head strong,
        .ms-container .ms-evcov-upd-text {
          color: #ffffff !important;
        }
        .ms-container .ms-evcov-toggle-texts span,
        .ms-container .ms-evcov-toggle-right,
        .ms-container .ms-evcov-empty,
        .ms-container .ms-evcov-sources-note,
        .ms-container .ms-evcov-subhead,
        .ms-container .ms-evcov-source-meta span,
        .ms-container .spd-empty,
        .ms-container .spd-poll-foot,
        .ms-container .spd-form-head,
        .ms-container .spd-vote-pct,
        .ms-container .shd-empty,
        .ms-container .shd-mini-lbl,
        .ms-container .shd-dollar-card small,
        .ms-container .shd-item-hit span {
          color: rgba(245, 245, 247, 0.74) !important;
        }
        .ms-container .spd-body,
        .ms-container .shd-body,
        .ms-container .ms-evcov-body {
          border-top-color: rgba(255, 255, 255, 0.12) !important;
        }
        .ms-container .spd-badge,
        .ms-container .shd-badge,
        .ms-container .ms-evcov-icon {
          background: rgba(10, 132, 255, 0.24) !important;
          color: #64d2ff !important;
        }
        .ms-container .shd-tabs,
        .ms-container .ms-evcov-tabs {
          background: rgba(0, 0, 0, 0.3) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
        }
        .ms-container .shd-tab,
        .ms-container .ms-evcov-tab {
          color: rgba(245, 245, 247, 0.76) !important;
        }
        .ms-container .shd-tab.active,
        .ms-container .ms-evcov-tab.active {
          background: rgba(255, 255, 255, 0.18) !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }
        .ms-container .spd-poll-card,
        .ms-container .spd-form,
        .ms-container .shd-dollar-card,
        .ms-container .shd-item-card,
        .ms-container .shd-form,
        .ms-container .ms-evcov-upd-card,
        .ms-container .ms-evcov-source-row,
        .ms-container .ms-evcov-cmt-card {
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.14) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .shd-weather-card {
          background: linear-gradient(135deg, rgba(10, 132, 255, 0.24) 0%, rgba(255, 255, 255, 0.08) 100%) !important;
          border-color: rgba(100, 210, 255, 0.34) !important;
        }
        .ms-container .shd-weather-desc,
        .ms-container .shd-ag-date,
        .ms-container .spd-add-opt {
          color: #64d2ff !important;
        }
        .ms-container .spd-input,
        .ms-container .shd-input,
        .ms-container .shd-textarea,
        .ms-container .shd-select,
        .ms-container .ms-evcov-input {
          background: rgba(0, 0, 0, 0.36) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: #ffffff !important;
        }
        .ms-container .spd-vote-btn,
        .ms-container .shd-refresh-btn,
        .ms-container .shd-ics-btn,
        .ms-container .shd-del-btn,
        .ms-container .spd-mini-ico {
          background: rgba(255, 255, 255, 0.12) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .spd-vote-btn.selected {
          border-color: #64d2ff !important;
          color: #64d2ff !important;
        }
        .ms-container .spd-new-btn,
        .ms-container .shd-action-btn,
        .ms-container .ms-evcov-ghost-btn {
          background: rgba(10, 132, 255, 0.22) !important;
          border-color: rgba(100, 210, 255, 0.42) !important;
          color: #d9f3ff !important;
        }

        /* 2. Sección inferior: Señales curadas (CuratedSignalsDiscoverSection) */
        .ms-container .csd-root {
          padding: 0 !important;
        }
        .ms-container .csd-eyebrow {
          color: #64d2ff !important;
        }
        .ms-container .csd-header-copy h2 {
          color: #ffffff !important;
        }
        .ms-container .csd-header-copy p {
          color: rgba(245, 245, 247, 0.74) !important;
        }
        .ms-container .csd-15m-btn {
          background: rgba(255, 255, 255, 0.12) !important;
          border-color: rgba(255, 255, 255, 0.24) !important;
          color: #f5f5f7 !important;
          box-shadow: none !important;
        }
        .ms-container .csd-15m-btn.active {
          background: rgba(10, 132, 255, 0.28) !important;
          border-color: #64d2ff !important;
          color: #ffffff !important;
        }
        .ms-container .csd-create-btn {
          background: #0071e3 !important;
          color: #ffffff !important;
        }
        .ms-container .csd-card {
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.14) 0%,
            rgba(255, 255, 255, 0.08) 100%
          ) !important;
          backdrop-filter: blur(14px) !important;
          -webkit-backdrop-filter: blur(14px) !important;
          border: 1px solid rgba(255, 255, 255, 0.22) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 12px 32px rgba(0, 0, 0, 0.26) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .csd-subtitle,
        .ms-container .csd-actions-prompt {
          color: rgba(245, 245, 247, 0.8) !important;
        }
        .ms-container .csd-curator-box {
          background: rgba(18, 22, 30, 0.46) !important;
          border: 1px solid rgba(255, 255, 255, 0.14) !important;
        }
        .ms-container .csd-curator-box strong {
          color: #64d2ff !important;
        }
        .ms-container .csd-curator-box span {
          color: rgba(245, 245, 247, 0.72) !important;
        }
        .ms-container .csd-creator-chip {
          background: rgba(255, 255, 255, 0.10) !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .csd-creator-chip:hover {
          background: rgba(10, 132, 255, 0.26) !important;
          border-color: rgba(100, 210, 255, 0.48) !important;
          color: #ffffff !important;
        }
        .ms-container .csd-creator-min {
          color: rgba(245, 245, 247, 0.62) !important;
        }
        .ms-container .csd-picker-drawer {
          background: rgba(18, 22, 30, 0.62) !important;
          border-color: rgba(100, 210, 255, 0.34) !important;
        }
        .ms-container .csd-picker-head,
        .ms-container .csd-picker-meta strong {
          color: #ffffff !important;
        }
        .ms-container .csd-picker-row {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .csd-picker-row.checked {
          background: rgba(10, 132, 255, 0.24) !important;
          border-color: #64d2ff !important;
        }
        .ms-container .csd-picker-meta span {
          color: rgba(245, 245, 247, 0.7) !important;
        }
        .ms-container .csd-btn-outline,
        .ms-container .csd-pick-save {
          background: rgba(255, 255, 255, 0.12) !important;
          border: 1px solid rgba(255, 255, 255, 0.22) !important;
          color: #f5f5f7 !important;
        }
        .ms-container .csd-btn-outline:hover,
        .ms-container .csd-btn-outline.active {
          background: rgba(255, 255, 255, 0.22) !important;
          border-color: rgba(100, 210, 255, 0.5) !important;
          color: #ffffff !important;
        }
        .ms-container .csd-pilot-footer {
          background: linear-gradient(
            155deg,
            rgba(255, 255, 255, 0.13) 0%,
            rgba(255, 255, 255, 0.07) 100%
          ) !important;
          backdrop-filter: blur(14px) !important;
          -webkit-backdrop-filter: blur(14px) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: rgba(245, 245, 247, 0.82) !important;
        }
        .ms-container .csd-pilot-footer strong {
          color: #ffffff !important;
        }
        .ms-container .csd-pilot-link {
          color: #64d2ff !important;
        }
        .ms-quick-send {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 11.2px;
          color: rgba(245, 245, 247, 0.72);
        }
        .ms-bookmarklet-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 11px;
          border-radius: 999px;
          background: rgba(10, 132, 255, 0.28);
          border: 1px solid rgba(100, 210, 255, 0.55);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 700;
          text-decoration: none;
          cursor: grab;
          white-space: nowrap;
        }
        .ms-bookmarklet-pill:hover {
          background: #0071e3;
        }

        /* --- YOU4 integrado dentro del mismo reproductor de Mi Señal (4 pantallas) --- */
        .ms-ctrl-pill-you4 {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 34px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.30);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .ms-ctrl-pill-you4:hover {
          background: rgba(255, 255, 255, 0.24);
          border-color: rgba(255, 255, 255, 0.48);
        }
        .ms-ctrl-pill-you4.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
          box-shadow: 0 0 14px rgba(10, 132, 255, 0.55);
        }
        .ms-you4-grid {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          background: #05070a;
          box-sizing: border-box;
        }
        .ms-you4-tile {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1016;
          border: 2px solid rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
          cursor: pointer;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .ms-you4-tile.audio-active {
          border-color: #64d2ff;
          box-shadow: inset 0 0 0 1px rgba(100, 210, 255, 0.45), 0 0 16px rgba(10, 132, 255, 0.35);
        }
        .ms-you4-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          object-fit: cover;
          display: block;
        }
        .ms-you4-top-bar {
          position: absolute;
          top: 6px;
          left: 6px;
          right: 6px;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          pointer-events: none;
        }
        .ms-you4-ch-badge {
          max-width: 60%;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(14, 16, 22, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-you4-tile-actions {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          pointer-events: auto;
        }
        .ms-you4-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(14, 16, 22, 0.78);
          color: rgba(245, 245, 247, 0.88);
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }
        .ms-you4-chip:hover {
          background: rgba(255, 255, 255, 0.22);
          color: #ffffff;
        }
        .ms-you4-chip.active {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .ms-you4-bottom-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 3;
          padding: 16px 8px 6px;
          background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.82) 100%);
          pointer-events: none;
        }
        .ms-you4-title {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.94);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
