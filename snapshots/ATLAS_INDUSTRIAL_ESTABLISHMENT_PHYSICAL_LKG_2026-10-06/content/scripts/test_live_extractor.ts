import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

interface ParsedPerson {
  name: string;
  role: string;
  email: string | null;
  org: string;
  neighborhood: string;
  sourceUrl: string;
}

async function fetchComuna(comunaNum: number): Promise<ParsedPerson[]> {
  const url = `https://buenosaires.gob.ar/comuna-${comunaNum}/junta-comunal`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  // Map comuna to primary neighborhood
  const comunaNeighborhoods: Record<number, string> = {
    1: 'Retiro',
    2: 'Recoleta',
    3: 'Balvanera',
    4: 'Barracas',
    5: 'Almagro',
    6: 'Caballito',
    7: 'Flores',
    8: 'Villa Lugano',
    9: 'Mataderos',
    10: 'Floresta',
    11: 'Villa Devoto',
    12: 'Villa Urquiza',
    13: 'Belgrano',
    14: 'Palermo',
    15: 'Chacarita'
  };

  const neigh = comunaNeighborhoods[comunaNum] || 'Caballito';
  const persons: ParsedPerson[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'Correo:' && i > 0 && i < lines.length - 1) {
      const email = lines[i + 1]?.trim();
      // Look backwards for name and role
      // Pattern: Name, then Role ("Presidente" or "Miembro Junta Comunal"), then "Partido:...", then "Correo:"
      let name = '';
      let role = 'Miembro Junta Comunal';
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (/Presidente|Presidenta/i.test(lines[j])) {
          role = 'Presidente de Junta Comunal';
          if (j > 0 && lines[j - 1].length > 4 && !lines[j - 1].includes(':')) {
            name = lines[j - 1];
          }
          break;
        } else if (/Miembro Junta Comunal/i.test(lines[j])) {
          role = 'Miembro de Junta Comunal';
          if (j > 0 && lines[j - 1].length > 4 && !lines[j - 1].includes(':')) {
            name = lines[j - 1];
          }
          break;
        }
      }

      if (name && email && email.includes('@buenosaires.gob.ar')) {
        const cl = SocialEntityClassifier.classify(name, role);
        if (cl.is_person) {
          persons.push({
            name,
            role,
            email,
            org: `Gobierno de la Ciudad de Buenos Aires - Junta Comunal ${comunaNum}`,
            neighborhood: neigh,
            sourceUrl: url
          });
        }
      }
    }
  }

  return persons;
}

async function testAllComunas() {
  let total = 0;
  for (let c = 1; c <= 15; c++) {
    const people = await fetchComuna(c);
    console.log(`Comuna ${c}: parsed ${people.length} live people`);
    total += people.length;
    for (const p of people.slice(0, 2)) {
      console.log(`  - ${p.name} (${p.role}) -> ${p.email} [${p.neighborhood}]`);
    }
  }
  console.log(`\nTOTAL PERSONS PARSED FROM ALL 15 COMUNAS: ${total}`);
}

testAllComunas().catch(console.error);
