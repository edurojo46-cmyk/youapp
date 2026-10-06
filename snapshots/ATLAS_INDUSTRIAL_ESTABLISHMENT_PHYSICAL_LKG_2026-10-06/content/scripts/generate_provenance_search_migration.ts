import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const sourceFileV1 = path.join(migrationsDir, '20260908050000_atlas_person_observation_lifecycle_v1.sql');
const sourceFileAdmin = path.join(migrationsDir, '20260908043000_atlas_admin_global_search_v1.sql');
const destFile = path.join(migrationsDir, '20260908061000_atlas_person_search_provenance.sql');

let v1Content = fs.readFileSync(sourceFileV1, 'utf8');
let adminContent = fs.readFileSync(sourceFileAdmin, 'utf8');

// 1. Extract search_canonical_persons_v1
const v1Match = v1Content.match(/CREATE OR REPLACE FUNCTION public\.search_canonical_persons_v1\([\s\S]*?\$\$;/);
if (!v1Match) throw new Error('Could not find search_canonical_persons_v1');
let v1Func = v1Match[0];

// Inject the diagnostic param
v1Func = v1Func.replace('p_page_size INT DEFAULT 25', 'p_page_size INT DEFAULT 25,\n    p_diagnostic_include_synthetic BOOLEAN DEFAULT FALSE');

// Inject the filter into filtered_people
v1Func = v1Func.replace("AND p.lifecycle_stage = 'CANONICAL'", "AND p.lifecycle_stage = 'CANONICAL'\n          AND (p_diagnostic_include_synthetic = TRUE OR p.origin_type NOT IN ('TEST', 'BENCHMARK', 'SEED', 'DEMO'))");

// Re-add grants
v1Func += `\n
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM anon;
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM service_role;
GRANT EXECUTE ON FUNCTION public.search_canonical_persons_v1 TO authenticated;
`;

// 2. Extract search_admin_all_persons_v1
const adminMatch = adminContent.match(/CREATE OR REPLACE FUNCTION public\.search_admin_all_persons_v1\([\s\S]*?\$\$;/);
if (!adminMatch) throw new Error('Could not find search_admin_all_persons_v1');
let adminFunc = adminMatch[0];

// Inject the p_origin_type param
adminFunc = adminFunc.replace('p_page_size INT DEFAULT 25', 'p_page_size INT DEFAULT 25,\n    p_origin_type TEXT DEFAULT NULL');

// Add v_origin_type canonicalization
adminFunc = adminFunc.replace("v_status TEXT;", "v_status TEXT;\n    v_origin_type TEXT;");
const statusCanonicalization = `v_status := CASE
        WHEN p_status IS NULL OR TRIM(p_status) = '' OR TRIM(p_status) = 'ALL' OR TRIM(p_status) = 'TODOS'
        THEN NULL
        ELSE TRIM(p_status)
    END;`;

const originCanonicalization = `v_origin_type := CASE
        WHEN p_origin_type IS NULL OR TRIM(p_origin_type) = '' OR TRIM(p_origin_type) = 'ALL' OR TRIM(p_origin_type) = 'TODOS'
        THEN NULL
        ELSE TRIM(p_origin_type)
    END;`;

adminFunc = adminFunc.replace(statusCanonicalization, statusCanonicalization + '\n\n    ' + originCanonicalization);

// Inject the filter into filtered_people
const filterInjection = `(v_status IS NULL OR p.status::TEXT = v_status)
            -- Origin Type filter
            AND (
                v_origin_type IS NULL
                OR (v_origin_type = 'REALES' AND p.origin_type IN ('REAL_EXTERNAL', 'PUBLIC_API', 'MANUAL', 'IMPORT'))
                OR (v_origin_type = 'TEST / BENCHMARK' AND p.origin_type IN ('TEST', 'BENCHMARK'))
                OR (v_origin_type = 'SEED / DEMO' AND p.origin_type IN ('SEED', 'DEMO'))
                OR (v_origin_type = 'UNKNOWN' AND p.origin_type = 'UNKNOWN')
                OR p.origin_type::TEXT = v_origin_type
            )`;
adminFunc = adminFunc.replace("(v_status IS NULL OR p.status::TEXT = v_status)", filterInjection);

// Include both in new migration file
const finalSql = `-- 20260908061000_atlas_person_search_provenance.sql

-- Updates canonical and admin search RPCs to incorporate provenance filtering.
-- Business search natively filters out synthetic data. Admin search exposes an explicit parameter.

${v1Func}

${adminFunc}

REVOKE ALL ON FUNCTION public.search_admin_all_persons_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_admin_all_persons_v1 FROM anon;
REVOKE ALL ON FUNCTION public.search_admin_all_persons_v1 FROM service_role;
GRANT EXECUTE ON FUNCTION public.search_admin_all_persons_v1 TO authenticated;
`;

fs.writeFileSync(destFile, finalSql);
console.log('Migration generated at:', destFile);
