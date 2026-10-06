import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

async function parseCpcecaba() {
  const url = 'https://www.consejo.org.ar/institucional/autoridades';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  console.log('CPCECABA status:', res.status, 'length:', html.length);

  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const people: { name: string; role: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^(?:Presidente|Vicepresidente|Vicepresidenta|Secretario|Secretaria|Tesorero|Tesorera|Prosecretario|Prosecretaria|Protesorero|Protesorera|Vocal Titular|Vocal Suplente|Consejero|Consejera)\b/i.test(l)) {
      const role = l;
      // The person's name is usually 1-3 lines above or below
      let name = '';
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const prev = lines[j];
        if (/^(?:Dr\.|Dra\.|Lic\.|Cdor\.|Cdora\.)\s+[A-Z]/i.test(prev) || (prev.length > 5 && prev.includes(' ') && !prev.includes(':') && !/institucional|consejo|autoridades/i.test(prev))) {
          name = prev;
          break;
        }
      }
      if (!name && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (/^(?:Dr\.|Dra\.|Lic\.|Cdor\.|Cdora\.)\s+[A-Z]/i.test(next) || (next.length > 5 && next.includes(' ') && !next.includes(':'))) {
          name = next;
        }
      }

      if (name) {
        const cleanName = name.replace(/^(?:Dr\.|Dra\.|Lic\.|Cdor\.|Cdora\.)\s+/i, '').trim();
        const cl = SocialEntityClassifier.classify(cleanName, role);
        if (cl.is_person) {
          people.push({ name: cleanName, role });
        }
      }
    }
  }

  console.log(`CPCECABA Authorities detected: ${people.length}`);
  people.forEach(p => console.log(`  - ${p.name} (${p.role})`));
}

parseCpcecaba().catch(console.error);
