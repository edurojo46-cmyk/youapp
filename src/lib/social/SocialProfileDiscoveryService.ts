import * as cheerio from 'cheerio';
import { supabase } from '../supabase';
import { supabaseAdmin } from '../supabaseAdmin';
import { SocialIdentityValidator, ValidationContext, CandidateSocial } from './SocialIdentityValidator';


export class SocialProfileDiscoveryService {
  
  private static geminiCircuitBreakerOpen = false;

  static async discoverForSubject(subjectId: string): Promise<any[]> {
    // 1. Fetch Subject Context
    const { data: subjectData, error } = await supabase
      .from('atlas_observation_subjects')
      .select('subject_id, source_id, subject_external_key')
      .eq('subject_id', subjectId)
      .single();

    if (error || !subjectData) {
      console.error('Subject not found:', subjectId);
      return [];
    }

    // Fetch context from projection
    const { data: projData } = await supabase
      .from('atlas_argentina_people_search_projection_v1')
      .select('display_name, role, organization, profession, source_url')
      .eq('subject_id', subjectId)
      .single();

    const context: ValidationContext = {
      subject_id: subjectId,
      display_name: projData?.display_name || null,
      role: projData?.role || null,
      organization: projData?.organization || null,
      profession: projData?.profession || null,
      known_source_url: projData?.source_url || null
    };

    let discoveredCandidates: CandidateSocial[] = [];

    // STEP 1-6: DETERMINISTIC DISCOVERY
    if (context.known_source_url) {
      try {
        const html = await fetch(context.known_source_url).then(r => r.text());
        const $ = cheerio.load(html);

        // A. JSON-LD Extraction
        const jsonLdScripts = $('script[type="application/ld+json"]');
        jsonLdScripts.each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || '{}');
            if (data['@type'] === 'Person' && data.sameAs) {
              const links = Array.isArray(data.sameAs) ? data.sameAs : [data.sameAs];
              links.forEach((link: string) => {
                const platform = this.inferPlatform(link);
                if (platform) {
                  discoveredCandidates.push({
                    platform,
                    profile_url: link,
                    discovery_source_url: context.known_source_url!,
                    evidence_type: 'JSON_LD'
                  });
                }
              });
            }
          } catch(e) {}
        });

        // B. rel="me" Extraction
        const relMeLinks = $('a[rel~="me"]');
        relMeLinks.each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const platform = this.inferPlatform(href);
            if (platform) {
               discoveredCandidates.push({
                  platform,
                  profile_url: href,
                  discovery_source_url: context.known_source_url!,
                  evidence_type: 'REL_ME'
               });
            }
          }
        });

        // C. Person-specific structured blocks (heuristics)
        // Look for social links very close to the person's name in the DOM
        if (context.display_name) {
            // Implement DOM Person Card Boundary
            // Find text nodes containing the subject's name, or part of it
            let personCard: any = null;
            if (context.display_name) {
                const nameParts = context.display_name.toLowerCase().split(' ').filter(p => p.length > 2);
                if (nameParts.length > 0) {
                    // Look for an element containing at least one part of the name
                    $('div, article, li, section').each((_, el) => {
                        if (personCard) return; // already found
                        const text = $(el).text().toLowerCase();
                        const matches = nameParts.filter(p => text.includes(p));
                        if (matches.length === nameParts.length) {
                            // This container has the full name. Is it a good card?
                            // We prefer the smallest container that has the name and some social links
                            const links = $(el).find('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="facebook.com"], a[href*="instagram.com"]');
                            if (links.length > 0) {
                                personCard = $(el);
                            }
                        }
                    });
                }
            }

            const searchRoot = personCard ? personCard : $('body');
            
            // Only extract from the bounded searchRoot
            searchRoot.find('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="x.com"], a[href*="facebook.com"], a[href*="instagram.com"]').each((_, el) => {
              const href = $(el).attr('href');
              const parentTag = $(el).parents('footer, header, nav').length;
              if (href && parentTag === 0) {
                 const platform = this.inferPlatform(href);
                 if (platform && !this.candidateExists(discoveredCandidates, href)) {
                    discoveredCandidates.push({
                      platform,
                      profile_url: href,
                      discovery_source_url: context.known_source_url!,
                      evidence_type: personCard ? 'PERSON_CARD_LINK' : 'STAFF_PAGE'
                    });
                 }
              }
            });
        }
      } catch (err) {
        console.error("Error parsing deterministic source", err);
      }
    }

    // Filter out candidates that fail the Validator
    let verifiedProfiles: any[] = [];
    
    for (const candidate of discoveredCandidates) {
      const validation = SocialIdentityValidator.validate(context, candidate);
      if (validation.identity_status === 'VERIFIED') {
        verifiedProfiles.push({
          candidate,
          validation
        });
      }
    }

    // STEP 7: GEMINI GROUNDED DISCOVERY FALLBACK
    // Only if we don't have enough verified profiles (e.g. no LinkedIn or no socials at all)
    if (verifiedProfiles.length === 0 && context.display_name && (context.organization || context.role)) {
       try {
         // Check circuit breaker
         if (this.geminiCircuitBreakerOpen) {
            console.warn("Gemini circuit breaker open. Skipping discovery fallback.");
         } else {
             const query = `${context.display_name} ${context.role || ''} ${context.organization || ''} LinkedIn official profile`;
             
             // Retry Policy:
             // QUOTA_EXHAUSTED (internal budget gate) → FAIL FAST — do NOT retry
             // Temporary provider rate limit (429 with Retry-After) → bounded backoff + jitter
             let attempts = 0;
             const MAX_PROVIDER_RETRIES = 3; // Only for genuine temporary rate limits
             let success = false;
             
             while (attempts <= MAX_PROVIDER_RETRIES && !success) {
                 const { data, error: funcErr } = await supabaseAdmin.functions.invoke('atlas-gemini-person-search', {
                   body: { action: 'DISCOVERY', query },
                 });

                 if (funcErr) {
                    const status = funcErr.context?.status;
                    const body = funcErr.context?.body || funcErr.message || '';

                    if (status === 429) {
                       // Distinguish: internal budget gate vs provider rate limit
                       const isQuotaExhausted =
                         typeof body === 'string'
                           ? body.includes('QUOTA_EXHAUSTED')
                           : body?.status === 'QUOTA_EXHAUSTED';

                       if (isQuotaExhausted) {
                         // FAIL FAST — internal budget exhausted, retrying wastes calls
                         console.warn('Gemini QUOTA_EXHAUSTED (internal budget gate). FAIL FAST — not retrying.');
                         this.geminiCircuitBreakerOpen = true;
                         break;
                       } else {
                         // Temporary provider rate limit — bounded backoff
                         attempts++;
                         if (attempts > MAX_PROVIDER_RETRIES) {
                           console.error('Gemini provider 429 max retries exceeded. Opening circuit breaker.');
                           this.geminiCircuitBreakerOpen = true;
                           break;
                         }
                         const backoff = Math.pow(2, attempts - 1) * 1000;
                         const jitter = Math.random() * 500;
                         console.warn(`Gemini provider 429. Backing off ${(backoff + jitter).toFixed(0)}ms (attempt ${attempts}/${MAX_PROVIDER_RETRIES})...`);
                         await new Promise(resolve => setTimeout(resolve, backoff + jitter));
                       }
                    } else {
                       // Non-429 error — fail fast
                       console.error('Gemini function error (non-429):', funcErr);
                       break;
                    }
                 } else if (data && data.candidates) {
                    success = true;
                    this.geminiCircuitBreakerOpen = false; // reset breaker on success
                    for (const aiCand of data.candidates) {
                       if (aiCand.evidence && aiCand.evidence.length > 0) {
                          for (const ev of aiCand.evidence) {
                             const platform = this.inferPlatform(ev.url);
                             if (platform) {
                                const candidate: CandidateSocial = {
                                   platform,
                                   profile_url: ev.url,
                                   discovery_source_url: 'https://google.com/search',
                                   evidence_type: 'PUBLIC_WEB_SEARCH',
                                   ai_confidence: aiCand.aiConfidence || 0.9
                                };
                                const validation = SocialIdentityValidator.validate(context, candidate);
                                if (validation.identity_status === 'VERIFIED') {
                                   verifiedProfiles.push({ candidate, validation });
                                }
                             }
                          }
                       }
                    }
                 } else {
                    success = true; // no candidates but request succeeded
                 }
             }
         }
       } catch (err) {
         console.error('Gemini Edge function error:', err);
       }
     }

    // 4. Persistence
    const saved = [];
    for (const item of verifiedProfiles) {
       const cand = item.candidate;
       const platformId = this.mapPlatformToId(cand.platform);
       if (!platformId) continue;
       
       console.log(`Upserting profile for subject ${subjectId} with platform ${platformId} and url ${cand.profile_url}`);

       const { data, error } = await supabaseAdmin.from('atlas_subject_social_profiles').upsert({
           subject_id: subjectId,
           platform_id: platformId,
           profile_url: cand.profile_url,
           discovered_by: cand.evidence_type,
           discovery_source_url: cand.discovery_source_url,
           identity_status: item.validation.identity_status,
           profile_status: 'ACTIVE',
           source_id: cand.evidence_type === 'PUBLIC_WEB_SEARCH' ? 'GOOGLE_SEARCH_GROUNDED_DISCOVERY' : 'ORGANIZATION_PERSON_PAGE',
           source_record_id: 'auto-discovery',
           evidence_observation_id: null,
           confidence: cand.ai_confidence || 1.0,
           last_verified_at: new Date().toISOString()
       }, { onConflict: 'subject_id, platform_id, profile_url' }).select().single();
       
       if (error) {
         console.error("Upsert failed:", error);
       } else if (data) {
         saved.push(data);
       }
    }

    return saved;
  }

  private static candidateExists(candidates: CandidateSocial[], url: string) {
    return candidates.some(c => c.profile_url === url);
  }

  private static inferPlatform(url: string): string | null {
    const lUrl = url.toLowerCase();
    if (lUrl.includes('linkedin.com')) return 'LINKEDIN';
    if (lUrl.includes('twitter.com') || lUrl.includes('x.com')) return 'X';
    if (lUrl.includes('facebook.com')) return 'FACEBOOK';
    if (lUrl.includes('instagram.com')) return 'INSTAGRAM';
    if (lUrl.includes('github.com')) return 'GITHUB';
    if (lUrl.includes('orcid.org')) return 'ORCID';
    if (lUrl.includes('youtube.com')) return 'YOUTUBE';
    if (lUrl.includes('tiktok.com')) return 'TIKTOK';
    return null;
  }

  private static mapPlatformToId(platformName: string): string | null {
    // Hardcoded typical IDs for V1 pilot, in prod we'd query atlas_social_platforms
    const map: Record<string, string> = {
      'LINKEDIN': 'LINKEDIN',
      'X': 'X',
      'FACEBOOK': 'FACEBOOK',
      'INSTAGRAM': 'INSTAGRAM',
      'GITHUB': 'GITHUB',
      'ORCID': 'ORCID',
      'YOUTUBE': 'YOUTUBE',
      'TIKTOK': 'TIKTOK'
    };
    return map[platformName] || null;
  }
}
