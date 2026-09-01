/**
 * policyGate.ts — Fase 8 Refinement: Policy Gate
 *
 * Capa entre Capability Router y Providers.
 * Verifica que YouApp PUEDA usar cada plataforma para la operación requerida.
 *
 * Ejemplo:
 *   TikTok → video_search: NO (search capability = false)
 *          → connected creator: SÍ (creator_sync = true + oauth)
 *          → embed known URL: SÍ (playback_policy = app_only)
 *
 * Nunca bloquea por conveniencia — solo por política de plataforma.
 */

// ── Políticas hardcodeadas en V1 (se mueven a platform_integrations en V2) ──

export interface PlatformPolicy {
  discoveryAllowed: boolean;    // ¿Podemos buscar/descubrir contenido?
  metadataAllowed: boolean;     // ¿Podemos guardar metadata?
  playbackAllowed: boolean;     // ¿Podemos mostrar/embeber?
  storageAllowed: boolean;      // ¿Podemos cachear en Atlas?
  requiresAuth: boolean;        // ¿Necesita OAuth del usuario?
  authAvailable: boolean;       // ¿Tenemos credenciales configuradas?
  expectedLatencyMs: number;
  coverageProbability: number;  // 0-100: probabilidad de que tenga resultados relevantes
  healthScore: number;          // 0-100: salud del proveedor (downtime, errores recientes)
}

// Políticas estáticas V1 — se complementarán con platform_integrations en producción
const PLATFORM_POLICIES: Record<string, PlatformPolicy> = {
  atlas: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 200, coverageProbability: 80, healthScore: 99
  },
  discover: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 800, coverageProbability: 45, healthScore: 90
  },
  publisher: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 600, coverageProbability: 55, healthScore: 90
  },
  archive: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 1200, coverageProbability: 70, healthScore: 95
  },
  vimeo: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 800, coverageProbability: 60, healthScore: 90
  },
  dailymotion: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 1000, coverageProbability: 35, healthScore: 85
  },
  peertube: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 1500, coverageProbability: 40, healthScore: 85
  },
  twitch: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: false,  // no cachear streams en vivo
    requiresAuth: false, authAvailable: false,  // TWITCH_CLIENT_ID opcional
    expectedLatencyMs: 900, coverageProbability: 80, healthScore: 92
  },
  youtube: {
    discoveryAllowed: true, metadataAllowed: true,
    playbackAllowed: true, storageAllowed: true,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 500, coverageProbability: 85, healthScore: 95
  },

  // Plataformas fase 11+ — no disponibles aún
  tiktok: {
    discoveryAllowed: false, metadataAllowed: false,  // search NO disponible
    playbackAllowed: false, storageAllowed: false,
    requiresAuth: true, authAvailable: false,
    expectedLatencyMs: 2000, coverageProbability: 75, healthScore: 80
  },
  x: {
    discoveryAllowed: false,  // API muy restringida y cara
    metadataAllowed: false, playbackAllowed: false, storageAllowed: false,
    requiresAuth: true, authAvailable: false,
    expectedLatencyMs: 1800, coverageProbability: 55, healthScore: 70
  },
  reddit: {
    discoveryAllowed: true,   // JSON API pública sí disponible
    metadataAllowed: true, playbackAllowed: false,  // no embed
    storageAllowed: false,
    requiresAuth: false, authAvailable: true,
    expectedLatencyMs: 1500, coverageProbability: 50, healthScore: 85
  }
};

// ── API pública ─────────────────────────────────────────────────────────────

export interface PolicyDecision {
  provider: string;
  allowed: boolean;
  reason: string;
  adjustedScore: number;  // Score ajustado por latencia, salud y cobertura
}

export function applyPolicyGate(
  routerDecisions: { provider: string; score: number; shouldActivate: boolean }[]
): PolicyDecision[] {
  return routerDecisions.map(({ provider, score, shouldActivate }) => {
    const policy = PLATFORM_POLICIES[provider];

    if (!policy) {
      return { provider, allowed: false, reason: 'Unknown provider', adjustedScore: 0 };
    }

    // 1. Verificar si el discovery está permitido
    if (!policy.discoveryAllowed) {
      return {
        provider, allowed: false,
        reason: policy.requiresAuth && !policy.authAvailable
          ? 'Requires OAuth not yet configured'
          : 'Discovery not allowed by platform policy',
        adjustedScore: 0
      };
    }

    // 2. Ajustar el score por factores operativos
    // (el Capability Router ya calculó relevance — aquí ajustamos por costos reales)
    const latencyPenalty = Math.max(0, (policy.expectedLatencyMs - 500) / 50);  // -1pt por cada 50ms sobre 500ms
    const healthMultiplier = policy.healthScore / 100;
    const coverageBonus = policy.coverageProbability / 100;

    const adjustedScore = Math.round(
      score * healthMultiplier * coverageBonus - latencyPenalty
    );

    return {
      provider,
      allowed: shouldActivate && adjustedScore > 0,
      reason: 'Allowed',
      adjustedScore: Math.max(0, adjustedScore)
    };
  });
}

export function getProviderPolicy(provider: string): PlatformPolicy | undefined {
  return PLATFORM_POLICIES[provider];
}
