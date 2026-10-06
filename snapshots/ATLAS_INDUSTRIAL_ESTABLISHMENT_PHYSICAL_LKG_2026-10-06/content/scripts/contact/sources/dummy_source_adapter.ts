import {
    ContactSourceAdapter,
    CompanySearchCriteria,
    PersonSearchCriteria,
    CompanyCandidate,
    PersonCandidate,
    Evidence
} from './contact_source_adapter';

export class DummySourceAdapter implements ContactSourceAdapter {
    async discoverCompanies(criteria: CompanySearchCriteria): Promise<CompanyCandidate[]> {
        return [
            {
                company_candidate_id: 'comp-1',
                company_name: 'Acme Corp',
                domain: 'acme.com',
                city: criteria.city || 'Buenos Aires',
                sector: criteria.sectors?.[0] || 'technology',
                confidence: 0.95,
                source_url: 'https://directory.mock/acme'
            },
            {
                company_candidate_id: 'comp-2',
                company_name: 'Globex',
                domain: 'globex.com',
                city: criteria.city || 'Buenos Aires',
                sector: criteria.sectors?.[0] || 'technology',
                confidence: 0.90,
                source_url: 'https://directory.mock/globex'
            }
        ];
    }

    async discoverPeople(company: CompanyCandidate, criteria: PersonSearchCriteria): Promise<PersonCandidate[]> {
        const people: PersonCandidate[] = [];

        if (company.company_name === 'Acme Corp') {
            // Case 1: Perfect Person (Should PASS)
            people.push({
                person_candidate_id: 'pers-1',
                company_candidate_id: company.company_candidate_id,
                full_name: 'María López',
                job_title: 'Head of Sales',
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'm.lopez@acme.com',
                source_url: 'https://acme.com/team',
                source_type: 'COMPANY_WEBSITE',
                confidence: 0.96,
                evidence: [
                    { field: 'full_name', value: 'María López', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.95 },
                    { field: 'company_name', value: 'Acme Corp', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.95 },
                    { field: 'job_title', value: 'Head of Sales', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.95 },
                    { field: 'email', value: 'm.lopez@acme.com', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.95 }
                ]
            });

            // Case 2: Duplicate Person (Different name format, same email) -> Should MERGE
            people.push({
                person_candidate_id: 'pers-2',
                company_candidate_id: company.company_candidate_id,
                full_name: 'M. López',
                job_title: 'Sales Director', // Slight variation
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'm.lopez@acme.com', // Hash will match
                source_url: 'https://linkedin.mock/in/mlopez',
                source_type: 'SOCIAL_NETWORK',
                confidence: 0.85,
                evidence: [
                    { field: 'full_name', value: 'M. López', source_url: 'https://linkedin.mock/in/mlopez', source_type: 'SOCIAL_NETWORK', observed_at: new Date().toISOString(), confidence: 0.85 },
                    { field: 'company_name', value: 'Acme Corp', source_url: 'https://linkedin.mock/in/mlopez', source_type: 'SOCIAL_NETWORK', observed_at: new Date().toISOString(), confidence: 0.85 },
                    { field: 'job_title', value: 'Sales Director', source_url: 'https://linkedin.mock/in/mlopez', source_type: 'SOCIAL_NETWORK', observed_at: new Date().toISOString(), confidence: 0.85 },
                    { field: 'email', value: 'm.lopez@acme.com', source_url: 'https://contact-db.mock/123', source_type: 'DATA_BROKER', observed_at: new Date().toISOString(), confidence: 0.60 }
                ]
            });

            // Case 3: Same Name, Different Person (No merge expected)
            people.push({
                person_candidate_id: 'pers-3',
                company_candidate_id: company.company_candidate_id,
                full_name: 'María López',
                job_title: 'Software Engineer',
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'maria.l@acme.com',
                source_url: 'https://acme.com/engineering',
                source_type: 'COMPANY_WEBSITE',
                confidence: 0.90,
                evidence: [
                    { field: 'full_name', value: 'María López', source_url: 'https://acme.com/engineering', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 },
                    { field: 'company_name', value: 'Acme Corp', source_url: 'https://acme.com/engineering', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 },
                    { field: 'job_title', value: 'Software Engineer', source_url: 'https://acme.com/engineering', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 },
                    { field: 'email', value: 'maria.l@acme.com', source_url: 'https://acme.com/engineering', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 }
                ]
            });
            
            // Case 4: No Evidence (Should REJECT)
            people.push({
                person_candidate_id: 'pers-4',
                company_candidate_id: company.company_candidate_id,
                full_name: 'Ghost User',
                job_title: 'VP Sales',
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'ghost@acme.com',
                source_url: 'https://unknown.mock/ghost',
                source_type: 'UNKNOWN',
                confidence: 0.20,
                evidence: [] // Empty evidence array
            });

            // Case 5: Contradictory Evidence (Should REVIEW_REQUIRED)
            people.push({
                person_candidate_id: 'pers-5',
                company_candidate_id: company.company_candidate_id,
                full_name: 'Juan Perez',
                job_title: 'CEO',
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'jperez@acme.com',
                source_url: 'https://acme.com/team',
                source_type: 'COMPANY_WEBSITE',
                confidence: 0.80,
                evidence: [
                    { field: 'job_title', value: 'CEO', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 },
                    { field: 'job_title', value: 'Intern', source_url: 'https://other.mock/jp', source_type: 'SOCIAL_NETWORK', observed_at: new Date().toISOString(), confidence: 0.80 },
                    { field: 'email', value: 'jperez@acme.com', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 }
                ]
            });
            
            // Case 6: Suppressed Person (Simulated, will be suppressed later by DB checks)
            people.push({
                person_candidate_id: 'pers-6',
                company_candidate_id: company.company_candidate_id,
                full_name: 'Carlos Banned',
                job_title: 'CMO',
                company_name: company.company_name,
                company_domain: company.domain,
                email: 'carlos@acme.com', // Assume this will be inserted as SUPPRESSED in test setup
                source_url: 'https://acme.com/team',
                source_type: 'COMPANY_WEBSITE',
                confidence: 0.90,
                evidence: [
                    { field: 'job_title', value: 'CMO', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 },
                    { field: 'email', value: 'carlos@acme.com', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.90 }
                ]
            });
        }
        // Case 7: Laura Suppressed (High confidence, verified email, but suppressed)
        people.push({
            person_candidate_id: 'pers-7',
            company_candidate_id: company.company_candidate_id,
            full_name: 'Laura Suppressed',
            job_title: 'CTO',
            company_name: company.company_name,
            company_domain: company.domain,
            email: 'laura@acme.com',
            source_url: 'https://acme.com/team',
            source_type: 'COMPANY_WEBSITE',
            confidence: 0.96, // HIGH_CONFIDENCE
            suppressed: true,
            evidence: [
                { field: 'full_name', value: 'Laura Suppressed', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.96 },
                { field: 'job_title', value: 'CTO', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.96 },
                { field: 'email', value: 'laura@acme.com', source_url: 'https://acme.com/team', source_type: 'COMPANY_WEBSITE', observed_at: new Date().toISOString(), confidence: 0.96 },
                { field: 'email_verification', value: 'valid', source_url: 'https://hunter.mock', source_type: 'EMAIL_VERIFICATION', observed_at: new Date().toISOString(), confidence: 0.96 }
            ]
        });
        
        return people;
    }
}
