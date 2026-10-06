/**
 * ATLAS CONTACT ENRICHER V1
 * 
 * Person-scoped, verified public email and phone resolution.
 * 
 * Strict Invariants:
 * - GENERATED_EMAILS = 0
 * - GUESSED_EMAILS = 0
 * - PRIVATE_EMAIL_HARVESTING = 0
 * - GENERATED_PHONES = 0
 * - ORGANIZATION_CONTACT_ONLY strictly separated (never attributed to person).
 * - EMAIL_KNOWN != EMAIL_SEND_ELIGIBLE
 * - PHONE_KNOWN != WHATSAPP_SEND_ELIGIBLE
 */

export interface ContactEnrichmentInput {
  person_id: string;
  full_name: string;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  source_id: string;
  source_url: string;
  is_institutional_source: boolean;
}

export interface ContactEnrichmentResult {
  person_id: string;
  person_scoped_email: string | null;
  email_verification_status: 'VERIFIED' | 'REJECTED_GENERIC_ORG' | 'REJECTED_UNVERIFIED' | 'NO_CONTACT';
  person_scoped_phone: string | null;
  phone_verification_status: 'VERIFIED' | 'REJECTED_GENERIC_SWITCHBOARD' | 'REJECTED_UNVERIFIED' | 'NO_CONTACT';
  channel_eligibility: {
    email_known: boolean;
    email_send_eligible: boolean;
    phone_known: boolean;
    whatsapp_send_eligible: boolean;
    eligibility_reason: string;
  };
  source_evidence: string;
}

export class AtlasContactEnricher {
  private static readonly GENERIC_PREFIXES = new Set([
    'info', 'contacto', 'administracion', 'ventas', 'recepcion', 'secretaria',
    'secretariageneral', 'prensa', 'consultas', 'atencion', 'soporte', 'rrhh',
    'decanato', 'vicedecanato', 'presidencia', 'comercio', 'industria', 'hacienda',
    'despacho', 'comunicaciones', 'notificaciones', 'mesadeentradas', 'ayuda'
  ]);

  private static readonly SWITCHBOARD_NUMBERS = [
    '4982-5555', '4982-0200', '4958-9900', '4123-4567', '4347-9000', '4010-0000'
  ];

  public enrichContact(input: ContactEnrichmentInput): ContactEnrichmentResult {
    let verifiedEmail: string | null = null;
    let emailStatus: 'VERIFIED' | 'REJECTED_GENERIC_ORG' | 'REJECTED_UNVERIFIED' | 'NO_CONTACT' = 'NO_CONTACT';

    let verifiedPhone: string | null = null;
    let phoneStatus: 'VERIFIED' | 'REJECTED_GENERIC_SWITCHBOARD' | 'REJECTED_UNVERIFIED' | 'NO_CONTACT' = 'NO_CONTACT';

    // 1. Process Candidate Email
    if (input.candidate_email && input.candidate_email.includes('@')) {
      const emailLower = input.candidate_email.toLowerCase().trim();
      const prefix = emailLower.split('@')[0].replace(/[._-]/g, '');

      if (AtlasContactEnricher.GENERIC_PREFIXES.has(prefix)) {
        // Strict separation: Org contact only
        emailStatus = 'REJECTED_GENERIC_ORG';
      } else if (input.is_institutional_source && input.source_url) {
        // Valid person-scoped institutional email
        verifiedEmail = emailLower;
        emailStatus = 'VERIFIED';
      } else {
        emailStatus = 'REJECTED_UNVERIFIED';
      }
    }

    // 2. Process Candidate Phone
    if (input.candidate_phone && input.candidate_phone.trim() !== '') {
      const phoneClean = input.candidate_phone.trim();
      const isSwitchboard = AtlasContactEnricher.SWITCHBOARD_NUMBERS.some(sb => phoneClean.includes(sb));

      if (isSwitchboard) {
        phoneStatus = 'REJECTED_GENERIC_SWITCHBOARD';
      } else if (input.is_institutional_source && input.source_url) {
        verifiedPhone = phoneClean;
        phoneStatus = 'VERIFIED';
      } else {
        phoneStatus = 'REJECTED_UNVERIFIED';
      }
    }

    // 3. Channel Eligibility Rules: KNOWN != SEND_ELIGIBLE
    const emailKnown = verifiedEmail !== null;
    const phoneKnown = verifiedPhone !== null;

    // Communication permission is NEVER automatically granted upon factual discovery
    const emailSendEligible = false; // Requires explicit opted-in consent or formal institutional protocol
    const whatsappSendEligible = false; // Strictly protected personal channel

    return {
      person_id: input.person_id,
      person_scoped_email: verifiedEmail,
      email_verification_status: emailStatus,
      person_scoped_phone: verifiedPhone,
      phone_verification_status: phoneStatus,
      channel_eligibility: {
        email_known: emailKnown,
        email_send_eligible: emailSendEligible,
        phone_known: phoneKnown,
        whatsapp_send_eligible: whatsappSendEligible,
        eligibility_reason: emailKnown
          ? 'Contact factually known but communication ineligible without consent / protocol gate'
          : 'No verified contact channel available'
      },
      source_evidence: `Source: [${input.source_id}] ${input.source_url}`
    };
  }
}
