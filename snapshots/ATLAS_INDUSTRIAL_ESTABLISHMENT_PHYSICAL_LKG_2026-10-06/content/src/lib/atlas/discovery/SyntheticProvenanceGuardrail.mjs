/**
 * SyntheticProvenanceGuardrail.mjs
 * 
 * ATLAS V1.7D: STRICT PRODUCTION SYNTHETIC DATA GUARDRAIL
 * Invariant: PRODUCTION_PERSON_SOURCE_REALITY = REAL_SOURCE_ONLY
 */

export const SOURCE_REALITY_INVARIANT = 'REAL_SOURCE_ONLY';

export class SyntheticProvenanceGuardrail {
  /**
   * Validates that an incoming candidate row satisfies the real source provenance contract.
   * Rejects any synthetic or unverified rows before commit.
   * 
   * @param {Object} row Candidate row
   * @returns {Object} { isValid: boolean, error?: string, sanitizedRow?: Object }
   */
  static validateCandidate(row) {
    if (!row) {
      return { isValid: false, error: 'CANDIDATE_EMPTY' };
    }

    // 1. Mandatory synthetic_flag check
    if (row.synthetic_flag === true || row.is_synthetic === true) {
      return { 
        isValid: false, 
        error: 'REJECTED_SYNTHETIC_ROW: synthetic_flag must be explicitly FALSE for production denominator eligibility.' 
      };
    }

    // 2. Mandatory provenance fields
    const provenanceType = row.source_provenance_type || row.sourceProvenanceType;
    if (!provenanceType || !['HTTP_REST', 'HTTP_OAI_PMH', 'OFFICIAL_PUBLIC_ARTIFACT', 'VERIFIED_PHYSICAL_DUMP'].includes(provenanceType)) {
      return {
        isValid: false,
        error: `INVALID_PROVENANCE_TYPE: '${provenanceType}'. Must be a certified real source provenance type.`
      };
    }

    // 3. Mandatory source URL or durable artifact ID
    const sourceRef = row.source_url_or_artifact_id || row.sourceUrl || row.source_url || row.artifact_id;
    if (!sourceRef || typeof sourceRef !== 'string' || sourceRef.trim() === '') {
      return {
        isValid: false,
        error: 'MISSING_SOURCE_PROVENANCE_REFERENCE: source_url_or_artifact_id is required.'
      };
    }

    // 4. Cryptographic raw record hash
    const rawHash = row.raw_record_hash || row.sourceRecordHash;
    if (!rawHash || rawHash.length < 16) {
      return {
        isValid: false,
        error: 'MISSING_RAW_RECORD_HASH: cryptographic hash of original source row is required.'
      };
    }

    // 5. Audit timestamp and parser version
    const retrievedAt = row.retrieved_at || row.retrievedAt;
    if (!retrievedAt) {
      return {
        isValid: false,
        error: 'MISSING_RETRIEVAL_TIMESTAMP: retrieved_at is required for lineage attribution.'
      };
    }

    const parserVersion = row.parser_version || row.parserVersion || 'v1.7d';

    return {
      isValid: true,
      sanitizedRow: {
        ...row,
        source_provenance_type: provenanceType,
        source_url_or_artifact_id: sourceRef,
        raw_record_hash: rawHash,
        retrieved_at: retrievedAt,
        parser_version: parserVersion,
        synthetic_flag: false
      }
    };
  }

  /**
   * Batch validation
   */
  static validateBatch(rows) {
    const validRows = [];
    const rejectedRows = [];

    for (let i = 0; i < rows.length; i++) {
      const v = this.validateCandidate(rows[i]);
      if (v.isValid) {
        validRows.push(v.sanitizedRow);
      } else {
        rejectedRows.push({ index: i, error: v.error, row: rows[i] });
      }
    }

    return {
      allValid: rejectedRows.length === 0,
      validRows,
      rejectedRows,
      rejectedCount: rejectedRows.length
    };
  }
}
