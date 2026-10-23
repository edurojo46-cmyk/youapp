/**
 * BUSCADOR INDUSTRIAL — COMMUNITY COMMERCE V1
 * LAUNCH CONTROL & FREEZE REGISTRY
 * @packages/config/communityLaunchControl.ts
 * 
 * Invariants:
 * - Default is STRICTLY FALSE.
 * - Auto-activation, migration-activation, test-activation, and deploy-activation are PROHIBITED.
 * - Activation requires an explicit, manual runtime override decision.
 * - TEST_NON_PRODUCTION workflows remain functional for ongoing CI/CD verification.
 */

// Explicit launch control flag. Default is ALWAYS false.
export const CABALLITO_COMMUNITY_LAUNCH_ENABLED: boolean = false;

/**
 * Returns true ONLY if explicit manual override is passed in environment.
 * Default is FALSE. No auto-activation allowed.
 */
export function isCaballitoCommunityLaunchEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    // Only accept explicit manual override key
    if (process.env.CABALLITO_COMMUNITY_LAUNCH_OVERRIDE === 'TRUE_MANUAL_DECISION_CERTIFIED') {
      return true;
    }
  }
  return CABALLITO_COMMUNITY_LAUNCH_ENABLED;
}

/**
 * Frozen state snapshot for Community Commerce V1
 */
export const COMMUNITY_COMMERCE_FREEZE_SNAPSHOT = {
  status: 'COMMUNITY_COMMERCE_V1_FROZEN',
  codeHash: '2295fae0af427d56',
  gitCommit: '923adbe',
  schemaHash: 'b39193e9a5875c4f',
  testsFrozen: 60,
  certifiedAt: '2026-09-30T17:36:05Z',
  b2bMatcherStatus: 'FUNCTIONAL_NOT_QUALITY_CERTIFIED' as const,
  launchFlagDefault: false,
  autoActivationPossible: false
} as const;

/**
 * Frozen state snapshot for Community Commerce V2.1 (Real Media + Counter Semantics)
 */
export const COMMUNITY_COMMERCE_V2_1_FREEZE_SNAPSHOT = {
  status: 'COMMUNITY_COMMERCE_V2_1_FROZEN',
  certifiedAt: '2026-09-30T20:35:00Z',
  realBusinessCount: 100,
  realActiveOfferCount: 0,
  realFollowerCount: 0,
  testDataIncludedInRealCounters: false,
  photoUploadCertified: true,
  countersCertified: true,
  mobileCertified: true,
  launchFlagDefault: false,
  killSwitchReady: true,
  humanLaunchStarted: false,
  nextActionRequiresManualDecision: 'LANZAR CABALLITO',
  finalStatus: 'CERTIFIED'
} as const;

/**
 * Pre-launch checklist for future controlled human pilot.
 * NOT to be executed automatically.
 */
export const PRE_LAUNCH_CHECKLIST = [
  'Activar launch flag mediante decisión manual explícita (CABALLITO_COMMUNITY_LAUNCH_OVERRIDE)',
  'Máximo 10 comercios voluntarios verificados dentro del polígono de Caballito',
  'Comisión 0% para comercios barriales',
  'Ofertas reales cargadas directamente por comerciantes autorizados',
  'Vecinos y usuarios reales descubriendo por canales orgánicos',
  'Métricas físicas reales (vistas, únicos, shares WhatsApp, clicks de contacto)',
  'Cero outreach automático, cero mensajes WhatsApp automatizados',
  'Monitoreo continuo de errores y health check en puerto 5174/5175',
  'Kill switch instantáneo: volver CABALLITO_COMMUNITY_LAUNCH_ENABLED a FALSE'
] as const;
