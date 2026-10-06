import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // 1. Search web for query
  const query = "plomero en CABA";
  const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  console.log("Fetch status:", res.status);
  const html = await res.text();
  console.log("Fetch text length:", html.length);
  
  // Parse snippets and real URLs
  const items: { url: string; title: string; snippet: string }[] = [];
  const urlRegex = /<a class="result__url" href="([^"]+)">([^<]+)<\/a>/g;
  const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  
  const snippets = [...html.matchAll(snippetRegex)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  let m;
  let idx = 0;
  while ((m = urlRegex.exec(html)) !== null && idx < 10) {
    let rawHref = m[1];
    let actualUrl = '';
    const uddgMatch = rawHref.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      actualUrl = decodeURIComponent(uddgMatch[1]);
    } else if (rawHref.startsWith('http')) {
      actualUrl = rawHref;
    }
    if (actualUrl && !actualUrl.includes('duckduckgo.com')) {
      items.push({
        url: actualUrl,
        title: m[2].trim(),
        snippet: snippets[idx] || ''
      });
      idx++;
    }
  }
  
  console.log(`Found ${items.length} search items! Sample:`, items.slice(0, 3));

  const prompt = `Actua como extractor de entidades para YouApp Atlas.
Dada la búsqueda: "${query}"
Y estos resultados reales de la web pública:
${items.slice(0, 6).map((it, i) => `${i+1}. URL: ${it.url}\nTítulo: ${it.title}\nDescripción: ${it.snippet}`).join('\n\n')}

Extrae profesionales o servicios de personas reales encontrados en estos resultados.
Devuelve SOLO un JSON array de objetos con:
- displayName: nombre del profesional o nombre de la empresa/servicio
- professionClaim: profesión detectada (ej: Plomero, Gasista)
- locationClaim: ubicación detectada
- sourceUrl: la URL exacta de donde proviene (DEBE ser una de las URLs provistas)
- domain: dominio web extraído de la URL

Si ningún resultado corresponde a un profesional o servicio real, devuelve [].`;

  const geminiRes = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: prompt
  });

  console.log("GEMINI CANDIDATES EXTRACTED:");
  console.log(geminiRes.text);

}

run();
