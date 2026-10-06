import fs from 'fs';

const ledgerPath = 'reports/atlas/people/atlas_fuel_ledger.json';
const expPath = 'reports/atlas/people/atlas_people_2m_expansion_report.json';

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));

console.log('--- HISTORICAL LEDGER SUMMARY ---');
console.log(`Initial Pool: ${ledger.INITIAL_CERTIFIED_POOL}`);
console.log(`Total Sources: ${ledger.SOURCES.length}`);

// Check which sources were consumed in the 2M run
console.log('\n--- 2M RUN CONSUMED SOURCES ---');
const expSources = exp.FINAL_STATE;
console.log('2M Final state:', expSources);

const consumedSourceIds = new Set();
// Everything in ledger that had 0 remaining or was processed in 2M
for (const s of ledger.SOURCES) {
  if (s.SOURCE_ROWS_REMAINING === 0) {
    consumedSourceIds.add(s.SOURCE_ID);
  }
}

// BORA, APN, Córdoba, Jujuy, San Juan, Corrientes, Chaco, Misiones, Salta, Entre Ríos, Tucumán, Mendoza were processed in 2M
const waveProcessed = [
  'MASS_BORA_AUTORIDADES_SOCIETARIAS_BULK',
  'MASS_APN_AUTORIDADES_OPEN_DATA',
  'MASS_CORDOBA_GOB_OPEN_DATA',
  'MASS_PROV_JUJUY_NOMINA_OPEN',
  'MASS_PROV_SAN_JUAN_NOMINA_OPEN',
  'MASS_PROV_CORRIENTES_NOMINA_OPEN',
  'MASS_PROV_CHACO_NOMINA_OPEN',
  'MASS_PROV_MISIONES_NOMINA_OPEN',
  'MASS_PROV_SALTA_NOMINA_OPEN',
  'MASS_PROV_ENTRE_RIOS_NOMINA_OPEN',
  'MASS_PROV_TUCUMAN_NOMINA_OPEN',
  'MASS_PROV_MENDOZA_NOMINA_OPEN'
];
waveProcessed.forEach(id => consumedSourceIds.add(id));

// Also BIEP and CONICET previously ingested
consumedSourceIds.add('BIEP_MINCYT_INVESTIGADORES_FULL');
consumedSourceIds.add('CONICET_INVESTIGADORES_CABA_FULL');

console.log(`\nTotal Explicitly Consumed / Exhausted Sources: ${consumedSourceIds.size}`);
console.log(Array.from(consumedSourceIds));
