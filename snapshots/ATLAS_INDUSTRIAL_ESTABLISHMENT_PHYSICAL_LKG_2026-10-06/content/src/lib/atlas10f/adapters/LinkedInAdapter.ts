import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface LinkedInProviderPayload {
  author: string;
  commentary: string;
  parentEntity: string;
}

export class LinkedInAdapter extends PlatformAdapter<LinkedInProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'LinkedIn API',
      channel: 'LINKEDIN',
      supportedActions: ['LINKEDIN_COMMENT'],
      supportsPlainText: true,
      supportsSubject: false,
      requiresTargetContent: true,
      requiresConversationThread: false,
      supportsIdempotencyToken: false,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'LINKEDIN_COMMENT') {
      return { status: 'CAPABILITY_MISMATCH' };
    }
    if (!request.destination_ref || request.destination_ref.kind !== 'LINKEDIN_COMMENT') {
      return { status: 'MISSING_DESTINATION' };
    }
    if (!request.message_body) return { status: 'MISSING_MESSAGE' };
    if (!request.message_certification_id) return { status: 'INVALID_CERTIFICATION_BINDING' };
    
    return { status: 'VALID' };
  }

  normalize(request: AtlasExecutionRequest): { body: string } {
    return { body: request.message_body.replace(/\r\n/g, '\n').trim() };
  }

  buildProviderPayload(request: AtlasExecutionRequest): LinkedInProviderPayload {
    const norm = this.normalize(request);
    
    return {
      author: `urn:li:person:${(request.destination_ref as any).account_ref}`,
      commentary: norm.body,
      parentEntity: (request.destination_ref as any).target_post_ref
    };
  }
}
