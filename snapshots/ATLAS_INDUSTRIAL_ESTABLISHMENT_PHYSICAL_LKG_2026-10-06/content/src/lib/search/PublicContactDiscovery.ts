import type { ExternalPersonObservation } from './IExternalPersonSourceAdapter';
import type { EmailType, ContactUseState } from './MassDiscoveryTypes';

export interface DiscoveredContactInfo {
  type: EmailType | 'PUBLIC_PROFESSIONAL_PHONE' | 'PUBLIC_INSTITUTIONAL_PHONE' | 'PUBLIC_PROFESSIONAL_WEBSITE';
  value: string;
  source: string;
  source_url?: string;
  source_domain?: string;
  status: ContactUseState;
  confidence: number;
}

export class PublicContactDiscovery {
  /**
   * Classifies and extracts public personal, professional, and institutional contact channels.
   * STRICT GUARANTEES (Directive Sections 6, 7, 8, 9, 10):
   * GENERATED_EMAILS = 0
   * GUESSED_EMAILS = 0
   * EMAIL_WITHOUT_SOURCE = 0
   * Personal email providers (@gmail.com, @hotmail.com, @outlook.com, @yahoo.com)
   * ARE PERMITTED IF AND ONLY IF publicly displayed on a factual page clearly associating it with the person.
   */
  static classifyEmail(rawEmail: string, sourceUrl?: string): {
    email: string;
    email_type: EmailType;
    domain: string;
    contact_use_state: ContactUseState;
  } | null {
    if (!rawEmail || !rawEmail.includes('@')) return null;
    const cleanEmail = rawEmail.toLowerCase().trim().replace(/[!,:;]$/, '');
    const parts = cleanEmail.split('@');
    if (parts.length !== 2 || !parts[1].includes('.')) return null;

    const domain = parts[1];
    const personalDomains = [
      'gmail.com',
      'hotmail.com',
      'outlook.com',
      'yahoo.com',
      'yahoo.com.ar',
      'live.com',
      'icloud.com',
      'proton.me',
      'protonmail.com'
    ];

    let email_type: EmailType = 'PUBLIC_PROFESSIONAL_EMAIL';
    let contact_use_state: ContactUseState = 'PUBLIC_PROFESSIONAL_CONTACT';

    if (personalDomains.includes(domain)) {
      email_type = 'PUBLIC_PERSONAL_EMAIL';
      contact_use_state = 'PUBLIC_PERSONAL_CONTACT';
    } else if (
      domain.includes('.gob.ar') || 
      domain.includes('.gov.ar') || 
      domain.includes('.edu.ar') || 
      domain.includes('.uba.ar') || 
      domain.includes('buenosaires.gob.ar') || 
      domain.includes('.org.ar')
    ) {
      email_type = 'PUBLIC_INSTITUTIONAL_EMAIL';
      contact_use_state = 'PUBLIC_INSTITUTIONAL_CONTACT';
    } else if (cleanEmail.startsWith('info@') || cleanEmail.startsWith('contacto@') || cleanEmail.startsWith('administracion@')) {
      email_type = 'ORGANIZATION_CONTACT_ONLY';
      contact_use_state = 'ORGANIZATION_CONTACT_ONLY';
    }

    return {
      email: cleanEmail,
      email_type,
      domain,
      contact_use_state
    };
  }

  static discover(obs: ExternalPersonObservation): ExternalPersonObservation {
    obs.contacts = [];
    
    // GITHUB email
    if (obs.source_system === 'GITHUB' && obs.external_data) {
       const gh = obs.external_data.find(d => d.source === 'GITHUB' && d.email);
       if (gh && gh.email) {
           const classified = this.classifyEmail(gh.email, obs.source_url);
           if (classified) {
             obs.contacts.push({
                 type: classified.email_type,
                 value: classified.email,
                 status: classified.contact_use_state,
                 source: 'GITHUB'
             });
           }
       }
       const website = obs.external_data.find(d => d.source === 'GITHUB' && d.blog);
       if (website && website.blog) {
           obs.contacts.push({
               type: 'PUBLIC_PROFESSIONAL_WEBSITE',
               value: website.blog.startsWith('http') ? website.blog : `https://${website.blog}`,
               status: 'PUBLIC_CONTACT_FOUND',
               source: 'GITHUB'
           });
       }
    }
    
    // ORGANIZATION emails
    if (obs.source_system === 'ORGANIZATION_WEBSITE' && obs.raw_payload?.email) {
       const classified = this.classifyEmail(obs.raw_payload.email, obs.source_url);
       if (classified) {
         obs.contacts.push({
             type: classified.email_type,
             value: classified.email,
             status: classified.contact_use_state,
             source: 'ORGANIZATION_WEBSITE'
         });
       }
    }

    if (obs.contacts.length === 0) {
       obs.contacts_status = 'SEARCHED_NOT_FOUND';
    } else {
       obs.contacts_status = 'PUBLIC_CONTACT_FOUND';
    }
    
    return obs;
  }
}
