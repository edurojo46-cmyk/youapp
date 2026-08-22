import React, { useState } from 'react';
import { X, Link as LinkIcon, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

interface AddVideoModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddVideoModal({ onClose, onSuccess }: AddVideoModalProps) {
  const { user } = useStore();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1. Detección básica del proveedor
      let provider = 'youtube';
      let videoId = '';
      let thumbnailUrl = '';
      let finalTitle = title;

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        provider = 'youtube';
        const urlObj = new URL(url.includes('http') ? url : `https://${url}`);
        videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop() || '';
        thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        if (!finalTitle) finalTitle = 'Video de YouTube (Agregado por la comunidad)';
      } else if (url.includes('twitch.tv')) {
        provider = 'twitch';
        const urlObj = new URL(url.includes('http') ? url : `https://${url}`);
        videoId = urlObj.pathname.split('/').pop() || '';
        thumbnailUrl = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800';
        if (!finalTitle) finalTitle = `Stream de Twitch: ${videoId}`;
      } else if (url.includes('instagram.com')) {
        provider = 'instagram';
        videoId = url;
        thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800';
        if (!finalTitle) finalTitle = 'Instagram Reel (Comunidad)';
      } else if (url.includes('tiktok.com')) {
        provider = 'tiktok';
        videoId = url;
        thumbnailUrl = 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=800';
        if (!finalTitle) finalTitle = 'TikTok (Comunidad)';
      } else if (url.includes('vimeo.com')) {
        provider = 'vimeo';
        const urlObj = new URL(url.includes('http') ? url : `https://${url}`);
        videoId = urlObj.pathname.split('/').pop() || '';
        thumbnailUrl = 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800';
        if (!finalTitle) finalTitle = 'Video de Vimeo (Comunidad)';
      } else {
        provider = 'web';
        videoId = url;
        if (!finalTitle) finalTitle = 'Enlace Web';
      }

      const newIndexEntry = {
        url,
        video_id: videoId,
        title: finalTitle,
        provider,
        thumbnail: thumbnailUrl,
        added_by: user?.id || null, 
      };

      const { error: insertError } = await supabase
        .from('youapp_index')
        .insert([newIndexEntry]);

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al agregar el video al índice.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-video-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="modal-header">
          <div className="header-icon-wrapper">
            <Plus size={24} color="#00f0ff" />
          </div>
          <h2>Agregar al YouApp Index</h2>
          <p>Comparte un video con la comunidad.</p>
        </div>

        {success ? (
          <div className="success-state">
            <CheckCircle size={48} color="#00f0ff" />
            <h3>¡Video Agregado!</h3>
            <p>Ya forma parte de nuestra base de datos colectiva.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="add-video-form">
            <div className="input-group">
              <label>Enlace del Video (URL)</label>
              <div className="input-with-icon">
                <LinkIcon size={18} className="input-icon" />
                <input
                  type="url"
                  placeholder="Ej: https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="input-group">
              <label>Título (Opcional)</label>
              <input
                type="text"
                placeholder="Deja en blanco para auto-generar"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading || !url}>
              {loading ? 'Agregando...' : 'Agregar Video'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        .add-video-modal {
          max-width: 400px;
          padding: 2rem;
          background: rgba(20, 20, 25, 0.95);
          border: 1px solid rgba(0, 240, 255, 0.2);
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.1);
        }

        .modal-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .header-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(0, 240, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .modal-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          background: linear-gradient(135deg, #fff, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .modal-header p {
          color: #9ca3af;
          margin: 0;
          font-size: 0.9rem;
        }

        .add-video-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .input-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #d1d5db;
        }

        .input-with-icon {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #6b7280;
        }

        .input-with-icon input {
          padding-left: 2.75rem;
        }

        input {
          width: 100%;
          padding: 0.875rem 1rem;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          transition: all 0.2s;
        }

        input:focus {
          outline: none;
          border-color: #00f0ff;
          box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.1);
        }

        .submit-btn {
          margin-top: 0.5rem;
          padding: 1rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #00f0ff, #a78bfa);
          color: #050505;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.2s, opacity 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .submit-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #ef4444;
          font-size: 0.85rem;
          background: rgba(239, 68, 68, 0.1);
          padding: 0.75rem;
          border-radius: 8px;
        }

        .success-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 1rem;
          padding: 2rem 0;
          animation: scaleUp 0.3s ease-out forwards;
        }

        .success-state h3 {
          margin: 0;
          color: white;
        }

        .success-state p {
          margin: 0;
          color: #9ca3af;
        }

        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
