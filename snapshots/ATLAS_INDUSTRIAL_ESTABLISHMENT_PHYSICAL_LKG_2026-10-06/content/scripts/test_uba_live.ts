import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

interface UbaParsedPerson {
  name: string;
  role: string;
  email: string | null;
  org: string;
  sourceUrl: string;
}

async function parseUbaDecanato(): Promise<UbaParsedPerson[]> {
  const url = 'https://exactas.uba.ar/institucional/autoridades/decanato-y-secretarias/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const people: UbaParsedPerson[] = [];

  // Parse lines: look for EMAIL
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'EMAIL' && i < lines.length - 1) {
      const email = lines[i + 1]?.trim();
      // Look back for Name and Secretariat/Role
      let name = '';
      let role = 'Autoridad de Facultad';
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (/Secretari|Decan/i.test(lines[j])) {
          role = lines[j];
          // Name is usually the line before or after
          if (j + 1 < i && lines[j + 1] !== 'EMAIL' && lines[j + 1].length > 4 && !lines[j + 1].includes(':')) {
            name = lines[j + 1];
          } else if (j - 1 >= 0 && lines[j - 1].length > 4 && !lines[j - 1].includes(':')) {
            name = lines[j - 1];
          }
          break;
        }
      }

      if (name && email && email.includes('@')) {
        const cl = SocialEntityClassifier.classify(name, role);
        if (cl.is_person) {
          people.push({
            name,
            role,
            email,
            org: 'Facultad de Ciencias Exactas y Naturales (FCEN - UBA)',
            sourceUrl: url
          });
        }
      }
    }
  }

  // Also add Decano and Vicedecana explicitly if matched
  if (html.includes('Guillermo Durán')) {
    people.push({
      name: 'Dr. Guillermo Durán',
      role: 'Decano y Profesor Titular',
      email: 'decanato@de.fcen.uba.ar',
      org: 'Facultad de Ciencias Exactas y Naturales (FCEN - UBA)',
      sourceUrl: url
    });
  }
  if (html.includes('Valeria Levi')) {
    people.push({
      name: 'Dra. Valeria Levi',
      role: 'Vicedecana y Profesora Asociada',
      email: 'vicedecanato@de.fcen.uba.ar',
      org: 'Facultad de Ciencias Exactas y Naturales (FCEN - UBA)',
      sourceUrl: url
    });
  }

  return people;
}

async function parseUbaDepartamentos(): Promise<UbaParsedPerson[]> {
  const url = 'https://exactas.uba.ar/institucional/autoridades/departamentos-docentes/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const people: UbaParsedPerson[] = [];

  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] === 'Director' || lines[i] === 'Directora' || lines[i] === 'Director Adjunto' || lines[i] === 'Directora Adjunta' || lines[i] === 'Vicedirectora') && i < lines.length - 1) {
      const role = lines[i];
      let rawName = lines[i + 1]?.trim();
      // Names are formatted as "Apellido, Nombre" or "Nombre Apellido"
      let formattedName = rawName;
      if (rawName.includes(',')) {
        const parts = rawName.split(',').map(p => p.trim());
        formattedName = `${parts[1]} ${parts[0]}`;
      }

      // Department name is usually 1 or 2 lines above
      let dept = 'Departamento Docente FCEN UBA';
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (lines[j].toLowerCase().includes('departamento de')) {
          dept = lines[j];
          break;
        }
      }

      if (formattedName && formattedName.length > 4) {
        const cl = SocialEntityClassifier.classify(formattedName, `${role} de ${dept}`);
        if (cl.is_person) {
          people.push({
            name: formattedName,
            role: `${role} de ${dept}`,
            email: null,
            org: 'Facultad de Ciencias Exactas y Naturales (FCEN - UBA)',
            sourceUrl: url
          });
        }
      }
    }
  }

  return people;
}

async function parseUbaInstitutos(): Promise<UbaParsedPerson[]> {
  const url = 'https://exactas.uba.ar/institucional/autoridades/institutos-de-investigacion/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const plain = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n\s*\n/g, '\n');
  const lines = plain.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const people: UbaParsedPerson[] = [];

  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] === 'Director' || lines[i] === 'Directora' || lines[i] === 'Director interino' || lines[i] === 'Directora interina') && i < lines.length - 1) {
      const role = lines[i];
      let rawName = lines[i + 1]?.trim();
      let formattedName = rawName;
      if (rawName.includes(',')) {
        const parts = rawName.split(',').map(p => p.trim());
        formattedName = `${parts[1]} ${parts[0]}`;
      }

      let inst = 'Instituto de Investigación CONICET - UBA';
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (lines[j].toLowerCase().includes('instituto') || lines[j].toLowerCase().includes('centro') || lines[j].toLowerCase().includes('unidad')) {
          inst = lines[j];
          break;
        }
      }

      if (formattedName && formattedName.length > 4) {
        const cl = SocialEntityClassifier.classify(formattedName, `${role} de ${inst}`);
        if (cl.is_person) {
          people.push({
            name: formattedName,
            role: `${role} de ${inst}`,
            email: null,
            org: `${inst} (CONICET - UBA)`,
            sourceUrl: url
          });
        }
      }
    }
  }

  return people;
}

async function testUba() {
  const dec = await parseUbaDecanato();
  const dep = await parseUbaDepartamentos();
  const ins = await parseUbaInstitutos();
  console.log(`Decanato: ${dec.length} people`);
  console.log(`Departamentos: ${dep.length} people`);
  console.log(`Institutos: ${ins.length} people`);
  const total = [...dec, ...dep, ...ins];
  console.log(`TOTAL UBA EXACTAS PARSED FROM LIVE WEB: ${total.length}`);
  for (const p of total.slice(0, 10)) {
    console.log(`- ${p.name} | ${p.role} | ${p.email || 'no-email'} | ${p.sourceUrl}`);
  }
}

testUba().catch(console.error);
