// ============================================================================
// YOUAPP SEÑALES VIVAS V1 — Presencia Voluntaria y Saludos Efímeros (US$ 0)
// - Usa Supabase Realtime Presence + Broadcast (sin alterar DB ni RLS).
// - Privacidad por diseño: opt-in voluntario ("Estoy aquí"), ciudad aproximada
//   elegida a mano (jamás GPS ni coordenadas), invisibles nunca expuestos.
// - Al desconectarse o cerrar la pestaña, desaparece automáticamente.
// ============================================================================

import { supabase } from '../supabase';

export interface LiveParticipant {
  key: string;
  name: string;
  city: string;
  watchingTitle?: string;
  approxLat?: number;
  approxLon?: number;
  radiusKm?: number;
  joinedAt: string;
}

/**
 * Privacidad estricta (~7 km a la redonda):
 * Cuantiza lat/lon a una grilla aproximada de ~6.7 km (0.06°) y agrega un pequeño
 * desplazamiento pseudoaleatorio de sesión para que jamás se exponga la ubicación exacta.
 */
export function fuzzCoordsToApprox7Km(lat: number, lon: number): { approxLat: number; approxLon: number } {
  const grid = 0.06; // ~6.67 km por celda
  const snappedLat = Math.round(lat / grid) * grid;
  const snappedLon = Math.round(lon / grid) * grid;
  const jitterLat = (Math.random() - 0.5) * 0.025; // ±1.4 km extra
  const jitterLon = (Math.random() - 0.5) * 0.025;
  return {
    approxLat: Number((snappedLat + jitterLat).toFixed(3)),
    approxLon: Number((snappedLon + jitterLon).toFixed(3))
  };
}

export function requestApproxZone7Km(): Promise<{ ok: true; approxLat: number; approxLon: number } | { ok: false; error: string }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, error: 'Tu navegador no admite ubicación aproximada.' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fuzzed = fuzzCoordsToApprox7Km(pos.coords.latitude, pos.coords.longitude);
        resolve({ ok: true, ...fuzzed });
      },
      () => {
        resolve({ ok: false, error: 'Permiso de ubicación denegado. Podés elegir tu ciudad manualmente.' });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

export interface LiveGreetingEvent {
  id: string;
  from: string;
  city: string;
  text: string;
  emoji: string;
  ts: number;
}

export const QUICK_LIVE_CITIES = [
  'Buenos Aires',
  'Córdoba',
  'Rosario',
  'Mendoza',
  'Montevideo',
  'Santiago',
  'Madrid',
  'Ciudad de México'
];

export const QUICK_LIVE_GREETINGS: Array<{ emoji: string; label: string; buildText: (city: string) => string }> = [
  { emoji: '👋', label: 'Saludar', buildText: (city) => (city ? `¡Saludos desde ${city}!` : '¡Saludos a todos!') },
  { emoji: '👏', label: 'Aplaudir', buildText: (city) => (city ? `¡Aplausos desde ${city}!` : '¡Muy bueno!') },
  { emoji: '🔥', label: 'Tremendo', buildText: (city) => (city ? `¡Tremenda señal desde ${city}!` : '¡Tremenda señal!') },
  { emoji: '❤️', label: 'Me encanta', buildText: (city) => (city ? `¡Disfrutando desde ${city}!` : '¡Disfrutando juntos!') }
];

const LIVE_CITY_STORAGE_KEY = 'youapp_live_city_v1';

export function loadSavedLiveCity(): string {
  if (typeof window === 'undefined') return 'Buenos Aires';
  try {
    return localStorage.getItem(LIVE_CITY_STORAGE_KEY) || 'Buenos Aires';
  } catch {
    return 'Buenos Aires';
  }
}

export function saveLiveCity(city: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LIVE_CITY_STORAGE_KEY, city.trim().slice(0, 40));
  } catch {
    // ignore
  }
}

export class SignalLivePresenceClient {
  private channel: any = null;
  private isSubscribed = false;
  private pendingTrack: LiveParticipant | null = null;
  private onParticipantsCb: ((list: LiveParticipant[]) => void) | null = null;
  private onGreetingCb: ((g: LiveGreetingEvent) => void) | null = null;

  constructor(signalId: string, clientKey: string) {
    const safeRoom = `youapp_signal_live_${signalId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    this.channel = supabase.channel(safeRoom, {
      config: {
        presence: { key: clientKey },
        broadcast: { self: true }
      }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.emitParticipants();
      })
      .on('presence', { event: 'join' }, () => {
        this.emitParticipants();
      })
      .on('presence', { event: 'leave' }, () => {
        this.emitParticipants();
      })
      .on('broadcast', { event: 'LIVE_GREETING' }, (msg: any) => {
        const p = msg?.payload;
        if (p && typeof p.text === 'string' && this.onGreetingCb) {
          this.onGreetingCb(p as LiveGreetingEvent);
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          this.emitParticipants();
          if (this.pendingTrack) {
            void this.channel.track(this.pendingTrack);
            this.pendingTrack = null;
          }
        }
      });
  }

  private emitParticipants() {
    if (!this.channel || !this.onParticipantsCb) return;
    try {
      const state = this.channel.presenceState() || {};
      const list: LiveParticipant[] = [];
      for (const key of Object.keys(state)) {
        const entries = state[key];
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const first = entries[0];
        if (!first?.name) continue;
        list.push({
          key,
          name: String(first.name).slice(0, 36),
          city: String(first.city || '').slice(0, 36),
          watchingTitle: typeof first.watchingTitle === 'string' ? first.watchingTitle.slice(0, 80) : undefined,
          approxLat: typeof first.approxLat === 'number' && Number.isFinite(first.approxLat) ? first.approxLat : undefined,
          approxLon: typeof first.approxLon === 'number' && Number.isFinite(first.approxLon) ? first.approxLon : undefined,
          radiusKm: typeof first.radiusKm === 'number' ? first.radiusKm : 7,
          joinedAt: String(first.joinedAt || '')
        });
      }
      this.onParticipantsCb(list);
    } catch {
      // ignore
    }
  }

  public onParticipants(cb: (list: LiveParticipant[]) => void) {
    this.onParticipantsCb = cb;
  }

  public onGreeting(cb: (g: LiveGreetingEvent) => void) {
    this.onGreetingCb = cb;
  }

  public async setVisible(participant: LiveParticipant | null) {
    if (!this.channel) return;
    if (!participant) {
      this.pendingTrack = null;
      if (this.isSubscribed) {
        try {
          await this.channel.untrack();
        } catch {
          // ignore
        }
      }
      return;
    }
    if (!this.isSubscribed) {
      this.pendingTrack = participant;
      return;
    }
    try {
      await this.channel.track(participant);
    } catch {
      // ignore
    }
  }

  public sendGreeting(from: string, city: string, emoji: string, text: string) {
    if (!this.channel || !this.isSubscribed) return;
    const payload: LiveGreetingEvent = {
      id: `gr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      from: from.slice(0, 36),
      city: city.slice(0, 36),
      emoji,
      text: text.slice(0, 90),
      ts: Date.now()
    };
    try {
      this.channel.send({
        type: 'broadcast',
        event: 'LIVE_GREETING',
        payload
      });
    } catch {
      // ignore
    }
  }

  public destroy() {
    if (this.channel) {
      try {
        void this.channel.untrack();
        void supabase.removeChannel(this.channel);
      } catch {
        // ignore
      }
      this.channel = null;
    }
  }
}
