import { supabase } from '../src/lib/supabase';

async function checkSignals() {
  const { data: signals } = await supabase.from('custom_signals').select('*');
  console.log('custom_signals rows:', signals?.length);
  console.log(JSON.stringify(signals, null, 2));

  const { data: scheduleBlocks } = await supabase.from('schedule_blocks').select('*');
  console.log('schedule_blocks rows:', scheduleBlocks?.length);
  console.log(JSON.stringify(scheduleBlocks, null, 2));

  const { data: draftStore } = await supabase.from('custom_channels').select('*');
  console.log('custom_channels:', draftStore?.length);
  console.log(JSON.stringify(draftStore, null, 2));
}

checkSignals();
