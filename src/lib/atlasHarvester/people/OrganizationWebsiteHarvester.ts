import { BasePersonHarvester } from './BasePersonHarvester';
import type { ExternalPersonObservation } from '../../../lib/search/IExternalPersonSourceAdapter';
import * as cheerio from 'cheerio'; // We assume cheerio is available or we can use DOMParser in browser, but this is a Node harvester
import { fetchWebPage } from '../../../lib/ai/gemini/GeminiSearchGrounding'; // Using whatever fetch utility exists, or native fetch

const ALLOWED_SOCIAL_DOMAINS = [
  'linkedin.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'github.com',
  'orcid.org',
  'youtube.com'
];

export class OrganizationWebsiteHarvester extends BasePersonHarvester {
  private domain: string;
  private organizationName: string;
  private pagesToCrawl: string[] = [];

  constructor(domain: string, organizationName: string) {
    super();
    this.domain = domain;
    this.organizationName = organizationName;
  }

  getSourceId(): string {
    return `ORG_WEB_${this.domain.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
  }

  async discoverSourceVersion(): Promise<string> {
    // For a website, version could be the ETag of the /team page, or just today's date.
    return new Date().toISOString().split('T')[0];
  }

  async fetch(): Promise<any> {
    // Deterministic URL discovery
    const candidates = [
      `https://${this.domain}/team`,
      `https://${this.domain}/about`,
      `https://${this.domain}/staff`,
      `https://${this.domain}/nosotros`,
      `https://${this.domain}/equipo`,
      `https://${this.domain}/leadership`
    ];

    const results = [];
    
    for (const url of candidates) {
       try {
         const response = await fetch(url, { headers: { 'User-Agent': 'AtlasCabaHarvester/2.0' } });
         if (response.ok && response.status === 200) {
            const html = await response.text();
            results.push({ url, html });
            // For a production harvester, we might only take the first successful one 
            // or crawl all successful ones. We'll take all that return 200.
         }
       } catch (err) {
         // ignore fetch errors for invalid paths
       }
    }

    if (results.length === 0) {
       console.log(`[${this.getSourceId()}] No standard team pages found. Gemini discovery fallback could be used here.`);
       // MOCK FALLBACK for pilot
    }

    return results; // Array of {url, html}
  }

  async parse(rawData: any): Promise<any[]> {
    const peopleParsed = [];

    for (const page of rawData) {
       const $ = cheerio.load(page.html);
       
       // 1. JSON-LD Extraction
       const scripts = $('script[type="application/ld+json"]');
       scripts.each((_, el) => {
         try {
           const json = JSON.parse($(el).html() || '{}');
           const parseJsonLd = (obj: any) => {
             if (!obj) return;
             if (obj['@type'] === 'Person') {
                peopleParsed.push({
                   source_url: page.url,
                   name: obj.name,
                   jobTitle: obj.jobTitle,
                   sameAs: obj.sameAs,
                   image: obj.image
                });
             }
             if (Array.isArray(obj)) obj.forEach(parseJsonLd);
             if (typeof obj === 'object') Object.values(obj).forEach(parseJsonLd);
           };
           parseJsonLd(json);
         } catch (e) {}
       });

       // 2. DOM Extraction (Rel=me or explicit team blocks)
       // A person must be enclosed in a clear container. Global links are ignored.
       $('.team-member, .person, .staff-member, [itemtype*="Person"], .profile-card, .bio').each((_, el) => {
          const name = $(el).find('.name, h2, h3, [itemprop="name"]').first().text().trim();
          const role = $(el).find('.role, .title, [itemprop="jobTitle"]').first().text().trim();
          const img = $(el).find('img').attr('src');
          const links: string[] = [];
          
          // Strict Ownership: Only look for links INSIDE this specific person's card/container.
          // This excludes header/footer global company links.
          $(el).find('a').each((_, a) => {
            const href = $(a).attr('href');
            if (href && ALLOWED_SOCIAL_DOMAINS.some(d => href.includes(d))) {
               // Negative filter: if the URL looks like the company's generic handle, skip it
               if (href.toLowerCase().includes('/company/') || href.toLowerCase().endsWith(this.organizationName.toLowerCase())) {
                  return;
               }
               links.push(href);
            }
          });

          if (name && (role || links.length > 0)) {
            peopleParsed.push({
               source_url: page.url,
               name: name,
               jobTitle: role,
               sameAs: links,
               // Strict Ownership: Image must be inside the person's card.
               image: img ? new URL(img, page.url).toString() : null
            });
          }
       });
    }

    // Deduplicate by name
    const unique = new Map();
    for (const p of peopleParsed) {
       if (p.name && !unique.has(p.name)) {
         unique.set(p.name, p);
       }
    }

    return Array.from(unique.values());
  }

  async normalize(parsedData: any[]): Promise<ExternalPersonObservation[]> {
    const observations: ExternalPersonObservation[] = [];
    const now = new Date().toISOString();

    for (const data of parsedData) {
      
      const social_profiles = (Array.isArray(data.sameAs) ? data.sameAs : [data.sameAs])
        .filter(Boolean)
        .map((url: string) => {
           let platform = 'UNKNOWN';
           if (url.includes('linkedin.com')) platform = 'LINKEDIN';
           else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'X';
           else if (url.includes('instagram.com')) platform = 'INSTAGRAM';
           else if (url.includes('facebook.com')) platform = 'FACEBOOK';
           else if (url.includes('github.com')) platform = 'GITHUB';
           
           return {
             platform,
             url,
             status: 'VERIFIED' // It was explicitly linked on the organization site
           };
        });

        let relation = "TEAM_MEMBER";
        let isEmploymentConfirmed = false;
        
        const lowerRole = (data.jobTitle || '').toLowerCase();
        if (lowerRole.includes('founder') || lowerRole.includes('fundador')) {
           relation = "FOUNDER_OF";
        } else if (lowerRole.includes('board') || lowerRole.includes('director') || lowerRole.includes('consejo')) {
           relation = "BOARD_MEMBER_OF";
        } else if (lowerRole.includes('advisor') || lowerRole.includes('asesor')) {
           relation = "ADVISOR_TO";
        } else if (lowerRole.includes('ceo') || lowerRole.includes('cto') || lowerRole.includes('chief') || lowerRole.includes('executive')) {
           relation = "EXECUTIVE_OF";
           isEmploymentConfirmed = true;
        } else if (lowerRole.includes('engineer') || lowerRole.includes('manager') || lowerRole.includes('lead') || lowerRole.includes('developer') || lowerRole.includes('designer')) {
           relation = "EMPLOYED_BY";
           isEmploymentConfirmed = true;
        } else if (lowerRole.includes('author') || lowerRole.includes('writer') || lowerRole.includes('autor')) {
           relation = "CONTENT_AUTHOR";
        }

        observations.push({
          source_system: 'ORGANIZATION_WEBSITE',
          source_tier: 'TIER_B_ORGANIZATION_DIRECTORY',
          source_record_id: `${this.domain}_${data.name.replace(/\s+/g, '_')}`,
          source_url: data.source_url,
          observed_at: now,
          display_name: data.name,
          profession: data.jobTitle || 'UNKNOWN',
          location: 'UNKNOWN', // CABA Pilot: Never assume Person location based on Company location
          location_relation_type: 'UNKNOWN',
          company: this.organizationName,
          age: 'UNKNOWN',
          email: 'UNKNOWN',
          phone: 'UNKNOWN',
          strong_identifiers: {},
          social_profiles: social_profiles,
          photo_url: data.image || undefined,
          
          employmentEvidence: {
             status: isEmploymentConfirmed ? "CONFIRMED" : "POSSIBLE",
             relation: relation as any,
             organization: this.organizationName,
             source: data.source_url,
             current: true
          }
        });
    }

    return observations;
  }
}
