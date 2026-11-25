export interface YouAppShareVideoParams {
  videoId: string;
  startSec?: number;
  title?: string;
  channelName?: string;
}

export function getYouAppShareOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const envUrl = String(
    (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
      (import.meta as any).env?.VITE_ATLAS_PUBLIC_URL ||
      ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (envUrl) return envUrl;
  return 'https://youapp.tv';
}

export function buildYouAppVideoShareUrl(params: YouAppShareVideoParams): string {
  const origin = getYouAppShareOrigin();
  const q = new URLSearchParams();
  if (params.videoId) q.set('v', params.videoId);
  if (params.startSec && Math.floor(params.startSec) > 0) {
    q.set('t', String(Math.floor(params.startSec)));
  }
  if (params.title) q.set('title', params.title.slice(0, 90));
  if (params.channelName) q.set('ch', params.channelName.slice(0, 50));
  const qs = q.toString();
  return qs ? `${origin}/?${qs}` : `${origin}/`;
}

export function buildYouAppFullSignalShareUrl(signalId: string): string {
  const ogBase = String((import.meta as any).env?.VITE_SIGNAL_OG_SHARE_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const origin = getYouAppShareOrigin();
  if (ogBase) {
    return `${ogBase}?signal=${encodeURIComponent(signalId)}&app=${encodeURIComponent(origin)}`;
  }
  return `${origin}/misenal1?signal=${encodeURIComponent(signalId)}&sharedSignal=1`;
}

export function buildWhatsAppShareHref(message: string, url: string): string {
  const text = `${message.trim()}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppSignalShare(params: {
  signalId: string;
  signalName?: string;
  itemCount?: number;
  description?: string;
}): string {
  const url = buildYouAppFullSignalShareUrl(params.signalId);
  const name = (params.signalName || 'Mi Señal').trim();
  const countTxt = params.itemCount && params.itemCount > 0 ? ` (${params.itemCount} videos seleccionados)` : '';
  const descLine = params.description?.trim() ? `\n${params.description.trim().slice(0, 120)}` : '';
  const message = `📺 Te comparto mi señal «${name}»${countTxt} en YOUAPP.${descLine}\nAbrila gratis y seguila acá:`;
  const waHref = buildWhatsAppShareHref(message, url);
  if (typeof window !== 'undefined') {
    window.open(waHref, '_blank', 'noopener,noreferrer');
  }
  return waHref;
}

export function openWhatsAppMiTvShare(params: {
  channelName: string;
  shareUrl: string;
  itemCount?: number;
}): string {
  const countTxt = params.itemCount && params.itemCount > 0 ? ` (${params.itemCount} videos)` : '';
  const message = `📺 Mirá mi canal «${params.channelName}»${countTxt} en YOUAPP MiTV — entrá directo sin registrarte:`;
  const waHref = buildWhatsAppShareHref(message, params.shareUrl);
  if (typeof window !== 'undefined') {
    window.open(waHref, '_blank', 'noopener,noreferrer');
  }
  return waHref;
}

export async function shareYouAppVideo(
  params: YouAppShareVideoParams & { customMessage?: string }
): Promise<{ status: 'shared' | 'copied' | 'cancelled'; url: string }> {
  const url = buildYouAppVideoShareUrl(params);
  const title = params.title || 'YOUAPP TV';
  const text = params.customMessage || `Mirá «${title}» en YOUAPP TV`;
  const shareData = { title, text, url };

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      (!navigator.canShare || navigator.canShare(shareData))
    ) {
      await navigator.share(shareData);
      return { status: 'shared', url };
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return { status: 'copied', url };
    }
  } catch {
    return { status: 'cancelled', url };
  }
  return { status: 'copied', url };
}
