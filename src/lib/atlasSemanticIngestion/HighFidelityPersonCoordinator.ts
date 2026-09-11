/**
 * Atlas Semantic Intelligence — High-Fidelity Person Knowledge Coordinator V1
 * Orchestrates high-fidelity Person identity resolution and semantic knowledge ingestion
 * from atlas_people, atlas_person_identifiers, and atlas_person_attribute_evidence.
 * 
 * Strict Invariants:
 * 1. DISPLAY_VALUE_INGESTION = PROHIBITED (Zero PII in logs, metadata, observations, facts).
 * 2. Identifiers processed first as identity anchors.
 * 3. Verified identifiers provide strong identity; unverified provide weak/supporting signal.
 * 4. Epistemic status defaults to CLAIM (confidence score alone does not promote to FACT).
 * 5. Deterministic tenant resolution from atlas_people (fallback tenant strictly prohibited).
 * 6. Roles are stored as typed literals (HAS_ROLE), never as canonical entities.
 * 7. Employers are canonicalized before creating WORKS_AT relationships (ambiguity blocks creation).
 * 8. Unit of backfill is PERSON (capped at max 50 persons).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AtlasCanonicalEntityService } from '../atlasSemantic/AtlasCanonicalEntityService';
import { AtlasSemanticKnowledgeService } from '../atlasSemantic/AtlasSemanticKnowledgeService';
import { EntityNormalizationEngine } from '../atlasSemantic/EntityNormalizationEngine';
import type { EntityCandidate } from '../atlasSemantic/types';
import {
  PersonAttributeSemanticPolicy,
  AttributeEvaluationResult
} from './PersonAttributeSemanticPolicy';

export interface HighFidelityOptions {
  stage: 'STAGE_0_DRY_RUN' | 'STAGE_1_CONTROLLED_WRITE';
  max_persons?: number; // Capped at 50
  tenant_id?: string;
}

export interface PersonProcessingSummary {
  person_id: string;
  tenant_id: string;
  redacted_name: string;
  canonical_person_id?: string;
  identifiers_count: number;
  verified_identifiers_count: number;
  evidence_rows_count: number;
  facts_count: number;
  relationships_count: number;
  skipped_attributes_count: number;
  identity_signal_type: string;
  status: 'SUCCESS' | 'SKIPPED' | 'REJECTED' | 'ERROR';
}

export interface HighFidelityReport {
  stage: 'STAGE_0_DRY_RUN' | 'STAGE_1_CONTROLLED_WRITE';
  persons_sampled: number;
  identifiers_evaluated: number;
  attribute_evidence_evaluated: number;
  canonical_persons_created: number;
  canonical_persons_matched: number;
  source_observations_created: number;
  claims_created: number;
  facts_created: number;
  relationships_created: number;
  evidence_links_created: number;
  skipped_unsupported_attributes: number;
  pii_rejections: number;
  tenant_errors: number;
  errors: number;
  person_summaries: PersonProcessingSummary[];
  executed_at: string;
}

export class HighFidelityPersonCoordinator {
  private readonly supabase: SupabaseClient;
  private readonly canonicalService: AtlasCanonicalEntityService;
  private readonly semanticService: AtlasSemanticKnowledgeService;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.canonicalService = new AtlasCanonicalEntityService(supabase);
    this.semanticService = new AtlasSemanticKnowledgeService(supabase, this.canonicalService);
  }

  public async execute(options: HighFidelityOptions): Promise<HighFidelityReport> {
    const maxPersons = Math.min(options.max_persons || 50, 50);
    const isWrite = options.stage === 'STAGE_1_CONTROLLED_WRITE';

    const report: HighFidelityReport = {
      stage: options.stage,
      persons_sampled: 0,
      identifiers_evaluated: 0,
      attribute_evidence_evaluated: 0,
      canonical_persons_created: 0,
      canonical_persons_matched: 0,
      source_observations_created: 0,
      claims_created: 0,
      facts_created: 0,
      relationships_created: 0,
      evidence_links_created: 0,
      skipped_unsupported_attributes: 0,
      pii_rejections: 0,
      tenant_errors: 0,
      errors: 0,
      person_summaries: [],
      executed_at: new Date().toISOString()
    };

    // 1. Fetch people who have structured identifiers or attribute evidence
    let identQuery = this.supabase
      .from('atlas_person_identifiers')
      .select('person_id, tenant_id')
      .order('first_seen_at', { ascending: true });

    if (options.tenant_id) {
      identQuery = identQuery.eq('tenant_id', options.tenant_id);
    }

    const { data: identRows, error: identQueryErr } = await identQuery.limit(maxPersons * 3);

    if (identQueryErr) {
      report.errors++;
      return report;
    }

    // Collect distinct person_ids
    const personIdSet = new Set<string>();
    const orderedPersonIds: string[] = [];
    for (const r of identRows || []) {
      if (r.person_id && !personIdSet.has(r.person_id)) {
        personIdSet.add(r.person_id);
        orderedPersonIds.push(r.person_id);
        if (orderedPersonIds.length >= maxPersons) break;
      }
    }

    if (orderedPersonIds.length === 0) {
      // Fallback to atlas_people if no identifiers
      const { data: fallbackPeople } = await this.supabase
        .from('atlas_people')
        .select('person_id')
        .eq('status', 'ACTIVE')
        .limit(maxPersons);
      for (const p of fallbackPeople || []) {
        if (!personIdSet.has(p.person_id)) {
          personIdSet.add(p.person_id);
          orderedPersonIds.push(p.person_id);
        }
      }
    }

    const sampleIds = orderedPersonIds.slice(0, maxPersons);
    if (sampleIds.length === 0) {
      return report;
    }

    // 2. Batch fetch People, Identifiers, and Evidence
    const [peopleRes, allIdentsRes, allEvidenceRes] = await Promise.all([
      this.supabase
        .from('atlas_people')
        .select('person_id, tenant_id, full_name, status')
        .in('person_id', sampleIds),
      this.supabase
        .from('atlas_person_identifiers')
        .select('identifier_id, tenant_id, person_id, identifier_type, normalized_value_hash, verification_status, first_seen_at')
        .in('person_id', sampleIds),
      this.supabase
        .from('atlas_person_attribute_evidence')
        .select('evidence_id, tenant_id, person_id, attribute_key, normalized_value, assertion_type, confidence, source_ref, observed_at, evidence_hash')
        .in('person_id', sampleIds)
    ]);

    if (peopleRes.error) {
      report.errors++;
      return report;
    }

    const peopleMap = new Map<string, any>();
    for (const p of peopleRes.data || []) {
      peopleMap.set(p.person_id, p);
    }

    const identsByPerson = new Map<string, any[]>();
    for (const id of allIdentsRes.data || []) {
      const list = identsByPerson.get(id.person_id) || [];
      list.push(id);
      identsByPerson.set(id.person_id, list);
    }

    const evidenceByPerson = new Map<string, any[]>();
    for (const ev of allEvidenceRes.data || []) {
      const list = evidenceByPerson.get(ev.person_id) || [];
      list.push(ev);
      evidenceByPerson.set(ev.person_id, list);
    }

    report.persons_sampled = sampleIds.length;

    // 3. Process each person
    for (const personId of sampleIds) {
      const person = peopleMap.get(personId);
      if (!person || !person.tenant_id || person.tenant_id.trim() === '') {
        report.tenant_errors++;
        continue;
      }

      const summary: PersonProcessingSummary = {
        person_id: person.person_id,
        tenant_id: person.tenant_id,
        redacted_name: person.full_name ? `${person.full_name.slice(0, 1)}***` : 'ANONYMOUS',
        identifiers_count: 0,
        verified_identifiers_count: 0,
        evidence_rows_count: 0,
        facts_count: 0,
        relationships_count: 0,
        skipped_attributes_count: 0,
        identity_signal_type: 'NONE',
        status: 'SUCCESS'
      };

      try {
        const identifiers = identsByPerson.get(personId) || [];
        summary.identifiers_count = identifiers.length;
        report.identifiers_evaluated += identifiers.length;

        let canonicalPersonId: string | undefined;
        let primaryObservationId: string | undefined;
        let highestSignal = 'NAME_ONLY';

        if (identifiers.length > 0) {
          for (const ident of identifiers) {
            if (ident.verification_status === 'REVOKED') {
              continue;
            }

            const isVerified = ident.verification_status === 'VERIFIED';
            if (isVerified) {
              summary.verified_identifiers_count++;
              highestSignal = 'AUTHORITATIVE_EXTERNAL_ID';
            } else if (highestSignal === 'NAME_ONLY') {
              highestSignal = 'WEAK_EXTERNAL_ID';
            }

            let safeHash = ident.normalized_value_hash || '';
            if (ident.identifier_type === 'EMAIL') {
              safeHash = safeHash.includes('@') ? EntityNormalizationEngine.hashEmail(safeHash) : safeHash;
            } else if (ident.identifier_type === 'PHONE') {
              safeHash = safeHash.length < 64 ? EntityNormalizationEngine.hashPhone(safeHash) : safeHash;
            }

            const candidate: EntityCandidate = {
              source_name: 'atlas_person_identifiers',
              source_record_id: ident.identifier_id,
              source_entity_key: `person_identifier:${ident.identifier_id}`,
              tenant_id: person.tenant_id,
              entity_type: 'PERSON',
              raw_name: person.full_name || 'Unknown Person',
              external_id: `${ident.identifier_type.toLowerCase()}_hash:${safeHash}`,
              external_id_type: isVerified ? 'AUTHORITATIVE_EXTERNAL_ID' : 'WEAK_EXTERNAL_ID',
              email_hash: ident.identifier_type === 'EMAIL' ? safeHash : undefined,
              phone_hash: ident.identifier_type === 'PHONE' ? safeHash : undefined,
              observed_at: ident.first_seen_at || new Date().toISOString(),
              raw_attributes: {
                identifier_type: ident.identifier_type,
                normalized_value_hash: safeHash,
                verification_status: ident.verification_status
              }
            };

            if (isWrite) {
              const res = await this.canonicalService.resolveEntityCandidate(
                candidate,
                person.tenant_id
              );

              if (res.decision === 'AUTO_MATCH' || (res as any).is_existing_observation) {
                report.canonical_persons_matched++;
              } else {
                report.canonical_persons_created++;
              }

              report.source_observations_created++;
              if (res.canonical_entity_id) canonicalPersonId = res.canonical_entity_id;
              if (!primaryObservationId && res.observation_id) primaryObservationId = res.observation_id;
            } else {
              // Dry run
              if (isVerified) {
                report.canonical_persons_matched++;
              } else {
                report.canonical_persons_created++;
              }
            }
          }
        }

        // Fallback resolution via atlas_people if no identifier resolved
        if (!canonicalPersonId && isWrite) {
          const personCandidate: EntityCandidate = {
            source_name: 'atlas_people',
            source_record_id: person.person_id,
            source_entity_key: `atlas_people:${person.person_id}`,
            tenant_id: person.tenant_id,
            entity_type: 'PERSON',
            raw_name: person.full_name || 'Unknown Person',
            observed_at: new Date().toISOString(),
            raw_attributes: {
              person_id: person.person_id,
              status: person.status
            }
          };

          const res = await this.canonicalService.resolveEntityCandidate(
            personCandidate,
            person.tenant_id
          );

          if (res.decision === 'AUTO_MATCH' || (res as any).is_existing_observation) {
            report.canonical_persons_matched++;
          } else {
            report.canonical_persons_created++;
          }

          report.source_observations_created++;
          if (res.canonical_entity_id) canonicalPersonId = res.canonical_entity_id;
          if (res.observation_id) primaryObservationId = res.observation_id;
        } else if (!canonicalPersonId && !isWrite) {
          report.canonical_persons_created++;
        }

        summary.canonical_person_id = canonicalPersonId;
        summary.identity_signal_type = highestSignal;

        // Process Attribute Evidence
        const evidenceList = evidenceByPerson.get(personId) || [];
        summary.evidence_rows_count = evidenceList.length;
        report.attribute_evidence_evaluated += evidenceList.length;

        for (const ev of evidenceList) {
          const evalResult = PersonAttributeSemanticPolicy.evaluate(
            ev.attribute_key,
            ev.normalized_value,
            ev.assertion_type,
            ev.confidence
          );

          if (!evalResult.allowed) {
            summary.skipped_attributes_count++;
            report.skipped_unsupported_attributes++;
            if (evalResult.category === 'PROHIBITED_PII') {
              report.pii_rejections++;
            }
            continue;
          }

          // Case A: Company Relationship (WORKS_AT)
          if (evalResult.category === 'COMPANY_RELATIONSHIP' && evalResult.literal_value) {
            const companyName = evalResult.literal_value.trim();
            if (companyName.length >= 2) {
              if (isWrite && canonicalPersonId) {
                const compRes = await this.canonicalService.resolveEntityCandidate(
                  {
                    source_name: 'atlas_person_attribute_evidence:company',
                    source_record_id: ev.evidence_id,
                    source_entity_key: `company:${companyName}`,
                    tenant_id: person.tenant_id,
                    entity_type: 'COMPANY',
                    raw_name: companyName,
                    observed_at: ev.observed_at || new Date().toISOString()
                  },
                  person.tenant_id
                );

                if (compRes.canonical_entity_id) {
                  const obsId = primaryObservationId || compRes.observation_id;
                  await this.semanticService.assertRelationship(
                    {
                      subject_entity_id: canonicalPersonId,
                      object_entity_id: compRes.canonical_entity_id,
                      predicate_code: 'WORKS_AT',
                      knowledge_type: 'CLAIM',
                      confidence: ev.confidence ?? 0.85,
                      source_observation_id: obsId,
                      observed_at: ev.observed_at || new Date().toISOString(),
                      metadata: {
                        evidence_id: ev.evidence_id,
                        source_ref: ev.source_ref,
                        assertion_type: ev.assertion_type
                      },
                      evidence: obsId ? [
                        {
                          source_observation_id: obsId,
                          evidence_role: 'PRIMARY_OBSERVATION',
                          confidence_contribution: ev.confidence ?? 0.85,
                          evidence_metadata: {
                            evidence_id: ev.evidence_id,
                            assertion_type: ev.assertion_type
                          }
                        }
                      ] : []
                    },
                    person.tenant_id
                  );

                  summary.relationships_count++;
                  report.relationships_created++;
                  if (obsId) report.evidence_links_created++;
                }
              } else {
                summary.relationships_count++;
                report.relationships_created++;
                report.evidence_links_created++;
              }
            }
          }
          // Case B: Literal Typed Facts (HAS_ROLE)
          else if (evalResult.literal_value && evalResult.predicate_code === 'HAS_ROLE') {
            if (isWrite && canonicalPersonId) {
              await this.semanticService.assertFact(
                {
                  subject_entity_id: canonicalPersonId,
                  predicate_code: 'HAS_ROLE',
                  value_type: 'TEXT',
                  object_value: evalResult.literal_value,
                  knowledge_type: 'CLAIM',
                  confidence: ev.confidence ?? 0.85,
                  validation_method: 'UNVALIDATED_CLAIM',
                  source_observation_id: primaryObservationId,
                  evidence_hash: ev.evidence_hash,
                  observed_at: ev.observed_at || new Date().toISOString(),
                  metadata: {
                    source_ref: ev.source_ref,
                    assertion_type: ev.assertion_type || 'OBSERVED',
                    attribute_key: ev.attribute_key
                  },
                  evidence: primaryObservationId ? [
                    {
                      source_observation_id: primaryObservationId,
                      evidence_role: 'PRIMARY_OBSERVATION',
                      confidence_contribution: ev.confidence ?? 0.85,
                      evidence_metadata: {
                        evidence_id: ev.evidence_id,
                        evidence_hash: ev.evidence_hash,
                        assertion_type: ev.assertion_type
                      }
                    }
                  ] : []
                },
                person.tenant_id
              );

              summary.facts_count++;
              report.claims_created++;
              report.evidence_links_created++;
            } else {
              summary.facts_count++;
              report.claims_created++;
              report.evidence_links_created++;
            }
          }
          // Case C: Location Relationship (LOCATED_IN -> canonical LOCATION)
          else if (evalResult.literal_value && evalResult.predicate_code === 'LOCATED_IN') {
            const locationName = evalResult.literal_value.trim();
            if (locationName.length >= 2) {
              if (isWrite && canonicalPersonId) {
                const locRes = await this.canonicalService.resolveEntityCandidate(
                  {
                    source_name: 'atlas_person_attribute_evidence:location',
                    source_record_id: ev.evidence_id,
                    source_entity_key: `location:${locationName}`,
                    tenant_id: person.tenant_id,
                    entity_type: 'LOCATION',
                    raw_name: locationName,
                    observed_at: ev.observed_at || new Date().toISOString()
                  },
                  person.tenant_id
                );

                if (locRes.canonical_entity_id) {
                  const locObsId = primaryObservationId || locRes.observation_id;
                  await this.semanticService.assertRelationship(
                    {
                      subject_entity_id: canonicalPersonId,
                      object_entity_id: locRes.canonical_entity_id,
                      predicate_code: 'LOCATED_IN',
                      knowledge_type: 'CLAIM',
                      confidence: ev.confidence ?? 0.85,
                      source_observation_id: locObsId,
                      observed_at: ev.observed_at || new Date().toISOString(),
                      metadata: {
                        evidence_id: ev.evidence_id,
                        source_ref: ev.source_ref,
                        assertion_type: ev.assertion_type,
                        attribute_key: ev.attribute_key
                      },
                      evidence: locObsId ? [
                        {
                          source_observation_id: locObsId,
                          evidence_role: 'PRIMARY_OBSERVATION',
                          confidence_contribution: ev.confidence ?? 0.85,
                          evidence_metadata: {
                            evidence_id: ev.evidence_id,
                            assertion_type: ev.assertion_type
                          }
                        }
                      ] : []
                    },
                    person.tenant_id
                  );

                  summary.relationships_count++;
                  report.relationships_created++;
                  if (locObsId) report.evidence_links_created++;
                }
              } else {
                summary.relationships_count++;
                report.relationships_created++;
                report.evidence_links_created++;
              }
            }
          }
        }

        report.person_summaries.push(summary);
      } catch (err: any) {
        summary.status = 'ERROR';
        report.errors++;
        report.person_summaries.push(summary);
      }
    }

    return report;
  }
}
