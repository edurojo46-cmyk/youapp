import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasPersonDataCoverageV2Engine } from '../src/lib/search/discovery/AtlasPersonDataCoverageV2';

async function runCoverageAudit() {
  console.log('================================================================');
  console.log('ATLAS PERSON DATA COVERAGE V2 & 1.5M PROFILE RICHNESS AUDIT');
  console.log('PRINCIPLE: MEASURE BEFORE ENRICH (ZERO EXTERNAL ENRICHMENT)');
  console.log('AUTHORITATIVE BASELINE: 1,500,351 UNIQUE ARGENTINE INDIVIDUALS');
  console.log('================================================================\n');

  const engine = new AtlasPersonDataCoverageV2Engine();
  const masterReport = engine.computeMasterCoverage();

  const reportsDir = path.resolve('reports/atlas/people');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 1. atlas_person_data_coverage_v2_report.json
  const mainReportPath = path.join(reportsDir, 'atlas_person_data_coverage_v2_report.json');
  fs.writeFileSync(mainReportPath, JSON.stringify(masterReport, null, 2), 'utf-8');
  console.log(`✓ 1. Master Coverage Report saved to: ${mainReportPath}`);

  // 2. atlas_contact_coverage_report.json
  const contactReportPath = path.join(reportsDir, 'atlas_contact_coverage_report.json');
  fs.writeFileSync(contactReportPath, JSON.stringify({
    report_title: 'ATLAS CONTACT COVERAGE AUDIT (1.5M UNIVERSE)',
    timestamp: masterReport.audit_timestamp,
    authoritative_persons: masterReport.authoritative_baseline.argentina_unique_persons,
    contact_coverage: masterReport.contact_coverage
  }, null, 2), 'utf-8');
  console.log(`✓ 2. Contact Coverage Report saved to: ${contactReportPath}`);

  // 3. atlas_profile_completeness_distribution.json
  const completenessReportPath = path.join(reportsDir, 'atlas_profile_completeness_distribution.json');
  fs.writeFileSync(completenessReportPath, JSON.stringify({
    report_title: 'ATLAS PROFILE COMPLETENESS & RICHNESS SCORE DISTRIBUTION',
    timestamp: masterReport.audit_timestamp,
    authoritative_persons: masterReport.authoritative_baseline.argentina_unique_persons,
    strategic_dual_axis: masterReport.strategic_dual_axis,
    distribution: masterReport.profile_completeness_distribution
  }, null, 2), 'utf-8');
  console.log(`✓ 3. Profile Completeness Distribution saved to: ${completenessReportPath}`);

  // 4. atlas_coverage_by_source.json
  const sourceCoverageReportPath = path.join(reportsDir, 'atlas_coverage_by_source.json');
  fs.writeFileSync(sourceCoverageReportPath, JSON.stringify({
    report_title: 'ATLAS COVERAGE & ATTRIBUTE YIELD BY CONTRIBUTING SOURCE (28 SOURCES)',
    timestamp: masterReport.audit_timestamp,
    total_sources: masterReport.coverage_by_source.length,
    sources: masterReport.coverage_by_source
  }, null, 2), 'utf-8');
  console.log(`✓ 4. Coverage By Source Report saved to: ${sourceCoverageReportPath}`);

  // 5. atlas_coverage_by_sector.json
  const sectorCoverageReportPath = path.join(reportsDir, 'atlas_coverage_by_sector.json');
  fs.writeFileSync(sectorCoverageReportPath, JSON.stringify({
    report_title: 'ATLAS COVERAGE MATRIX BY SECTOR (1.5M UNIVERSE)',
    timestamp: masterReport.audit_timestamp,
    sectors: masterReport.coverage_by_sector
  }, null, 2), 'utf-8');
  console.log(`✓ 5. Coverage By Sector Report saved to: ${sectorCoverageReportPath}`);

  // 6. atlas_enrichment_gap_report.json
  const gapReportPath = path.join(reportsDir, 'atlas_enrichment_gap_report.json');
  fs.writeFileSync(gapReportPath, JSON.stringify({
    report_title: 'ATLAS ENRICHMENT GAP & OPPORTUNITY AUDIT (MEASURE ONLY)',
    timestamp: masterReport.audit_timestamp,
    authoritative_persons: masterReport.authoritative_baseline.argentina_unique_persons,
    enrichment_opportunities: masterReport.enrichment_opportunities,
    top_10_data_gaps: masterReport.top_10_data_gaps
  }, null, 2), 'utf-8');
  console.log(`✓ 6. Enrichment Gap Report saved to: ${gapReportPath}`);

  console.log('\n================================================================');
  console.log('COVERAGE V2 AUDIT SUMMARY:');
  console.log(`- ARGENTINA_UNIQUE_PERSONS:                          ${masterReport.authoritative_baseline.argentina_unique_persons.toLocaleString()}`);
  console.log(`- WITH_STRONG_IDENTITY_ANCHOR:                      ${masterReport.coverage_matrix_global.find(c => c.field.includes('Fuerte'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Fuerte'))?.percentage}%)`);
  console.log(`- WITH_ORGANIZATION:                                 ${masterReport.coverage_matrix_global.find(c => c.field === 'Organización')?.count.toLocaleString()} (100%)`);
  console.log(`- WITH_JOB_TITLE:                                    ${masterReport.coverage_matrix_global.find(c => c.field.includes('Cargo'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Cargo'))?.percentage}%)`);
  console.log(`- WITH_PROFESSION:                                   ${masterReport.coverage_matrix_global.find(c => c.field.includes('Profesión'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Profesión'))?.percentage}%)`);
  console.log(`- WITH_PROVINCE:                                     ${masterReport.coverage_matrix_global.find(c => c.field === 'Provincia')?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field === 'Provincia')?.percentage}%)`);
  console.log(`- UNIQUE_PEOPLE_WITH_VERIFIED_PUBLIC_EMAIL:          ${masterReport.contact_coverage.unique_people_with_verified_public_email.toLocaleString()} (${masterReport.contact_coverage.email_coverage_percent}%)`);
  console.log(`- TOTAL_VERIFIED_PUBLIC_EMAILS:                      ${masterReport.contact_coverage.total_verified_public_emails.toLocaleString()}`);
  console.log(`- UNIQUE_PEOPLE_WITH_VERIFIED_PUBLIC_PHONE:          ${masterReport.contact_coverage.unique_people_with_verified_public_phone.toLocaleString()} (${masterReport.contact_coverage.phone_coverage_percent}%)`);
  console.log(`- WITH_VERIFIED_SOCIAL:                              ${masterReport.coverage_matrix_global.find(c => c.field.includes('Alguna Red'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Alguna Red'))?.percentage}%)`);
  console.log(`- WITH_VERIFIED_PHOTO:                               ${masterReport.coverage_matrix_global.find(c => c.field.includes('Foto'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Foto'))?.percentage}%)`);
  console.log(`- WITH_BIRTH_DATA:                                   ${masterReport.coverage_matrix_global.find(c => c.field.includes('Nacimiento'))?.count.toLocaleString()} (${masterReport.coverage_matrix_global.find(c => c.field.includes('Nacimiento'))?.percentage}%)`);
  console.log(`- RICH_PROFILES (≥8 attr, ≥4 dim):                  ${masterReport.profile_completeness_distribution.rich_profiles.toLocaleString()} (${masterReport.profile_completeness_distribution.rich_percentage}%)`);
  console.log(`- MEDIUM_PROFILES (5-7 attr):                        ${masterReport.profile_completeness_distribution.medium_profiles.toLocaleString()} (${masterReport.profile_completeness_distribution.medium_percentage}%)`);
  console.log(`- BASIC_PROFILES (3-4 attr):                         ${masterReport.profile_completeness_distribution.basic_profiles.toLocaleString()} (${masterReport.profile_completeness_distribution.basic_percentage}%)`);
  console.log(`- MINIMAL_PROFILES (1-2 attr):                       ${masterReport.profile_completeness_distribution.minimal_profiles.toLocaleString()} (${masterReport.profile_completeness_distribution.minimal_percentage}%)`);
  console.log(`- AVERAGE_VERIFIED_ATTRIBUTES_PER_PERSON:            ${masterReport.strategic_dual_axis.depth_average_verified_attributes_per_person}`);
  console.log(`- VERIFIED_ATTRIBUTE_DENSITY:                       ${masterReport.strategic_dual_axis.verified_attribute_density_percentage}%`);
  console.log('================================================================');
}

runCoverageAudit().catch(err => {
  console.error('Fatal error running coverage audit:', err);
  process.exit(1);
});
