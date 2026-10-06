import { AtlasExecutionRequest, ValidationResult, ProviderCapability } from './types';

export abstract class PlatformAdapter<TProviderPayload> {
  /**
   * Retrieves deterministic capabilities of this adapter.
   */
  abstract getCapabilities(): ProviderCapability;

  /**
   * Validates if the structural constraints of the request match the adapter's capabilities.
   * Does NOT mutate the request.
   */
  abstract validate(request: AtlasExecutionRequest): ValidationResult;

  /**
   * Performs strictly transport-safe normalization (e.g. line endings).
   * Must NOT mutate the original request, but return a new sanitized/wrapped copy
   * representing the payload strings.
   * If a semantic rewrite would be needed, this must throw or return CAPABILITY_MISMATCH in validation.
   */
  abstract normalize(request: AtlasExecutionRequest): { body: string; subject?: string };

  /**
   * Deterministically builds the specific shape expected by the provider SDK or REST API.
   * This does NOT invoke the network.
   */
  abstract buildProviderPayload(request: AtlasExecutionRequest): TProviderPayload;

  // By deliberate architectural design, there is NO send() method. 
  // 10F-A is strictly bounded to contract generation, not real-world execution.
}
