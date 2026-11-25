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
      provider_content_id: (block.contentItem as any).providerContentId || block.contentItem.providerId || block.contentItem.id,
      content_key: block.contentItem.id,
      title: block.contentItem.title,
      thumbnail_url: block.contentItem.thumbnail || (block.contentItem as any).thumbnailUrl || '',
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

function mapDbRowsToSignal(sigRow: any, itemRows: any[]): CustomSignal {
  const sorted = [...(itemRows || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const schedule: ScheduleBlock[] = sorted.map((it, idx) => {
    const vid = it.provider_content_id || it.content_key || it.block_id;
    const chName = (it.topic || '').includes('·')
      ? String(it.topic).split('·').pop()?.trim() || sigRow.name
      : sigRow.name;
    return {
      id: it.block_id || `${sigRow.client_signal_id}-b-${idx}`,
      position: it.position ?? idx,
      startOffsetSec: it.start_offset_sec ?? idx * 600,
      durationSec: it.duration_sec ?? 600,
      topic: it.topic || sigRow.name,
      role: (it.role || 'explainer') as any,
      contentItem: {
        id: vid,
        providerId: vid,
        type: 'video',
        provider: (it.content_provider || 'youtube') as any,
        title: it.title || 'Video',
        thumbnailUrl: it.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        thumbnail: it.thumbnail_url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        videoUrl: `https://www.youtube.com/watch?v=${vid}`,
        channelName: chName,
        channelTitle: chName,
        channelId: chName.toLowerCase().replace(/\s+/g, '-'),
        isLive: false,
        isVerified: true
      } as any
    };
  });

  return {
    id: sigRow.client_signal_id || sigRow.id,
    name: sigRow.name || 'Mi Señal',
    prompt: sigRow.prompt || '',
    visibility: sigRow.visibility === 'private' ? 'private' : 'public',
    created_at: sigRow.created_at || new Date().toISOString(),
    updated_at: sigRow.updated_at || sigRow.created_at || new Date().toISOString(),
    schedule
  };
}

export async function loadCloudSignalsForUser(): Promise<CustomSignal[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return [];

    const { data: sigRows, error } = await supabase
      .from('custom_signals')
      .select('id, client_signal_id, name, prompt, visibility, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(12);

    if (error || !sigRows?.length) return [];

    const sigIds = sigRows.map((s) => s.id);
    const { data: itemRows } = await supabase
      .from('signal_schedule_items')
      .select('*')
      .in('signal_id', sigIds);

    const bySignalId = new Map<string, any[]>();
    for (const row of itemRows || []) {
      const list = bySignalId.get(row.signal_id) || [];
      list.push(row);
      bySignalId.set(row.signal_id, list);
    }

    return sigRows
      .map((s) => mapDbRowsToSignal(s, bySignalId.get(s.id) || []))
      .filter((s) => s.schedule.length > 0);
  } catch {
    return [];
  }
}

export async function loadPublicSignalById(clientSignalId: string): Promise<CustomSignal | null> {
  if (!clientSignalId) return null;
  try {
    const { data: sigRow, error } = await supabase
      .from('custom_signals')
      .select('id, client_signal_id, name, prompt, visibility, created_at, updated_at')
      .eq('client_signal_id', clientSignalId)
      .eq('visibility', 'public')
      .maybeSingle();

    if (error || !sigRow) return null;

    const { data: itemRows } = await supabase
      .from('signal_schedule_items')
      .select('*')
      .eq('signal_id', sigRow.id);

    const mapped = mapDbRowsToSignal(sigRow, itemRows || []);
    return mapped.schedule.length > 0 ? mapped : null;
  } catch {
    return null;
  }
}

export async function syncCloudBranding(
  brandingMap: Record<string, { avatarDataUrl?: string; coverDataUrl?: string }>
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return;
    // Solo sincronizamos entradas compactas para no exceder límites de metadata
    const compact: Record<string, { avatarDataUrl?: string; coverDataUrl?: string }> = {};
    for (const [k, v] of Object.entries(brandingMap)) {
      const av = v.avatarDataUrl && v.avatarDataUrl.length < 48000 ? v.avatarDataUrl : undefined;
      const cv = v.coverDataUrl && v.coverDataUrl.length < 64000 ? v.coverDataUrl : undefined;
      if (av || cv) compact[k] = { ...(av ? { avatarDataUrl: av } : {}), ...(cv ? { coverDataUrl: cv } : {}) };
    }
    await supabase.auth.updateUser({ data: { youapp_signal_branding: compact } });
  } catch {
    // non-fatal
  }
}

export async function loadCloudBranding(): Promise<
  Record<string, { avatarDataUrl?: string; coverDataUrl?: string }>
> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const meta = sessionData.session?.user?.user_metadata?.youapp_signal_branding;
    return meta && typeof meta === 'object' ? meta : {};
  } catch {
    return {};
  }
}
