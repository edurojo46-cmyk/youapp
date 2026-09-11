import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../lib/atlasQueryFabric/AtlasReasoningQueryFabric';
import { PARTIAL_BENCHMARK_CASES } from '../../scripts/run_partial_benchmark';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';

describe('ATLAS REAL REASONING BENCHMARK PARTIAL V1 (GENUINELY GROUNDED & QUERYABLE CASES)', () => {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const queryFabric = new AtlasReasoningQueryFabric(supabase);

  for (const bCase of PARTIAL_BENCHMARK_CASES) {
    it(`[${bCase.benchmark_id}] ${bCase.category}: ${bCase.question}`, async () => {
      const ans = bCase.question.startsWith('What do we know about')
        ? await queryFabric.answerWhatDoWeKnow(bCase.question.replace('What do we know about ', '').replace('?', ''), bCase.tenant_id)
        : await queryFabric.answerQuery(bCase.question, bCase.tenant_id);

      const res = bCase.evaluate(ans);
      expect(res.pass, res.error).toBe(true);

      // Verify zero unsupported claims
      for (const claim of ans.grounded_claims || []) {
        if (claim.epistemic_status !== 'INFERRED') {
          expect(claim.evidence_sources.length).toBeGreaterThan(0);
        }
      }
    });
  }
});
