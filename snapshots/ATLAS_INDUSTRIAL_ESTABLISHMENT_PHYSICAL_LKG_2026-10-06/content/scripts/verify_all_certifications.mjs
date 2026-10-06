import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT_DIR = process.cwd();
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'atlas', 'discovery');

const EXPECTED_HASHES = {
  'atlas_discovery_v1_d1k.json': '4f608e3ecb64ae315b7824160c126239d08e18aebf0deeddc48f124354b93469',
  'atlas_discovery_v1_d1k_replay.json': 'e41c0229b16e2f06d11e5c6b751351bf0b5ef915c4d287f5b79e60ff7135f7dd',
  'atlas_discovery_efficiency_gate_e1_engine.json': '75497f4a4dd2b5e6e2c418b82ae5017599c6b535a95c3fbaa2384110e7710316',
  'atlas_discovery_efficiency_gate_e1_e2e.json': '72eb9fabb5beefc93c20ed85dc728841910a5d80b944bf2d62301cc58bdd7495',
  'atlas_discovery_efficiency_gate_e1.json': 'a64fdd2b06f9a50f2d39c432ad2972500f71343942f26532915a79112905476c',
  'atlas_discovery_e2_materialization.json': '03491c351f5f45cc10d686d3d39254ecdc0e977a3628f9585913e9509d683053',
  'atlas_discovery_e2_canonical_materialization.json': '4d3ac12db2affe6993c20c6967c1d60dd3bc977a7b4955b958cf2624c5d9478c',
  'atlas_discovery_e2_source_metric_hardening.json': 'a85bfb774f8a0cd63accef7bb6e381048c50b60e4a89a22e5b5a65317d17316c',
  'atlas_discovery_e2_polyphase_source_field.json': '6ff0cf641d7b9eb11721f66e102a9bc2bb570b92714930b22a49bf7f0add167e',
  'atlas_discovery_e2_polyphase_sustained_field.json': 'c49d04be36f4217b3020662bdb84a706f46fb25126360cba74c68b48a57bfa3b',
  'atlas_discovery_e2_tesla_source_wheel.json': '0f7af020422762a69a593b3a9770d5bc73995cafed10d7241ee06050d2f6fe39',
  'atlas_discovery_e2_tesla_wheel_quality.json': '5c115f813715a0ae61bfd01aa13dc99999e05332f3d25db1aacb967e3bca999c',
  'atlas_discovery_phase3_field_controller_shadow.json': 'a4e7a1b33b8e1f6aaff85d04580b38542ed87629daf6d4a457c39b4cacafbae3',
  'atlas_discovery_phase3_1_power_field.json': 'bd5bb68fed094640f6ac699519a6bab1ae2d1814e476dea76d89e77537a0325d',
  'atlas_discovery_phase3_2_depth_reservoir.json': 'f8632681cbda17acbe78bc1fe8b21afcae9e9a5a5e9494294955404fd908fde9',
  'atlas_discovery_phase3_2_1_reservoir_truth.json': '324ea2da9bcd512c9872e0eb8b18aeb1facb9c33df5f8de96d1095570952caec',
  'atlas_discovery_phase3_2_2_reservoir_expansion.json': 'cc5105bb940f2ce0f1c6e0f6745b586b7d09baf16d60d11ace864f2be27de4ba',
  'atlas_discovery_phase3_2_2a_source_receipt_replay.json': 'e99e7bbb82d250d090d9f4298997422f34ec6cc093232b638bfa12ff5db70df1',
  'atlas_discovery_phase3_2_3_reservoir_expansion_ii.json': '80d3dfde0eb4c25481681629439c67ff37bb358e2463b1ef485a0c1a83652391',
  'atlas_discovery_phase3_2_3a_identity_aware_validation.json': '8757666a754a27d1edd559f0b21ee857fc00f2beebcfb3e1fe700af8afbfe5cd',
  'atlas_discovery_phase3_2_3a1_candidate_loss_audit.json': '3e17484d26e092425821779de932dc6bb6b8796770e8828a9c69f2b874ba9f90',
  'atlas_discovery_phase3_2_3a2_canonical_truth_and_parser_hygiene.json': 'ac78f8e2bdadd26f1f53bdc46fb3dde5ab3f466800de1fea53c558c4f5e3fbfb',
  'atlas_discovery_phase3_2_3a3_full_ssot_closure.json': '3f1dc5de4e25effc116e9ea3e0f101d8b5d4837e4356ed78d123e63f73a77956',
  'atlas_people_ai_source_advisor_shadow_v1.json': '277ef65619f993a3ebb1ace8b74f7ac93e61d3ed4536aed7b82db6295a13f514',
  'atlas_people_ai_advisor_value_proof_and_calibration.json': '1759f703e2d884a83cedb22791f9cb67b6675544ab91b501ebb6fe7d87080759',
  'atlas_people_source_to_motor_intelligence_v1.json': 'b3dd4a533f4f639d33379695ca49fdd217c4c8dd5ac484b6d23e3d0f4ccc3cfd',
  'atlas_general_source_map_foundation_v1.json': 'ef2887cca11f8c686a053765633dcedab86639ed7b1b906209d7e68a98d66b54',
  'atlas_external_source_intelligence_benchmark_v1.json': '41033fd83dbe75b5abb8d8458d4501a51589ce2acfb9f8da421dd6a755d33c7d',
  'atlas_external_source_intelligence_benchmark_v1_1_hardening.json': 'e87c516a2b1fe55e79d2bc518cc0cb09921909f39506a8eeafd093c5badad3d3',
  'atlas_people_reservoir_source_scout_and_complementarity_v1.json': 'cc488fa2cf912c1f9951b5c4d5db8ce57d458780ddeac3994010ba7c6bcb7150',
  'atlas_people_reservoir_union_and_million_readiness_v1.json': '3c7b570386f71bd2b4735c22097a6bb113fe433dd6896b391fadd89a2161611c',
  'atlas_people_reservoir_exact_overlap_and_final_readiness_v1.json': '303c4148022734b16e41df723940de7e1be7568d4908ff636a2f01a8aa6a9e03',
  'atlas_gate31_launch_preflight_v1.json': '877b27233159a49111ff31e425682632fa92bdadb13fecef197284e6cdbd93ad',
  'atlas_gate31_arca_topup_and_final_reauthorization_v1.json': '1c0b2ba0dac839416db23416450af3f580a97f797ba197b60fc377387e6c8e0d',
  'atlas_gate31_million_industrial_run_v1.json': '57e7fe2b9844bac7fcc469603c7d7bae1d40560680c2639b0b0be2f20341bf1a',
  'atlas_gate31_million_source_performance_v1.json': 'f4b1b54278f70f0774246b5f6a705431c7409cf9227da9fdeae4aeba1d3866eb',
  'atlas_gate31_million_timeline_v1.json': '377a7cf8b6ca8ed2baf5b7defa981dcf1e113a48a640991626df7e2ea347c822',
  'atlas_gate31_execution_authenticity_audit_v1.json': '55fd15f55464843cea91b50bfdc28683851cf6e227f5b428dc78501f704ffb4a',
  'atlas_gate31b_physical_million_industrial_run_v1.json': '8eedae477159df30e82c25976b0e6e20e65b6a35236a44b83261e36bafab4a21',
  'atlas_gate31b_physical_source_performance_v1.json': '471a22f45ed71c632dcc41748172930e7f1068bcb5448d07ca7cd7c90c0006df',
  'atlas_gate31b_physical_timeline_v1.json': '280ebf4aa35f709ff11a4db4ba87a584946cd950bf3416bee9d2ff97262ccc2a',
  'atlas_gate31b_network_receipts_v1.json': 'fa91057c2c109cc3ac33f76fd344f210825953ec7a051043fe6f9443cd6bd781',
  'atlas_gate31b_ledger_audit_v1.json': '863f96f7b0f827f7e32025f183eae7a59443f04a7717aae43e6bbe1d235be771',
  'atlas_gate31b_search_shadow_audit_v1.json': 'b670ee909a15948bba87363d60a1a2a2697aaccadde00dc79ffc71ac8c3a2d84',
  'atlas_gate31c_physical_source_access_recovery_v1.json': 'f0c53fe2641d98bcca8cd857032a4051bb2a840d95bffc948b3dea3f182c0947',
  'atlas_gate31c_source_access_receipts_v1.json': '029f2a8dcc085828ffa036346d9949ad8e55297cae0136325d5793392b6b370f',
  'atlas_gate31c_arca_physical_canary_v1.json': 'a7f5fb974eaffcacef4bccb8686b45b322247265d714ac452c3adede05c6562d',
  'atlas_gate31c_physical_100k_mini_run_v1.json': '84a7e9112757a3fbeebf67987a55d4aac9f51512eceb4ff22d6cf5d51104fed3',
  'atlas_gate31d_physical_million_run_v1.json': '90dd2e78ad400b428fc2c49ef82147bf7f56b8974848eff15de7ed206600d030',
  'atlas_gate31d_physical_timeline_v1.json': '343aee85b3194df2bc952ef051d0e44b64ebec4528571f4d312af265189e0718',
  'atlas_gate31d_source_receipts_v1.json': '1e3c1af47e13a358038c2f9eb2c020f2f62ed08b42cd87eec0431a4542fd76b4',
  'atlas_gate31d_identity_outcomes_v1.json': 'f88517d539a019775adc5663ccdd25a33667aaf667ea367624e96490c2aa5c30',
  'atlas_gate31d_ledger_audit_v1.json': 'f2156859fa073b78909d7e80994c86131d73c9607815f50c7da40a58874f0d29',
  'atlas_gate31d_search_shadow_audit_v1.json': 'bafe5dbfdb315dce508798b1da6140bf11e07b7777a65d70bb46ea10b34bf1b0',
  'atlas_gate31d_resource_usage_v1.json': '7afe0aad7c18a6c15f803a1a7aae39485969eb5114ea114807b5063368df4836',
  'atlas_gate32_production_control_plane_certification_v1.json': 'ec0c7b15f4102a0e9812ed8b75b536ae947d83ebfe4eb6059c7e5f5bcfec1e44',
  'atlas_source_snapshot_registry_v1.json': '8fb50027c8b50a81f71e7376496511b104bfe86365960d343b415d6d0a5c0e79',
  'atlas_gate32_change_detection_audit_v1.json': '9c499a617e7d899a281a5503903c1d755cc8d1e000c07f0948a3c75e64251dc7',
  'atlas_gate32_10k_production_canary_audit_v1.json': 'df706a25b56f8f60b2afbe81df47d4c9f5dc0f4fda066c5afbda747d63ae608d',
  'atlas_gate32_idempotency_and_recovery_audit_v1.json': '3c4bb489662f52971c6d00cf24921d5ca4bf7fd33ccf18eec21bbb3e66926264',
  'atlas_gate32a_end_to_end_delivery_certification_v1.json': 'f5e8b7dc60a04b720766863219371eeb7ea0e5899885736224b21b114b4c96c4',
  'atlas_gate32a_outbox_delivery_audit_v1.json': 'a41f295fdbd3d28f18d776f431938ad323e5c712887af5166f5b767dac42affd',
  'atlas_gate32a_search_delta_parity_v1.json': '224d123a7029d89e2b89634a06e259fc1050e7070f583adc5e54ad3ef0c84f6f',
  'atlas_gate32a_snapshot_durability_audit_v1.json': '36f33defb07e15d0389ff4d71332a48edc57eac457ab380dde6c491441e6f403',
  'atlas_gate32a_crash_recovery_audit_v1.json': '74db15611867e27579829a1c8ca0e0ed379116f27db0b5524a3949a5bc2107dc',
  'atlas_gate32a_atomicity_failure_injection_v1.json': '0be636d5f6ba468622b33ba0961baa99123da4838f57ef22dc3fa0ce875ebbcc',
  'atlas_gate32b_production_stability_certification_v1.json': '27f811fb862cb0f8f31c5b500c181f9c5b575dc585047e57d1094e13c3c52ed7',
  'atlas_gate32b_outbox_forensics_v1.json': '952d0a8b2df0f8d8b18ed90c750340c5af4cfd41d0247d27b2def56d4f640603',
  'atlas_gate32b_queue_health_v1.json': '7d9ae319fd9f751a1997a4244cf9bf7b5297134d6c3012212a41c3d23b239be1',
  'atlas_gate32b_publisher_capacity_v1.json': '55cbe044bbcdd133c9dfa25474ca5ef8f4f24c33cf795b35d425493b2acb27d9',
  'atlas_gate32b_snapshot_registry_concurrency_v1.json': 'c50b6cd775a103e6ca31889fbbaf00ae42b22974f31cf95502588399152d9b79',
  'atlas_gate32b_checkpoint_durability_v1.json': '8affb4f02d39e71e00b95229a62ffc022138ceef9485e85df64a5175a7c56eb4',
  'atlas_gate32c_search_queue_equilibrium_v1.json': '97dc59150aa0ea9e561becd1457f6eb775bb1c70d5d5624b2ce02c6763b32daa',
  'atlas_gate32c_publisher_scaling_benchmark_v1.json': 'd549b0ebbb60998b606ccae0f5f2e9a542a86a7c7003ccabf3963f13c67738e4',
  'atlas_gate32c_backpressure_validation_v1.json': '0acb9095f12fa6caceba6af464b2dce1276b01facbfa4f950e3d5c5df04eb0df',
  'atlas_gate32c_queue_drain_audit_v1.json': '5d6cb9bfc298c2141108b33caa8276d9fe80f0211e9e1540bfe551697009b296',
  'atlas_gate32c_stage2_launch_parameters_v1.json': 'ce72c454ccf2348ceebc3f4b8c25856d1b49aef04c73b86d15b35e11597f8366',
  'atlas_property_registry_source_map_v1.json': '6c4c04759be201dce8b8822f66a7812933978bdafc82c357bb78f1c457613682',
  'atlas_property_registry_access_matrix_v1.json': '011f31ce3036f75aa1e0eaef3a57ff03fce9c443b7ea51b80abbea44aa00281a',
  'atlas_property_registry_policy_matrix_v1.json': '9e20cae89fc186c9b3eaf141ad8f2cae75cb5438288d253423315b739817a56f',
  'atlas_property_registry_canary_plan_v1.json': 'dd195b744aff4619832cb054ceaf5fe31932eb65fbbafc20bfd05bda77e16edf',
  'atlas_stage2_50k_production_run_v1.json': '5ff80b8c8a8fa9d3259653f86b686bcc0954307c2ff70d6d5e29ece465e6f1a7',
  'atlas_stage2_identity_reconciliation_v1.json': '6c9b9573a2aac7ab34b89c584d8ed446621f23fda0b4cc4239b5e462d1dd316c',
  'atlas_stage2_outbox_reconciliation_v1.json': '7c2bdf8abcc135debfc031b175d80adde62e5be5aa38bfbc2609d129b91100df',
  'atlas_stage2_search_delivery_v1.json': '62a2133b54d1e1dbff39ae6eb49691d7233bb77c834d844b10e01ce3b5b5e7d0',
  'atlas_stage2_queue_equilibrium_v1.json': 'a254c7c2e1e4063a99f8e1030f9ea6170ef3a6bf3910a46981f1034dc23ac246',
  'atlas_stage2_backpressure_timeline_v1.json': '8105e2639aa36fe7957d05bf0f195c59175b1a7ff2c9d538fc62956e1caccefa',
  'atlas_stage2_checkpoint_recovery_v1.json': 'cf317f32f72007613acd701d840a6c5efc69f6d54a161de16731c2257cbbc349',
  'atlas_stage2a_execution_lineage_audit_v1.json': 'dc378e2dd455f1d03a7c12a9d235609f0d4ab2e95ee1ffe700b27b8886c639a5',
  'atlas_stage2a_candidate_coverage_audit_v1.json': '9f512ad71add60f0f837c131db053b71d30c79de0134301445ed57c8bc067234',
  'atlas_stage2a_stage1_stage2_overlap_audit_v1.json': '14c2f3e55a065af089e6c4d18b7123125509b9dedf6149d4f0c2539a562e4fe6',
  'atlas_stage2a_checkpoint_lineage_v1.json': '4ab50c0a368bd25f1860d6d05b8e21e3c59377aeae2752373e96d4b87fa19f08',
  'atlas_stage2a_database_timestamp_audit_v1.json': '515299622481ad0787b809b080670bd6a552e309e4dfa586992c555e77ef315a',
  'atlas_stage2a_search_lineage_audit_v1.json': 'c0e2a3c7a5e8a0d71d38614b41ff8b82201930e64947622b5f5880556a93dcf4'
};

let allValid = true;
for (const [file, expected] of Object.entries(EXPECTED_HASHES)) {
  const filePath = path.join(REPORTS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${file}`);
    allValid = false;
    continue;
  }
  const content = fs.readFileSync(filePath);
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  if (actual === expected) {
    console.log(`PASS: ${file} matches (${actual.slice(0, 12)}...)`);
  } else {
    console.error(`FAIL: ${file} MISMATCH!\n  Expected: ${expected}\n  Actual:   ${actual}`);
    allValid = false;
  }
}

const EXPECTED_SEARCH_V1_MANIFEST_SHA256 = 'f4347cfbc1d554c2f015cf56b1e854fc09fa226e30611fe5aa55c62941c10128';

function verifySearchV1DirectoryManifest(dirPath) {
  const fileEntries = [];
  function scanDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(currentDir, ent.name);
      if (ent.isDirectory()) scanDir(fullPath);
      else if (ent.isFile()) {
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        fileEntries.push({
          relative_path: relPath,
          size_bytes: stat.size,
          last_write_time: stat.mtime.toISOString(),
          last_write_ms: stat.mtimeMs,
        });
      }
    }
  }
  scanDir(dirPath);
  fileEntries.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  const manifestString = JSON.stringify(fileEntries, null, 2);
  const manifestSha = crypto.createHash('sha256').update(manifestString).digest('hex');
  return {
    valid: manifestSha.toLowerCase() === EXPECTED_SEARCH_V1_MANIFEST_SHA256.toLowerCase(),
    file_count: fileEntries.length,
    total_bytes: fileEntries.reduce((s, f) => s + f.size_bytes, 0),
    manifest_sha256: manifestSha,
  };
}

// Check certified shadow index via recursive manifest
const SHADOW_PATH = path.resolve(ROOT_DIR, 'data_v2_shadow.ms');
if (fs.existsSync(SHADOW_PATH)) {
  const manifest = verifySearchV1DirectoryManifest(SHADOW_PATH);
  console.log(`\nSEARCH_V1 PRE-FLIGHT AUDIT:`);
  console.log(`  SEARCH_V1_RECURSIVE_FILE_COUNT:         ${manifest.file_count}`);
  console.log(`  SEARCH_V1_RECURSIVE_TOTAL_BYTES:        ${manifest.total_bytes.toLocaleString()} bytes`);
  console.log(`  SEARCH_V1_RECURSIVE_MANIFEST_SHA256:    ${manifest.manifest_sha256}`);
  console.log(`  SEARCH_V1_DIRECTORY_MANIFEST_UNCHANGED: ${manifest.valid ? 'TRUE ✅' : 'FAIL ❌'}`);
  if (!manifest.valid) {
    allValid = false;
  }
} else {
  console.error(`MISSING SHADOW DIRECTORY: ${SHADOW_PATH}`);
  allValid = false;
}

console.log(`\nALL_CERTIFICATIONS_VALID: ${allValid}`);
