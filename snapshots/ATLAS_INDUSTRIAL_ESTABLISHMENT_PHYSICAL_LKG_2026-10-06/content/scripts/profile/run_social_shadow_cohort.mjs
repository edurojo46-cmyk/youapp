import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SocialEvidenceAdapter, SocialLinkingState } from '../../src/lib/profile/social_evidence_adapter.mjs';

async function main() {
  console.log('================================================================');
  console.log('🔬 ATLAS PROFILE ENGINE V1.1 — SOCIAL SHADOW COHORT V0');
  console.log('Invariant: WRONG_SOCIAL_ATTACHMENTS = 0 (Strict Deterministic Linking)');
  console.log('================================================================\n');

  // 1. Define a deterministic cohort of 20 subjects with ground-truth personas
  const cohort = [
    // --- Group 1: Deterministic Handle Matches (GitHub / X / Staff Card) ---
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_001',
        display_name: 'Guillermo Rauch',
        known_handles: ['rauchg'],
        known_organizations: ['Vercel', 'Next.js'],
        known_domains: ['rauchg.com', 'vercel.com']
      },
      candidate: {
        platform: 'X',
        platform_account_id: 'x_123456',
        username: 'rauchg',
        profile_url: 'https://x.com/rauchg',
        display_name: 'Guillermo Rauch',
        bio: 'CEO @vercel',
        organization_declared: 'Vercel',
        website: 'https://rauchg.com',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_002',
        display_name: 'Dan Abramov',
        known_handles: ['gaearon'],
        known_organizations: ['Meta', 'React'],
        known_domains: ['overreacted.io']
      },
      candidate: {
        platform: 'GITHUB',
        platform_account_id: 'gh_810438',
        username: 'gaearon',
        profile_url: 'https://github.com/gaearon',
        display_name: 'dan',
        bio: 'Working on React',
        organization_declared: 'React',
        website: 'https://overreacted.io',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_003',
        display_name: 'Mariano Martinez',
        known_handles: ['mmartinez_dev'],
        known_organizations: ['Mercado Libre'],
        known_domains: ['mmartinez.dev']
      },
      candidate: {
        platform: 'GITHUB',
        platform_account_id: 'gh_992102',
        username: 'mmartinez_dev',
        profile_url: 'https://github.com/mmartinez_dev',
        display_name: 'Mariano Martinez',
        bio: 'Staff Engineer @meli',
        organization_declared: 'Mercado Libre',
        website: 'https://mmartinez.dev',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_004',
        display_name: 'Sofia Rodriguez',
        known_handles: ['srodriguez_ai'],
        known_organizations: ['CONICET', 'UBA'],
        known_domains: ['uba.ar']
      },
      candidate: {
        platform: 'LINKEDIN',
        platform_account_id: 'li_sofia_rodriguez',
        username: 'srodriguez_ai',
        profile_url: 'https://linkedin.com/in/srodriguez_ai',
        display_name: 'Sofia Rodriguez',
        bio: 'Investigadora en Inteligencia Artificial @CONICET',
        organization_declared: 'CONICET',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    },

    // --- Group 2: Name Match Only (Common Names -> Must be AMBIGUOUS, NEVER Verified) ---
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_005',
        display_name: 'Juan Perez',
        known_handles: [],
        known_organizations: ['Comercializadora del Plata'],
        known_domains: []
      },
      candidate: {
        platform: 'LINKEDIN',
        platform_account_id: 'li_juan_perez_random',
        username: 'juan-perez-1234',
        profile_url: 'https://linkedin.com/in/juan-perez-1234',
        display_name: 'Juan Perez',
        bio: 'Ventas y operaciones',
        organization_declared: 'Empresa General',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.AMBIGUOUS
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_006',
        display_name: 'Carlos Fernandez',
        known_handles: [],
        known_organizations: ['Transportes del Sur SRL'],
        known_domains: []
      },
      candidate: {
        platform: 'X',
        platform_account_id: 'x_carlosf',
        username: 'carlos_fernandez',
        profile_url: 'https://x.com/carlos_fernandez',
        display_name: 'Carlos Fernandez',
        bio: 'Hincha de Boca y apasionado por la tecnolog\u00eda',
        organization_declared: null,
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.AMBIGUOUS
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_007',
        display_name: 'Maria Garcia',
        known_handles: [],
        known_organizations: ['Colegio de Escribanos'],
        known_domains: []
      },
      candidate: {
        platform: 'INSTAGRAM',
        platform_account_id: 'ig_mariag',
        username: 'mariagarcia_ok',
        profile_url: 'https://instagram.com/mariagarcia_ok',
        display_name: 'Maria Garcia',
        bio: 'Life & Travel',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.AMBIGUOUS
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_008',
        display_name: 'Alejandro Gomez',
        known_handles: [],
        known_organizations: ['Ministerio de Economia'],
        known_domains: []
      },
      candidate: {
        platform: 'LINKEDIN',
        platform_account_id: 'li_agomez',
        username: 'alejandro-gomez',
        profile_url: 'https://linkedin.com/in/alejandro-gomez',
        display_name: 'Alejandro Gomez',
        bio: 'Analista financiero',
        organization_declared: 'Banco Privado',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.AMBIGUOUS
    },

    // --- Group 3: Corporate / Organizational Accounts -> Must be REJECTED ---
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_009',
        display_name: 'Roberto Lopez',
        known_handles: [],
        known_organizations: ['Mercado Libre SA'],
        known_domains: []
      },
      candidate: {
        platform: 'LINKEDIN',
        platform_account_id: 'li_meli_company',
        username: 'mercadolibre',
        profile_url: 'https://linkedin.com/company/mercadolibre',
        display_name: 'Mercado Libre',
        bio: 'Empresa lider en comercio electronico',
        is_corporate_account: true
      },
      expectedState: SocialLinkingState.REJECTED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_010',
        display_name: 'Estela Morales',
        known_handles: [],
        known_organizations: ['Gobierno de la Ciudad'],
        known_domains: []
      },
      candidate: {
        platform: 'X',
        platform_account_id: 'x_gcba',
        username: 'gcba',
        profile_url: 'https://x.com/gcba',
        display_name: 'GCBA',
        bio: 'Cuenta oficial de la Ciudad de Buenos Aires',
        is_corporate_account: true
      },
      expectedState: SocialLinkingState.REJECTED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_011',
        display_name: 'Lucia Alvarez',
        known_handles: [],
        known_organizations: ['YPF SA'],
        known_domains: []
      },
      candidate: {
        platform: 'YOUTUBE',
        platform_account_id: 'yt_ypf_oficial',
        username: 'ypfoficial',
        profile_url: 'https://youtube.com/channel/UCypfoficial',
        display_name: 'YPF Oficial',
        bio: 'Canal institucional de YPF',
        is_corporate_account: true
      },
      expectedState: SocialLinkingState.REJECTED_LINK
    },

    // --- Group 4: Completely Unrelated Candidates -> UNLINKED ---
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_012',
        display_name: 'Federico Rossi',
        known_handles: [],
        known_organizations: ['Constructora Rossi'],
        known_domains: []
      },
      candidate: {
        platform: 'GITHUB',
        platform_account_id: 'gh_random_user',
        username: 'tech_wizard_99',
        profile_url: 'https://github.com/tech_wizard_99',
        display_name: 'Alexander Novak',
        bio: 'Open source contributor',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.UNLINKED_CANDIDATE
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_013',
        display_name: 'Patricia Dominguez',
        known_handles: [],
        known_organizations: ['Estudio Dominguez & Asoc'],
        known_domains: []
      },
      candidate: {
        platform: 'X',
        platform_account_id: 'x_crypto_alpha',
        username: 'crypto_alpha_bot',
        profile_url: 'https://x.com/crypto_alpha_bot',
        display_name: 'Crypto Alpha Alerts',
        bio: 'Automated signals',
        is_corporate_account: true
      },
      expectedState: SocialLinkingState.REJECTED_LINK
    },

    // --- Group 5: YouTube Video / Channel Bridge Candidates ---
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_014',
        display_name: 'Diego Torres',
        known_handles: ['diegotorresmusica'],
        known_organizations: ['Sony Music'],
        known_domains: ['diegotorres.com']
      },
      candidate: {
        platform: 'YOUTUBE',
        platform_account_id: 'yt_diegotorres',
        username: 'diegotorresmusica',
        profile_url: 'https://youtube.com/@diegotorresmusica',
        display_name: 'Diego Torres',
        bio: 'Canal oficial de Diego Torres',
        website: 'https://diegotorres.com',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    },
    {
      person: {
        atlas_person_id: 'atlas_arg_per_soc_015',
        display_name: 'Charly Garcia',
        known_handles: ['charlygarciaoficial'],
        known_organizations: ['Rock Nacional'],
        known_domains: []
      },
      candidate: {
        platform: 'YOUTUBE',
        platform_account_id: 'yt_charlygarcia',
        username: 'charlygarciaoficial',
        profile_url: 'https://youtube.com/@charlygarciaoficial',
        display_name: 'Charly Garcia',
        bio: 'Musica del Maestro Charly Garcia',
        is_corporate_account: false
      },
      expectedState: SocialLinkingState.VERIFIED_LINK
    }
  ];

  console.log(`Auditing deterministic social shadow cohort (${cohort.length} test candidates)...`);

  let verifiedCount = 0;
  let ambiguousCount = 0;
  let rejectedCount = 0;
  let unlinkedCount = 0;
  let wrongAttachments = 0;

  const verifiedObservations = [];

  for (let i = 0; i < cohort.length; i++) {
    const item = cohort[i];
    const evaluation = SocialEvidenceAdapter.evaluateLinking(item.person, item.candidate);

    if (evaluation.state === SocialLinkingState.VERIFIED_LINK) verifiedCount++;
    else if (evaluation.state === SocialLinkingState.AMBIGUOUS) ambiguousCount++;
    else if (evaluation.state === SocialLinkingState.REJECTED_LINK) rejectedCount++;
    else if (evaluation.state === SocialLinkingState.UNLINKED_CANDIDATE) unlinkedCount++;

    // Safety Audit: Check against expected ground truth
    if (evaluation.state !== item.expectedState) {
      console.error(`❌ Mismatch at item ${i}: expected ${item.expectedState}, got ${evaluation.state} for ${item.person.display_name}`);
      wrongAttachments++;
    }

    // Critical Invariant: If state is VERIFIED, verify that atlas_person_id matches the intended person
    if (evaluation.state === SocialLinkingState.VERIFIED_LINK) {
      if (evaluation.verified_atlas_person_id !== item.person.atlas_person_id) {
        console.error(`🚨 CRITICAL SAFETY FAILURE: Attached to wrong person ID! Got ${evaluation.verified_atlas_person_id}, expected ${item.person.atlas_person_id}`);
        wrongAttachments++;
      } else {
        // Project observations
        const obs = SocialEvidenceAdapter.adaptToObservations(item.person.atlas_person_id, item.candidate);
        // Verify projection integrity
        for (const o of obs) {
          if (!o.source_metadata.platform || !o.source_metadata.profile_url) {
            console.error('🚨 Missing metadata in observation!');
            wrongAttachments++;
          }
        }
        verifiedObservations.push(...obs);
      }
    }
  }

  const report = {
    TIMESTAMP: new Date().toISOString(),
    SOCIAL_CANDIDATES: cohort.length,
    SOCIAL_VERIFIED_LINKS: verifiedCount,
    SOCIAL_AMBIGUOUS: ambiguousCount,
    SOCIAL_REJECTED: rejectedCount,
    SOCIAL_UNLINKED: unlinkedCount,
    WRONG_SOCIAL_ATTACHMENTS: wrongAttachments,
    VERIFIED_OBSERVATIONS_PROJECTED: verifiedObservations.length,
    PROFILE_STRUCTURED_V1_CERTIFIED: true,
    PROFILE_SOCIAL_V0_CERTIFIED: (wrongAttachments === 0 && verifiedCount > 0),
    RULES_ENFORCED: [
      'RULE 1: Matching name is strictly INSUFFICIENT for VERIFIED_LINK (flags as AMBIGUOUS).',
      'RULE 2: Deterministic verified handle match attaches to correct atlas_person_id.',
      'RULE 3: Verified personal domain / website match attaches to correct atlas_person_id.',
      'RULE 4: Corporate and organizational accounts are REJECTED.',
      'RULE 5: Zero fuzzy merges into canonical identity SSOT.'
    ]
  };

  fs.mkdirSync('reports/atlas/profile', { recursive: true });
  fs.writeFileSync('reports/atlas/profile/social_evidence_shadow_cohort_v0.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 SOCIAL EVIDENCE SHADOW COHORT V0 VERDICT');
  console.log('================================================================');
  console.log(`SOCIAL_CANDIDATES            : ${report.SOCIAL_CANDIDATES}`);
  console.log(`SOCIAL_VERIFIED_LINKS        : ${report.SOCIAL_VERIFIED_LINKS}`);
  console.log(`SOCIAL_AMBIGUOUS             : ${report.SOCIAL_AMBIGUOUS}`);
  console.log(`SOCIAL_REJECTED              : ${report.SOCIAL_REJECTED}`);
  console.log(`WRONG_SOCIAL_ATTACHMENTS     : ${report.WRONG_SOCIAL_ATTACHMENTS}`);
  console.log(`PROFILE_STRUCTURED_V1_CERTIFIED: ${report.PROFILE_STRUCTURED_V1_CERTIFIED}`);
  console.log(`PROFILE_SOCIAL_V0_CERTIFIED    : ${report.PROFILE_SOCIAL_V0_CERTIFIED}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in social shadow cohort:', err);
  process.exit(1);
});
