import { PersonCandidate } from './sources/contact_source_adapter';

export enum ResolutionDecision {
    SAME_ENTITY = 'SAME_ENTITY',
    REVIEW = 'REVIEW',
    DIFFERENT = 'DIFFERENT'
}

export class EntityResolver {
    
    resolve(personA: PersonCandidate, personB: PersonCandidate): ResolutionDecision {
        let score = 0;
        let matchedKeys = 0;

        // 1. Email exact match is a very strong signal
        if (personA.email && personB.email) {
            if (personA.email.toLowerCase().trim() === personB.email.toLowerCase().trim()) {
                return ResolutionDecision.SAME_ENTITY; 
            } else {
                // Different emails but same person? Possible, but drops confidence
                score -= 0.5;
            }
        }

        // 2. Name fuzzy matching
        if (this.fuzzyMatchName(personA.full_name, personB.full_name)) {
            score += 0.8;
            matchedKeys++;
        }

        // 3. Company / Domain matching
        if (personA.company_domain && personB.company_domain) {
            if (personA.company_domain.toLowerCase() === personB.company_domain.toLowerCase()) {
                score += 0.4;
                matchedKeys++;
            }
        } else if (personA.company_name && personB.company_name) {
            if (personA.company_name.toLowerCase().includes(personB.company_name.toLowerCase()) || 
                personB.company_name.toLowerCase().includes(personA.company_name.toLowerCase())) {
                score += 0.3;
                matchedKeys++;
            }
        }

        // 4. Role matching
        if (personA.job_title && personB.job_title) {
            if (personA.job_title.toLowerCase() === personB.job_title.toLowerCase()) {
                score += 0.2;
                matchedKeys++;
            }
        }

        if (score >= 0.98) return ResolutionDecision.SAME_ENTITY;
        if (score >= 0.82) return ResolutionDecision.REVIEW;
        return ResolutionDecision.DIFFERENT;
    }

    private fuzzyMatchName(nameA: string, nameB: string): boolean {
        const a = nameA.toLowerCase().trim();
        const b = nameB.toLowerCase().trim();
        if (a === b) return true;

        // "M. López" vs "María López"
        const partsA = a.split(' ');
        const partsB = b.split(' ');
        
        if (partsA.length === 2 && partsB.length === 2) {
            const [firstA, lastA] = partsA;
            const [firstB, lastB] = partsB;
            
            if (lastA === lastB) {
                if (firstA.startsWith(firstB.substring(0, 1)) || firstB.startsWith(firstA.substring(0, 1))) {
                    return true;
                }
            }
        }
        return false;
    }
}
