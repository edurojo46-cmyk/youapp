import { useState } from 'react';
import { Mail, Sparkles, ArrowRight, Loader2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EmailGateModalProps {
  channelId: string;
  channelName: string;
  onUnlocked: () => void;
}

export default function EmailGateModal({ channelId, channelName, onUnlocked }: EmailGateModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !channelId) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.from('channel_subscribers').insert({
        channel_id: channelId,
        email: email.trim().toLowerCase(),
        name: name.trim() || null
      });

      // Si ya existe (duplicate key), igual lo dejamos pasar
      if (error && error.code !== '23505') {
        throw error;
      }

      localStorage.setItem(`subscribed_${channelId}`, 'true');
      onUnlocked();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al suscribirse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="email-gate-overlay">
      <div className="email-gate-card glass-panel">
        <div className="gate-icon-circle">
          <Lock size={32} className="text-accent" />
        </div>

        <h2>Transmisión Exclusiva</h2>
        <p className="gate-sub">
          Suscríbete con tu correo para acceder a la transmisión 24/7 y la comunidad en vivo de <strong>{channelName}</strong>.
        </p>

        <form onSubmit={handleSubmit} className="gate-form">
          <div className="input-field">
            <input 
              type="text" 
              placeholder="Tu nombre (opcional)" 
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="input-field">
            <input 
              type="email" 
              placeholder="Tu correo electrónico *" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {errorMsg && <p className="error-text">{errorMsg}</p>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={18} /> : (
              <>
                <span>Acceder a la Transmisión</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <span className="privacy-note">
          🔒 No enviamos spam. Tus datos van directo al creador del canal.
        </span>
      </div>

      <style>{`
        .email-gate-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(5, 7, 12, 0.9);
          backdrop-filter: blur(25px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .email-gate-card {
          width: 100%;
          max-width: 440px;
          padding: 36px 28px;
          text-align: center;
          border-radius: 20px;
          background: rgba(15, 17, 26, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          animation: popIn 0.3s ease-out;
        }

        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .gate-icon-circle {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        }

        .email-gate-card h2 {
          font-size: 1.4rem;
          margin: 0 0 8px 0;
          color: white;
        }

        .gate-sub {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 24px 0;
          line-height: 1.4;
        }

        .gate-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-field input {
          width: 100%;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 12px 16px;
          border-radius: 10px;
          color: white;
          font-size: 0.95rem;
          outline: none;
          box-sizing: border-box;
        }

        .input-field input:focus {
          border-color: #6366f1;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 700;
          font-size: 1rem;
          margin-top: 6px;
        }

        .error-text {
          color: #ef4444;
          font-size: 0.8rem;
          margin: 0;
        }

        .privacy-note {
          display: block;
          margin-top: 18px;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </div>
  );
}
