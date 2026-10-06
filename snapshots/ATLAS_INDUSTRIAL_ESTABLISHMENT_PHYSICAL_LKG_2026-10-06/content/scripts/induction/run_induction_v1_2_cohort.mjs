import fs from 'node:fs';
import { runInductionEngineSession } from './run_atlas_induction_engine_v1.mjs';

async function main() {
  console.log('================================================================');
  console.log('🚀 ATLAS INDUCTION ENGINE V1.2: FRESH 50K INDUCTION RUN');
  console.log('================================================================\n');

  const inductionFlags = {
    ATLAS_INDUCTION_ENGINE: true,
    ATLAS_ADAPTIVE_BATCH: true,
    ATLAS_BATCH_PREFETCH: true,
    ATLAS_SATURATION_CONTROL: true,
    ATLAS_SERVER_BATCH_RPC: true
  };

  const START_LINE = 3200000;
  const LIMIT = 50000;

  const result = await runInductionEngineSession({
    sessionName: 'INDUCTION_V1_2_50K',
    startLine: START_LINE,
    targetLimit: LIMIT,
    flagsOverrides: inductionFlags,
    statusFile: 'atlas_induction_engine_status.json'
  });

  console.log('Result saved to reports/atlas/discovery/atlas_perf_induction_v1_2_cohort.json');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
