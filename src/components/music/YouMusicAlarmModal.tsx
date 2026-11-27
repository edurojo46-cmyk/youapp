import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  BellRing,
  Check,
  Moon,
  Music,
  Play,
  Sun,
  Volume2,
  X
} from 'lucide-react';

export type AlarmRepeatMode = 'once' | 'weekdays' | 'daily';

export interface YouMusicAlarmTrack {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl?: string;
}

export interface YouMusicAlarmConfig {
  enabled: boolean;
  time: string; // "HH:MM"
  repeat: AlarmRepeatMode;
  videoId: string;
  title: string;
  author: string;
  gentleWake: boolean;
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
  gentleWake: true
};

export function loadYouMusicAlarm(): YouMusicAlarmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALARM;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_ALARM;
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
      lastFiredKey: typeof parsed.lastFiredKey === 'string' ? parsed.lastFiredKey : undefined
    };
  } catch {
    return DEFAULT_ALARM;
  }
}

function saveYouMusicAlarm(cfg: YouMusicAlarmConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage quota errors
  }
  // Hook listo para Paso 2 (APK Android AlarmManager nativo)
  try {
    const bridge = (window as unknown as { YouAppAndroidPiP?: { scheduleAlarm?: (json: string) => void } })
      .YouAppAndroidPiP;
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
  const [snoozeUntilMs, setSnoozeUntilMs] = useState<number | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [testCountdown, setTestCountdown] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const volumeTimersRef = useRef<number[]>([]);
  const offlineChimeTimerRef = useRef<number | null>(null);
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;

  const updateAlarm = useCallback(
    (next: YouMusicAlarmConfig) => {
      setAlarm(next);
      saveYouMusicAlarm(next);
      onAlarmStateChange?.(next);
    },
    [onAlarmStateChange]
  );

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

      // Tono suave inicial (y respaldo continuo si no hay internet)
      playGentleBackupChime(audioCtxRef);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        offlineChimeTimerRef.current = window.setInterval(() => {
          playGentleBackupChime(audioCtxRef);
        }, 4200);
      }

      if (targetTrack) {
        onTriggerPlayTrack(targetTrack);
      }

      if (sourceCfg.gentleWake) {
        const steps: Array<[number, number]> = [
          [200, 22],
          [3500, 42],
          [8000, 64],
          [14000, 84],
          [21000, 100]
        ];
        steps.forEach(([delayMs, vol]) => {
          const id = window.setTimeout(() => onSetVolume(vol), delayMs);
          volumeTimersRef.current.push(id);
        });
      } else {
        const id = window.setTimeout(() => onSetVolume(100), 250);
        volumeTimersRef.current.push(id);
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
    [clearRingingTimers, currentTrack, onSetVolume, onTriggerPlayTrack, updateAlarm]
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

  useEffect(() => () => clearRingingTimers(), [clearRingingTimers]);

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
    setIsRinging(false);
    onPauseForSleep();
    setSnoozeUntilMs(Date.now() + minutes * 60 * 1000);
    onToast?.(`⏰ Despertador pospuesto ${minutes} minutos.`);
  };

  const handleDismiss = (keepPlaying: boolean) => {
    clearRingingTimers();
    setIsRinging(false);
    setSnoozeUntilMs(null);
    if (!keepPlaying) {
      onPauseForSleep();
    } else {
      onSetVolume(100);
    }
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
                  <h3>Despertador Musical</h3>
                  <span>Elegí la hora y la canción que te levanta</span>
                </div>
              </div>
              <button type="button" className="ymalarm-close" onClick={onClose} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

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
                {uniqueTracks.slice(0, 8).map((t) => {
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

            <div className="ymalarm-tip">
              En navegador web, dejá abierto el <strong>Modo Reloj Nocturno</strong> (pantalla oscura con reloj) para
              que el celular no suspenda la pestaña durante la noche.
            </div>

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
                    onToast?.('⏰ Probando despertador en 5 segundos…');
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
            <div className="ymalarm-ns-date">{formatDateEs(now)}</div>
            <div className="ymalarm-ns-pill">
              <AlarmClock size={15} />
              <span>
                {snoozeUntilMs
                  ? `Pospuesto · vuelve a sonar en breve`
                  : `Alarma ${alarm.time} · ${alarm.title || 'YouMusic'}`}
              </span>
            </div>
          </div>

          <div className="ymalarm-ns-foot">
            Conectá el cargador y dejá esta pantalla abierta para despertar con tu música.
          </div>
        </div>
      )}

      {/* 3. PANTALLA DE ALARMA SONANDO */}
      {isRinging && (
        <div className="ymalarm-ring-overlay" role="alertdialog" aria-label="Despertador sonando">
          <div className="ymalarm-ring-card">
            <div className="ymalarm-ring-icon">
              <BellRing size={34} />
            </div>
            <div className="ymalarm-ring-time">{formatClockHHMM(now)}</div>
            <div className="ymalarm-ring-song">
              <strong>{alarm.title || currentTrack?.title || '¡Hora de levantarse!'}</strong>
              <span>{alarm.author || currentTrack?.author || 'YouMusic'}</span>
            </div>

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
          padding: 16px;
        }
        .ymalarm-card {
          width: 100%;
          max-width: 430px;
          max-height: 90dvh;
          overflow-y: auto;
          border-radius: 22px;
          background: linear-gradient(160deg, rgba(20, 26, 40, 0.96), rgba(10, 14, 24, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
          padding: 18px;
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 14px;
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
          padding: 12px 14px;
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
          gap: 8px;
        }
        .ymalarm-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .ymalarm-label {
          font-size: 12px;
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
        .ymalarm-track-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 170px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .ymalarm-track-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 11px;
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
          font-size: 13px;
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
          font-size: 13px;
          color: #e2e8f0;
          cursor: pointer;
        }
        .ymalarm-tip {
          font-size: 11.5px;
          line-height: 1.45;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 9px 11px;
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
          max-width: 390px;
          border-radius: 26px;
          padding: 28px 22px;
          background: rgba(14, 19, 32, 0.92);
          border: 1px solid rgba(245, 158, 11, 0.45);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 16px;
          color: #f8fafc;
        }
        .ymalarm-ring-icon {
          width: 68px;
          height: 68px;
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
          font-size: 48px;
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
        .ymalarm-ring-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 6px;
        }
        .ymalarm-ring-snooze {
          width: 100%;
          padding: 14px;
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
          padding: 14px;
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
          padding: 11px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </>
  );
};
