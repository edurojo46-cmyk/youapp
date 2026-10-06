import { OpenAI } from 'openai';
import { FactPack } from './evidence_resolver';
import { LLMAdapter, MessageGenerationOutput, LLMClaim } from './llm_adapter';
import { TransientError, FatalError } from './gemini_adapter';

export class OpenAIAdapter implements LLMAdapter {
    private openai: OpenAI;
    private modelName: string;

    constructor(apiKey: string, model: string = 'gpt-5.6-terra') {
        this.openai = new OpenAI({ apiKey });
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

        const maxRetries = 3;
        const baseDelays = [1000, 2000, 4000];

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // We use the regular chat completions create, not beta parse, to get standard usage data easily
                const response = await this.openai.chat.completions.create({
                    model: this.modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "email_generation",
                            description: "Generates a personalized email and extracts the claims used.",
                            strict: true,
                            schema: {
                                type: "object",
                                properties: {
                                    subject: { type: "string", description: "The subject line of the email" },
                                    body: { type: "string", description: "The body of the email" },
                                    claims: {
                                        type: "array",
                                        description: "The exact claims used for personalization",
                                        items: {
                                            type: "object",
                                            properties: {
                                                claim_text: { type: "string", description: "The specific personalization phrase used" },
                                                claim_type: { type: "string", description: "The type of claim.", enum: ["NAME", "COMPANY", "ROLE", "INDUSTRY"] }
                                            },
                                            required: ["claim_text", "claim_type"],
                                            additionalProperties: false
                                        }
                                    }
                                },
                                required: ["subject", "body", "claims"],
                                additionalProperties: false
                            }
                        }
                    },
                    temperature: 0.1,
                });

                const choice = response.choices[0];
                if (!choice || !choice.message.content) {
                    throw new Error("OpenAI failed to return text");
                }

                const parsed = JSON.parse(choice.message.content);

                // Simulated hallucination for adversarial/contradictory testing
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
                    prompt_version: 'v1.0.0-openai',
                    usage: {
                        input_tokens: response.usage?.prompt_tokens || 0,
                        output_tokens: response.usage?.completion_tokens || 0,
                        reasoning_tokens: (response.usage as any)?.completion_tokens_details?.reasoning_tokens || 0
                    }
                };

            } catch (err: any) {
                const status = err.status || err.code || 500;
                
                let errorType = 'UNKNOWN';
                if (status === 429) errorType = 'TRANSIENT_RATE_LIMIT';
                else if (status === 408) errorType = 'TRANSIENT';
                else if (status >= 500 && status < 600) errorType = 'TRANSIENT_PROVIDER';
                else if (status === 400) errorType = 'FATAL_REQUEST';
                else if (status === 401) errorType = 'FATAL_AUTH';
                else if (status === 403) errorType = 'FATAL_PERMISSION';

                if (errorType.startsWith('FATAL_')) {
                    throw new FatalError(`Fatal OpenAI Error: ${err.message}`, errorType);
                }

                if (errorType.startsWith('TRANSIENT')) {
                    if (attempt < maxRetries) {
                        const jitter = Math.random() * 200;
                        const delay = baseDelays[attempt] + jitter;
                        console.log(`[OpenAIAdapter] Attempt ${attempt + 1} failed (${errorType}). Retrying in ${Math.round(delay)}ms...`);
                        await this.sleep(delay);
                        continue;
                    } else {
                        throw new TransientError(`Transient OpenAI Error after ${maxRetries} retries: ${err.message}`, errorType);
                    }
                }
                
                throw err;
            }
        }
        throw new Error("Unreachable");
    }
}
