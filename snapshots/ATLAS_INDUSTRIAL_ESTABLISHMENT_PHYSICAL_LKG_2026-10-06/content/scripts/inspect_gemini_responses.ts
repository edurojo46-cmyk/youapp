import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

async function testQuery(q: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `Actúa como motor de descubrimiento público para YouApp Atlas.
Búsqueda del usuario: "${q}"

Encuentra personas reales (PERSON) o comercios/empresas (BUSINESS) relevantes en Argentina para esta búsqueda.
Responde ÚNICAMENTE con un JSON array válido:
[
  {
    "entityType": "PERSON" | "BUSINESS",
    "fullName": string | null,
    "businessName": string | null,
    "professionClaim": string,
    "workEvidence": string,
    "geographyClaim": string,
    "geographyEvidence": string,
    "sourceUrl": string,
    "domain": string
  }
]`;

  const res = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' }
  });
  console.log(`\n=== RESULTS FOR "${q}" ===`);
  console.log(res.text);
}

async function run() {
  await testQuery('comerciante en CABA');
  await testQuery('empleado en CABA');
}
run().catch(console.error);
