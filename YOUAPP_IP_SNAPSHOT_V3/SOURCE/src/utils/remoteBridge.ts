import { Peer, type DataConnection } from 'peerjs';
import { supabase } from '../lib/supabase';

// Multi-transport WebRTC & WebSocket Bridge con STUN servers y fallback transparente
export class RemoteBridge {
  private sessionId: string;
  private mode: 'tv' | 'remote';
  private onActionCallback: ((action: string, payload: any) => void) | null = null;
  private onConnectedCallback: (() => void) | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private supabaseRoom: any = null;
  private localBc: BroadcastChannel | null = null;
  private processedMessageIds: Set<string> = new Set();
  private pingInterval: any = null;

  constructor(sessionId: string, mode: 'tv' | 'remote' = 'tv') {
    this.sessionId = sessionId.trim().toLowerCase();
    this.mode = mode;
    this.init();
  }

  private init() {
    const peerId = `youapp-pin-${this.sessionId}`;
    const channelName = `remote_${this.sessionId}`;

    const peerOptions = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    };

    // 1. PeerJS Direct WebRTC Connection
    try {
      if (this.mode === 'tv') {
        // En la TV creamos el Peer receptor con ese PIN
        this.peer = new Peer(peerId, peerOptions);

        this.peer.on('open', (id) => {
          console.log('[TV WebRTC] Ready on PIN:', id);
        });

        this.peer.on('connection', (connection) => {
          this.conn = connection;
          console.log('[TV WebRTC] Phone connected via WebRTC DataChannel!');
          if (this.onConnectedCallback) this.onConnectedCallback();

          connection.on('data', (data: any) => {
            console.log('[TV WebRTC Data Received]:', data);
            this.handleIncomingRawMessage(data);
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[TV WebRTC] Peer error (falling back to Supabase Realtime):', err);
        });
      } else {
        // En el Celular nos conectamos al Peer de la TV
        this.peer = new Peer(peerOptions);

        this.peer.on('open', () => {
          if (!this.peer) return;
          console.log('[Phone WebRTC] Connecting to TV PIN:', peerId);
          this.connectToPeer(peerId);
        });

        this.peer.on('error', (err) => {
          console.warn('[Phone WebRTC] Peer error (using Supabase Realtime):', err);
        });
      }
    } catch (e) {
      console.warn('WebRTC Peer init error:', e);
    }

    // 2. Supabase Realtime Channel (Garantiza conexión 100% en redes móviles / 4G / WiFi)
    try {
      this.supabaseRoom = supabase.channel(channelName, {
        config: { broadcast: { self: true, ack: false } }
      });

      this.supabaseRoom
        .on('broadcast', { event: 'REMOTE_ACTION' }, (e: any) => {
          console.log('[Supabase Realtime Received]:', e);
          const raw = e?.payload ?? e;
          this.handleIncomingRawMessage(raw);
        })
        .on('broadcast', { event: 'REMOTE_CONNECTED' }, () => {
          console.log('[Supabase Realtime] Remote connected signal received');
          if (this.onConnectedCallback) this.onConnectedCallback();
        })
        .subscribe((status: string) => {
          console.log('[Supabase Realtime] Room status:', status);
          if (status === 'SUBSCRIBED' && this.mode === 'remote') {
            this.notifyConnected();
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
          this.handleIncomingRawMessage(e.data?.payload);
        } else if (e.data?.event === 'REMOTE_CONNECTED') {
          if (this.onConnectedCallback) this.onConnectedCallback();
        }
      };
    } catch {}

    // Heartbeat ping para mantener activo el canal
    if (this.mode === 'remote') {
      this.pingInterval = setInterval(() => {
        this.notifyConnected();
      }, 10000);
    }
  }

  private connectToPeer(peerId: string) {
    if (!this.peer) return;
    try {
      const connection = this.peer.connect(peerId, { reliable: true });
      this.conn = connection;

      connection.on('open', () => {
        console.log('[Phone WebRTC] DataChannel open to TV!');
        if (this.onConnectedCallback) this.onConnectedCallback();
      });

      connection.on('data', (data: any) => {
        this.handleIncomingRawMessage(data);
      });
    } catch (err) {
      console.warn('[Phone WebRTC] Connect error:', err);
    }
  }

  private handleIncomingRawMessage(raw: any) {
    if (!raw) return;

    // Normalizar acción y payload
    let action: string | null = null;
    let messageId: string | null = null;
    let payload: any = {};

    if (typeof raw === 'object') {
      action = raw.action || raw.payload?.action || null;
      messageId = raw.messageId || raw.payload?.messageId || null;
      payload = raw.payload !== undefined && typeof raw.payload === 'object' && Object.keys(raw.payload).length > 0 
        ? raw.payload 
        : raw;
    }

    if (!action) return;

    // Deduplicar mensajes repetidos (enviados por WebRTC + Supabase simultáneamente)
    if (messageId) {
      if (this.processedMessageIds.has(messageId)) {
        console.log('[RemoteBridge] Deduplicating already processed message:', messageId, action);
        return;
      }
      this.processedMessageIds.add(messageId);
      if (this.processedMessageIds.size > 50) {
        const firstItem = this.processedMessageIds.values().next().value;
        if (firstItem !== undefined) {
          this.processedMessageIds.delete(firstItem);
        }
      }
    }

    console.log('[RemoteBridge Dispatching Action]:', action, payload);
    if (this.onActionCallback) {
      this.onActionCallback(action, payload);
    }
  }

  public onAction(callback: (action: string, payload: any) => void) {
    this.onActionCallback = callback;
  }

  public onConnected(callback: () => void) {
    this.onConnectedCallback = callback;
  }

  public sendAction(action: string, payload: any = {}) {
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const messageData = { action, payload, messageId, ...payload };

    console.log('[RemoteBridge Sending Action]:', action, messageData);

    // 1. Enviar vía WebRTC Direct DataChannel (Instantáneo si está abierto)
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(messageData);
      } catch (err) {
        console.warn('WebRTC send error:', err);
      }
    } else if (this.peer && this.mode === 'remote') {
      const peerId = `youapp-pin-${this.sessionId}`;
      this.connectToPeer(peerId);
    }

    // 2. Enviar vía Supabase Broadcast (Respaldo en tiempo real 100% garantizado)
    if (this.supabaseRoom) {
      try {
        this.supabaseRoom.send({
          type: 'broadcast',
          event: 'REMOTE_ACTION',
          payload: messageData
        });
      } catch (err) {
        console.warn('Supabase broadcast send error:', err);
      }
    }

    // 3. Enviar vía BroadcastChannel local (si ambas pestañas están en el mismo navegador)
    if (this.localBc) {
      try {
        this.localBc.postMessage({ event: 'REMOTE_ACTION', payload: messageData });
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
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
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
