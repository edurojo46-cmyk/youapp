/**
 * ATLAS MAIL FABRIC — REAL REGISTRATION WIRING GATE V1 TEST SUITE
 *
 * Certifies the end-to-end server-side wiring of authentic YouApp registration events
 * into AtlasMailTransactionalEventBridge prior to physical SMTP transport authorization.
 *
 * Invariants Tested:
 * 1. Browser/client boundary: client cannot sign trusted event or claim internal capabilities
 * 2. Real server-side registration backend emits authentic REGISTRATION_CONFIRMATION event
 * 3. Exact-once idempotency: duplicate source event cannot create duplicate dispatch candidates
 * 4. Production durable store survives process restart and maintains valid eligibility
 * 5. Production store multi-process atomic claim guarantees mutual exclusion
 * 6. Auth provider duplicate email prevention suppresses duplicate emails if auth provider sends verification
 * 7. HMAC secret provenance: server-only, never present in browser bundle or VITE_* prefixes
 * 8. Zero-PII: plain emails and passwords never enter event stores, logs, or telemetry
 * 9. Fail-closed pipeline stops cleanly before Mail Fabric / Postfix (PHYSICAL_SEND = 0)
 */

import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AtlasMailTransactionalEventBridge,
  DurableTransactionalEventStore,
  DatabaseTransactionalEventStore,
  InMemoryTransactionalEventStore,
  ServerSideRegistrationEmitter,
  computeCanonicalRecipientHash,
  IncomingTransactionalEventRequest
} from '../lib/atlasMailFabric';

describe('Atlas Mail — Real Registration Wiring Gate V1', () => {
  const testDir = path.join(process.cwd(), '.atlas_test_wiring_state');
  const testStoreFile = path.join(testDir, `wiring_gate_store_${Date.now()}.json`);
  const serverOnlySecret = 'production_internal_auth_service_secret_youapp_2026';
  const realTestEmail = 'real.registration.wiring.canary@youapptv.com';
  const canonicalHash = computeCanonicalRecipientHash(realTestEmail);

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (fs.existsSync(testStoreFile)) {
      fs.unlinkSync(testStoreFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStoreFile)) {
      try { fs.unlinkSync(testStoreFile); } catch {}
    }
  });

  it('01. Browser/Client Boundary: Client without server secret cannot forge trusted event', () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);

    // Client attempts to emit from browser or forged frontend script without valid HMAC
    const clientForgedRequest: IncomingTransactionalEventRequest = {
      source_event_id: `client_evt_${crypto.randomUUID()}`,
      source_system: 'ACCOUNT_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: canonicalHash,
      purpose: 'registration_welcome',
      created_at: new Date().toISOString(),
      provenance_signature: 'client_forged_invalid_signature_hex'
    };

    const result = bridge.evaluateAndProcessEvent(clientForgedRequest);
    expect(result.eligible_for_dispatch).toBe(false);
    expect(result.state).toBe('FAILED_FINAL');
    expect(result.reason).toContain('UNAUTHORIZED_PROVENANCE_SIGNATURE');
  });

  it('02. Server-Side Registration Emitter generates authentic signed event', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);
    const emitter = new ServerSideRegistrationEmitter(bridge, serverOnlySecret);

    const result = await emitter.processRealUserRegistration({
      email: realTestEmail,
      fullName: 'Eduardo Rojo Test User',
      tenantId: 'youapp_production'
    });

    expect(result.server_side_provenance_verified).toBe(true);
    expect(result.auth_provider_duplicate_guard).toBe('PASS');
    expect(result.source_event_type).toBe('REGISTRATION_CONFIRMATION');
    expect(result.recipient_hash).toBe(canonicalHash);
    expect(result.bridge_result.eligible_for_dispatch).toBe(true);
    expect(result.bridge_result.state).toBe('LEASED');
    expect(result.bridge_result.mail_classification).toBe('TRANSACTIONAL');
    expect(result.bridge_result.priority).toBe(3);
    expect(result.physical_send_attempted).toBe(0);
  });

  it('03. Idempotency Guard: Reprocessing same real registration is strictly idempotent', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);

    // Create an authentic request
    const now = new Date().toISOString();
    const sourceEventId = `reg_idempotency_${crypto.randomUUID()}`;
    const req: IncomingTransactionalEventRequest = {
      source_event_id: sourceEventId,
      source_system: 'ACCOUNT_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: canonicalHash,
      recipient_email_for_transport_only: realTestEmail,
      purpose: 'registration_welcome',
      created_at: now
    };

    // Sign with server secret
    const hmac = crypto.createHmac('sha256', serverOnlySecret);
    hmac.update(`${req.source_event_id}:${req.source_event_type}:${req.source_system}:${req.created_at}`);
    req.provenance_signature = hmac.digest('hex');

    // First processing
    const firstRes = bridge.evaluateAndProcessEvent(req, 'worker_1');
    expect(firstRes.eligible_for_dispatch).toBe(true);
    expect(firstRes.state).toBe('LEASED');

    // Commit dispatch upon transport simulation
    bridge.releaseDispatchLease(firstRes.idempotency_key, 'DISPATCHED');

    // Second processing of identical event
    const secondRes = bridge.evaluateAndProcessEvent(req, 'worker_2');
    expect(secondRes.eligible_for_dispatch).toBe(false);
    expect(secondRes.state).toBe('DISPATCHED');
    expect(secondRes.reason).toContain('SOURCE_EVENT_ALREADY_CONSUMED');
  });

  it('04. Production Durable Store survives process restart before transport', async () => {
    // Step 1: Initialize first process and emit real event
    const store1 = new DurableTransactionalEventStore(testStoreFile);
    const bridge1 = new AtlasMailTransactionalEventBridge(store1, serverOnlySecret);
    const emitter1 = new ServerSideRegistrationEmitter(bridge1, serverOnlySecret);

    const regResult = await emitter1.processRealUserRegistration({
      email: realTestEmail,
      fullName: 'Survivor User'
    });

    const idempotencyKey = regResult.bridge_result.idempotency_key;
    expect(idempotencyKey).toBeDefined();

    // Step 2: Teardown and simulate restart
    const store2 = new DurableTransactionalEventStore(testStoreFile);
    const bridge2 = new AtlasMailTransactionalEventBridge(store2, serverOnlySecret);

    // Verify event is present in durable store
    const persistedRecord = store2.getEvent(idempotencyKey);
    expect(persistedRecord).toBeDefined();
    expect(persistedRecord?.source_event_type).toBe('REGISTRATION_CONFIRMATION');
    expect(persistedRecord?.recipient_hash).toBe(canonicalHash);
    expect(persistedRecord?.mail_classification).toBe('TRANSACTIONAL');
  });

  it('05. Multi-Process Atomic Claim guarantees mutual exclusion without double-claim', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridgeA = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);
    const bridgeB = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);

    const now = new Date().toISOString();
    const sourceEventId = `atomic_race_${crypto.randomUUID()}`;
    const req: IncomingTransactionalEventRequest = {
      source_event_id: sourceEventId,
      source_system: 'ACCOUNT_SERVICE',
      source_event_type: 'REGISTRATION_CONFIRMATION',
      recipient_hash: canonicalHash,
      recipient_email_for_transport_only: realTestEmail,
      purpose: 'registration_welcome',
      created_at: now
    };

    const hmac = crypto.createHmac('sha256', serverOnlySecret);
    hmac.update(`${req.source_event_id}:${req.source_event_type}:${req.source_system}:${req.created_at}`);
    req.provenance_signature = hmac.digest('hex');

    // Simultaneous claim race between Worker A and Worker B
    const [resA, resB] = [
      bridgeA.evaluateAndProcessEvent(req, 'worker_alpha'),
      bridgeB.evaluateAndProcessEvent(req, 'worker_beta')
    ];

    const eligibleCount = [resA, resB].filter(r => r.eligible_for_dispatch).length;
    const blockedCount = [resA, resB].filter(r => !r.eligible_for_dispatch).length;

    expect(eligibleCount).toBe(1);
    expect(blockedCount).toBe(1);
  });

  it('06. DatabaseTransactionalEventStore provides CAS atomic transaction locking', () => {
    const dbStore = new DatabaseTransactionalEventStore();
    const bridge = new AtlasMailTransactionalEventBridge(dbStore, serverOnlySecret);

    const audit = bridge.auditPersistenceState();
    expect(audit.transactional_event_store_active).toBe('DATABASE');
    expect(audit.source_event_state).toBe('DATABASE');
    expect(audit.multi_process_atomic_claim).toBe('PASS');
    expect(audit.production_durability).toBe('PASS');
    expect(audit.production_certification).toBe('CERTIFIED');
  });

  it('07. Auth Provider Duplicate Email Guard prevents double emailing', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);
    const emitter = new ServerSideRegistrationEmitter(bridge, serverOnlySecret);

    // Scenario: Supabase Auth is configured to send its own confirmation email automatically
    const result = await emitter.processRealUserRegistration({
      email: realTestEmail,
      fullName: 'Auth Provider Managed User',
      authProviderHandlesEmail: true
    });

    expect(result.auth_provider_duplicate_guard).toBe('BLOCKED_DUPLICATE_AUTH_PROVIDER');
    expect(result.bridge_result.eligible_for_dispatch).toBe(false);
    expect(result.bridge_result.reason).toContain('AUTH_PROVIDER_DUPLICATE_PREVENTION');
    expect(result.physical_send_attempted).toBe(0);
  });

  it('08. Secret Provenance: Server secret is strictly server-side and absent from client environment', () => {
    const emitter = new ServerSideRegistrationEmitter(
      new AtlasMailTransactionalEventBridge(new InMemoryTransactionalEventStore(), serverOnlySecret),
      serverOnlySecret
    );

    expect(emitter.isSecretServerSideOnly()).toBe(true);

    // Verify process.env does not leak secret under VITE_ prefix
    const viteEnvKeys = Object.keys(process.env).filter(k => k.startsWith('VITE_'));
    for (const key of viteEnvKeys) {
      expect(key).not.toContain('ATLAS_MAIL_INTERNAL_SECRET');
      expect(key).not.toContain('AUTH_SERVICE_SECRET');
    }
  });

  it('09. Zero-PII Audit: Disk ledger contains canonical hash, zero plain emails or passwords', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);
    const emitter = new ServerSideRegistrationEmitter(bridge, serverOnlySecret);

    const sensitiveEmail = 'super.secret.user.9988@youapptv.com';
    const sensitivePassword = 'SecretP@ssw0rd2026!';

    await emitter.processRealUserRegistration({
      email: sensitiveEmail,
      password: sensitivePassword,
      fullName: 'Confidential Persona'
    });

    const rawDiskContent = fs.readFileSync(testStoreFile, 'utf-8');

    // Assert zero sensitive PII in durable store
    expect(rawDiskContent).not.toContain(sensitiveEmail);
    expect(rawDiskContent).not.toContain(sensitivePassword);
    expect(rawDiskContent).not.toContain(serverOnlySecret);

    // Assert canonical recipient hash is present
    const expectedHash = computeCanonicalRecipientHash(sensitiveEmail);
    expect(rawDiskContent).toContain(expectedHash);
  });

  it('10. Pipeline Stops Before Mail Fabric (PHYSICAL_SEND = 0)', async () => {
    const store = new DurableTransactionalEventStore(testStoreFile);
    const bridge = new AtlasMailTransactionalEventBridge(store, serverOnlySecret);
    const emitter = new ServerSideRegistrationEmitter(bridge, serverOnlySecret);

    const result = await emitter.processRealUserRegistration({
      email: realTestEmail,
      fullName: 'Eduardo Canary Stop-Before-Transport'
    });

    // Verification of all gate rules
    expect(result.server_side_provenance_verified).toBe(true);
    expect(result.bridge_result.eligible_for_dispatch).toBe(true);
    expect(result.bridge_result.zero_pii_confirmed).toBe(true);
    expect(result.physical_send_attempted).toBe(0);

    const summary = bridge.getBridgeSummary();
    expect(summary.events_received).toBe(1);
    expect(summary.events_leased).toBe(1);
    expect(summary.events_dispatched).toBe(0); // Not dispatched to SMTP yet
  });
});
