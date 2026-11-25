// ============================================================================
// ATLAS AUDIENCE BRIDGE V1 — Medición real de procedencia y conversión (US$ 0)
// - Etiqueta enlaces por red (?src=instagram|tiktok|youtube|facebook|x|whatsapp)
// - Registra visitas y seguidores nuevos reales sin inflar ni inventar métricas.
// ============================================================================

const STORAGE_KEY = 'youapp_audience_bridge_v1';

export type AudienceSourceKey =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'x'
  | 'whatsapp'
  | 'repetidora'
  | 'direct';

export const AUDIENCE_SOURCES: { key: AudienceSourceKey; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'repetidora', label: 'Repetidoras' },
  { key: 'direct', label: 'Enlaces compartidos' }
];

export interface SourceStats {
  visits: number;
  follows: number;
}

export interface SignalBridgeRecord {
  bySource: Record<AudienceSourceKey, SourceStats>;
  returns: number;
  lastVisitDay?: string;
  updatedAt: string;
}

export function normalizeAudienceSource(raw: string | null | undefined): AudienceSourceKey {
  const clean = (raw || '').trim().toLowerCase();
  if (
    clean === 'instagram' ||
    clean === 'tiktok' ||
    clean === 'youtube' ||
    clean === 'facebook' ||
    clean === 'x' ||
    clean === 'whatsapp' ||
    clean === 'repetidora'
  ) {
    return clean;
  }
  return 'direct';
}

function emptyRecord(): SignalBridgeRecord {
  return {
    bySource: {
      instagram: { visits: 0, follows: 0 },
      tiktok: { visits: 0, follows: 0 },
      youtube: { visits: 0, follows: 0 },
      facebook: { visits: 0, follows: 0 },
      x: { visits: 0, follows: 0 },
      whatsapp: { visits: 0, follows: 0 },
      repetidora: { visits: 0, follows: 0 },
      direct: { visits: 0, follows: 0 }
    },
    returns: 0,
    updatedAt: new Date().toISOString()
  };
}

function readAll(): Record<string, SignalBridgeRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, SignalBridgeRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

export function recordBridgeVisit(signalId: string, rawSource?: string | null): void {
  if (typeof window === 'undefined' || !signalId) return;
  const src = normalizeAudienceSource(rawSource);
  const sessKey = `youapp_bridge_visit_${signalId}_${src}`;
  try {
    if (sessionStorage.getItem(sessKey)) return;
    sessionStorage.setItem(sessKey, '1');
  } catch {
    // ignore
  }
  const all = readAll();
  const rec = all[signalId] || emptyRecord();
  const prev = rec.bySource[src] || { visits: 0, follows: 0 };
  rec.bySource[src] = { ...prev, visits: prev.visits + 1 };
  const today = new Date().toISOString().slice(0, 10);
  if (rec.lastVisitDay && rec.lastVisitDay !== today) {
    rec.returns = (rec.returns || 0) + 1;
  }
  rec.lastVisitDay = today;
  rec.updatedAt = new Date().toISOString();
  all[signalId] = rec;
  writeAll(all);
}

export function recordBridgeFollow(signalId: string, rawSource?: string | null): void {
  if (typeof window === 'undefined' || !signalId) return;
  const src = normalizeAudienceSource(rawSource);
  const sessKey = `youapp_bridge_follow_${signalId}_${src}`;
  try {
    if (sessionStorage.getItem(sessKey)) return;
    sessionStorage.setItem(sessKey, '1');
  } catch {
    // ignore
  }
  const all = readAll();
  const rec = all[signalId] || emptyRecord();
  const prev = rec.bySource[src] || { visits: 0, follows: 0 };
  rec.bySource[src] = {
    visits: Math.max(prev.visits, prev.follows + 1),
    follows: prev.follows + 1
  };
  rec.updatedAt = new Date().toISOString();
  all[signalId] = rec;
  writeAll(all);
}

export function readBridgeMetrics(signalId: string): {
  totalVisits: number;
  totalFollows: number;
  totalReturns: number;
  conversionPct: number | null;
  maxSourceVisits: number;
  sources: { key: AudienceSourceKey; label: string; visits: number; follows: number }[];
} {
  const all = readAll();
  const rec = all[signalId] || emptyRecord();
  let totalVisits = 0;
  let totalFollows = 0;
  let maxSourceVisits = 0;

  const sources = AUDIENCE_SOURCES.map((s) => {
    const st = rec.bySource?.[s.key] || { visits: 0, follows: 0 };
    totalVisits += st.visits;
    totalFollows += st.follows;
    if (st.visits > maxSourceVisits) maxSourceVisits = st.visits;
    return { key: s.key, label: s.label, visits: st.visits, follows: st.follows };
  });

  const conversionPct =
    totalVisits > 0 ? Math.min(100, Math.round((totalFollows / totalVisits) * 100)) : null;

  return {
    totalVisits,
    totalFollows,
    totalReturns: rec.returns || 0,
    conversionPct,
    maxSourceVisits,
    sources
  };
}
