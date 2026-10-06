import { IdentityInductionField } from '../lib/identity_field.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const START_LINE = 2865000;
const LIMIT = 1000;

async function test() {
  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');
  console.log('Loaded field:');
  console.log('Field Source Count:', field.fieldSource.count);
  console.log('Field Stable Count:', field.fieldStable.count);

  let withoutReserveAbsent = 0;
  let withoutReservePresent = 0;
  let withReserveAbsent = 0;
  let withReservePresent = 0;

  for await (const b of streamChunkedCandidates(SOURCE_FILE, { startLine: START_LINE, limit: LIMIT, batchSize: 500 })) {
    for (const cand of b) {
      const payload = {
        source_id: cand.source_id,
        source_person_id: cand.source_person_id,
        identifier_value: cand.identifier_value
      };

      // Test 1: Without reserveInFlight
      const res1 = field.classifyCandidate(payload);
      if (res1.classification === 'DEFINITELY_ABSENT') withoutReserveAbsent++;
      else withoutReservePresent++;

      // Test 2: With reserveInFlight
      field.reserveInFlight('worker_1', payload);
      const res2 = field.classifyCandidate(payload, 'worker_1');
      if (res2.classification === 'DEFINITELY_ABSENT') withReserveAbsent++;
      else withReservePresent++;
      field.releaseReservation('worker_1', payload);
    }
  }

  console.log('\nResults for 1,000 candidates:');
  console.log('Without reserve: DEFINITELY_ABSENT =', withoutReserveAbsent, 'POSSIBLY_PRESENT =', withoutReservePresent);
  console.log('With reserve   : DEFINITELY_ABSENT =', withReserveAbsent, 'POSSIBLY_PRESENT =', withReservePresent);
}

test().catch(console.error);
