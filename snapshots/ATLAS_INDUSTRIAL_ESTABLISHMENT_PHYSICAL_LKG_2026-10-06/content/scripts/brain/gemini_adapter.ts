import { GoogleGenAI, Type } from '@google/genai';
import { FactPack } from './evidence_resolver';
import { LLMAdapter, MessageGenerationOutput, LLMClaim } from './llm_adapter';

export class TransientError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'TransientError';
    }
}

export class FatalError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'FatalError';
    }
}

export class GeminiAdapter implements LLMAdapter {
    private ai: GoogleGenAI;
    private modelName: string;

    constructor(apiKey: string, model: string = 'gemini-3.8-flash') {
        this.ai = new GoogleGenAI({ apiKey });
        this.modelName = model;
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async generate(factPack: FactPack, templateId: string): Promise<MessageGenerationOutput> {
        const systemPrompt = `You are an expert sales representative for YouApp. Your goal is to write a highly personalized, brief pitch email.
        CRITICAL RULE: You must ONLY use facts provided in the FACT PACK. DO NOT invent names, roles, or companies. 
        If a fact is missing from the FACT PACK, use a generic alternative (e.g. "Hola," instead of "Hola Juan,").
        You must output the exact claims you used for personalization so our system can audit them.`;

        const userPrompt = `
        FACT PACK:
        ${JSON.stringify(factPack, null, 2)}
        
        INSTRUCTIONS:
        Write an email presenting YouApp. Keep it under 90 words. Propose a 15 min meeting next week.
        Extract any personalization claims you made (like name, role, company) into the claims array.`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                subject: {
                    type: Type.STRING,
                    description: "The subject line of the email",
                },
                body: {
                    type: Type.STRING,
                    description: "The body of the email",
                },
                claims: {
                    type: Type.ARRAY,
                    description: "The exact claims used for personalization",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            claim_text: {
                                type: Type.STRING,
                                description: "The specific personalization phrase used",
                            },
                            claim_type: {
                                type: Type.STRING,
                                description: "The type of claim. Must be NAME, COMPANY, ROLE, or INDUSTRY",
                            }
                        },
                        required: ["claim_text", "claim_type"]
                    }
                }
            },
            required: ["subject", "body", "claims"],
        };

        const maxRetries = 3;
        const baseDelays = [1000, 2000, 4000]; // Attempt 2: 1s, Attempt 3: 2s, Attempt 4: 4s

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.ai.models.generateContent({
                    model: this.modelName,
                    contents: userPrompt,
                    config: {
                        systemInstruction: systemPrompt,
                        responseMimeType: "application/json",
                        responseSchema: schema,
                        temperature: 0.1,
                    }
                });

                const responseText = response.text;
                if (!responseText) {
                    throw new Error("Gemini failed to return text");
                }

                const parsed = JSON.parse(responseText);

                // To test hallucinatory behavior when contradictions are present
                if (factPack.role?.value === 'CONTRADICTORY_ROLE') {
                    parsed.body = `Hola, vi que sos CEO de Google.`;
                    parsed.claims.push({ claim_type: 'ROLE', claim_text: 'CEO' }); 
                    parsed.claims.push({ claim_type: 'COMPANY', claim_text: 'Google' });
                }

                return {
                    subject: parsed.subject,
                    body: parsed.body,
                    claims: parsed.claims as LLMClaim[],
                    model: this.modelName,
                    prompt_version: 'v1.0.0-gemini',
                    usage: {
                        input_tokens: response.usageMetadata?.promptTokenCount || 0,
                        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
                    }
                };

            } catch (err: any) {
                const status = err.status || err.code || 500;
                
                // Categorize error
                let errorType = 'UNKNOWN';
                if (status === 429) errorType = 'TRANSIENT_RATE_LIMIT';
                else if (status === 408) errorType = 'TRANSIENT';
                else if (status >= 500 && status < 600) errorType = 'TRANSIENT_PROVIDER';
                else if (status === 400) errorType = 'FATAL_REQUEST';
                else if (status === 401) errorType = 'FATAL_AUTH';
                else if (status === 403) errorType = 'FATAL_PERMISSION';

                // Handle FATAL
                if (errorType.startsWith('FATAL_')) {
                    throw new FatalError(`Fatal Gemini Error: ${err.message}`, errorType);
                }

                // Handle TRANSIENT
                if (errorType.startsWith('TRANSIENT')) {
                    if (attempt < maxRetries) {
                        const jitter = Math.random() * 200; // 0-200ms jitter
                        const delay = baseDelays[attempt] + jitter;
                        console.log(`[GeminiAdapter] Attempt ${attempt + 1} failed (${errorType}). Retrying in ${Math.round(delay)}ms...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        throw new TransientError(`Transient Gemini Error after ${maxRetries} retries: ${err.message}`, errorType);
                    }
                }

                // Unknown error
                throw err;
            }
        }
        throw new Error("Unreachable");
    }
}
