import { runIndustrialFactory } from './atlas_industrial_factory.mjs';

// Delegate to Atlas Industrial Ingestion Factory (5-Station Architecture with Strict Singleton Lock)
console.log('[AtlasPeopleWorker] Delegating execution to Atlas Industrial Ingestion Factory...');
runIndustrialFactory().catch(err => {
  console.error('[AtlasPeopleWorker] Fatal Ingestion Factory Error:', err);
  process.exit(1);
});
