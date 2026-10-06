import { PersonCandidate, Evidence } from './contact_source_adapter';

export interface EmailCandidate {
    email: string;
    confidence: number;
    sources: string[];
}

export interface EmailVerification {
    status: 'VERIFIED' | 'REVIEW_REQUIRED' | 'REJECTED';
    provider_status: string;
    score: number;
}

export interface EmailDiscoveryAdapter {
    findEmail(input: { firstName: string; lastName: string; companyDomain: string; }): Promise<EmailCandidate | null>;
}

export interface EmailVerificationAdapter {
    verify(email: string): Promise<EmailVerification>;
}

export class HunterEmailAdapter implements EmailDiscoveryAdapter, EmailVerificationAdapter {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.HUNTER_API_KEY || '';
        if (!this.apiKey) {
            console.warn("WARNING: HUNTER_API_KEY is not set. Email discovery/verification will mock results.");
        }
    }

    async findEmail(input: { firstName: string; lastName: string; companyDomain: string; }): Promise<EmailCandidate | null> {
        if (!this.apiKey) {
            const isTest = process.env.NODE_ENV === 'test';
            const allowFixtures = process.env.ATLAS_ALLOW_CONTACT_FIXTURES === 'true';
            
            if (!isTest && !allowFixtures) {
                throw new Error('FATAL_CONFIG: HUNTER_API_KEY missing in real mode.');
            }

            // Mock for pilot if no key
            return {
                email: `${input.firstName.toLowerCase()}.${input.lastName.toLowerCase()}@${input.companyDomain}`,
                confidence: 0.8,
                sources: ['hunter_mock']
            };
        }

        try {
            const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(input.companyDomain)}&first_name=${encodeURIComponent(input.firstName)}&last_name=${encodeURIComponent(input.lastName)}&api_key=${this.apiKey}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            
            if (data?.data?.email) {
                return {
                    email: data.data.email,
                    confidence: (data.data.score || 80) / 100,
                    sources: data.data.sources?.map((s: any) => s.uri) || ['hunter']
                };
            }
        } catch(e) {
            console.error("[Hunter] Error finding email", e);
        }
        return null;
    }

    async verify(email: string): Promise<EmailVerification> {
        if (!this.apiKey) {
            const isTest = process.env.NODE_ENV === 'test';
            const allowFixtures = process.env.ATLAS_ALLOW_CONTACT_FIXTURES === 'true';
            
            if (!isTest && !allowFixtures) {
                throw new Error('FATAL_CONFIG: HUNTER_API_KEY missing in real mode.');
            }

            // Mock for pilot if no key
            return {
                status: 'VERIFIED',
                provider_status: 'valid',
                score: 0.99
            };
        }

        try {
            const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${this.apiKey}`;
            const res = await fetch(url);
            if (!res.ok) return { status: 'REVIEW_REQUIRED', provider_status: 'error', score: 0 };
            
            const data = await res.json();
            const result = data?.data?.status; // valid, invalid, accept_all, webmail, disposable, unknown
            
            let status: 'VERIFIED' | 'REVIEW_REQUIRED' | 'REJECTED' = 'REVIEW_REQUIRED';
            
            if (result === 'valid') status = 'VERIFIED';
            else if (result === 'invalid' || result === 'disposable') status = 'REJECTED';
            else if (result === 'accept_all' || result === 'unknown') status = 'REVIEW_REQUIRED';
            
            return {
                status,
                provider_status: result || 'unknown',
                score: (data?.data?.score || 50) / 100
            };
        } catch(e) {
            console.error("[Hunter] Error verifying email", e);
            return { status: 'REVIEW_REQUIRED', provider_status: 'error', score: 0 };
        }
    }
}
