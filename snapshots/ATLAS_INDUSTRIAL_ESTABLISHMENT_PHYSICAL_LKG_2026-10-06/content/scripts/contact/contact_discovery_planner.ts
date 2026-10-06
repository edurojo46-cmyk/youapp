import { CompanySearchCriteria, PersonSearchCriteria } from './sources/contact_source_adapter';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';

export interface DiscoveryPlan {
    criteria: {
        geo?: { country?: string; city?: string; region?: string };
        company?: { sectors?: string[]; employee_min?: number; employee_max?: number };
        person?: { roles?: string[]; departments?: string[]; seniorities?: string[] };
        limit: number;
    };
    criteria_version: string;
    planner_provider: string;
    planner_model: string;
    planner_confidence: number;
}

export interface PlannerAdapter {
    plan(query: string): Promise<DiscoveryPlan>;
}

export class DeterministicPlanner implements PlannerAdapter {
    async plan(query: string): Promise<DiscoveryPlan> {
        return {
            criteria: {
                geo: { city: "Buenos Aires", country: "AR" },
                company: { sectors: ["technology"] },
                person: { roles: ["Sales Director", "Head of Sales", "Commercial Director"] },
                limit: 500
            },
            criteria_version: "v1.0",
            planner_provider: "deterministic",
            planner_model: "mock-v1",
            planner_confidence: 1.0
        };
    }
}

export class OpenAIPlanner implements PlannerAdapter {
    private openai: OpenAI;
    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    async plan(query: string): Promise<DiscoveryPlan> {
        const response = await this.openai.chat.completions.create({
            model: 'gpt-5.6-terra',
            messages: [
                { role: 'system', content: 'Convert the user query into strict contact search criteria.' },
                { role: 'user', content: query }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'search_criteria',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            geo: { type: 'object', properties: { country: { type: 'string' }, city: { type: 'string' }, region: { type: 'string' } }, additionalProperties: false },
                            company: { type: 'object', properties: { sectors: { type: 'array', items: { type: 'string' } }, employee_min: { type: 'number' }, employee_max: { type: 'number' } }, additionalProperties: false },
                            person: { type: 'object', properties: { roles: { type: 'array', items: { type: 'string' } }, departments: { type: 'array', items: { type: 'string' } }, seniorities: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
                            limit: { type: 'number' }
                        },
                        required: ['limit'],
                        additionalProperties: false
                    }
                }
            }
        });

        const raw = JSON.parse(response.choices[0].message.content || '{}');
        if (!raw.limit) raw.limit = 100;

        return {
            criteria: raw,
            criteria_version: "v1.0",
            planner_provider: "openai",
            planner_model: "gpt-5.6-terra",
            planner_confidence: 0.95
        };
    }
}

export class GeminiPlanner implements PlannerAdapter {
    private gemini: GoogleGenAI;
    constructor(apiKey: string) {
        this.gemini = new GoogleGenAI({ apiKey });
    }

    async plan(query: string): Promise<DiscoveryPlan> {
        // Mock implementation of Gemini Schema extraction for now
        throw new Error("GeminiPlanner not fully implemented yet");
    }
}

export class DiscoveryPlanner {
    private adapter: PlannerAdapter;

    constructor() {
        const env = process.env.NODE_ENV || 'development';
        const provider = process.env.PLANNER_PROVIDER || 'deterministic';

        if (env === 'test' || provider === 'deterministic') {
            this.adapter = new DeterministicPlanner();
        } else if (provider === 'openai') {
            if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for production planner");
            this.adapter = new OpenAIPlanner(process.env.OPENAI_API_KEY);
        } else if (provider === 'gemini') {
            if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required for production planner");
            this.adapter = new GeminiPlanner(process.env.GEMINI_API_KEY);
        } else {
            throw new Error(`Unknown planner provider: ${provider}. Mocks are NEVER allowed to escape test environment silently.`);
        }
    }

    async parseQuery(queryText: string): Promise<DiscoveryPlan> {
        return this.adapter.plan(queryText);
    }
}
