import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasEnrichmentCanaryRunner } from '../src/lib/search/enrichment/AtlasEnrichmentCanaryRunner';

async function main() {
  console.log('================================================================');
  console.log('ATLAS DEPTH ENRICHMENT V1 — EXECUTION');
  console.log('MEASURED, PUBLIC, VERIFIED, FAIL-CLOSED');
  console.log('BASELINE: 1,500,351 UNIQUE ARGENTINE INDIVIDUALS');
  console.log('================================================================\n');

  const runner = new AtlasEnrichmentCanaryRunner();
  const results = runner.runCanaryAndFullEnrichment();

  const reportsDir = path.resolve('reports/atlas/people');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Write all 7 mandatory reports
  fs.writeFileSync(path.join(reportsDir, 'atlas_depth_enrichment_canary_report.json'), JSON.stringify(results.canaryReport, null, 2), 'utf-8');
  console.log('✓ 1. Saved: reports/atlas/people/atlas_depth_enrichment_canary_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_attribute_yield_report.json'), JSON.stringify(results.attributeYieldReport, null, 2), 'utf-8');
  console.log('✓ 2. Saved: reports/atlas/people/atlas_attribute_yield_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_profile_promotion_report.json'), JSON.stringify(results.profilePromotionReport, null, 2), 'utf-8');
  console.log('✓ 3. Saved: reports/atlas/people/atlas_profile_promotion_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_contact_enrichment_report.json'), JSON.stringify(results.contactEnrichmentReport, null, 2), 'utf-8');
  console.log('✓ 4. Saved: reports/atlas/people/atlas_contact_enrichment_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_identity_corroboration_report.json'), JSON.stringify(results.identityCorroborationReport, null, 2), 'utf-8');
  console.log('✓ 5. Saved: reports/atlas/people/atlas_identity_corroboration_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_geography_depth_report.json'), JSON.stringify(results.geographyDepthReport, null, 2), 'utf-8');
  console.log('✓ 6. Saved: reports/atlas/people/atlas_geography_depth_report.json');

  fs.writeFileSync(path.join(reportsDir, 'atlas_depth_growth_report.json'), JSON.stringify(results.depthGrowthReport, null, 2), 'utf-8');
  console.log('✓ 7. Saved: reports/atlas/people/atlas_depth_growth_report.json');

  console.log('\n================================================================');
  console.log('DEPTH ENRICHMENT V1 SUMMARY:');
  console.log(`- ARGENTINA_UNIQUE_PERSONS:                          1,500,351`);
  console.log(`- AVERAGE_VERIFIED_ATTRIBUTES_PER_PERSON:            4.62 -> ${results.depthGrowthReport.dual_axis_summary.average_verified_attributes_after}`);
  console.log(`- VERIFIED_ATTRIBUTE_DENSITY:                       46.2% -> ${results.depthGrowthReport.dual_axis_summary.verified_attribute_density_after}%`);
  console.log(`- RICH_PROFILES:                                     72,016 -> ${results.depthGrowthReport.completeness_distribution.rich.count.toLocaleString()} (${results.depthGrowthReport.completeness_distribution.rich.percentage}%)`);
  console.log(`- MEDIUM_PROFILES:                                   385,590 -> ${results.depthGrowthReport.completeness_distribution.medium.count.toLocaleString()} (${results.depthGrowthReport.completeness_distribution.medium.percentage}%)`);
  console.log(`- BASIC_PROFILES:                                    979,425 -> ${results.depthGrowthReport.completeness_distribution.basic.count.toLocaleString()} (${results.depthGrowthReport.completeness_distribution.basic.percentage}%)`);
  console.log(`- MINIMAL_PROFILES:                                  63,320 -> ${results.depthGrowthReport.completeness_distribution.minimal.count.toLocaleString()} (${results.depthGrowthReport.completeness_distribution.minimal.percentage}%)`);
  console.log(`- VERIFIED_PUBLIC_EMAILS:                            62,514 -> ${results.depthGrowthReport.depth_growth_metrics.verified_emails_after.toLocaleString()}`);
  console.log(`- NORMALIZED_PROFESSIONS:                            412,596 -> ${results.depthGrowthReport.depth_growth_metrics.professions_after.toLocaleString()}`);
  console.log(`- GRANULAR_CITY_LOCALITY:                            980,229 -> ${results.depthGrowthReport.depth_growth_metrics.city_locality_after.toLocaleString()}`);
  console.log(`- MULTI_SOURCE_IDENTITY:                             358,174 -> ${results.depthGrowthReport.depth_growth_metrics.multi_source_after.toLocaleString()}`);
  console.log(`- VERIFIED_SOCIAL_PROFILES:                          48,210 -> ${results.depthGrowthReport.depth_growth_metrics.verified_social_after.toLocaleString()}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('Fatal error running depth enrichment V1:', err);
  process.exit(1);
});
