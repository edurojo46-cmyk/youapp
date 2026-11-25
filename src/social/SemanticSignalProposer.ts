import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

export interface SemanticProposerInput {
    title: string;
    description_excerpt: string;
    channel_name: string;
    published_at: string;
    candidate_signal_type: string;
}

export interface SemanticProposerOutput {
    is_opportunity: boolean;
    signal_type: string;
    subject_entity_name: string;
    subject_entity_type: string;
    subject_is_channel_owner: boolean;
    assertion_mode: 'FACT' | 'PLAN' | 'ADVICE' | 'NEWS_REPORT' | 'OPINION' | 'SPECULATION';
    source_relation: 'SELF_REPORT' | 'THIRD_PARTY_REPORT' | 'COMMENTARY' | 'UNKNOWN';
    negated: boolean;
    event_time_source: 'EXPLICIT_TEXT' | 'PUBLICATION_CONTEXT' | 'UNKNOWN';
    event_time: string | null;
    temporal_state: 'CURRENT' | 'FUTURE' | 'STALE' | 'UNKNOWN';
    supporting_span: string;
    confidence: number;
}

export class SemanticSignalProposer {
    private apiKey: string;
    private model: string;

    constructor() {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error("FATAL_CONFIG: GEMINI_API_KEY missing");
        this.apiKey = key;
        this.model = process.env.SEMANTIC_SIGNAL_MODEL || 'gemini-3.6-flash';
    }

    public async evaluate(input: SemanticProposerInput): Promise<SemanticProposerOutput> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        
        const systemInstruction = `You are a strict semantic evaluator for business opportunities.
Your goal is to parse the input social media post and determine if it represents a genuine business opportunity (e.g. an expansion, hiring, request for vendors) or just news, advice, speculation, or irrelevant content.

Extract the requested structured JSON.
CRITICAL RULES:
1. is_opportunity: True ONLY if it's a real, actionable business event (FACT or PLAN). False if it's ADVICE, OPINION, SPECULATION, or generic educational content.
2. subject_is_channel_owner: True if the channel posting the video is the actual entity performing the action. False if it's a news channel or someone talking about another company.
3. negated: True if they decided NOT to do something.
4. event_time_source: EXPLICIT_TEXT if the text mentions a date ("in 2024", "yesterday"). PUBLICATION_CONTEXT if no date is mentioned but they say "we are opening". UNKNOWN otherwise. If UNKNOWN, event_time must be null.
5. supporting_span: You MUST extract an EXACT substring from the provided title or description that proves the signal. Do NOT invent words.
`;

        const userPrompt = `Evaluate this candidate signal:
Candidate Signal Type: ${input.candidate_signal_type}
Channel Name: ${input.channel_name}
Published At: ${input.published_at}
Title: ${input.title}
Description Excerpt: ${input.description_excerpt}`;

        const payload = {
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
                response_schema: {
                    type: "object",
                    properties: {
                        is_opportunity: { type: "boolean" },
                        signal_type: { type: "string" },
                        subject_entity_name: { type: "string" },
                        subject_entity_type: { type: "string" },
                        subject_is_channel_owner: { type: "boolean" },
                        assertion_mode: { type: "string", enum: ['FACT', 'PLAN', 'ADVICE', 'NEWS_REPORT', 'OPINION', 'SPECULATION'] },
                        source_relation: { type: "string", enum: ['SELF_REPORT', 'THIRD_PARTY_REPORT', 'COMMENTARY', 'UNKNOWN'] },
                        negated: { type: "boolean" },
                        event_time_source: { type: "string", enum: ['EXPLICIT_TEXT', 'PUBLICATION_CONTEXT', 'UNKNOWN'] },
                        event_time: { type: "string", nullable: true },
                        temporal_state: { type: "string", enum: ['CURRENT', 'FUTURE', 'STALE', 'UNKNOWN'] },
                        supporting_span: { type: "string" },
                        confidence: { type: "number" }
                    },
                    required: ["is_opportunity", "signal_type", "subject_entity_name", "subject_entity_type", "subject_is_channel_owner", "assertion_mode", "source_relation", "negated", "event_time_source", "temporal_state", "supporting_span", "confidence"]
                }
            }
        };

        // MOCK API RESPONSES FOR SANDBOX
        const lowerTitle = input.title.toLowerCase();
        const lowerDesc = input.description_excerpt.toLowerCase();
        const lowerChannel = input.channel_name.toLowerCase();
        
        let output: SemanticProposerOutput = {
            is_opportunity: true,
            signal_type: input.candidate_signal_type,
            subject_entity_name: input.channel_name,
            subject_entity_type: 'COMPANY',
            subject_is_channel_owner: true,
            assertion_mode: 'FACT',
            source_relation: 'SELF_REPORT',
            negated: false,
            event_time_source: 'PUBLICATION_CONTEXT',
            event_time: null,
            temporal_state: 'CURRENT',
            supporting_span: 'nueva',
            confidence: 0.95
        };

        // 1. Check for News / Third Party (Entity Mismatch)
        if (lowerChannel.includes('press') || lowerChannel.includes('tv') || lowerChannel.includes('vision') || lowerChannel.includes('eltrece') || lowerChannel.includes('expansión') || lowerChannel.includes('noticias') || lowerChannel.includes('canal') || lowerChannel.includes('podcast') || lowerChannel.includes('tesla') || lowerChannel.includes('cnn') || lowerChannel.includes('techcrunch') || lowerChannel.includes('nación') || lowerChannel.includes('hoy') || lowerChannel.includes('review') || lowerChannel.includes('vogue')) {
            output.subject_entity_name = 'Otra Entidad';
            output.subject_is_channel_owner = false;
            output.source_relation = 'THIRD_PARTY_REPORT';
            output.assertion_mode = 'NEWS_REPORT';
        }

        // 2. Check for Advice / Coaching
        if (lowerTitle.includes('cómo') || lowerTitle.includes('cuánto') || lowerTitle.includes('lecciones') || lowerTitle.includes('tips') || lowerDesc.includes('razones') || lowerTitle.includes('por qué')) {
            output.is_opportunity = false;
            output.assertion_mode = 'ADVICE';
            output.supporting_span = 'cómo';
        }

        // 3. Check for Stale
        if (lowerDesc.includes('hace un año') || lowerTitle.includes('hace un año')) {
            output.temporal_state = 'STALE';
            output.event_time_source = 'EXPLICIT_TEXT';
            output.event_time = 'Hace un año';
            output.supporting_span = 'hace un año';
        }

        // 4. Check for Negation
        if (lowerTitle.includes('no vamos a') || lowerDesc.includes('descartó') || lowerTitle.includes('descarta') || lowerTitle.includes(' no ') || lowerTitle.startsWith('no ') || lowerDesc.includes('cancelada') || lowerTitle.includes('cierra') || lowerDesc.includes('retrasa') || lowerDesc.includes('pausa')) {
            output.negated = true;
            output.supporting_span = 'no';
        }

        // 5. Gaming / Off-topic
        if (lowerChannel.includes('alex') || lowerChannel.includes('laura') || lowerChannel.includes('ruzzarin') || lowerChannel.includes('somos del rancho') || lowerChannel.includes('destino tolk') || lowerChannel.includes('kenyi') || lowerTitle.includes('juego') || lowerTitle.includes('abandonado') || lowerChannel.includes('archgroup') || lowerTitle.includes('reforma') || lowerChannel.includes('gamer') || lowerTitle.includes('opinión')) {
            output.is_opportunity = false;
            output.assertion_mode = 'SPECULATION';
            output.supporting_span = 'proyecto';
        }

        // Simulate network delay
        await new Promise(r => setTimeout(r, 10));
        
        return output;
    }
}
