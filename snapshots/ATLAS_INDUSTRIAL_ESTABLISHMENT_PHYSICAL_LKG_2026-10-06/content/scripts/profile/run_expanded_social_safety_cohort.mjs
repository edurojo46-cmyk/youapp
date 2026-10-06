import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SocialEvidenceAdapter, SocialLinkingState } from '../../src/lib/profile/social_evidence_adapter.mjs';

async function main() {
  console.log('================================================================');
  console.log('🔬 ATLAS V1.6 — EXPANDED SOCIAL SAFETY COHORT (30 CANDIDATES)');
  console.log('Invariant: WRONG_SOCIAL_ATTACHMENTS = 0');
  console.log('================================================================\n');

  // 30 Deterministic Candidates testing edge cases:
  // - Shared employers / corporate colleagues
  // - Verified handles vs name lookalikes
  // - Corporate & brand accounts
  // - Common names with no handle corroboration
  // - Personal domain linkages
  const cohort = [
    // 1-5: Verified Handle Matches
    {
      id: 'SOC_01',
      person: { atlas_person_id: 'atlas_per_soc_001', display_name: 'Guillermo Rauch', known_handles: ['rauchg'], known_organizations: ['Vercel'], known_domains: ['rauchg.com'] },
      candidate: { platform: 'X', platform_account_id: 'x_101', username: 'rauchg', display_name: 'Guillermo Rauch', bio: 'CEO @vercel', organization_declared: 'Vercel', website: 'https://rauchg.com' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_001'
    },
    {
      id: 'SOC_02',
      person: { atlas_person_id: 'atlas_per_soc_002', display_name: 'Dan Abramov', known_handles: ['gaearon'], known_organizations: ['Meta', 'React'], known_domains: ['overreacted.io'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_102', username: 'gaearon', display_name: 'dan', bio: 'Working on React', organization_declared: 'React', website: 'https://overreacted.io' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_002'
    },
    {
      id: 'SOC_03',
      person: { atlas_person_id: 'atlas_per_soc_003', display_name: 'Mariano Martinez', known_handles: ['mmartinez_dev'], known_organizations: ['Mercado Libre'], known_domains: ['mmartinez.dev'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_103', username: 'mmartinez_dev', display_name: 'Mariano Martinez', bio: 'Staff Eng @meli', organization_declared: 'Mercado Libre', website: 'https://mmartinez.dev' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_003'
    },
    {
      id: 'SOC_04',
      person: { atlas_person_id: 'atlas_per_soc_004', display_name: 'Sofia Rodriguez', known_handles: ['srodriguez_ai'], known_organizations: ['CONICET'], known_domains: ['uba.ar'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_104', username: 'srodriguez_ai', display_name: 'Sofia Rodriguez', bio: 'AI Researcher @CONICET', organization_declared: 'CONICET' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_004'
    },
    {
      id: 'SOC_05',
      person: { atlas_person_id: 'atlas_per_soc_005', display_name: 'Lucas Di Cesare', known_handles: ['ldicesare'], known_organizations: ['Auth0', 'Okta'], known_domains: ['dicesare.tech'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_105', username: 'ldicesare', display_name: 'Lucas Di Cesare', bio: 'Principal Architect', organization_declared: 'Auth0', website: 'https://dicesare.tech' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_005'
    },

    // 6-10: Shared Employers / Colleague Disambiguation (Colleague B candidate presented to Person A -> Must NOT Attach!)
    {
      id: 'SOC_06',
      person: { atlas_person_id: 'atlas_per_soc_006', display_name: 'Carlos Perez', known_handles: ['cperez_meli'], known_organizations: ['Mercado Libre'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_106', username: 'mfernandez_meli', display_name: 'Martin Fernandez', bio: 'Tech Lead @Mercado Libre', organization_declared: 'Mercado Libre' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },
    {
      id: 'SOC_07',
      person: { atlas_person_id: 'atlas_per_soc_007', display_name: 'Ana Gomez', known_handles: ['anagomez_globant'], known_organizations: ['Globant'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_107', username: 'jmartinez_globant', display_name: 'Jorge Martinez', bio: 'Developer at Globant', organization_declared: 'Globant' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },
    {
      id: 'SOC_08',
      person: { atlas_person_id: 'atlas_per_soc_008', display_name: 'Federico Rossi', known_handles: ['frossi_acc'], known_organizations: ['Accenture'] },
      candidate: { platform: 'X', platform_account_id: 'x_108', username: 'slombardi_acc', display_name: 'Silvia Lombardi', bio: 'Senior Manager @Accenture', organization_declared: 'Accenture' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },
    {
      id: 'SOC_09',
      person: { atlas_person_id: 'atlas_per_soc_009', display_name: 'Valeria Benitez', known_handles: ['vbenitez_uba'], known_organizations: ['UBA', 'CONICET'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_109', username: 'pcastro_uba', display_name: 'Pablo Castro', bio: 'Profesor UBA / Investigador CONICET', organization_declared: 'UBA' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },
    {
      id: 'SOC_10',
      person: { atlas_person_id: 'atlas_per_soc_010', display_name: 'Gabriel Torres', known_handles: ['gtorres_ypf'], known_organizations: ['YPF'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_110', username: 'dlopez_ypf', display_name: 'Diego Lopez', bio: 'Ingeniero Químico @YPF', organization_declared: 'YPF' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },

    // 11-16: Common Names without Corroborating Handles (Must be AMBIGUOUS, NEVER Verified)
    {
      id: 'SOC_11',
      person: { atlas_person_id: 'atlas_per_soc_011', display_name: 'Juan Perez', known_handles: ['jperez_caba_2026'], known_organizations: ['Gobierno de la Ciudad'] },
      candidate: { platform: 'X', platform_account_id: 'x_111', username: 'juanperez99', display_name: 'Juan Perez', bio: 'Amante del fútbol y la pizza' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },
    {
      id: 'SOC_12',
      person: { atlas_person_id: 'atlas_per_soc_012', display_name: 'Maria Gonzalez', known_handles: [], known_organizations: ['Hospital Clinicas'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_112', username: 'maria-gonzalez-ba', display_name: 'Maria Gonzalez', bio: 'Profesional de la salud' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },
    {
      id: 'SOC_13',
      person: { atlas_person_id: 'atlas_per_soc_013', display_name: 'Carlos Rodriguez', known_handles: [], known_organizations: ['UBA Derecho'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_113', username: 'crodriguez', display_name: 'Carlos Rodriguez', bio: 'Coder' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },
    {
      id: 'SOC_14',
      person: { atlas_person_id: 'atlas_per_soc_014', display_name: 'Alejandro Gomez', known_handles: [], known_organizations: ['Techint'] },
      candidate: { platform: 'X', platform_account_id: 'x_114', username: 'agomez_arg', display_name: 'Alejandro Gomez', bio: 'Buenos Aires, Argentina' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },
    {
      id: 'SOC_15',
      person: { atlas_person_id: 'atlas_per_soc_015', display_name: 'Lucia Lopez', known_handles: [], known_organizations: ['Ministerio de Salud'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_115', username: 'lucia-lopez-salud', display_name: 'Lucia Lopez', bio: 'Gestión pública' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },
    {
      id: 'SOC_16',
      person: { atlas_person_id: 'atlas_per_soc_016', display_name: 'Esteban Martinez', known_handles: [], known_organizations: ['Telecom'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_116', username: 'emartinez', display_name: 'Esteban Martinez', bio: 'Software dev' },
      expectedState: SocialLinkingState.AMBIGUOUS,
      expectedPersonId: null
    },

    // 17-22: Corporate, Brand, and Institutional Accounts (Must be REJECTED)
    {
      id: 'SOC_17',
      person: { atlas_person_id: 'atlas_per_soc_017', display_name: 'Marcos Galperin', known_handles: ['marcos_galperin'], known_organizations: ['Mercado Libre'] },
      candidate: { platform: 'X', platform_account_id: 'x_117', username: 'MercadoLibre', display_name: 'Mercado Libre', bio: 'Cuenta oficial de Mercado Libre', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },
    {
      id: 'SOC_18',
      person: { atlas_person_id: 'atlas_per_soc_018', display_name: 'Martin Migoya', known_handles: ['migoya'], known_organizations: ['Globant'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_118', username: 'globant', display_name: 'Globant', bio: 'We are a digitally native company', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },
    {
      id: 'SOC_19',
      person: { atlas_person_id: 'atlas_per_soc_019', display_name: 'Facundo Manes', known_handles: ['manesf'], known_organizations: ['Fundacion INECO'] },
      candidate: { platform: 'X', platform_account_id: 'x_119', username: 'INECOargentina', display_name: 'Fundación INECO', bio: 'Instituto de Neurología Cognitiva', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },
    {
      id: 'SOC_20',
      person: { atlas_person_id: 'atlas_per_soc_020', display_name: 'Ricardo Gelpi', known_handles: ['rector_gelpi'], known_organizations: ['Universidad de Buenos Aires'] },
      candidate: { platform: 'X', platform_account_id: 'x_120', username: 'UBAonline', display_name: 'Universidad de Buenos Aires', bio: 'Cuenta institucional oficial de la UBA', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },
    {
      id: 'SOC_21',
      person: { atlas_person_id: 'atlas_per_soc_021', display_name: 'Gustavo Grobocopatel', known_handles: ['grobocopatel'], known_organizations: ['Los Grobo'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_121', username: 'grupo-los-grobo', display_name: 'Grupo Los Grobo', bio: 'Líder en servicios agropecuarios integrados', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },
    {
      id: 'SOC_22',
      person: { atlas_person_id: 'atlas_per_soc_022', display_name: 'Paolo Rocca', known_handles: ['procca_techint'], known_organizations: ['Techint'] },
      candidate: { platform: 'X', platform_account_id: 'x_122', username: 'TechintGroup', display_name: 'Techint Group', bio: 'Global engineering and industrial group', is_corporate_account: true },
      expectedState: SocialLinkingState.REJECTED_LINK,
      expectedPersonId: null
    },

    // 23-26: Personal Domain & Portfolio Match
    {
      id: 'SOC_23',
      person: { atlas_person_id: 'atlas_per_soc_023', display_name: 'Emiliano Musso', known_handles: [], known_domains: ['emusso.io'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_123', username: 'musso_e', display_name: 'Emiliano', bio: 'Cloud Architect', website: 'https://emusso.io/about' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_023'
    },
    {
      id: 'SOC_24',
      person: { atlas_person_id: 'atlas_per_soc_024', display_name: 'Natalia Romero', known_handles: [], known_domains: ['nromero.design'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_124', username: 'nromero-ux', display_name: 'Natalia Romero', bio: 'Product Designer', website: 'https://nromero.design' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_024'
    },
    {
      id: 'SOC_25',
      person: { atlas_person_id: 'atlas_per_soc_025', display_name: 'Federico Garcia', known_handles: [], known_domains: ['fede-garcia.dev'] },
      candidate: { platform: 'X', platform_account_id: 'x_125', username: 'fedegarcia_ok', display_name: 'Fede Garcia', bio: 'Fullstack Dev', website: 'https://fede-garcia.dev' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_025'
    },
    {
      id: 'SOC_26',
      person: { atlas_person_id: 'atlas_per_soc_026', display_name: 'Jimena Castro', known_handles: [], known_domains: ['jimenacastro.com.ar'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_126', username: 'jime_castro', display_name: 'Jimena Castro', bio: 'Data Scientist', website: 'https://jimenacastro.com.ar' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_026'
    },

    // 27-30: Name + Organization + Bio Multi-Attribute Match (Verified) vs Disconnected Candidate (Unlinked)
    {
      id: 'SOC_27',
      person: { atlas_person_id: 'atlas_per_soc_027', display_name: 'Camila Diaz', known_handles: [], known_organizations: ['Hospital Italiano'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_127', username: 'camila-diaz-hi', display_name: 'Camila Diaz', bio: 'Camila Diaz, Residente de Cirugía en Hospital Italiano de Buenos Aires', organization_declared: 'Hospital Italiano' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_027'
    },
    {
      id: 'SOC_28',
      person: { atlas_person_id: 'atlas_per_soc_028', display_name: 'Maximiliano Blanco', known_handles: [], known_organizations: ['Bolsa de Comercio'] },
      candidate: { platform: 'LINKEDIN', platform_account_id: 'li_128', username: 'maxi-blanco-bc', display_name: 'Maximiliano Blanco', bio: 'Maximiliano Blanco, Analista Financiero en Bolsa de Comercio', organization_declared: 'Bolsa de Comercio' },
      expectedState: SocialLinkingState.VERIFIED_LINK,
      expectedPersonId: 'atlas_per_soc_028'
    },
    {
      id: 'SOC_29',
      person: { atlas_person_id: 'atlas_per_soc_029', display_name: 'Bruno Rossi', known_handles: ['brossi'], known_organizations: ['Cerveceria Quilmes'] },
      candidate: { platform: 'GITHUB', platform_account_id: 'gh_129', username: 'totally_unrelated_handle', display_name: 'Klaus Schmidt', bio: 'Berlin developer', organization_declared: 'SAP' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    },
    {
      id: 'SOC_30',
      person: { atlas_person_id: 'atlas_per_soc_030', display_name: 'Florencia Sosa', known_handles: ['fsosa'], known_organizations: ['Banco Galicia'] },
      candidate: { platform: 'X', platform_account_id: 'x_130', username: 'someone_else_tokyo', display_name: 'Kenji Sato', bio: 'Tokyo photographer', organization_declared: 'Tokyo Arts' },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE,
      expectedPersonId: null
    }
  ];

  let correctEvaluations = 0;
  let wrongAttachments = 0;
  const auditDetails = [];

  for (const item of cohort) {
    const decision = SocialEvidenceAdapter.evaluateLinking(item.person, item.candidate);
    const isStateCorrect = decision.state === item.expectedState;
    const isPersonCorrect = decision.verified_atlas_person_id === item.expectedPersonId;

    if (decision.state === SocialLinkingState.VERIFIED_LINK && decision.verified_atlas_person_id !== item.person.atlas_person_id) {
      wrongAttachments++;
    }
    if (decision.state === SocialLinkingState.VERIFIED_LINK && item.expectedState !== SocialLinkingState.VERIFIED_LINK) {
      wrongAttachments++;
    }

    if (isStateCorrect && isPersonCorrect) {
      correctEvaluations++;
    }

    auditDetails.push({
      id: item.id,
      candidate: item.candidate.username || item.candidate.display_name,
      platform: item.candidate.platform,
      expectedState: item.expectedState,
      actualState: decision.state,
      expectedPersonId: item.expectedPersonId,
      actualPersonId: decision.verified_atlas_person_id,
      rationale: decision.rationale,
      is_pass: isStateCorrect && isPersonCorrect
    });
  }

  const countsByState = {
    VERIFIED_LINK: auditDetails.filter(d => d.actualState === SocialLinkingState.VERIFIED_LINK).length,
    AMBIGUOUS: auditDetails.filter(d => d.actualState === SocialLinkingState.AMBIGUOUS).length,
    REJECTED_LINK: auditDetails.filter(d => d.actualState === SocialLinkingState.REJECTED_LINK).length,
    UNLINKED_CANDIDATE: auditDetails.filter(d => d.actualState === SocialLinkingState.UNLINKED_CANDIDATE).length
  };

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_CANDIDATES: cohort.length,
    CORRECT_EVALUATIONS: correctEvaluations,
    WRONG_SOCIAL_ATTACHMENTS: wrongAttachments,
    SAFETY_GATE_PASS: wrongAttachments === 0 && correctEvaluations === cohort.length,
    COUNTS_BY_STATE: countsByState,
    DETAILS: auditDetails
  };

  fs.mkdirSync('reports/atlas/profile', { recursive: true });
  fs.writeFileSync('reports/atlas/profile/expanded_social_safety_cohort_v16.json', JSON.stringify(report, null, 2));

  console.log('--- EXPANDED SOCIAL SAFETY COHORT AUDIT RESULTS ---');
  console.log(`TOTAL CANDIDATES EVALUATED : ${report.TOTAL_CANDIDATES}`);
  console.log(`CORRECT EVALUATIONS        : ${report.CORRECT_EVALUATIONS} / ${report.TOTAL_CANDIDATES}`);
  console.log(`WRONG_SOCIAL_ATTACHMENTS   : ${report.WRONG_SOCIAL_ATTACHMENTS}`);
  console.log(`COUNTS BY STATE            :`, JSON.stringify(countsByState, null, 2));
  console.log(`SAFETY GATE VERDICT        : ${report.SAFETY_GATE_PASS ? 'PASS (Zero Wrong Attachments)' : 'FAIL'}`);
  console.log('Saved to reports/atlas/profile/expanded_social_safety_cohort_v16.json\n');
}

main().catch(err => {
  console.error('Cohort evaluation failed:', err);
  process.exit(1);
});
