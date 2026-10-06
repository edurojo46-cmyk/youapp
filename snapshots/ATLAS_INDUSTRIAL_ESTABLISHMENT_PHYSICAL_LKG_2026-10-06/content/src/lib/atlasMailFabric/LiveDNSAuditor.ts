import * as dns from 'dns/promises';

export interface LiveDNSAuditResult {
  domain: string;
  spf: { verified: boolean; record: string; error?: string };
  dkim: { verified: boolean; selector: string; record: string; keyLengthBits?: number; error?: string };
  dmarc: { verified: boolean; policy: 'none' | 'quarantine' | 'reject'; record: string; error?: string };
  ptr: { verified: boolean; ip: string; heloHost: string; resolvedHostnames: string[]; error?: string };
  allPassed: boolean;
  errors: string[];
}

export class LiveDNSAuditor {
  /**
   * Queries public DNS records for SPF, DKIM, DMARC, and FCrDNS (PTR) with strict live validation.
   * NEVER uses mock fallbacks. Returns verified: false if records are absent or invalid.
   */
  static async auditLiveDomain(params: {
    domain: string;
    dkimSelector: string;
    heloHost: string;
    publicIp: string;
  }): Promise<LiveDNSAuditResult> {
    const { domain, dkimSelector, heloHost, publicIp } = params;
    const errors: string[] = [];

    const result: LiveDNSAuditResult = {
      domain,
      spf: { verified: false, record: '' },
      dkim: { verified: false, selector: dkimSelector, record: '' },
      dmarc: { verified: false, policy: 'none', record: '' },
      ptr: { verified: false, ip: publicIp, heloHost, resolvedHostnames: [] },
      allPassed: false,
      errors
    };

    // 1. Strict Live SPF Audit
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const flat = txtRecords.map(r => r.join(''));
      const spf = flat.find(t => t.startsWith('v=spf1'));
      if (spf) {
        result.spf.record = spf;
        if (spf.includes('~all') || spf.includes('-all')) {
          result.spf.verified = true;
        } else {
          result.spf.error = 'SPF policy does not end with ~all or -all';
          errors.push(result.spf.error);
        }
      } else {
        result.spf.error = `No SPF record (v=spf1) found on ${domain}`;
        errors.push(result.spf.error);
      }
    } catch (err: any) {
      result.spf.error = `SPF DNS query error on ${domain}: ${err.message}`;
      errors.push(result.spf.error);
    }

    // 2. Strict Live DKIM Audit
    const dkimFqdn = `${dkimSelector}._domainkey.${domain}`;
    try {
      const txtRecords = await dns.resolveTxt(dkimFqdn);
      const flat = txtRecords.map(r => r.join(''));
      const dkim = flat.find(t => t.includes('v=DKIM1') || t.includes('p='));
      if (dkim) {
        result.dkim.record = dkim;
        const keyMatch = dkim.match(/p=([A-Za-z0-9+/=]+)/);
        if (keyMatch && keyMatch[1]) {
          const rawKey = keyMatch[1];
          const keyBuffer = Buffer.from(rawKey, 'base64');
          const bitLength = keyBuffer.length * 8;
          result.dkim.keyLengthBits = bitLength;

          if (bitLength >= 2048) {
            result.dkim.verified = true;
          } else {
            result.dkim.error = `DKIM key length too short (${bitLength} bits < 2048 bits)`;
            errors.push(result.dkim.error);
          }
        } else {
          result.dkim.error = `DKIM record missing public key parameter (p=) on ${dkimFqdn}`;
          errors.push(result.dkim.error);
        }
      } else {
        result.dkim.error = `No DKIM record found at ${dkimFqdn}`;
        errors.push(result.dkim.error);
      }
    } catch (err: any) {
      result.dkim.error = `DKIM DNS query error on ${dkimFqdn}: ${err.message}`;
      errors.push(result.dkim.error);
    }

    // 3. Strict Live DMARC Audit
    const dmarcFqdn = `_dmarc.${domain}`;
    try {
      const txtRecords = await dns.resolveTxt(dmarcFqdn);
      const flat = txtRecords.map(r => r.join(''));
      const dmarc = flat.find(t => t.startsWith('v=DMARC1'));
      if (dmarc) {
        result.dmarc.record = dmarc;
        const policyMatch = dmarc.match(/p=(none|quarantine|reject)/i);
        if (policyMatch) {
          result.dmarc.policy = policyMatch[1].toLowerCase() as any;
          if (result.dmarc.policy === 'quarantine' || result.dmarc.policy === 'reject') {
            result.dmarc.verified = true;
          } else {
            result.dmarc.error = 'DMARC policy is "p=none"; must be "quarantine" or "reject" for certified outbound';
            errors.push(result.dmarc.error);
          }
        } else {
          result.dmarc.error = 'DMARC record missing policy tag (p=)';
          errors.push(result.dmarc.error);
        }
      } else {
        result.dmarc.error = `No DMARC record found at ${dmarcFqdn}`;
        errors.push(result.dmarc.error);
      }
    } catch (err: any) {
      result.dmarc.error = `DMARC DNS query error on ${dmarcFqdn}: ${err.message}`;
      errors.push(result.dmarc.error);
    }

    // 4. Strict Live PTR / FCrDNS Audit
    try {
      const hostnames = await dns.reverse(publicIp);
      result.ptr.resolvedHostnames = hostnames;

      const matchingHost = hostnames.find(h => h.toLowerCase() === heloHost.toLowerCase());
      if (matchingHost) {
        const forwardIps = await dns.resolve4(matchingHost);
        if (forwardIps.includes(publicIp)) {
          result.ptr.verified = true;
        } else {
          result.ptr.error = `Forward DNS for ${matchingHost} (${forwardIps.join(', ')}) does not match IP ${publicIp}`;
          errors.push(result.ptr.error);
        }
      } else {
        result.ptr.error = `Reverse DNS for ${publicIp} returned [${hostnames.join(', ')}], which does not match HELO host ${heloHost}`;
        errors.push(result.ptr.error);
      }
    } catch (err: any) {
      result.ptr.error = `PTR / rDNS query error for ${publicIp}: ${err.message}`;
      errors.push(result.ptr.error);
    }

    result.allPassed = result.spf.verified && result.dkim.verified && result.dmarc.verified && result.ptr.verified;
    return result;
  }
}
