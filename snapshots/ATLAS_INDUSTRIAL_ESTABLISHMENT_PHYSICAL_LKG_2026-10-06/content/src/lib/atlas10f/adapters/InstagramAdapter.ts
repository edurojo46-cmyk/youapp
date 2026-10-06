import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface InstagramProviderPayload {
  recipient?: { id: string };
  message?: { text: string };
  reply_to?: { comment_id: string };
}

export class InstagramAdapter extends PlatformAdapter<InstagramProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'Instagram Graph API',
      channel: 'INSTAGRAM',
      supportedActions: ['INSTAGRAM_DM', 'INSTAGRAM_PUBLIC_REPLY'],
      supportsPlainText: true,
      supportsSubject: false,
      requiresTargetContent: true,
      requiresConversationThread: true,
      supportsIdempotencyToken: false,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'INSTAGRAM_DM' && request.action_type !== 'INSTAGRAM_PUBLIC_REPLY') {
      return { status: 'CAPABILITY_MISMATCH', reason: 'Action not supported' };
    }
    if (!request.destination_ref || (request.destination_ref.kind !== 'INSTAGRAM_DM' && request.destination_ref.kind !== 'INSTAGRAM_PUBLIC_REPLY')) {
      return { status: 'MISSING_DESTINATION', reason: 'Invalid destination kind' };
    }

    if (request.action_type === 'INSTAGRAM_PUBLIC_REPLY') {
      if (request.destination_ref.kind !== 'INSTAGRAM_PUBLIC_REPLY' || !request.destination_ref.target_content_ref) {
        return { status: 'INVALID', reason: 'Public reply requires target_content_ref' };
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

  normalize(request: AtlasExecutionRequest): { body: string; subject?: string } {
    return { body: request.message_body.replace(/\r\n/g, '\n').trim() };
  }

  buildProviderPayload(request: AtlasExecutionRequest): InstagramProviderPayload {
    const norm = this.normalize(request);
    
    if (request.action_type === 'INSTAGRAM_PUBLIC_REPLY') {
      return {
        message: { text: norm.body },
        reply_to: { comment_id: (request.destination_ref as any).target_content_ref }
      };
    } else {
      // DM
      return {
        recipient: { id: (request.destination_ref as any).thread_ref },
        message: { text: norm.body }
      };
    }
  }
}
