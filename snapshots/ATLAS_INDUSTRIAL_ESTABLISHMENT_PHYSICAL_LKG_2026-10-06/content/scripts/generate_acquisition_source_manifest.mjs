import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const manifest = [
  {
    "SOURCE_ID": "SRC_OPENSANCTIONS_DEFAULT_TARGETS",
    "SOURCE_NAME": "OpenSanctions Default Global Consolidated Targets Registry (Public & Corporate Figures)",
    "PUBLIC_URL": "https://data.opensanctions.org/datasets/latest/default/targets.simple.csv",
    "SOURCE_CLASS": "CORPORATE_OFFICERS_AND_GOVERNANCE",
    "JURISDICTION": "GLOBAL",
    "EXPECTED_FORMAT": "CSV",
    "ESTIMATED_PERSON_CAPACITY": 1017441,
    "ACCESS_PERMITTED": true,
    "PURPOSE_COMPATIBLE": true,
    "LICENSE": "CC-BY-4.0 / Open Data"
  },
  {
    "SOURCE_ID": "SRC_OPENSANCTIONS_PEPS_GRAPH",
    "SOURCE_NAME": "OpenSanctions Global Politically Exposed Persons (PEPs) & Public Officials Graph",
    "PUBLIC_URL": "https://data.opensanctions.org/datasets/latest/peps/entities.ftm.json",
    "SOURCE_CLASS": "PUBLIC_OFFICIALS_AND_GOVERNANCE",
    "JURISDICTION": "GLOBAL / MULTILATERAL",
    "EXPECTED_FORMAT": "JSON+FTM",
    "ESTIMATED_PERSON_CAPACITY": 750000,
    "ACCESS_PERMITTED": true,
    "PURPOSE_COMPATIBLE": true,
    "LICENSE": "CC-BY-4.0 / Open Data"
  },
  {
    "SOURCE_ID": "SRC_OPENSANCTIONS_CONSOLIDATED_GRAPH",
    "SOURCE_NAME": "OpenSanctions Consolidated Global Full Entity Graph",
    "PUBLIC_URL": "https://data.opensanctions.org/datasets/latest/default/entities.ftm.json",
    "SOURCE_CLASS": "GLOBAL_REGULATORY_AND_SANCTIONED_PERSONS",
    "JURISDICTION": "GLOBAL",
    "EXPECTED_FORMAT": "JSON+FTM",
    "ESTIMATED_PERSON_CAPACITY": 1500000,
    "ACCESS_PERMITTED": true,
    "PURPOSE_COMPATIBLE": true,
    "LICENSE": "CC-BY-4.0 / Open Data"
  },
  {
    "SOURCE_ID": "SRC_GCBA_SANIDAD_COVID_ARG",
    "SOURCE_NAME": "Gobierno de la Ciudad de Buenos Aires - Registro de Personal Sanitario",
    "PUBLIC_URL": "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/entrevistas-designaciones-personal-covid/recursos_humanos_salud.csv",
    "SOURCE_CLASS": "HEALTHCARE_PROFESSIONALS_AND_PUBLIC_HEALTH",
    "JURISDICTION": "ARG / CABA",
    "EXPECTED_FORMAT": "CSV",
    "ESTIMATED_PERSON_CAPACITY": 60000,
    "ACCESS_PERMITTED": true,
    "PURPOSE_COMPATIBLE": true,
    "LICENSE": "CABA Open Government License"
  },
  {
    "SOURCE_ID": "SRC_OPENALEX_AUTHORS_GLOBAL",
    "SOURCE_NAME": "OpenAlex Global Scholarly & Academic Author Registry",
    "PUBLIC_URL": "https://api.openalex.org/authors?filter=has_orcid:true&per_page=200",
    "SOURCE_CLASS": "ACADEMIC_RESEARCHERS_AND_SCHOLARS",
    "JURISDICTION": "GLOBAL",
    "EXPECTED_FORMAT": "JSON API",
    "ESTIMATED_PERSON_CAPACITY": 11000000,
    "ACCESS_PERMITTED": true,
    "PURPOSE_COMPATIBLE": true,
    "LICENSE": "CC0 Public Domain"
  }
];

const targetDir = path.resolve('reports/atlas/acquisition');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const targetPath = path.join(targetDir, 'acquisition_source_manifest.json');
const content = JSON.stringify(manifest, null, 2);
fs.writeFileSync(targetPath, content, 'utf8');

const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex').toUpperCase();

console.log('--- ACQUISITION SOURCE MANIFEST FROZEN ---');
console.log(`SOURCE_COUNT = ${manifest.length}`);
console.log(`SOURCE_CLASSES = ${[...new Set(manifest.map(m => m.SOURCE_CLASS))].join(' | ')}`);
console.log(`JURISDICTIONS = ${[...new Set(manifest.map(m => m.JURISDICTION))].join(' | ')}`);
console.log(`SOURCE_MANIFEST_SHA256 = ${sha256}`);
console.log(`TOTAL_ESTIMATED_PERSON_CAPACITY = ${manifest.reduce((acc, m) => acc + m.ESTIMATED_PERSON_CAPACITY, 0)}`);
