import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveCanonicalHuman } from './lib/canonicalIdentityResolver.mjs';
import { GlobalConsumedSourceAuthority, scoreResourceNovelty } from './lib/sourceContinuityAuthority.mjs';

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('  PHASE 7 — REPAIR REGRESSION SUITE                             ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 6;

  // Load Global Preexisting Authority
  console.log('Loading Global Pre-Existing Authority for regression verification...');
  const binPath = path.resolve('scratch/global_preexisting_human_authority.bin');
  if (!fs.existsSync(binPath)) {
    throw new Error('Global preexisting authority binary not found at ' + binPath);
  }
  const authorityBuf = fs.readFileSync(binPath);
  const authoritySet = new Set();
  for (let i = 0; i < authorityBuf.length; i += 8) {
    authoritySet.add(authorityBuf.subarray(i, i + 8).toString('hex'));
  }
  console.log(`Loaded ${authoritySet.size.toLocaleString()} 64-bit entries from Global Authority.\n`);

  function isKnownPreexisting(key) {
    const h64 = crypto.createHash('sha256').update(key.trim()).digest().subarray(0, 8).toString('hex');
    return authoritySet.has(h64);
  }

  // --- TEST 1: Same DNI across 501 rows -> exactly 1 canonical human ---
  console.log('--- TEST 1: Multi-row Same DNI Resolution (Alfredo M. Rovira) ---');
  const dniAlfredo = '5274754';
  const nameAlfredo = 'ROVIRA ALFREDO M';
  const resolvedHumansTest1 = new Set();
  let evidenceRecordsCount = 0;

  for (let row = 1; row <= 501; row++) {
    evidenceRecordsCount++;
    const res = resolveCanonicalHuman({
      displayName: nameAlfredo,
      docType: 'CEDULA DE IDENTIDAD',
      docNumber: dniAlfredo,
      sourceId: 'src_ckan_datos_ar',
      jurisdiction: 'ARG / NACIONAL'
    });
    if (res.isNaturalPerson && res.canonicalHumanId) {
      resolvedHumansTest1.add(res.canonicalHumanId);
    }
  }

  const test1Pass = (resolvedHumansTest1.size === 1 && evidenceRecordsCount === 501 && (resolvedHumansTest1.has(`ARG:DNI:${dniAlfredo}`) || resolvedHumansTest1.has(`ARG:CEDULA_DE_IDENTIDAD:${dniAlfredo}`)));
  console.log(`  Resolved Humans: ${resolvedHumansTest1.size} (Expected: 1)`);
  console.log(`  Evidence Records: ${evidenceRecordsCount} (Expected: 501)`);
  console.log(`  Canonical ID: ${Array.from(resolvedHumansTest1)[0]}`);
  console.log(`  TEST 1 STATUS: ${test1Pass ? 'PASS' : 'FAIL'}\n`);
  if (test1Pass) passedTests++;

  // --- TEST 2: Same human through different spelling / source alias ---
  console.log('--- TEST 2: Alias & Spelling Invariant Equivalence ---');
  const aliasMap = new Map();
  aliasMap.set('ARG:DNI:11320375', 'ARG:HUMAN:CANONICAL:PEREZ_ALATI_JORGE');
  aliasMap.set('PASSPORT:AR11320375', 'ARG:HUMAN:CANONICAL:PEREZ_ALATI_JORGE');

  const p1 = resolveCanonicalHuman({
    displayName: 'PEREZ ALATI, Jorge',
    docType: 'DNI',
    docNumber: '11320375',
    aliasMap
  });
  const p2 = resolveCanonicalHuman({
    displayName: 'PEREZ ALATI JORGE LUIS',
    docType: 'PASAPORTE',
    docNumber: 'AR11320375',
    aliasMap
  });

  const test2Pass = (p1.canonicalHumanId === p2.canonicalHumanId && p1.canonicalHumanId === 'ARG:HUMAN:CANONICAL:PEREZ_ALATI_JORGE');
  console.log(`  Identity 1 (DNI):      ${p1.canonicalHumanId}`);
  console.log(`  Identity 2 (Passport): ${p2.canonicalHumanId}`);
  console.log(`  Equivalence Collapsed: ${test2Pass ? 'TRUE' : 'FALSE'}`);
  console.log(`  TEST 2 STATUS: ${test2Pass ? 'PASS' : 'FAIL'}\n`);
  if (test2Pass) passedTests++;

  // --- TEST 3: Different people with same/similar name -> must not collapse ---
  console.log('--- TEST 3: Distinct People Disambiguation ---');
  const personA = resolveCanonicalHuman({
    displayName: 'CARLOS LOPEZ',
    docType: 'DNI',
    docNumber: '20111222'
  });
  const personB = resolveCanonicalHuman({
    displayName: 'CARLOS LOPEZ',
    docType: 'DNI',
    docNumber: '35444555'
  });

  const test3Pass = (personA.canonicalHumanId !== personB.canonicalHumanId);
  console.log(`  Person A Canonical ID: ${personA.canonicalHumanId}`);
  console.log(`  Person B Canonical ID: ${personB.canonicalHumanId}`);
  console.log(`  Disambiguated:         ${test3Pass ? 'TRUE' : 'FALSE'}`);
  console.log(`  TEST 3 STATUS: ${test3Pass ? 'PASS' : 'FAIL'}\n`);
  if (test3Pass) passedTests++;

  // --- TEST 4: Previously consumed IGJ row -> acquisition credit = 0 ---
  console.log('--- TEST 4: Previously Consumed IGJ Source Exhaustion ---');
  const continuityAuthority = new GlobalConsumedSourceAuthority();
  const igjResource = {
    resourceId: 'RES_30558188-9c77-41cb-8c83-06f3bb84b0bf',
    url: 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv',
    sha256: '9fc208f83c442ed880f035b483a4477686b08d4945ec78c1ef419212cbf3e59e'
  };

  const isExhausted = continuityAuthority.isResourceExhausted(igjResource.url, igjResource.sha256);
  const noveltyScore = scoreResourceNovelty(igjResource, continuityAuthority);
  const test4Pass = (isExhausted === true && noveltyScore.expectedNetNewHumans === 0 && noveltyScore.isEligibleForAcquisition === false);

  console.log(`  IGJ Exhausted Flag:          ${isExhausted}`);
  console.log(`  Expected Net-New Human Fuel: ${noveltyScore.expectedNetNewHumans}`);
  console.log(`  Eligible for Acquisition:    ${noveltyScore.isEligibleForAcquisition}`);
  console.log(`  TEST 4 STATUS: ${test4Pass ? 'PASS' : 'FAIL'}\n`);
  if (test4Pass) passedTests++;

  // --- TEST 5: Previously known production human absent from old fuel ledger ---
  console.log('--- TEST 5: Production Human In Global Exclusion Authority ---');
  // Check known production person ID from projection v2
  const knownProductionPersonId = 'atlas_arg_per_0000000000000001';
  const knownInAuthority = isKnownPreexisting(knownProductionPersonId);
  const test5Pass = (knownInAuthority === true);

  console.log(`  Checking Production Person: ${knownProductionPersonId}`);
  console.log(`  Detected in Global Authority: ${knownInAuthority}`);
  console.log(`  TEST 5 STATUS: ${test5Pass ? 'PASS' : 'FAIL'}\n`);
  if (test5Pass) passedTests++;

  // --- TEST 6: Brand-new person from genuinely unconsumed source -> credit = 1 ---
  console.log('--- TEST 6: Fresh Unconsumed Natural Person Credit ---');
  const brandNewDni = '998877665544';
  const freshPerson = resolveCanonicalHuman({
    displayName: 'JUAN VALENTIN UNKNOWNBORN',
    docType: 'DNI',
    docNumber: brandNewDni,
    sourceId: 'src_fresh_academic_openalex'
  });
  const freshKnown = isKnownPreexisting(freshPerson.canonicalHumanId);
  const freshSourceNovelty = scoreResourceNovelty({
    resourceId: 'RES_OPENALEX_AR_AUTHORS',
    url: 'https://api.openalex.org/authors?filter=last_known_institutions.country_code:AR',
    estimatedRows: 120000
  }, continuityAuthority);

  const test6Pass = (freshPerson.isNaturalPerson === true && freshKnown === false && freshSourceNovelty.isEligibleForAcquisition === true);
  console.log(`  Fresh Person Canonical ID: ${freshPerson.canonicalHumanId}`);
  console.log(`  Pre-existing in Authority: ${freshKnown}`);
  console.log(`  Fresh Source Novelty Score: ${freshSourceNovelty.priorityScore.toFixed(2)}`);
  console.log(`  TEST 6 STATUS: ${test6Pass ? 'PASS' : 'FAIL'}\n`);
  if (test6Pass) passedTests++;

  console.log(`================================================================`);
  console.log(`REGRESSION SUITE RESULTS: ${passedTests} / ${totalTests} PASSED`);
  const allPass = passedTests === totalTests;
  console.log(`IDENTITY_REGRESSION_SUITE_PASS =    ${allPass ? 'TRUE' : 'FALSE'}`);
  console.log(`NOVELTY_REGRESSION_SUITE_PASS =     ${allPass ? 'TRUE' : 'FALSE'}`);
  console.log(`SOURCE_CONTINUITY_REGRESSION_PASS = ${allPass ? 'TRUE' : 'FALSE'}`);
  console.log(`================================================================\n`);

  if (!allPass) {
    throw new Error('REGRESSION_SUITE_FAILED');
  }

  return {
    IDENTITY_REGRESSION_SUITE_PASS: allPass,
    NOVELTY_REGRESSION_SUITE_PASS: allPass,
    SOURCE_CONTINUITY_REGRESSION_PASS: allPass
  };
}

runRegressionSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
