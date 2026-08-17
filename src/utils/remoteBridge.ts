import { Peer, type DataConnection } from 'peerjs';
import { supabase } from '../lib/supabase';

// Multi-transport WebRTC & WebSocket Bridge
export class RemoteBridge {
  private sessionId: string;
  private mode: 'tv' | 'remote';
  private onActionCallback: ((action: string, payload: any) => void) | null = null;
  private onConnectedCallback: (() => void) | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private supabaseRoom: any = null;
  private localBc: BroadcastChannel | null = null;

  constructor(sessionId: string, mode: 'tv' | 'remote' = 'tv') {
    this.sessionId = sessionId.trim().toLowerCase();
    this.mode = mode;
    this.init();
  }

  private init() {
    const peerId = `youapp-pin-${this.sessionId}`;
    const channelName = `remote_${this.sessionId}`;

    // 1. PeerJS Direct WebRTC Connection
    try {
      if (this.mode === 'tv') {
        // En la TV creamos el Peer receptor con ese PIN
        this.peer = new Peer(peerId);

        this.peer.on('open', (id) => {
          console.log('[TV WebRTC] Ready on PIN:', id);
        });

        this.peer.on('connection', (connection) => {
          this.conn = connection;
          console.log('[TV WebRTC] Phone connected!');
          if (this.onConnectedCallback) this.onConnectedCallback();

          connection.on('data', (data: any) => {
            console.log('[TV WebRTC Data Received]:', data);
            const action = data?.action;
            if (action && this.onActionCallback) {
              this.onActionCallback(action, data.payload || data);
            }
          });
        });
      } else {
        // En el Celular nos conectamos al Peer de la TV
        this.peer = new Peer();

        this.peer.on('open', () => {
          if (!this.peer) return;
          console.log('[Phone WebRTC] Connecting to TV:', peerId);
          this.conn = this.peer.connect(peerId, { reliable: true });

          this.conn.on('open', () => {
            console.log('[Phone WebRTC] Successfully connected to TV!');
            if (this.onConnectedCallback) this.onConnectedCallback();
          });
        });
      }
    } catch (e) {
      console.warn('WebRTC Peer init error:', e);
    }

    // 2. Supabase Realtime Channel
    try {
      this.supabaseRoom = supabase.channel(channelName, {
        config: { broadcast: { self: true, ack: false } }
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
          if (status === 'SUBSCRIBED' && this.mode === 'remote') {
            this.supabaseRoom.send({
              type: 'broadcast',
              event: 'REMOTE_CONNECTED',
              payload: { timestamp: Date.now() }
            });
          }
        });
    } catch (err) {
      console.warn('Supabase realtime init error:', err);
    }

    // 3. Local BroadcastChannel (Same-browser multi-tab)
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
  }

  public onAction(callback: (action: string, payload: any) => void) {
    this.onActionCallback = callback;
  }

  public onConnected(callback: () => void) {
    this.onConnectedCallback = callback;
  }

  public sendAction(action: string, payload: any = {}) {
    const messagePayload = { action, payload, ...payload };

    // 1. Enviar vía WebRTC Direct DataChannel (Instantáneo)
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(messagePayload);
      } catch (err) {
        console.warn('WebRTC send error:', err);
      }
    } else if (this.peer && this.mode === 'remote') {
      // Reintentar conectar si no estaba abierto
      try {
        const peerId = `youapp-pin-${this.sessionId}`;
        const newConn = this.peer.connect(peerId, { reliable: true });
        newConn.on('open', () => {
          newConn.send(messagePayload);
          this.conn = newConn;
        });
      } catch {}
    }

    // 2. Enviar vía Supabase Broadcast
    if (this.supabaseRoom) {
      try {
        this.supabaseRoom.send({
          type: 'broadcast',
          event: 'REMOTE_ACTION',
          payload: messagePayload
        });
      } catch {}
    }

    // 3. Enviar vía BroadcastChannel local
    if (this.localBc) {
      try {
        this.localBc.postMessage({ event: 'REMOTE_ACTION', payload: messagePayload });
      } catch {}
    }
  }

  public notifyConnected() {
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
  }

  public destroy() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    if (this.supabaseRoom) {
      supabase.removeChannel(this.supabaseRoom);
    }
    if (this.localBc) {
      this.localBc.close();
    }
  }
}
