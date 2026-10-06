import 'dotenv/config';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';

async function runCanary() {
    console.log("========================================");
    console.log("       LLM CANARY TEST");
    console.log("========================================");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 1. OPENAI CANARY
    console.log("\n[1] Testing OpenAI (gpt-5.6-terra)...");
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-5.6-terra',
            messages: [{ role: 'user', content: 'Say hello world' }],
            max_tokens: 10
        });
        console.log("✅ OpenAI SUCCESS:", response.choices[0].message.content);
    } catch (err: any) {
        console.log("❌ OpenAI FAILED.");
        console.log("Status:", err.status);
        if (err.error) {
            console.log("Error Type:", err.error.type);
            console.log("Error Code:", err.error.code);
            console.log("Error Message:", err.error.message);
        } else {
            console.log("Raw Error:", err.message);
        }
    }

    // 2. GEMINI CANARY
    console.log("\n[2] Testing Gemini (gemini-3.8-flash)...");
    try {
        const response = await gemini.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: 'Say hello world',
            config: { maxOutputTokens: 10 }
        });
        console.log("✅ Gemini SUCCESS:", response.text);
    } catch (err: any) {
        console.log("❌ Gemini FAILED.");
        console.log("Status:", err.status);
        console.log("Message:", err.message);
        if (err.response) {
            console.log("Response Body:", await err.response.text().catch(() => 'unreadable'));
        }
        if (err.details) {
            console.log("Details:", err.details);
        }
    }
}

runCanary().catch(console.error);
