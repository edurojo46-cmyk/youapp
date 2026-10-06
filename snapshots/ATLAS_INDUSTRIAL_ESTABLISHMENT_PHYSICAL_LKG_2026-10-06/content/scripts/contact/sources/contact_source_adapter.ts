export interface CompanySearchCriteria {
    sectors?: string[];
    employee_min?: number;
    employee_max?: number;
    country?: string;
    region?: string;
    city?: string;
    limit?: number;
}

export interface PersonSearchCriteria {
    roles?: string[];
    departments?: string[];
    seniorities?: string[];
    limit?: number;
}

export interface Evidence {
    field: string;
    value: string;
    source_url: string;
    source_type: string;
    observed_at: string;
    confidence: number;
}

export interface CompanyCandidate {
    company_candidate_id: string;
    company_name: string;
    domain: string;
    country?: string;
    city?: string;
    sector?: string;
    source_url?: string;
    confidence: number;
}

export interface PersonCandidate {
    person_candidate_id: string;
    company_candidate_id?: string;
    full_name: string;
    job_title?: string;
    company_name?: string;
    company_domain?: string;
    email?: string;
    source_url?: string;
    source_type?: string;
    confidence: number;
    suppressed?: boolean;
    evidence: Evidence[];
}

export interface ContactSourceAdapter {
    discoverCompanies(criteria: CompanySearchCriteria): Promise<CompanyCandidate[]>;
    discoverPeople(company: CompanyCandidate, criteria: PersonSearchCriteria): Promise<PersonCandidate[]>;
    enrichPerson?(person: PersonCandidate): Promise<Evidence[]>;
}
