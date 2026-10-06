import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tv, MapPin, Heart, ListPlus, X, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function ShareTarget() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useStore();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sharedUrl = params.get('url') || '';
    const sharedTitle = params.get('title') || params.get('text') || '';
    
    if (sharedUrl) {
      setUrl(sharedUrl);
      setTitle(sharedTitle);
    } else {
      // Si no hay URL, volver al inicio
      navigate('/', { replace: true });
    }
  }, [location, navigate]);

  const handleSaveToDatabase = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);

    try {
      let provider = 'web';
      let videoId = url;
      let thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800';
      let finalTitle = title || 'Video Compartido';

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        provider = 'youtube';
        const urlObj = new URL(url.includes('http') ? url : `https://${url}`);
        videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop() || '';
        thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      } else if (url.includes('twitch.tv')) {
        provider = 'twitch';
      } else if (url.includes('instagram.com')) {
        provider = 'instagram';
      } else if (url.includes('tiktok.com')) {
        provider = 'tiktok';
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
        navigate('/', { replace: true });
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar el video.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToMySignal = () => {
    // Redirigir a crear señal pasando la URL
    navigate('/create-signal', { state: { initialVideoUrl: url, initialTitle: title } });
  };

  if (!url) return null;

  return (
    <div className="share-target-page">
      <div className="share-modal">
        <button className="close-btn" onClick={() => navigate('/')}>
          <X size={24} />
        </button>

        <div className="share-header">
          <h2>¿Qué querés hacer con este contenido?</h2>
          <p className="url-preview">{url}</p>
        </div>

        {success ? (
          <div className="share-success">
            <CheckCircle size={64} color="#00f0ff" />
            <h3>¡Guardado correctamente!</h3>
            <p>Ya forma parte de YouApp TV.</p>
          </div>
        ) : (
          <div className="share-actions">
            <button className="share-action-btn primary" onClick={handleAddToMySignal} disabled={loading}>
              <div className="icon-wrap purple"><Tv size={24} /></div>
              <div className="text-wrap">
                <h4>Agregar a Mi Señal</h4>
                <p>Prográmalo en tu canal de TV</p>
              </div>
            </button>

            <button className="share-action-btn" onClick={handleSaveToDatabase} disabled={loading}>
              <div className="icon-wrap red"><Heart size={24} /></div>
              <div className="text-wrap">
                <h4>Guardar</h4>
                <p>Añadir al YouApp Index</p>
              </div>
            </button>

            <button className="share-action-btn secondary" onClick={() => alert('Próximamente')} disabled={loading}>
              <div className="icon-wrap blue"><MapPin size={24} /></div>
              <div className="text-wrap">
                <h4>Guardar Momento</h4>
                <p>Seleccionar un fragmento</p>
              </div>
            </button>

            <button className="share-action-btn secondary" onClick={() => alert('Próximamente')} disabled={loading}>
              <div className="icon-wrap orange"><ListPlus size={24} /></div>
              <div className="text-wrap">
                <h4>Agregar a una lista</h4>
                <p>Guardar en tus colecciones</p>
              </div>
            </button>

            {error && (
              <div className="share-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .share-target-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(5, 5, 5, 0.9);
          backdrop-filter: blur(10px);
        }

        .share-modal {
          background: rgba(20, 20, 25, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 32px 24px;
          width: 100%;
          max-width: 400px;
          position: relative;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .share-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .share-header h2 {
          font-size: 1.4rem;
          margin: 0 0 12px 0;
          color: white;
        }

        .url-preview {
          color: #a78bfa;
          font-size: 0.85rem;
          word-break: break-all;
          background: rgba(167, 139, 250, 0.1);
          padding: 8px 12px;
          border-radius: 8px;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .share-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .share-action-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          color: white;
        }

        .share-action-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
          transform: translateY(-2px);
        }

        .share-action-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .share-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .icon-wrap.purple { background: rgba(167, 139, 250, 0.2); color: #c084fc; }
        .icon-wrap.red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .icon-wrap.blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        .icon-wrap.orange { background: rgba(249, 115, 22, 0.2); color: #fb923c; }

        .text-wrap h4 {
          margin: 0 0 4px 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .text-wrap p {
          margin: 0;
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .share-success {
          text-align: center;
          padding: 2rem 0;
          animation: scaleUp 0.3s ease-out;
        }

        .share-success h3 {
          margin: 1rem 0 0.5rem 0;
        }

        .share-success p {
          color: #9ca3af;
        }

        .share-error {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          padding: 12px;
          border-radius: 12px;
          margin-top: 8px;
          font-size: 0.9rem;
        }

        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
