import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

async function main() {
  console.log('KEY exists:', !!process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY?.substring(0, 10));
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: 'Responde con la palabra FUNCIONANDO'
    });
    console.log('Basic generation response:', res.text);
  } catch (err: any) {
    console.error('Basic generation error:', err.message || err);
  }

  try {
    // 1. Fetch real web context from Wikipedia API (es.wikipedia.org)
    const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent('comerciante CABA Buenos Aires')}&format=json&srlimit=5`);
    const wikiData = await wikiRes.json();
    const wikiSnippets = (wikiData?.query?.search || []).map((s: any) => ({
      title: s.title,
      snippet: s.snippet?.replace(/<[^>]+>/g, ''),
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
      domain: 'es.wikipedia.org'
    }));

    console.log('Wikipedia items found:', wikiSnippets.length);

    const prompt = `Actúa como motor de descubrimiento público y grounding para YouApp Atlas.
Búsqueda del usuario: "comerciante en CABA"

Resultados iniciales de la web pública:
${wikiSnippets.map((w: any, i: number) => `${i + 1}. Título: ${w.title}\nURL: ${w.url}\nResumen: ${w.snippet}`).join('\n\n')}

Instrucciones:
1. Encuentra personas reales (PERSON) o comercios/empresas (BUSINESS) con actividad comercial verificable en CABA (Ciudad Autónoma de Buenos Aires, Argentina).
2. Para PERSON:
   - Nombre y apellido de la persona real (ej: comerciante, titular de comercio, dirigente de comercio como Fabián Castillo en FECOBA).
   - Ocupación o rol (ej: Comerciante, Empresario Comercial).
   - Evidencia concreta de actividad comercial.
   - Evidencia concreta de ubicación en CABA.
   - URL factual y dominio verificable (ej: fecoba.org.ar, redcame.org.ar, es.wikipedia.org, buenosaires.gob.ar).
3. Para BUSINESS:
   - Nombre del comercio o empresa (ej: Librería El Ateneo, Café Tortoni).
   - fullName: null.

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
      config: {
        responseMimeType: 'application/json'
      }
    });

    console.log('Resulting JSON:', res.text);
  } catch (err: any) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
