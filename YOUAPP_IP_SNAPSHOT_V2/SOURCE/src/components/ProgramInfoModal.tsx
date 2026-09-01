import { useState, useEffect } from 'react';
import { Sparkles, Bookmark, X, Check, Clock, ExternalLink, Trash2 } from 'lucide-react';

interface ProgramInfoModalProps {
  channel: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProgramInfoModal({ channel, isOpen, onClose }: ProgramInfoModalProps) {
  const [noteText, setNoteText] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [savedMoments, setSavedMoments] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('youapp_saved_moments') || '[]');
    } catch {
      return [];
    }
  });

  const handleSaveMoment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel) return;

    const newMoment = {
      id: `${channel.id}_${Date.now()}`,
      channelName: channel.name,
      videoTitle: channel.currentVideoTitle || channel.name,
      videoUrl: channel.videoUrl,
      note: noteText.trim() || 'Momento guardado para ver luego',
      savedAt: new Date().toLocaleDateString()
    };

    const updated = [newMoment, ...savedMoments];
    setSavedMoments(updated);
    localStorage.setItem('youapp_saved_moments', JSON.stringify(updated));
    setNoteText('');
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleDeleteMoment = (id: string) => {
    const updated = savedMoments.filter(m => m.id !== id);
    setSavedMoments(updated);
    localStorage.setItem('youapp_saved_moments', JSON.stringify(updated));
  };

  if (!isOpen || !channel) return null;

  return (
    <div className="program-info-overlay" onClick={onClose}>
      <div className="program-info-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="info-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} className="text-accent" />
            <h3>Ficha del Programa e Ideas Clave</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="info-body">
          <h2 dangerouslySetInnerHTML={{ __html: channel.currentVideoTitle || channel.name }}></h2>
          <p className="channel-sub">
            Transmitido por: <strong>{channel.name}</strong> • Categoría: <span>{channel.category || 'General'}</span>
          </p>

          {/* Resumen Inteligente */}
          <div className="ai-summary-box">
            <div className="summary-badge">
              <Sparkles size={14} /> Resumen Inteligente
            </div>
            <ul>
              <li>📌 <strong>Tema Principal:</strong> Exploración y análisis detallado sobre {channel.category || 'el contenido audiovisual'}.</li>
              <li>⏱️ <strong>Duración:</strong> Formato continuo 24/7 optimizado para máxima inmersión.</li>
              <li>🎯 <strong>Recomendación:</strong> Ideal para ver de forma relajada o escuchar de fondo mientras trabajas.</li>
            </ul>
          </div>

          {/* Guardar Momento en Biblioteca Personal */}
          <form className="bookmark-form" onSubmit={handleSaveMoment}>
            <label>📌 Guardar este momento en mi biblioteca:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Escribe una nota personal (ej. revisar min 15)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px 12px', color: 'white' }}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                {isSaved ? <Check size={16} /> : <Bookmark size={16} />} {isSaved ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </form>

          {/* Lista de Momentos Guardados */}
          {savedMoments.length > 0 && (
            <div className="saved-moments-section">
              <h4>Mis Momentos Guardados ({savedMoments.length}):</h4>
              <div className="moments-scroll">
                {savedMoments.map((m) => (
                  <div key={m.id} className="moment-item">
                    <div>
                      <p className="moment-title" dangerouslySetInnerHTML={{ __html: m.videoTitle }}></p>
                      <span className="moment-note">"{m.note}" • {m.savedAt}</span>
                    </div>
                    <button className="del-btn" onClick={() => handleDeleteMoment(m.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .program-info-overlay {
          position: fixed;
          inset: 0;
          z-index: 130;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        .program-info-card {
          width: 100%;
          max-width: 520px;
          max-height: 85vh;
          overflow-y: auto;
          padding: 24px;
          border-radius: 20px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }

        .info-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .info-header h3 {
          margin: 0;
          font-size: 1.05rem;
        }

        .info-body h2 {
          font-size: 1.15rem;
          line-height: 1.3;
          margin: 0 0 6px 0;
        }

        .channel-sub {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 16px;
        }

        .channel-sub span {
          color: #a5b4fc;
        }

        .ai-summary-box {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          padding: 14px;
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .summary-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 800;
          color: #a5b4fc;
          margin-bottom: 8px;
        }

        .ai-summary-box ul {
          margin: 0;
          padding-left: 18px;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
        }

        .bookmark-form {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 20px;
        }

        .bookmark-form label {
          font-size: 0.8rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.8);
        }

        .saved-moments-section h4 {
          font-size: 0.85rem;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.7);
        }

        .moments-scroll {
          max-height: 140px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .moment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.05);
          padding: 8px 12px;
          border-radius: 8px;
        }

        .moment-title {
          font-size: 0.8rem;
          font-weight: 600;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 380px;
        }

        .moment-note {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .del-btn {
          background: none;
          border: none;
          color: rgba(239, 68, 68, 0.7);
          cursor: pointer;
        }

        .del-btn:hover {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
