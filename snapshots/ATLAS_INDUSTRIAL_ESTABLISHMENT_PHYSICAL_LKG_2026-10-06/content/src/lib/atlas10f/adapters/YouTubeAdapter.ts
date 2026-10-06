import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface YouTubeProviderPayload {
  snippet: {
    videoId?: string;
    liveChatId?: string;
    parentId?: string;
    textOriginal: string;
  };
}

export class YouTubeAdapter extends PlatformAdapter<YouTubeProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'YouTube Data API',
      channel: 'YOUTUBE',
      supportedActions: ['YOUTUBE_COMMENT', 'YOUTUBE_LIVE_CHAT'],
      supportsPlainText: true,
      supportsSubject: false,
      requiresTargetContent: true,
      requiresConversationThread: false,
      supportsIdempotencyToken: false,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'YOUTUBE_COMMENT' && request.action_type !== 'YOUTUBE_LIVE_CHAT') {
      return { status: 'CAPABILITY_MISMATCH' };
    }
    if (!request.destination_ref || (request.destination_ref.kind !== 'YOUTUBE_COMMENT' && request.destination_ref.kind !== 'YOUTUBE_LIVE_CHAT')) {
      return { status: 'MISSING_DESTINATION' };
    }
    
    if (request.action_type === 'YOUTUBE_LIVE_CHAT') {
      if (request.destination_ref.kind !== 'YOUTUBE_LIVE_CHAT' || !request.destination_ref.live_chat_ref) {
        return { status: 'INVALID', reason: 'Live chat requires live_chat_ref' };
      }
    }

    if (!request.message_body) return { status: 'MISSING_MESSAGE' };
    if (!request.message_certification_id) return { status: 'INVALID_CERTIFICATION_BINDING' };
    
    return { status: 'VALID' };
  }

  normalize(request: AtlasExecutionRequest): { body: string } {
    return { body: request.message_body.replace(/\r\n/g, '\n').trim() };
  }

  buildProviderPayload(request: AtlasExecutionRequest): YouTubeProviderPayload {
    const norm = this.normalize(request);
    
    if (request.action_type === 'YOUTUBE_LIVE_CHAT') {
      return {
        snippet: {
          liveChatId: (request.destination_ref as any).live_chat_ref,
          textOriginal: norm.body
        }
      };
    } else {
      return {
        snippet: {
          videoId: (request.destination_ref as any).video_ref,
          parentId: (request.destination_ref as any).parent_comment_ref,
          textOriginal: norm.body
        }
      };
    }
  }
}
