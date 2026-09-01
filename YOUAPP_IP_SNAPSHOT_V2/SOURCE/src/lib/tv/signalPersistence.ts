import { supabase } from '../supabase';
import type { CustomSignal, ScheduleBlock } from './signalTypes';

export async function persistSignal(signal: CustomSignal): Promise<boolean> {
  try {
    // 0. Obtener usuario actual
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      console.warn('[SignalPersistence] No active session found, RLS might reject this insert');
    }

    // 1. Upsert la señal principal
    const { error: signalError } = await supabase.from('custom_signals').upsert({
      client_signal_id: signal.id,
      user_id: userId || null,
      name: signal.name,
      prompt: signal.prompt,
      duration_target_min: signal.duration_target || null,
      visibility: signal.visibility,
      status: 'ready'
    }, {
      onConflict: 'client_signal_id',
      ignoreDuplicates: false
    });

    if (signalError) throw signalError;

    // Obtener la señal insertada para recuperar su UUID primario en postgres
    const { data: dbSignal, error: fetchError } = await supabase
      .from('custom_signals')
      .select('id')
      .eq('client_signal_id', signal.id)
      .single();

    if (fetchError || !dbSignal) throw fetchError || new Error("No dbSignal found after upsert");

    const pgSignalId = dbSignal.id;

    // 2. Upsert items del schedule
    const scheduleItems = signal.schedule.map((block) => ({
      signal_id: pgSignalId,
      block_id: block.id,
      position: block.position,
      start_offset_sec: block.startOffsetSec,
      duration_sec: block.durationSec,
      content_provider: block.contentItem.provider || 'youtube',
      provider_content_id: block.contentItem.providerContentId || block.contentItem.id,
      content_key: block.contentItem.id,
      title: block.contentItem.title,
      thumbnail_url: block.contentItem.thumbnail,
      topic: block.topic,
      role: block.role
    }));

    if (scheduleItems.length > 0) {
      const { error: scheduleError } = await supabase
        .from('signal_schedule_items')
        .upsert(scheduleItems, {
          onConflict: 'signal_id,block_id'
        });
        
      if (scheduleError) throw scheduleError;
    }

    return true;
  } catch (error) {
    console.error('[SignalPersistence] Error persisting signal:', error);
    return false;
  }
}

export async function persistScheduleMutation(clientSignalId: string, orderedBlockIds: string[]): Promise<boolean> {
  try {
    const { data: dbSignal, error: fetchError } = await supabase
      .from('custom_signals')
      .select('id')
      .eq('client_signal_id', clientSignalId)
      .single();

    if (fetchError || !dbSignal) return false;

    const { error } = await supabase.rpc('update_signal_schedule_order', {
      p_signal_id: dbSignal.id,
      p_ordered_block_ids: orderedBlockIds
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[SignalPersistence] Error in persistScheduleMutation:', error);
    return false;
  }
}

export async function logSignalEvent(clientSignalId: string, blockId: string | null, eventType: string, eventData?: any): Promise<void> {
  try {
    const { data: dbSignal } = await supabase
      .from('custom_signals')
      .select('id')
      .eq('client_signal_id', clientSignalId)
      .single();

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (dbSignal) {
      await supabase.from('signal_events').insert({
        signal_id: dbSignal.id,
        user_id: userId || null,
        block_id: blockId,
        event_type: eventType,
        event_data: eventData
      });
    }
  } catch (error) {
    // Fail silently para telemetría
    console.error('[SignalPersistence] Event log failed:', error);
  }
}
