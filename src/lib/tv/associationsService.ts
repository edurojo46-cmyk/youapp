import { supabase } from '../supabase';
import { CURATED_SIGNALS_PILOT } from './curatedSignalsCatalog';
import { useSignalStore } from './signalStore';
import {
  EXPOSURE_LEVELS,
  slotToExposureLevel,
  exposureLevelToSlot,
  computeAtlasChannelAffinity,
  selectContextualRepeaterRecommendations,
  type PlacementSlot,
  type ExposureLevel,
  type ExposureLevelDefinition,
  type AtlasAffinitySuggestion,
  type ContextualRepeaterRecommendation
} from './repeaterAffinityEngine';

export {
  EXPOSURE_LEVELS,
  slotToExposureLevel,
  exposureLevelToSlot,
  computeAtlasChannelAffinity,
  selectContextualRepeaterRecommendations,
  type PlacementSlot,
  type ExposureLevel,
  type ExposureLevelDefinition,
  type AtlasAffinitySuggestion,
  type ContextualRepeaterRecommendation
};

export type AssociationModality = 'UNILATERAL_FREE' | 'BILATERAL' | 'UNILATERAL_PAID';
export type AssociationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ACCEPTED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'REVOKED';

export interface AssociatedChannelDirectoryItem {
  id: string;
  userId: string;
  name: string;
  category: string;
  slug: string | null;
  isPublic: boolean;
  originPlatform: string;
  originUrl: string | null;
  featuredVideoUrl: string | null;
  featuredVideoTitle: string | null;
  description: string;
}

export interface UserSignalSummary {
  id: string;
  clientSignalId: string;
  userId: string | null;
  name: string;
  prompt: string;
  mainTopic: string | null;
  visibility: string;
  status: string;
}

export interface SignalMembershipItem {
  id: string;
  signalId: string;
  channelId: string;
  agreementId: string | null;
  membershipRole: 'owned' | 'followed' | 'repeater' | 'reciprocal_repeater';
  placementSlot: PlacementSlot;
  editorialOrder: number;
  attributionLabel: string;
  originPlatform: string;
  originUrl: string;
  featuredVideoUrl: string | null;
  featuredVideoTitle: string | null;
  isActive: boolean;
  channelName?: string;
  channelCategory?: string;
  referralClicks?: number;
}

export interface AssociationAgreementItem {
  id: string;
  hostSignalId: string;
  hostSignalName?: string;
  hostChannelId: string | null;
  hostChannelName?: string;
  hostUserId: string;
  partnerChannelId: string;
  partnerChannelName?: string;
  partnerChannelOriginUrl?: string | null;
  partnerSignalId: string | null;
  partnerSignalName?: string;
  partnerUserId: string;
  modality: AssociationModality;
  status: AssociationStatus;
  placementSlot: PlacementSlot;
  editorialNote: string;
  startsAt: string | null;
  endsAt: string | null;
  commercialTerms: Record<string, any>;
  consentLog: Array<{ event: string; actorUserId: string; at: string; modality?: string }>;
  createdAt: string;
  updatedAt: string;
  referralClicks?: number;
}

const PROTECTED_CHANNEL_RX =
  /(red\s*mar[ií]a|solidari|santa\s*mar[ií]a\s*del\s*buen\s*ayre|edu\.rojo|eduardo\.f\.rojo)/i;

export function isProtectedChannelName(name?: string | null): boolean {
  return PROTECTED_CHANNEL_RX.test(String(name || ''));
}

export function extractChannelMeta(row: any): AssociatedChannelDirectoryItem {
  const links = row?.custom_links;
  let originUrl: string | null = null;
  let originPlatform = 'YOUTUBE';
  let featuredVideoUrl: string | null;
  let featuredVideoTitle: string | null = null;
  let description = '';
  featuredVideoUrl = null;

  if (links && typeof links === 'object' && !Array.isArray(links)) {
    if (typeof links.originUrl === 'string' && links.originUrl.startsWith('https://')) {
      originUrl = links.originUrl;
    }
    if (typeof links.platform === 'string' && links.platform.trim()) {
      originPlatform = links.platform.trim().toUpperCase();
    }
    if (typeof links.featuredVideoUrl === 'string' && links.featuredVideoUrl.startsWith('https://')) {
      featuredVideoUrl = links.featuredVideoUrl;
    }
    if (typeof links.featuredVideoTitle === 'string') {
      featuredVideoTitle = links.featuredVideoTitle;
    }
    if (typeof links.description === 'string') {
      description = links.description;
    }
  } else if (Array.isArray(links) && links.length > 0 && typeof links[0]?.url === 'string') {
    if (links[0].url.startsWith('https://')) originUrl = links[0].url;
  }

  if (!originUrl && typeof row?.banner_cta === 'string' && row.banner_cta.startsWith('https://')) {
    originUrl = row.banner_cta;
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category || 'General',
    slug: row.slug || null,
    isPublic: row.is_public !== false,
    originPlatform,
    originUrl,
    featuredVideoUrl,
    featuredVideoTitle,
    description
  };
}

export async function loadAssociationsWorkspace() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  const userId = user && !user.is_anonymous ? user.id : null;

  const { data: ws, error } = await supabase.rpc('get_associations_workspace');
  if (error) throw new Error(error.message);

  const myChannels: AssociatedChannelDirectoryItem[] = (ws?.myChannels || [])
    .filter((r: any) => !isProtectedChannelName(r.name))
    .map(extractChannelMeta);

  const directoryChannels: AssociatedChannelDirectoryItem[] = (ws?.directoryChannels || [])
    .filter((r: any) => !isProtectedChannelName(r.name))
    .map(extractChannelMeta)
    .filter((c: AssociatedChannelDirectoryItem) => Boolean(c.originUrl));

  const mySignals: UserSignalSummary[] = (ws?.mySignals || []).map((s: any) => ({
    id: s.id,
    clientSignalId: s.client_signal_id,
    userId: s.user_id,
    name: s.name,
    prompt: s.prompt,
    mainTopic: s.main_topic,
    visibility: s.visibility || 'public',
    status: s.status || 'ready'
  }));

  const agreements: AssociationAgreementItem[] = (ws?.agreements || []).map((a: any) => ({
    id: a.id,
    hostSignalId: a.host_signal_id,
    hostSignalName: a.host_signal_name || 'Señal',
    hostChannelId: a.host_channel_id,
    hostChannelName: a.host_channel_name || undefined,
    hostUserId: a.host_user_id,
    partnerChannelId: a.partner_channel_id,
    partnerChannelName: a.partner_channel_name || 'Repetidora',
    partnerChannelOriginUrl: a.partner_channel_origin_url || null,
    partnerSignalId: a.partner_signal_id,
    partnerSignalName: a.partner_signal_name || undefined,
    partnerUserId: a.partner_user_id,
    modality: a.modality,
    status: a.status,
    placementSlot: a.placement_slot,
    editorialNote: a.editorial_note || '',
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    commercialTerms: a.commercial_terms || { simulationOnly: true, billingActive: false },
    consentLog: Array.isArray(a.consent_log) ? a.consent_log : [],
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    referralClicks: Number(a.referral_clicks || 0)
  }));

  return {
    userId,
    userEmail: user?.email || null,
    myChannels,
    mySignals,
    directoryChannels,
    agreements
  };
}

export async function createCreatorChannelAndSignal(params: {
  channelName: string;
  category: string;
  originPlatform: string;
  originUrl: string;
  featuredVideoUrl?: string;
  featuredVideoTitle?: string;
  description?: string;
  signalName: string;
}) {
  const { data, error } = await supabase.rpc('create_creator_channel_and_signal', {
    p_channel_name: params.channelName.trim(),
    p_category: params.category.trim() || 'Documental / Cultura',
    p_origin_platform: params.originPlatform.toUpperCase(),
    p_origin_url: params.originUrl.trim(),
    p_signal_name: params.signalName.trim() || `Señal · ${params.channelName.trim()}`,
    p_featured_video_url: params.featuredVideoUrl?.trim() || null,
    p_featured_video_title: params.featuredVideoTitle?.trim() || null,
    p_description: params.description?.trim() || ''
  });
  if (error) throw new Error(error.message);

  const channelRow = data.channel;
  const signalRow = data.signal;
  return {
    channel: extractChannelMeta(channelRow),
    signal: {
      id: signalRow.id,
      clientSignalId: signalRow.client_signal_id,
      userId: signalRow.user_id,
      name: signalRow.name,
      prompt: signalRow.prompt,
      mainTopic: signalRow.main_topic,
      visibility: signalRow.visibility,
      status: signalRow.status
    } as UserSignalSummary
  };
}

export async function proposeAssociation(params: {
  hostSignalId: string;
  partnerChannelId: string;
  modality: AssociationModality;
  placementSlot: PlacementSlot;
  editorialNote: string;
  hostChannelId?: string | null;
  partnerSignalId?: string | null;
  commercialTerms?: Record<string, any>;
}) {
  const { data, error } = await supabase.rpc('propose_channel_association', {
    p_host_signal_id: params.hostSignalId,
    p_partner_channel_id: params.partnerChannelId,
    p_modality: params.modality,
    p_placement_slot: params.placementSlot,
    p_editorial_note: params.editorialNote,
    p_host_channel_id: params.hostChannelId || null,
    p_partner_signal_id: params.partnerSignalId || null,
    p_commercial_terms: params.commercialTerms || { simulationOnly: true, billingActive: false }
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function respondToAssociation(params: {
  agreementId: string;
  action: 'ACCEPT' | 'REJECT' | 'PAUSE' | 'REVOKE';
  partnerSignalId?: string | null;
}) {
  const { data, error } = await supabase.rpc('respond_channel_association', {
    p_agreement_id: params.agreementId,
    p_action: params.action,
    p_partner_signal_id: params.partnerSignalId || null
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function listSignalMemberships(signalId: string): Promise<SignalMembershipItem[]> {
  const { data: rows, error } = await supabase.rpc('list_signal_repeaters', {
    p_signal_ref: signalId || ''
  });
  if (error || !Array.isArray(rows)) return [];

  return rows
    .filter((r: any) => !isProtectedChannelName(r.channel_name))
    .map((r: any) => ({
      id: r.id,
      signalId: r.signal_id,
      channelId: r.channel_id,
      agreementId: r.agreement_id,
      membershipRole: r.membership_role,
      placementSlot: r.placement_slot,
      editorialOrder: r.editorial_order,
      attributionLabel: String(r.attribution_label || '').replace(/Canal asociado/gi, 'Repetidora'),
      originPlatform: r.origin_platform,
      originUrl: r.origin_url,
      featuredVideoUrl: r.featured_video_url,
      featuredVideoTitle: r.featured_video_title,
      isActive: r.is_active,
      channelName: r.channel_name || r.attribution_label,
      channelCategory: r.channel_category || 'Canal',
      referralClicks: Number(r.referral_clicks || 0)
    }));
}

export async function recordAndOpenOriginalChannel(
  membership: SignalMembershipItem,
  preferFeatured = false
) {
  let targetUrl =
    preferFeatured && membership.featuredVideoUrl?.startsWith('https://')
      ? membership.featuredVideoUrl
      : membership.originUrl;
  try {
    const { data } = await supabase.rpc('record_repeater_referral', {
      p_membership_id: membership.id
    });
    if (!preferFeatured && data?.target_url) targetUrl = data.target_url;
  } catch {
    // Still open the creator's original URL even if offline
  }
  if (typeof window !== 'undefined' && targetUrl.startsWith('https://')) {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }
  return targetUrl;
}

export async function listMyOwnSignals(): Promise<UserSignalSummary[]> {
  const byKey = new Map<string, UserSignalSummary>();
  const curatedIds = new Set(CURATED_SIGNALS_PILOT.map((c) => c.id));

  let currentUserId: string | null = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const u = sessionData.session?.user;
    currentUserId = u && !u.is_anonymous ? u.id : null;
  } catch {
    // ignore
  }

  // 1. Señales propias guardadas en Supabase (autorizadas del usuario logueado)
  const cloudOwnIds = new Set<string>();
  try {
    const { data: ws } = await supabase.rpc('get_associations_workspace');
    for (const s of ws?.mySignals || []) {
      if (!s?.id || isProtectedChannelName(s.name)) continue;
      const key = s.client_signal_id || s.id;
      cloudOwnIds.add(key);
      cloudOwnIds.add(s.id);
      byKey.set(key, {
        id: key,
        clientSignalId: key,
        userId: s.user_id || currentUserId,
        name: s.name,
        prompt: s.prompt || '',
        mainTopic: s.main_topic || null,
        visibility: s.visibility || 'private',
        status: s.status || 'ready'
      });
    }
  } catch {
    // ignore
  }

  // 2. Señales creadas localmente por el usuario (solo prefijo signal-* o propias del usuario,
  // excluyendo señales ajenas visitadas por enlace o curadas)
  try {
    const localSaved = useSignalStore.getState().savedSignalsById || {};
    for (const s of Object.values(localSaved)) {
      if (!s?.id || curatedIds.has(s.id) || isProtectedChannelName(s.name)) continue;
      const sigUserId = (s as any).userId || (s as any).user_id || null;
      // Si la señal tiene un userId distinto al usuario actual, es de otro creador -> omitir
      if (sigUserId && currentUserId && sigUserId !== currentUserId) continue;
      const isCreatedByUser =
        s.id.startsWith('signal-') ||
        cloudOwnIds.has(s.id) ||
        (Boolean(sigUserId) && sigUserId === currentUserId);
      if (!isCreatedByUser) continue;
      if (!byKey.has(s.id)) {
        byKey.set(s.id, {
          id: s.id,
          clientSignalId: s.id,
          userId: sigUserId || currentUserId || 'local',
          name: s.name || 'Mi Señal',
          prompt: s.prompt || '',
          mainTopic: (s as any).mainTopic || null,
          visibility: (s as any).visibility || 'public',
          status: 'ready'
        });
      }
    }
  } catch {
    // ignore
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function listSwitchableSignals(): Promise<UserSignalSummary[]> {
  const byKey = new Map<string, UserSignalSummary>();
  const curatedIds = new Set(CURATED_SIGNALS_PILOT.map((c) => c.id));

  // 1. Señales creadas y guardadas por el usuario en su dispositivo/cuenta (prioridad inmediata)
  try {
    const localSaved = useSignalStore.getState().savedSignalsById || {};
    for (const s of Object.values(localSaved)) {
      if (!s?.id || curatedIds.has(s.id) || isProtectedChannelName(s.name)) continue;
      byKey.set(s.id, {
        id: s.id,
        clientSignalId: s.id,
        userId: (s as any).userId || 'local',
        name: s.name || 'Mi Señal',
        prompt: s.prompt || '',
        mainTopic: (s as any).mainTopic || null,
        visibility: (s as any).visibility || 'public',
        status: 'ready'
      });
    }
  } catch {
    // ignore
  }

  // 2. Señales propias guardadas en la nube (Supabase)
  try {
    const { data: ws } = await supabase.rpc('get_associations_workspace');
    for (const s of ws?.mySignals || []) {
      if (!s?.id || isProtectedChannelName(s.name)) continue;
      const key = s.client_signal_id || s.id;
      if (!byKey.has(key) && !byKey.has(s.id)) {
        byKey.set(key, {
          id: key,
          clientSignalId: key,
          userId: s.user_id || null,
          name: s.name,
          prompt: s.prompt || '',
          mainTopic: s.main_topic || null,
          visibility: s.visibility || 'private',
          status: s.status || 'ready'
        });
      }
    }
  } catch {
    // ignore
  }

  // 3. Otras señales públicas del directorio Supabase
  try {
    const { data: pubRows } = await supabase
      .from('custom_signals')
      .select('id,client_signal_id,user_id,name,prompt,main_topic,visibility,status')
      .eq('visibility', 'public')
      .limit(20);

    for (const s of pubRows || []) {
      if (!s?.id || isProtectedChannelName(s.name)) continue;
      const key = s.client_signal_id || s.id;
      if (!byKey.has(key) && !byKey.has(s.id)) {
        byKey.set(key, {
          id: key,
          clientSignalId: key,
          userId: s.user_id || null,
          name: s.name,
          prompt: s.prompt || '',
          mainTopic: s.main_topic || null,
          visibility: s.visibility || 'public',
          status: s.status || 'ready'
        });
      }
    }
  } catch {
    // ignore
  }

  // 4. Señales recomendadas curadas YOUAPP (al final)
  for (const cur of CURATED_SIGNALS_PILOT) {
    if (!byKey.has(cur.id)) {
      byKey.set(cur.id, {
        id: cur.id,
        clientSignalId: cur.id,
        userId: null,
        name: `✦ ${cur.title}`,
        prompt: cur.subtitle,
        mainTopic: cur.tags.join(' · '),
        visibility: 'public',
        status: 'ready'
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const aCur = a.name.startsWith('✦ ') ? 1 : 0;
    const bCur = b.name.startsWith('✦ ') ? 1 : 0;
    if (aCur !== bCur) return aCur - bCur;
    const aMain = a.name.toLowerCase() === 'justicia social tv' ? -1 : 0;
    const bMain = b.name.toLowerCase() === 'justicia social tv' ? -1 : 0;
    if (aMain !== bMain) return aMain - bMain;
    return a.name.localeCompare(b.name, 'es');
  });
}
