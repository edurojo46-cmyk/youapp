/**
 * ATLAS MAIL FABRIC — CANONICAL RFC 822 / MIME BUILDER & PREFLIGHT VALIDATOR
 *
 * Enforces strict RFC 5322, RFC 2047 & RFC 2045 MIME standards:
 * - RFC 2047 Encoded-Word for Subject and non-ASCII headers (=?UTF-8?B?...?=)
 * - RFC 2045 Quoted-Printable Content-Transfer-Encoding for UTF-8 body
 * - Strictly ONE 'From:' header: "Atlas <canary@youapptv.com>"
 * - Zero occurrences of Unix identity leaks ("root", "root@", "Sender: root")
 * - Strictly verified Envelope sender: "canary@youapptv.com"
 * - Message-ID domain ending in "@email.youapptv.com"
 * - Clean CRLF (\r\n) normalization for standard SMTP transmission
 * - Zero Mojibake / encoding corruption (rejects Ã, Â, )
 */

import crypto from 'crypto';

export interface RFC822MessageOptions {
  toEmail: string;
  subject: string;
  bodyText: string;
  executionId?: string;
  messageIdDomain?: string; // default: 'email.youapptv.com'
  fromDisplayName?: string; // default: 'Atlas'
  fromEmail?: string; // default: 'canary@youapptv.com'
  envelopeSender?: string; // default: 'canary@youapptv.com'
  customHeaders?: Record<string, string>;
}

export interface PreflightValidationResult {
  valid: boolean;
  errors: string[];
  fromHeaderCount: number;
  fromHeaderValue?: string;
  senderHeaderValue?: string;
  messageIdValue?: string;
  envelopeSender: string;
  hasUnixIdentityLeak: boolean;
  decodedSubject: string;
  decodedBody: string;
  hasMojibake: boolean;
}

export class AtlasRFC822Builder {
  public static readonly DEFAULT_FROM_DISPLAY = 'Atlas';
  public static readonly DEFAULT_FROM_EMAIL = 'canary@youapptv.com';
  public static readonly DEFAULT_ENVELOPE_SENDER = 'canary@youapptv.com';
  public static readonly DEFAULT_MESSAGE_ID_DOMAIN = 'email.youapptv.com';

  /**
   * Prohibited legacy methods to prevent Unix identity leaks & encoding corruption:
   */
  public static readonly PROHIBITED_METHODS = [
    'sudo sendmail',
    '/usr/sbin/sendmail',
    'mail',
    'mailx',
    'heredoc_ssh_sendmail',
    'raw_8bit_unencoded_headers',
    'SIMULATED_PROVIDER',
    'fixture',
    'mock',
    'dry-run'
  ] as const;

  /**
   * Encodes non-ASCII header values using RFC 2047 Base64 Encoded-Word format.
   * e.g. "Confirmación de servicio Atlas" -> "=?UTF-8?B?Q29uZmlybWFjacOzbiBkZSBzZXJ2aWNpbyBBdGxhcw==?="
   */
  public static encodeRFC2047Header(text: string): string {
    if (/^[\x20-\x7E]*$/.test(text)) {
      return text;
    }
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    return `=?UTF-8?B?${b64}?=`;
  }

  /**
   * Decodes RFC 2047 Encoded-Word headers (both Base64 and Quoted-Printable).
   */
  public static decodeRFC2047Header(header: string): string {
    return header.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        return Buffer.from(text, 'base64').toString(charset.toLowerCase() === 'utf-8' ? 'utf-8' : 'latin1');
      } else if (enc === 'Q') {
        const bytes: number[] = [];
        let i = 0;
        while (i < text.length) {
          if (text[i] === '_') {
            bytes.push(0x20);
            i++;
          } else if (text[i] === '=' && i + 2 < text.length && /^[0-9A-Fa-f]{2}$/.test(text.substr(i + 1, 2))) {
            bytes.push(parseInt(text.substr(i + 1, 2), 16));
            i += 3;
          } else {
            bytes.push(text.charCodeAt(i));
            i++;
          }
        }
        return Buffer.from(bytes).toString('utf-8');
      }
      return text;
    });
  }

  /**
   * Encodes plain text into RFC 2045 Quoted-Printable format.
   */
  public static encodeQuotedPrintable(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const encodedLines: string[] = [];

    for (const line of lines) {
      const utf8Bytes = Buffer.from(line, 'utf-8');
      let currentLine = '';

      for (let i = 0; i < utf8Bytes.length; i++) {
        const b = utf8Bytes[i];
        let charRepr = '';

        if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126)) {
          charRepr = String.fromCharCode(b);
        } else if (b === 32 || b === 9) {
          if (i === utf8Bytes.length - 1) {
            charRepr = `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
          } else {
            charRepr = String.fromCharCode(b);
          }
        } else {
          charRepr = `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
        }

        if (currentLine.length + charRepr.length > 74) {
          encodedLines.push(currentLine + '=');
          currentLine = '';
        }
        currentLine += charRepr;
      }
      encodedLines.push(currentLine);
    }

    return encodedLines.join('\r\n');
  }

  /**
   * Decodes RFC 2045 Quoted-Printable text back into UTF-8 plain text.
   */
  public static decodeQuotedPrintable(qp: string): string {
    const withoutSoftBreaks = qp.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    let i = 0;
    while (i < withoutSoftBreaks.length) {
      if (withoutSoftBreaks[i] === '=' && i + 2 < withoutSoftBreaks.length && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.substr(i + 1, 2))) {
        bytes.push(parseInt(withoutSoftBreaks.substr(i + 1, 2), 16));
        i += 3;
      } else {
        const charCode = withoutSoftBreaks.charCodeAt(i);
        if (charCode === 13 && withoutSoftBreaks.charCodeAt(i + 1) === 10) {
          bytes.push(13, 10);
          i += 2;
        } else if (charCode === 10) {
          bytes.push(10);
          i += 1;
        } else {
          bytes.push(charCode);
          i += 1;
        }
      }
    }
    return Buffer.from(bytes).toString('utf-8');
  }

  /**
   * Constructs a canonical, strictly validated RFC 822 / MIME message string.
   */
  public static buildCanonicalMessage(options: RFC822MessageOptions): {
    rawMime: string;
    envelopeSender: string;
    messageId: string;
    fromHeader: string;
    encodedSubject: string;
  } {
    const fromDisplayName = options.fromDisplayName || this.DEFAULT_FROM_DISPLAY;
    const fromEmail = options.fromEmail || this.DEFAULT_FROM_EMAIL;
    const envelopeSender = options.envelopeSender || this.DEFAULT_ENVELOPE_SENDER;
    const msgDomain = options.messageIdDomain || this.DEFAULT_MESSAGE_ID_DOMAIN;

    const execId = options.executionId || `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const opaqueId = `canary.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    const messageId = `<${opaqueId}@${msgDomain}>`;
    
    // Encode From display name if non-ASCII
    const encodedDisplayName = this.encodeRFC2047Header(fromDisplayName);
    const fromHeader = `${encodedDisplayName} <${fromEmail}>`;
    
    // Encode Subject using RFC 2047
    const encodedSubject = this.encodeRFC2047Header(options.subject);
    const dateStr = new Date().toUTCString();

    const headerLines = [
      `From: ${fromHeader}`,
      `To: <${options.toEmail}>`,
      `Subject: ${encodedSubject}`,
      `Date: ${dateStr}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      `Feedback-ID: pilot_v1:atlas_core:TRANSACTIONAL:ATLASMAIL`,
      `X-Atlas-Execution-ID: ${execId}`
    ];

    if (options.customHeaders) {
      for (const [k, v] of Object.entries(options.customHeaders)) {
        headerLines.push(`${k}: ${this.encodeRFC2047Header(v)}`);
      }
    }

    const encodedBody = this.encodeQuotedPrintable(options.bodyText);
    const rawMime = `${headerLines.join('\r\n')}\r\n\r\n${encodedBody}\r\n`;

    // Run offline preflight validation immediately
    const validation = this.validateRFC822Preflight(rawMime, envelopeSender);
    if (!validation.valid) {
      throw new Error(`PREFLIGHT_VALIDATION_FAILED: ${validation.errors.join('; ')}`);
    }

    return {
      rawMime,
      envelopeSender,
      messageId,
      fromHeader,
      encodedSubject
    };
  }

  /**
   * Offline Preflight Validator:
   * Inspects a raw RFC 822 MIME payload and confirms all sender identity and encoding requirements.
   */
  public static validateRFC822Preflight(rawMime: string, envelopeSender: string): PreflightValidationResult {
    const errors: string[] = [];
    const lines = rawMime.split(/\r?\n/);
    const headerEndIndex = lines.findIndex(l => l.trim() === '');
    const headerLines = headerEndIndex !== -1 ? lines.slice(0, headerEndIndex) : lines;
    const bodyText = headerEndIndex !== -1 ? lines.slice(headerEndIndex + 1).join('\r\n') : '';

    const fromHeaders = headerLines.filter(l => l.toLowerCase().startsWith('from:'));
    const senderHeaders = headerLines.filter(l => l.toLowerCase().startsWith('sender:'));
    const subjectHeaders = headerLines.filter(l => l.toLowerCase().startsWith('subject:'));
    const messageIdHeaders = headerLines.filter(l => l.toLowerCase().startsWith('message-id:'));
    const cteHeaders = headerLines.filter(l => l.toLowerCase().startsWith('content-transfer-encoding:'));

    // 1. Check From: header count
    if (fromHeaders.length === 0) {
      errors.push("Missing mandatory 'From:' header in RFC 822 message");
    } else if (fromHeaders.length > 1) {
      errors.push(`Multiple 'From:' headers detected (${fromHeaders.length}); RFC 5322 allows exactly one`);
    }

    const fromVal = fromHeaders[0]?.substring(5).trim();

    // 2. Check for Unix identity / root leaks in From
    if (fromVal) {
      if (
        fromVal.toLowerCase().includes('root@') ||
        fromVal.toLowerCase().includes('<root>') ||
        fromVal.toLowerCase().startsWith('root ') ||
        fromVal === 'root'
      ) {
        errors.push(`Unix identity leak in From header: '${fromVal}'`);
      }

      if (!fromVal.includes(this.DEFAULT_FROM_EMAIL)) {
        errors.push(`From header '${fromVal}' does not match expected identity '<${this.DEFAULT_FROM_EMAIL}>'`);
      }
    }

    // 3. Check for root in Sender header
    const senderVal = senderHeaders[0]?.substring(7).trim();
    if (senderVal) {
      if (senderVal.toLowerCase().includes('root')) {
        errors.push(`Unix identity leak in Sender header: '${senderVal}'`);
      }
    }

    // 4. Check Envelope Sender
    if (envelopeSender.toLowerCase().includes('root')) {
      errors.push(`Envelope sender cannot be root: '${envelopeSender}'`);
    }
    if (envelopeSender.toLowerCase() !== this.DEFAULT_ENVELOPE_SENDER.toLowerCase()) {
      errors.push(`Envelope sender '${envelopeSender}' must be '${this.DEFAULT_ENVELOPE_SENDER}'`);
    }

    // 5. Check Message-ID domain
    const msgIdVal = messageIdHeaders[0]?.substring(11).trim();
    if (!msgIdVal) {
      errors.push("Missing mandatory 'Message-ID:' header");
    } else {
      if (msgIdVal.toLowerCase().includes('root')) {
        errors.push(`Message-ID contains 'root': '${msgIdVal}'`);
      }
      if (!msgIdVal.endsWith(`@${this.DEFAULT_MESSAGE_ID_DOMAIN}>`) && !msgIdVal.endsWith('@youapptv.com>')) {
        errors.push(`Message-ID domain must end with @${this.DEFAULT_MESSAGE_ID_DOMAIN}>, found '${msgIdVal}'`);
      }
    }

    // 6. Check Subject encoding (RFC 2047)
    const rawSubject = subjectHeaders[0]?.substring(8).trim() || '';
    if (!rawSubject) {
      errors.push("Missing mandatory 'Subject:' header");
    } else {
      // Check if raw non-ASCII bytes leaked into unencoded subject
      if (/[^\x20-\x7E]/.test(rawSubject) && !rawSubject.startsWith('=?')) {
        errors.push(`Raw unencoded UTF-8 bytes detected in Subject header: '${rawSubject}'`);
      }
    }
    const decodedSubject = this.decodeRFC2047Header(rawSubject);

    // 7. Check Content-Transfer-Encoding & Body Decoding
    const cteVal = cteHeaders[0]?.substring(26).trim().toLowerCase() || '';
    let decodedBody = bodyText;
    if (cteVal === 'quoted-printable') {
      decodedBody = this.decodeQuotedPrintable(bodyText);
    } else if (cteVal === 'base64') {
      decodedBody = Buffer.from(bodyText.replace(/\r?\n/g, ''), 'base64').toString('utf-8');
    }

    // 8. Check for Mojibake / UTF-8 double-encoding artifacts (Ã, Â, \uFFFD)
    const hasMojibake = (
      decodedSubject.includes('Ã') ||
      decodedSubject.includes('Â') ||
      decodedSubject.includes('\uFFFD') ||
      decodedBody.includes('Ã') ||
      decodedBody.includes('Â') ||
      decodedBody.includes('\uFFFD')
    );

    if (hasMojibake) {
      errors.push('UTF-8 Mojibake / encoding corruption detected in decoded message');
    }

    // 9. Check entire header block for any raw root leaks
    const hasRootLeak = headerLines.some(l => 
      l.toLowerCase().includes('root@localhost') ||
      l.toLowerCase().includes('root@email.youapptv.com') ||
      l.toLowerCase().includes('root@youapptv.com')
    );

    if (hasRootLeak) {
      errors.push('Raw root identity detected in header block');
    }

    return {
      valid: errors.length === 0,
      errors,
      fromHeaderCount: fromHeaders.length,
      fromHeaderValue: fromVal,
      senderHeaderValue: senderVal,
      messageIdValue: msgIdVal,
      envelopeSender,
      hasUnixIdentityLeak: hasRootLeak || errors.some(e => e.includes('root')),
      decodedSubject,
      decodedBody,
      hasMojibake
    };
  }
}
