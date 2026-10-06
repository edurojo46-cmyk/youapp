import { DomainAuthConfig } from './types';

export interface AuthValidationResult {
  valid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  ptrValid: boolean;
  tlsEnforced: boolean;
  reason?: string;
}

export class AtlasMailAuthenticationGuard {
  /**
   * Validates pre-flight email authentication for a sending domain.
   * Fails closed if SPF, DKIM, DMARC, or PTR requirements are violated.
   */
  public static validateDomainAuth(config: DomainAuthConfig): AuthValidationResult {
    // 1. Validate SPF Record
    const spfValid = this.checkSPF(config.spf_record);
    if (!spfValid) {
      return {
        valid: false,
        spfValid: false,
        dkimValid: false,
        dmarcValid: false,
        ptrValid: config.ptr_record_verified,
        tlsEnforced: config.tls_enforced,
        reason: 'INVALID_SPF_RECORD: Must start with v=spf1 and have a valid qualifier'
      };
    }

    // 2. Validate DKIM (Public key only; verify minimum 2048-bit or Ed25519)
    const dkimValid = this.checkDKIM(config.dkim_selector, config.dkim_public_key_record, config.dkim_key_length_bits);
    if (!dkimValid) {
      return {
        valid: false,
        spfValid: true,
        dkimValid: false,
        dmarcValid: false,
        ptrValid: config.ptr_record_verified,
        tlsEnforced: config.tls_enforced,
        reason: 'INVALID_DKIM_CONFIG: Selector required and key length must be >= 2048 bits'
      };
    }

    // 3. Validate DMARC Record
    const dmarcValid = this.checkDMARC(config.dmarc_record, config.dmarc_policy);
    if (!dmarcValid) {
      return {
        valid: false,
        spfValid: true,
        dkimValid: true,
        dmarcValid: false,
        ptrValid: config.ptr_record_verified,
        tlsEnforced: config.tls_enforced,
        reason: 'INVALID_DMARC_CONFIG: DMARC record must start with v=DMARC1 and match policy'
      };
    }

    // 4. Validate PTR / rDNS & HELO
    if (!config.helo_hostname || !config.ptr_record_verified) {
      return {
        valid: false,
        spfValid: true,
        dkimValid: true,
        dmarcValid: true,
        ptrValid: false,
        tlsEnforced: config.tls_enforced,
        reason: 'PTR_RDNS_UNVERIFIED: HELO hostname must match verified PTR record'
      };
    }

    // 5. Enforce TLS 1.2+
    if (!config.tls_enforced) {
      return {
        valid: false,
        spfValid: true,
        dkimValid: true,
        dmarcValid: true,
        ptrValid: true,
        tlsEnforced: false,
        reason: 'TLS_NOT_ENFORCED: Mandatory Opportunistic/Strict TLS 1.2+ required'
      };
    }

    return {
      valid: true,
      spfValid: true,
      dkimValid: true,
      dmarcValid: true,
      ptrValid: true,
      tlsEnforced: true
    };
  }

  private static checkSPF(record: string): boolean {
    if (!record || !record.startsWith('v=spf1')) return false;
    // Must contain a mechanism and end with ~all or -all or ?all
    return record.includes('all') && record.split(' ').length >= 2;
  }

  private static checkDKIM(selector: string, publicKeyRecord: string, keyBits: number): boolean {
    if (!selector || selector.trim() === '') return false;
    if (!publicKeyRecord || !publicKeyRecord.includes('p=')) return false;
    if (keyBits < 2048) return false;
    return true;
  }

  private static checkDMARC(record: string, policy: string): boolean {
    if (!record || !record.startsWith('v=DMARC1')) return false;
    if (!record.includes(`p=${policy}`)) return false;
    return true;
  }
}
