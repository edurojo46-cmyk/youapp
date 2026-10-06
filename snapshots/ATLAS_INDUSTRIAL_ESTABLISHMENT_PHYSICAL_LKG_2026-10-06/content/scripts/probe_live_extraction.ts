import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

async function probeLiveExtraction() {
  console.log('=== PROBING LIVE EXTRACTION ACROSS REAL SOURCES ===\n');

  const sources = [
    {
      name: 'UBA FADU Autoridades',
      url: 'https://www.fadu.uba.ar/institucional/autoridades',
      neighborhood: 'Núñez'
    },
    {
      name: 'UBA Derecho Autoridades',
      url: 'http://www.derecho.uba.ar/institucional/autoridades.php',
      neighborhood: 'Recoleta'
    },
    {
      name: 'CPCECABA Autoridades',
      url: 'https://www.consejo.org.ar/institucional/autoridades',
      neighborhood: 'San Nicolás'
    },
    {
      name: 'CPACF Consejo Directivo',
      url: 'https://www.cpacf.org.ar/noticia/6755/consejo-directivo-autoridades-actuales',
      neighborhood: 'San Nicolás'
    }
  ];

  for (const s of sources) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(s.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(to);

      if (!res.ok) {
        console.log(`[FAIL ${res.status}] ${s.name}`);
        continue;
      }

      const html = await res.text();
      const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/[ \t]+/g, ' ')
                        .replace(/\n\s*\n/g, '\n');
      const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 2);

      const detectedPeople: { name: string; role: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for role patterns: Decano, Vicedecano, Secretario, Director, Consejero, Presidente, Vocal
        if (/^(?:Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Director|Directora|Subdirector|Subdirectora|Presidente|Presidenta|Vicepresidente|Vicepresidenta|Tesorero|Tesorera|Protesorero|Protesorera|Vocal Titular|Vocal Suplente|Consejero|Consejera)\b/i.test(line)) {
          let role = line;
          let name = '';
          if (line.includes(':')) {
            const parts = line.split(':');
            role = parts[0].trim();
            name = parts.slice(1).join(':').trim();
          } else if (i + 1 < lines.length && lines[i + 1].length > 3 && !lines[i + 1].includes(':')) {
            name = lines[i + 1];
          }

          if (name) {
            // Clean title prefixes like Arq., Dr., Dra., Lic., Cdor., Cdora., Abog.
            const cleanName = name.replace(/^(?:Prof\.|Arq\.|Dr\.|Dra\.|Lic\.|Cdor\.|Cdora\.|Abog\.|Ing\.)\s+/i, '').trim();
            if (cleanName.length > 4 && cleanName.includes(' ') && !cleanName.toLowerCase().includes('facultad') && !cleanName.toLowerCase().includes('universidad')) {
              const cl = SocialEntityClassifier.classify(cleanName, role);
              if (cl.is_person) {
                detectedPeople.push({ name: cleanName, role });
              }
            }
          }
        }
      }

      console.log(`[SUCCESS] ${s.name}: Parsed ${detectedPeople.length} verified people`);
      detectedPeople.slice(0, 5).forEach(p => console.log(`   - ${p.name} (${p.role})`));
      console.log('');
    } catch (e: any) {
      console.log(`[ERR] ${s.name}: ${e.message}`);
    }
  }
}

probeLiveExtraction().catch(console.error);
