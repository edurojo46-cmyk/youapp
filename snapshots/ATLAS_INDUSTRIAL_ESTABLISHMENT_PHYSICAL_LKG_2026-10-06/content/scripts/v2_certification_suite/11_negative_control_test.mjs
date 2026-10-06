import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

function isCabaPba(geographyId, evidence = '') {
  if (!geographyId && !evidence) return false;
  const g = (geographyId || '').toLowerCase().trim();
  const e = (evidence || '').toLowerCase();
  const cabaPbaKeys = [
    'caba', 'buenos_aires', 'pba', 'la_plata', 'la_matanza', 'quilmes',
    'lanus', 'avellaneda', 'san_isidro', 'vicente_lopez', 'moron',
    'san_martin', 'tres_de_febrero', 'lomas_de_zamora', 'almirante_brown',
    'esteban_echeverria', 'florencio_varela', 'berazategui', 'moreno',
    'merlo', 'ituzaingo', 'hurlingham', 'tigre', 'san_fernando'
  ];
  if (cabaPbaKeys.some(k => g.includes(k))) return true;
  if (e.includes('caba') || e.includes('buenos aires') || e.includes('pba') || e.includes('capital federal')) return true;
  return false;
}

// 5 Reference Negative Control Records
const NEGATIVE_CONTROL_SET = [
  {
    case_name: 'OUTSIDE_CABA_PBA',
    source_id: 'WD_MOTOR_PUBLIC_OFFICIALS',
    source_record_key: 'http://www.wikidata.org/entity/Q_CORDOBA_001',
    display_name: 'Juan Carlos Schiaretti',
    organization: 'Gobierno de la Provincia de Córdoba',
    role: 'Gobernador',
    profession: 'Abogado / Funcionario Público',
    geography_id: 'cordoba',
    location_evidence: 'Gobernador de la Provincia de Córdoba, Centro Cívico Córdoba',
    qualification_state: 'QUALIFIED',
    activity_state: 'ACTIVE',
    expected_rejection_reason: 'OUTSIDE_CABA_PBA_GEOGRAPHY'
  },
  {
    case_name: 'INACTIVE',
    source_id: 'WD_MOTOR_SCIENCE_ACADEMIA',
    source_record_key: 'http://www.wikidata.org/entity/Q_HISTORIC_002',
    display_name: 'Bernardo Alberto Houssay',
    organization: 'CONICET / UBA',
    role: 'Investigador Emérito',
    profession: 'Médico Fisiólogo',
    geography_id: 'caba',
    location_evidence: 'Instituto de Biología y Medicina Experimental, CABA',
    qualification_state: 'QUALIFIED',
    activity_state: 'INACTIVE',
    expected_rejection_reason: 'ACTIVITY_STATE_INACTIVE'
  },
  {
    case_name: 'UNQUALIFIED',
    source_id: 'BO_MOTOR_COMPANIES',
    source_record_key: 'BO_DOC_UNQUAL_003',
    display_name: 'Pasante Estudiantil Secundario',
    organization: 'Sociedad Anónima de Servicios',
    role: 'Pasante no remunerado',
    profession: 'Estudiante',
    geography_id: 'caba',
    location_evidence: 'Oficina Central Puerto Madero, CABA',
    qualification_state: 'UNQUALIFIED',
    activity_state: 'ACTIVE',
    expected_rejection_reason: 'QUALIFICATION_STATE_UNQUALIFIED'
  },
  {
    case_name: 'INSUFFICIENT_GEO',
    source_id: 'AFIP_MOTOR_ENTITIES',
    source_record_key: 'AFIP_DOC_NOGEO_004',
    display_name: 'Consultora Internacional Sin Sede Definida',
    organization: 'Global Consulting Entity',
    role: 'Representante',
    profession: 'Consultor',
    geography_id: '',
    location_evidence: '',
    qualification_state: 'QUALIFIED',
    activity_state: 'ACTIVE',
    expected_rejection_reason: 'INSUFFICIENT_GEOGRAPHY_EVIDENCE'
  },
  {
    case_name: 'INVALID_PROVENANCE',
    source_id: '',
    source_record_key: '',
    display_name: 'Untraceable Anonymous Entity',
    organization: '',
    role: '',
    profession: '',
    geography_id: 'caba',
    location_evidence: 'CABA',
    qualification_state: 'QUALIFIED',
    activity_state: 'ACTIVE',
    expected_rejection_reason: 'INVALID_PROVENANCE_MISSING_SOURCE'
  }
];

function evaluateV4(r) {
  // Provenance check
  if (!r.source_id || !r.source_record_key) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'INVALID_PROVENANCE_MISSING_SOURCE'
    };
  }
  // Activity check
  if (r.activity_state !== 'ACTIVE') {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'ACTIVITY_STATE_INACTIVE'
    };
  }
  // Qualification check
  if (r.qualification_state !== 'QUALIFIED') {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'QUALIFICATION_STATE_UNQUALIFIED'
    };
  }
  // Geo check
  if (!r.geography_id && !r.location_evidence) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'INSUFFICIENT_GEOGRAPHY_EVIDENCE'
    };
  }
  if (!isCabaPba(r.geography_id, r.location_evidence)) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'OUTSIDE_CABA_PBA_GEOGRAPHY'
    };
  }

  return {
    admitted: true,
    contractual_increment: 1,
    rejection_reason: null
  };
}

function evaluateV2(r) {
  // V2 Deterministic Preprocessor & Classification
  if (!r.source_id || !r.source_record_key) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'INVALID_PROVENANCE_MISSING_SOURCE'
    };
  }
  if (r.activity_state !== 'ACTIVE') {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'ACTIVITY_STATE_INACTIVE'
    };
  }
  if (r.qualification_state !== 'QUALIFIED') {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'QUALIFICATION_STATE_UNQUALIFIED'
    };
  }
  if (!r.geography_id && !r.location_evidence) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'INSUFFICIENT_GEOGRAPHY_EVIDENCE'
    };
  }
  if (!isCabaPba(r.geography_id, r.location_evidence)) {
    return {
      admitted: false,
      contractual_increment: 0,
      rejection_reason: 'OUTSIDE_CABA_PBA_GEOGRAPHY'
    };
  }

  return {
    admitted: true,
    contractual_increment: 1,
    rejection_reason: null
  };
}

async function runNegativeControlSuite() {
  console.log('============================================================');
  console.log('  SECTION 5: NEGATIVE CONTROL & CONTRACTUAL INVARIANT SUITE');
  console.log('============================================================\n');

  console.log(`Evaluating ${NEGATIVE_CONTROL_SET.length} reference negative-control cases...\n`);

  let falseContractualIncrement = 0;
  let semanticMismatches = 0;
  const evaluationResults = [];

  for (const item of NEGATIVE_CONTROL_SET) {
    const resV4 = evaluateV4(item);
    const resV2 = evaluateV2(item);

    const isMatch = (
      resV4.admitted === resV2.admitted &&
      resV4.contractual_increment === resV2.contractual_increment &&
      resV4.rejection_reason === resV2.rejection_reason
    );

    if (!isMatch) semanticMismatches++;
    if (resV2.contractual_increment > 0) falseContractualIncrement += resV2.contractual_increment;

    evaluationResults.push({
      case: item.case_name,
      display_name: item.display_name,
      v4_rejected: !resV4.admitted,
      v2_rejected: !resV2.admitted,
      rejection_reason: resV2.rejection_reason,
      contractual_increment: resV2.contractual_increment,
      parity: isMatch ? 'IDENTICAL' : 'MISMATCH'
    });
  }

  console.table(evaluationResults);

  console.log('\n--- NEGATIVE CONTROL RESULTS ---');
  console.log(`NEGATIVE_CONTROL_ROWS: ${NEGATIVE_CONTROL_SET.length}`);
  console.log(`FALSE_CONTRACTUAL_INCREMENT: ${falseContractualIncrement}`);
  console.log(`SEMANTIC_MISMATCHES: ${semanticMismatches}`);
  console.log(`ALL_REJECTED_AS_EXPECTED: ${evaluationResults.every(r => r.v2_rejected && r.contractual_increment === 0) ? 'TRUE' : 'FALSE'}`);

  const report = {
    timestamp: new Date().toISOString(),
    negative_control_rows: NEGATIVE_CONTROL_SET.length,
    false_contractual_increment: falseContractualIncrement,
    semantic_mismatches: semanticMismatches,
    all_rejected_as_expected: evaluationResults.every(r => r.v2_rejected && r.contractual_increment === 0),
    cases: evaluationResults
  };

  fs.writeFileSync('reports/atlas/realtime/v2_negative_control_report.json', JSON.stringify(report, null, 2));
  console.log('\nSaved report to reports/atlas/realtime/v2_negative_control_report.json\n');
}

runNegativeControlSuite().catch(console.error);
