import { supabase } from '../supabase';

export type SearchEventName = 
  | 'search_started'
  | 'cache_hit'
  | 'cache_miss'
  | 'supabase_hit'
  | 'external_search_started'
  | 'external_search_completed'
  | 'results_shown'
  | 'result_clicked'
  | 'result_saved'
  | 'result_programmed'
  | 'moment_created'
  | 'search_abandoned'
  | 'search_completed';

interface SearchEventPayload {
  request_id?: string;
  session_id?: string;
  query_normalized?: string;
  provider?: string;
  
  candidate_count?: number;
  eligible_count?: number;
  result_count?: number;
  position?: number;
  
  external_used?: boolean;
  external_latency_ms?: number;
  latency_ms?: number;
  
  success?: boolean;
  error_code?: string;
  cache_source?: string;
}

let eventQueue: any[] = [];
let queueTimeout: any = null;

const FLUSH_INTERVAL = 5000;

export function trackSearchEvent(eventName: SearchEventName, payload?: SearchEventPayload) {
  // Fire and forget, absolutely no blocking
  Promise.resolve().then(() => {
    const eventData = {
      event_name: eventName,
      ...payload,
      session_id: payload?.session_id || localStorage.getItem('youapp_session_id') || 'anon',
      created_at: new Date().toISOString()
    };

    if (import.meta.env.DEV) {
      console.info(`[Telemetry] ${eventName}`, payload);
    }

    eventQueue.push(eventData);

    if (!queueTimeout) {
      queueTimeout = setTimeout(flushEventQueue, FLUSH_INTERVAL);
    }
  }).catch(() => {
    // Fail silently
  });
}

async function flushEventQueue() {
  if (eventQueue.length === 0) return;
  
  const itemsToFlush = [...eventQueue];
  eventQueue = [];
  queueTimeout = null;

  try {
    const { error } = await supabase.from('search_events').insert(itemsToFlush);
    if (error && import.meta.env.DEV) {
       console.warn("[Telemetry] Failed to flush events to Supabase:", error);
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[Telemetry] Exception flushing events:", e);
    }
  }
}
