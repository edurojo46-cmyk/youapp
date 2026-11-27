import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  BellRing,
  CalendarClock,
  Check,
  CloudSun,
  Mic,
  Moon,
  Music,
  Newspaper,
  Play,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  X
} from 'lucide-react';
import {
  ARGENTINA_CITIES,
  fetchArgentinaLiveData,
  type ArgentinaCityKey,
  type ArgentinaLiveData
} from '../../lib/tv/signalStationExtrasStore';
import { fetchPortalsLatest } from '../../lib/tv/youLecturasStore';

export type AlarmRepeatMode = 'once' | 'weekdays' | 'daily';
export type AtlasVoiceProfileId = 'daniela' | 'davefx' | 'ald' | 'sharvard' | 'claude';

export interface AtlasVoiceProfile {
  id: AtlasVoiceProfileId;
  name: string;
  subtitle: string;
  preferredLangs: string[];
  preferredGender: 'female' | 'male';
  rate: number;
  pitch: number;
}

const ATLAS_VOICE_PROFILES: AtlasVoiceProfile[] = [
  {
    id: 'daniela',
    name: 'Daniela (ATLAS Mujer · AR)',
    subtitle: 'Femenina · cálida rioplatense',
    preferredLangs: ['es-AR', 'es-419', 'es-US', 'es'],
    preferredGender: 'female',
    rate: 0.96,
    pitch: 1.04
  },
  {
    id: 'davefx',
    name: 'DaveFX (ATLAS Oficial)',
    subtitle: 'Masculina · documental pausada',
    preferredLangs: ['es-ES', 'es-AR', 'es-419', 'es'],
    preferredGender: 'male',
    rate: 0.9,
    pitch: 0.85
  },
  {
    id: 'ald',
    name: 'Ald (Latinoamérica)',
    subtitle: 'Masculina · dinámica y clara',
    preferredLangs: ['es-MX', 'es-419', 'es-US', 'es'],
    preferredGender: 'male',
    rate: 1.02,
    pitch: 0.97
  },
  {
    id: 'sharvard',
    name: 'Sharvard (Elocuente)',
    subtitle: 'Femenina · dicción precisa',
    preferredLangs: ['es-ES', 'es-419', 'es'],
    preferredGender: 'female',
    rate: 0.95,
    pitch: 1.08
  },
  {
    id: 'claude',
    name: 'Claude (Radiofónica)',
    subtitle: 'Masculina · cálida tipo radio',
    preferredLangs: ['es-MX', 'es-US', 'es-AR', 'es'],
    preferredGender: 'male',
    rate: 0.94,
    pitch: 0.9
  }
];

export interface YouMusicAlarmTrack {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl?: string;
}

export interface AlarmAgendaEntry {
  id: string;
  time: string; // "HH:MM" o vacío
  text: string;
}

export interface YouMusicAlarmConfig {
  enabled: boolean;
  time: string; // "HH:MM"
  repeat: AlarmRepeatMode;
  videoId: string;
  title: string;
  author: string;
  gentleWake: boolean;
  voiceBriefingEnabled: boolean;
  atlasBriefingEnabled: boolean;
  voiceProfileId: AtlasVoiceProfileId;
  deviceVoiceName: string;
  userName: string;
  cityKey: ArgentinaCityKey;
  includeWeather: boolean;
  customMessage: string;
  agendaItems: AlarmAgendaEntry[];
  lastFiredKey?: string;
}

const STORAGE_KEY = 'youapp_youmusic_alarm_v1';

const DEFAULT_ALARM: YouMusicAlarmConfig = {
  enabled: false,
  time: '07:30',
  repeat: 'weekdays',
  videoId: '',
  title: '',
  author: '',
  gentleWake: true,
  voiceBriefingEnabled: true,
  atlasBriefingEnabled: false,
  voiceProfileId: 'daniela',
  deviceVoiceName: '',
  userName: '',
  cityKey: 'cordoba',
  includeWeather: true,
  customMessage: '',
  agendaItems: []
};

export function loadYouMusicAlarm(): YouMusicAlarmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALARM;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_ALARM;
    const validCity: ArgentinaCityKey =
      parsed.cityKey && parsed.cityKey in ARGENTINA_CITIES ? parsed.cityKey : 'cordoba';
    const rawAgenda = Array.isArray(parsed.agendaItems)
      ? parsed.agendaItems
          .filter((a: unknown) => a && typeof a === 'object' && typeof (a as AlarmAgendaEntry).text === 'string')
          .map((a: AlarmAgendaEntry) => ({
            id: typeof a.id === 'string' && a.id ? a.id : `ag_${Math.random().toString(36).slice(2, 8)}`,
            time: typeof a.time === 'string' ? a.time : '',
            text: a.text.trim()
          }))
          .filter((a: AlarmAgendaEntry) => a.text.length > 0)
      : [];
    return {
      ...DEFAULT_ALARM,
      enabled: Boolean(parsed.enabled),
      time: typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : '07:30',
      repeat:
        parsed.repeat === 'once' || parsed.repeat === 'weekdays' || parsed.repeat === 'daily'
          ? parsed.repeat
          : 'weekdays',
      videoId: typeof parsed.videoId === 'string' ? parsed.videoId : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      author: typeof parsed.author === 'string' ? parsed.author : '',
      gentleWake: parsed.gentleWake !== false,
      voiceBriefingEnabled: parsed.voiceBriefingEnabled !== false,
      atlasBriefingEnabled: Boolean(parsed.atlasBriefingEnabled),
      voiceProfileId:
        parsed.voiceProfileId === 'daniela' ||
        parsed.voiceProfileId === 'davefx' ||
        parsed.voiceProfileId === 'ald' ||
        parsed.voiceProfileId === 'sharvard' ||
        parsed.voiceProfileId === 'claude'
          ? parsed.voiceProfileId
          : 'daniela',
      deviceVoiceName: typeof parsed.deviceVoiceName === 'string' ? parsed.deviceVoiceName : '',
      userName: typeof parsed.userName === 'string' ? parsed.userName : '',
      cityKey: validCity,
      includeWeather: parsed.includeWeather !== false,
      customMessage: typeof parsed.customMessage === 'string' ? parsed.customMessage : '',
      agendaItems: rawAgenda,
      lastFiredKey: typeof parsed.lastFiredKey === 'string' ? parsed.lastFiredKey : undefined
    };
  } catch {
    return DEFAULT_ALARM;
  }
}

interface YouAppAndroidBridge {
  scheduleAlarm?: (json: string) => void;
  cancelAlarm?: () => void;
  hasNativeTts?: () => boolean;
  speak?: (text: string, langTag: string, rate: number, pitch: number) => void;
  stopSpeak?: () => void;
}

function getAndroidBridge(): YouAppAndroidBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { YouAppAndroidPiP?: YouAppAndroidBridge }).YouAppAndroidPiP || null);
}

function saveYouMusicAlarm(cfg: YouMusicAlarmConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage quota errors
  }
  // Sincronización nativa con AlarmManager del APK Android (funciona con pantalla apagada)
  try {
    const bridge = getAndroidBridge();
    if (bridge && typeof bridge.scheduleAlarm === 'function') {
      bridge.scheduleAlarm(JSON.stringify(cfg));
    }
  } catch {
    // ignore
  }
}

function formatClockHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatSpokenTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (m === 0) return `${h} en punto`;
  return `${h} y ${m}`;
}

function formatDateEs(d: Date): string {
  try {
    const str = d.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    return str.charAt(0).toUpperCase() + str.slice(1);
  } catch {
    return '';
  }
}

function getMinuteKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

function matchesRepeatDay(repeat: AlarmRepeatMode, d: Date): boolean {
  if (repeat === 'daily' || repeat === 'once') return true;
  const day = d.getDay(); // 0=Dom, 6=Sab
  return day >= 1 && day <= 5;
}

function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function buildSmartBriefingText(
  cfg: YouMusicAlarmConfig,
  nowDate: Date,
  weather: ArgentinaLiveData | null,
  atlasHeadlines: string[] = []
): string {
  const parts: string[] = [];
  const greeting = getGreetingByHour(nowDate.getHours());
  const cleanName = cfg.userName.trim();
  if (cfg.atlasBriefingEnabled) {
    parts.push(cleanName ? `${greeting}, ${cleanName}, soy ATLAS.` : `${greeting}, soy ATLAS.`);
  } else {
    parts.push(cleanName ? `${greeting}, ${cleanName}.` : `${greeting}.`);
  }

  const dateText = formatDateEs(nowDate);
  parts.push(`Son las ${formatSpokenTime(nowDate)}${dateText ? ` del ${dateText}` : ''}.`);

  if (cfg.includeWeather && weather && weather.tempC !== null) {
    const tempRounded = Math.round(weather.tempC);
    const label = weather.weatherLabel && weather.weatherLabel !== 'Sin dato' ? `, ${weather.weatherLabel}` : '';
    parts.push(`En ${weather.cityLabel} hace ${tempRounded} grados${label}.`);
  }

  if (cfg.agendaItems.length > 0) {
    const agendaSpoken = cfg.agendaItems
      .slice(0, 6)
      .map((item) => (item.time ? `a las ${item.time}, ${item.text}` : item.text))
      .join('. ');
    parts.push(`Tu agenda para hoy: ${agendaSpoken}.`);
  }

  if (cfg.atlasBriefingEnabled && atlasHeadlines.length > 0) {
    const newsJoined = atlasHeadlines.slice(0, 2).join('. ');
    parts.push(`En los titulares de hoy: ${newsJoined}.`);
  }

  const custom = cfg.customMessage.trim();
  if (custom) {
    parts.push(custom.endsWith('.') ? custom : `${custom}.`);
  } else {
    parts.push('Que tengas un excelente día. Arrancamos con tu música.');
  }

  return parts.join(' ');
}

function isHighQualityVoice(v: SpeechSynthesisVoice): boolean {
  return /(natural|neural|online|google|enhanced|premium|siri)/i.test(v.name);
}

function getSpanishDeviceVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('es'))
    .sort((a, b) => {
      const qa = isHighQualityVoice(a) ? 1 : 0;
      const qb = isHighQualityVoice(b) ? 1 : 0;
      if (qb !== qa) return qb - qa;
      const aAr = a.lang.toLowerCase().startsWith('es-ar') ? 1 : 0;
      const bAr = b.lang.toLowerCase().startsWith('es-ar') ? 1 : 0;
      return bAr - aAr;
    });
}

function pickVoiceForProfile(
  profile: AtlasVoiceProfile,
  explicitVoiceName?: string
): SpeechSynthesisVoice | null {
  const spanish = getSpanishDeviceVoices();
  if (!spanish.length) return null;
  if (explicitVoiceName) {
    const exact = spanish.find((v) => v.name === explicitVoiceName);
    if (exact) return exact;
  }
  const maleHints = /(tomas|tomás|jorge|pablo|alvaro|álvaro|diego|raul|raúl|carlos|enrique|male|hombre|man|david|antonio|alonso)/i;
  const femaleHints = /(elena|daniela|paulina|monica|mónica|sabina|laura|sofia|sofía|helena|lucia|lucía|female|mujer|woman|maria|maría|paloma|carmen|dalia)/i;
  const legacyRoboticHints = /(sabina|helena|laura|pablo)/i;
  const genderMatcher = profile.preferredGender === 'male' ? maleHints : femaleHints;

  const scoreVoice = (v: SpeechSynthesisVoice): number => {
    let score = 0;
    const name = v.name || '';
    const lang = (v.lang || '').toLowerCase();

    if (/(natural|neural|online)/i.test(name)) score += 120;
    else if (/google/i.test(name)) score += 100;
    else if (/(enhanced|premium|siri)/i.test(name)) score += 90;
    else if (legacyRoboticHints.test(name)) score -= 40;

    const langIdx = profile.preferredLangs.findIndex((p) => lang.startsWith(p.toLowerCase()));
    if (langIdx >= 0) score += Math.max(8, 36 - langIdx * 8);

    if (genderMatcher.test(name)) score += 26;
    if (!v.localService) score += 12; // Voces cloud del navegador suelen ser neuronales
    return score;
  };

  let best = spanish[0];
  let bestScore = scoreVoice(best);
  for (let i = 1; i < spanish.length; i += 1) {
    const sc = scoreVoice(spanish[i]);
    if (sc > bestScore) {
      best = spanish[i];
      bestScore = sc;
    }
  }
  return best;
}

function speakSpanishBriefing(
  text: string,
  profileId: AtlasVoiceProfileId,
  explicitVoiceName?: string,
  onDone?: () => void
): boolean {
  if (typeof window === 'undefined' || !text.trim()) {
    onDone?.();
    return false;
  }
  const profile = ATLAS_VOICE_PROFILES.find((p) => p.id === profileId) || ATLAS_VOICE_PROFILES[0];

  // 1. Dentro del APK Android usar motor nativo android.speech.tts.TextToSpeech (voz Google Español HD)
  const androidBridge = getAndroidBridge();
  if (androidBridge && typeof androidBridge.speak === 'function') {
    let finished = false;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('youapp-native-tts-done', finishOnce);
      onDone?.();
    };
    window.addEventListener('youapp-native-tts-done', finishOnce);
    window.setTimeout(finishOnce, Math.max(9000, Math.min(55000, text.length * 105)));
    try {
      androidBridge.speak(text, profile.preferredLangs[0] || 'es-AR', profile.rate, profile.pitch);
      return true;
    } catch {
      window.removeEventListener('youapp-native-tts-done', finishOnce);
    }
  }

  // 2. Navegador web estándar (Chrome / Safari / Edge)
  if (!('speechSynthesis' in window)) {
    onDone?.();
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = profile.preferredLangs[0] || 'es-AR';
    utter.rate = profile.rate;
    utter.pitch = profile.pitch;
    utter.volume = 1.0;
    const voice = pickVoiceForProfile(profile, explicitVoiceName);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    let finished = false;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      onDone?.();
    };
    utter.onend = finishOnce;
    utter.onerror = finishOnce;
    window.setTimeout(finishOnce, Math.max(8000, Math.min(50000, text.length * 98)));
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    onDone?.();
    return false;
  }
}

async function fetchTopAtlasHeadlines(): Promise<string[]> {
  try {
    const groups = await fetchPortalsLatest(1, false);
    const titles: string[] = [];
    for (const g of groups) {
      const first = g.items?.[0];
      if (first?.title) {
        titles.push(`${g.portalName}: ${first.title.replace(/\s+/g, ' ').trim()}`);
      }
      if (titles.length >= 2) break;
    }
    return titles;
  } catch {
    return [];
  }
}

function stopSpeechBriefing(): void {
  try {
    getAndroidBridge()?.stopSpeak?.();
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore
  }
}

function playGentleBackupChime(ctxRef: React.MutableRefObject<AudioContext | null>): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) {
      ctxRef.current = new AudioCtx();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const notes = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5 warm chord
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.16 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 1.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 1.2);
    });
  } catch {
    // ignore Web Audio autoplay restrictions
  }
}

export interface YouMusicAlarmControllerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: YouMusicAlarmTrack | null;
  queueTracks: YouMusicAlarmTrack[];
  wakeLockActive: boolean;
  onRequestWakeLock: () => Promise<void>;
  onReleaseWakeLock: () => Promise<void>;
  onPauseForSleep: () => void;
  onTriggerPlayTrack: (track: YouMusicAlarmTrack) => void;
  onSetVolume: (vol: number) => void;
  onAlarmStateChange?: (cfg: YouMusicAlarmConfig) => void;
  onToast?: (msg: string) => void;
}

export const YouMusicAlarmController: React.FC<YouMusicAlarmControllerProps> = ({
  isOpen,
  onClose,
  currentTrack,
  queueTracks,
  wakeLockActive,
  onRequestWakeLock,
  onReleaseWakeLock,
  onPauseForSleep,
  onTriggerPlayTrack,
  onSetVolume,
  onAlarmStateChange,
  onToast
}) => {
  const [alarm, setAlarm] = useState<YouMusicAlarmConfig>(() => loadYouMusicAlarm());
  const [nightstandOpen, setNightstandOpen] = useState(false);
  const [nightstandDim, setNightstandDim] = useState(true);
  const [isRinging, setIsRinging] = useState(false);
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const [snoozeUntilMs, setSnoozeUntilMs] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [testCountdown, setTestCountdown] = useState<number | null>(null);

  // Clima vivo + titulares ATLAS opcionales + voces instaladas + editor rápido de agenda
  const [liveWeather, setLiveWeather] = useState<ArgentinaLiveData | null>(null);
  const [atlasHeadlines, setAtlasHeadlines] = useState<string[]>([]);
  const [spanishVoices, setSpanishVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [newAgendaTime, setNewAgendaTime] = useState('09:00');
  const [newAgendaText, setNewAgendaText] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const volumeTimersRef = useRef<number[]>([]);
  const offlineChimeTimerRef = useRef<number | null>(null);
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;
  const weatherRef = useRef<ArgentinaLiveData | null>(liveWeather);
  weatherRef.current = liveWeather;

  const updateAlarm = useCallback(
    (next: YouMusicAlarmConfig) => {
      setAlarm(next);
      saveYouMusicAlarm(next);
      onAlarmStateChange?.(next);
    },
    [onAlarmStateChange]
  );

  // Precargar voces de SpeechSynthesis y clima de la ciudad elegida
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const syncVoices = () => setSpanishVoices(getSpanishDeviceVoices());
    syncVoices();
    window.speechSynthesis.onvoiceschanged = syncVoices;
    return () => {
      if (window.speechSynthesis.onvoiceschanged === syncVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!alarm.includeWeather) return;
    if (!isOpen && !nightstandOpen && !alarm.enabled) return;
    let cancelled = false;
    fetchArgentinaLiveData(alarm.cityKey)
      .then((data) => {
        if (!cancelled) setLiveWeather(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [alarm.cityKey, alarm.includeWeather, alarm.enabled, isOpen, nightstandOpen]);

  // Al abrir el modal por primera vez sin canción elegida, preseleccionar el tema actual
  useEffect(() => {
    if (isOpen && !alarm.videoId && currentTrack?.videoId) {
      updateAlarm({
        ...alarm,
        videoId: currentTrack.videoId,
        title: currentTrack.title,
        author: currentTrack.author
      });
    }
  }, [isOpen, alarm, currentTrack, updateAlarm]);

  const clearRingingTimers = useCallback(() => {
    volumeTimersRef.current.forEach((id) => window.clearTimeout(id));
    volumeTimersRef.current = [];
    if (offlineChimeTimerRef.current !== null) {
      window.clearInterval(offlineChimeTimerRef.current);
      offlineChimeTimerRef.current = null;
    }
  }, []);

  const unlockAudio = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
    } catch {
      // ignore
    }
  }, []);

  const rampMusicVolume = useCallback(
    (gentleWake: boolean) => {
      if (gentleWake) {
        const steps: Array<[number, number]> = [
          [200, 26],
          [3500, 46],
          [8000, 68],
          [14000, 86],
          [20000, 100]
        ];
        steps.forEach(([delayMs, vol]) => {
          const id = window.setTimeout(() => onSetVolume(vol), delayMs);
          volumeTimersRef.current.push(id);
        });
      } else {
        const id = window.setTimeout(() => onSetVolume(100), 250);
        volumeTimersRef.current.push(id);
      }
    },
    [onSetVolume]
  );

  const fireAlarmNow = useCallback(
    (sourceCfg: YouMusicAlarmConfig, isTest = false) => {
      clearRingingTimers();
      setNightstandOpen(false);
      setIsRinging(true);
      setSnoozeUntilMs(null);

      const targetTrack: YouMusicAlarmTrack | null = sourceCfg.videoId
        ? {
            videoId: sourceCfg.videoId,
            title: sourceCfg.title || 'Tu música elegida',
            author: sourceCfg.author || 'YouMusic'
          }
        : currentTrack;

      // 1. Tono cálido inicial (y respaldo continuo si no hay internet)
      playGentleBackupChime(audioCtxRef);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        offlineChimeTimerRef.current = window.setInterval(() => {
          playGentleBackupChime(audioCtxRef);
        }, 4200);
      }

      // 2. Arranca la música elegida (baja a 14 % si hay mensaje de voz para que se escuche nítido)
      if (targetTrack) {
        onTriggerPlayTrack(targetTrack);
      }

      if (sourceCfg.voiceBriefingEnabled) {
        const duckId = window.setTimeout(() => onSetVolume(14), 250);
        volumeTimersRef.current.push(duckId);
        const startVoiceId = window.setTimeout(() => {
          const weatherPromise = sourceCfg.includeWeather
            ? fetchArgentinaLiveData(sourceCfg.cityKey, false).catch(() => weatherRef.current)
            : Promise.resolve(null);
          const newsPromise = sourceCfg.atlasBriefingEnabled
            ? fetchTopAtlasHeadlines().catch(() => [])
            : Promise.resolve([]);

          void Promise.all([weatherPromise, newsPromise]).then(([w, headlines]) => {
            if (w) setLiveWeather(w);
            setAtlasHeadlines(headlines);
            const script = buildSmartBriefingText(sourceCfg, new Date(), w, headlines);
            setIsSpeakingNow(true);
            speakSpanishBriefing(script, sourceCfg.voiceProfileId, sourceCfg.deviceVoiceName, () => {
              setIsSpeakingNow(false);
              rampMusicVolume(sourceCfg.gentleWake);
            });
          });
        }, 1200);
        volumeTimersRef.current.push(startVoiceId);
      } else {
        rampMusicVolume(sourceCfg.gentleWake);
      }

      if (!isTest) {
        const firedKey = getMinuteKey(new Date());
        const nextCfg: YouMusicAlarmConfig = {
          ...sourceCfg,
          enabled: sourceCfg.repeat === 'once' ? false : sourceCfg.enabled,
          lastFiredKey: firedKey
        };
        updateAlarm(nextCfg);
      }
    },
    [clearRingingTimers, currentTrack, onSetVolume, onTriggerPlayTrack, rampMusicVolume, updateAlarm]
  );

  // Reloj 1s: evalúa la hora de la alarma y el snooze
  useEffect(() => {
    const tick = window.setInterval(() => {
      const current = new Date();
      setNow(current);

      if (snoozeUntilMs && Date.now() >= snoozeUntilMs) {
        fireAlarmNow(alarmRef.current, true);
        return;
      }

      const cfg = alarmRef.current;
      if (!cfg.enabled || isRinging) return;
      const hhmm = formatClockHHMM(current);
      const minKey = getMinuteKey(current);
      if (hhmm === cfg.time && matchesRepeatDay(cfg.repeat, current) && cfg.lastFiredKey !== minKey) {
        fireAlarmNow(cfg, false);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [fireAlarmNow, isRinging, snoozeUntilMs]);

  // Disparo automático cuando Android AlarmManager despierta el APK (?alarmTrigger=1)
  const nativeTriggerHandledRef = useRef(false);
  useEffect(() => {
    if (nativeTriggerHandledRef.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('alarmTrigger') !== '1') return;
    nativeTriggerHandledRef.current = true;
    try {
      params.delete('alarmTrigger');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // ignore
    }
    const t = window.setTimeout(() => {
      fireAlarmNow(alarmRef.current, false);
    }, 450);
    return () => window.clearTimeout(t);
  }, [fireAlarmNow]);

  // Countdown de prueba (5 s)
  useEffect(() => {
    if (testCountdown === null) return;
    if (testCountdown <= 0) {
      setTestCountdown(null);
      fireAlarmNow(alarmRef.current, true);
      return;
    }
    const t = window.setTimeout(() => setTestCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(t);
  }, [testCountdown, fireAlarmNow]);

  useEffect(
    () => () => {
      clearRingingTimers();
      stopSpeechBriefing();
    },
    [clearRingingTimers]
  );

  const handleEnterNightstand = () => {
    unlockAudio();
    const armed: YouMusicAlarmConfig = {
      ...alarm,
      enabled: true,
      videoId: alarm.videoId || currentTrack?.videoId || '',
      title: alarm.title || currentTrack?.title || '',
      author: alarm.author || currentTrack?.author || ''
    };
    updateAlarm(armed);
    onPauseForSleep();
    void onRequestWakeLock();
    onClose();
    setNightstandOpen(true);
  };

  const handleExitNightstand = () => {
    setNightstandOpen(false);
    void onReleaseWakeLock();
  };

  const handleSnooze = (minutes = 5) => {
    clearRingingTimers();
    stopSpeechBriefing();
    setIsSpeakingNow(false);
    setIsRinging(false);
    onPauseForSleep();
    setSnoozeUntilMs(Date.now() + minutes * 60 * 1000);
    onToast?.(`⏰ Despertador pospuesto ${minutes} minutos.`);
  };

  const handleDismiss = (keepPlaying: boolean) => {
    clearRingingTimers();
    stopSpeechBriefing();
    setIsSpeakingNow(false);
    setIsRinging(false);
    setSnoozeUntilMs(null);
    if (!keepPlaying) {
      onPauseForSleep();
    } else {
      onSetVolume(100);
    }
  };

  const handleAddAgendaItem = () => {
    const cleanText = newAgendaText.trim();
    if (!cleanText) return;
    const entry: AlarmAgendaEntry = {
      id: `ag_${Date.now().toString(36)}`,
      time: newAgendaTime.trim(),
      text: cleanText
    };
    updateAlarm({
      ...alarm,
      agendaItems: [...alarm.agendaItems, entry].slice(0, 8)
    });
    setNewAgendaText('');
  };

  const handleRemoveAgendaItem = (id: string) => {
    updateAlarm({
      ...alarm,
      agendaItems: alarm.agendaItems.filter((a) => a.id !== id)
    });
  };

  const handlePreviewVoice = (overrideProfileId?: AtlasVoiceProfileId, overrideDeviceVoice?: string) => {
    unlockAudio();
    const profId = overrideProfileId || alarm.voiceProfileId;
    const devVoice = overrideDeviceVoice !== undefined ? overrideDeviceVoice : alarm.deviceVoiceName;
    const weatherPromise = alarm.includeWeather
      ? fetchArgentinaLiveData(alarm.cityKey).catch(() => liveWeather)
      : Promise.resolve(null);
    const newsPromise = alarm.atlasBriefingEnabled
      ? fetchTopAtlasHeadlines().catch(() => [])
      : Promise.resolve([]);

    void Promise.all([weatherPromise, newsPromise]).then(([w, headlines]) => {
      if (w) setLiveWeather(w);
      setAtlasHeadlines(headlines);
      const previewCfg = { ...alarm, voiceProfileId: profId, deviceVoiceName: devVoice };
      const text = buildSmartBriefingText(previewCfg, new Date(), w, headlines);
      setIsSpeakingNow(true);
      speakSpanishBriefing(text, profId, devVoice, () => setIsSpeakingNow(false));
    });
  };

  const handleAuditionProfile = (profile: AtlasVoiceProfile) => {
    unlockAudio();
    updateAlarm({ ...alarm, voiceProfileId: profile.id, deviceVoiceName: '' });
    const sample = alarm.atlasBriefingEnabled
      ? `Buenos días${alarm.userName.trim() ? `, ${alarm.userName.trim()}` : ''}, soy ATLAS con voz ${profile.name.split(' ')[0]}. Así sonará tu despertador.`
      : `Buenos días${alarm.userName.trim() ? `, ${alarm.userName.trim()}` : ''}. Así suena la voz ${profile.name.split(' ')[0]} para tu despertador.`;
    setIsSpeakingNow(true);
    speakSpanishBriefing(sample, profile.id, '', () => setIsSpeakingNow(false));
  };

  const uniqueTracks: YouMusicAlarmTrack[] = [];
  const seenIds = new Set<string>();
  const pushTrack = (t: YouMusicAlarmTrack | null | undefined) => {
    if (!t || !t.videoId || seenIds.has(t.videoId)) return;
    seenIds.add(t.videoId);
    uniqueTracks.push(t);
  };
  pushTrack(currentTrack);
  queueTracks.forEach(pushTrack);

  return (
    <>
      {/* 1. MODAL DE CONFIGURACIÓN DEL DESPERTADOR */}
      {isOpen && (
        <div
          className="ymalarm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Despertador musical YouMusic"
          onClick={onClose}
        >
          <div className="ymalarm-card" onClick={(e) => e.stopPropagation()}>
            <div className="ymalarm-head">
              <div className="ymalarm-head-title">
                <AlarmClock size={18} color="#f59e0b" />
                <div>
                  <h3>Despertador Inteligente</h3>
                  <span>Música + voz con clima y tu agenda</span>
                </div>
              </div>
              <button type="button" className="ymalarm-close" onClick={onClose} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

            {(() => {
              const bridge = getAndroidBridge();
              const hasNativeAlarm = Boolean(bridge && typeof bridge.scheduleAlarm === 'function');
              const hasNativeVoice = Boolean(bridge && typeof bridge.speak === 'function');
              if (hasNativeAlarm && hasNativeVoice) {
                return (
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#86efac',
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      borderRadius: 10,
                      padding: '7px 10px'
                    }}
                  >
                    ✓ APK Nuevo activo: voz HD nativa de Android + alarma con pantalla apagada.
                  </div>
                );
              }
              if (bridge) {
                return (
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#fde68a',
                      background: 'rgba(245, 158, 11, 0.14)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: 10,
                      padding: '7px 10px'
                    }}
                  >
                    ⚠ Estás en el APK anterior (sin voz nativa ni alarma en segundo plano). Reinstalá el APK nuevo.
                  </div>
                );
              }
              return null;
            })()}

            <div className="ymalarm-time-row">
              <input
                type="time"
                className="ymalarm-time-input"
                value={alarm.time}
                onChange={(e) => {
                  const val = e.target.value || '07:30';
                  updateAlarm({ ...alarm, time: val, lastFiredKey: undefined });
                }}
                aria-label="Hora del despertador"
              />
              <button
                type="button"
                className={`ymalarm-toggle ${alarm.enabled ? 'is-on' : ''}`}
                onClick={() => {
                  unlockAudio();
                  const nextOn = !alarm.enabled;
                  updateAlarm({
                    ...alarm,
                    enabled: nextOn,
                    videoId: alarm.videoId || currentTrack?.videoId || '',
                    title: alarm.title || currentTrack?.title || '',
                    author: alarm.author || currentTrack?.author || '',
                    lastFiredKey: undefined
                  });
                }}
                aria-pressed={alarm.enabled}
              >
                <span className="ymalarm-toggle-dot" />
                <span>{alarm.enabled ? 'Activado' : 'Apagado'}</span>
              </button>
            </div>

            <div className="ymalarm-section">
              <div className="ymalarm-label">Repetición</div>
              <div className="ymalarm-pills">
                {(
                  [
                    ['once', 'Una vez'],
                    ['weekdays', 'Lun a Vie'],
                    ['daily', 'Todos los días']
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`ymalarm-pill ${alarm.repeat === mode ? 'is-active' : ''}`}
                    onClick={() => updateAlarm({ ...alarm, repeat: mode })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* BRIEFING DE VOZ INTELIGENTE (CLIMA + AGENDA) */}
            <div className="ymalarm-voice-box">
              <div className="ymalarm-label-row">
                <label className="ymalarm-check-row" style={{ fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={alarm.voiceBriefingEnabled}
                    onChange={(e) => updateAlarm({ ...alarm, voiceBriefingEnabled: e.target.checked })}
                  />
                  <Mic size={15} color="#f59e0b" />
                  <span>Mensaje de voz inteligente al despertar</span>
                </label>
                {alarm.voiceBriefingEnabled && (
                  <button
                    type="button"
                    className="ymalarm-use-current"
                    onClick={() => handlePreviewVoice()}
                    title="Escuchar cómo sonará tu mensaje de voz ahora"
                  >
                    <Volume2 size={12} /> {isSpeakingNow ? 'Hablando…' : 'Escuchar'}
                  </button>
                )}
              </div>

              {alarm.voiceBriefingEnabled && (
                <div className="ymalarm-voice-fields">
                  {/* OPCIÓN NO AUTOMÁTICA: SUMAR RESUMEN DE ATLAS */}
                  <label className="ymalarm-check-row ymalarm-atlas-opt">
                    <input
                      type="checkbox"
                      checked={alarm.atlasBriefingEnabled}
                      onChange={(e) => updateAlarm({ ...alarm, atlasBriefingEnabled: e.target.checked })}
                    />
                    <Sparkles size={15} color="#a78bfa" />
                    <span>
                      <strong>Agregar resumen de ATLAS</strong> (se presenta como ATLAS y lee 2 titulares de /lecturas)
                    </span>
                  </label>

                  {/* SELECTOR DE VOCES ATLAS VIDEO */}
                  <div className="ymalarm-agenda-block">
                    <div className="ymalarm-label">Elegí tu voz (estilos ATLAS Video)</div>
                    <div className="ymalarm-voice-grid">
                      {ATLAS_VOICE_PROFILES.map((vp) => {
                        const active = alarm.voiceProfileId === vp.id && !alarm.deviceVoiceName;
                        return (
                          <button
                            key={vp.id}
                            type="button"
                            className={`ymalarm-voice-chip ${active ? 'is-active' : ''}`}
                            onClick={() => handleAuditionProfile(vp)}
                            title={`Seleccionar y probar voz ${vp.name}`}
                          >
                            <div className="ymalarm-voice-chip-txt">
                              <strong>{vp.name}</strong>
                              <span>{vp.subtitle}</span>
                            </div>
                            <Play size={12} />
                          </button>
                        );
                      })}
                    </div>
                    {spanishVoices.length > 1 && (
                      <select
                        className="ymalarm-select"
                        value={alarm.deviceVoiceName}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          updateAlarm({ ...alarm, deviceVoiceName: nextName });
                          if (nextName) handlePreviewVoice(alarm.voiceProfileId, nextName);
                        }}
                        aria-label="Voz del dispositivo en español"
                      >
                        <option value="">Automático (prioriza Natural / Google HD)</option>
                        {spanishVoices.map((v) => (
                          <option key={`${v.name}-${v.lang}`} value={v.name}>
                            {isHighQualityVoice(v) ? '★ HD · ' : ''}
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="ymalarm-inline-grid">
                    <input
                      type="text"
                      className="ymalarm-input"
                      placeholder="Tu nombre (ej. Eduardo)"
                      value={alarm.userName}
                      onChange={(e) => updateAlarm({ ...alarm, userName: e.target.value })}
                    />
                    <select
                      className="ymalarm-select"
                      value={alarm.cityKey}
                      onChange={(e) => updateAlarm({ ...alarm, cityKey: e.target.value as ArgentinaCityKey })}
                      aria-label="Ciudad para el clima"
                    >
                      {(Object.keys(ARGENTINA_CITIES) as ArgentinaCityKey[]).map((key) => (
                        <option key={key} value={key}>
                          {ARGENTINA_CITIES[key].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="ymalarm-check-row">
                    <input
                      type="checkbox"
                      checked={alarm.includeWeather}
                      onChange={(e) => updateAlarm({ ...alarm, includeWeather: e.target.checked })}
                    />
                    <CloudSun size={15} color="#38bdf8" />
                    <span>
                      Decir clima actual
                      {liveWeather && liveWeather.tempC !== null
                        ? ` (${Math.round(liveWeather.tempC)}°C · ${liveWeather.weatherLabel})`
                        : ''}
                    </span>
                  </label>

                  {/* AGENDA PROGRAMADA */}
                  <div className="ymalarm-agenda-block">
                    <div className="ymalarm-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <CalendarClock size={12} /> Agenda del día (la lee en voz alta)
                    </div>
                    <div className="ymalarm-agenda-add">
                      <input
                        type="time"
                        className="ymalarm-agenda-time"
                        value={newAgendaTime}
                        onChange={(e) => setNewAgendaTime(e.target.value)}
                        aria-label="Hora de la actividad"
                      />
                      <input
                        type="text"
                        className="ymalarm-input"
                        placeholder="Ej. Reunión, gimnasio, médico…"
                        value={newAgendaText}
                        onChange={(e) => setNewAgendaText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAgendaItem();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="ymalarm-add-btn"
                        onClick={handleAddAgendaItem}
                        title="Agregar a la agenda"
                        aria-label="Agregar a la agenda"
                      >
                        <Plus size={15} />
                      </button>
                    </div>

                    {alarm.agendaItems.length > 0 && (
                      <div className="ymalarm-agenda-list">
                        {alarm.agendaItems.map((ag) => (
                          <div key={ag.id} className="ymalarm-agenda-row">
                            <span className="ymalarm-agenda-chip">{ag.time || 'Hoy'}</span>
                            <span className="ymalarm-agenda-text">{ag.text}</span>
                            <button
                              type="button"
                              className="ymalarm-agenda-del"
                              onClick={() => handleRemoveAgendaItem(ag.id)}
                              aria-label="Quitar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className="ymalarm-input"
                    placeholder="Frase final opcional (ej. ¡Vamos con todo hoy!)"
                    value={alarm.customMessage}
                    onChange={(e) => updateAlarm({ ...alarm, customMessage: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="ymalarm-section">
              <div className="ymalarm-label-row">
                <span className="ymalarm-label">Música para despertar</span>
                {currentTrack && alarm.videoId !== currentTrack.videoId && (
                  <button
                    type="button"
                    className="ymalarm-use-current"
                    onClick={() =>
                      updateAlarm({
                        ...alarm,
                        videoId: currentTrack.videoId,
                        title: currentTrack.title,
                        author: currentTrack.author
                      })
                    }
                  >
                    <Music size={12} /> Usar tema actual
                  </button>
                )}
              </div>

              <div className="ymalarm-track-list">
                {uniqueTracks.slice(0, 6).map((t) => {
                  const selected = alarm.videoId === t.videoId;
                  return (
                    <button
                      key={t.videoId}
                      type="button"
                      className={`ymalarm-track-item ${selected ? 'is-selected' : ''}`}
                      onClick={() =>
                        updateAlarm({
                          ...alarm,
                          videoId: t.videoId,
                          title: t.title,
                          author: t.author
                        })
                      }
                    >
                      <div className="ymalarm-track-info">
                        <strong>{t.title}</strong>
                        <span>{t.author}</span>
                      </div>
                      {selected && <Check size={15} color="#f59e0b" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="ymalarm-check-row">
              <input
                type="checkbox"
                checked={alarm.gentleWake}
                onChange={(e) => updateAlarm({ ...alarm, gentleWake: e.target.checked })}
              />
              <Volume2 size={15} color="#38bdf8" />
              <span>Despertar suave (sube el volumen gradualmente)</span>
            </label>

            <div className="ymalarm-actions">
              <button type="button" className="ymalarm-btn-primary" onClick={handleEnterNightstand}>
                <Moon size={15} />
                <span>Activar y abrir Reloj Nocturno</span>
              </button>
              <div className="ymalarm-actions-sub">
                <button
                  type="button"
                  className="ymalarm-btn-secondary"
                  onClick={() => {
                    unlockAudio();
                    const nextCfg: YouMusicAlarmConfig = {
                      ...alarm,
                      enabled: true,
                      videoId: alarm.videoId || currentTrack?.videoId || '',
                      title: alarm.title || currentTrack?.title || '',
                      author: alarm.author || currentTrack?.author || '',
                      lastFiredKey: undefined
                    };
                    updateAlarm(nextCfg);
                    onToast?.(`⏰ Despertador programado para las ${nextCfg.time}.`);
                    onClose();
                  }}
                >
                  Guardar ({alarm.time})
                </button>
                <button
                  type="button"
                  className="ymalarm-btn-ghost"
                  onClick={() => {
                    unlockAudio();
                    setTestCountdown(5);
                    onClose();
                    onToast?.('⏰ Probando despertador + voz en 5 segundos…');
                  }}
                >
                  <Play size={13} /> Probar (5 s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODO RELOJ NOCTURNO (OLED MESITA DE LUZ) */}
      {nightstandOpen && (
        <div className={`ymalarm-nightstand ${nightstandDim ? 'is-dim' : ''}`}>
          <div className="ymalarm-ns-top">
            <span className="ymalarm-ns-status">
              <span className={`ymalarm-ns-dot ${wakeLockActive ? 'is-live' : ''}`} />
              {wakeLockActive ? 'Pantalla despierta activa' : 'Reloj nocturno'}
            </span>
            <div className="ymalarm-ns-top-btns">
              <button
                type="button"
                className="ymalarm-ns-btn"
                onClick={() => setNightstandDim((d) => !d)}
                title={nightstandDim ? 'Subir brillo del reloj' : 'Atenuar reloj'}
              >
                {nightstandDim ? <Sun size={14} /> : <Moon size={14} />}
                <span>{nightstandDim ? 'Más brillo' : 'Tenue'}</span>
              </button>
              <button type="button" className="ymalarm-ns-btn" onClick={handleExitNightstand}>
                <X size={14} />
                <span>Salir</span>
              </button>
            </div>
          </div>

          <div className="ymalarm-ns-center">
            <div className="ymalarm-ns-clock">{formatClockHHMM(now)}</div>
            <div className="ymalarm-ns-date">
              {formatDateEs(now)}
              {alarm.includeWeather && liveWeather && liveWeather.tempC !== null
                ? ` · ${Math.round(liveWeather.tempC)}°C ${liveWeather.cityLabel}`
                : ''}
            </div>
            <div className="ymalarm-ns-pill">
              <AlarmClock size={15} />
              <span>
                {snoozeUntilMs
                  ? 'Pospuesto · vuelve a sonar en breve'
                  : `Alarma ${alarm.time}${alarm.voiceBriefingEnabled ? ' · Voz + ' : ' · '}${alarm.title || 'YouMusic'}`}
              </span>
            </div>
          </div>

          <div className="ymalarm-ns-foot">
            Conectá el cargador y dejá esta pantalla abierta para despertar con tu música y mensaje de voz.
          </div>
        </div>
      )}

      {/* 3. PANTALLA DE ALARMA SONANDO (CON CLIMA + AGENDA EN PANTALLA) */}
      {isRinging && (
        <div className="ymalarm-ring-overlay" role="alertdialog" aria-label="Despertador sonando">
          <div className="ymalarm-ring-card">
            <div className="ymalarm-ring-icon">
              <BellRing size={32} />
            </div>
            <div className="ymalarm-ring-time">{formatClockHHMM(now)}</div>
            <div className="ymalarm-ring-song">
              <strong>{alarm.title || currentTrack?.title || '¡Hora de levantarse!'}</strong>
              <span>
                {isSpeakingNow ? '🎙️ Leyendo tu resumen matutino…' : alarm.author || currentTrack?.author || 'YouMusic'}
              </span>
            </div>

            {(alarm.includeWeather && liveWeather && liveWeather.tempC !== null) || alarm.agendaItems.length > 0 ? (
              <div className="ymalarm-ring-brief">
                {alarm.includeWeather && liveWeather && liveWeather.tempC !== null && (
                  <div className="ymalarm-ring-weather">
                    <CloudSun size={15} color="#38bdf8" />
                    <span>
                      <strong>{Math.round(liveWeather.tempC)}°C</strong> · {liveWeather.weatherLabel} en{' '}
                      {liveWeather.cityLabel}
                    </span>
                  </div>
                )}
                {alarm.agendaItems.length > 0 && (
                  <div className="ymalarm-ring-agenda">
                    {alarm.agendaItems.slice(0, 4).map((ag) => (
                      <div key={ag.id} className="ymalarm-ring-ag-item">
                        <span className="ymalarm-agenda-chip">{ag.time || 'Hoy'}</span>
                        <span>{ag.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {alarm.atlasBriefingEnabled && atlasHeadlines.length > 0 && (
                  <div className="ymalarm-ring-agenda">
                    {atlasHeadlines.slice(0, 2).map((h, i) => (
                      <div key={`hl-${i}`} className="ymalarm-ring-ag-item">
                        <Newspaper size={13} color="#a78bfa" style={{ flexShrink: 0 }} />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="ymalarm-ring-actions">
              <button type="button" className="ymalarm-ring-snooze" onClick={() => handleSnooze(5)}>
                Posponer +5 min
              </button>
              <button type="button" className="ymalarm-ring-stop" onClick={() => handleDismiss(true)}>
                Apagar alarma y seguir escuchando
              </button>
              <button type="button" className="ymalarm-ring-mute" onClick={() => handleDismiss(false)}>
                Apagar y pausar música
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ymalarm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 12000;
          background: rgba(3, 6, 14, 0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
        }
        .ymalarm-card {
          width: 100%;
          max-width: 440px;
          max-height: 92dvh;
          overflow-y: auto;
          border-radius: 22px;
          background: linear-gradient(160deg, rgba(20, 26, 40, 0.96), rgba(10, 14, 24, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
          padding: 18px;
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 13px;
        }
        .ymalarm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ymalarm-head-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ymalarm-head-title h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }
        .ymalarm-head-title span {
          font-size: 12px;
          color: #94a3b8;
        }
        .ymalarm-close {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #e2e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ymalarm-time-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .ymalarm-time-input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.02em;
          outline: none;
          color-scheme: dark;
          cursor: pointer;
        }
        .ymalarm-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.07);
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymalarm-toggle.is-on {
          background: rgba(245, 158, 11, 0.2);
          border-color: rgba(245, 158, 11, 0.55);
          color: #fcd34d;
        }
        .ymalarm-toggle-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #64748b;
        }
        .ymalarm-toggle.is-on .ymalarm-toggle-dot {
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
        }
        .ymalarm-section {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .ymalarm-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ymalarm-label {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
        }
        .ymalarm-use-current {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 999px;
          padding: 4px 9px;
          cursor: pointer;
          white-space: nowrap;
        }
        .ymalarm-pills {
          display: flex;
          gap: 8px;
        }
        .ymalarm-pill {
          flex: 1;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymalarm-pill.is-active {
          background: rgba(56, 189, 248, 0.18);
          border-color: rgba(56, 189, 248, 0.55);
          color: #e0f2fe;
        }
        .ymalarm-voice-box {
          padding: 12px;
          border-radius: 16px;
          background: rgba(245, 158, 11, 0.06);
          border: 1px solid rgba(245, 158, 11, 0.22);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ymalarm-voice-fields {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .ymalarm-atlas-opt {
          padding: 8px 10px;
          border-radius: 11px;
          background: rgba(167, 139, 250, 0.1);
          border: 1px solid rgba(167, 139, 250, 0.28);
        }
        .ymalarm-voice-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .ymalarm-voice-chip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 7px 9px;
          border-radius: 11px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(8, 12, 22, 0.65);
          color: #e2e8f0;
          text-align: left;
          cursor: pointer;
        }
        .ymalarm-voice-chip.is-active {
          border-color: rgba(245, 158, 11, 0.65);
          background: rgba(245, 158, 11, 0.16);
          color: #fef3c7;
        }
        .ymalarm-voice-chip-txt {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .ymalarm-voice-chip-txt strong {
          font-size: 11.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymalarm-voice-chip-txt span {
          font-size: 10px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymalarm-inline-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ymalarm-input,
        .ymalarm-select,
        .ymalarm-agenda-time {
          width: 100%;
          min-width: 0;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(8, 12, 22, 0.75);
          color: #f8fafc;
          font-size: 12.5px;
          outline: none;
          color-scheme: dark;
        }
        .ymalarm-agenda-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ymalarm-agenda-add {
          display: grid;
          grid-template-columns: 88px 1fr 34px;
          gap: 6px;
        }
        .ymalarm-add-btn {
          border-radius: 10px;
          border: 1px solid rgba(245, 158, 11, 0.45);
          background: rgba(245, 158, 11, 0.2);
          color: #fcd34d;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ymalarm-agenda-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-height: 110px;
          overflow-y: auto;
        }
        .ymalarm-agenda-row {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          font-size: 12px;
        }
        .ymalarm-agenda-chip {
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(56, 189, 248, 0.16);
          color: #7dd3fc;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .ymalarm-agenda-text {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #e2e8f0;
        }
        .ymalarm-agenda-del {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: inline-flex;
          padding: 2px;
        }
        .ymalarm-track-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 145px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .ymalarm-track-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #e2e8f0;
          text-align: left;
          cursor: pointer;
        }
        .ymalarm-track-item.is-selected {
          border-color: rgba(245, 158, 11, 0.55);
          background: rgba(245, 158, 11, 0.12);
        }
        .ymalarm-track-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ymalarm-track-info strong {
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ymalarm-track-info span {
          font-size: 11px;
          color: #94a3b8;
        }
        .ymalarm-check-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: #e2e8f0;
          cursor: pointer;
        }
        .ymalarm-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ymalarm-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #f59e0b, #ea580c);
          color: #0b0f19;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }
        .ymalarm-actions-sub {
          display: flex;
          gap: 8px;
        }
        .ymalarm-btn-secondary {
          flex: 1;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .ymalarm-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(56, 189, 248, 0.3);
          background: rgba(56, 189, 248, 0.1);
          color: #7dd3fc;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        /* OLED Nightstand Clock */
        .ymalarm-nightstand {
          position: fixed;
          inset: 0;
          z-index: 13000;
          background: #000000;
          color: #e2e8f0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: max(18px, env(safe-area-inset-top)) 20px max(22px, env(safe-area-inset-bottom));
        }
        .ymalarm-nightstand.is-dim .ymalarm-ns-clock {
          color: rgba(248, 250, 252, 0.42);
        }
        .ymalarm-nightstand.is-dim .ymalarm-ns-date,
        .ymalarm-nightstand.is-dim .ymalarm-ns-pill {
          opacity: 0.48;
        }
        .ymalarm-ns-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ymalarm-ns-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          color: rgba(226, 232, 240, 0.65);
        }
        .ymalarm-ns-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #64748b;
        }
        .ymalarm-ns-dot.is-live {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }
        .ymalarm-ns-top-btns {
          display: flex;
          gap: 8px;
        }
        .ymalarm-ns-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(248, 250, 252, 0.8);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ymalarm-ns-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
        }
        .ymalarm-ns-clock {
          font-size: clamp(4.5rem, 20vw, 10rem);
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #f8fafc;
        }
        .ymalarm-ns-date {
          font-size: 16px;
          color: #94a3b8;
        }
        .ymalarm-ns-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.1);
          color: #fcd34d;
          font-size: 13px;
          font-weight: 600;
          max-width: 90vw;
        }
        .ymalarm-ns-pill span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ymalarm-ns-foot {
          text-align: center;
          font-size: 11.5px;
          color: rgba(148, 163, 184, 0.55);
        }

        /* Ringing Overlay */
        .ymalarm-ring-overlay {
          position: fixed;
          inset: 0;
          z-index: 14000;
          background: radial-gradient(circle at top, rgba(245, 158, 11, 0.25), rgba(5, 8, 18, 0.96) 65%);
          backdrop-filter: blur(18px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .ymalarm-ring-card {
          width: 100%;
          max-width: 400px;
          border-radius: 26px;
          padding: 24px 20px;
          background: rgba(14, 19, 32, 0.92);
          border: 1px solid rgba(245, 158, 11, 0.45);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 14px;
          color: #f8fafc;
        }
        .ymalarm-ring-icon {
          width: 62px;
          height: 62px;
          border-radius: 999px;
          background: rgba(245, 158, 11, 0.18);
          color: #fbbf24;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ymalarmPulse 1.3s ease-in-out infinite;
        }
        @keyframes ymalarmPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.45); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 18px rgba(245, 158, 11, 0); }
        }
        .ymalarm-ring-time {
          font-size: 46px;
          font-weight: 800;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .ymalarm-ring-song {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 100%;
        }
        .ymalarm-ring-song strong {
          font-size: 16px;
          font-weight: 700;
        }
        .ymalarm-ring-song span {
          font-size: 13px;
          color: #94a3b8;
        }
        .ymalarm-ring-brief {
          width: 100%;
          padding: 11px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: left;
        }
        .ymalarm-ring-weather {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: #e2e8f0;
        }
        .ymalarm-ring-agenda {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .ymalarm-ring-ag-item {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
          color: #cbd5e1;
        }
        .ymalarm-ring-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-top: 4px;
        }
        .ymalarm-ring-snooze {
          width: 100%;
          padding: 13px;
          border-radius: 16px;
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(56, 189, 248, 0.16);
          color: #e0f2fe;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }
        .ymalarm-ring-stop {
          width: 100%;
          padding: 13px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #f59e0b, #ea580c);
          color: #0b0f19;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }
        .ymalarm-ring-mute {
          width: 100%;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </>
  );
};
