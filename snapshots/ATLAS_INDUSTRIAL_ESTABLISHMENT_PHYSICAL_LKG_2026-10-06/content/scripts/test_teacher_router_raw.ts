/**
 * scripts/test_teacher_router_raw.ts
 *
 * Tests the INTERPRET_QUERY action of the Edge Function with teacher queries.
 * Captures raw HTTP response to diagnose why data comes back null/undefined.
 *
 * Run: npx tsx scripts/test_teacher_router_raw.ts
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EDGE_FN = 'atlas-gemini-person-search';

const queries = [
  'maestros en CABA',
  'docentes en CABA',
  'profesores en CABA',
];

async function run() {
  console.log('=== TEACHER QUERY ROUTER RAW TEST ===\n');

  for (const q of queries) {
    console.log(`QUERY: "${q}"`);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
      },
      body: JSON.stringify({ action: 'INTERPRET_QUERY', query: q }),
    });

    const status = res.status;
    let rawText: string;
    try {
      rawText = await res.text();
    } catch {
      rawText = '(could not read body)';
    }

    console.log(`  HTTP_STATUS = ${status}`);
    console.log(`  RAW_BODY = ${rawText.slice(0, 500)}`);

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (parsed?.data) {
      console.log(`  PARSED_INTENT        = ${parsed.data.intent}`);
      console.log(`  PARSED_PROFESSION    = ${parsed.data.profession}`);
      console.log(`  PARSED_PERSON_CAT    = ${parsed.data.personCategory}`);
      console.log(`  PARSED_GEOGRAPHY     = ${JSON.stringify(parsed.data.location)}`);

      const isTeacher =
        parsed.data.personCategory === 'TEACHER' ||
        ['docente', 'maestro', 'profesor'].some(t =>
          (parsed.data.profession || '').toLowerCase().includes(t)
        );
      console.log(`  TEACHER_ROUTING      = ${isTeacher ? 'PASS ✅' : 'FAIL ❌'}`);
    } else if (parsed?.error) {
      console.log(`  ERROR = ${parsed.error} status=${parsed.status || 'N/A'}`);
      if (parsed.status === 'QUOTA_EXHAUSTED') {
        console.log('  → QUERY budget exhausted for gemini-3.5-flash-lite');
        console.log('  → FAIL FAST — do not retry');
      }
    } else {
      console.log(`  UNEXPECTED_RESPONSE = ${JSON.stringify(parsed)}`);
    }
    console.log('');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
