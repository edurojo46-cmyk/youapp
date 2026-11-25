import type { ExternalFilterCapabilities, ExternalPersonObservation, ExternalSearchFilters, IExternalPersonSourceAdapter } from '../IExternalPersonSourceAdapter';
export class OrcidAdapter implements IExternalPersonSourceAdapter {
  private accessToken: string | null = null;
  private clientId = typeof process !== 'undefined' ? process.env?.ORCID_CLIENT_ID : undefined;
  private clientSecret = typeof process !== 'undefined' ? process.env?.ORCID_CLIENT_SECRET : undefined;

  getAdapterId(): string {
    return 'ORCID_PUBLIC_API';
  }

  getCapabilities(): ExternalFilterCapabilities {
    return {
      name_search: true,
      profession_filter: false, // ORCID searches by keyword/affiliation, not strictly profession
      location_filter: false,
      age_filter: false,
      company_filter: true, // Affiliation search
      public_email: false,
      public_phone: false
    };
  }

  private async authenticate(): Promise<boolean> {
    if (this.accessToken) return true;
    if (!this.clientId || !this.clientSecret) {
      console.warn("ORCID Adapter: Missing ORCID_CLIENT_ID or ORCID_CLIENT_SECRET");
      return false;
    }

    try {
      const response = await fetch('https://orcid.org/oauth/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: '/read-public'
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      this.accessToken = data.access_token;
      return true;
    } catch (err) {
      console.error("ORCID Auth error:", err);
      return false;
    }
  }

  async search(filters: ExternalSearchFilters): Promise<ExternalPersonObservation[]> {
    const isAuth = await this.authenticate();
    if (!isAuth) {
       console.warn("ORCID_LIVE = BLOCKED. Missing credentials.");
       return [];
    }

    let q = '';
    
    if (filters.query_intent) {
      if (filters.query_intent.person_name) {
        q += `${filters.query_intent.person_name} `;
      }
      if (filters.query_intent.organization) {
        q += `affiliation-org-name:"${filters.query_intent.organization}" `;
      }
      // ORCID doesn't have strict profession search, we can use keywords if it's research
      if (filters.query_intent.activity) {
        q += `keyword:"${filters.query_intent.activity}" `;
      }
    } else if (filters.name) {
      q += `${filters.name}`;
    }

    q = q.trim();
    if (!q) return [];

    try {
      // 1. Search for ORCID IDs
      const searchRes = await fetch(`https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(q)}&rows=5`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!searchRes.ok) return [];
      const searchData = await searchRes.json();
      
      const results: ExternalPersonObservation[] = [];
      const numFound = searchData['expanded-result'] || [];

      // 2. We could fetch individual profiles, but expanded-search gives us name, current-institution, etc.
      // Flow: "fetch public record for relevant IDs -> normalize public evidence."
      for (const item of numFound) {
        const orcidId = item['orcid-id'];
        if (!orcidId) continue;
        
        // Fetch detailed public record
        const recordRes = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/record`, {
           headers: {
             'Authorization': `Bearer ${this.accessToken}`,
             'Accept': 'application/json'
           }
        });

        if (!recordRes.ok) continue;
        const recordData = await recordRes.json();
        
        const personData = recordData.person?.name;
        const displayName = `${personData?.['given-names']?.value || ''} ${personData?.['family-name']?.value || ''}`.trim();
        
        // Extract employments
        const employments = recordData['activities-summary']?.employments?.['affiliation-group'] || [];
        let company = null;
        if (employments.length > 0) {
           const latest = employments[0]['employment-summary']?.[0];
           if (latest) {
              company = latest.organization?.name || null;
           }
        }

        results.push({
          source_system: 'ORCID',
          source_record_id: orcidId,
          source_url: `https://orcid.org/${orcidId}`,
          observed_at: new Date().toISOString(),
          display_name: displayName || item['given-names'] || orcidId,
          profession: 'Researcher / Academic', // Implicit from source
          location: null, // ORCID doesn't reliably expose location
          company: company,
          age: 'UNKNOWN',
          email: 'UNKNOWN',
          phone: 'UNKNOWN',
          provenance_quality: 'HIGH',
          strong_identifiers: {
             verified_url: `https://orcid.org/${orcidId}`
          }
        });
      }

      return results;
    } catch (err) {
      console.error('ORCID adapter error:', err);
      return [];
    }
  }
}
