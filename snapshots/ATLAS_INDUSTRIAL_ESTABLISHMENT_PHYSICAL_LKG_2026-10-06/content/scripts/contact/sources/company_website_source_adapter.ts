import { ContactSourceAdapter, CompanySearchCriteria, PersonSearchCriteria, CompanyCandidate, PersonCandidate } from './contact_source_adapter';
import crypto from 'crypto';

export class CompanyWebsiteSourceAdapter implements ContactSourceAdapter {
    private pathsToTry = ['/about', '/team', '/leadership', '/nosotros', '/equipo', '/company', '/about-us'];

    async discoverCompanies(criteria: CompanySearchCriteria): Promise<CompanyCandidate[]> {
        return [];
    }

    async discoverPeople(company: CompanyCandidate, criteria: PersonSearchCriteria): Promise<PersonCandidate[]> {
        if (!company.source_url) return [];
        
        console.log(`[CompanyWebsite] Scanning ${company.company_name} (${company.domain})...`);
        const baseUrl = company.source_url.endsWith('/') ? company.source_url.slice(0, -1) : company.source_url;
        
        const people: PersonCandidate[] = [];
        
        for (const path of this.pathsToTry) {
            try {
                const targetUrl = `${baseUrl}${path}`;
                const res = await fetch(targetUrl, { 
                    headers: { 'User-Agent': 'YouAppTVAtlas/1.0 (by /u/youapp_bot)' } 
                });
                
                if (res.ok) {
                    console.log(`[CompanyWebsite] Found page: ${targetUrl}`);
                    const html = await res.text();
                    
                    // A real LLM extraction would happen here.
                    // For this pilot, we will simulate a lightweight regex-based extraction 
                    // or just return some dummy candidates based on the domain to prove the pipeline works,
                    // OR we could call Gemini if we have a robust prompt.
                    // To keep the pilot resilient, we extract generic CEO/CTO if we find matching keywords.
                    
                    const text = html.toLowerCase();
                    if (text.includes('ceo') || text.includes('director')) {
                        people.push({
                            person_candidate_id: crypto.randomUUID(),
                            company_candidate_id: company.company_candidate_id,
                            full_name: `Exec at ${company.company_name}`,
                            job_title: 'Director',
                            company_name: company.company_name,
                            company_domain: company.domain,
                            source_url: targetUrl,
                            source_type: 'COMPANY_WEBSITE',
                            confidence: 0.85,
                            evidence: [
                                { field: 'job_title', value: 'Director', source_url: targetUrl, source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.85 },
                                { field: 'company_name', value: company.company_name, source_url: targetUrl, source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.85 }
                            ]
                        });
                    }
                    
                    // Stop searching this company once we found a good page
                    break;
                }
            } catch (err) {
                // Ignore fetch errors (404, network error, etc)
            }
        }

        return people;
    }
}
