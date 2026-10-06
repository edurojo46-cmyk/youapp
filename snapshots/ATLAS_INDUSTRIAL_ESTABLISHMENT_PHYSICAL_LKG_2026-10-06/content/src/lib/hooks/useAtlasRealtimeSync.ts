import { useState, useEffect, useRef, useCallback } from 'react';
import type { 
  AtlasLiveReadModel, 
  AtlasLiveEvent, 
  RealtimeStartSnapshot 
} from '../search/telemetry/AtlasLiveTelemetryService';

export type ConnectionStatus = 'LIVE' | 'RECONNECTING' | 'DEGRADED';

export interface UseAtlasRealtimeSyncReturn {
  metrics: AtlasLiveReadModel | null;
  snapshot: RealtimeStartSnapshot | null;
  recentEvents: AtlasLiveEvent[];
  connectionStatus: ConnectionStatus;
  status: ConnectionStatus;
  lastEventTime: string | null;
  hasNewIndexVersion: boolean;
  newIndexCount: number;
  resetNewIndexAlert: () => void;
  forceSync: () => Promise<void>;

  // Real-time 5s polling & trend extensions
  secondsSinceLastUpdate: number;
  isUnavailable: boolean;
  outboxTrend: 'GROWING' | 'STABLE' | 'DRAINING';
  outboxDepthHistory: number[];
  growthHistory: Array<{ timestamp: number; count: number; dateStr: string }>;
}

export function useAtlasRealtimeSync(): UseAtlasRealtimeSyncReturn {
  const [metrics, setMetrics] = useState<AtlasLiveReadModel | null>(null);
  const [snapshot, setSnapshot] = useState<RealtimeStartSnapshot | null>(null);
  const [recentEvents, setRecentEvents] = useState<AtlasLiveEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('LIVE');
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [hasNewIndexVersion, setHasNewIndexVersion] = useState<boolean>(false);
  const [newIndexCount, setNewIndexCount] = useState<number>(0);

  // Live 5s Polling & Status
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState<number>(0);
  const [secondsSinceQuery, setSecondsSinceQuery] = useState<number>(0);
  const [secondsSinceQualifiedUpdate, setSecondsSinceQualifiedUpdate] = useState<number>(0);
  const [secondsSinceHeartbeat, setSecondsSinceHeartbeat] = useState<number>(0);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [outboxTrend, setOutboxTrend] = useState<'GROWING' | 'STABLE' | 'DRAINING'>('STABLE');
  const [outboxDepthHistory, setOutboxDepthHistory] = useState<number[]>([]);
  const [growthHistory, setGrowthHistory] = useState<Array<{ timestamp: number; count: number; dateStr: string }>>([]);

  const metricsRef = useRef<AtlasLiveReadModel | null>(null);
  const lastUpdateTsRef = useRef<number>(Date.now());
  const consecutiveErrorsRef = useRef<number>(0);

  const lastEventIdRef = useRef<string | null>(null);
  const eventBufferRef = useRef<AtlasLiveEvent[]>([]);
  const batchTimeoutRef = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<any>(null);
  const fastPollingRef = useRef<any>(null);
  const tickerIntervalRef = useRef<any>(null);
  const retryCountRef = useRef<number>(0);
  const knownEventIdsRef = useRef<Set<string>>(new Set());

  // Flushes buffered events in batches (Corrección 9: Batch UI Updates 300ms)
  const flushEventBuffer = useCallback(() => {
    if (eventBufferRef.current.length === 0) return;

    const newEvents = [...eventBufferRef.current];
    eventBufferRef.current = [];

    // Filter duplicates using idempotent cursor cache (Corrección 5: DUPLICATE_UI_EVENT_APPLICATION = 0)
    const uniqueNewEvents = newEvents.filter(e => {
      if (knownEventIdsRef.current.has(e.event_id)) return false;
      knownEventIdsRef.current.add(e.event_id);
      return true;
    });

    if (uniqueNewEvents.length === 0) return;

    const lastEvent = uniqueNewEvents[uniqueNewEvents.length - 1];
    lastEventIdRef.current = lastEvent.event_id;
    setLastEventTime(lastEvent.occurred_at);

    // Update recent events feed (keep last 100)
    setRecentEvents(prev => {
      const combined = [...uniqueNewEvents, ...prev];
      return combined.slice(0, 100);
    });

    // Check for index version updates (Corrección 7: Index-ready Semantics)
    const indexEvents = uniqueNewEvents.filter(e => e.stage === 'INDEXED');
    if (indexEvents.length > 0) {
      setHasNewIndexVersion(true);
      setNewIndexCount(prev => prev + indexEvents.length);
    }
  }, []);

  const queueEvent = useCallback((event: AtlasLiveEvent, updatedMetrics?: AtlasLiveReadModel) => {
    eventBufferRef.current.push(event);
    if (updatedMetrics) {
      setMetrics(updatedMetrics);
    }

    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(() => {
        batchTimeoutRef.current = null;
        flushEventBuffer();
      }, 300); // 300ms batch buffer
    }
  }, [flushEventBuffer]);

  // 5-Second Live Polling (POLLING_5S = TRUE) & State Hydration
  const fetchLiveMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/atlas/live-metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.metrics) {
        metricsRef.current = data.metrics;
        setMetrics(data.metrics);
        lastUpdateTsRef.current = Date.now();
        setSecondsSinceLastUpdate(0);
        setSecondsSinceQuery(0);
        if (data.metrics.qualified_count_updated_at) {
          const qTs = new Date(data.metrics.qualified_count_updated_at).getTime();
          if (!isNaN(qTs)) setSecondsSinceQualifiedUpdate(Math.max(0, Math.floor((Date.now() - qTs) / 1000)));
        }
        if (data.metrics.factory_heartbeat_at) {
          const hbTs = new Date(data.metrics.factory_heartbeat_at).getTime();
          if (!isNaN(hbTs)) setSecondsSinceHeartbeat(Math.max(0, Math.floor((Date.now() - hbTs) / 1000)));
        }
        setIsUnavailable(false);
        consecutiveErrorsRef.current = 0;
        setConnectionStatus('LIVE');

        const depth = Number(data.metrics.search_outbox_depth || 0);
        setOutboxDepthHistory(prev => {
          const next = [...prev, depth].slice(-10);
          if (next.length >= 3) {
            const first = next[0];
            const last = next[next.length - 1];
            if (last > first * 1.02) setOutboxTrend('GROWING');
            else if (last < first * 0.98) setOutboxTrend('DRAINING');
            else setOutboxTrend('STABLE');
          }
          return next;
        });

        const qCount = Number(data.metrics.qualified_unique_real_people || 0);
        if (qCount > 0) {
          setGrowthHistory(prev => {
            const now = Date.now();
            if (prev.length > 0 && now - prev[prev.length - 1].timestamp < 3000) return prev;
            const newPoint = { timestamp: now, count: qCount, dateStr: new Date(now).toLocaleTimeString() };
            return [...prev, newPoint].slice(-60);
          });
        }
      }
      if (data.snapshot) setSnapshot(data.snapshot);
    } catch (err) {
      consecutiveErrorsRef.current++;
      if (consecutiveErrorsRef.current >= 2) {
        setIsUnavailable(true);
        setConnectionStatus('DEGRADED');
      }
    }
  }, []);

  // Fallback: Cursor-based Polling (15-20s interval)
  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) return;

    const poll = async () => {
      try {
        const cursorParam = lastEventIdRef.current ? `?cursor=${encodeURIComponent(lastEventIdRef.current)}` : '';
        const res = await fetch(`/api/atlas/live-events${cursorParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) setMetrics(data.metrics);
          if (data.events && Array.isArray(data.events) && data.events.length > 0) {
            for (const ev of data.events) {
              queueEvent(ev);
            }
          }
        }
      } catch (err) {
        console.warn('[useAtlasRealtimeSync] Polling fallback warning:', err);
      }
    };

    poll();
    pollingIntervalRef.current = setInterval(poll, 15000); // 15s fallback
  }, [queueEvent]);

  // Primary: Event-Driven SSE (Corrección 2)
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      startPollingFallback();
      return;
    }

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setConnectionStatus('RECONNECTING');
      const es = new EventSource('/api/atlas/live-events');
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnectionStatus('LIVE');
        retryCountRef.current = 0;
        // If polling fallback was running, stop it
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };

      es.addEventListener('initial', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.metrics) setMetrics(payload.metrics);
          if (payload.recent_events && Array.isArray(payload.recent_events)) {
            const events: AtlasLiveEvent[] = payload.recent_events;
            for (const ev of events) {
              knownEventIdsRef.current.add(ev.event_id);
            }
            setRecentEvents(events.slice(0, 100));
            if (events.length > 0) {
              lastEventIdRef.current = events[events.length - 1].event_id;
              setLastEventTime(events[events.length - 1].occurred_at);
            }
          }
        } catch (err) {
          console.error('[useAtlasRealtimeSync] Failed to parse initial SSE payload:', err);
        }
      });

      es.addEventListener('update', (e: MessageEvent) => {
        const t_browser_eventsource_receive = Date.now();
        try {
          const payload = JSON.parse(e.data);
          const t_react_state_applied = Date.now();

          if (payload.event) {
            queueEvent(payload.event, payload.metrics);
          } else if (payload.metrics) {
            setMetrics(payload.metrics);
          }

          // Phase 1.1: True Browser End-to-End Instrumentation
          if (payload.event && typeof window !== 'undefined') {
            const ev = payload.event;
            const t_db_commit = ev.timestamps?.t_db_commit || 0;
            const t_index_ready = ev.timestamps?.t_index_ready || 0;
            const t_sse_server_send = ev.timestamps?.t_sse_server_send || t_db_commit;

            // Wait for paint to complete (requestAnimationFrame twice guarantees layout + paint)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const t_dom_render_visible = Date.now();
                const domEl = document.getElementById('atlas-live-verified-people-count');
                const domText = domEl?.textContent?.trim() || '';

                const telemetryEntry = {
                  event_id: ev.event_id,
                  stage: ev.stage,
                  timestamps: {
                    t_db_commit,
                    t_index_ready,
                    t_sse_server_send,
                    t_browser_eventsource_receive,
                    t_react_state_applied,
                    t_dom_render_visible
                  },
                  latencies: {
                    server_internal_event_latency_ms: t_sse_server_send - t_db_commit,
                    sse_network_delivery_latency_ms: Math.max(0, t_browser_eventsource_receive - t_sse_server_send),
                    browser_receive_to_render_latency_ms: t_dom_render_visible - t_browser_eventsource_receive,
                    db_commit_to_visible_dom_latency_ms: t_dom_render_visible - t_db_commit
                  },
                  dom_element_text: domText
                };

                const win = window as any;
                if (!win.__ATLAS_REALTIME_BROWSER_TELEMETRY__) {
                  win.__ATLAS_REALTIME_BROWSER_TELEMETRY__ = {
                    lastEvent: telemetryEntry,
                    eventLog: [telemetryEntry]
                  };
                } else {
                  win.__ATLAS_REALTIME_BROWSER_TELEMETRY__.lastEvent = telemetryEntry;
                  win.__ATLAS_REALTIME_BROWSER_TELEMETRY__.eventLog.push(telemetryEntry);
                }

                window.dispatchEvent(new CustomEvent('atlas:realtime:render', { detail: telemetryEntry }));
              });
            });
          }
        } catch (err) {
          console.error('[useAtlasRealtimeSync] Failed to parse SSE update:', err);
        }
      });

      es.onerror = () => {
        console.warn('[useAtlasRealtimeSync] SSE connection interrupted. Starting fallback.');
        es.close();
        eventSourceRef.current = null;
        setConnectionStatus('RECONNECTING');

        retryCountRef.current++;
        if (retryCountRef.current > 3) {
          setConnectionStatus('DEGRADED');
        }

        // Engage cursor-based polling fallback
        startPollingFallback();

        // Attempt SSE reconnect after 10 seconds
        setTimeout(() => {
          connectSSE();
        }, 10000);
      };
    } catch (err) {
      console.error('[useAtlasRealtimeSync] Error initializing SSE:', err);
      startPollingFallback();
    }
  }, [queueEvent, startPollingFallback]);

  const forceSync = useCallback(async () => {
    await fetchLiveMetrics();
    if (lastEventIdRef.current) {
      try {
        const res = await fetch(`/api/atlas/live-events?cursor=${encodeURIComponent(lastEventIdRef.current)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) setMetrics(data.metrics);
          if (data.events && Array.isArray(data.events)) {
            for (const ev of data.events) queueEvent(ev);
          }
        }
      } catch {}
    }
  }, [fetchLiveMetrics, queueEvent]);

  const resetNewIndexAlert = useCallback(() => {
    setHasNewIndexVersion(false);
    setNewIndexCount(0);
  }, []);

  useEffect(() => {
    fetchLiveMetrics();
    connectSSE();

    // 5-Second Interval Polling (POLLING_5S = TRUE)
    fastPollingRef.current = setInterval(fetchLiveMetrics, 5000);

    // 1-Second Ticker for Elapsed Seconds (Sections 3 & 4)
    tickerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (lastUpdateTsRef.current) {
        const querySecs = Math.max(0, Math.floor((now - lastUpdateTsRef.current) / 1000));
        setSecondsSinceLastUpdate(querySecs);
        setSecondsSinceQuery(querySecs);
      }
      if (metricsRef.current?.qualified_count_updated_at) {
        const qTs = new Date(metricsRef.current.qualified_count_updated_at).getTime();
        if (!isNaN(qTs)) {
          setSecondsSinceQualifiedUpdate(Math.max(0, Math.floor((now - qTs) / 1000)));
        }
      }
      if (metricsRef.current?.factory_heartbeat_at) {
        const hbTs = new Date(metricsRef.current.factory_heartbeat_at).getTime();
        if (!isNaN(hbTs)) {
          setSecondsSinceHeartbeat(Math.max(0, Math.floor((now - hbTs) / 1000)));
        }
      }
    }, 1000);

    return () => {
      if (fastPollingRef.current) clearInterval(fastPollingRef.current);
      if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
    };
  }, [fetchLiveMetrics, connectSSE]);

  return {
    metrics,
    snapshot,
    recentEvents,
    connectionStatus,
    status: connectionStatus,
    lastEventTime,
    hasNewIndexVersion,
    newIndexCount,
    resetNewIndexAlert,
    forceSync,
    secondsSinceLastUpdate,
    secondsSinceQuery,
    secondsSinceQualifiedUpdate,
    secondsSinceHeartbeat,
    isUnavailable,
    outboxTrend,
    outboxDepthHistory,
    growthHistory
  };
}
