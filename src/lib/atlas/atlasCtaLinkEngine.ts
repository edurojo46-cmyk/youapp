/**
 * ATLAS — CTA LINK ENGINE V1
 * Canonical Name: ATLAS_CTA_LINK_ENGINE_V1
 * Mode: SIMULATION_ONLY
 *
 * Automatically determines optimal CTA text, link placement strategy,
 * and high-fidelity tracking URLs tailored to each platform's interaction rules.
 *
 * Supported Link Placements:
 * - DIRECT_LINK
 * - DESCRIPTION_LINK
 * - PROFILE_LINK
 * - BIO_CTA
 * - RELATED_VIDEO
 * - VISUAL_CTA_ONLY
 */
function generateSignature(data: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2).slice(0, 12);
}

export const ENGINE_NAME = 'ATLAS_CTA_LINK_ENGINE_V1';
export const CURRENT_MODE = 'SIMULATION_ONLY';

export type Platform = 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | string;

export type LinkPlacement =
  | 'DIRECT_LINK'
  | 'DESCRIPTION_LINK'
  | 'PROFILE_LINK'
  | 'BIO_CTA'
  | 'RELATED_VIDEO'
  | 'VISUAL_CTA_ONLY'
  | 'CHANNEL_PROFILE_LINK'
  | 'DESCRIPTION_FIRST_LINES'
  | 'END_SCREEN_EXTERNAL_LINK';

export type YouTubeFormat = 'SHORT' | 'NORMAL' | 'VIDEO_NORMAL' | 'AUTO';

export interface CtaInput {
  videoId?: string;
  VIDEO_ID?: string;
  platform?: Platform;
  PLATFORM?: Platform;
  destinationUrl?: string;
  DESTINATION_URL?: string;
  campaignId?: string;
  CAMPAIGN_ID?: string;
  placementOverride?: LinkPlacement;
  videoType?: 'STANDARD' | 'SHORT_FORM' | 'REEL' | 'STORY';
  youtubeFormat?: YouTubeFormat;
  isYppEligible?: boolean;
  channelEligibleYpp?: boolean;
  intent?: 'CONVERSION' | 'ENGAGEMENT' | 'DISCOVERY';
}

export interface CtaOutput {
  CTA_TEXT: string;
  CTA_FINAL_TEXT?: string;
  LINK_PLACEMENT: LinkPlacement;
  PRIMARY_PLACEMENT?: LinkPlacement;
  SECONDARY_PLACEMENT?: LinkPlacement;
  ELIGIBLE_PLACEMENT?: LinkPlacement;
  TRACKING_URL: string;
  ENGINE: string;
  MODE: 'SIMULATION_ONLY';
  REAL_PUBLICATION: 0;
  DETAILS: {
    videoId: string;
    platform: string;
    youtubeFormat?: string;
    isYppEligible?: boolean;
    campaignId: string;
    placementRuleApplied: string;
    trackingSignature: string;
    simulatedAt: string;
  };
}

export class AtlasCtaLinkEngine {
  readonly name = ENGINE_NAME;
  readonly mode = CURRENT_MODE;

  /**
   * Generates a platform-optimized CTA, placement, and tracking URL.
   * Strictly simulation-only (no real network publications).
   */
  generate(input: CtaInput): CtaOutput {
    const videoId = input.videoId || input.VIDEO_ID || 'VIDEO_UNKNOWN';
    const platformRaw = (input.platform || input.PLATFORM || 'YOUTUBE').toUpperCase().trim();
    const destinationUrl = input.destinationUrl || input.DESTINATION_URL || 'https://youapp.ai';
    const campaignId = input.campaignId || input.CAMPAIGN_ID || 'CAMP_DEFAULT';
    const videoType = input.videoType || 'STANDARD';
    const intent = input.intent || 'CONVERSION';
    const ytFormat = input.youtubeFormat || (videoType === 'SHORT_FORM' ? 'SHORT' : 'AUTO');
    const isYpp = Boolean(input.isYppEligible || input.channelEligibleYpp);

    // 1. RULE ENGINE: Determine Link Placement & CTA Text by Platform Capabilities
    let placement: LinkPlacement;
    let secondaryPlacement: LinkPlacement | undefined;
    let ctaText: string;
    let ctaFinalText: string;
    let ruleDescription: string;

    switch (platformRaw) {
      case 'YOUTUBE':
      case 'YOUTUBE_SHORT':
      case 'YOUTUBE_NORMAL': {
        const isShort =
          platformRaw === 'YOUTUBE_SHORT' ||
          ytFormat === 'SHORT' ||
          videoType === 'SHORT_FORM' ||
          videoId.toLowerCase().includes('short') ||
          (videoId.startsWith('RECIPE_') && ytFormat !== 'NORMAL' && ytFormat !== 'VIDEO_NORMAL');

        if (input.placementOverride) {
          placement = input.placementOverride;
          ctaText = 'Conocé más';
          ctaFinalText = 'Conocé más';
          ruleDescription = `MANUAL_OVERRIDE_${placement}`;
        } else if (isShort) {
          // SI ES YOUTUBE SHORT:
          // NO confiar en URL escrita dentro del video.
          // CTA final: Conocé más / Productos recomendados · Link en el perfil
          // Placement: CHANNEL_PROFILE_LINK
          placement = 'CHANNEL_PROFILE_LINK';
          ctaText = 'Conocé más\nProductos recomendados · Link en el perfil';
          ctaFinalText = 'Conocé más\nProductos recomendados · Link en el perfil';
          ruleDescription = 'YOUTUBE_SHORT_CREATOR_HUB_POLICY (Productos recomendados · Link en el perfil)';
        } else {
          // SI ES YOUTUBE VIDEO NORMAL:
          // CTA final: Conocé más
          // Placement principal: DESCRIPTION_FIRST_LINES
          // y si el canal es elegible/YPP: END_SCREEN_EXTERNAL_LINK
          placement = 'DESCRIPTION_FIRST_LINES';
          ctaText = 'Conocé más';
          ctaFinalText = 'Conocé más';
          if (isYpp) {
            secondaryPlacement = 'END_SCREEN_EXTERNAL_LINK';
            ruleDescription = 'YOUTUBE_NORMAL_DESCRIPTION_FIRST_LINES + YPP_END_SCREEN_EXTERNAL_LINK';
          } else {
            ruleDescription = 'YOUTUBE_NORMAL_DESCRIPTION_FIRST_LINES_POLICY';
          }
        }
        break;
      }

      case 'INSTAGRAM':
        if (input.placementOverride) {
          placement = input.placementOverride;
          ruleDescription = `MANUAL_OVERRIDE_${placement}`;
        } else {
          // Instagram does not allow clickable hyperlinks in captions / Reels descriptions
          // Canonical best practice: Profile link
          placement = 'PROFILE_LINK';
          ctaText = '🔗 Accedé directamente al enlace en nuestra biografía para conocer más 👆';
          ctaFinalText = 'Conocé más\nLink en bio';
          ruleDescription = 'INSTAGRAM_BIO_LINK_CAPTION_EXCLUSION_POLICY';
        }
        break;

      case 'TIKTOK':
        if (input.placementOverride) {
          placement = input.placementOverride;
          ruleDescription = `MANUAL_OVERRIDE_${placement}`;
        } else {
          // TikTok descriptions do not support active hyperlinks
          // Best practice: Creator bio link with interactive gesture callout
          placement = 'BIO_CTA';
          ctaText = '📲 Tocá el link en nuestro perfil para descubrir todos los detalles';
          ctaFinalText = 'Conocé más\nLink en perfil';
          ruleDescription = 'TIKTOK_BIO_ANCHOR_ACTION_POLICY';
        }
        break;

      default:
        placement = 'DIRECT_LINK';
        ctaText = '👉 Accedé ahora a través del siguiente enlace';
        ctaFinalText = 'Conocé más';
        ruleDescription = 'DEFAULT_OPEN_WEB_DIRECT_POLICY';
        break;
    }

    // 2. TRACKING URL BUILDER: Deterministic UTM parameters + unique signed tracking token
    const medium = this.mapPlatformToMedium(platformRaw, placement);
    const trackingSignature = generateSignature(`${campaignId}:${videoId}:${platformRaw}:${destinationUrl}`);

    const trackingUrl = this.buildTrackingUrl(destinationUrl, {
      utm_source: platformRaw.toLowerCase(),
      utm_medium: medium,
      utm_campaign: campaignId,
      utm_content: videoId,
      atlas_cid: trackingSignature
    });

    // 3. STRICT SIMULATION CONTRACT
    return {
      CTA_TEXT: ctaText,
      LINK_PLACEMENT: placement,
      TRACKING_URL: trackingUrl,
      ENGINE: this.name,
      MODE: 'SIMULATION_ONLY',
      REAL_PUBLICATION: 0,
      DETAILS: {
        videoId,
        platform: platformRaw,
        campaignId,
        placementRuleApplied: ruleDescription,
        trackingSignature,
        simulatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Maps platform and placement to standard analytics mediums.
   */
  private mapPlatformToMedium(platform: string, placement: LinkPlacement): string {
    switch (placement) {
      case 'DESCRIPTION_LINK':
        return 'video_description';
      case 'PROFILE_LINK':
      case 'BIO_CTA':
        return 'social_bio';
      case 'RELATED_VIDEO':
        return 'video_card';
      case 'VISUAL_CTA_ONLY':
        return 'on_screen_cue';
      case 'DIRECT_LINK':
      default:
        return 'social_post';
    }
  }

  /**
   * Safely constructs tracking URL preserving existing search params or fragments.
   */
  private buildTrackingUrl(baseUrl: string, params: Record<string, string>): string {
    try {
      const parsed = new URL(baseUrl);
      for (const [key, value] of Object.entries(params)) {
        parsed.searchParams.set(key, value);
      }
      return parsed.toString();
    } catch {
      // Fallback for relative or non-standard paths
      const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const delimiter = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${delimiter}${query}`;
    }
  }
}

// Canonical singleton export
export const AtlasCtaLinkEngineInstance = new AtlasCtaLinkEngine();
export default AtlasCtaLinkEngineInstance;
