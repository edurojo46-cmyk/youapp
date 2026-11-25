/**
 * ATLAS 10F Provider-Neutral Error Taxonomy
 */

export type ExecutionErrorClass = 
  | 'CONFIG_ERROR'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_DESTINATION'
  | 'UNSUPPORTED_ACTION'
  | 'PAYLOAD_REJECTED'
  | 'PROVIDER_REJECTED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AMBIGUOUS_ACCEPTANCE'
  | 'PRE_ACCEPT_FAILURE'
  | 'UNKNOWN_PROVIDER_ERROR';

export class AtlasExecutionError extends Error {
  constructor(
    public readonly errorClass: ExecutionErrorClass,
    message: string,
    public readonly providerDetails?: any
  ) {
    super(message);
    this.name = 'AtlasExecutionError';
  }
}
