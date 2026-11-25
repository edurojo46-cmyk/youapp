import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface XProviderPayload {
  text: string;
  reply?: { in_reply_to_tweet_id: string };
  direct_message?: { target: { recipient_id: string } };
}

export class XAdapter extends PlatformAdapter<XProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'X API',
      channel: 'X',
      supportedActions: ['X_DM', 'X_PUBLIC_REPLY'],
      supportsPlainText: true,
      supportsSubject: false,
      requiresTargetContent: true,
      requiresConversationThread: true,
      supportsIdempotencyToken: false,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'X_DM' && request.action_type !== 'X_PUBLIC_REPLY') {
      return { status: 'CAPABILITY_MISMATCH' };
    }
    if (!request.destination_ref || (request.destination_ref.kind !== 'X_DM' && request.destination_ref.kind !== 'X_PUBLIC_REPLY')) {
      return { status: 'MISSING_DESTINATION' };
    }
    if (request.action_type === 'X_PUBLIC_REPLY') {
      if (request.destination_ref.kind !== 'X_PUBLIC_REPLY' || !request.destination_ref.target_post_ref) {
        return { status: 'INVALID', reason: 'Public reply requires target_post_ref' };
      }
    }
    if (!request.message_body) {
      return { status: 'MISSING_MESSAGE' };
    }
    if (!request.message_certification_id) {
      return { status: 'INVALID_CERTIFICATION_BINDING' };
    }
    return { status: 'VALID' };
  }

  normalize(request: AtlasExecutionRequest): { body: string } {
    return { body: request.message_body.replace(/\r\n/g, '\n').trim() };
  }

  buildProviderPayload(request: AtlasExecutionRequest): XProviderPayload {
    const norm = this.normalize(request);
    
    if (request.action_type === 'X_PUBLIC_REPLY') {
      return {
        text: norm.body,
        reply: { in_reply_to_tweet_id: (request.destination_ref as any).target_post_ref }
      };
    } else {
      return {
        text: norm.body,
        direct_message: { target: { recipient_id: (request.destination_ref as any).conversation_ref } }
      };
    }
  }
}
