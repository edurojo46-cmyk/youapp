import 'dotenv/config';
import { supabaseAdmin as supabase } from '../src/lib/supabaseAdmin';
import crypto from 'node:crypto';

async function mapGcbaToCaba() {
    console.log("=== ATLAS PEOPLE PROJECTOR ===");

    // 1. Get CABA geography_id
    const { data: caba } = await supabase.from('atlas_geographies')
        .select('geography_id, name')
        .eq('geography_type', 'AUTONOMOUS_CITY')
        .limit(1)
        .single();
    
    if (!caba) throw new Error("CABA geography_id not found!");
    const cabaId = caba.geography_id;

    // 2. Fetch all GCBA and Org Observations
    let allObs: any[] = [];
    let page = 0;
    while (true) {
        const { data: obs } = await supabase.from('atlas_person_observations')
            .select('*').range(page * 1000, (page + 1) * 1000 - 1);
        if (!obs || obs.length === 0) break;
        allObs = allObs.concat(obs);
        page++;
    }
        
    console.log(`Loaded ${allObs.length} total observations.`);

    let projectedRows = 0;
    
    // Chunk processing
    const chunkSize = 50;
    for (let i = 0; i < allObs.length; i += chunkSize) {
        const chunk = allObs.slice(i, i + chunkSize);
        
        await Promise.all(chunk.map(async (o) => {
        const source_id = o.source_id;
        const record_id = o.source_record_id;
        const subject_external_key = o.subject_external_key || record_id;

        // PROJECTOR_PERFORMS_IDENTITY_RESOLUTION = NO
        // Projector consumes pre-resolved subject_id
        let subject_id: string;
        
        const { data: resolvedSub } = await supabase.from('atlas_observation_subjects')
            .select('subject_id')
            .eq('source_id', source_id)
            .eq('subject_external_key', subject_external_key)
            .limit(1)
            .single();
            
        if (resolvedSub) {
            subject_id = resolvedSub.subject_id;
        } else {
            // If missing, this observation wasn't resolved by the ingestion layer. Skip projection.
            // Or fallback for non-IGJ legacy sources:
            if (source_id !== 'DATOS_ARGENTINA_IGJ_AUTHORITIES') {
                const hash = crypto.createHash('md5').update(`SUBJECT:${source_id}:${subject_external_key}`).digest('hex');
                subject_id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20)}`;
                
                await supabase.from('atlas_observation_subjects').upsert({
                    subject_id,
                    source_id,
                    subject_external_key,
                    identity_status: 'VERIFIED',
                    first_seen_at: o.first_seen_at,
                    last_seen_at: o.last_seen_at
                }, { onConflict: 'source_id,subject_external_key' });
            } else {
                return; // Wait for identity resolver
            }
        }

        // B. Upsert Geography (Only for GCBA)
        let geography_id = null;
        let relation_type = null;
        
        if (source_id === 'gcba_open_data_funcionarios') {
            geography_id = cabaId;
            relation_type = 'PUBLIC_ROLE_IN';
            
            await supabase.from('atlas_subject_geographies').upsert({
                subject_id,
                geography_id,
                relation_type,
                evidence_observation_id: o.id,
                source_id,
                verification_status: 'VERIFIED',
                confidence: 1.0,
                observed_at: o.observed_at
            }, { onConflict: 'subject_id,geography_id,relation_type' });
        }

        // C. Upsert inline Social Profiles (if any exist in the payload from old harvesters)
        if (o.value_jsonb?.social_profiles) {
            for (const sp of o.value_jsonb.social_profiles) {
                if (sp.status === 'VERIFIED') {
                    await supabase.from('atlas_subject_social_profiles').upsert({
                        subject_id,
                        platform_id: sp.platform,
                        profile_url: sp.url,
                        identity_status: 'VERIFIED',
                        source_id,
                        source_record_id: record_id,
                        evidence_observation_id: o.id,
                        observed_at: o.observed_at
                    }, { onConflict: 'subject_id,platform_id,profile_url' });
                }
            }
        }
        
        // Fetch ALL VERIFIED social profiles from the database to build the projection array
        const { data: dbSocials } = await supabase.from('atlas_subject_social_profiles')
            .select('platform_id, profile_url')
            .eq('subject_id', subject_id)
            .eq('identity_status', 'VERIFIED');
            
        const socials: any[] = [];
        if (dbSocials) {
            for (const sp of dbSocials) {
                socials.push({
                    platform: sp.platform_id,
                    url: sp.profile_url,
                    status: 'VERIFIED'
                });
            }
        }

        // D. Project into Search Projection
        const display_name = o.value_jsonb?.name || o.value_jsonb?.display_name || o.value_jsonb?.nombre_completo || 'Unknown';
        const role = o.value_jsonb?.cargo || o.value_jsonb?.role || o.value_jsonb?.employmentEvidence?.relation || null;
        const organization = o.value_jsonb?.reparticion || o.value_jsonb?.organization || o.value_jsonb?.company || null;
        const profession = o.value_jsonb?.profesion || o.value_jsonb?.profession || null;

        let age_evidence_type = 'UNKNOWN';
        let age_min_current = null;
        let age_max_current = null;
        let birth_date = null;
        let birth_year = null;
        let reported_age = null;
        let reported_age_observed_at = null;

        const d = o.value_jsonb || {};
        if (d.birth_date) {
            birth_date = d.birth_date;
            age_evidence_type = 'EXACT_DOB';
            const bd = new Date(birth_date);
            const now = new Date();
            let age = now.getFullYear() - bd.getFullYear();
            if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) {
                age--;
            }
            age_min_current = age;
            age_max_current = age;
        } else if (d.birth_year) {
            birth_year = parseInt(d.birth_year);
            age_evidence_type = 'BIRTH_YEAR';
            const currentYear = new Date().getFullYear();
            age_max_current = currentYear - birth_year;
            age_min_current = age_max_current - 1;
        } else if (d.age) {
            reported_age = parseInt(d.age);
            reported_age_observed_at = o.observed_at;
            age_evidence_type = 'REPORTED_AGE';
            const elapsedYears = new Date().getFullYear() - new Date(reported_age_observed_at).getFullYear();
            age_min_current = reported_age + elapsedYears;
            age_max_current = reported_age + elapsedYears + 1;
        }

        let person_category = null;
        if (source_id === 'gcba_open_data_funcionarios') {
            person_category = 'PUBLIC_EMPLOYEE';
        }

        let normalized_profession_id = null;
        let profession_status = 'UNKNOWN';
        
        const rawRole = (role || profession || '').toLowerCase();
        if (rawRole.includes('abogado') || rawRole.includes('abogada')) {
            normalized_profession_id = 'LAWYER';
            profession_status = 'KNOWN';
        } else if (rawRole.includes('médico') || rawRole.includes('medico') || rawRole.includes('médica') || rawRole.includes('medica')) {
            normalized_profession_id = 'DOCTOR';
            profession_status = 'KNOWN';
        } else if (rawRole.includes('psicólogo') || rawRole.includes('psicologa') || rawRole.includes('psicología')) {
            normalized_profession_id = 'PSYCHOLOGIST';
            profession_status = 'KNOWN';
        } else if (rawRole.includes('empresario')) {
            normalized_profession_id = 'BUSINESS_PERSON';
            profession_status = 'KNOWN';
        }

        let public_email = o.value_jsonb?.email && o.value_jsonb.email !== 'UNKNOWN' ? o.value_jsonb.email : null;
        let public_phone = o.value_jsonb?.phone && o.value_jsonb.phone !== 'UNKNOWN' ? o.value_jsonb.phone : null;
        let personal_web = o.value_jsonb?.personal_web && o.value_jsonb.personal_web !== 'UNKNOWN' ? o.value_jsonb.personal_web : null;
        
        await supabase.from('atlas_argentina_people_search_projection_v1').upsert({
            subject_id,
            origin_type: 'OBSERVATION_ONLY',
            display_name,
            role,
            organization,
            person_category,
            profession,
            normalized_profession_id,
            profession_status,
            age_evidence_type,
            age_min_current,
            age_max_current,
            birth_date,
            birth_year,
            reported_age,
            reported_age_observed_at,
            geography_id,
            geography_name: geography_id === cabaId ? caba.name : null,
            relation_type,
            social_profiles: socials,
            public_email,
            public_phone,
            personal_web,
            source_id,
            source_url: o.source_url || o.value_jsonb?.source_url,
            observed_at: o.observed_at,
            last_seen_at: o.last_seen_at,
            verification_status: 'VERIFIED'
        });
        
        projectedRows++;
        }));
        
        console.log(`Projected ${projectedRows} rows...`);
    }

    console.log(`Completed projecting ${projectedRows} subjects.`);
}

mapGcbaToCaba().catch(console.error);
