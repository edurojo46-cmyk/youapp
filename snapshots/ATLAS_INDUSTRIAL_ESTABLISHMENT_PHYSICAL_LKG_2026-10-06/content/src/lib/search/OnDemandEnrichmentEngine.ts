import { LightweightPersonRecord, SocialProfileEvidence, SocialSourceState } from './MassDiscoveryTypes';
import { PublicContactDiscovery } from './PublicContactDiscovery';

export interface EnrichmentOptions {
  resolvePhoto?: boolean;
  resolveContact?: boolean;
  resolveSocial?: boolean;
}

export class OnDemandEnrichmentEngine {
  /**
   * Lazily enriches specific person records on demand (e.g. visible viewport cards or selected batch 25–100).
   * STRICT DIRECTIVES (Sections 6, 7, 8, 17, 18, 37, 38):
   * GENERATED_EMAILS = 0
   * GUESSED_EMAILS = 0
   * EMAIL_WITHOUT_SOURCE = 0
   * NAME_ONLY_SOCIAL_VERIFICATION = 0
   */
  public static async enrichRecords(
    records: LightweightPersonRecord[],
    options: EnrichmentOptions = { resolvePhoto: true, resolveContact: true, resolveSocial: true }
  ): Promise<LightweightPersonRecord[]> {
    const enrichedList: LightweightPersonRecord[] = [];

    for (const rec of records) {
      if (rec.enriched && rec.email_source_url && rec.social_profiles) {
        enrichedList.push(rec);
        continue;
      }

      const updated = { ...rec };

      // 1. Photo enrichment (e.g. GitHub avatar, Wikidata image)
      if (options.resolvePhoto && !updated.avatar_url && !updated.photo) {
        if (updated.public_identifiers?.github_username) {
          updated.avatar_url = `https://github.com/${updated.public_identifiers.github_username}.png?size=200`;
          updated.photo = updated.avatar_url;
        }
      }

      // 2. Public contact classification & provenance
      if (options.resolveContact && updated.public_email) {
        const classified = PublicContactDiscovery.classifyEmail(updated.public_email, updated.source_url);
        if (classified) {
          updated.email = classified.email;
          updated.email_type = classified.email_type;
          updated.email_source_domain = classified.domain;
          updated.contact_use_state = classified.contact_use_state;
          if (!updated.email_source_url) {
            updated.email_source_url = updated.source_url;
          }
          if (!updated.email_confidence) {
            updated.email_confidence = 98;
          }
          if (!updated.email_discovered_at) {
            updated.email_discovered_at = new Date().toISOString();
          }
        }
      }

      // 3. Social candidate discovery with strict verification gates (Directive Sec 18)
      if (options.resolveSocial) {
        const profiles: SocialProfileEvidence[] = updated.social_profiles ? [...updated.social_profiles] : [];
        const existingUrls = new Set(profiles.map(p => p.url));

        // GitHub profile (native verifiable account)
        if (updated.public_identifiers?.github_username) {
          const ghUrl = `https://github.com/${updated.public_identifiers.github_username}`;
          if (!existingUrls.has(ghUrl)) {
            profiles.push({
              platform: 'GITHUB_PUBLIC',
              url: ghUrl,
              handle: updated.public_identifiers.github_username,
              state: 'SOCIAL_VERIFIED_MATCH', // Strong identity verified via native platform
              corroboration_evidence: 'Cuenta y repositorio nativo en GitHub'
            });
            existingUrls.add(ghUrl);
          }
        }

        // Check if social links array contains candidate URLs
        if (updated.social_links) {
          for (const link of updated.social_links) {
            if (!existingUrls.has(link.url)) {
              let platform: any = 'LINKEDIN_PUBLIC';
              const u = link.url.toLowerCase();
              if (u.includes('linkedin.com')) platform = 'LINKEDIN_PUBLIC';
              else if (u.includes('instagram.com')) platform = 'INSTAGRAM_PUBLIC';
              else if (u.includes('facebook.com')) platform = 'FACEBOOK_PUBLIC';
              else if (u.includes('x.com') || u.includes('twitter.com')) platform = 'X_PUBLIC';
              else if (u.includes('youtube.com')) platform = 'YOUTUBE_PUBLIC';
              else if (u.includes('tiktok.com')) platform = 'TIKTOK_PUBLIC';
              else if (u.includes('github.com')) platform = 'GITHUB_PUBLIC';

              // STRICT RULE: Never mark SOCIAL_VERIFIED_MATCH based on name alone!
              // Must have corroborating organization, matching website, or cross-linked profile.
              const isCorroborated = Boolean(
                (updated.organization && updated.why_matched_work) ||
                (updated.public_identifiers?.canonical_profile_url && updated.public_identifiers.canonical_profile_url === link.url)
              );

              const state: SocialSourceState = isCorroborated ? 'SOCIAL_PROBABLE_MATCH' : 'SOCIAL_POSSIBLE_MATCH';

              profiles.push({
                platform,
                url: link.url,
                state,
                corroboration_evidence: isCorroborated ? `Coincidencia respaldada por organización (${updated.organization || 'Perfil institucional'})` : 'Enlace social descubierto'
              });
              existingUrls.add(link.url);
            }
          }
        }

        updated.social_profiles = profiles;
        if (!updated.social_links || updated.social_links.length === 0) {
          updated.social_links = profiles.map(p => ({
            platform: p.platform.replace('_PUBLIC', ''),
            url: p.url
          }));
        }
      }

      updated.enriched = true;
      enrichedList.push(updated);
    }

    return enrichedList;
  }
}
