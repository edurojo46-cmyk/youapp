/**
 * ATLAS MISSION ROUTER
 * @server/services/industrial/AtlasMissionRouter.ts
 *
 * Single routing authority deciding execution engine BEFORE IndustrialDiscoveryService.
 *
 * Enforces strict routing:
 * - BULK_EMAIL_ACQUISITION -> BulkEmailEngineAdapter -> IndustrialEmailOrchestrator -> IndustrialEmailTeslaWheel
 * - PEOPLE -> People engine / registry
 * - ESTABLISHMENT -> IndustrialDiscoveryService (untouched)
 * - VIDEO -> Video pipeline
 * - OTHER -> Fallback handler
 */

export type MissionRouteEngine =
  | 'BULK_EMAIL_ACQUISITION'
  | 'PEOPLE'
  | 'ESTABLISHMENT'
  | 'VIDEO'
  | 'OTHER';

export interface RouteResolutionInput {
  objective?: string;
  entity_type?: string;
  criteria?: any;
}

export class AtlasMissionRouter {
  /**
   * Resolves the specialized execution engine for a mission.
   */
  public static resolveEngine(mission: RouteResolutionInput): MissionRouteEngine {
    const rawObj = (mission.objective || '').trim().toLowerCase();
    const rowUnit = (
      mission.criteria?.row_unit || 
      mission.criteria?.universal_spec?.row_unit || 
      ''
    ).toUpperCase();

    const entityType = (
      mission.entity_type || 
      mission.criteria?.universal_spec?.entity_type || 
      ''
    ).toUpperCase();

    // 1. BULK_EMAIL_ACQUISITION
    // Triggers when mission explicitly requests bulk email acquisition or row unit is email contact
    const hasEmailRowUnit = rowUnit === 'PUBLIC_EMAIL_CONTACT' || rowUnit === 'BULK_EMAIL_ACQUISITION' || rowUnit === 'EMAIL';
    const hasEmailObjectivePattern = /\b(emails?\s+p[uú]blicos?|correos?\s+p[uú]blicos?|mails?\s+p[uú]blicos?|base\s+de\s+(?:mails?|emails?|correos?)|adquisici[oó]n\s+(?:masiva\s+)?de\s+(?:emails?|correos?)|bulk\s+email)\b/i.test(rawObj);

    if (hasEmailRowUnit || hasEmailObjectivePattern) {
      return 'BULK_EMAIL_ACQUISITION';
    }

    // 2. VIDEO
    if (entityType === 'VIDEO' || rowUnit === 'VIDEO') {
      return 'VIDEO';
    }

    // 3. PEOPLE
    if (entityType === 'PERSON' || rowUnit === 'PERSON') {
      return 'PEOPLE';
    }

    // 4. ESTABLISHMENT (Industrial Discovery Service path)
    if (
      entityType === 'ESTABLISHMENT' || 
      rowUnit === 'ESTABLISHMENT' || 
      entityType === 'COMPANY' || 
      rowUnit === 'COMPANY' ||
      entityType === 'ORGANIZATION' ||
      rowUnit === 'ORGANIZATION'
    ) {
      return 'ESTABLISHMENT';
    }

    return 'OTHER';
  }
}
