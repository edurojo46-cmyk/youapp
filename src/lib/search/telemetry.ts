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
  | 'search_abandoned';

interface SearchEventPayload {
  session_id?: string;
  query_normalized?: string;
  provider?: string;
  result_count?: number;
  latency_ms?: number;
  cache_source?: string;
}

// Queue for batching events (simplified for now)
let eventQueue: any[] = [];
let queueTimeout: any = null;

const FLUSH_INTERVAL = 5000; // 5 seconds

export function trackSearchEvent(eventName: SearchEventName, payload?: SearchEventPayload) {
  // Fire and forget, never block
  setTimeout(async () => {
    const eventData = {
      event_name: eventName,
      ...payload,
      session_id: payload?.session_id || localStorage.getItem('youapp_session_id') || 'anon',
      created_at: new Date().toISOString()
    };

    if (import.meta.env.DEV) {
      console.info(`[Telemetry] ${eventName}`, payload);
      // In dev, we can optionally skip sending to Supabase, but the user requested:
      // "DEVELOPMENT: console + Supabase opcional. PRODUCTION: Supabase"
    }

    eventQueue.push(eventData);

    if (!queueTimeout) {
      queueTimeout = setTimeout(flushEventQueue, FLUSH_INTERVAL);
    }
  }, 0);
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
