/**
 * ATLAS — CONSTITUTIONAL CERTIFICATION GATEWAY V1
 * Single Authoritative Chokepoint for Production Certification
 * 
 * Invariants:
 * 1. Single Gateway: NO product, entity, relation, or source can transition to CERTIFIED state
 *    without passing through this gateway and obtaining a valid constitutional decision.
 * 2. Fail-Closed: Any timeout, exception, unhandled error, or UNKNOWN state results in immediate BLOCKED.
 * 3. Database Defense in Depth: Every certified record MUST carry immutable constitutional authorization metadata:
 *    - constitution_decision_id (UUID referencing public.atlas_constitution_decisions)
 *    - constitution_version
 *    - qualification_timestamp
 *    - mission_fit_status
 *    - evidence_status
 * 4. Deterministic Fingerprint Binding: Decision is cryptographically bound to the object and evidence fields.
 * 5. Audit Ledger: Every decision is recorded without chain-of-thought in an append-only ledger.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { RoleEvidenceGate } from './RoleEvidenceGate.ts';
import { 
  AtlasConstitution,
  MissionFitGate,
  NoveltyFirewall,
  ConfidenceScaleGovernor,
  LearningScopeEngine,
  type MissionFitCandidate,
  type ConstitutionalLearnedRule,
  type ExecutionTier
} from './AtlasConstitution.ts';

export interface ConstitutionalAuthorizationMetadata {
  constitution_decision_id: string;
  constitution_version: string;
  qualification_timestamp: string;
  mission_fit_status: 'MISSION_QUALIFIED' | 'REJECTED_OFF_MISSION' | 'REJECTED_UNVERIFIABLE' | 'REJECTED_INSUFFICIENT_EVIDENCE' | 'REJECTED_UNKNOWN_STATE';
  evidence_status: 'VERIFIED_PHYSICAL' | 'DEFICIENT' | 'UNKNOWN';
}

export type CertificationClassification =
  | 'CONSTITUTIONALLY_CERTIFIED'
  | 'REJECTED_OFF_MISSION'
  | 'REJECTED_INSUFFICIENT_EVIDENCE'
  | 'REJECTED_INVALID_RELATION'
  | 'PENDING_VERIFICATION';

export interface ProductCertificationResult {
  certified: boolean;
  classification: CertificationClassification;
  decisionId: string;
  authorization?: ConstitutionalAuthorizationMetadata;
  objectFingerprint?: string;
  evidenceFingerprint?: string;
  fingerprintError?: boolean;
  latencyMs?: number;
  reason: string;
}

export interface ConstitutionalAuditRecord {
  DECISION_ID: string;
  MISSION_ID: string;
  OBJECT_ID: string;
  RULES_TRIGGERED: string[];
  MISSION_FIT: boolean | 'UNKNOWN';
  EVIDENCE_STATUS: 'VERIFIED_PHYSICAL' | 'DEFICIENT' | 'UNKNOWN';
  NOVELTY_STATUS: 'TRUE_NEW_SOURCE' | 'PREKNOWN_SOURCE' | 'VARIANT_OF_KNOWN_SOURCE' | 'UNKNOWN_NOVELTY' | 'NOT_APPLICABLE';
  FINAL_DECISION: 'CERTIFIED' | 'BLOCKED' | 'PREKNOWN_REGISTERED' | 'SCALE_PERMITTED' | 'SCALE_BLOCKED' | 'RULE_APPROVED' | 'RULE_REJECTED';
  TIMESTAMP: string;
  REASON: string;
}

export class ConstitutionalCertificationGateway {
  private static instance: ConstitutionalCertificationGateway;
  private constitution: AtlasConstitution;
  private ledgerPath: string;
  private memoryAuditLedger: ConstitutionalAuditRecord[] = [];

  private constructor() {
    this.constitution = AtlasConstitution.getInstance();
    this.ledgerPath = path.resolve('scratch/atlas_constitutional_audit_ledger.jsonl');
  }

  public static getInstance(): ConstitutionalCertificationGateway {
    if (!this.instance) {
      this.instance = new ConstitutionalCertificationGateway();
    }
    return this.instance;
  }

  /**
   * Deterministic Object Fingerprint calculation
   */
  public static computeObjectFingerprint(
    productId: string,
    name: string,
    category: string,
    company: string,
    relType: string,
    missionScope: string
  ): string {
    const payload = [
      (productId || '').trim(),
      (name || '').trim(),
      (category || '').trim(),
      (company || '').trim(),
      (relType || 'UNKNOWN').trim(),
      (missionScope || 'BUSCADOR_INDUSTRIAL').trim()
    ].join('|').toLowerCase();
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Deterministic Evidence Fingerprint calculation
   */
  public static computeEvidenceFingerprint(
    certId: string,
    sourceId: string,
    file: string
  ): string {
    const payload = [
      (certId || '').trim(),
      (sourceId || '').trim(),
      (file || '').trim()
    ].join('|').toLowerCase();
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Persists an audit ledger record atomically.
   */
  private recordAuditEntry(entry: ConstitutionalAuditRecord): void {
    this.memoryAuditLedger.push(entry);
    try {
      const line = JSON.stringify(entry) + '\n';
      const dir = path.dirname(this.ledgerPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.ledgerPath, line, 'utf8');
    } catch {
      // Fail-safe memory preservation if disk write is throttled
    }
  }

  /**
   * 1. PRODUCT / ENTITY / RELATION CERTIFICATION GATEWAY
   * Fail-Closed enforcement for database insertion.
   * Evaluates: DATA_TRUE, IDENTITY_VALID, MISSION_FIT, EVIDENCE_SUFFICIENT, OBJECT_FINGERPRINT, EVIDENCE_FINGERPRINT
   */
  public async certifyProductRelation(
    client: pg.Client | pg.PoolClient,
    candidate: {
      productId: string;
      tenantId?: string;
      name: string;
      category: string;
      description?: string;
      rawAttributes: Record<string, any>;
      missionScope: string; // e.g. 'BUSCADOR_INDUSTRIAL'
    },
    options: {
      shadowMode?: boolean; // if true, evaluates and authorizes without physical DB commit
      timeoutMs?: number;
      simulateEvaluationDelayMs?: number;
    } = {}
  ): Promise<ProductCertificationResult> {
    const startTime = Date.now();
    const decisionId = crypto.randomUUID();
    const timeoutMs = options.timeoutMs || 5000;
    const missionScope = (candidate.missionScope || 'BUSCADOR_INDUSTRIAL').trim();

    // FAIL-CLOSED WRAPPER
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('CONSTITUTION_TIMEOUT_EXCEEDED')), timeoutMs)
      );

      const evaluationPromise = (async (): Promise<ProductCertificationResult> => {
        if (options.simulateEvaluationDelayMs) {
          await new Promise(r => setTimeout(r, options.simulateEvaluationDelayMs));
        }

        // 1. GATE: IDENTITY_VALID
        const companyVal = (candidate.rawAttributes?.company_name !== undefined && candidate.rawAttributes?.company_name !== null)
          ? String(candidate.rawAttributes.company_name).trim()
          : (candidate.rawAttributes?.company_id !== undefined && candidate.rawAttributes?.company_id !== null)
            ? String(candidate.rawAttributes.company_id).trim()
            : '';

        const hasValidIdentity = Boolean(
          candidate.productId &&
          candidate.productId.trim().length > 0 &&
          candidate.name &&
          candidate.name.trim().length > 0 &&
          companyVal.length > 0 &&
          companyVal.toUpperCase() !== 'UNKNOWN'
        );

        if (!hasValidIdentity) {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'INVALID', 'INVALID', 'REJECTED_UNVERIFIABLE', 'DEFICIENT', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId || 'UNKNOWN_OBJECT',
              JSON.stringify(['IDENTITY_BEFORE_ATTRIBUTES', 'UNKNOWN_IS_NOT_TRUE'])
            ]);
          }

          return {
            certified: false,
            classification: 'REJECTED_INVALID_RELATION',
            decisionId,
            reason: 'IDENTITY_INVALID: Candidate missing valid product_id, name, or company anchor.'
          };
        }

        // 2. GATE: EVIDENCE_SUFFICIENT
        const certIdVal = candidate.rawAttributes?.evidence?.certificate_id
          ? String(candidate.rawAttributes.evidence.certificate_id).trim()
          : '';
        const evidenceSufficient = certIdVal.length > 0;

        if (!evidenceSufficient) {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'DEFICIENT', 'DEFICIENT', 'REJECTED_INSUFFICIENT_EVIDENCE', 'DEFICIENT', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId,
              JSON.stringify(['NO_CERTIFICATION_WITHOUT_EVIDENCE'])
            ]);
          }

          return {
            certified: false,
            classification: 'REJECTED_INSUFFICIENT_EVIDENCE',
            decisionId,
            reason: 'EVIDENCE_INSUFFICIENT: Missing non-null physical proof (certificate_id).'
          };
        }

        // 3. GATE: DATA_TRUE
        const hasAuthenticProvenance = Boolean(
          evidenceSufficient && (
            candidate.rawAttributes?.evidence?.url ||
            candidate.rawAttributes?.evidence?.file ||
            candidate.rawAttributes?.evidence?.official_registry ||
            candidate.rawAttributes?.evidence?.matched_text ||
            candidate.rawAttributes?.evidence?.expediente ||
            candidate.rawAttributes?.evidence?.issue_date
          )
        );

        if (!hasAuthenticProvenance) {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'DEFICIENT', 'DEFICIENT', 'REJECTED_UNVERIFIABLE', 'DEFICIENT', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId,
              JSON.stringify(['EVIDENCE_OVER_CONFIDENCE', 'UNKNOWN_IS_NOT_TRUE'])
            ]);
          }

          return {
            certified: false,
            classification: 'REJECTED_INSUFFICIENT_EVIDENCE',
            decisionId,
            reason: 'DATA_UNVERIFIABLE: Factual truth and authentic provenance could not be established.'
          };
        }

        // 4. GATE: MISSION_FIT (Without source-based auto-approval)
        const textToEvaluate = `${candidate.category || ''} ${candidate.name || ''}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const isArtisticOrIntellectual = /(obra publicada|fonograma|musica|literaria|audiovisual|derecho de autor|cancion|album|novela|cuento|poesia|editorial|libro|partitura|disco musical)/i.test(textToEvaluate);
        const isIndustrial = /(autoparte|mecanica|quimica|seguridad|maquinaria|metalurgica|alimento|industrial|producto|farmacia|farmaceutic|medicamento|salud|botica|dispensacion|veterinari|zooterap|bulon|tornillo|tuerca|fijacion|arandela|esparrago|hotel|insumo|periodis|prensa|mueble|madera|amortiguador|freno|direccion|rotula|suspension|neumatico|cubierta|llanta|rueda|bateria|acumulador|lampara|faro|iluminacion|optica|espejo|retrovisor|vidrio|parabrisas|limpiaparabrisas|remolque|semiremolque|acoplado|enganche|eje|traba|contenedor|chasis|caja de direccion|cremallera|cilindro|caliper|disco de freno|pastilla|cinta de freno|baliza|cinturon|bocina|matafuego|casco|valvula|engranaje|transmision|motor|radiador|bomba|sin tacc|gluten|rnpa|repuesto|accesorio automotor)/i.test(textToEvaluate) ||
          /(farmacia|farmaceutic|medicamento|salud|botica|veterinari|bulon)/i.test(candidate.rawAttributes?.rubros || '') ||
          Boolean(candidate.rawAttributes?.relationship_type) ||
          Boolean(candidate.rawAttributes?.role);

        if (isArtisticOrIntellectual && !isIndustrial) {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'OFF_MISSION', 'OFF_MISSION', 'REJECTED_OFF_MISSION', 'VERIFIED_PHYSICAL', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId,
              JSON.stringify(['TRUTH_DOES_NOT_EQUAL_MISSION_FIT', 'OBJECTIVE_OVER_VOLUME'])
            ]);
          }

          return {
            certified: false,
            classification: 'REJECTED_OFF_MISSION',
            decisionId,
            reason: 'OFF_MISSION: Record falls outside Buscador Industrial charter (artistic/intellectual).'
          };
        }

        if (!isIndustrial) {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'UNKNOWN', 'UNKNOWN', 'REJECTED_UNKNOWN_STATE', 'UNKNOWN', 'NOT_APPLICABLE', 'PENDING', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId,
              JSON.stringify(['UNKNOWN_IS_NOT_TRUE'])
            ]);
          }

          return {
            certified: false,
            classification: 'PENDING_VERIFICATION',
            decisionId,
            reason: 'PENDING_VERIFICATION: Industrial domain semantics cannot be verified unambiguously without further evidence.'
          };
        }

        // 4b. GATE: ROLE_EVIDENCE_GATE (Enforces strict role semantics: MANUFACTURER, JOURNALIST, SUPPLIER, etc.)
        const roleGate = RoleEvidenceGate.getInstance();
        const roleEvaluation = roleGate.evaluate({
          requested_role: candidate.rawAttributes?.relationship_type || candidate.rawAttributes?.role || 'GENERAL_ENTITY',
          target_sector: candidate.rawAttributes?.target_sector || candidate.category,
          entity_type: candidate.rawAttributes?.entity_type || (candidate.rawAttributes?.is_person ? 'PERSON' : 'COMPANY'),
          entity_name: candidate.rawAttributes?.company_name || candidate.name,
          source: candidate.rawAttributes?.source_id || candidate.rawAttributes?.evidence?.official_registry || missionScope,
          evidence: candidate.rawAttributes?.evidence || {},
          category: candidate.category,
          rubros: candidate.rawAttributes?.rubros || candidate.category,
          description: candidate.description,
          structured_attributes: candidate.rawAttributes?.structured_attributes,
          contact_requirements: candidate.rawAttributes?.contact_requirements
        });

        if (roleEvaluation.decision !== 'PASS') {
          if (!options.shadowMode) {
            await client.query(`
              INSERT INTO public.atlas_constitution_decisions (
                decision_id, constitution_version, mission_id, mission_scope,
                object_type, object_id, object_fingerprint, evidence_fingerprint,
                mission_fit_status, evidence_status, novelty_status, final_decision,
                rules_triggered, created_at
              ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, 'DEFICIENT', 'DEFICIENT', 'REJECTED_OFF_MISSION', 'DEFICIENT', 'NOT_APPLICABLE', 'REJECT', $4, NOW());
            `, [
              decisionId,
              missionScope,
              candidate.productId,
              JSON.stringify(['ROLE_EVIDENCE_GATE_REJECTED', roleEvaluation.reason, roleEvaluation.evidence_level])
            ]);
          }

          return {
            certified: false,
            classification: 'REJECTED_INVALID_RELATION',
            decisionId,
            reason: `ROLE_EVIDENCE_REJECTED: ${roleEvaluation.reason} (Evidence Level: ${roleEvaluation.evidence_level})`
          };
        }

        // 5. GATES: OBJECT_FINGERPRINT & EVIDENCE_FINGERPRINT
        const sourceIdVal = (candidate.rawAttributes?.source_id !== undefined && candidate.rawAttributes?.source_id !== null)
          ? String(candidate.rawAttributes.source_id).trim()
          : (candidate.rawAttributes?.evidence?.source_id !== undefined && candidate.rawAttributes?.evidence?.source_id !== null)
            ? String(candidate.rawAttributes.evidence.source_id).trim()
            : '';
        const fileVal = candidate.rawAttributes?.evidence?.file ? String(candidate.rawAttributes.evidence.file).trim() : '';
        const relTypeVal = candidate.rawAttributes?.relationship_type ? String(candidate.rawAttributes.relationship_type).trim() : 'UNKNOWN';

        const objectFingerprint = ConstitutionalCertificationGateway.computeObjectFingerprint(
          candidate.productId,
          candidate.name,
          candidate.category,
          companyVal,
          relTypeVal,
          missionScope
        );

        const evidenceFingerprint = ConstitutionalCertificationGateway.computeEvidenceFingerprint(
          certIdVal,
          sourceIdVal,
          fileVal
        );

        const fpRegex = /^[a-f0-9]{64}$/;
        if (!fpRegex.test(objectFingerprint) || !fpRegex.test(evidenceFingerprint)) {
          return {
            certified: false,
            classification: 'PENDING_VERIFICATION',
            decisionId,
            fingerprintError: true,
            reason: 'FINGERPRINT_ERROR: Failed to compute deterministic SHA-256 fingerprints.'
          };
        }

        // ALL 6 GATES PASSED -> CONSTITUTIONALLY_CERTIFIED
        // 1. Record authentic decision in public.atlas_constitution_decisions
        if (!options.shadowMode) {
          await client.query(`
            INSERT INTO public.atlas_constitution_decisions (
              decision_id, constitution_version, mission_id, mission_scope,
              object_type, object_id, object_fingerprint, evidence_fingerprint,
              mission_fit_status, evidence_status, novelty_status, final_decision,
              rules_triggered, created_at
            ) VALUES ($1, '1.0', $2, $2, 'PRODUCT_RELATION', $3, $4, $5, 'MISSION_QUALIFIED', 'VERIFIED_PHYSICAL', 'NOT_APPLICABLE', 'CERTIFY', $6, NOW());
          `, [
            decisionId,
            missionScope,
            candidate.productId,
            objectFingerprint,
            evidenceFingerprint,
            JSON.stringify(['NO_CERTIFICATION_WITHOUT_EVIDENCE', 'IDENTITY_BEFORE_ATTRIBUTES'])
          ]);
        }

        const authorization: ConstitutionalAuthorizationMetadata = {
          constitution_decision_id: decisionId,
          constitution_version: '1.0',
          qualification_timestamp: new Date().toISOString(),
          mission_fit_status: 'MISSION_QUALIFIED',
          evidence_status: 'VERIFIED_PHYSICAL'
        };

        // 2. Physical database certification update (subject to database trigger enforcement)
        if (!options.shadowMode) {
          const authPayload = {
            ...authorization,
            mission_scope: missionScope,
            object_fingerprint: objectFingerprint,
            evidence_fingerprint: evidenceFingerprint
          };

          await client.query(`
            UPDATE public.atlas_products
            SET 
              attributes_json = jsonb_set(
                attributes_json,
                '{constitutional_authorization}',
                $1::jsonb
              ),
              updated_at = NOW()
            WHERE product_id = $2;
          `, [
            JSON.stringify(authPayload),
            candidate.productId
          ]);
        }

        return {
          certified: true,
          classification: 'CONSTITUTIONALLY_CERTIFIED',
          decisionId,
          authorization,
          objectFingerprint,
          evidenceFingerprint,
          reason: 'Passed: DATA_TRUE=true + IDENTITY_VALID=true + MISSION_FIT=true + EVIDENCE_SUFFICIENT=true + FINGERPRINTS_VERIFIED=true.'
        };
      })();

      const evalResult = await Promise.race([evaluationPromise, timeoutPromise]);
      const latencyMs = Date.now() - startTime;
      evalResult.latencyMs = latencyMs;

      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: missionScope,
        OBJECT_ID: candidate.productId,
        RULES_TRIGGERED: evalResult.certified ? ['NO_CERTIFICATION_WITHOUT_EVIDENCE', 'IDENTITY_BEFORE_ATTRIBUTES'] : ['UNKNOWN_IS_NOT_TRUE'],
        MISSION_FIT: evalResult.certified,
        EVIDENCE_STATUS: evalResult.certified ? 'VERIFIED_PHYSICAL' : 'DEFICIENT',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: evalResult.certified ? 'CERTIFIED' : 'BLOCKED',
        TIMESTAMP: new Date().toISOString(),
        REASON: evalResult.reason
      });

      return evalResult;

    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const failReason = `CONSTITUTIONAL_FAIL_CLOSED [ERROR_INTERCEPTED]: ${err.message || 'Unknown constitutional evaluation failure'}`;
      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: missionScope,
        OBJECT_ID: candidate.productId,
        RULES_TRIGGERED: ['UNKNOWN_IS_NOT_TRUE', 'REVERSIBILITY_BY_DEFAULT'],
        MISSION_FIT: 'UNKNOWN',
        EVIDENCE_STATUS: 'UNKNOWN',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: 'BLOCKED',
        TIMESTAMP: new Date().toISOString(),
        REASON: failReason
      });

      return {
        certified: false,
        classification: 'PENDING_VERIFICATION',
        decisionId,
        latencyMs,
        reason: failReason
      };
    }
  }

  /**
   * 2. SOURCE NOVELTY & REGISTRATION GATEWAY
   * Governs whether a discovered source can be labeled TRUE_NEW_SOURCE or registered.
   */
  public async evaluateAndCertifySource(
    client: pg.Client | pg.PoolClient | null,
    candidate: {
      sourceId: string;
      url?: string;
      localFile?: string;
      resourceId?: string;
      family?: string;
      missionContext: string;
    }
  ): Promise<{
    canRegisterAsTrueNew: boolean;
    noveltyStatus: 'TRUE_NEW_SOURCE' | 'PREKNOWN_SOURCE' | 'VARIANT_OF_KNOWN_SOURCE' | 'UNKNOWN_NOVELTY';
    decisionId: string;
    authorization?: {
      constitution_decision_id: string;
      novelty_status: string;
      timestamp: string;
    };
    reason: string;
  }> {
    const decisionId = crypto.randomUUID();

    try {
      const firewall = NoveltyFirewall.getInstance();
      const evalResult = firewall.evaluateNovelty(candidate);

      const canRegisterAsTrueNew = evalResult.classification === 'TRUE_NEW_SOURCE';

      const objFp = crypto.createHash('sha256').update(candidate.sourceId.toLowerCase()).digest('hex');
      const evFp = crypto.createHash('sha256').update((candidate.localFile || candidate.url || '').toLowerCase()).digest('hex');

      if (client) {
        await client.query(`
          INSERT INTO public.atlas_constitution_decisions (
            decision_id, constitution_version, mission_id, mission_scope,
            object_type, object_id, object_fingerprint, evidence_fingerprint,
            mission_fit_status, evidence_status, novelty_status, final_decision,
            rules_triggered
          ) VALUES ($1, '1.0', $2, $2, 'SOURCE_REGISTRY', $3, $4, $5, 'MISSION_QUALIFIED', 'VERIFIED_PHYSICAL', $6, 'CERTIFY', $7);
        `, [
          decisionId,
          candidate.missionContext,
          candidate.sourceId,
          objFp,
          evFp,
          evalResult.classification,
          JSON.stringify(['SOURCE_NEW_TO_RUN_IS_NOT_NEW_TO_ATLAS', 'UNKNOWN_IS_NOT_TRUE'])
        ]);
      }

      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: candidate.missionContext,
        OBJECT_ID: candidate.sourceId,
        RULES_TRIGGERED: ['SOURCE_NEW_TO_RUN_IS_NOT_NEW_TO_ATLAS', 'UNKNOWN_IS_NOT_TRUE'],
        MISSION_FIT: true,
        EVIDENCE_STATUS: 'VERIFIED_PHYSICAL',
        NOVELTY_STATUS: evalResult.classification,
        FINAL_DECISION: canRegisterAsTrueNew ? 'CERTIFIED' : 'PREKNOWN_REGISTERED',
        TIMESTAMP: new Date().toISOString(),
        REASON: evalResult.matchedEvidence || `Novelty verified as ${evalResult.classification}`
      });

      return {
        canRegisterAsTrueNew,
        noveltyStatus: evalResult.classification,
        decisionId,
        authorization: {
          constitution_decision_id: decisionId,
          novelty_status: evalResult.classification,
          timestamp: new Date().toISOString()
        },
        reason: evalResult.matchedEvidence || `Source classified as ${evalResult.classification}`
      };
    } catch (err: any) {
      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: candidate.missionContext,
        OBJECT_ID: candidate.sourceId,
        RULES_TRIGGERED: ['UNKNOWN_IS_NOT_TRUE'],
        MISSION_FIT: 'UNKNOWN',
        EVIDENCE_STATUS: 'UNKNOWN',
        NOVELTY_STATUS: 'UNKNOWN_NOVELTY',
        FINAL_DECISION: 'BLOCKED',
        TIMESTAMP: new Date().toISOString(),
        REASON: `FAIL_CLOSED: ${err.message}`
      });

      return {
        canRegisterAsTrueNew: false,
        noveltyStatus: 'UNKNOWN_NOVELTY',
        decisionId,
        reason: `FAIL_CLOSED: ${err.message}`
      };
    }
  }

  /**
   * 3. SCALE AUTHORIZATION GATEWAY
   * Prevents premature mass execution.
   */
  public authorizeScaleTier(
    currentTier: ExecutionTier,
    requestedTier: ExecutionTier,
    confidence: number,
    hasCanaryPassed: boolean
  ): {
    allowed: boolean;
    authorizedTier: ExecutionTier;
    decisionId: string;
    reason: string;
  } {
    const decisionId = crypto.randomUUID();

    try {
      ConfidenceScaleGovernor.validateTierTransition(currentTier, requestedTier, hasCanaryPassed);
      const auth = ConfidenceScaleGovernor.authorizeExecutionTier(confidence, hasCanaryPassed);

      const allowed = auth.allowed && auth.authorizedTier === requestedTier;

      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: 'SCALE_GOVERNANCE',
        OBJECT_ID: `${currentTier}_TO_${requestedTier}`,
        RULES_TRIGGERED: ['NO_SCALE_BEFORE_CANARY', 'EVIDENCE_OVER_CONFIDENCE'],
        MISSION_FIT: true,
        EVIDENCE_STATUS: hasCanaryPassed ? 'VERIFIED_PHYSICAL' : 'DEFICIENT',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: allowed ? 'SCALE_PERMITTED' : 'SCALE_BLOCKED',
        TIMESTAMP: new Date().toISOString(),
        REASON: auth.explanation
      });

      return {
        allowed,
        authorizedTier: auth.authorizedTier,
        decisionId,
        reason: auth.explanation
      };
    } catch (err: any) {
      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: 'SCALE_GOVERNANCE',
        OBJECT_ID: `${currentTier}_TO_${requestedTier}`,
        RULES_TRIGGERED: ['NO_SCALE_BEFORE_CANARY'],
        MISSION_FIT: false,
        EVIDENCE_STATUS: 'DEFICIENT',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: 'SCALE_BLOCKED',
        TIMESTAMP: new Date().toISOString(),
        REASON: err.message
      });

      return {
        allowed: false,
        authorizedTier: 'TINY_PROBE',
        decisionId,
        reason: err.message
      };
    }
  }

  /**
   * 4. LEARNED RULE AUTHORIZATION GATEWAY
   * Blocks learned rules from overriding constitutional invariants.
   */
  public authorizeLearnedRule(rule: ConstitutionalLearnedRule): {
    allowed: boolean;
    decisionId: string;
    reason: string;
  } {
    const decisionId = crypto.randomUUID();

    try {
      const scopeEngine = LearningScopeEngine.getInstance();
      scopeEngine.registerLearnedRule(rule);

      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: 'META_RULE_GOVERNANCE',
        OBJECT_ID: rule.ruleId,
        RULES_TRIGGERED: ['UNKNOWN_IS_NOT_TRUE', 'FACT_INFERENCE_HYPOTHESIS_SEPARATION'],
        MISSION_FIT: true,
        EVIDENCE_STATUS: 'VERIFIED_PHYSICAL',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: 'RULE_APPROVED',
        TIMESTAMP: new Date().toISOString(),
        REASON: 'Rule registered within authorized scope and compliant with constitutional invariants.'
      });

      return {
        allowed: true,
        decisionId,
        reason: 'Rule registration permitted.'
      };
    } catch (err: any) {
      this.recordAuditEntry({
        DECISION_ID: decisionId,
        MISSION_ID: 'META_RULE_GOVERNANCE',
        OBJECT_ID: rule.ruleId,
        RULES_TRIGGERED: ['UNKNOWN_IS_NOT_TRUE'],
        MISSION_FIT: false,
        EVIDENCE_STATUS: 'DEFICIENT',
        NOVELTY_STATUS: 'NOT_APPLICABLE',
        FINAL_DECISION: 'RULE_REJECTED',
        TIMESTAMP: new Date().toISOString(),
        REASON: err.message
      });

      return {
        allowed: false,
        decisionId,
        reason: err.message
      };
    }
  }

  /**
   * 5. DATABASE DEFENSE IN DEPTH INTERCEPTOR
   * Intercepts unauthenticated raw writes attempting to enter CERTIFIED/ACTIVE status.
   */
  public validateCertifiedWritePayload(record: {
    status: string;
    attributes_json?: any;
  }): { valid: boolean; reason?: string } {
    if (record.status !== 'ACTIVE' && record.status !== 'CERTIFIED') {
      // Non-certified statuses (RAW, CANDIDATE, REJECTED) do not require constitutional authorization
      return { valid: true };
    }

    const auth = record.attributes_json?.constitutional_authorization;
    if (!auth || !auth.constitution_decision_id || !auth.qualification_timestamp) {
      return {
        valid: false,
        reason: 'CONSTITUTIONAL_DEFENSE_IN_DEPTH: Direct write to certified/active status prohibited without valid constitutional_authorization.'
      };
    }

    if (auth.mission_fit_status !== 'MISSION_QUALIFIED' || auth.evidence_status !== 'VERIFIED_PHYSICAL') {
      return {
        valid: false,
        reason: `CONSTITUTIONAL_DEFENSE_IN_DEPTH: Record has invalid authorization state (mission_fit=${auth.mission_fit_status}, evidence=${auth.evidence_status}).`
      };
    }

    return { valid: true };
  }

  /**
   * Retrieves the active in-memory audit ledger.
   */
  public getAuditLedger(): readonly ConstitutionalAuditRecord[] {
    return this.memoryAuditLedger;
  }
}
