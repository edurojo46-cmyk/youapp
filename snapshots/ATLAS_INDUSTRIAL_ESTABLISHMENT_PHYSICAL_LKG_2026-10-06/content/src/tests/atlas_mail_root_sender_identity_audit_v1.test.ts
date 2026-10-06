/**
 * ATLAS MAIL FABRIC — ROOT SENDER IDENTITY & MIME UTF-8 PREFLIGHT AUDIT V1
 *
 * Test Suite verifying:
 * 1. Canonical RFC 822 construction with strictly ONE "From: Atlas <canary@youapptv.com>"
 * 2. Envelope sender strictly "canary@youapptv.com"
 * 3. Message-ID domain strictly ending in "@email.youapptv.com"
 * 4. Zero Unix identity leaks ("root", "root@", "Sender: root", "root@localhost")
 * 5. RFC 2047 Encoded-Word encoding for non-ASCII headers (Subject: =?UTF-8?B?...?=)
 * 6. RFC 2045 Quoted-Printable encoding for UTF-8 body text without mojibake (Ã, Â, )
 * 7. Offline Preflight rejection on missing From, multiple From, root leaks, or unencoded non-ASCII
 * 8. Reality Audit truthful recording of manual placement & Microsoft anti-spam headers (SCL 5, BCL 0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AtlasRFC822Builder,
  AtlasPilotRealityAudit,
  AtlasMailReputationGuard
} from '../lib/atlasMailFabric';

describe('Atlas Mail — Root Sender Identity & MIME UTF-8 Preflight Audit V1', () => {
  let repGuard: AtlasMailReputationGuard;
  let audit: AtlasPilotRealityAudit;

  beforeEach(() => {
    repGuard = new AtlasMailReputationGuard();
    audit = new AtlasPilotRealityAudit(repGuard);
  });

  it('1. Constructs valid canonical message with strictly ONE From: Atlas <canary@youapptv.com>', () => {
    const result = AtlasRFC822Builder.buildCanonicalMessage({
      toEmail: 'destination@example.com',
      subject: 'Confirmación de servicio Atlas',
      bodyText: 'Este mensaje confirma que tu servicio de Atlas está funcionando correctamente.\nSi recibiste este correo, no necesitás realizar ninguna acción.'
    });

    expect(result.fromHeader).toBe('Atlas <canary@youapptv.com>');
    expect(result.envelopeSender).toBe('canary@youapptv.com');
    expect(result.messageId).toMatch(/^<canary\.\d+\.[a-f0-9]+@email\.youapptv\.com>$/);
    expect(result.rawMime).toContain('From: Atlas <canary@youapptv.com>\r\n');
    expect(result.rawMime).not.toContain('root');
  });

  it('2. Encodes and decodes Subject using RFC 2047 Encoded-Word format without mojibake', () => {
    const rawSubject = 'Confirmación de servicio Atlas';
    const encoded = AtlasRFC822Builder.encodeRFC2047Header(rawSubject);
    
    // Header must be RFC 2047 formatted
    expect(encoded).toBe('=?UTF-8?B?Q29uZmlybWFjacOzbiBkZSBzZXJ2aWNpbyBBdGxhcw==?=\r\n'.trim());
    
    // Must decode back cleanly to exact UTF-8
    const decoded = AtlasRFC822Builder.decodeRFC2047Header(encoded);
    expect(decoded).toBe('Confirmación de servicio Atlas');
    expect(decoded).not.toContain('Ã');
    expect(decoded).not.toContain('Â');
    expect(decoded).not.toContain('\uFFFD');
  });

  it('3. Encodes and decodes Body using Quoted-Printable format preserving accented characters', () => {
    const rawBody = [
      'Hola Eduardo,',
      '',
      'Este mensaje confirma que tu servicio de Atlas está funcionando correctamente.',
      '',
      'Si recibiste este correo, no necesitás realizar ninguna acción.',
      '',
      'Saludos,',
      'Atlas'
    ].join('\n');

    const qpEncoded = AtlasRFC822Builder.encodeQuotedPrintable(rawBody);

    // Accented characters must be encoded as hex escapes
    expect(qpEncoded).toContain('=C3=A1'); // á (está / necesitás)
    expect(qpEncoded).toContain('=C3=B3'); // ó (acción)
    expect(qpEncoded).not.toContain('Ã³');

    // Decodes back to exact original text
    const qpDecoded = AtlasRFC822Builder.decodeQuotedPrintable(qpEncoded);
    expect(qpDecoded).toContain('está');
    expect(qpDecoded).toContain('necesitás');
    expect(qpDecoded).toContain('acción');
    expect(qpDecoded).not.toContain('Ã');
  });

  it('4. Fails preflight validation when Subject contains raw unencoded non-ASCII bytes', () => {
    const rawMimeUnencodedSubject = [
      'From: Atlas <canary@youapptv.com>',
      'To: <user@example.com>',
      'Subject: Confirmación de servicio Atlas', // Raw non-ASCII unencoded
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeUnencodedSubject, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('Raw unencoded UTF-8 bytes detected in Subject header'))).toBe(true);
  });

  it('5. Fails preflight validation when From: header is missing', () => {
    const rawMimeWithoutFrom = [
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeWithoutFrom, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.fromHeaderCount).toBe(0);
    expect(validation.errors.some(e => e.includes("Missing mandatory 'From:'"))).toBe(true);
  });

  it('6. Fails preflight validation when From: header contains root or root@', () => {
    const rawMimeWithRootFrom = [
      'From: root <root@youapptv.com>',
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeWithRootFrom, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.hasUnixIdentityLeak).toBe(true);
    expect(validation.errors.some(e => e.includes('Unix identity leak in From'))).toBe(true);
  });

  it('7. Fails preflight validation when Sender: header contains root', () => {
    const rawMimeWithRootSender = [
      'From: Atlas <canary@youapptv.com>',
      'Sender: root@email.youapptv.com',
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeWithRootSender, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.hasUnixIdentityLeak).toBe(true);
    expect(validation.errors.some(e => e.includes('Unix identity leak in Sender'))).toBe(true);
  });

  it('8. Fails preflight validation when envelope sender is root or not canary@youapptv.com', () => {
    const rawMime = [
      'From: Atlas <canary@youapptv.com>',
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      '',
      'Body text'
    ].join('\r\n');

    const valRootEnv = AtlasRFC822Builder.validateRFC822Preflight(rawMime, 'root@youapptv.com');
    expect(valRootEnv.valid).toBe(false);
    expect(valRootEnv.errors.some(e => e.includes('Envelope sender cannot be root'))).toBe(true);

    const valWrongEnv = AtlasRFC822Builder.validateRFC822Preflight(rawMime, 'other@youapptv.com');
    expect(valWrongEnv.valid).toBe(false);
    expect(valWrongEnv.errors.some(e => e.includes("must be 'canary@youapptv.com'"))).toBe(true);
  });

  it('9. Fails preflight validation when multiple From: headers exist (RFC 5322 violation)', () => {
    const rawMimeMultipleFrom = [
      'From: Atlas <canary@youapptv.com>',
      'From: root <root@email.youapptv.com>',
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <canary.123@email.youapptv.com>',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeMultipleFrom, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.fromHeaderCount).toBe(2);
    expect(validation.errors.some(e => e.includes("Multiple 'From:' headers detected"))).toBe(true);
  });

  it('10. Fails preflight validation when Message-ID does not end in @email.youapptv.com or contains root', () => {
    const rawMimeBadMsgId = [
      'From: Atlas <canary@youapptv.com>',
      'To: <user@example.com>',
      'Subject: =?UTF-8?B?VGVzdA==?=',
      'Date: Thu, 10 Sep 2026 12:00:00 GMT',
      'Message-ID: <root.12345@external.com>',
      '',
      'Body text'
    ].join('\r\n');

    const validation = AtlasRFC822Builder.validateRFC822Preflight(rawMimeBadMsgId, 'canary@youapptv.com');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes("Message-ID contains 'root'"))).toBe(true);
    expect(validation.errors.some(e => e.includes("Message-ID domain must end with"))).toBe(true);
  });

  it('11. Reality Audit records observed Microsoft headers (SPF/DKIM/DMARC PASS, SCL 5, BCL 0, JUNK)', async () => {
    audit.recordVerifiedPlacement('OUTLOOK', 'SPAM/JUNK', 'MANUAL_OBSERVATION');
    audit.recordObservedSenderIdentity('Atlas <canary@youapptv.com>', 'Atlas <canary@youapptv.com>');
    audit.recordMicrosoftObservedHeaders({
      spf: 'PASS',
      dkim: 'PASS',
      dmarc: 'PASS',
      compauth: 'PASS',
      scl: 5,
      destination: 'JUNK',
      bcl: 0
    });

    const summary = await audit.performRealityAudit('youapptv.com');

    expect(summary.OUTLOOK_PLACEMENT).toBe('SPAM/JUNK');
    expect(summary.OUTLOOK_PLACEMENT_SOURCE).toBe('MANUAL_OBSERVATION');
    expect(summary.VISIBLE_SENDER).toBe('Atlas <canary@youapptv.com>');
    expect(summary.SENDER_IDENTITY_STATUS).toBe('PASS');
    expect(summary.SPF_RESULT).toBe('PASS');
    expect(summary.DKIM_RESULT).toBe('PASS');
    expect(summary.DMARC_RESULT).toBe('PASS');
    expect(summary.COMPAUTH_RESULT).toBe('PASS');
    expect(summary.MICROSOFT_SCL).toBe(5);
    expect(summary.MICROSOFT_DESTINATION).toBe('JUNK');
    expect(summary.MICROSOFT_BCL).toBe(0);
    expect(summary.INBOX_DELIVERABILITY).toBe('NOT_CERTIFIED');
    expect(summary.CERTIFICATION_STATUS).toBe('NOT_CERTIFIED');
    expect(summary.CAN_SCALE).toBe(false);
    expect(summary.MASS_SENDING).toBe('BLOCKED');
    expect(summary.PRODUCTION).toBe('STRICT_HOLD');
  });
});
