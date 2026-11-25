// ============================================================================
// ATLAS WEB POINTER V1 — Mis Lecturas (0 Cuota API · Solo punteros)
// - Guarda referencias a artículos, noticias, investigaciones, blogs y recetas
//   sin copiar ni alojar el contenido original.
// - Persiste en localStorage + sincroniza en Supabase user_metadata.
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_lecturas_v1';

export const DEFAULT_LECTURA_TOPICS = [
  'Actualidad',
  'Economía',
  'Cultura',
  'Deportes',
  'Ciencia',
  'Tecnología'
];

export interface LecturaItem {
  id: string;
  url: string;
  title: string;
  description: string;
  sourceName: string;
  domain: string;
  thumbnailUrl: string;
  faviconUrl: string;
  publishedAt: string | null;
  topic: string;
  read: boolean;
  favorite: boolean;
  embeddable?: boolean;
  addedAt: string;
}

export interface LecturasWorkspace {
  topics: string[];
  items: LecturaItem[];
  updatedAt: string;
}

function defaultWorkspace(): LecturasWorkspace {
  return {
    topics: [...DEFAULT_LECTURA_TOPICS],
    items: [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname || !u.hostname.includes('.')) return null;
    // Limpia parámetros de rastreo comunes (utm_*, fbclid, gclid) para evitar duplicados
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
      (p) => u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return null;
  }
}

function formatDomainAsSource(hostname: string): string {
  const clean = hostname.replace(/^www\./i, '');
  const base = clean.split('.')[0] || clean;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export async function resolveWebPointer(
  rawUrl: string,
  topic = 'Actualidad',
  titleHint?: string
): Promise<{ ok: true; item: LecturaItem } | { ok: false; error: string }> {
  const normalized = normalizeWebUrl(rawUrl);
  if (!normalized) {
    return {
      ok: false,
      error: 'Pegá una URL web válida (ej. https://www.diario.com/articulo).'
    };
  }

  let domain = '';
  try {
    domain = new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    domain = 'web';
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  let title = titleHint?.trim() || formatDomainAsSource(domain);
  let description = '';
  let sourceName = formatDomainAsSource(domain);
  let thumbnailUrl = '';
  let publishedAt: string | null = null;
  let finalUrl = normalized;
  let embeddable = false;

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5500);
    const res = await fetch(`/api/mitv/social-meta?url=${encodeURIComponent(normalized)}`, {
      signal: controller.signal
    });
    window.clearTimeout(timer);
    if (res.ok) {
      const meta = await res.json();
      if (typeof meta?.title === 'string' && meta.title.trim()) {
        title = meta.title.trim();
      }
      if (typeof meta?.description === 'string' && meta.description.trim()) {
        description = meta.description.trim();
      }
      if (typeof meta?.siteName === 'string' && meta.siteName.trim()) {
        sourceName = meta.siteName.trim();
      }
      if (typeof meta?.thumbnailUrl === 'string' && meta.thumbnailUrl.trim()) {
        thumbnailUrl = meta.thumbnailUrl.trim();
      }
      if (typeof meta?.publishedAt === 'string' && meta.publishedAt.trim()) {
        publishedAt = meta.publishedAt.trim();
      }
      if (typeof meta?.finalUrl === 'string' && /^https?:\/\//i.test(meta.finalUrl)) {
        finalUrl = normalizeWebUrl(meta.finalUrl) || normalized;
      }
      if (typeof meta?.embeddable === 'boolean') {
        embeddable = meta.embeddable;
      }
    }
  } catch {
    // Fallback silencioso: nunca fallar al guardar un enlace válido si el sitio bloquea bots
  }

  return {
    ok: true,
    item: {
      id: `lec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      url: finalUrl,
      title: title.slice(0, 150),
      description: description.slice(0, 240),
      sourceName: sourceName.slice(0, 60),
      domain,
      thumbnailUrl,
      faviconUrl,
      publishedAt,
      topic: topic.trim() || 'Actualidad',
      read: false,
      favorite: false,
      embeddable,
      addedAt: new Date().toISOString()
    }
  };
}

export function loadLecturasWorkspace(): LecturasWorkspace {
  if (typeof window === 'undefined') return defaultWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    const topics: string[] =
      Array.isArray(parsed?.topics) && parsed.topics.length > 0
        ? parsed.topics.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
        : [...DEFAULT_LECTURA_TOPICS];
    const items: LecturaItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
      topics,
      items,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return defaultWorkspace();
  }
}

export function saveLecturasWorkspace(ws: LecturasWorkspace): LecturasWorkspace {
  const stamped: LecturasWorkspace = { ...ws, updatedAt: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
    } catch {
      // ignore quota
    }
  }
  void syncLecturasToCloud(stamped);
  return stamped;
}

async function syncLecturasToCloud(ws: LecturasWorkspace): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    const compact = {
      topics: ws.topics.slice(0, 20),
      updatedAt: ws.updatedAt,
      items: ws.items.slice(0, 60).map((it) => ({
        id: it.id,
        url: it.url,
        title: it.title.slice(0, 120),
        description: it.description.slice(0, 160),
        sourceName: it.sourceName.slice(0, 48),
        domain: it.domain,
        thumbnailUrl: it.thumbnailUrl,
        faviconUrl: it.faviconUrl,
        publishedAt: it.publishedAt,
        topic: it.topic,
        read: it.read,
        favorite: it.favorite,
        addedAt: it.addedAt
      }))
    };
    await supabase.auth.updateUser({
      data: { youapp_lecturas_v1: compact }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadLecturasFromCloud(): Promise<LecturasWorkspace | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloud = (user.user_metadata as any)?.youapp_lecturas_v1;
    if (!cloud || !Array.isArray(cloud.items)) return null;

    const local = loadLecturasWorkspace();
    const byUrl = new Map<string, LecturaItem>();
    for (const it of local.items) byUrl.set(it.url, it);
    for (const cit of cloud.items as LecturaItem[]) {
      if (!cit?.url) continue;
      if (!byUrl.has(cit.url)) byUrl.set(cit.url, cit);
    }
    const mergedTopics = Array.from(
      new Set([...local.topics, ...(Array.isArray(cloud.topics) ? cloud.topics : [])])
    );
    const merged: LecturasWorkspace = {
      topics: mergedTopics.length > 0 ? mergedTopics : [...DEFAULT_LECTURA_TOPICS],
      items: Array.from(byUrl.values()).sort(
        (a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)
      ),
      updatedAt: new Date().toISOString()
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return null;
  }
}
