import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface FloatingEmoji {
  id: number;
  emoji: string;
  leftPercent: number;
}

const EMOJI_OPTIONS = ['🔥', '❤️', '👏', '🚀', '🤯', '🍿'];

export default function EmojiReactions({ channelId }: { channelId: string }) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [channelRef, setChannelRef] = useState<any>(null);

  useEffect(() => {
    if (!channelId) return;

    // Crear canal de broadcast para reacciones en vivo
    const reactionChannel = supabase.channel(`reactions_${channelId}`, {
      config: { broadcast: { self: true } }
    });

    reactionChannel
      .on('broadcast', { event: 'new_reaction' }, (payload) => {
        const { emoji, leftPercent } = payload.payload;
        addFloatingEmoji(emoji, leftPercent);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannelRef(reactionChannel);
        }
      });

    return () => {
      supabase.removeChannel(reactionChannel);
    };
  }, [channelId]);

  const addFloatingEmoji = (emoji: string, leftPercent: number) => {
    const newEmoji: FloatingEmoji = {
      id: Date.now() + Math.random(),
      emoji,
      leftPercent
    };

    setFloatingEmojis((prev) => [...prev, newEmoji]);

    // Eliminar después de que termine la animación (2.5 segundos)
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id));
    }, 2400);
  };

  const handleSendReaction = (emoji: string) => {
    const randomLeft = 70 + Math.random() * 25; // lado derecho entre 70% y 95%
    if (channelRef) {
      channelRef.send({
        type: 'broadcast',
        event: 'new_reaction',
        payload: { emoji, leftPercent: randomLeft }
      });
    } else {
      addFloatingEmoji(emoji, randomLeft);
    }
  };

  return (
    <div className="emoji-reactions-container">
      {/* Emojis flotantes animados */}
      <div className="floating-area">
        {floatingEmojis.map((item) => (
          <span
            key={item.id}
            className="floating-item"
            style={{ left: `${item.leftPercent}%` }}
          >
            {item.emoji}
          </span>
        ))}
      </div>

      {/* Botones de disparo */}
      <div className="emoji-trigger-bar glass-panel">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            className="emoji-btn"
            onClick={() => handleSendReaction(emoji)}
            title={`Reaccionar con ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <style>{`
        .emoji-reactions-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 40;
          overflow: hidden;
        }

        .floating-area {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .floating-item {
          position: absolute;
          bottom: 70px;
          font-size: 2.2rem;
          animation: floatUp 2.4s ease-out forwards;
          user-select: none;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
        }

        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0.6) rotate(0deg);
          }
          15% {
            opacity: 1;
            transform: translateY(-40px) scale(1.3) rotate(-10deg);
          }
          50% {
            transform: translateY(-160px) scale(1.1) rotate(15deg);
          }
          80% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: translateY(-320px) scale(0.8) rotate(-10deg);
          }
        }

        .emoji-trigger-bar {
          position: absolute;
          right: 20px;
          bottom: 80px;
          display: flex;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 30px;
          pointer-events: auto;
          background: rgba(15, 17, 26, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }

        .emoji-btn {
          background: transparent;
          border: none;
          font-size: 1.3rem;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 50%;
          transition: transform 0.15s, background 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .emoji-btn:hover {
          transform: scale(1.35);
          background: rgba(255, 255, 255, 0.15);
        }

        .emoji-btn:active {
          transform: scale(0.9);
        }

        @media (max-width: 600px) {
          .emoji-trigger-bar {
            right: 15px;
            bottom: 75px;
            padding: 4px 8px;
          }
          .emoji-btn {
            font-size: 1.1rem;
            padding: 2px 4px;
          }
        }
      `}</style>
    </div>
  );
}
