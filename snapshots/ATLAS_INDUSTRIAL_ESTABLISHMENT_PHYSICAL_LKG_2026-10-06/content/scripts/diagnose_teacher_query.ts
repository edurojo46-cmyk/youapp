/**
 * scripts/diagnose_teacher_query.ts
 *
 * Step 8 — Teacher Query Diagnostic
 *
 * Runs all teacher-related queries through the Atlas search stack and
 * reports routing, normalized profession, geography, matching subjects,
 * and whether a source-coverage gap exists.
 *
 * Run: npx tsx scripts/diagnose_teacher_query.ts
 */
import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = path.resolve('reports/atlas/people');

// All profession IDs that map to TEACHER-like professions in the Atlas taxonomy
const TEACHER_PROFESSION_IDS = [
  'TEACHER', 'MAESTRA', 'MAESTRO', 'DOCENTE', 'PROFESOR', 'PROFESORA',
  'PRIMARY_TEACHER', 'SECONDARY_TEACHER', 'UNIVERSITY_PROFESSOR',
  'EDUCATOR', 'EDUCATION_PROFESSIONAL',
];

// CABA geography_id — we query by name to avoid hardcoding the UUID
async function getCabaGeographyId(): Promise<string | null> {
  const { data } = await db
    .from('atlas_geographies')
    .select('geography_id')
    .ilike('name', '%ciudad autónoma de buenos aires%')
    .limit(1)
    .single();
  if (data) return data.geography_id;

  // Fallback: try short name
  const { data: d2 } = await db
    .from('atlas_geographies')
    .select('geography_id')
    .ilike('name', 'caba')
    .limit(1)
    .single();
  return d2?.geography_id || null;
}

async function run() {
  console.log('=== TEACHER QUERY DIAGNOSTIC ===\n');

  const cabaId = await getCabaGeographyId();
  console.log(`CABA geography_id = ${cabaId ?? 'NOT FOUND'}`);

  if (!cabaId) {
    console.error('Could not find CABA geography. Check atlas_geographies table.');
  }

  // 1. Count all teacher-category subjects in the projection (regardless of location)
  const { data: allTeachers, error: atErr } = await db
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id', { count: 'exact', head: false })
    .in('normalized_profession_id', TEACHER_PROFESSION_IDS);

  // 2. Count all teacher-category subjects with TEACHER person_category
  const { count: teacherCategoryCount } = await db
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id', { count: 'exact', head: true })
    .eq('person_category', 'TEACHER');

  // 3. Count teachers with CABA geography
  let cabaTeacherCount = 0;
  if (cabaId) {
    const { count } = await db
      .from('atlas_argentina_people_search_projection_v1')
      .select('subject_id', { count: 'exact', head: true })
      .in('normalized_profession_id', TEACHER_PROFESSION_IDS)
      .eq('geography_id', cabaId);
    cabaTeacherCount = count ?? 0;
  }

  // 4. Count subjects with role text containing teacher keywords (raw role field)
  const teacherRoleKeywords = ['maestro', 'maestra', 'docente', 'profesor', 'profesora'];
  let roleMatchCount = 0;
  for (const kw of teacherRoleKeywords) {
    const { count } = await db
      .from('atlas_argentina_people_search_projection_v1')
      .select('subject_id', { count: 'exact', head: true })
      .ilike('role', `%${kw}%`);
    roleMatchCount += (count ?? 0);
  }

  // 5. Count total subjects in projection for context
  const { count: totalSubjects } = await db
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id', { count: 'exact', head: true });

  // 6. Sample a few teacher-role subjects to verify routing
  const { data: sampleRoleMatches } = await db
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id, display_name, role, normalized_profession_id, person_category, geography_name')
    .or(teacherRoleKeywords.map(k => `role.ilike.%${k}%`).join(','))
    .limit(5);

  const allTeacherCount = allTeachers?.length ?? 0;

  // Build diagnosis
  const teacherSourceCoverageGap =
    (allTeacherCount === 0 && (roleMatchCount === 0) && teacherCategoryCount === 0);

  const report = {
    generated_at: new Date().toISOString(),
    CABA_GEOGRAPHY_ID: cabaId,
    TOTAL_SUBJECTS_IN_PROJECTION: totalSubjects,
    // Via normalized_profession_id
    TEACHER_BY_NORMALIZED_PROFESSION: allTeacherCount,
    TEACHER_BY_PERSON_CATEGORY: teacherCategoryCount,
    // Via raw role text (not normalized — cannot be relied on for facets)
    TEACHER_BY_ROLE_TEXT_ILIKE: roleMatchCount,
    TEACHER_CABA_NORMALIZED: cabaTeacherCount,
    TEACHER_QUERY_ROUTING: allTeacherCount > 0 ? 'PASS' : 'FAIL — no normalized profession matches',
    TEACHER_CABA_CURRENT_COVERAGE: cabaTeacherCount,
    TEACHER_SOURCE_COVERAGE_GAP: teacherSourceCoverageGap,
    sample_role_matches: sampleRoleMatches,
    diagnosis: [] as string[],
  };

  if (allTeacherCount === 0 && roleMatchCount > 0) {
    report.diagnosis.push(
      `ROUTING_GAP: ${roleMatchCount} subjects have teacher keywords in raw 'role' field ` +
      `but ZERO have a normalized_profession_id in the TEACHER taxonomy. ` +
      `The profession normalizer is not mapping these roles to the TEACHER category.`
    );
  } else if (allTeacherCount === 0 && roleMatchCount === 0) {
    report.diagnosis.push(
      'SOURCE_COVERAGE_GAP: No teacher-related text found in any role field. ' +
      'Current sources (GCBA government staff) do not include teachers as a professional category. ' +
      'Education source expansion is required (school directories, Buenos Aires education ministry, etc.).'
    );
  } else {
    report.diagnosis.push(
      `${allTeacherCount} teachers found by normalized profession. ` +
      `CABA subset: ${cabaTeacherCount}. Routing appears functional.`
    );
  }

  // Write MD report
  const md = `# Teacher Query Diagnostic Report
Generated: ${report.generated_at}

## Results

| Metric | Value |
|---|---|
| CABA_GEOGRAPHY_ID | ${cabaId ?? 'NOT FOUND'} |
| TOTAL_SUBJECTS_IN_PROJECTION | ${totalSubjects} |
| TEACHER_BY_NORMALIZED_PROFESSION | ${allTeacherCount} |
| TEACHER_BY_PERSON_CATEGORY | ${teacherCategoryCount} |
| TEACHER_BY_ROLE_TEXT_ILIKE | ${roleMatchCount} |
| TEACHER_CABA_CURRENT_COVERAGE | ${cabaTeacherCount} |
| TEACHER_QUERY_ROUTING | ${report.TEACHER_QUERY_ROUTING} |
| TEACHER_SOURCE_COVERAGE_GAP | ${teacherSourceCoverageGap ? 'YES' : 'NO'} |

## Diagnosis

${report.diagnosis.map(d => `- ${d}`).join('\n')}

## Sample Role-Text Matches (raw, not normalized)

${sampleRoleMatches && sampleRoleMatches.length > 0
  ? sampleRoleMatches.map(s => `- **${s.display_name}** | role: ${s.role} | norm_prof: ${s.normalized_profession_id ?? 'null'} | category: ${s.person_category ?? 'null'} | geo: ${s.geography_name ?? 'null'}`).join('\n')
  : '(none)'}

## Interpretation

${allTeacherCount === 0 && roleMatchCount === 0
  ? `**TEACHER_SOURCE_COVERAGE_GAP = YES**\n\nCurrent Atlas corpus (GCBA government staff) does not include teachers. No weakening of profession filters is appropriate. Education source expansion is needed.`
  : allTeacherCount === 0 && roleMatchCount > 0
  ? `**ROUTING_GAP**: ${roleMatchCount} subjects mention teacher-related terms in their role text but are not mapped to the TEACHER profession in the normalized taxonomy. The ProfessionTaxonomy normalizer needs to add these role patterns.`
  : `**TEACHER_QUERY_ROUTING = PASS**. Found ${allTeacherCount} subjects with normalized TEACHER profession.`}
`;

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, 'teacher_query_report.md'), md);
  fs.writeFileSync(path.join(REPORTS_DIR, 'teacher_query_report.json'), JSON.stringify(report, null, 2));

  // Console
  console.log(`TEACHER_BY_NORMALIZED_PROFESSION = ${allTeacherCount}`);
  console.log(`TEACHER_BY_PERSON_CATEGORY       = ${teacherCategoryCount}`);
  console.log(`TEACHER_BY_ROLE_TEXT_ILIKE       = ${roleMatchCount} (raw, NOT normalized)`);
  console.log(`TEACHER_CABA_CURRENT_COVERAGE    = ${cabaTeacherCount}`);
  console.log(`TEACHER_QUERY_ROUTING            = ${report.TEACHER_QUERY_ROUTING}`);
  console.log(`TEACHER_SOURCE_COVERAGE_GAP      = ${teacherSourceCoverageGap ? 'YES' : 'NO'}`);
  console.log('');
  for (const d of report.diagnosis) console.log('DIAGNOSIS:', d);

  if (sampleRoleMatches && sampleRoleMatches.length > 0) {
    console.log('\nSample subjects with teacher keywords in role:');
    for (const s of sampleRoleMatches) {
      console.log(`  [${s.display_name}] role="${s.role}" norm_prof="${s.normalized_profession_id ?? 'null'}" category="${s.person_category ?? 'null'}"`);
    }
  }

  console.log('\nReports written to reports/atlas/people/teacher_query_report.*');
}

run().catch(e => { console.error(e); process.exit(1); });
