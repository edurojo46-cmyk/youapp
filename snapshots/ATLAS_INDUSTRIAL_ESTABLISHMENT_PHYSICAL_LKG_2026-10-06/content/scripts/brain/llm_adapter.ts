import { FactPack } from './evidence_resolver';

export interface LLMClaim {
    claim_type: 'NAME' | 'COMPANY' | 'ROLE' | 'INDUSTRY';
    claim_text: string;
}

export interface MessageGenerationOutput {
    subject: string;
    body: string;
    claims: LLMClaim[];
    model: string;
    prompt_version: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens?: number;
    };
}

export interface LLMAdapter {
    generate(factPack: FactPack, templateId: string): Promise<MessageGenerationOutput>;
}

/**
 * Deterministic Dummy Adapter for Phase 7A.
 * Simulates an LLM strictly honoring the provided Fact Pack.
 */
export class DummyLLMAdapter implements LLMAdapter {
    
    async generate(factPack: FactPack, templateId: string): Promise<MessageGenerationOutput> {
        const claims: LLMClaim[] = [];
        
        let body = 'Hola';
        
        if (factPack.name) {
            body += ` ${factPack.name.value.split(' ')[0]}`;
            claims.push({ claim_type: 'NAME', claim_text: factPack.name.value });
        }
        
        body += ',\n\n';
        
        if (factPack.role && factPack.company) {
            body += `Vi que liderás como ${factPack.role.value} en ${factPack.company.value}. `;
            claims.push({ claim_type: 'ROLE', claim_text: factPack.role.value });
            claims.push({ claim_type: 'COMPANY', claim_text: factPack.company.value });
        } else if (factPack.company) {
            body += `Vi el excelente trabajo que están haciendo en ${factPack.company.value}. `;
            claims.push({ claim_type: 'COMPANY', claim_text: factPack.company.value });
        } else {
            body += `Me gustaría presentarte YouApp. `;
        }
        
        body += `¿Tendrías 15 minutos para conversar la próxima semana?`;

        // Deliberate test failure for "contradictory" evidence (Simulated LLM hallucination)
        if (factPack.role?.value === 'CONTRADICTORY_ROLE') {
            body = `Hola, vi que sos CEO de Google.`;
            claims.push({ claim_type: 'ROLE', claim_text: 'CEO' }); 
            claims.push({ claim_type: 'COMPANY', claim_text: 'Google' });
        }

        return {
            subject: 'Presentación de YouApp',
            body: body,
            claims: claims,
            model: 'dummy-llm-v1',
            prompt_version: 'v1.0.0-dummy'
        };
    }
}
