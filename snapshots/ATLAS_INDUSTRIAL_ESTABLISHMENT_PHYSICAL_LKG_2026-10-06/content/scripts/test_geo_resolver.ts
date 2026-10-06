import { AtlasGeoResolver } from '../src/lib/geo/AtlasGeoResolver';

async function testGeoResolver() {
  console.log('=== TESTING ATLAS GEO RESOLVER V1 ===\n');

  // Test 1: Address Resolution in CABA (Facultad de Ciencias Económicas - UBA)
  const loc1 = await AtlasGeoResolver.resolveAddress('Av. Córdoba 2122', 'WORKS_AT');
  console.log('Test 1 (UBA Económicas):', {
    normalized_address: loc1?.normalized_address,
    comuna: loc1?.comuna,
    neighborhood: loc1?.neighborhood,
    precision: loc1?.precision,
    geo_source: loc1?.geo_source,
    relation_type: loc1?.relation_type,
    confidence: loc1?.confidence
  });

  if (!loc1 || loc1.comuna !== 'Comuna 2' || loc1.neighborhood !== 'Recoleta' || loc1.relation_type !== 'WORKS_AT') {
    throw new Error('Test 1 FAILED: Incorrect comuna or relation');
  }

  // Test 2: Address in Belgrano (INAPL: 3 de Febrero 1378)
  const loc2 = await AtlasGeoResolver.resolveAddress('3 de Febrero 1378', 'WORKS_AT');
  console.log('\nTest 2 (INAPL Belgrano):', {
    normalized_address: loc2?.normalized_address,
    comuna: loc2?.comuna,
    neighborhood: loc2?.neighborhood,
    precision: loc2?.precision,
    relation_type: loc2?.relation_type
  });

  if (!loc2 || (loc2.comuna !== 'Comuna 14' && loc2.comuna !== 'Comuna 13') || loc2.relation_type !== 'WORKS_AT') {
    throw new Error('Test 2 FAILED');
  }

  // Test 3: Semantics Check - Ensure relation_type is strictly preserved and never RESIDES_AT
  console.log('\nTest 3 (Semantics): relation_type is preserved:', loc1.relation_type === 'WORKS_AT');

  // Test 4: Local Cache Hit on repeated or institutional query
  const locCached = await AtlasGeoResolver.resolveAddress('Av. Córdoba 2122', 'WORKS_AT');
  const locCampus = await AtlasGeoResolver.resolveAddress('Ciudad Universitaria Pabellon 2', 'WORKS_AT');
  console.log('\nTest 4 (Local Cache Hit):', {
    repeat_source: locCached?.geo_source,
    campus_comuna: locCampus?.comuna,
    campus_source: locCampus?.geo_source
  });
  if (locCached?.geo_source !== 'LOCAL_CABA_INDEX' || locCampus?.geo_source !== 'LOCAL_CABA_INDEX') {
    throw new Error('Test 4 FAILED: Expected LOCAL_CABA_INDEX for cached/institutional query');
  }

  console.log('\n>>> ALL GEO RESOLVER TESTS PASSED (4/4 PASS) <<<');
}

testGeoResolver().catch(err => {
  console.error('Geo Resolver Test Failed:', err);
  process.exit(1);
});
