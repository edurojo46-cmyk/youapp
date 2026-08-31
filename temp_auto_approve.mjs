import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function run() {
  try {
    const envStr = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
    const supabaseUrl = envStr.match(/VITE_SUPABASE_URL=(.+)/)?.[1].trim();
    const anonKey = envStr.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1].trim();

    if (!supabaseUrl || !anonKey) throw new Error("Missing env vars");

    const supabase = createClient(supabaseUrl, anonKey);

    let totalApproved = 0;
    let hasMore = true;

    while (hasMore) {
      console.log("Fetching pending items...");
      
      const { data: pendingItems, error: fetchError } = await supabase
        .from('catalog_import_items')
        .select('*')
        .eq('status', 'pending_approval')
        .limit(1000);

      if (fetchError) throw fetchError;

      if (!pendingItems || pendingItems.length === 0) {
        console.log("No more pending items found.");
        hasMore = false;
        break;
      }

      console.log(`Found ${pendingItems.length} items to approve. Processing in batches...`);

      const BATCH_SIZE = 50;

      for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
        const batch = pendingItems.slice(i, i + BATCH_SIZE);
        
        const newCatalogItems = batch.map(item => {
          const url = item.provider === 'youtube' 
            ? `https://www.youtube.com/watch?v=${item.provider_content_id}` 
            : item.canonical_url;
            
          return {
            video_id: item.provider_content_id, // Required column!
            title: item.title,
            description: item.description || '',
            thumbnail: item.thumbnail_url,
            url: url,
            provider: item.provider,
            tags: ['movies_series', 'seed-imported']
          };
        });

        const { error: insertError } = await supabase
          .from('youapp_index')
          .insert(newCatalogItems);

        if (insertError) {
          console.error("Error inserting batch:", insertError);
          continue; 
        }

        const itemIds = batch.map(item => item.id);
        const { error: updateError } = await supabase
          .from('catalog_import_items')
          .update({ status: 'approved' })
          .in('id', itemIds);

        if (updateError) {
          console.error("Error updating status:", updateError);
        } else {
          totalApproved += batch.length;
          console.log(`Approved batch. Total so far: ${totalApproved}`);
        }
      }
    }

    console.log(`\n--- AUTO-APPROVAL COMPLETE ---`);
    console.log(`Successfully approved total: ${totalApproved}`);

  } catch (error) {
    console.error("Fatal Error:", error);
  }
}

run();
