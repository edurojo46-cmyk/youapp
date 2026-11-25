import { supabase } from '../../../lib/supabase';
import crypto from 'node:crypto';
import type { IPersonSourceHarvester, HarvesterMetrics } from './IPersonSourceHarvester';
import type { ExternalPersonObservation } from '../../../lib/search/IExternalPersonSourceAdapter';

export abstract class BasePersonHarvester implements IPersonSourceHarvester {
  protected metrics: HarvesterMetrics = {
    rowsSeen: 0,
    rowsInserted: 0,
    rowsSkipped: 0,
    rowsChanged: 0,
    errorCount: 0
  };

  abstract getSourceId(): string;
  abstract discoverSourceVersion(): Promise<string>;
  abstract fetch(): Promise<any>;
  abstract parse(rawData: any): Promise<any[]>;
  abstract normalize(parsedData: any[]): Promise<ExternalPersonObservation[]>;
  
  public async emitObservations(observations: ExternalPersonObservation[]): Promise<void> {
    if (!observations || observations.length === 0) return;
    
    this.metrics.rowsSeen += observations.length;
    
    // We insert into atlas_person_observations, which is the V2 required pipeline.
    // The table might be named 'atlas_person_observations', let's assume standard upsert.
    for (const obs of observations) {
      try {
        // Using a basic content hash for idempotency based on stringified data
        const hash = crypto.createHash('sha256').update(JSON.stringify(obs)).digest('hex');

        const { error } = await supabase.from('atlas_person_observations').upsert({
          source_id: obs.source_system,
          source_record_id: obs.source_record_id,
          observation_type: 'PERSON_EVIDENCE',
          value_jsonb: obs,
          source_content_hash: hash,
          observed_at: new Date().toISOString()
        }, { onConflict: 'source_id,source_record_id,source_content_hash' });
        
        if (error) {
          console.error(`Failed to emit observation for ${obs.source_record_id}:`, error);
          this.metrics.errorCount++;
        } else {
          this.metrics.rowsInserted++;
        }
      } catch (err) {
         console.error("Emit error:", err);
         this.metrics.errorCount++;
      }
    }
  }

  public async checkpoint(state: any): Promise<void> {
    // Basic implementation could write to a local file or simple DB state
    console.log(`[${this.getSourceId()}] Checkpoint:`, state);
  }

  public reportMetrics(): HarvesterMetrics {
    return { ...this.metrics };
  }

  public async run(): Promise<void> {
    const sourceId = this.getSourceId();
    let runId: string | null = null;
    let heartbeatInterval: any = null;

    try {
      console.log(`[${sourceId}] Starting harvester run...`);
      
      // 1. Acquire Lease
      const { data: acquireData, error: acquireError } = await supabase.rpc('acquire_atlas_ingestion_run_v1', {
        p_source_id: sourceId,
        p_lease_duration_seconds: 300
      });

      if (acquireError) {
         if (acquireError.message.includes('ALREADY_RUNNING')) {
            console.log(`[${sourceId}] Run already active. Aborting.`);
            return;
         }
         throw acquireError;
      }

      runId = acquireData;
      console.log(`[${sourceId}] Acquired run ID: ${runId}`);

      // 2. Start Heartbeat
      heartbeatInterval = setInterval(async () => {
         await supabase.rpc('heartbeat_atlas_ingestion_run_v1', {
            p_run_id: runId,
            p_lease_duration_seconds: 300
         });
      }, 60000); // every minute

      // 3. Execution Pipeline
      await this.discoverSourceVersion();
      const rawData = await this.fetch();
      const parsedData = await this.parse(rawData);
      const observations = await this.normalize(parsedData);
      await this.emitObservations(observations);

      // 4. Finalize Success
      clearInterval(heartbeatInterval);
      await supabase.rpc('finalize_atlas_ingestion_run_v1', {
        p_run_id: runId,
        p_status: 'SUCCESS',
        p_rows_seen: this.metrics.rowsSeen,
        p_rows_inserted: this.metrics.rowsInserted,
        p_rows_skipped: this.metrics.rowsSkipped,
        p_rows_changed: this.metrics.rowsChanged
      });
      console.log(`[${sourceId}] Harvester completed successfully. Metrics:`, this.metrics);

    } catch (err: any) {
       console.error(`[${sourceId}] Harvester failed:`, err);
       
       if (heartbeatInterval) clearInterval(heartbeatInterval);
       
       if (runId) {
          await supabase.rpc('finalize_atlas_ingestion_run_v1', {
            p_run_id: runId,
            p_status: 'FAILED',
            p_error_code: 'HARVEST_ERROR',
            p_error_message: err.message || 'Unknown error'
          });
       }
    }
  }
}
