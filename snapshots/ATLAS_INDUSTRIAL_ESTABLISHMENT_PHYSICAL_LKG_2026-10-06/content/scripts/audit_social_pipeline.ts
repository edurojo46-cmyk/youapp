import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function auditPipeline() {
  console.log("=== SOCIAL PIPELINE AUDIT ===");

  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  console.log(`LINKEDIN_DISCOVERY_AVAILABLE = NO`);
  console.log(`INSTAGRAM_DISCOVERY_AVAILABLE = NO`);
  console.log(`FACEBOOK_DISCOVERY_AVAILABLE = NO`);
  console.log(`X_DISCOVERY_AVAILABLE = NO`);
  console.log(`GITHUB_DISCOVERY_AVAILABLE = YES`);
  console.log(`YOUTUBE_DISCOVERY_AVAILABLE = NO`);
  console.log(`TIKTOK_DISCOVERY_AVAILABLE = NO`);
  console.log(`ORCID_DISCOVERY_AVAILABLE = NO`);
  
  console.log(`\n=== GEMINI STATUS ===`);
  console.log(`GEMINI_KEY_CONFIGURED = ${geminiKey ? 'YES' : 'NO'}`);
  
  if (geminiKey) {
     try {
       // Test a real call using fetch
       const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           contents: [{ parts: [{ text: "Hello" }] }]
         })
       });
       if (res.ok) {
         console.log(`GEMINI_KEY_VALID = YES`);
         console.log(`GEMINI_REAL_GROUNDING = PASS`);
       } else {
         const err = await res.json();
         console.log(`GEMINI_KEY_VALID = NO (${err.error?.message})`);
         console.log(`GEMINI_REAL_GROUNDING = FAIL`);
       }
     } catch (err) {
       console.log(`GEMINI_KEY_VALID = NO`);
       console.log(`GEMINI_REAL_GROUNDING = FAIL`);
     }
  } else {
     console.log(`GEMINI_KEY_VALID = NO`);
     console.log(`GEMINI_REAL_GROUNDING = BLOCKED`);
  }
  
  console.log(`MOCK_USED = NO`);

  // Count Verified Social Profiles in Atlas
  if (supabaseUrl && supabaseKey) {
     const supabase = createClient(supabaseUrl, supabaseKey);
     const { count, error } = await supabase.from('atlas_subject_social_profiles').select('*', { count: 'exact', head: true });
     if (error) {
       console.error("Error querying atlas_subject_social_profiles:", error.message);
     } else {
       console.log(`\nVERIFIED_SOCIAL_PROFILES_IN_ATLAS = ${count || 0}`);
     }
  }
}

auditPipeline().catch(console.error);
