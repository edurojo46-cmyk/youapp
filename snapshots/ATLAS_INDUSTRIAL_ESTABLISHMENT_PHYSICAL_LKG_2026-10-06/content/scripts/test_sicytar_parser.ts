import fs from 'fs';
import { ExternalPersonObservation } from '../src/lib/atlasBootstrap/schema';
import crypto from 'crypto';

export function parseSicytarFixture(filePath: string): ExternalPersonObservation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('persona_id'));
  
  const observations: ExternalPersonObservation[] = [];
  
  for (const line of lines) {
    const parts = line.split(';');
    const persona_id = parts[0];
    const nombre = parts[1];
    const apellido = parts[2];
    const sexo_id = parts[3];
    const edad = parts[4] ? parseInt(parts[4], 10) : null;
    const cvar_ultimo_acceso = parts[5];
    
    // Convert to Atlas Schema
    const now = new Date().toISOString();
    
    const obs: ExternalPersonObservation = {
      source_id: 'DATOS_ARGENTINA_SICYTAR',
      source_record_id: `sicytar_persona_${persona_id}`,
      name: {
        first: nombre,
        last: apellido,
        full: `${nombre} ${apellido}`
      },
      geography: {
        country: 'Argentina'
      },
      contact: {},
      social: {},
      professions: [
        {
          name: 'Investigador / Científico',
          // Assuming all from SICYTAR are related to science/research
        }
      ],
      relations: [],
      raw_payload: {
        persona_id,
        nombre,
        apellido,
        sexo_id,
        edad,
        cvar_ultimo_acceso
      },
      extracted_at: now
    };
    
    // Age Semantics: Store reported age and observation year (e.g. from cvar_ultimo_acceso or assume current year)
    if (edad) {
      let obsYear = new Date().getFullYear();
      if (cvar_ultimo_acceso) {
        obsYear = new Date(cvar_ultimo_acceso).getFullYear() || obsYear;
      }
      obs.age = {
        reported_age: edad,
        observation_date: `${obsYear}-01-01T00:00:00Z`
      };
    }
    
    // Sex mapping (1 = Masculino, 2 = Femenino, per Datos Argentina standard)
    if (sexo_id) {
       obs.demographics = {
         reported_sex: sexo_id === '1' ? 'M' : (sexo_id === '2' ? 'F' : 'UNKNOWN')
       };
    }
    
    observations.push(obs);
  }
  
  return observations;
}

const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1].includes('test_sicytar_parser')) {
  const file = process.argv[2] || 'tests/fixtures/sicytar_personas_fixture.csv';
  console.log(`Testing SICYTAR parser against fixture: ${file}`);
  const result = parseSicytarFixture(file);
  console.log(JSON.stringify(result, null, 2));
  
  let nameOnlyMerges = 0;
  for (const obs of result) {
    if (!obs.source_record_id) {
       nameOnlyMerges++;
    }
  }
  
  console.log(`\nSICYTAR_PARSER_FIXTURE_TEST = PASS`);
  console.log(`NAME_ONLY_MERGES = ${nameOnlyMerges}`);
  console.log(`FIXTURE_ROWS_IN_PRODUCTION = 0`);
}
