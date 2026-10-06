import 'dotenv/config';
import { supabaseAdmin as supabase } from '../src/lib/supabaseAdmin';
import { SocialProfileDiscoveryService } from '../src/lib/social/SocialProfileDiscoveryService';

async function runPilot() {
  console.log("=== ATLAS SOCIAL DISCOVERY PILOT ===");

  // 1. Select 100 strongest subjects
  const { data: subjects, error } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('subject_id, display_name, organization, role')
    .not('organization', 'is', null)
    .not('role', 'is', null)
    .limit(20);

  if (error || !subjects) {
    console.error("Failed to fetch subjects:", error);
    return;
  }

  console.log(`Found ${subjects.length} eligible subjects for the pilot.`);

  const CONCURRENCY_LIMIT = 1;
  let activePromises = [];
  let completed = 0;
  
  let totalCandidates = 0;
  let totalVerified = 0;

  for (let i = 0; i < subjects.length; i++) {
    const sub = subjects[i];
    console.log(`[${i+1}/${subjects.length}] Enqueuing discovery for: ${sub.display_name} - ${sub.role} at ${sub.organization}`);
    
    // Create a promise for this subject
    const p = SocialProfileDiscoveryService.discoverForSubject(sub.subject_id).then(verified => {
        totalVerified += verified.length;
        console.log(`  -> Completed ${sub.display_name}: Found ${verified.length} VERIFIED profiles.`);
        completed++;
    }).catch(err => {
        console.error(`  -> Failed for ${sub.display_name}`, err);
    });
    
    activePromises.push(p);

    if (activePromises.length >= CONCURRENCY_LIMIT) {
      await Promise.all(activePromises);
      activePromises = [];
    }
  }

  if (activePromises.length > 0) {
     await Promise.all(activePromises);
  }

  console.log(`\n=== PILOT COMPLETE ===`);
  console.log(`Processed: ${completed}`);
  console.log(`New Verified Profiles: ${totalVerified}`);
  console.log(`Please run 'npm run project' to update the projection, then 'npm run coverage' to view metrics.`);
}

runPilot().catch(console.error);
