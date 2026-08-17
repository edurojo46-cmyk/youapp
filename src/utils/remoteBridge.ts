import { supabase } from '../lib/supabase';

// Multi-transport Realtime Remote Control Bridge
// 1. Supabase WebSockets
// 2. Public MQTT/WebSocket Broker
// 3. Local BroadcastChannel
export class RemoteBridge {
  private sessionId: string;
  private onActionCallback: ((action: string, payload: any) => void) | null = null;
  private onConnectedCallback: (() => void) | null = null;
  private supabaseRoom: any = null;
  private localBc: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId.trim();
    this.init();
  }

  private init() {
    const channelName = `remote_${this.sessionId}`;

    // 1. Supabase Realtime Channel
    try {
      this.supabaseRoom = supabase.channel(channelName, {
        config: { broadcast: { self: true, ack: true } }
      });

      this.supabaseRoom
        .on('broadcast', { event: 'REMOTE_ACTION' }, (e: any) => {
          const payload = e?.payload?.payload || e?.payload || e;
          const action = payload?.action || e?.action;
          if (action && this.onActionCallback) {
            this.onActionCallback(action, payload);
          }
        })
        .on('broadcast', { event: 'REMOTE_CONNECTED' }, () => {
          if (this.onConnectedCallback) this.onConnectedCallback();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.supabaseRoom.send({
              type: 'broadcast',
              event: 'TV_STATUS',
              payload: { online: true }
            });
          }
        });
    } catch (err) {
      console.warn('Supabase realtime init error:', err);
    }

    // 2. BroadcastChannel nativo (Same-browser multi-tab)
    try {
      this.localBc = new BroadcastChannel(channelName);
      this.localBc.onmessage = (e) => {
        if (e.data?.event === 'REMOTE_ACTION') {
          const payload = e.data.payload;
          const action = payload?.action;
          if (action && this.onActionCallback) {
            this.onActionCallback(action, payload);
          }
        } else if (e.data?.event === 'REMOTE_CONNECTED') {
          if (this.onConnectedCallback) this.onConnectedCallback();
        }
      };
    } catch {}

    // 3. Fallback WebSocket Broker público de baja latencia
    try {
      // Usar broker público gratuito con topic único por sessionId
      const wsUrl = `wss://socketsbay.com/wss/v2/1/demo/?channel=${channelName}`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.event === 'REMOTE_ACTION' && data?.channel === channelName) {
            const action = data.payload?.action;
            if (action && this.onActionCallback) {
              this.onActionCallback(action, data.payload);
            }
          } else if (data?.event === 'REMOTE_CONNECTED' && data?.channel === channelName) {
            if (this.onConnectedCallback) this.onConnectedCallback();
          }
        } catch {}
      };
    } catch {}
  }

  public onAction(callback: (action: string, payload: any) => void) {
    this.onActionCallback = callback;
  }

  public onConnected(callback: () => void) {
    this.onConnectedCallback = callback;
  }

  public sendAction(action: string, payload: any = {}) {
    const channelName = `remote_${this.sessionId}`;
    const messagePayload = { action, ...payload };

    // Enviar por Supabase
    if (this.supabaseRoom) {
      try {
        this.supabaseRoom.send({
          type: 'broadcast',
          event: 'REMOTE_ACTION',
          payload: messagePayload
        });
      } catch {}
    }

    // Enviar por BroadcastChannel local
    if (this.localBc) {
      try {
        this.localBc.postMessage({ event: 'REMOTE_ACTION', payload: messagePayload });
      } catch {}
    }

    // Enviar por WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          channel: channelName,
          event: 'REMOTE_ACTION',
          payload: messagePayload
        }));
      } catch {}
    }
  }

  public notifyConnected() {
    const channelName = `remote_${this.sessionId}`;
    if (this.supabaseRoom) {
      try {
        this.supabaseRoom.send({
          type: 'broadcast',
          event: 'REMOTE_CONNECTED',
          payload: { timestamp: Date.now() }
        });
      } catch {}
    }
    if (this.localBc) {
      try {
        this.localBc.postMessage({ event: 'REMOTE_CONNECTED' });
      } catch {}
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          channel: channelName,
          event: 'REMOTE_CONNECTED'
        }));
      } catch {}
    }
  }

  public destroy() {
    if (this.supabaseRoom) {
      supabase.removeChannel(this.supabaseRoom);
    }
    if (this.localBc) {
      this.localBc.close();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
