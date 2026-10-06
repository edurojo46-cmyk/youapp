import { PlatformAdapter } from '../PlatformAdapter';
import { AtlasExecutionRequest, ProviderCapability, ValidationResult } from '../types';

export interface EmailProviderPayload {
  to: string;
  subject: string;
  body: string;
}

export class EmailAdapter extends PlatformAdapter<EmailProviderPayload> {
  
  getCapabilities(): ProviderCapability {
    return {
      provider: 'SMTP/Email',
      channel: 'EMAIL',
      supportedActions: ['EMAIL_SEND'],
      supportsPlainText: true,
      supportsSubject: true,
      requiresTargetContent: false,
      requiresConversationThread: false,
      supportsIdempotencyToken: true,
      supportsProviderNativeIdempotency: false
    };
  }

  validate(request: AtlasExecutionRequest): ValidationResult {
    if (request.action_type !== 'EMAIL_SEND') {
      return { status: 'CAPABILITY_MISMATCH', reason: 'EmailAdapter only supports EMAIL_SEND' };
    }
    if (!request.destination_ref || request.destination_ref.kind !== 'EMAIL') {
      return { status: 'MISSING_DESTINATION', reason: 'Destination must be of kind EMAIL' };
    }
    if (!request.destination_ref.email_address_id) {
      return { status: 'INVALID', reason: 'Missing email_address_id in destination_ref' };
    }
    if (!request.message_body) {
      return { status: 'MISSING_MESSAGE' };
    }
    if (!request.message_subject) {
      return { status: 'CAPABILITY_MISMATCH', reason: 'Email requires a subject' };
    }
    if (!request.message_certification_id) {
      return { status: 'INVALID_CERTIFICATION_BINDING' };
    }
    
    return { status: 'VALID' };
  }

  normalize(request: AtlasExecutionRequest): { body: string; subject?: string } {
    // Normalization preserves semantics. Safe canonicalization only.
    const cleanBody = request.message_body.replace(/\r\n/g, '\n').trim();
    const cleanSubject = request.message_subject?.trim() || '';
    
    return { body: cleanBody, subject: cleanSubject };
  }

  buildProviderPayload(request: AtlasExecutionRequest): EmailProviderPayload {
    const norm = this.normalize(request);
    
    // In a real system, the email_address_id would be resolved to a string email address 
    // before or during 10F execution. For contract validation we expect the destination ref structure.
    return {
      to: (request.destination_ref as any).email_address_id,
      subject: norm.subject!,
      body: norm.body
    };
  }
}
