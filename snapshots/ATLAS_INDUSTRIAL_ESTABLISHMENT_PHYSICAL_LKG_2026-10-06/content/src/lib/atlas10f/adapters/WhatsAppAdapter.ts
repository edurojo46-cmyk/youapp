import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface WhatsAppProviderPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text' | 'template';
  text?: { body: string };
  template?: { name: string; language: { code: string }; components: any[] };
}

export class WhatsAppAdapter extends PlatformAdapter<WhatsAppProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'WhatsApp Cloud API',
      channel: 'WHATSAPP',
      supportedActions: ['WHATSAPP_SERVICE_REPLY', 'WHATSAPP_MARKETING_MESSAGE'],
      supportsPlainText: true,
      supportsSubject: false,
      requiresTargetContent: false,
      requiresConversationThread: false, 
      supportsIdempotencyToken: false,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'WHATSAPP_SERVICE_REPLY' && request.action_type !== 'WHATSAPP_MARKETING_MESSAGE') {
      return { status: 'CAPABILITY_MISMATCH', reason: 'WhatsAppAdapter only supports WA service/marketing actions' };
    }
    if (!request.destination_ref || request.destination_ref.kind !== 'WHATSAPP') {
      return { status: 'MISSING_DESTINATION', reason: 'Destination must be of kind WHATSAPP' };
    }
    if (!request.destination_ref.whatsapp_destination_id) {
      return { status: 'INVALID', reason: 'Missing whatsapp_destination_id in destination_ref' };
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
    const cleanBody = request.message_body.replace(/\r\n/g, '\n').trim();
    return { body: cleanBody };
  }

  buildProviderPayload(request: AtlasExecutionRequest): WhatsAppProviderPayload {
    const norm = this.normalize(request);
    
    // Simplification for 10F-A payload shape mapping
    const isMarketing = request.action_type === 'WHATSAPP_MARKETING_MESSAGE';

    return {
      messaging_product: 'whatsapp',
      to: (request.destination_ref as any).whatsapp_destination_id,
      type: isMarketing ? 'template' : 'text',
      ...(isMarketing 
        ? { template: { name: 'marketing_default', language: { code: 'en' }, components: [] } } 
        : { text: { body: norm.body } })
    };
  }
}
