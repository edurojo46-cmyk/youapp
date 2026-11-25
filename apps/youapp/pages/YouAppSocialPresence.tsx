import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../packages/auth/index.ts';
import { TvUserSessionMenu, goYouAppRoute } from '../../../src/components/tv/TvUserSessionMenu.tsx';
import { YouAppOfficialLogo } from '../../../src/components/ui/YouAppOfficialLogo.tsx';
import { SOCIAL_NETWORKS, emptyDraft, parseDraft, saveDraft, storageKey, profileText } from './socialPresenceModel.ts';
import type { PresenceDraft, NetworkId, PlanChoice } from './socialPresenceModel.ts';
import './YouAppSocialPresence.css';
import { presenceDeadline } from './presenceTimeout.ts';
import { loadCloudPresence, saveCloudPresence } from './cloudPresenceStore.ts';
import { googleAuthAvailability } from './googleAuthAvailability.ts';

export interface ConnectedPublisherAccount {
  id: string;
  platform: string;
  display_name: string;
  username?: string | null;
  ready: boolean;
  protected?: boolean;
  reason?: string;
  profileUrl?: string;
}

interface CandidateAccount {
  id: string;
  externalId: string;
  platform: string;
  name: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  pageId?: string | null;
  pageName?: string | null;
  protected: boolean;
  alreadyConnected: boolean;
}

const HUB_NETWORKS = [
  ...SOCIAL_NETWORKS,
  { id: 'telegram', name: 'Telegram', mark: '✈', color: '#0284c7', url: 'https://t.me/', requirement: 'Canal o grupo donde agregues el bot oficial de YOUAPP como administrador.' }
] as const;

type ManualTabId = 'resumen' | 'meta' | 'youtube' | 'tiktok' | 'x' | 'telegram' | 'publicar';

interface ManualSectionData {
  id: ManualTabId;
  label: string;
  title: string;
  prerequisite: string;
  steps: { heading: string; detail: string }[];
  tip: string;
}

const MANUAL_SECTIONS: ManualSectionData[] = [
  {
    id: 'resumen',
    label: 'Resumen (3 pasos)',
    title: 'Cómo conectar todas tus redes en menos de 2 minutos',
    prerequisite: 'Solo necesitás entrar con tu correo a YOUAPP. Nunca pedimos contraseñas de tus redes y cada usuario tiene su propio espacio privado y aislado.',
    steps: [
      {
        heading: '1. Entrá a tu cuenta YOUAPP',
        detail: 'Registrate o iniciá sesión con tu correo y contraseña (o Continuar con Google). Desde ese único ingreso administrás tu canal.'
      },
      {
        heading: '2. Conectá cada red una sola vez en 1 clic',
        detail: 'Tocá «Conectar» en cada red (o usá «⚡ Conectar pendientes paso a paso»). Se abre una ventana oficial para dar permiso. Si administrás varias páginas o canales, elegís solo el de tu marca; tus perfiles personales permanecen protegidos.'
      },
      {
        heading: '3. Publicá tus videos en todas a la vez',
        detail: 'Cuando veas tus redes en 🟢 Conectada, entrá al Publicador 1-Clic, subí tu MP4 una sola vez y YOUAPP se encarga de enviarlo a todas las redes elegidas.'
      }
    ],
    tip: 'La conexión se hace una sola vez: YOUAPP renueva los permisos automáticamente en segundo plano para que no tengas que volver a autorizar todos los días.'
  },
  {
    id: 'meta',
    label: 'Facebook + Instagram',
    title: 'Conectar Facebook e Instagram juntos en 1 solo paso',
    prerequisite: 'Necesitás tener creada una Página de Facebook (no perfil personal). Para sumar Instagram, tu cuenta de Instagram debe estar en modo Profesional o Creador vinculada a esa Página (si todavía no lo está, la ventana de Meta te guía para vincularla en el acto).',
    steps: [
      {
        heading: '1. Abrí la autorización de Meta',
        detail: 'En la tarjeta de Facebook o de Instagram, tocá «Conectar con Meta (1 clic)».'
      },
      {
        heading: '2. Elegí tus páginas en la ventana de Facebook',
        detail: 'Tocá «Continuar» y seleccioná las Páginas de tu canal (y los Instagram asociados). No hace falta que marques tu perfil personal.'
      },
      {
        heading: '3. Tildá tus destinos en YOUAPP',
        detail: 'Al cerrarse la ventana emergente, aparece una lista limpia en pantalla: tildá las páginas e Instagram de tu señal y tocá «Conectar cuentas elegidas». Quedan ambas en 🟢 Conectada.'
      }
    ],
    tip: 'Si agregás una nueva Página o cuenta profesional más adelante, tocá «Cambiar cuenta / elegir página» para sumarla sin desconectar las anteriores.'
  },
  {
    id: 'youtube',
    label: 'YouTube',
    title: 'Conectar uno o varios canales de YouTube',
    prerequisite: 'Tener creado tu canal de YouTube dentro de tu Cuenta de Google.',
    steps: [
      {
        heading: '1. Iniciá la conexión con Google',
        detail: 'En la tarjeta de YouTube tocá «Conectar YouTube (1 clic)» (o «+ Sumar otro canal de YouTube» si ya tenés uno vinculado).'
      },
      {
        heading: '2. Elegí el canal de tu marca',
        detail: 'Google te muestra la lista de tus canales o Cuentas de marca. Tocá el canal que querés conectar (cuidando no elegir tu cuenta personal) y aceptá los permisos.'
      },
      {
        heading: '3. Conexión automática',
        detail: 'Apenas se cierra la ventana de Google, el canal queda guardado en 🟢 Conectada automáticamente, listo para publicar.'
      }
    ],
    tip: 'Google deja autorizar de a 1 canal por vez. Si manejás varios canales temáticos, solo tocá «+ Sumar otro canal de YouTube» una vez por cada canal nuevo.'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    title: 'Conectar tu cuenta de TikTok',
    prerequisite: 'Iniciá sesión en tiktok.com dentro de este mismo navegador con la cuenta de tu canal (no con tu cuenta personal) antes de empezar.',
    steps: [
      {
        heading: '1. Tocá «Conectar TikTok (1 clic)»',
        detail: 'Se abrirá una ventana emergente oficial de TikTok.'
      },
      {
        heading: '2. Verificá el @usuario arriba y autorizá',
        detail: 'Confirmá que arriba figure la cuenta del canal y tocá «Autorizar / Continuar».'
      },
      {
        heading: '3. Listo en segundos',
        detail: 'La ventana se cierra sola y tu cuenta queda en 🟢 Conectada. Al publicar desde YOUAPP, el video llega directo a tu cuenta de TikTok.'
      }
    ],
    tip: 'Si la app está en etapa de prueba o revisión, el video llega listo a tu Bandeja de entrada de TikTok (Notificaciones del sistema) para que toques Publicar en 1 segundo.'
  },
  {
    id: 'x',
    label: 'X (Gratis $0)',
    title: 'Vincular X en Modo Gratis 1-Clic ($0 costo)',
    prerequisite: 'X cobra tarifa paga por su sistema automático de subida de videos; por eso YOUAPP incluye Modo Gratis 1-Clic sin pedirte tarjeta ni llaves técnicas.',
    steps: [
      {
        heading: '1. Escribí el @usuario de tu canal',
        detail: 'Tocá «Vincular @usuario X (Gratis)», ingresá el usuario de tu marca (máximo 15 caracteres, sin cuenta personal) y guardá.'
      },
      {
        heading: '2. Publicá gratis desde el Publicador',
        detail: 'Cada vez que emitís un video en YOUAPP, te queda listo un botón directo que abre x.com con el título, descripción y enlace del video ya redactados para tocar Postear en 1 clic.'
      }
    ],
    tip: 'Al elegir Modo Gratis 1-Clic te asegurás $0 de gasto en API de X manteniendo tu perfil visible y activo dentro del Publicador.'
  },
  {
    id: 'telegram',
    label: 'Telegram',
    title: 'Conectar tu canal de Telegram en 1 paso',
    prerequisite: 'Tener un canal público o privado creado en Telegram donde seas administrador.',
    steps: [
      {
        heading: '1. Abrí el asistente de Telegram en YOUAPP',
        detail: 'Tocá «Conectar Canal Telegram» en la tarjeta correspondiente.'
      },
      {
        heading: '2. Agregá el bot oficial de YOUAPP como administrador',
        detail: 'Tocá «Abrir Telegram y agregar bot a mi canal», elegí tu canal en Telegram y confirmá darle permiso de administrador.'
      },
      {
        heading: '3. Verificá con tu @canal',
        detail: 'Volvé a YOUAPP, escribí el @nombre (o ID -100...) de tu canal y tocá «Verificar y conectar» → pasa a 🟢 Conectada.'
      }
    ],
    tip: 'No necesitás crear ningún bot técnico en @BotFather ni copiar tokens: el bot oficial de YOUAPP se encarga de todo.'
  },
  {
    id: 'publicar',
    label: 'Publicar video',
    title: 'Cómo emitir tu video en todas tus redes a la vez',
    prerequisite: 'Tener al menos una red en 🟢 Conectada.',
    steps: [
      {
        heading: '1. Entrá al Publicador 1-Clic',
        detail: 'Tocá «🚀 Ir al Publicador 1-Clic →» arriba del panel de redes.'
      },
      {
        heading: '2. Cargá tu video MP4 y un solo texto',
        detail: 'Seleccioná tu video (o elegí uno de tu nube privada), escribí el título y descripción una sola vez y tildá todas las redes conectadas donde quieras enviarlo.'
      },
      {
        heading: '3. Confirmá y seguí el progreso en vivo',
        detail: 'Tocá «Publicar». YOUAPP adapta automáticamente el video si hace falta (por ejemplo a formato vertical 9:16 para Reels) y te muestra el enlace directo apenas queda confirmado en cada red.'
      }
    ],
    tip: 'Cada envío es independiente: si ya publicaste en una red, YOUAPP protege esa publicación para que nunca se duplique por error.'
  }
];

function manualTabForNetwork(networkId: string): ManualTabId {
  if (networkId === 'facebook' || networkId === 'instagram') return 'meta';
  if (networkId === 'youtube' || networkId === 'tiktok' || networkId === 'x' || networkId === 'telegram') return networkId;
  return 'resumen';
}

export default function YouAppSocialPresence() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedPublisherAccount[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState('@atlas_bcast_99f8ea_bot');
  const [fallbackPopupUrl, setFallbackPopupUrl] = useState<{ platform: string; url: string } | null>(null);
  const [selectorModal, setSelectorModal] = useState<{ sessionPlatform: string; candidates: CandidateAccount[] } | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [telegramModal, setTelegramModal] = useState(false);
  const [tgChannel, setTgChannel] = useState('');
  const [tgBotToken, setTgBotToken] = useState('');
  const [xModal, setXModal] = useState(false);
  const [xHandle, setXHandle] = useState('');
  const [isRecordingDemo, setIsRecordingDemo] = useState(false);
  const [demoSeconds, setDemoSeconds] = useState(0);
  const [demoPublisherOpen, setDemoPublisherOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTab, setManualTab] = useState<ManualTabId>('resumen');
  function openManualFor(tab: ManualTabId) {
    setManualTab(tab);
    setManualOpen(true);
  }
  const popupCleanupRef = useRef<(() => void) | null>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; timer: number } | null>(null);
  const [googleReady, setGoogleReady] = useState<boolean | null | 'checking'>('checking');
  useEffect(() => { let alive = true; googleAuthAvailability().then(value => { if (alive) setGoogleReady(value); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!isRecordingDemo) return;
    const prev = document.title;
    document.title = 'YouApp TV — Official Creator Platform (youapptv.com)';
    return () => { document.title = prev; };
  }, [isRecordingDemo]);
  useEffect(() => () => {
    if (popupCleanupRef.current) popupCleanupRef.current();
    if (recorderRef.current) {
      window.clearInterval(recorderRef.current.timer);
      try { if (recorderRef.current.recorder.state !== 'inactive') recorderRef.current.recorder.stop(); } catch {}
      recorderRef.current.stream.getTracks().forEach(t => t.stop());
      recorderRef.current = null;
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const apply = (value: User | null, accessToken?: string | null) => {
      if (alive) {
        const validUser = value && !value.is_anonymous ? value : null;
        setUser(validUser);
        setToken(validUser ? (accessToken ?? null) : null);
        setReady(true);
      }
    };
    presenceDeadline(supabase.auth.getSession()).then(({ data, error }) => {
      if (error && alive) setMessage('No pudimos comprobar la sesión. Podés preparar tu borrador y volver a intentar.');
      apply(data.session?.user ?? null, data.session?.access_token ?? null);
    }).catch(() => { if (alive) setMessage('No pudimos comprobar tu sesión a tiempo. Podés usar el borrador y volver a entrar.'); apply(null, null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null, session?.access_token ?? null));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function refreshAccounts(activeToken = token) {
    if (!activeToken) { setConnectedAccounts([]); return; }
    try {
      const r = await fetch('/api/user/social/publisher/accounts', { headers: { Authorization: 'Bearer ' + activeToken } });
      if (r.ok) {
        const data = await r.json();
        if (data?.accounts) setConnectedAccounts(data.accounts);
      }
    } catch {}
  }

  useEffect(() => {
    if (!token) { setConnectedAccounts([]); return; }
    let alive = true;
    fetch('/api/user/social/publisher/accounts', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (alive && data?.accounts) setConnectedAccounts(data.accounts); })
      .catch(() => {});
    fetch('/api/user/social/publisher/express/catalog', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (alive && data?.telegramBotUsername) setTelegramBotUsername(data.telegramBotUsername); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  async function callUniversalConnect(body: Record<string, unknown>) {
    if (!token) throw new Error('Iniciá sesión en YOUAPP primero.');
    const r = await fetch('/api/user/social/publisher/express/universal-connect', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.error) throw new Error(d?.error || d?.message || 'No se pudo completar la conexión.');
    return d;
  }

  async function discoverCandidates(platform: string, forceSelector = false) {
    setConnectBusy(platform);
    try {
      const res = await callUniversalConnect({ action: 'discover_candidates', platform, forceSelector });
      if (res.autoBound) {
        await refreshAccounts();
        const names = (res.bound || []).map((b: any) => b.displayName || '@' + b.username).join(', ');
        setMessage(`🟢 Conectada automáticamente: ${names}`);
        return;
      }
      const list: CandidateAccount[] = Array.isArray(res.candidates) ? res.candidates : [];
      if (!list.length) {
        setMessage('Todavía no detectamos canales o páginas autorizadas para esa red. Probá volver a tocar Conectar.');
        return;
      }
      const preselected = list
        .filter(c => !c.protected && c.alreadyConnected)
        .map(c => c.id);
      const firstValid = list.find(c => !c.protected)?.id;
      setSelectedCandidateIds(preselected.length ? preselected : (firstValid ? [firstValid] : []));
      setSelectorModal({ sessionPlatform: res.sessionPlatform || platform, candidates: list });
    } catch (err: any) {
      setMessage(err?.message || 'No se pudieron consultar las cuentas de esta red.');
    } finally {
      setConnectBusy(null);
    }
  }

  async function startPopupConnect(platform: 'META' | 'YOUTUBE' | 'TIKTOK', forceSelector = false): Promise<boolean> {
    if (forceSelector) {
      await discoverCandidates(platform, true);
      return true;
    }
    setConnectBusy(platform);
    setFallbackPopupUrl(null);
    setMessage('');
    try {
      if (popupCleanupRef.current) { popupCleanupRef.current(); popupCleanupRef.current = null; }
      const res = await callUniversalConnect({ action: 'start_popup', platform });
      const popup = window.open(res.url, 'youapp_oauth_popup', 'width=560,height=720,menubar=no,toolbar=no');
      if (!popup) {
        setFallbackPopupUrl({ platform, url: res.url });
        setMessage('Tu navegador bloqueó la ventana emergente. Usá el botón «Abrir autorización» de abajo y luego «Ya autoricé».');
        setConnectBusy(null);
        return false;
      }
      return await new Promise<boolean>(resolve => {
        let settled = false;
        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          window.clearInterval(timer);
          if (popupCleanupRef.current === cleanup) popupCleanupRef.current = null;
        };
        const finish = async (errMsg?: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          try { if (!popup.closed) popup.close(); } catch {}
          if (errMsg) {
            setMessage(`Autorización no completada: ${errMsg}`);
            setConnectBusy(null);
            resolve(false);
            return;
          }
          await discoverCandidates(platform, false);
          resolve(true);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'YOUAPP_OAUTH_POPUP_DONE') {
            void finish(event.data?.error ? String(event.data.error) : undefined);
          }
        };
        const timer = window.setInterval(() => {
          if (popup.closed) void finish();
        }, 1000);
        popupCleanupRef.current = cleanup;
        window.addEventListener('message', onMessage);
      });
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo iniciar la autorización.');
      setConnectBusy(null);
      return false;
    }
  }

  async function connectAllPendingWizard() {
    const isReady = (plat: string) => connectedAccounts.some(a => a.platform.toLowerCase() === plat && a.ready && !a.protected);
    const pending: ('META' | 'YOUTUBE' | 'TIKTOK')[] = [];
    if (!isReady('facebook') && !isReady('instagram')) pending.push('META');
    if (!isReady('youtube')) pending.push('YOUTUBE');
    if (!isReady('tiktok')) pending.push('TIKTOK');
    if (!pending.length) {
      setMessage('✅ Ya tenés Meta (Facebook/Instagram), YouTube y TikTok conectadas. Para sumar más señales de YouTube tocá «+ Sumar otro canal de YouTube».');
      return;
    }
    for (let i = 0; i < pending.length; i++) {
      setMessage(`Paso ${i + 1} de ${pending.length}: Autorizá ${pending[i]} en la ventana emergente…`);
      const ok = await startPopupConnect(pending[i], false);
      if (!ok) break;
    }
  }

  async function confirmBindCandidates() {
    if (!selectorModal) return;
    setConnectBusy(selectorModal.sessionPlatform);
    try {
      const res = await callUniversalConnect({
        action: 'bind_candidates',
        sessionPlatform: selectorModal.sessionPlatform,
        selectedIds: selectedCandidateIds
      });
      setSelectorModal(null);
      await refreshAccounts();
      setMessage(`🟢 ${res.message || 'Cuentas conectadas a tu usuario.'}`);
    } catch (err: any) {
      setMessage(err?.message || 'No se pudieron vincular las cuentas seleccionadas.');
    } finally {
      setConnectBusy(null);
    }
  }

  async function disconnectProfile(profileId: string, label: string) {
    setConnectBusy(profileId);
    try {
      await callUniversalConnect({ action: 'disconnect_profile', profileId });
      await refreshAccounts();
      setMessage(`Se desconectó ${label} de tu espacio YOUAPP.`);
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo desconectar el perfil.');
    } finally {
      setConnectBusy(null);
    }
  }

  async function submitTelegram(event: React.FormEvent) {
    event.preventDefault();
    setConnectBusy('TELEGRAM');
    try {
      const res = await callUniversalConnect({
        action: 'connect_telegram',
        channelId: tgChannel,
        ...(tgBotToken.trim() ? { botToken: tgBotToken.trim() } : {})
      });
      setTelegramModal(false);
      setTgChannel('');
      setTgBotToken('');
      await refreshAccounts();
      setMessage(`🟢 Canal conectado: ${res.displayName || 'Telegram'}`);
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo conectar el canal de Telegram.');
    } finally {
      setConnectBusy(null);
    }
  }

  async function submitXHandle(event: React.FormEvent) {
    event.preventDefault();
    setConnectBusy('X');
    try {
      const res = await callUniversalConnect({ platform: 'X', username: xHandle });
      setXModal(false);
      setXHandle('');
      await refreshAccounts();
      setMessage(res.message || 'Perfil de X vinculado.');
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo vincular la cuenta de X.');
    } finally {
      setConnectBusy(null);
    }
  }

  function stopDemoRecording() {
    const active = recorderRef.current;
    if (!active) return;
    window.clearInterval(active.timer);
    try {
      if (active.recorder.state !== 'inactive') active.recorder.stop();
    } catch {}
    active.stream.getTracks().forEach(t => t.stop());
    recorderRef.current = null;
  }

  async function startDemoRecording() {
    if (isRecordingDemo || !navigator.mediaDevices?.getDisplayMedia) {
      setMessage('Este navegador no permite grabar la pantalla desde la web.');
      return;
    }
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: false
      });
      const mimeCandidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm'
      ];
      const chosenMime = mimeCandidates.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';
      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const current = recorderRef.current;
        if (current) {
          window.clearInterval(current.timer);
          current.stream.getTracks().forEach(t => t.stop());
          recorderRef.current = null;
        }
        const blob = new Blob(chunks, { type: chosenMime || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'youapptv-tiktok-demo.mp4';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        setIsRecordingDemo(false);
        setDemoPublisherOpen(false);
        setMessage('✅ Video descargado como «youapptv-tiktok-demo.mp4» en tu carpeta Descargas. Ya podés subirlo en el botón Upload de TikTok.');
      };
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = () => stopDemoRecording();

      setDemoSeconds(0);
      setIsRecordingDemo(true);
      const timer = window.setInterval(() => setDemoSeconds(s => s + 1), 1000);
      recorderRef.current = { recorder, stream, timer };
      recorder.start(1000);
    } catch {
      setIsRecordingDemo(false);
      setMessage('Se canceló la selección de pantalla para grabar el video de demo.');
    }
  }

  function downloadAppIcon1024() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
    bg.addColorStop(0, '#070b19');
    bg.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 1024);

    // Centered glowing rounded emblem
    const rx = 252, ry = 170, rw = 520, rh = 380, r = 84;
    const emblemGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
    emblemGrad.addColorStop(0, '#2563eb');
    emblemGrad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = emblemGrad;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    ctx.fill();

    // White play symbol inside emblem
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(446, 274);
    ctx.lineTo(626, 360);
    ctx.lineTo(446, 446);
    ctx.closePath();
    ctx.fill();

    // Brand typography
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 132px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('YouApp TV', 512, 705);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '600 54px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('youapptv.com', 512, 800);

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'youapptv-icon-1024.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage('✅ Icono descargado como «youapptv-icon-1024.png» (1024×1024 PNG) en tu carpeta Descargas. Subilo en App icon * de TikTok.');
    }, 'image/png');
  }

  async function googleLogin() {
    if (googleReady === false || googleReady === 'checking') return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/redes', window.location.origin).href, queryParams: { prompt: 'select_account' } }
      });
      if (error) throw error;
    } catch {
      setMessage('No se pudo iniciar Google. Revisá que Google esté habilitado y que esta dirección de retorno esté autorizada en la configuración de YOUAPP.');
    } finally { setBusy(false); }
  }
  const readyCount = connectedAccounts.filter(a => a.ready && !a.protected).length;
  return <main className="yp-presence">
    {isRecordingDemo && (
      <div
        role="region"
        aria-label="Grabación Demo TikTok"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          background: '#0f172a',
          color: '#fff',
          padding: '12px 20px',
          margin: '0 -24px 16px -24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          borderBottom: '3px solid #ef4444',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ background: '#1e293b', border: '1px solid #38bdf8', color: '#7dd3fc', padding: '4px 10px', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>
            YouApp TV · https://youapptv.com
          </span>
          <strong style={{ color: '#f87171', fontSize: 14 }}>🔴 Grabando Demo ({demoSeconds}s)</strong>
          <span style={{ fontSize: 13, color: '#e2e8f0' }}>
            1) Tocá «Reconectar TikTok» y aceptá → 2) Tocá «🚀 Ir al Publicador 1-Clic» → 3) Tocá «Terminar y descargar MP4»
          </span>
        </div>
        <button
          type="button"
          onClick={stopDemoRecording}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 0,
            borderRadius: 10,
            padding: '10px 16px',
            fontWeight: 700,
            whiteSpace: 'nowrap'
          }}
        >
          ⏹ Terminar y descargar MP4
        </button>
      </div>
    )}
    <div className="yp-wrap">
      <header className="yp-header" style={{ position: 'relative', zIndex: 70, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <YouAppOfficialLogo theme="light" />
          <nav aria-label="Navegación YOUAPP" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', padding: '4px 2px' }}>Inicio</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/mitv')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', padding: '4px 2px' }}>MiTV</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/misenal1')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', padding: '4px 2px' }}>Mi Señal 1</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/search')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', padding: '4px 2px' }}>Buscar</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/redes')} style={{ background: 'none', border: 0, borderBottom: '2px solid #2563eb', fontSize: 13, fontWeight: 700, color: '#2563eb', cursor: 'pointer', padding: '4px 2px' }}>Mis Redes</button>
            <button type="button" onClick={() => goYouAppRoute(navigate, '/publicador')} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', padding: '4px 2px' }}>Publicador</button>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="yp-secondary" onClick={() => openManualFor('resumen')}>📖 Manual paso a paso</button>
          <Link className="yp-primary" to="/publicador" onClick={e => { if (isRecordingDemo) { e.preventDefault(); setDemoPublisherOpen(true); } }} style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>Publicar un video →</Link>
          <span className="yp-pill">{readyCount > 0 ? `🟢 ${readyCount} redes conectadas` : 'Listas para conectar en 1 clic'}</span>
          <TvUserSessionMenu />
        </div>
      </header>
      <section className="yp-hero">
        <div><p className="yp-eyebrow">TU IDENTIDAD, EN TODAS TUS REDES</p><h1>Un lugar para empezar.<br />Todas tus redes por delante.</h1>
          <p>Creá tu cuenta YOUAPP con correo, prepará tu marca una vez y continuá en cada plataforma.</p></div>
        <div className="yp-orbit" aria-hidden="true">{SOCIAL_NETWORKS.map(n => <span key={n.id} style={{ color: n.color }}>{n.mark}</span>)}</div>
      </section>
      <section className="yp-section" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }} aria-labelledby="yp-quick-guide-title">
        <div className="yp-section-title" style={{ marginBottom: 14 }}>
          <div>
            <small style={{ color: '#2563eb', fontWeight: 700 }}>GUÍA RÁPIDA EN 3 PASOS</small>
            <h2 id="yp-quick-guide-title">¿Cómo conecto mis redes si es mi primera vez?</h2>
            <p>Todo se autoriza con ventanas oficiales en 1 clic. Tus datos y contraseñas nunca salen de cada plataforma.</p>
          </div>
          <button type="button" className="yp-secondary" onClick={() => openManualFor('resumen')}>📖 Ver manual detallado red por red →</button>
        </div>
        <div className="yp-networks">
          <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
            <strong style={{ color: '#1d4ed8', fontSize: 13 }}>Paso 1 · Tu cuenta YOUAPP</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>Entrá con tu correo abajo. Ese usuario guarda bajo llave solo tus propias redes, separado del resto.</p>
          </div>
          <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
            <strong style={{ color: '#1d4ed8', fontSize: 13 }}>Paso 2 · Conectá cada red (1 clic)</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>Tocá «Conectar», aceptá la ventana oficial y elegí tu página o canal. Se hace una sola vez y no vence.</p>
          </div>
          <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
            <strong style={{ color: '#1d4ed8', fontSize: 13 }}>Paso 3 · Publicá desde el Studio</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>Con tus redes en 🟢 Conectada, subís un MP4 y sale a YouTube, Instagram, Facebook, TikTok, Telegram y X.</p>
          </div>
        </div>
      </section>
      <section className="yp-login" aria-labelledby="yp-account">
        <div><small>PASO 01</small><h2 id="yp-account">Tu cuenta YOUAPP</h2>
          <p>{!ready ? 'Comprobando tu sesión…' : user ? 'Sesión iniciada. Con este único login de YOUAPP administrás todas tus redes conectadas de forma independiente.' : 'Entrá con correo y contraseña. Después autorizarás cada red por separado.'}</p></div>
        {ready && (user ? <div className="yp-session"><strong>{user.user_metadata?.full_name || user.email || 'Usuario YOUAPP'}</strong><span>Sesión YOUAPP activa</span></div> :
          <div className="yp-access"><Link className="yp-primary" to="/redes/acceso">Entrar o crear mi cuenta</Link><button className="yp-google" onClick={googleLogin} disabled={busy || googleReady === false || googleReady === 'checking'}>{googleReady === 'checking' ? 'Comprobando Google…' : googleReady === false ? 'Google pendiente de habilitación' : busy ? 'Abriendo Google…' : 'Continuar con Google'}</button></div>)}
      </section>
      {user && (
        <section className="yp-section" style={{ border: '2px solid #22c55e', background: '#f0fdf4' }}>
          <div className="yp-section-title">
            <div>
              <small style={{ color: '#15803d', fontWeight: 700 }}>CONEXIÓN 1-CLIC · SIN CLAVES NI DESARROLLO</small>
              <h2>Conectá tus redes a tu cuenta YOUAPP ({user.email})</h2>
              <p>Autorizá cada red en una ventana rápida. Si tenés varias páginas o canales, elegís exactamente cuál conectar a esta señal.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="yp-secondary"
                onClick={() => openManualFor('resumen')}
              >📖 Manual paso a paso</button>
              <button
                type="button"
                className="yp-secondary"
                disabled={connectBusy !== null}
                onClick={connectAllPendingWizard}
              >⚡ Conectar pendientes paso a paso</button>
              <Link
                className="yp-primary"
                to="/publicador"
                style={{ background: '#16a34a' }}
                onClick={e => { if (isRecordingDemo) { e.preventDefault(); setDemoPublisherOpen(true); } }}
              >🚀 Ir al Publicador 1-Clic →</Link>
            </div>
          </div>
          {fallbackPopupUrl && (
            <div className="yp-notice" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <span>Ventana bloqueada por el navegador:</span>
              <a className="yp-primary yp-official-link" href={fallbackPopupUrl.url} target="_blank" rel="noopener noreferrer">Abrir autorización ↗</a>
              <button type="button" className="yp-secondary" onClick={() => discoverCandidates(fallbackPopupUrl.platform, false)}>Ya autoricé, detectar cuentas</button>
            </div>
          )}
          <div className="yp-networks">
            {HUB_NETWORKS.map(n => {
              const linkedList = connectedAccounts.filter(a => a.platform.toLowerCase() === n.id.toLowerCase() && !a.protected);
              const activeList = linkedList.filter(a => a.ready);
              const popupPlat: 'META' | 'YOUTUBE' | 'TIKTOK' | null =
                n.id === 'facebook' || n.id === 'instagram' ? 'META' :
                n.id === 'youtube' ? 'YOUTUBE' :
                n.id === 'tiktok' ? 'TIKTOK' : null;
              const isMeta = popupPlat === 'META';
              return (
                <article className="yp-network" key={'hub-' + n.id} style={{ borderColor: activeList.length ? '#86efac' : '#e2e8f0', background: '#fff' }}>
                  <div className="yp-network-heading">
                    <span className="yp-network-mark" style={{ color: n.color }}>{n.mark}</span>
                    <h3>{n.name}</h3>
                  </div>
                  {linkedList.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {linkedList.map(linked => (
                        <div key={linked.id} style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontWeight: 700, color: '#0f172a', margin: 0, fontSize: 13 }}>{linked.display_name}</p>
                          <span className="yp-status" style={{ background: linked.ready ? '#dcfce7' : '#fef3c7', color: linked.ready ? '#166534' : '#92400e', fontWeight: 700 }}>
                            {linked.ready ? (n.id === 'x' ? '🟢 Modo Gratis 1-Clic · Lista para publicar' : '🟢 Conectada · Lista para publicar') : (linked.reason || '🟡 Requiere reconexión')}
                          </span>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="yp-secondary"
                              disabled={connectBusy !== null}
                              onClick={() => disconnectProfile(linked.id, linked.display_name)}
                              style={{ padding: '5px 9px', fontSize: 12 }}
                            >Desconectar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p className="yp-requirement">{n.requirement}</p>
                      <span className="yp-status">⚪ Sin conectar</span>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {popupPlat && (
                      <button
                        type="button"
                        className="yp-primary"
                        disabled={connectBusy !== null}
                        onClick={() => startPopupConnect(popupPlat, false)}
                        style={{ padding: '9px 13px', fontSize: 13 }}
                      >
                        {connectBusy === popupPlat ? 'Conectando…' : isMeta ? (linkedList.length ? 'Reautorizar con Meta (1 clic)' : 'Conectar con Meta (1 clic)') : linkedList.length ? (n.id === 'youtube' ? '+ Sumar otro canal de YouTube' : `Reconectar ${n.name}`) : `Conectar ${n.name} (1 clic)`}
                      </button>
                    )}
                    {popupPlat && linkedList.length > 0 && (
                      <button
                        type="button"
                        className="yp-secondary"
                        disabled={connectBusy !== null}
                        onClick={() => startPopupConnect(popupPlat, true)}
                      >Cambiar cuenta / elegir página</button>
                    )}
                    {n.id === 'telegram' && (
                      <button
                        type="button"
                        className="yp-primary"
                        disabled={connectBusy !== null}
                        onClick={() => setTelegramModal(true)}
                        style={{ padding: '9px 13px', fontSize: 13 }}
                      >{linkedList.length ? 'Agregar otro canal' : 'Conectar Canal Telegram'}</button>
                    )}
                    {n.id === 'x' && (
                      <button
                        type="button"
                        className="yp-secondary"
                        disabled={connectBusy !== null}
                        onClick={() => setXModal(true)}
                      >{linkedList.length ? 'Cambiar @usuario X' : 'Vincular @usuario X (Gratis)'}</button>
                    )}
                    <button
                      type="button"
                      className="yp-secondary"
                      onClick={() => openManualFor(manualTabForNetwork(n.id))}
                      style={{ fontSize: 12 }}
                    >❓ Cómo conectar</button>
                  </div>
                </article>
              );
            })}
          </div>
          <details style={{ marginTop: 16, fontSize: 12, color: '#475569' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Herramientas de verificación (solo administrador)</summary>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              {!isRecordingDemo && (
                <button
                  type="button"
                  className="yp-secondary"
                  disabled={connectBusy !== null}
                  onClick={startDemoRecording}
                >🎥 Grabar Demo TikTok</button>
              )}
              <button
                type="button"
                className="yp-secondary"
                disabled={connectBusy !== null}
                onClick={downloadAppIcon1024}
              >🖼️ Descargar Icono 1024×1024</button>
            </div>
          </details>
        </section>
      )}

      {selectorModal && (
        <div className="yp-modal-backdrop">
          <section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-selector-title">
            <button type="button" className="yp-close" aria-label="Cerrar selector" onClick={() => setSelectorModal(null)}>×</button>
            <small>SELECTOR DE CANAL / PÁGINA</small>
            <h2 id="yp-selector-title">Elegí qué cuentas conectar a tu usuario YOUAPP</h2>
            <p>Las cuentas personales o de otros proyectos permanecen protegidas y bloqueadas automáticamente.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '18px 0' }}>
              {selectorModal.candidates.map(cand => {
                const checked = selectedCandidateIds.includes(cand.id);
                return (
                  <label
                    key={cand.id}
                    className="yp-confirm"
                    style={{
                      margin: 0,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid ' + (cand.protected ? '#fecaca' : checked ? '#2563eb' : '#e2e8f0'),
                      background: cand.protected ? '#fef2f2' : '#f8fafc',
                      gap: 12,
                      alignItems: 'center',
                      cursor: cand.protected ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={cand.protected}
                      checked={!cand.protected && checked}
                      onChange={e => {
                        if (cand.protected) return;
                        setSelectedCandidateIds(prev => e.target.checked ? [...new Set([...prev, cand.id])] : prev.filter(x => x !== cand.id));
                      }}
                    />
                    {cand.avatarUrl && <img src={cand.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                        {cand.platform} · {cand.displayName}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {cand.username ? `@${cand.username}` : cand.externalId}
                        {cand.pageName && cand.platform === 'INSTAGRAM' ? ` · vinculada a «${cand.pageName}»` : ''}
                      </div>
                    </div>
                    <span className="yp-status" style={{ background: cand.protected ? '#fee2e2' : cand.alreadyConnected ? '#dcfce7' : '#e0f2fe', color: cand.protected ? '#991b1b' : cand.alreadyConnected ? '#166534' : '#075985' }}>
                      {cand.protected ? '🛡️ Protegida' : cand.alreadyConnected ? '🟢 Ya vinculada' : 'Disponible'}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="yp-secondary" onClick={() => setSelectorModal(null)}>Cancelar</button>
              <button
                type="button"
                className="yp-primary"
                disabled={connectBusy !== null || !selectedCandidateIds.length}
                onClick={confirmBindCandidates}
              >{connectBusy ? 'Conectando…' : `Conectar cuentas elegidas (${selectedCandidateIds.length})`}</button>
            </div>
          </section>
        </div>
      )}

      {telegramModal && (
        <div className="yp-modal-backdrop">
          <section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-tg-title">
            <button type="button" className="yp-close" aria-label="Cerrar Telegram" onClick={() => setTelegramModal(false)}>×</button>
            <small>TELEGRAM EN 1 PASO</small>
            <h2 id="yp-tg-title">Conectar tu Canal de Telegram</h2>
            <p>1. Agregá al bot oficial <strong>{telegramBotUsername}</strong> como administrador en tu canal de Telegram.</p>
            <p style={{ marginTop: 8 }}>
              <a className="yp-secondary yp-official-link" href={`https://t.me/${telegramBotUsername.replace(/^@/, '')}?startchannel=true`} target="_blank" rel="noopener noreferrer">
                Abrir Telegram y agregar bot a mi canal ↗
              </a>
            </p>
            <form onSubmit={submitTelegram} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <label>
                2. Ingresá el @canal o ID de tu canal
                <input required value={tgChannel} onChange={e => setTgChannel(e.target.value)} placeholder="@mi_canal_tv o -1001234567890" />
              </label>
              <details style={{ fontSize: 12, color: '#64748b' }}>
                <summary style={{ cursor: 'pointer' }}>Avanzado: usar un Bot Token propio de @BotFather (opcional)</summary>
                <label style={{ marginTop: 8 }}>
                  Bot Token
                  <input value={tgBotToken} onChange={e => setTgBotToken(e.target.value)} placeholder="Dejá vacío para usar el bot oficial de YOUAPP" />
                </label>
              </details>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="yp-secondary" onClick={() => setTelegramModal(false)}>Cancelar</button>
                <button type="submit" className="yp-primary" disabled={connectBusy === 'TELEGRAM'}>{connectBusy === 'TELEGRAM' ? 'Verificando…' : 'Verificar y conectar'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {xModal && (
        <div className="yp-modal-backdrop">
          <section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-x-title">
            <button type="button" className="yp-close" aria-label="Cerrar X" onClick={() => setXModal(false)}>×</button>
            <small>X (TWITTER)</small>
            <h2 id="yp-x-title">Vincular tu cuenta temática de X</h2>
            <p>Indicá tu @usuario temático para registrarlo en tu espacio YOUAPP (X aplica API paga para subida automática, por lo que desde el publicador podés postear en 1 clic asistido).</p>
            <form onSubmit={submitXHandle} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <label>
                @usuario de X (máx. 15 caracteres, sin cuenta personal)
                <input required maxLength={20} value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="@actualidad_tv" />
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="yp-secondary" onClick={() => setXModal(false)}>Cancelar</button>
                <button type="submit" className="yp-primary" disabled={connectBusy === 'X'}>{connectBusy === 'X' ? 'Guardando…' : 'Vincular @usuario'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {demoPublisherOpen && (
        <div className="yp-modal-backdrop">
          <section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-demo-pub-title" style={{ maxWidth: '1040px', width: '95vw' }}>
            <button type="button" className="yp-close" aria-label="Cerrar Publicador" onClick={() => setDemoPublisherOpen(false)}>×</button>
            <small>YOUAPP TV · HTTPS://YOUAPPTV.COM</small>
            <h2 id="yp-demo-pub-title">YouApp TV — Studio Publicador (youapptv.com)</h2>
            <iframe
              src="/publicador.html"
              title="YouApp TV Publisher Studio"
              style={{ width: '100%', height: '72vh', border: 0, borderRadius: 12, marginTop: 10, background: '#f5f5f7' }}
            />
          </section>
        </div>
      )}

      {manualOpen && (() => {
        const current = MANUAL_SECTIONS.find(s => s.id === manualTab) || MANUAL_SECTIONS[0];
        return (
          <div className="yp-modal-backdrop">
            <section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-manual-title" style={{ maxWidth: '720px', width: '95vw' }}>
              <button type="button" className="yp-close" aria-label="Cerrar manual" onClick={() => setManualOpen(false)}>×</button>
              <small>GUÍA DE USUARIO YOUAPP TV</small>
              <h2 id="yp-manual-title">Manual de Conexión Paso a Paso</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 18px' }}>
                {MANUAL_SECTIONS.map(sec => {
                  const active = sec.id === current.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setManualTab(sec.id)}
                      className={active ? 'yp-primary' : 'yp-secondary'}
                      style={{ padding: '7px 11px', fontSize: 12 }}
                    >{sec.label}</button>
                  );
                })}
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 13, marginBottom: 14 }}>
                <strong>Antes de empezar: </strong>{current.prerequisite}
                {current.id === 'telegram' && (
                  <span> Bot oficial de YOUAPP: <strong>{telegramBotUsername}</strong>.</span>
                )}
              </div>
              <h3 style={{ margin: '0 0 10px', fontSize: 17, color: '#0f172a' }}>{current.title}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {current.steps.map(st => (
                  <div key={st.heading} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{st.heading}</div>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>{st.detail}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 12.5 }}>
                <strong>💡 Consejo: </strong>{current.tip}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                {current.id === 'publicar' ? (
                  <Link className="yp-primary" to="/publicador" onClick={() => setManualOpen(false)}>🚀 Ir al Publicador 1-Clic →</Link>
                ) : (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Cerrá esta guía para tocar el botón de conexión en tu tarjeta.</span>
                )}
                <button type="button" className="yp-secondary" onClick={() => setManualOpen(false)}>Entendido, cerrar manual</button>
              </div>
            </section>
          </div>
        );
      })()}

      {!user && googleReady === false && <p className="yp-notice" role="status">Podés registrarte y entrar con correo y contraseña. Google es una opción adicional que todavía no está habilitada.</p>}
      {message && <p className="yp-notice" role="alert">{message}</p>}
      {ready && <PresenceWorkspace key={user?.id || 'guest'} ownerId={user?.id || 'guest'} authenticated={!!user} connectedAccounts={connectedAccounts} />}
      <footer className="yp-footer">Cada red conserva su registro y sus autorizaciones. Tus perfiles personales permanecen separados de esta configuración.</footer>
    </div>
  </main>;
}

function PresenceWorkspace({ ownerId, authenticated, connectedAccounts = [] }: { ownerId: string; authenticated: boolean; connectedAccounts?: ConnectedPublisherAccount[] }) {
  const storage = {
    getItem: (key: string) => { try { return (authenticated ? localStorage : sessionStorage).getItem(key); } catch { return null; } },
    setItem: (key: string, value: string) => (authenticated ? localStorage : sessionStorage).setItem(key, value)
  };
  const [draft, setDraft] = useState<PresenceDraft>(() => {
    try { return parseDraft(storage.getItem(storageKey(ownerId)), ownerId); } catch { return emptyDraft(ownerId); }
  });
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<NetworkId | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [visitorDraft, setVisitorDraft] = useState<PresenceDraft | null>(() => {
    if (!authenticated) return null;
    try {
      const raw = sessionStorage.getItem(storageKey('guest'));
      return raw ? parseDraft(raw, 'guest') : null;
    } catch { return null; }
  });
  const editedRef = useRef(false);
  const [cloudAttempt, setCloudAttempt] = useState(0);
  const [cloudRevision, setCloudRevision] = useState<number | null>(null);
  const [cloudState, setCloudState] = useState<'loading' | 'ready' | 'unavailable'>(authenticated ? 'loading' : 'unavailable');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!authenticated) return;
    let alive = true;
    setCloudState('loading');
    presenceDeadline(loadCloudPresence(ownerId)).then(result => {
      if (!alive) return;
      if (result) {
        setCloudRevision(result.revision);
        if (!editedRef.current) setDraft(result.draft);
        else setMessage('Tu espacio privado está listo. Conservamos los cambios que estabas editando; guardalos cuando termines.');
      }
      setCloudState('ready');
    }).catch(() => { if (alive) { setCloudState('unavailable'); setMessage('No se pudo cargar la nube. Podés editar y guardar un borrador en este navegador, o reintentar la conexión.'); } });
    return () => { alive = false; };
  }, [ownerId, authenticated, cloudAttempt]);
  const selected = SOCIAL_NETWORKS.filter(n => draft.plans[n.id].choice !== 'later');
  function patch(fields: Partial<PresenceDraft>) { editedRef.current = true; setDraft(value => ({ ...value, ...fields })); setUnsaved(true); }
  function plan(id: NetworkId, fields: Partial<PresenceDraft['plans'][NetworkId]>) {
    editedRef.current = true;
    setDraft(value => ({ ...value, plans: { ...value.plans, [id]: { ...value.plans[id], ...fields } } })); setUnsaved(true);
  }
  async function persist() {
    setSaving(true); setMessage("Guardando tu configuración…");
    try {
      const saved = saveDraft(storage, draft); setDraft(saved); setUnsaved(false);
      if (authenticated && cloudState === 'ready') {
        try { setCloudRevision(await presenceDeadline(saveCloudPresence(saved, cloudRevision))); setMessage('Configuración privada guardada en la nube y en este navegador. Ninguna red fue conectada.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar en la nube. Tu borrador local se conserva.'); return false; }
      } else { setMessage('Borrador guardado solo en este navegador. Ninguna cuenta externa fue creada o conectada.'); }
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el borrador.'); return false; }
    finally { setSaving(false); }
  }
  async function copy(id: NetworkId) {
    try { await navigator.clipboard.writeText(profileText(draft, id)); setMessage('Nombre, usuario propuesto y descripción copiados.'); }
    catch { setMessage('No se pudo copiar. Seleccioná los datos de la vista previa para copiarlos manualmente.'); }
  }
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);
  return <fieldset className="yp-workspace" disabled={saving}>
    {authenticated && <p className="yp-notice" role="status">{cloudState === 'loading' ? 'Cargando tu espacio privado… Podés seguir editando mientras tanto.' : cloudState === 'ready' ? 'Espacio privado disponible. Solo tu usuario puede consultar o modificar estos datos.' : 'No se pudo conectar con la nube. El borrador local sigue disponible.'}</p>}
    {authenticated && cloudState === "unavailable" && <button type="button" className="yp-secondary" onClick={() => setCloudAttempt(value => value + 1)}>Reintentar conexión</button>}
    {message && <p className="yp-notice" role="status" aria-live="polite">{message}</p>}
    {!authenticated && <p className="yp-notice">Podés preparar un borrador sin iniciar sesión. Guardalo antes de entrar a tu cuenta; al volver podrás incorporarlo a tu cuenta. Se conserva solo durante esta sesión del navegador.</p>}
    {visitorDraft && <div className="yp-notice">Hay un borrador preparado antes de iniciar sesión.
      <button onClick={() => {
        patch({ ...visitorDraft, ownerId }); setVisitorDraft(null);
        setMessage('Borrador incorporado. Revisalo y guardá los cambios para este usuario.');
      }}>Incorporar borrador</button>
      <button onClick={() => setVisitorDraft(null)}>Seguir con mi configuración</button>
    </div>}
    <section className="yp-section">
      <div className="yp-section-title"><div><small>PASO 02</small><h2>Una identidad para tu proyecto</h2><p>Estos datos se preparan como propuesta; cada red puede pedir ajustes.</p></div><span className="yp-tag">Marca editorial</span></div>
      <form onSubmit={event => { event.preventDefault(); persist(); }}>
        <div className="yp-fields">
          <label>Nombre de la marca<input required maxLength={80} value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="Ej.: Actualidad TV" /></label>
          <label>Usuario preferido<div className="yp-handle"><span>@</span><input maxLength={40} value={draft.handle} onChange={e => patch({ handle: e.target.value.replace(/^@/, '') })} placeholder="actualidadtv" /></div></label>
          <label className="yp-wide">Descripción<textarea rows={3} maxLength={300} value={draft.description} onChange={e => patch({ description: e.target.value })} placeholder="Qué contás y para quién." /></label>
          <label>Temática<input maxLength={80} value={draft.topic} onChange={e => patch({ topic: e.target.value })} placeholder="Noticias, cultura, deporte…" /></label>
          <label>País<input maxLength={60} value={draft.country} onChange={e => patch({ country: e.target.value })} /></label>
          <label>Idioma<select value={draft.language} onChange={e => patch({ language: e.target.value })}><option value="es">Español</option><option value="pt">Português</option><option value="en">English</option></select></label>
        </div>
        <div className="yp-save"><button className="yp-primary" type="submit">Guardar configuración</button><span>{unsaved ? 'Cambios sin guardar' : draft.updatedAt ? 'Borrador guardado' : 'Todavía sin guardar'}</span></div>
      </form>
    </section>
    <section className="yp-section">
      <div className="yp-section-title"><div><small>PASO 03</small><h2>Elegí tus redes</h2><p>Primero indicá cuáles ya existen para evitar duplicados.</p></div><span className="yp-tag">{selected.length} de 5 seleccionadas</span></div>
      <div className="yp-networks">{SOCIAL_NETWORKS.map(n => {
        const item = draft.plans[n.id];
        const linked = connectedAccounts.find(a => a.platform.toLowerCase() === n.id.toLowerCase());
        return <article className="yp-network" key={n.id}>
          <div className="yp-network-heading"><span className="yp-network-mark" style={{ color: n.color }}>{n.mark}</span><h3>{n.name}</h3></div>
          <label className="yp-choice">¿Cómo querés continuar?<select aria-label={'Estado de ' + n.name} value={item.choice} onChange={e => plan(n.id, { choice: e.target.value as PlanChoice, status: e.target.value === 'existing' ? 'PENDING_AUTHORIZATION' : 'PENDING' })}>
            <option value="later">Lo haré después</option><option value="existing">Ya tengo una cuenta</option><option value="create">Necesito crearla</option>
          </select></label>
          {item.choice !== 'later' && <label>Usuario en {n.name}<input maxLength={80} value={item.handle} onChange={e => plan(n.id, { handle: e.target.value.replace(/^@/, '') })} placeholder={draft.handle || 'Usuario de esta red'} /></label>}
          <p className="yp-requirement">{n.requirement}</p>
          <span className="yp-status">{linked?.ready ? `🟢 Conectada (${linked.display_name})` : item.choice === 'existing' ? 'Pendiente de autorización' : item.choice === 'create' ? 'Pendiente de creación' : 'Sin seleccionar'}</span>
          {item.choice !== 'later' && <button className="yp-secondary" onClick={() => { setReview(n.id); setConfirmOpen(false); }}>Ver opciones de esta red →</button>}
        </article>;
      })}</div>
    </section>
    <section className="yp-summary"><div><h2>Tu progreso, sin perder el punto de partida</h2><p>{connectedAccounts.some(a => a.ready) ? `${selected.length} redes preparadas · ${connectedAccounts.filter(a => a.ready).length} conexiones verificadas · publicación 1-clic activa.` : `${selected.length} redes preparadas · 0 conexiones verificadas · publicación desactivada.`}</p>
      <p>Las conexiones sociales individuales todavía están pendientes. Este asistente no utiliza las cuentas ni las credenciales globales del administrador.</p></div>
      <button className="yp-secondary" onClick={persist}>Guardar progreso</button>
    </section>
    
    {review && (() => {
      const n = SOCIAL_NETWORKS.find(network => network.id === review)!;
      const existing = draft.plans[review].choice === 'existing';
      return <div className="yp-modal-backdrop"><section className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-review-title">
        <button className="yp-close" aria-label="Cerrar vista previa" onClick={() => setReview(null)}>×</button>
        <small>REVISIÓN · {n.name.toUpperCase()}</small><h2 id="yp-review-title">{existing ? 'Revisá tu cuenta existente' : 'Prepará tu nueva cuenta'}</h2>
        <pre>{profileText(draft, review)}</pre>
        <button className="yp-secondary" onClick={() => copy(review)}>Copiar datos preparados</button>
        <p>{existing ? 'Comprobá que estás en la cuenta correcta. Abrir el sitio no conecta tu cuenta con YOUAPP.' : 'En el sitio oficial, comprobá primero si la cuenta ya existe. Completá vos el registro, las verificaciones y la aceptación de términos.'}</p>
        <p className="yp-notice">Los datos son una propuesta. El nombre de usuario y la propiedad todavía no están verificados. Las conexiones y publicaciones automáticas permanecen desactivadas.</p>
        <label className="yp-confirm"><input type="checkbox" checked={confirmOpen} onChange={e => setConfirmOpen(e.target.checked)} />Quiero abrir {n.name} para continuar manualmente.</label>
        {confirmOpen ? <a className="yp-primary yp-official-link" href={n.url} target="_blank" rel="noopener noreferrer">Abrir sitio oficial ↗</a> : <button type="button" className="yp-primary" disabled>Abrir sitio oficial ↗</button>}
        <button className="yp-text-button" onClick={() => setReview(null)}>Continuar más tarde</button>
      </section></div>;
    })()}
  </fieldset>;
}
