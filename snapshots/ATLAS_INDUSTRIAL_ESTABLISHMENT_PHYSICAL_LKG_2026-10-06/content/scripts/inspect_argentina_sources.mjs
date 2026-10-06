import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/atlas_canonical_certified_source_map.json', 'utf8'));
const sources = data.sources;

const provinces = [
  'CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 
  'Tierra del Fuego', 'Tucumán'
];

console.log(`Total Sources in Map: ${sources.length}`);

const byProtocol = {};
const byRegion = {};

for (const s of sources) {
  byProtocol[s.PROTOCOL] = (byProtocol[s.PROTOCOL] || 0) + 1;
  const reg = s.REGION || 'ARGENTINA';
  byRegion[reg] = (byRegion[reg] || 0) + 1;
}

console.log('By Protocol:', byProtocol);
console.log('By Region:', byRegion);

// Filter eligible person sources
const eligible = sources.filter(s => {
  return s.PUBLIC_OPEN_FREE === true &&
    s.CERTIFICATION_STATUS !== 'BLOCKED' &&
    s.ENTITY_TYPES && s.ENTITY_TYPES.includes('PERSON');
});

console.log(`Eligible Person Sources: ${eligible.length}`);
