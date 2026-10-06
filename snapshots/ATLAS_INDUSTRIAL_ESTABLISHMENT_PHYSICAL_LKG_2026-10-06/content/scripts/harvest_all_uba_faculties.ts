import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

interface UbaFacultyPerson {
  name: string;
  role: string;
  faculty: string;
  neighborhood: string;
  address: string;
  sourceUrl: string;
  email: string | null;
}

export async function harvestUbaFaculties(): Promise<UbaFacultyPerson[]> {
  const people: UbaFacultyPerson[] = [];

  const targets = [
    {
      name: 'Facultad de Medicina (FMED - UBA)',
      url: 'https://www.fmed.uba.ar/la-facultad/autoridades',
      neighborhood: 'Recoleta',
      address: 'Paraguay 2155, Recoleta, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan|Direc/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Medicina (FMED - UBA)',
                  neighborhood: 'Recoleta',
                  address: 'Paraguay 2155, Recoleta, CABA',
                  sourceUrl: 'https://www.fmed.uba.ar/la-facultad/autoridades',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    },
    {
      name: 'Facultad de Filosofía y Letras (FFyL - UBA)',
      url: 'http://filo.uba.ar/autoridades',
      neighborhood: 'Caballito',
      address: 'Puán 480, Caballito, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Vicedecan|Secretari/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Filosofía y Letras (FFyL - UBA)',
                  neighborhood: 'Caballito',
                  address: 'Puán 480, Caballito, CABA',
                  sourceUrl: 'http://filo.uba.ar/autoridades',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    },
    {
      name: 'Facultad de Psicología (PSI - UBA)',
      url: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php',
      neighborhood: 'Balvanera',
      address: 'Lavalle 2353, Balvanera, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Psicología (PSI - UBA)',
                  neighborhood: 'Balvanera',
                  address: 'Lavalle 2353, Balvanera, CABA',
                  sourceUrl: 'https://www.psi.uba.ar/institucional.php?var=institucional/autoridades.php',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    },
    {
      name: 'Facultad de Farmacia y Bioquímica (FFyB - UBA)',
      url: 'https://www.ffyb.uba.ar/institucional/autoridades/',
      neighborhood: 'Recoleta',
      address: 'Junín 956, Recoleta, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Farmacia y Bioquímica (FFyB - UBA)',
                  neighborhood: 'Recoleta',
                  address: 'Junín 956, Recoleta, CABA',
                  sourceUrl: 'https://www.ffyb.uba.ar/institucional/autoridades/',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    },
    {
      name: 'Facultad de Ciencias Sociales (FSOC - UBA)',
      url: 'https://www.sociales.uba.ar/institucional/autoridades/',
      neighborhood: 'Constitución',
      address: 'Santiago del Estero 1029, Constitución, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Ciencias Sociales (FSOC - UBA)',
                  neighborhood: 'Constitución',
                  address: 'Santiago del Estero 1029, Constitución, CABA',
                  sourceUrl: 'https://www.sociales.uba.ar/institucional/autoridades/',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    },
    {
      name: 'Facultad de Agronomía (FAUBA - UBA)',
      url: 'https://www.agro.uba.ar/autoridades',
      neighborhood: 'Agronomía',
      address: 'Av. San Martín 4453, Agronomía, CABA',
      parser: (html: string) => {
        const parsed: UbaFacultyPerson[] = [];
        const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n');
        const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          if (/Decan|Secretari|Director/i.test(lines[i]) && i < lines.length - 1) {
            const role = lines[i];
            const name = lines[i + 1];
            if (name && name.length > 5 && !name.includes(':') && !/Secretar|Decan/i.test(name)) {
              const cl = SocialEntityClassifier.classify(name, role);
              if (cl.is_person) {
                parsed.push({
                  name,
                  role,
                  faculty: 'Facultad de Agronomía (FAUBA - UBA)',
                  neighborhood: 'Agronomía',
                  address: 'Av. San Martín 4453, Agronomía, CABA',
                  sourceUrl: 'https://www.agro.uba.ar/autoridades',
                  email: null
                });
              }
            }
          }
        }
        return parsed;
      }
    }
  ];

  for (const t of targets) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(t.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(id);
      if (res.ok) {
        const html = await res.text();
        const results = t.parser(html);
        console.log(`[${t.name}] Fetched ${results.length} authorities from real page.`);
        people.push(...results);
      }
    } catch (e: any) {
      console.warn(`[${t.name}] Error:`, e.message);
    }
  }

  return people;
}

harvestUbaFaculties().then(results => {
  console.log(`\nTotal UBA faculty authorities harvested: ${results.length}`);
  results.slice(0, 10).forEach(r => console.log(`  - ${r.name} (${r.role} - ${r.faculty}) [${r.neighborhood}]`));
});
