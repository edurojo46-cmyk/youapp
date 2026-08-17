import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X, Users, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

interface Message {
  id: string;
  channel_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface LiveChatProps {
  channelId: string;
  channelName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LiveChat({ channelId, channelName, isOpen, onClose }: LiveChatProps) {
  const { user } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem('youapp_guest_name') || `Espectador_${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channelId) return;

    // 1. Cargar historial inicial de mensajes
    const fetchInitialMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchInitialMessages();

    // 2. Suscribirse a nuevos mensajes en tiempo real vía WebSockets
    const channel = supabase
      .channel(`chat_${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${channelId}`
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !channelId) return;

    const senderName = user?.email?.split('@')[0] || guestName;
    const content = inputMessage.trim();
    setInputMessage('');

    try {
      const { error } = await supabase.from('chat_messages').insert({
        channel_id: channelId,
        user_id: user?.id || null,
        user_name: senderName,
        content: content
      });

      if (error) {
        console.error("Error enviando mensaje:", error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('youapp_guest_name', guestName);
    setIsEditingName(false);
  };

  if (!isOpen) return null;

  return (
    <div className="live-chat-panel glass-panel">
      <header className="chat-header">
        <div className="header-title">
          <MessageSquare size={18} className="text-accent" />
          <h4>Chat en Vivo</h4>
          <span className="live-pill">🔴 EN VIVO</span>
        </div>
        <button className="icon-btn-sm" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      {/* Identidad del usuario */}
      <div className="user-badge">
        <Users size={14} />
        {user ? (
          <span>{user.email?.split('@')[0]} (Registrado)</span>
        ) : isEditingName ? (
          <form onSubmit={handleSaveName} style={{ display: 'flex', gap: '6px', width: '100%' }}>
            <input 
              type="text" 
              value={guestName} 
              onChange={(e) => setGuestName(e.target.value)} 
              maxLength={20}
              className="name-input"
              autoFocus
            />
            <button type="submit" className="save-btn">OK</button>
          </form>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span>Tú: <strong>{guestName}</strong></span>
            <button className="edit-btn" onClick={() => setIsEditingName(true)}>Cambiar</button>
          </div>
        )}
      </div>

      {/* Lista de mensajes */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <Sparkles size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
            <p>¡Sé el primero en comentar en la transmisión de {channelName || 'este canal'}!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = user ? msg.user_name === user.email?.split('@')[0] : msg.user_name === guestName;
            return (
              <div key={msg.id} className={`chat-message ${isMe ? 'my-message' : ''}`}>
                <div className="msg-header">
                  <span className="msg-author">{msg.user_name}</span>
                  <span className="msg-time">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="msg-content">{msg.content}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de envío */}
      <form onSubmit={handleSendMessage} className="chat-input-form">
        <input
          type="text"
          placeholder="Escribe un mensaje en vivo..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          maxLength={300}
        />
        <button type="submit" disabled={!inputMessage.trim()} className="send-btn">
          <Send size={16} />
        </button>
      </form>

      <style>{`
        .live-chat-panel {
          position: absolute;
          right: 20px;
          bottom: 20px;
          width: 320px;
          height: 480px;
          max-height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
          z-index: 50;
          border-radius: 16px;
          overflow: hidden;
          background: rgba(15, 17, 26, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-title h4 {
          margin: 0;
          font-size: 0.95rem;
          color: white;
        }

        .live-pill {
          font-size: 0.65rem;
          font-weight: bold;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.2);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .icon-btn-sm {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .icon-btn-sm:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .user-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 16px;
          background: rgba(255, 255, 255, 0.05);
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .edit-btn, .save-btn {
          background: none;
          border: none;
          color: #6366f1;
          font-size: 0.75rem;
          cursor: pointer;
          text-decoration: underline;
        }

        .name-input {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          width: 120px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .empty-chat {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.85rem;
          padding: 20px;
        }

        .chat-message {
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.05);
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 0.85rem;
          max-width: 90%;
          align-self: flex-start;
        }

        .chat-message.my-message {
          align-self: flex-end;
          background: rgba(99, 102, 241, 0.25);
          border: 1px solid rgba(99, 102, 241, 0.4);
        }

        .msg-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 2px;
        }

        .msg-author {
          font-weight: 700;
          font-size: 0.75rem;
          color: #a5b4fc;
        }

        .msg-time {
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .msg-content {
          margin: 0;
          color: rgba(255, 255, 255, 0.95);
          word-break: break-word;
          line-height: 1.3;
        }

        .chat-input-form {
          display: flex;
          padding: 10px;
          gap: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .chat-input-form input {
          flex: 1;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 8px 12px;
          border-radius: 20px;
          color: white;
          font-size: 0.85rem;
          outline: none;
        }

        .chat-input-form input:focus {
          border-color: #6366f1;
        }

        .send-btn {
          background: #6366f1;
          color: white;
          border: none;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s, background 0.15s;
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .send-btn:not(:disabled):hover {
          transform: scale(1.05);
          background: #4f46e5;
        }

        @media (max-width: 600px) {
          .live-chat-panel {
            right: 10px;
            left: 10px;
            bottom: 10px;
            width: auto;
            height: 360px;
          }
        }
      `}</style>
    </div>
  );
}
