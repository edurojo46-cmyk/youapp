import { supabase } from '../../supabase';
import { JitAuthorizationRequest, JitAuthorizationResult } from './types';

export class JitAuthorizationService {
  /**
   * Executes the atomic JIT authorization in PostgreSQL.
   * This guarantees strict TOCTOU locking and zero external effects.
   */
  static async authorize(request: JitAuthorizationRequest): Promise<JitAuthorizationResult> {
    const { data, error } = await supabase.rpc('authorize_execution_jit', {
      p_payload: request
    });

    if (error) {
      console.error('RPC Error:', error);
      // If RPC fails, we fail closed locally.
      return {
        status: 'UNKNOWN',
        reason_codes: ['RPC_EVALUATION_ERROR', error.message],
        authority_bundle_hash: 'failed',
        expires_at: new Date(0).toISOString()
      };
    }

    return data as JitAuthorizationResult;
  }
}
