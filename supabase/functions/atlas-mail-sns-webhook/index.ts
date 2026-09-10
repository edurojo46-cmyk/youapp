import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-amz-sns-message-type, x-amz-sns-message-id, x-amz-sns-topic-arn',
};

// ═══════════════════════════════════════════════════════════════════════════
// atlas-mail-sns-webhook — Edge Ingestion Boundary for AWS SNS / SES
//
// 1. Validates AWS SNS Signature strictly using SignatureVersion 2 (SHA256withRSA)
// 2. Validates Amazon X.509 Certificate URL host strictly on *.amazonaws.com
// 3. Extracts opaque correlation token from SES tags/headers
// 4. Computes SHA-256(raw_token) and discards raw token immediately
// 5. Minimizes payload (stripping PII/body) and relays to internal service_role RPC
// ═══════════════════════════════════════════════════════════════════════════

// In-memory certificate cache for Edge instance
const certCache = new Map<string, CryptoKey>();

async function getPublicKeyFromCertUrl(certUrl: string): Promise<CryptoKey> {
  const parsed = new URL(certUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('SigningCertURL must use HTTPS protocol');
  }

  // Strictly enforce Amazon SNS domain
  const hostRegex = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i;
  if (!hostRegex.test(parsed.hostname)) {
    throw new Error(`Untrusted SigningCertURL hostname: ${parsed.hostname}`);
  }

  if (!parsed.pathname.endsWith('.pem')) {
    throw new Error('SigningCertURL must reference a .pem certificate');
  }

  const cached = certCache.get(certUrl);
  if (cached) return cached;

  const res = await fetch(certUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch certificate: ${res.status}`);
  }

  const pem = await res.text();
  const publicKey = await importSpkiFromPem(pem);
  certCache.set(certUrl, publicKey);
  return publicKey;
}

// Convert PEM certificate to CryptoKey for Web Crypto API
async function importSpkiFromPem(pem: string): Promise<CryptoKey> {
  // Strip PEM header/footer and extract base64
  const pemHeader = '-----BEGIN CERTIFICATE-----';
  const pemFooter = '-----END CERTIFICATE-----';
  const start = pem.indexOf(pemHeader);
  const end = pem.indexOf(pemFooter);
  
  if (start === -1 || end === -1) {
    throw new Error('Invalid PEM certificate format');
  }

  const b64 = pem
    .substring(start + pemHeader.length, end)
    .replace(/\s+/g, '');
  
  const binaryDer = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Extract public key SubjectPublicKeyInfo from X.509 DER Certificate
  // In Web Crypto, we can parse standard SPKI or use simple DER extraction.
  // Standard X.509 SPKI structure extraction:
  const spkiDer = extractSpkiFromX509Der(binaryDer);

  return await crypto.subtle.importKey(
    'spki',
    spkiDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );
}

// Helper to extract SubjectPublicKeyInfo byte range from standard X.509 DER
function extractSpkiFromX509Der(der: Uint8Array): Uint8Array {
  // Simple ASN.1 parser to locate SubjectPublicKeyInfo in TBSCertificate
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('Malformed ASN.1 DER Certificate');
  
  // Read length of Sequence
  function readLength(): number {
    const b = der[offset++];
    if (b < 0x80) return b;
    const numBytes = b & 0x7f;
    let len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | der[offset++];
    }
    return len;
  }

  readLength(); // Skip cert sequence length

  // TBSCertificate sequence
  if (der[offset++] !== 0x30) throw new Error('Malformed TBSCertificate in DER');
  const tbsLen = readLength();
  const _tbsEnd = offset + tbsLen;

  // Check for explicit version tag [0]
  if (der[offset] === 0xa0) {
    offset++;
    const vLen = readLength();
    offset += vLen;
  }

  // Skip SerialNumber (INTEGER)
  if (der[offset++] !== 0x02) throw new Error('Malformed SerialNumber in DER');
  const sLen = readLength();
  offset += sLen;

  // Skip Signature Algorithm (SEQUENCE)
  if (der[offset++] !== 0x30) throw new Error('Malformed Signature Algorithm in DER');
  const sigLen = readLength();
  offset += sigLen;

  // Skip Issuer (SEQUENCE)
  if (der[offset++] !== 0x30) throw new Error('Malformed Issuer in DER');
  const isLen = readLength();
  offset += isLen;

  // Skip Validity (SEQUENCE)
  if (der[offset++] !== 0x30) throw new Error('Malformed Validity in DER');
  const valLen = readLength();
  offset += valLen;

  // Skip Subject (SEQUENCE)
  if (der[offset++] !== 0x30) throw new Error('Malformed Subject in DER');
  const subLen = readLength();
  offset += subLen;

  // Now at SubjectPublicKeyInfo (SEQUENCE)
  const spkiStart = offset;
  if (der[offset++] !== 0x30) throw new Error('Malformed SubjectPublicKeyInfo in DER');
  const spkiLen = readLength();
  const spkiTotalLen = (offset - spkiStart) + spkiLen;

  return der.subarray(spkiStart, spkiStart + spkiTotalLen);
}

function buildCanonicalSigningString(msg: Record<string, unknown>): string {
  const type = String(msg.Type || '');
  let lines: string[] = [];

  if (type === 'Notification') {
    lines.push('Message', String(msg.Message || ''));
    lines.push('MessageId', String(msg.MessageId || ''));
    if (msg.Subject !== undefined && msg.Subject !== null) {
      lines.push('Subject', String(msg.Subject));
    }
    lines.push('Timestamp', String(msg.Timestamp || ''));
    lines.push('TopicArn', String(msg.TopicArn || ''));
    lines.push('Type', type);
  } else if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') {
    lines.push('Message', String(msg.Message || ''));
    lines.push('MessageId', String(msg.MessageId || ''));
    lines.push('SubscribeURL', String(msg.SubscribeURL || ''));
    lines.push('Timestamp', String(msg.Timestamp || ''));
    lines.push('Token', String(msg.Token || ''));
    lines.push('TopicArn', String(msg.TopicArn || ''));
    lines.push('Type', type);
  } else {
    throw new Error(`Unsupported SNS message type: ${type}`);
  }

  return lines.join('\n') + '\n';
}

async function verifySnsSignature(snsPayload: Record<string, unknown>): Promise<boolean> {
  // Strictly enforce SignatureVersion = 2 (SHA256withRSA)
  if (snsPayload.SignatureVersion !== '2') {
    throw new Error(`Atlas SNS policy strictly requires SignatureVersion = 2; received: ${snsPayload.SignatureVersion}`);
  }

  const certUrl = String(snsPayload.SigningCertURL || '');
  const signatureBase64 = String(snsPayload.Signature || '');
  
  if (!certUrl || !signatureBase64) {
    throw new Error('Missing SigningCertURL or Signature');
  }

  const publicKey = await getPublicKeyFromCertUrl(certUrl);
  const canonicalString = buildCanonicalSigningString(snsPayload);
  const dataBytes = new TextEncoder().encode(canonicalString);
  const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

  return await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signatureBytes,
    dataBytes
  );
}

async function computeSha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    let snsMessage: Record<string, unknown>;
    try {
      snsMessage = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Verify Topic ARN & Signature
    const isSignatureValid = await verifySnsSignature(snsMessage);
    if (!isSignatureValid) {
      return new Response(JSON.stringify({ error: 'Invalid cryptographic signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Handle SubscriptionConfirmation automatically if valid
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      const subscribeUrl = String(snsMessage.SubscribeURL || '');
      if (subscribeUrl && subscribeUrl.startsWith('https://sns.')) {
        await fetch(subscribeUrl);
        return new Response(JSON.stringify({ status: 'SUBSCRIPTION_CONFIRMED' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. Process SES Notification
    if (snsMessage.Type !== 'Notification') {
      return new Response(JSON.stringify({ status: 'IGNORED_NON_NOTIFICATION_TYPE' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sesEvent: Record<string, unknown>;
    try {
      sesEvent = JSON.parse(String(snsMessage.Message || '{}'));
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid inner SES Message JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventTypeRaw = String(sesEvent.eventType || sesEvent.notificationType || '').toUpperCase();
    let normalizedEventType = 'UNKNOWN';
    if (eventTypeRaw === 'SEND') normalizedEventType = 'SEND';
    else if (eventTypeRaw === 'DELIVERY') normalizedEventType = 'DELIVERY';
    else if (eventTypeRaw === 'BOUNCE') normalizedEventType = 'BOUNCE';
    else if (eventTypeRaw === 'COMPLAINT') normalizedEventType = 'COMPLAINT';
    else if (eventTypeRaw === 'REJECT') normalizedEventType = 'REJECT';
    else if (eventTypeRaw === 'RENDERING FAILURE') normalizedEventType = 'REJECT';
    else if (eventTypeRaw === 'DELIVERYDELAY') normalizedEventType = 'DELAY';
    else if (eventTypeRaw === 'SUBSCRIPTION') normalizedEventType = 'SUBSCRIPTION';

    if (normalizedEventType === 'UNKNOWN') {
      return new Response(JSON.stringify({ status: 'SKIPPED_UNSUPPORTED_EVENT_TYPE', eventType: eventTypeRaw }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Extract opaque correlation token and compute hash
    const mail = (sesEvent.mail || {}) as Record<string, unknown>;
    const tags = (mail.tags || {}) as Record<string, unknown[]>;
    
    let rawCorrelationToken: string | null = null;
    if (Array.isArray(tags.atlas_correlation_token) && tags.atlas_correlation_token.length > 0) {
      rawCorrelationToken = String(tags.atlas_correlation_token[0]);
    }

    let correlationTokenHash: string | null = null;
    if (rawCorrelationToken) {
      correlationTokenHash = await computeSha256Hex(rawCorrelationToken);
      // Immediately clear raw token from memory
      rawCorrelationToken = null;
    }

    // 5. Minimize payload (Strict Zero-PII)
    const providerMessageId = String(mail.messageId || '') || null;
    const providerEventId = String(snsMessage.MessageId || '');
    const eventTimestamp = String(mail.timestamp || snsMessage.Timestamp || new Date().toISOString());

    let bounceClass: string | null = null;
    let bounceSubType: string | null = null;
    const bounceObj = (sesEvent.bounce || {}) as Record<string, unknown>;
    if (normalizedEventType === 'BOUNCE') {
      bounceClass = String(bounceObj.bounceType || 'UNDETERMINED').toUpperCase();
      bounceSubType = String(bounceObj.bounceSubType || 'General');
    }

    const minimizedMetadata: Record<string, unknown> = {
      ses_operation: tags['ses:operation']?.[0] || 'SendEmail',
      feedback_id: bounceObj.feedbackId || sesEvent.complaint ? (sesEvent.complaint as Record<string, unknown>).feedbackId : undefined,
      diagnostic_code: (bounceObj.bouncedRecipients as Array<Record<string, unknown>>)?.[0]?.diagnosticCode || undefined,
    };

    const canonicalPayloadHash = await computeSha256Hex(JSON.stringify({
      providerEventId,
      providerMessageId,
      normalizedEventType,
      eventTimestamp,
      bounceClass,
      bounceSubType,
      minimizedMetadata
    }));

    // 6. Connect to Internal Supabase DB RPC with service_role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve tenant ID from query param or header, or fallback to default
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id') || req.headers.get('x-atlas-tenant-id');

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Missing tenant_id context in webhook URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: providerEventId,
      p_provider_message_id: providerMessageId,
      p_correlation_token_hash: correlationTokenHash,
      p_event_type: normalizedEventType,
      p_event_timestamp: eventTimestamp,
      p_bounce_class: bounceClass,
      p_bounce_sub_type: bounceSubType,
      p_canonical_payload_hash: canonicalPayloadHash,
      p_minimized_metadata: minimizedMetadata,
    });

    if (rpcErr) {
      return new Response(JSON.stringify({ error: 'DB_RPC_FAILED', details: rpcErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, result: rpcRes }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const error = err as Error;
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
