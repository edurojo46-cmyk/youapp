import { supabase } from '../supabase';

/**
 * ATLAS Video Resilience — Autocuración pasiva a 0 cuota de API.
 *
 * Códigos oficiales de error del reproductor iframe de YouTube:
 * - 100: Video eliminado o marcado como privado.
 * - 101 / 150: El propietario desactivó la reproducción integrada (embed).
 */
const UNPLAYABLE_YT_ERROR_CODES = new Set<number>([100, 101, 150]);
const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const SESSION_KEY = 'youapp_unplayable_yt_ids_v1';

const reportedIds = new Set<string>();
const consecutiveSkips = new Map<string, number>();

export function canAutoSkip(playerKey: string, maxConsecutive = 4): boolean {
  const next = (consecutiveSkips.get(playerKey) || 0) + 1;
  consecutiveSkips.set(playerKey, next);
  return next <= maxConsecutive;
}

export function resetAutoSkip(playerKey: string): void {
  consecutiveSkips.delete(playerKey);
}

function loadSessionBlockedIds(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        if (typeof id === 'string' && YT_VIDEO_ID_RE.test(id)) {
          reportedIds.add(id);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

function persistSessionBlockedIds(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(reportedIds).slice(-200)));
  } catch {
    // ignore storage errors
  }
}

loadSessionBlockedIds();

export function parseYouTubeErrorCode(err: unknown): number | null {
  if (typeof err === 'number' && Number.isFinite(err)) return err;
  if (typeof err === 'string' && /^\d+$/.test(err.trim())) return Number(err.trim());
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.code === 'number') return rec.code;
    if (typeof rec.data === 'number') return rec.data;
    if (typeof rec.info === 'number') return rec.info;
  }
  return null;
}

export function isUnplayableYouTubeError(err: unknown): boolean {
  const code = parseYouTubeErrorCode(err);
  return code !== null && UNPLAYABLE_YT_ERROR_CODES.has(code);
}

export function getYouTubeErrorReason(code: number): string {
  if (code === 100) return 'Video eliminado o privado';
  if (code === 101 || code === 150) return 'Reproducción integrada desactivada';
  return `Error de reproducción (${code})`;
}

export function isVideoMarkedUnplayable(videoId?: string | null): boolean {
  if (!videoId) return false;
  return reportedIds.has(videoId.trim());
}

/**
 * Marca pasivamente un video de YouTube como no insertable (`embeddable = false`)
 * en `youapp_index` y en la sesión actual, sin consumir cuota de YouTube API.
 */
export async function reportUnplayableYouTubeVideo(
  videoId: string | null | undefined,
  err: unknown,
  source: string
): Promise<boolean> {
  const cleanId = String(videoId || '').trim();
  const code = parseYouTubeErrorCode(err);
  if (!YT_VIDEO_ID_RE.test(cleanId) || code === null || !UNPLAYABLE_YT_ERROR_CODES.has(code)) {
    return false;
  }

  const alreadyReported = reportedIds.has(cleanId);
  reportedIds.add(cleanId);
  persistSessionBlockedIds();

  if (alreadyReported) return true;

  console.warn(
    `[ATLAS-RESILIENCE] Flagging embeddable=false for ${cleanId} (YT error ${code}: ${getYouTubeErrorReason(code)}) via ${source}`
  );

  try {
    await supabase
      .from('youapp_index')
      .update({ embeddable: false })
      .eq('provider', 'youtube')
      .eq('video_id', cleanId);
  } catch {
    // Silencioso: nunca interrumpir la reproducción si falla la telemetría de red/RLS
  }

  return true;
}
