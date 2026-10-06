import { ContactSourceAdapter, CompanySearchCriteria, PersonSearchCriteria, CompanyCandidate, PersonCandidate } from './contact_source_adapter';
import crypto from 'crypto';

export class WebSearchSourceAdapter implements ContactSourceAdapter {
    private braveApiKey: string;

    constructor() {
        this.braveApiKey = process.env.BRAVE_SEARCH_API_KEY || '';
        if (!this.braveApiKey) {
            console.warn("WARNING: BRAVE_SEARCH_API_KEY is not set. Web search will fail.");
        }
    }

    async discoverCompanies(criteria: CompanySearchCriteria): Promise<CompanyCandidate[]> {
        const queryParts = [];
        if (criteria.sectors && criteria.sectors.length > 0) queryParts.push(criteria.sectors.join(' '));
        if (criteria.city) queryParts.push(criteria.city);
        if (criteria.country) queryParts.push(criteria.country);
        
        // Add terms to find actual company websites rather than directories
        queryParts.push('company OR empresa OR agency OR SaaS');
        
        const query = queryParts.join(' ');
        
        console.log(`[WebSearch] Querying Brave: "${query}"`);
        
        if (!this.braveApiKey) {
            const isTest = process.env.NODE_ENV === 'test';
            const allowFixtures = process.env.ATLAS_ALLOW_CONTACT_FIXTURES === 'true';
            
            if (!isTest && !allowFixtures) {
                throw new Error('FATAL_CONFIG: BRAVE_SEARCH_API_KEY missing in real mode.');
            }

            console.log(`[WebSearch] No Brave API Key, falling back to mock companies for pilot (FIXTURE).`);
            return [
                {
                    company_candidate_id: crypto.randomUUID(),
                    company_name: 'Auth0',
                    domain: 'auth0.com',
                    country: criteria.country,
                    city: criteria.city,
                    sector: criteria.sectors?.[0],
                    source_url: 'https://auth0.com/',
                    confidence: 0.95
                },
                {
                    company_candidate_id: crypto.randomUUID(),
                    company_name: 'Mercado Libre',
                    domain: 'mercadolibre.com.ar',
                    country: criteria.country,
                    city: criteria.city,
                    sector: criteria.sectors?.[0],
                    source_url: 'https://mercadolibre.com.ar/',
                    confidence: 0.90
                }
            ];
        }

        try {
            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${criteria.limit || 10}`, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': this.braveApiKey
                }
            });

            if (!response.ok) {
                console.error(`Brave API error: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json();
            const results = data.web?.results || [];
            
            const companies: CompanyCandidate[] = [];
            
            for (const result of results) {
                try {
                    const url = new URL(result.url);
                    const domain = url.hostname.replace(/^www\./, '');
                    
                    // Skip common directories and social networks
                    if (domain.includes('linkedin.com') || domain.includes('facebook.com') || domain.includes('instagram.com') || domain.includes('crunchbase.com') || domain.includes('zoominfo.com')) {
                        continue;
                    }

                    companies.push({
                        company_candidate_id: crypto.randomUUID(),
                        company_name: result.title.split('-')[0].trim(),
                        domain: domain,
                        country: criteria.country,
                        city: criteria.city,
                        sector: criteria.sectors?.[0],
                        source_url: result.url,
                        confidence: 0.85
                    });
                } catch(e) {
                    // skip invalid URLs
                }
            }
            
            // Deduplicate by domain
            const uniqueCompanies = Array.from(new Map(companies.map(c => [c.domain, c])).values());
            
            return uniqueCompanies;
        } catch (err) {
            console.error("[WebSearch] Failed to execute web search", err);
            return [];
        }
    }

    async discoverPeople(company: CompanyCandidate, criteria: PersonSearchCriteria): Promise<PersonCandidate[]> {
        // Web search is not primarily used for person discovery in this pilot.
        // We will use CompanyWebsiteSourceAdapter for that.
        return [];
    }
}
