const STATION_EXTRAS_KEY = 'youapp_signal_station_extras_v1';

export type ArgentinaCityKey = 'cordoba' | 'caba' | 'rosario' | 'mendoza' | 'tucuman';

export const ARGENTINA_CITIES: Record<
  ArgentinaCityKey,
  { label: string; lat: number; lon: number; tz: string }
> = {
  cordoba: { label: 'Córdoba', lat: -31.4201, lon: -64.1888, tz: 'America/Argentina/Cordoba' },
  caba: { label: 'Buenos Aires', lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  rosario: { label: 'Rosario', lat: -32.9442, lon: -60.6505, tz: 'America/Argentina/Cordoba' },
  mendoza: { label: 'Mendoza', lat: -32.8895, lon: -68.8458, tz: 'America/Argentina/Mendoza' },
  tucuman: { label: 'Tucumán', lat: -26.8083, lon: -65.2176, tz: 'America/Argentina/Tucuman' }
};

export interface SignalEditorialPost {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface SignalAgendaItem {
  id: string;
  title: string;
  startsAt: string; // ISO datetime
  note?: string;
}

export interface SignalStationExtras {
  city: ArgentinaCityKey;
  editorials: SignalEditorialPost[];
  agenda: SignalAgendaItem[];
}

export interface DollarQuote {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
}

export interface ArgentinaLiveData {
  cityLabel: string;
  tempC: number | null;
  weatherLabel: string;
  dollars: DollarQuote[];
  fetchedAt: string;
}

function readAllExtras(): Record<string, SignalStationExtras> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STATION_EXTRAS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllExtras(map: Record<string, SignalStationExtras>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATION_EXTRAS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function readSignalStationExtras(signalId: string): SignalStationExtras {
  const all = readAllExtras();
  const entry = all[signalId];
  return {
    city: entry?.city && ARGENTINA_CITIES[entry.city] ? entry.city : 'cordoba',
    editorials: Array.isArray(entry?.editorials) ? entry.editorials : [],
    agenda: Array.isArray(entry?.agenda) ? entry.agenda : []
  };
}

export function setSignalCity(signalId: string, city: ArgentinaCityKey): SignalStationExtras {
  const all = readAllExtras();
  const cur = readSignalStationExtras(signalId);
  const next: SignalStationExtras = { ...cur, city };
  all[signalId] = next;
  writeAllExtras(all);
  return next;
}

export function addSignalEditorial(
  signalId: string,
  input: Omit<SignalEditorialPost, 'id' | 'createdAt'>
): SignalStationExtras {
  const all = readAllExtras();
  const cur = readSignalStationExtras(signalId);
  const post: SignalEditorialPost = {
    ...input,
    id: `ed-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString()
  };
  const next: SignalStationExtras = {
    ...cur,
    editorials: [post, ...cur.editorials].slice(0, 30)
  };
  all[signalId] = next;
  writeAllExtras(all);
  return next;
}

export function deleteSignalEditorial(signalId: string, postId: string): SignalStationExtras {
  const all = readAllExtras();
  const cur = readSignalStationExtras(signalId);
  const next: SignalStationExtras = {
    ...cur,
    editorials: cur.editorials.filter((p) => p.id !== postId)
  };
  all[signalId] = next;
  writeAllExtras(all);
  return next;
}

export function addSignalAgendaItem(
  signalId: string,
  input: Omit<SignalAgendaItem, 'id'>
): SignalStationExtras {
  const all = readAllExtras();
  const cur = readSignalStationExtras(signalId);
  const item: SignalAgendaItem = {
    ...input,
    id: `ag-${Date.now().toString(36)}`
  };
  const nextAgenda = [...cur.agenda, item].sort(
    (a, b) => (Date.parse(a.startsAt) || 0) - (Date.parse(b.startsAt) || 0)
  );
  const next: SignalStationExtras = { ...cur, agenda: nextAgenda.slice(0, 30) };
  all[signalId] = next;
  writeAllExtras(all);
  return next;
}

export function deleteSignalAgendaItem(signalId: string, itemId: string): SignalStationExtras {
  const all = readAllExtras();
  const cur = readSignalStationExtras(signalId);
  const next: SignalStationExtras = {
    ...cur,
    agenda: cur.agenda.filter((a) => a.id !== itemId)
  };
  all[signalId] = next;
  writeAllExtras(all);
  return next;
}

export function downloadAgendaIcs(item: SignalAgendaItem, signalName: string): void {
  const start = new Date(item.startsAt);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//YOUAPP TV//Agenda Mi Senal//ES',
    'BEGIN:VEVENT',
    `UID:${item.id}@youapp.tv`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${item.title} · ${signalName}`,
    `DESCRIPTION:${(item.note || `Evento programado en ${signalName} (YOUAPP TV)`).replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'evento'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function weatherCodeToSpanish(code?: number): string {
  if (code === undefined || code === null) return 'Actualizado';
  if (code === 0) return 'Despejado';
  if (code <= 3) return 'Parcialmente nublado';
  if (code === 45 || code === 48) return 'Neblina';
  if (code >= 51 && code <= 67) return 'Llovizna / Lluvia';
  if (code >= 71 && code <= 77) return 'Nieve';
  if (code >= 80 && code <= 82) return 'Chaparrones';
  if (code >= 95) return 'Tormenta';
  return 'Variable';
}

const LIVE_DATA_CACHE = new Map<string, { ts: number; data: ArgentinaLiveData }>();

export async function fetchArgentinaLiveData(
  cityKey: ArgentinaCityKey,
  force = false
): Promise<ArgentinaLiveData> {
  const cached = LIVE_DATA_CACHE.get(cityKey);
  if (!force && cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.data;
  }
  const city = ARGENTINA_CITIES[cityKey] || ARGENTINA_CITIES.cordoba;
  let tempC: number | null = null;
  let weatherLabel = 'Sin dato';
  let dollars: DollarQuote[] = [];

  await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(
        city.tz
      )}`
    )
      .then((r) => r.json())
      .then((w) => {
        if (typeof w?.current?.temperature_2m === 'number') {
          tempC = Math.round(w.current.temperature_2m * 10) / 10;
          weatherLabel = weatherCodeToSpanish(w.current.weather_code);
        }
      })
      .catch(() => {}),
    fetch('https://dolarapi.com/v1/dolares')
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) {
          const wanted = ['oficial', 'blue', 'bolsa', 'contadoconliqui'];
          dollars = list
            .filter((x: any) => wanted.includes(String(x.casa || '').toLowerCase()))
            .map((x: any) => ({
              casa: x.casa,
              nombre: x.casa === 'bolsa' ? 'MEP' : x.casa === 'contadoconliqui' ? 'CCL' : x.nombre,
              compra: Number(x.compra || 0),
              venta: Number(x.venta || 0)
            }));
        }
      })
      .catch(() => {})
  ]);

  const data: ArgentinaLiveData = {
    cityLabel: city.label,
    tempC,
    weatherLabel,
    dollars,
    fetchedAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  };
  LIVE_DATA_CACHE.set(cityKey, { ts: Date.now(), data });
  return data;
}
