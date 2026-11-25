/**
 * ATLAS — CUENTAS DE DIFUSIÓN ATLAS & SETUP WIZARD
 * Page: AtlasBroadcastAccountsPage
 * @apps/atlas/pages/AtlasBroadcastAccountsPage.tsx
 *
 * Dedicated Account Control Plane UI with Step-by-Step Setup Wizard:
 * - Permanent accounts registry for official diffusion channels:
 *   YouTube, Instagram, Facebook, TikTok, Telegram, Reddit, Nostr.
 * - Dynamic Status Counter: "RED ATLAS: X/7 CONECTADAS"
 * - Step-by-Step Setup Wizard for the 5 BLOCKED_EXTERNAL_SETUP platforms:
 *   Order: TELEGRAM → REDDIT → FACEBOOK + INSTAGRAM (Meta unificado) → TIKTOK
 * - For each platform:
 *   1. ABRIR SITIO OFICIAL
 *   2. Acción exacta que debe hacer el usuario
 *   3. YA LO HICE (Verificación física automática con read-back)
 *   4. Zero contraseñas almacenadas (PASSWORDS_STORED = 0)
 *   5. Zero conexiones simuladas (SIMULATED_CONNECTIONS = 0)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AtlasSocialSetupPilotPanel from './AtlasSocialSetupPilotPanel.tsx';
import { useAtlasShared } from '../context/AtlasSharedContext.tsx';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Key,
  Zap,
  ArrowLeft,
  Info,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Sliders,
  Send,
  Globe,
  Lock,
  Share2,
  BarChart3,
  Flame
} from 'lucide-react';

interface BroadcastAccount {
  account_id: string;
  platform: 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'TELEGRAM' | 'REDDIT' | 'NOSTR';
  display_name: string;
  external_account_id: string | null;
  username?: string | null;
  status: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTH_EXPIRED' | 'BLOCKED' | 'BLOCKED_EXTERNAL_SETUP' | 'DISABLED';
  auth_status: string;
  publish_enabled: boolean;
  metrics_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
  last_verified_at: string | null;
  public_identifier: string;
  auth_type: string;
  connect_guide_url?: string;
  required_action?: string;
  metadata?: Record<string, any>;
}

type WizardPlatform = 'TELEGRAM' | 'REDDIT' | 'META' | 'TIKTOK';

export const AtlasBroadcastAccountsPage: React.FC = () => {
  const navigate = useNavigate();
  const { navigateWithContext, setSelectedAccount, setSelectedPlatform } = useAtlasShared();
  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [verifyingPlatform, setVerifyingPlatform] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Setup Wizard State
  const [wizardPlatform, setWizardPlatform] = useState<WizardPlatform | null>(null);
  const [wizardLoading, setWizardLoading] = useState<boolean>(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<{ platform: string; message: string; details?: any } | null>(null);

  // Wizard Form Inputs (Zero passwords!)
  const [telegramToken, setTelegramToken] = useState<string>('');
  const [telegramChannel, setTelegramChannel] = useState<string>('');
  const [redditClientId, setRedditClientId] = useState<string>('');
  const [redditClientSecret, setRedditClientSecret] = useState<string>('');
  const [redditAccessToken, setRedditAccessToken] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaAppId, setMetaAppId] = useState<string>('');
  const [metaAppSecret, setMetaAppSecret] = useState<string>('');
  const [metaOAuthLoading, setMetaOAuthLoading] = useState<boolean>(false);
  const [tiktokClientKey, setTiktokClientKey] = useState<string>('');
  const [tiktokClientSecret, setTiktokClientSecret] = useState<string>('');
  // Telegram MTProto Automation & QR Auth State
  const [tgStatus, setTgStatus] = useState<any>(null);
  const [tgQrLoading, setTgQrLoading] = useState<boolean>(false);
  const [tgQrData, setTgQrData] = useState<{ qrDataUrl: string; loginUrl: string; expiresAt?: number } | null>(null);
  const [tgQrSecondsLeft, setTgQrSecondsLeft] = useState<number>(30);
  const qrIntervalRef = React.useRef<any>(null);
  const qrCountdownRef = React.useRef<any>(null);
  const [tgRequires2FA, setTgRequires2FA] = useState<boolean>(false);
  const [tg2FAPassword, setTg2FAPassword] = useState<string>('');
  const [tgSubmitting2FA, setTgSubmitting2FA] = useState<boolean>(false);
  const [tgActiveTab, setTgActiveTab] = useState<'BOOTSTRAP' | 'DIRECT'>('BOOTSTRAP');
  const [tgAuthMethod, setTgAuthMethod] = useState<'QR' | 'PHONE'>('QR');
  const [tgPhoneNumber, setTgPhoneNumber] = useState<string>('');
  const [tgPhoneCode, setTgPhoneCode] = useState<string>('');
  const [tgPhoneSending, setTgPhoneSending] = useState<boolean>(false);
  const [tgPhoneCodeSent, setTgPhoneCodeSent] = useState<boolean>(false);
  const [tgPhoneVerifying, setTgPhoneVerifying] = useState<boolean>(false);
  const [tgPipelineRunning, setTgPipelineRunning] = useState<boolean>(false);
  const [tgPipelineChannel, setTgPipelineChannel] = useState<string>('@atlas_diffusion');
  const [tgInputApiId, setTgInputApiId] = useState<string>('');
  const [tgInputApiHash, setTgInputApiHash] = useState<string>('');
  const [tgSavingCreds, setTgSavingCreds] = useState<boolean>(false);

  const fetchTgFullStatus = async () => {
    try {
      const res = await fetch('/api/atlas/broadcast/telegram/full-status');
      const data = await res.json();
      if (data.success) {
        setTgStatus(data);
      }
    } catch (e) {
      console.warn('Error fetching Telegram full status:', e);
    }
  };

  const handleSaveTgCredentials = async () => {
    if (!tgInputApiId.trim() || !tgInputApiHash.trim()) {
      setWizardError('Debes ingresar ATLAS_TELEGRAM_API_ID y ATLAS_TELEGRAM_API_HASH.');
      return;
    }
    try {
      setTgSavingCreds(true);
      setWizardError(null);
      const res = await fetch('/api/atlas/broadcast/telegram/credentials/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_id: tgInputApiId.trim(),
          api_hash: tgInputApiHash.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({
          type: 'success',
          text: 'Credenciales API guardadas con éxito en secret store (.secrets/atlas/telegram_credentials.json).'
        });
        await fetchTgFullStatus();
      } else {
        setWizardError(data.message || data.error || 'Error guardando credenciales.');
      }
    } catch (e: any) {
      setWizardError('Error guardando credenciales: ' + e.message);
    } finally {
      setTgSavingCreds(false);
    }
  };

  const handleStartTgQr = async () => {
    try {
      setTgQrLoading(true);
      setTgRequires2FA(false);
      setWizardError(null);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);

      const res = await fetch('/api/atlas/broadcast/telegram/qr/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTgQrData(data);
        const seconds = data.secondsRemaining || 30;
        setTgQrSecondsLeft(seconds);
        startTgQrPolling();
        startTgQrCountdown(seconds);
      } else {
        setWizardError(data.errorMessage || data.error || 'No se pudo generar el código QR de Telegram.');
      }
    } catch (e: any) {
      setWizardError('Error iniciando QR Login: ' + e.message);
    } finally {
      setTgQrLoading(false);
    }
  };

  const startTgQrCountdown = (initialSeconds: number) => {
    if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    let remaining = initialSeconds;
    qrCountdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(qrCountdownRef.current);
        setTgQrSecondsLeft(0);
        // Automatically renew fresh token when expired
        handleStartTgQr();
      } else {
        setTgQrSecondsLeft(remaining);
      }
    }, 1000);
  };

  const startTgQrPolling = () => {
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    qrIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/atlas/broadcast/telegram/qr/status');
        const data = await res.json();
        if (data.success) {
          if (data.status === 'AUTHORIZED') {
            if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
            if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
            setTgQrData(null);
            setTgRequires2FA(false);
            setWizardSuccess({
              platform: 'TELEGRAM',
              message: `¡Sesión de Telegram autorizada físicamente! Usuario: ${data.user?.firstName || data.user?.username || 'Propietario'}`
            });
            await fetchTgFullStatus();
            await fetchAccounts();
          } else if (data.status === '2FA_REQUIRED') {
            setTgRequires2FA(true);
          } else if (data.status === 'EXPIRED') {
            if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
            if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
            // Auto refresh fresh QR token
            handleStartTgQr();
          }
        }
      } catch (e) {
        // silent polling catch
      }
    }, 1500);
  };

  const handleTgSubmit2FA = async () => {
    if (!tg2FAPassword.trim()) return;
    try {
      setTgSubmitting2FA(true);
      const res = await fetch('/api/atlas/broadcast/telegram/2fa/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: tg2FAPassword.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTg2FAPassword('');
        setTgRequires2FA(false);
        setTgQrData(null);
        setWizardSuccess({
          platform: 'TELEGRAM',
          message: '¡Autenticación 2FA completada exitosamente! Sesión cifrada guardada en almacén seguro.'
        });
        await fetchTgFullStatus();
        await fetchAccounts();
      } else {
        setWizardError(data.errorMessage || 'Contraseña 2FA incorrecta.');
      }
    } catch (e: any) {
      setWizardError('Error verificando 2FA: ' + e.message);
    } finally {
      setTgSubmitting2FA(false);
    }
  };

  const handleSelectManagerBot = async (username: string) => {
    try {
      setWizardLoading(true);
      const res = await fetch('/api/atlas/broadcast/telegram/manager/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_username: username })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({
          type: 'success',
          text: `Manager bot seleccionado: ${username}. Bot Management Mode: ${data.canManageBots ? 'ACTIVO' : 'PENDIENTE'}`
        });
        await fetchTgFullStatus();
      }
    } catch (e: any) {
      setWizardError('Error al seleccionar bot: ' + e.message);
    } finally {
      setWizardLoading(false);
    }
  };

  const handleRecheckCanManage = async (username: string) => {
    try {
      setWizardLoading(true);
      const res = await fetch('/api/atlas/broadcast/telegram/manager/recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_username: username })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({
          type: data.canManageBots ? 'success' : 'error',
          text: data.details || (data.canManageBots ? '¡Bot Management Mode verificado!' : 'Aún inactivo')
        });
        await fetchTgFullStatus();
      }
    } catch (e: any) {
      setWizardError('Error al re-verificar permisos: ' + e.message);
    } finally {
      setWizardLoading(false);
    }
  };

  const handleTgSendPhoneCode = async () => {
    if (!tgPhoneNumber.trim()) return;
    try {
      setTgPhoneSending(true);
      setWizardError(null);
      const res = await fetch('/api/atlas/broadcast/telegram/phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: tgPhoneNumber.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTgPhoneCodeSent(true);
        setFeedbackMsg({
          type: 'success',
          text: 'Código enviado por Telegram. Introdúcelo a continuación (sin contraseñas almacenadas).'
        });
      } else {
        setWizardError(data.errorMessage || data.error || 'Error enviando código de teléfono.');
      }
    } catch (e: any) {
      setWizardError('Error solicitando código: ' + e.message);
    } finally {
      setTgPhoneSending(false);
    }
  };

  const handleTgVerifyPhoneCode = async () => {
    if (!tgPhoneCode.trim()) return;
    try {
      setTgPhoneVerifying(true);
      setWizardError(null);
      const res = await fetch('/api/atlas/broadcast/telegram/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_code: tgPhoneCode.trim(),
          password: tg2FAPassword.trim() ? tg2FAPassword.trim() : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setTgPhoneCode('');
        setTg2FAPassword('');
        setTgRequires2FA(false);
        setWizardSuccess({
          platform: 'TELEGRAM',
          message: `¡Sesión de Telegram autorizada físicamente! Propietario: ${data.user?.firstName || data.user?.username || 'Propietario'}`
        });
        await fetchTgFullStatus();
        await fetchAccounts();
      } else if (data.requires2FA) {
        setTgRequires2FA(true);
        setFeedbackMsg({
          type: 'error',
          text: 'Tu cuenta requiere contraseña de verificación en dos pasos (2FA).'
        });
      } else {
        setWizardError(data.errorMessage || data.error || 'Código incorrecto o expirado.');
      }
    } catch (e: any) {
      setWizardError('Error verificando código: ' + e.message);
    } finally {
      setTgPhoneVerifying(false);
    }
  };

  const handleRunAutonomousPipeline = async () => {
    try {
      setTgPipelineRunning(true);
      setWizardError(null);
      const res = await fetch('/api/atlas/broadcast/telegram/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: tgPipelineChannel.trim() || '@atlas_diffusion' })
      });
      const data = await res.json();
      if (data.success) {
        setWizardSuccess({
          platform: 'TELEGRAM',
          message: `¡Bot gestionado creado y conectado autónomamente! Bot: ${data.managedBotUsername} → Canal: ${data.channelTitle}. No se requerirá @BotFather para futuros bots.`
        });
        await fetchTgFullStatus();
        await fetchAccounts();
      } else {
        setWizardError(data.errorMessage || data.error || 'Error ejecutando pipeline autónomo.');
      }
    } catch (e: any) {
      setWizardError('Error ejecutando pipeline autónomo: ' + e.message);
    } finally {
      setTgPipelineRunning(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const title = params.get('title');
    const user = params.get('user');
    const error = params.get('error');

    if (connected && /^YOUTUBE_[0-9]+$/.test(connected)) {
      setFeedbackMsg({
        type: 'success',
        text: `¡Cuenta Google/YouTube conectada exitosamente! Canal: ${title || 'justicia social'}`
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (connected === 'REDDIT_01') {
      setFeedbackMsg({
        type: 'success',
        text: `¡Cuenta Reddit conectada exitosamente! Usuario: ${user || 'u/RedditUser'}`
      });
    } else if (connected === 'META_01') {
      const fb = params.get('fb');
      const ig = params.get('ig');
      setFeedbackMsg({
        type: 'success',
        text: `¡Meta conectado exitosamente! ${fb || ''} ${ig ? '| ' + ig : ''}`
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error) {
      setFeedbackMsg({
        type: 'error',
        text: `Error de autorización OAuth: ${error}`
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchAccounts();
  }, []);

  const handleStartMetaOAuth = async () => {
    try {
      setMetaOAuthLoading(true);
      setWizardError(null);
      const query = metaAppId.trim() ? `?app_id=${encodeURIComponent(metaAppId.trim())}` : '';
      const res = await fetch(`/api/atlas/broadcast/oauth/meta/url${query}`);
      const data = await res.json();
      if (!data.success) {
        setWizardError(data.errorMessage || 'Requiere META_APP_ID para iniciar el flujo oficial de OAuth.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error al conectar con Meta OAuth.');
    } finally {
      setMetaOAuthLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/atlas/broadcast/accounts');
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (err: any) {
      console.error('Error fetching broadcast accounts:', err);
      setFeedbackMsg({ type: 'error', text: 'Error al conectar con el servidor de cuentas.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      setFeedbackMsg(null);
      const res = await fetch('/api/atlas/broadcast/accounts/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
        setFeedbackMsg({ type: 'success', text: 'Sincronización física completada exitosamente.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: 'Error durante la sincronización: ' + err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleVerifyPlatform = async (platform: string) => {
    try {
      setVerifyingPlatform(platform);
      setFeedbackMsg(null);
      const res = await fetch(`/api/atlas/broadcast/accounts/verify/${platform}`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.account) {
        setAccounts(prev => prev.map(a => a.platform === platform ? data.account : a));
        setFeedbackMsg({ type: 'success', text: `Estado verificado para ${platform}: ${data.account.status}` });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `Error al verificar ${platform}: ${err.message}` });
    } finally {
      setVerifyingPlatform(null);
    }
  };

  const handleTogglePublish = async (accountId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch('/api/atlas/broadcast/accounts/toggle-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          publish_enabled: !currentEnabled
        })
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(prev => prev.map(a => a.account_id === accountId ? { ...a, publish_enabled: data.publish_enabled } : a));
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: 'No se pudo alternar el permiso de publicación: ' + err.message });
    }
  };

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSetDefault = async (accountId: string) => {
    try {
      setFeedbackMsg(null);
      const res = await fetch('/api/atlas/broadcast/accounts/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ type: 'success', text: `Cuenta predeterminada establecida: ${accountId}` });
        await fetchAccounts();
      } else {
        setFeedbackMsg({ type: 'error', text: data.message || 'Error al cambiar cuenta predeterminada.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      setFeedbackMsg(null);
      const res = await fetch('/api/atlas/broadcast/accounts/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg({ type: 'success', text: `Cuenta desconectada: ${accountId}` });
        await fetchAccounts();
      } else {
        setFeedbackMsg({ type: 'error', text: data.message || 'Error al desconectar cuenta.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    }
  };

  const handleVerifyAccount = async (accountId: string) => {
    try {
      setVerifyingPlatform(accountId);
      setFeedbackMsg(null);
      const res = await fetch(`/api/atlas/broadcast/accounts/verify-account/${accountId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.account) {
        setAccounts(prev => prev.map(a => a.account_id === accountId ? data.account : a));
        setFeedbackMsg({ type: 'success', text: `Estado verificado para ${accountId}: ${data.account.status}` });
      } else {
        setFeedbackMsg({ type: 'error', text: data.message || 'Error al verificar cuenta.' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    } finally {
      setVerifyingPlatform(null);
    }
  };

  // Connected counters & next step calculations
  const connectedCount = accounts.filter(a => a.status === 'CONNECTED').length;
  const isPlatformConnected = (platform: string) => accounts.some(a => a.platform === platform && a.status === 'CONNECTED');

  // Compute next wizard platform in canonical order: TELEGRAM → REDDIT → META (FB+IG) → TIKTOK
  const getNextPlatform = (): WizardPlatform | null => {
    if (!isPlatformConnected('TELEGRAM')) return 'TELEGRAM';
    if (!isPlatformConnected('REDDIT')) return 'REDDIT';
    if (!isPlatformConnected('FACEBOOK') || !isPlatformConnected('INSTAGRAM')) return 'META';
    if (!isPlatformConnected('TIKTOK')) return 'TIKTOK';
    return null;
  };

  const nextPlatform = getNextPlatform();

  // Calculate remaining user setup actions
  const remainingActionsCount = [
    !isPlatformConnected('TELEGRAM'),
    !isPlatformConnected('REDDIT'),
    (!isPlatformConnected('FACEBOOK') || !isPlatformConnected('INSTAGRAM')),
    !isPlatformConnected('TIKTOK')
  ].filter(Boolean).length;

  // Open wizard
  const openWizardFor = (p: WizardPlatform) => {
    setWizardPlatform(p);
    setWizardError(null);
    setWizardSuccess(null);
    if (p === 'TELEGRAM') {
      fetchTgFullStatus();
    }
  };

  // Execute verification inside wizard
  const handleWizardSubmit = async () => {
    if (!wizardPlatform) return;
    setWizardLoading(true);
    setWizardError(null);
    setWizardSuccess(null);

    try {
      if (wizardPlatform === 'TELEGRAM') {
        if (!telegramToken.trim() || !telegramChannel.trim()) {
          throw new Error('Debes ingresar el Token de @BotFather y el @canal público o ID.');
        }

        const res = await fetch('/api/atlas/broadcast/accounts/setup/verify-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bot_token: telegramToken.trim(),
            channel_id: telegramChannel.trim()
          })
        });
        const data = await res.json();
        if (!data.success || !data.connected) {
          throw new Error(data.errorMessage || 'Verificación con Telegram falló.');
        }

        setWizardSuccess({
          platform: 'TELEGRAM',
          message: `¡Canal conectado exitosamente! Bot: ${data.discoveredData?.botUsername || ''} → Canal: ${data.discoveredData?.channelTitle || telegramChannel}`
        });
        await fetchAccounts();
      } else if (wizardPlatform === 'REDDIT') {
        if (!redditAccessToken.trim() && (!redditClientId.trim() || !redditClientSecret.trim())) {
          throw new Error('Debes ingresar el Client ID y Secret para OAuth, o un Access Token personal.');
        }

        const res = await fetch('/api/atlas/broadcast/accounts/setup/verify-reddit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: redditClientId.trim() || undefined,
            client_secret: redditClientSecret.trim() || undefined,
            access_token: redditAccessToken.trim() || undefined
          })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.errorMessage || 'Verificación con Reddit falló.');
        }

        if (data.connected) {
          setWizardSuccess({
            platform: 'REDDIT',
            message: `¡Reddit conectado exitosamente! Usuario: ${data.displayName}`
          });
          await fetchAccounts();
        } else if (data.discoveredData?.authUrl) {
          // Redirect to OAuth
          window.location.href = data.discoveredData.authUrl;
          return;
        }
      } else if (wizardPlatform === 'META') {
        if (!metaAccessToken.trim() && !metaAppId.trim()) {
          throw new Error('Debes ingresar tu Meta Access Token o configurar META_APP_ID para iniciar el flujo oficial Meta OAuth.');
        }

        const res = await fetch('/api/atlas/broadcast/accounts/setup/verify-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: metaAccessToken.trim() || undefined,
            app_id: metaAppId.trim() || undefined,
            app_secret: metaAppSecret.trim() || undefined
          })
        });
        const data = await res.json();
        if (!data.success) {
          const err = data.facebook?.errorMessage || data.instagram?.errorMessage || 'Verificación con Meta falló.';
          throw new Error(err);
        }

        const fbName = data.facebook?.connected ? data.facebook.displayName : 'Sin Fanpage';
        const igName = data.instagram?.connected ? data.instagram.displayName : 'Sin Instagram Profesional';

        setWizardSuccess({
          platform: 'META',
          message: `¡Meta sincronizado! ${fbName} | ${igName}`
        });
        await fetchAccounts();
      } else if (wizardPlatform === 'TIKTOK') {
        if (!tiktokAccessToken.trim() && (!tiktokClientKey.trim() || !tiktokClientSecret.trim())) {
          throw new Error('Debes ingresar Client Key y Secret de TikTok, o un Access Token válido.');
        }

        const res = await fetch('/api/atlas/broadcast/accounts/setup/verify-tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_key: tiktokClientKey.trim() || undefined,
            client_secret: tiktokClientSecret.trim() || undefined,
            access_token: tiktokAccessToken.trim() || undefined
          })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.errorMessage || 'Verificación con TikTok falló.');
        }

        if (data.connected) {
          setWizardSuccess({
            platform: 'TIKTOK',
            message: `¡TikTok conectado exitosamente! ${data.displayName}`
          });
          await fetchAccounts();
        } else if (data.discoveredData?.authUrl) {
          window.location.href = data.discoveredData.authUrl;
          return;
        }
      }
    } catch (err: any) {
      setWizardError(err.message || 'Error durante la verificación.');
    } finally {
      setWizardLoading(false);
    }
  };

  // Platform brand metadata
  const getPlatformMeta = (platform: string) => {
    switch (platform) {
      case 'YOUTUBE':
        return {
          title: 'YouTube',
          subtitle: 'Shorts & Videos oficiales',
          badgeColor: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.08)',
          borderColor: 'rgba(239, 68, 68, 0.25)',
          icon: '▶',
          officialSite: 'https://console.cloud.google.com'
        };
      case 'INSTAGRAM':
        return {
          title: 'Instagram',
          subtitle: 'Reels & Carousels Business',
          badgeColor: '#ec4899',
          bgColor: 'rgba(236, 72, 153, 0.08)',
          borderColor: 'rgba(236, 72, 153, 0.25)',
          icon: '📸',
          officialSite: 'https://developers.facebook.com/apps'
        };
      case 'FACEBOOK':
        return {
          title: 'Facebook',
          subtitle: 'Páginas y Feed institucional',
          badgeColor: '#2563eb',
          bgColor: 'rgba(37, 99, 235, 0.08)',
          borderColor: 'rgba(37, 99, 235, 0.25)',
          icon: '👥',
          officialSite: 'https://developers.facebook.com/apps'
        };
      case 'TIKTOK':
        return {
          title: 'TikTok',
          subtitle: 'Content Posting API Oficial',
          badgeColor: '#06b6d4',
          bgColor: 'rgba(6, 182, 212, 0.08)',
          borderColor: 'rgba(6, 182, 212, 0.25)',
          icon: '🎵',
          officialSite: 'https://developers.tiktok.com'
        };
      case 'TELEGRAM':
        return {
          title: 'Telegram',
          subtitle: 'Canal Oficial & BotFather',
          badgeColor: '#0284c7',
          bgColor: 'rgba(2, 132, 199, 0.08)',
          borderColor: 'rgba(2, 132, 199, 0.25)',
          icon: '✈',
          officialSite: 'https://t.me/BotFather'
        };
      case 'REDDIT':
        return {
          title: 'Reddit',
          subtitle: 'Comunidades Públicas OAuth2',
          badgeColor: '#f97316',
          bgColor: 'rgba(249, 115, 22, 0.08)',
          borderColor: 'rgba(249, 115, 22, 0.25)',
          icon: '🤖',
          officialSite: 'https://www.reddit.com/prefs/apps'
        };
      case 'NOSTR':
        return {
          title: 'Nostr',
          subtitle: 'Red abierta descentralizada (NIP-01)',
          badgeColor: '#8b5cf6',
          bgColor: 'rgba(139, 92, 246, 0.08)',
          borderColor: 'rgba(139, 92, 246, 0.25)',
          icon: '⚡',
          officialSite: 'https://nostr.net'
        };
      default:
        return {
          title: platform,
          subtitle: 'Plataforma externa',
          badgeColor: '#64748b',
          bgColor: 'rgba(100, 116, 139, 0.08)',
          borderColor: 'rgba(100, 116, 139, 0.25)',
          icon: '🔗',
          officialSite: '#'
        };
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d16',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* ─── TOP STATUS BANNER (RED ATLAS: X/7 CONECTADAS) ─── */}
      <div style={{
        background: 'linear-gradient(90deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
        padding: '16px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          {/* Main Counter Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: connectedCount === 7 ? '#10b981' : '#38bdf8',
              boxShadow: connectedCount === 7 ? '0 0 12px #10b981' : '0 0 12px #38bdf8',
              animation: 'pulse 2s infinite'
            }} />
            <div>
              <div style={{
                fontSize: '18px',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>RED ATLAS:</span>
                <span style={{
                  color: connectedCount === 7 ? '#34d399' : '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(56, 189, 248, 0.25)'
                }}>
                  {connectedCount}/7 CONECTADAS
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                {connectedCount === 7
                  ? 'Red de difusión 100% preparada para publicación automática multicanal.'
                  : `${remainingActionsCount} configuración(es) externa(s) pendiente(s) antes del primer broadcast.`}
              </div>
            </div>
          </div>

          {/* Wizard Next Action Button */}
          {nextPlatform && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                Siguiente paso: <strong style={{ color: '#fbbf24' }}>{nextPlatform === 'META' ? 'FACEBOOK + INSTAGRAM' : nextPlatform}</strong>
              </span>
              <button
                onClick={() => openWizardFor(nextPlatform)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#f59e0b',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)'
                }}
              >
                <Sparkles size={15} />
                CONFIGURAR AHORA
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Navigation & Header */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigateWithContext('/broadcast/control-center')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={14} /> Control Center
            </button>

            {/* Cross-Link: VER CAMPAÑAS */}
            <button
              onClick={() => navigateWithContext('/broadcast/campaigns')}
              id="btn-cuentas-ver-campanas"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.35)',
                color: '#60a5fa',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Zap size={13} /> VER CAMPAÑAS
            </button>

            {/* Cross-Link: VER AUDIENCIA */}
            <button
              onClick={() => navigateWithContext('/broadcast/warm-audience')}
              id="btn-cuentas-ver-audiencia"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#fbbf24',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Flame size={13} /> VER AUDIENCIA
            </button>

            {/* Cross-Link: VER MÉTRICAS */}
            <button
              onClick={() => navigateWithContext('/broadcast/metrics-3m')}
              id="btn-cuentas-ver-metricas"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: '#c084fc',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <BarChart3 size={13} /> VER MÉTRICAS
            </button>
          </div>

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: syncing ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Todas'}
          </button>
        </div>

        {/* Title Section */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{
            fontSize: '30px',
            fontWeight: 800,
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
            color: '#ffffff'
          }}>
            CUENTAS DE DIFUSIÓN ATLAS
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Red de difusión multicanal permanente. Las conexiones son 100% físicas bajo APIs oficiales y OAuth 2.0. Sin contraseñas almacenadas.
          </p>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div style={{
            marginBottom: '24px',
            padding: '12px 18px',
            borderRadius: '8px',
            backgroundColor: feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: feedbackMsg.type === 'success' ? '#34d399' : '#f87171',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        <div style={{padding:18,marginBottom:20,border:"1px solid #334155",borderRadius:12}}><strong>YOUAPP · Mi presencia en redes</strong><p style={{color:"#94a3b8",fontSize:13}}>Creá tu cuenta con correo, prepará tu marca y continuá la configuración de tus redes.</p><button onClick={() => navigate("/redes")} style={{background:"#2563eb",color:"white",border:0,borderRadius:8,padding:"10px 16px",cursor:"pointer"}}>Crear mi presencia en redes →</button></div>
        <AtlasSocialSetupPilotPanel />

        {/* Accounts Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
            <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
            <p>Consultando estado físico de las 7 plataformas oficiales...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {(['YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'TELEGRAM', 'REDDIT', 'NOSTR'] as const).map(platform => {
              const meta = getPlatformMeta(platform);
              const platformAccounts = accounts.filter(a => a.platform === platform);
              const accountsToShow = platformAccounts.length > 0 ? platformAccounts : [{
                account_id: `${platform}_01`,
                platform,
                display_name: `Cuenta ${meta.title} (Sin configurar)`,
                external_account_id: null,
                status: 'NOT_CONNECTED' as const,
                auth_status: 'NOT_CONNECTED',
                publish_enabled: false,
                metrics_enabled: false,
                is_default: true,
                created_at: new Date().toISOString(),
                last_verified_at: null,
                public_identifier: 'No conectado',
                auth_type: 'OAUTH2'
              }];

              const wp = (platform === 'FACEBOOK' || platform === 'INSTAGRAM') ? 'META' : platform as WizardPlatform;

              return (
                <div
                  key={platform}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.45)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '24px'
                  }}
                >
                  {/* Platform Section Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        backgroundColor: meta.bgColor,
                        color: meta.badgeColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        border: `1px solid ${meta.borderColor}`
                      }}>
                        {meta.icon}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                            {meta.title}
                          </h2>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            color: '#cbd5e1'
                          }}>
                            {platformAccounts.length} {platformAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                          {meta.subtitle}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => openWizardFor(wp)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + CONECTAR OTRA CUENTA
                    </button>
                  </div>

                  {/* Accounts Cards Grid for this platform */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                    gap: '16px'
                  }}>
                    {accountsToShow.map(account => {
                      const isConnected = account.status === 'CONNECTED';
                      const isBlocked = account.status === 'BLOCKED_EXTERNAL_SETUP';
                      const isVerifying = verifyingPlatform === account.account_id || verifyingPlatform === account.platform;

                      return (
                        <div
                          key={account.account_id}
                          style={{
                            backgroundColor: 'rgba(30, 41, 59, 0.4)',
                            borderRadius: '12px',
                            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : (isBlocked ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)')}`,
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: isConnected ? '0 4px 16px rgba(16, 185, 129, 0.04)' : 'none'
                          }}
                        >
                          <div>
                            {/* Card Top: Account ID, Default Badge, Status */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  fontFamily: 'monospace',
                                  color: '#cbd5e1',
                                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {account.account_id}
                                </span>
                                {account.is_default && (
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: '#f59e0b',
                                    color: '#000000',
                                    letterSpacing: '0.04em'
                                  }}>
                                    DEFAULT
                                  </span>
                                )}
                              </div>

                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.15)' : (isBlocked ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                color: isConnected ? '#34d399' : (isBlocked ? '#fbbf24' : '#f87171'),
                                border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : (isBlocked ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {isConnected ? <CheckCircle2 size={11} /> : (isBlocked ? <AlertTriangle size={11} /> : null)}
                                {isConnected ? 'CONECTADA' : account.status}
                              </span>
                            </div>

                            {/* Account Details Box */}
                            <div style={{
                              backgroundColor: 'rgba(15, 23, 42, 0.5)',
                              padding: '10px',
                              borderRadius: '8px',
                              marginBottom: '12px',
                              border: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                              <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                                NOMBRE / TITULAR
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                                {account.display_name}
                              </div>

                              <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                                <span>{account.platform === 'NOSTR' ? 'NPUB' : 'IDENTIFICADOR'}</span>
                                {account.platform === 'NOSTR' && (
                                  <button
                                    onClick={() => copyToClipboard(account.public_identifier, account.account_id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: copiedKey === account.account_id ? '#10b981' : '#38bdf8',
                                      fontSize: '10px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                  >
                                    {copiedKey === account.account_id ? <Check size={11} /> : <Copy size={11} />}
                                    {copiedKey === account.account_id ? 'Copiado' : 'Copiar'}
                                  </button>
                                )}
                              </div>
                              <div style={{
                                fontSize: '11px',
                                fontFamily: account.platform === 'NOSTR' ? 'monospace' : 'inherit',
                                color: '#38bdf8',
                                wordBreak: 'break-all',
                                marginTop: '2px'
                              }}>
                                {account.public_identifier}
                              </div>
                            </div>

                            {/* Publish toggle */}
                            <div style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(15, 23, 42, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '12px'
                            }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>PUBLICAR</span>
                              <button
                                onClick={() => handleTogglePublish(account.account_id, account.publish_enabled)}
                                disabled={!isConnected}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  backgroundColor: account.publish_enabled && isConnected ? '#10b981' : '#334155',
                                  color: '#ffffff',
                                  border: 'none',
                                  cursor: isConnected ? 'pointer' : 'not-allowed'
                                }}
                              >
                                {account.publish_enabled && isConnected ? 'YES' : 'NO'}
                              </button>
                            </div>
                          </div>

                          {/* Account Action Buttons: SET DEFAULT, DISCONNECT, VERIFY */}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {isConnected && !account.is_default && (
                              <button
                                onClick={() => handleSetDefault(account.account_id)}
                                title="Establecer como cuenta predeterminada para esta plataforma"
                                style={{
                                  flex: 1,
                                  minWidth: '90px',
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  color: '#fbbf24',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                SET DEFAULT
                              </button>
                            )}

                            {isConnected && (
                              <button
                                onClick={() => handleDisconnect(account.account_id)}
                                title="Desconectar esta cuenta únicamente"
                                style={{
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  color: '#f87171',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                DISCONNECT
                              </button>
                            )}

                            <button
                              onClick={() => handleVerifyAccount(account.account_id)}
                              disabled={isVerifying}
                              title="Re-verificar estado físico"
                              style={{
                                padding: '7px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#94a3b8',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: isVerifying ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
                              VERIFY
                            </button>

                            {!isConnected && (
                              <button
                                onClick={() => openWizardFor(wp)}
                                style={{
                                  flex: 1,
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#f59e0b',
                                  border: 'none',
                                  color: '#000000',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                CONFIGURAR
                              </button>
                            )}
                          </div>

                          {/* Account Cross-Links: VER CAMPAÑAS, VER AUDIENCIA, VER MÉTRICAS */}
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                            flexWrap: 'wrap'
                          }}>
                            <button
                              onClick={() => {
                                setSelectedAccount(account.account_id);
                                setSelectedPlatform(account.platform);
                                navigateWithContext('/broadcast/campaigns', { account: account.account_id, platform: account.platform });
                              }}
                              style={{
                                flex: 1,
                                minWidth: '70px',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                                border: '1px solid rgba(37, 99, 235, 0.3)',
                                color: '#60a5fa',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                              title="VER CAMPAÑAS asignadas a esta cuenta"
                            >
                              CAMPAÑAS
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAccount(account.account_id);
                                setSelectedPlatform(account.platform);
                                navigateWithContext('/broadcast/warm-audience', { account: account.account_id, platform: account.platform });
                              }}
                              style={{
                                flex: 1,
                                minWidth: '70px',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#fbbf24',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                              title="VER AUDIENCIA afín a esta cuenta"
                            >
                              AUDIENCIA
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAccount(account.account_id);
                                setSelectedPlatform(account.platform);
                                navigateWithContext('/broadcast/metrics-3m', { account: account.account_id, platform: account.platform });
                              }}
                              style={{
                                flex: 1,
                                minWidth: '70px',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                color: '#c084fc',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                              title="VER MÉTRICAS de esta cuenta"
                            >
                              MÉTRICAS
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── SETUP WIZARD MODAL ─── */}
        {wizardPlatform && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999,
            overflowY: 'auto'
          }}>
            <div style={{
              backgroundColor: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              maxWidth: '660px',
              width: '100%',
              maxHeight: 'calc(100vh - 32px)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
              margin: 'auto 0'
            }}>
              {/* Wizard Header (Pinned Top) */}
              <div style={{
                padding: '20px 24px 14px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                flexShrink: 0,
                backgroundColor: '#0f172a'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ASISTENTE DE CONEXIÓN ATLAS (PASO A PASO)
                    </div>
                    <h2 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      {wizardPlatform === 'TELEGRAM' && 'Configurar Telegram Bot'}
                      {wizardPlatform === 'REDDIT' && 'Configurar Reddit OAuth'}
                      {wizardPlatform === 'META' && 'Configurar Meta (Facebook + Instagram)'}
                      {wizardPlatform === 'TIKTOK' && 'Configurar TikTok Creator'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setWizardPlatform(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '22px',
                      cursor: 'pointer',
                      padding: '4px',
                      lineHeight: 1
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Wizard Steps Sequence Bar */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px',
                  padding: '4px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  {[
                    { id: 'TELEGRAM', label: '1. Telegram', connected: isPlatformConnected('TELEGRAM') },
                    { id: 'REDDIT', label: '2. Reddit', connected: isPlatformConnected('REDDIT') },
                    { id: 'META', label: '3. FB + IG', connected: isPlatformConnected('FACEBOOK') && isPlatformConnected('INSTAGRAM') },
                    { id: 'TIKTOK', label: '4. TikTok', connected: isPlatformConnected('TIKTOK') }
                  ].map(step => (
                    <button
                      key={step.id}
                      onClick={() => openWizardFor(step.id as WizardPlatform)}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: wizardPlatform === step.id ? '#2563eb' : (step.connected ? 'rgba(16, 185, 129, 0.15)' : 'transparent'),
                        color: wizardPlatform === step.id ? '#ffffff' : (step.connected ? '#34d399' : '#64748b')
                      }}
                    >
                      {step.connected ? '✓ ' : ''}{step.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Content Body */}
              <div style={{
                padding: '20px 24px',
                overflowY: 'auto',
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {/* Step 1: ABRIR SITIO OFICIAL */}
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>
                    1. Abrir Portal Oficial:
                  </div>
                <a
                  href={getPlatformMeta(wizardPlatform === 'META' ? 'FACEBOOK' : wizardPlatform).officialSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#38bdf8',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={16} />
                  ABRIR SITIO OFICIAL (
                  {wizardPlatform === 'TELEGRAM' && '@BotFather en Telegram'}
                  {wizardPlatform === 'REDDIT' && 'Reddit Apps Prefs'}
                  {wizardPlatform === 'META' && 'Meta for Developers'}
                  {wizardPlatform === 'TIKTOK' && 'TikTok for Developers'}
                  )
                </a>
              </div>

              {/* Step 2: ACCIÓN EXACTA */}
              <div style={{
                marginBottom: '18px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '13px',
                color: '#cbd5e1',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 700, color: '#fbbf24', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={15} /> 2. ACCIÓN EXACTA QUE DEBES HACER:
                </div>

                {wizardPlatform === 'TELEGRAM' && (
                  <div>
                    {/* Status Strip */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px',
                      marginBottom: '14px'
                    }}>
                      <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '11px', color: '#38bdf8' }}>
                        MTProto_READY: <strong>YES</strong>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: tgStatus?.hasOwnApiCredentials ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${tgStatus?.hasOwnApiCredentials ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`, fontSize: '11px', color: tgStatus?.hasOwnApiCredentials ? '#34d399' : '#f87171' }}>
                        READY_FOR_QR_LOGIN: <strong>{tgStatus?.hasOwnApiCredentials ? 'YES' : 'NO'}</strong>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: tgStatus?.userSessionAuthorized ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${tgStatus?.userSessionAuthorized ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`, fontSize: '11px', color: tgStatus?.userSessionAuthorized ? '#34d399' : '#f87171' }}>
                        SESIÓN: <strong>{tgStatus?.userSessionAuthorized ? 'AUTORIZADA' : 'NO'}</strong>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: tgStatus?.existingBotFound ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '11px', color: tgStatus?.existingBotFound ? '#34d399' : '#94a3b8' }}>
                        EXISTING_BOT: <strong>{tgStatus?.existingBotFound ? 'YES' : 'NO'}</strong>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: tgStatus?.canManageBots ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: `1px solid ${tgStatus?.canManageBots ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`, fontSize: '11px', color: tgStatus?.canManageBots ? '#34d399' : '#fbbf24' }}>
                        CAN_MANAGE: <strong>{tgStatus?.canManageBots ? 'YES' : 'NO'}</strong>
                      </div>
                    </div>

                    {/* Mode Toggle Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                      <button
                        onClick={() => setTgActiveTab('BOOTSTRAP')}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: tgActiveTab === 'BOOTSTRAP' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        1. AUTORIZAR TELEGRAM (QR / MTPROTO)
                      </button>
                      <button
                        onClick={() => setTgActiveTab('DIRECT')}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: tgActiveTab === 'DIRECT' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        2. CONEXIÓN DIRECTA DE CANAL
                      </button>
                    </div>

                    {tgActiveTab === 'BOOTSTRAP' ? (
                      <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        {/* Step 0: App Credentials Check (PUBLIC_API_CREDENTIALS = 0) */}
                        {!tgStatus?.hasOwnApiCredentials ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
                              <Sparkles size={16} /> CREAR APP TELEGRAM
                            </div>
                            <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                              Para producción y autonomía total, se deben utilizar exclusivamente tus propias credenciales oficiales de Telegram (<strong>ATLAS_TELEGRAM_API_ID</strong> y <strong>ATLAS_TELEGRAM_API_HASH</strong>). Cero credenciales públicas.
                            </p>

                            <div style={{ marginBottom: '14px' }}>
                              <a
                                href="https://my.telegram.org/apps"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 14px',
                                  borderRadius: '6px',
                                  backgroundColor: '#0284c7',
                                  color: '#ffffff',
                                  textDecoration: 'none',
                                  fontSize: '12px',
                                  fontWeight: 700
                                }}
                              >
                                ABRIR MY.TELEGRAM.ORG/APPS <ExternalLink size={14} />
                              </a>
                            </div>

                            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '12px', borderRadius: '6px', marginBottom: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>
                                Instrucciones mínimas:
                              </div>
                              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <li>Iniciar sesión con Telegram en el sitio oficial.</li>
                                <li>Crear aplicación con título <strong>Atlas</strong>.</li>
                                <li>Copiar <strong>api_id</strong>.</li>
                                <li>Copiar <strong>api_hash</strong>.</li>
                                <li>Volver a Atlas e introducirlos a continuación.</li>
                              </ol>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                              <div>
                                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>API_ID:</label>
                                <input
                                  type="text"
                                  placeholder="Ej: 12345678"
                                  value={tgInputApiId}
                                  onChange={e => setTgInputApiId(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    marginTop: '4px',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>API_HASH:</label>
                                <input
                                  type="text"
                                  placeholder="Ej: 0123456789abcdef0123456789abcdef"
                                  value={tgInputApiHash}
                                  onChange={e => setTgInputApiHash(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    marginTop: '4px',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            </div>

                            <button
                              onClick={handleSaveTgCredentials}
                              disabled={tgSavingCreds}
                              style={{
                                padding: '10px 18px',
                                borderRadius: '6px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: tgSavingCreds ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              {tgSavingCreds ? <RefreshCw size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                              GUARDAR Y VERIFICAR
                            </button>
                            <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Lock size={12} /> Se guarda exclusivamente en .secrets/atlas/telegram_credentials.json (Nunca en DB ni logs).
                            </div>
                          </div>
                        ) : !tgStatus?.userSessionAuthorized ? (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                                Paso 1: Autorizar Sesión del Propietario
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => setTgAuthMethod('QR')}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: tgAuthMethod === 'QR' ? '#0284c7' : 'rgba(255,255,255,0.08)',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  QR LOGIN (Preferido)
                                </button>
                                <button
                                  onClick={() => setTgAuthMethod('PHONE')}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: tgAuthMethod === 'PHONE' ? '#0284c7' : 'rgba(255,255,255,0.08)',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  TELÉFONO + CÓDIGO (Fallback)
                                </button>
                              </div>
                            </div>

                            {tgAuthMethod === 'QR' ? (
                              <div>
                                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                                  Inicia sesión escaneando el código QR con Telegram en tu teléfono. Sin contraseñas almacenadas.
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '12px', fontWeight: 700, width: 'fit-content' }}>
                                  <CheckCircle2 size={14} /> READY_FOR_QR_LOGIN=YES
                                </div>

                                {!tgQrData ? (
                                  <button
                                    onClick={handleStartTgQr}
                                    disabled={tgQrLoading}
                                    style={{
                                      padding: '10px 18px',
                                      borderRadius: '6px',
                                      backgroundColor: '#0284c7',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontWeight: 700,
                                      fontSize: '13px',
                                      cursor: tgQrLoading ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                  >
                                    {tgQrLoading ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
                                    AUTORIZAR TELEGRAM CON QR
                                  </button>
                                ) : (
                                  <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                                    {/* Countdown & auto-refresh badge */}
                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '4px 12px',
                                      borderRadius: '20px',
                                      backgroundColor: tgQrSecondsLeft > 10 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                      color: tgQrSecondsLeft > 10 ? '#059669' : '#dc2626',
                                      fontSize: '12px',
                                      fontWeight: 800,
                                      border: `1px solid ${tgQrSecondsLeft > 10 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                    }}>
                                      <RefreshCw size={12} className={tgQrLoading ? 'animate-spin' : ''} />
                                      EXPIRA EN {tgQrSecondsLeft} s (Auto-refresco activo)
                                    </div>

                                    {/* QR Code Image */}
                                    <img src={tgQrData.qrDataUrl} alt="Telegram QR Login" style={{ width: '220px', height: '220px', display: 'block', borderRadius: '6px' }} />

                                    {/* Explicit Official Instructions */}
                                    <div style={{ textAlign: 'center', maxWidth: '340px' }}>
                                      <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 800, lineHeight: 1.4 }}>
                                        Escanear desde Telegram → Configuración → Dispositivos → Vincular dispositivo
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700, marginTop: '4px' }}>
                                        ⚠️ NO usar la cámara QR genérica del teléfono celular.
                                      </div>
                                    </div>

                                    {/* Manual Refresh Option */}
                                    <button
                                      onClick={handleStartTgQr}
                                      disabled={tgQrLoading}
                                      style={{
                                        marginTop: '4px',
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        backgroundColor: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        color: '#334155',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: tgQrLoading ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                      }}
                                    >
                                      <RefreshCw size={12} className={tgQrLoading ? 'animate-spin' : ''} />
                                      Regenerar código QR ahora
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                                  Fallback oficial: Recibe un código de inicio de sesión en tu app de Telegram.
                                </p>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                  <input
                                    type="text"
                                    placeholder="Ej: +5491112345678"
                                    value={tgPhoneNumber}
                                    onChange={e => setTgPhoneNumber(e.target.value)}
                                    disabled={tgPhoneCodeSent}
                                    style={{
                                      flex: 1,
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      backgroundColor: 'rgba(0,0,0,0.5)',
                                      border: '1px solid rgba(255,255,255,0.15)',
                                      color: '#ffffff',
                                      fontSize: '13px'
                                    }}
                                  />
                                  <button
                                    onClick={handleTgSendPhoneCode}
                                    disabled={tgPhoneSending || tgPhoneCodeSent}
                                    style={{
                                      padding: '8px 14px',
                                      borderRadius: '6px',
                                      backgroundColor: '#2563eb',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontWeight: 700,
                                      fontSize: '12px',
                                      cursor: tgPhoneSending || tgPhoneCodeSent ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    {tgPhoneSending ? 'Enviando...' : (tgPhoneCodeSent ? 'Código Enviado' : 'Enviar Código')}
                                  </button>
                                </div>

                                {tgPhoneCodeSent && (
                                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                    <input
                                      type="text"
                                      placeholder="Código de 5 dígitos recibido"
                                      value={tgPhoneCode}
                                      onChange={e => setTgPhoneCode(e.target.value)}
                                      style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(0,0,0,0.5)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: '#ffffff',
                                        fontSize: '13px'
                                      }}
                                    />
                                    <button
                                      onClick={handleTgVerifyPhoneCode}
                                      disabled={tgPhoneVerifying}
                                      style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        backgroundColor: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 700,
                                        fontSize: '12px',
                                        cursor: tgPhoneVerifying ? 'not-allowed' : 'pointer'
                                      }}
                                    >
                                      {tgPhoneVerifying ? 'Verificando...' : 'Verificar Código'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {tgRequires2FA && (
                              <div style={{ marginTop: '14px', padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', marginBottom: '6px' }}>
                                  Tu cuenta tiene 2FA activado. Introduce tu contraseña (nunca se almacena):
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <input
                                    type="password"
                                    placeholder="Contraseña 2FA"
                                    value={tg2FAPassword}
                                    onChange={e => setTg2FAPassword(e.target.value)}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: '#ffffff', fontSize: '13px' }}
                                  />
                                  <button
                                    onClick={tgAuthMethod === 'QR' ? handleTgSubmit2FA : handleTgVerifyPhoneCode}
                                    disabled={tgSubmitting2FA || tgPhoneVerifying}
                                    style={{ padding: '8px 14px', borderRadius: '6px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    {tgSubmitting2FA || tgPhoneVerifying ? 'Verificando...' : 'Confirmar 2FA'}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                              <Lock size={12} /> PASSWORDS_STORED = 0 (Nunca se guardan códigos ni contraseñas. Sólo la sesión MTProto cifrada en secret store).
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>
                              <CheckCircle2 size={16} /> Sesión de Telegram del Propietario Autorizada (USER_SESSION_AUTHORIZED=YES)
                            </div>

                            {/* Step 2: Existing-First Bot Detection */}
                            <div style={{ marginBottom: '16px' }}>
                              <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600, marginBottom: '8px' }}>
                                2. Bots Existentes Detectados (EXISTING-FIRST):
                              </div>
                              {tgStatus?.existingBots && tgStatus.existingBots.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {tgStatus.existingBots.map((b: any) => (
                                    <div
                                      key={b.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(30, 41, 59, 0.4)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)'
                                      }}
                                    >
                                      <div>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                                          {b.name} <span style={{ color: '#38bdf8', fontWeight: 400 }}>({b.username})</span>
                                        </div>
                                        <div style={{ fontSize: '11px', color: b.canManageBots ? '#34d399' : '#fbbf24' }}>
                                          Bot Management: {b.canManageBots ? '✅ ACTIVO' : '⚠️ PENDIENTE'}
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                          onClick={() => handleSelectManagerBot(b.username)}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            backgroundColor: '#2563eb',
                                            color: '#ffffff',
                                            border: 'none',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Usar como Manager Bot
                                        </button>
                                        {!b.canManageBots && (
                                          <a
                                            href={`https://t.me/BotFather?start=setcanmanagebots`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                              padding: '4px 8px',
                                              borderRadius: '4px',
                                              backgroundColor: '#f59e0b',
                                              color: '#000000',
                                              textDecoration: 'none',
                                              fontSize: '11px',
                                              fontWeight: 700
                                            }}
                                          >
                                            Activar en @BotFather
                                          </a>
                                        )}
                                        <button
                                          onClick={() => handleRecheckCanManage(b.username)}
                                          title="Re-verificar can_manage_bots"
                                          style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', cursor: 'pointer' }}
                                        >
                                          <RefreshCw size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                  No se detectaron bots creados aún en esta cuenta. En @BotFather crea 1 bot para usar como Manager.
                                </div>
                              )}
                            </div>

                            {/* Step 3: Autonomous Creation Pipeline */}
                            {tgStatus?.canManageBots && (
                              <div style={{ marginTop: '16px', padding: '14px', borderRadius: '6px', backgroundColor: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa', marginBottom: '6px' }}>
                                  3. Ejecución Autónoma (bots.checkUsername → bots.createBot)
                                </div>
                                <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 10px 0' }}>
                                  Sesión y Bot Management Mode listos. Atlas creará el bot gestionado, obtendrá el token oficial y conectará el canal automáticamente.
                                </p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <input
                                    type="text"
                                    placeholder="Canal (ej. @micanal o ID)"
                                    value={tgPipelineChannel}
                                    onChange={e => setTgPipelineChannel(e.target.value)}
                                    style={{
                                      flex: 1,
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      backgroundColor: 'rgba(0,0,0,0.5)',
                                      border: '1px solid rgba(255,255,255,0.15)',
                                      color: '#ffffff',
                                      fontSize: '13px'
                                    }}
                                  />
                                  <button
                                    onClick={handleRunAutonomousPipeline}
                                    disabled={tgPipelineRunning}
                                    style={{
                                      padding: '8px 16px',
                                      borderRadius: '6px',
                                      backgroundColor: '#10b981',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontWeight: 700,
                                      fontSize: '12px',
                                      cursor: tgPipelineRunning ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    {tgPipelineRunning ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                                    EJECUTAR AUTONOMOUS BOOTSTRAP
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Direct Channel Setup */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: '#94a3b8' }}>Bot Token de @BotFather:</label>
                          <input
                            type="text"
                            placeholder="Ej: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                            value={telegramToken}
                            onChange={e => setTelegramToken(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0,0,0,0.5)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#ffffff',
                              fontSize: '13px',
                              marginTop: '4px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '12px', color: '#94a3b8' }}>ID o Username del Canal Público:</label>
                          <input
                            type="text"
                            placeholder="Ej: @micanaloficial o -1001234567890"
                            value={telegramChannel}
                            onChange={e => setTelegramChannel(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0,0,0,0.5)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#ffffff',
                              fontSize: '13px',
                              marginTop: '4px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {wizardPlatform === 'REDDIT' && (
                  <ol style={{ margin: 0, paddingLeft: '18px' }}>
                    <li>En <strong>reddit.com/prefs/apps</strong> haz clic en <em>"create another app"</em>.</li>
                    <li>Selecciona tipo <strong>"web app"</strong>. Nombre: <code>Atlas Broadcast</code>.</li>
                    <li>En redirect uri pon exactamente: <code>http://localhost:5174/api/atlas/broadcast/oauth/reddit/callback</code>.</li>
                    <li>Copia el <strong>Client ID</strong> (debajo del nombre de la app) y el <strong>Client Secret</strong>.</li>
                  </ol>
                )}

                {wizardPlatform === 'META' && (
                  <ol style={{ margin: 0, paddingLeft: '18px' }}>
                    <li>En <strong>developers.facebook.com</strong> crea una App de tipo <strong>"Empresa / Business"</strong>.</li>
                    <li>Genera un <strong>Access Token</strong> con permisos <code>pages_manage_posts</code> e <code>instagram_content_publish</code>.</li>
                    <li>Atlas descubrirá y vinculará <strong>automáticamente tanto tu Fanpage de Facebook como tu cuenta de Instagram Profesional</strong> en una sola verificación física.</li>
                  </ol>
                )}

                {wizardPlatform === 'TIKTOK' && (
                  <ol style={{ margin: 0, paddingLeft: '18px' }}>
                    <li>En <strong>developers.tiktok.com</strong> crea una App y activa <strong>"Content Posting API"</strong>.</li>
                    <li>Permisos requeridos: <code>video.upload</code> y <code>video.publish</code>.</li>
                    <li>Redirect URI: <code>http://localhost:5174/api/atlas/broadcast/oauth/tiktok/callback</code>.</li>
                    <li>Ingresa el Client Key y Client Secret (o pega un User Access Token de prueba).</li>
                  </ol>
                )}
              </div>

              {/* Step 3: INPUTS ESPECÍFICOS (ZERO CONTRASEÑAS) */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Lock size={12} /> DATOS DE AUTENTICACIÓN OFICIAL (SIN CONTRASEÑAS)
                </div>

                {wizardPlatform === 'REDDIT' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#94a3b8' }}>Reddit Client ID:</label>
                        <input
                          type="text"
                          placeholder="Ej: 14 caracteres bajo web app"
                          value={redditClientId}
                          onChange={e => setRedditClientId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                            fontSize: '13px',
                            marginTop: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#94a3b8' }}>Reddit Client Secret:</label>
                        <input
                          type="password"
                          placeholder="Client Secret de la app"
                          value={redditClientSecret}
                          onChange={e => setRedditClientSecret(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                            fontSize: '13px',
                            marginTop: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8' }}>O Access Token directo (opcional):</label>
                      <input
                        type="text"
                        placeholder="Bearer token de Reddit"
                        value={redditAccessToken}
                        onChange={e => setRedditAccessToken(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#ffffff',
                          fontSize: '13px',
                          marginTop: '4px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                )}

                {wizardPlatform === 'META' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Primary Action: Official Meta OAuth */}
                    <div style={{
                      padding: '14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(24, 119, 242, 0.1)',
                      border: '1px solid rgba(24, 119, 242, 0.3)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                        <Share2 size={16} /> FLUJO OFICIAL META OAUTH (RECOMENDADO)
                      </div>
                      <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                        Autoriza con un solo clic. Atlas solicitará únicamente los permisos necesarios (<strong>pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish</strong>) y descubrirá físicamente tu Fanpage y cuenta Instagram Profesional.
                      </p>
                      <button
                        onClick={handleStartMetaOAuth}
                        disabled={metaOAuthLoading}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          borderRadius: '6px',
                          backgroundColor: '#1877f2',
                          color: '#ffffff',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: metaOAuthLoading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 8px rgba(24, 119, 242, 0.4)'
                        }}
                      >
                        {metaOAuthLoading ? <RefreshCw size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                        {metaOAuthLoading ? 'Iniciando Meta OAuth...' : 'CONECTAR CON META OFICIAL (OAUTH)'}
                      </button>
                    </div>

                    {/* Secondary Option: Manual App Credentials or Access Token */}
                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
                        O CONFIGURAR CON CREDENCIALES DE TU APP / TOKEN DIRECTO:
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#94a3b8' }}>META_APP_ID (opcional):</label>
                          <input
                            type="text"
                            placeholder="Ej: 154298123456789"
                            value={metaAppId}
                            onChange={e => setMetaAppId(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0,0,0,0.5)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#ffffff',
                              fontSize: '12px',
                              marginTop: '3px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#94a3b8' }}>META_APP_SECRET (opcional):</label>
                          <input
                            type="password"
                            placeholder="App Secret de Meta"
                            value={metaAppSecret}
                            onChange={e => setMetaAppSecret(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(0,0,0,0.5)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#ffffff',
                              fontSize: '12px',
                              marginTop: '3px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>O Meta Graph API Access Token (Explorer / Business):</label>
                        <textarea
                          rows={2}
                          placeholder="Pega aquí tu token EAAB... generado en Meta Graph API Explorer con permisos pages_manage_posts e instagram_content_publish"
                          value={metaAccessToken}
                          onChange={e => setMetaAccessToken(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            marginTop: '3px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                        <Lock size={12} /> TOKENS_SECURE: Guardados exclusivamente en Secret Store (.secrets/atlas/meta_01.json). DB solo guarda token_ref.
                      </div>
                    </div>
                  </div>
                )}

                {wizardPlatform === 'TIKTOK' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#94a3b8' }}>TikTok Client Key:</label>
                        <input
                          type="text"
                          placeholder="Client Key de tu app"
                          value={tiktokClientKey}
                          onChange={e => setTiktokClientKey(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                            fontSize: '13px',
                            marginTop: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#94a3b8' }}>TikTok Client Secret:</label>
                        <input
                          type="password"
                          placeholder="Client Secret"
                          value={tiktokClientSecret}
                          onChange={e => setTiktokClientSecret(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                            fontSize: '13px',
                            marginTop: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8' }}>O User Access Token de TikTok (opcional):</label>
                      <input
                        type="text"
                        placeholder="act.example.token..."
                        value={tiktokAccessToken}
                        onChange={e => setTiktokAccessToken(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#ffffff',
                          fontSize: '13px',
                          marginTop: '4px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {wizardError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} />
                  <span>{wizardError}</span>
                </div>
              )}

              {/* Success Message */}
              {wizardSuccess && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <CheckCircle2 size={18} />
                  <div>
                    <div style={{ fontWeight: 700 }}>¡CONEXIÓN FÍSICA VERIFICADA!</div>
                    <div style={{ fontSize: '13px', marginTop: '2px' }}>{wizardSuccess.message}</div>
                  </div>
                </div>
              )}

              </div> {/* Close scrollable body */}

              {/* Fixed Sticky Footer */}
              <div style={{
                padding: '14px 24px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0b1120',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <button
                  onClick={() => setWizardPlatform(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>

                {wizardSuccess ? (
                  <button
                    onClick={() => {
                      const next = getNextPlatform();
                      if (next) {
                        openWizardFor(next);
                      } else {
                        setWizardPlatform(null);
                      }
                    }}
                    style={{
                      padding: '10px 22px',
                      borderRadius: '8px',
                      backgroundColor: '#10b981',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    CONTINUAR <ChevronRight size={16} />
                  </button>
                ) : wizardPlatform === 'TELEGRAM' && !tgStatus?.hasOwnApiCredentials ? (
                  <button
                    onClick={handleSaveTgCredentials}
                    disabled={tgSavingCreds || !tgInputApiId.trim() || !tgInputApiHash.trim()}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      backgroundColor: (!tgInputApiId.trim() || !tgInputApiHash.trim()) ? '#334155' : '#10b981',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: (tgSavingCreds || !tgInputApiId.trim() || !tgInputApiHash.trim()) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: (!tgInputApiId.trim() || !tgInputApiHash.trim()) ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    {tgSavingCreds ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Verificando con MTProto...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} />
                        GUARDAR Y VERIFICAR
                      </>
                    )}
                  </button>
                ) : wizardPlatform === 'TELEGRAM' && tgStatus?.hasOwnApiCredentials && !tgStatus?.userSessionAuthorized ? (
                  <button
                    onClick={handleStartTgQr}
                    disabled={tgQrLoading}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      backgroundColor: '#0284c7',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: tgQrLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
                    }}
                  >
                    {tgQrLoading ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Generando QR...
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        AUTORIZAR TELEGRAM CON QR
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleWizardSubmit}
                    disabled={wizardLoading}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: wizardLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                    }}
                  >
                    {wizardLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Verificando con API oficial...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        YA LO HICE — VERIFICAR AUTOMÁTICAMENTE
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AtlasBroadcastAccountsPage;
