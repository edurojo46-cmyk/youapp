import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ThumbsUp, ThumbsDown, Share2, Maximize2, Loader2, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import SyncedTVPlayer from '../components/SyncedTVPlayer';

export default function MyStream() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedChannelId = searchParams.get('channelId');
  const requestedProgId = searchParams.get('progId');

  const { user } = useStore();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showUI, setShowUI] = useState(true);
  const uiTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const fetchProgram = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        let channelIds: string[] = [];

        if (requestedChannelId) {
          channelIds = [requestedChannelId];
        } else {
          // 1. Fetch user's channels first
          const { data: userChannels, error: chError } = await supabase
            .from('channels')
            .select('id')
            .eq('user_id', user.id);
            
          if (chError || !userChannels || userChannels.length === 0) {
            setLoading(false);
            return;
          }
          channelIds = userChannels.map(c => c.id);
        }

        // 2. Fetch programming for those channels
        const { data, error } = await supabase
          .from('programming')
          .select(`
            id,
            start_time,
            end_time,
            created_at,
            videos (*),
            channels (*)
          `)
          .in('channel_id', channelIds)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          const formattedQueue = data.map((item: any) => ({
            id: item.id,
            provider: item.videos?.provider || 'youtube',
            category: item.channels?.category || 'General',
            title: item.videos?.title || 'Video Desconocido',
            source: item.channels?.name || 'Canal',
            author: item.videos?.author || '',
            videoId: (item.videos?.id || '').replace('yt-', '').replace('https://www.youtube.com/embed/', ''),
            url: `https://www.youtube.com/embed/${(item.videos?.id || '').replace('yt-', '').replace('https://www.youtube.com/embed/', '')}`
          }));
          setQueue(formattedQueue);

          // Si pidió un video en particular, arrancar desde ese
          if (requestedProgId) {
            const foundIdx = formattedQueue.findIndex(v => v.id === requestedProgId);
            if (foundIdx !== -1) {
              setCurrentIndex(foundIdx);
            }
          }
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProgram();
  }, [user, requestedChannelId, requestedProgId]);

  const currentVideo = queue[currentIndex];

  const handleVideoEnd = () => {
    if (queue.length > 0) {
      setCurrentIndex(prev => (prev + 1) % queue.length);
    }
  };

  const handleUserActivity = () => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => {
      setShowUI(false);
    }, 4000);
  };

  if (loading) {
    return <div style={{height: '100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#000', color:'white'}}><Loader2 className="animate-spin" size={48}/></div>;
  }

  if (!currentVideo) {
    return <div style={{height: '100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#000', color:'white'}}>No hay programación. Buscá videos y programalos.</div>;
  }

  return (
    <div 
      className="stream-container"
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
    >
        <div className="video-container" style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          <SyncedTVPlayer
            url={`https://www.youtube.com/embed/${currentVideo.videoId}`}
            isMuted={isMuted}
            onUnmute={() => setIsMuted(false)}
            onVideoEnded={handleVideoEnd}
            targetOffsetSeconds={0}
            channelName={currentVideo.source}
          />
        </div>


      {/* UI Overlay que simula nuestra TV */}
      <div className={`ui-overlay ${showUI ? 'visible' : 'hidden'}`} style={{ pointerEvents: showUI ? 'auto' : 'none' }}>
        
        <header className="stream-header">
          <button className="icon-btn glass-panel" onClick={() => navigate('/')}>
            <ChevronLeft size={24} />
          </button>
          <div className="stream-info glass-panel">
            <span className="live-badge">MI CANAL</span>
            <span className="source-name">{currentVideo.category}</span>
          </div>
          <button className="icon-btn glass-panel">
            <Maximize2 size={20} />
          </button>
        </header>

        <div className="stream-footer">
          <div className="video-meta">
            <h2>{currentVideo.title}</h2>
            <p>{currentVideo.source} • {currentVideo.provider.toUpperCase()}</p>
          </div>
          
          <div className="actions-bar glass-panel">
            <button className="action-btn" title="No me interesa (Salta)" onClick={handleVideoEnd}>
              <ThumbsDown size={24} />
            </button>
            <div className="divider"></div>
            <button className="action-btn" title="Me interesa (Afinar)">
              <ThumbsUp size={24} />
            </button>
            <div className="divider"></div>
            <button className="action-btn" title="Compartir canal">
              <Share2 size={24} />
            </button>
          </div>
        </div>

      </div>

      <style>{`
        .stream-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          background: #000;
          overflow: hidden;
        }

        .player-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          /* Hacemos que los clics en el video pasen a nuestro contenedor o al player original dependiendo de la necesidad */
          pointer-events: none; 
        }

        .react-player {
          pointer-events: auto; /* El iframe interno puede recibir clics si queremos */
        }

        .ui-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: var(--space-lg);
          background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 15%, transparent 75%, rgba(0,0,0,0.9) 100%);
          transition: opacity var(--transition-normal);
        }

        .ui-overlay.hidden {
          opacity: 0;
        }

        .ui-overlay.visible {
          opacity: 1;
        }

        .stream-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .icon-btn {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          color: white;
          cursor: pointer;
          border-radius: 50%;
        }

        .stream-info {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-lg);
          border-radius: var(--radius-full);
        }

        .live-badge {
          background: var(--accent-gradient);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 800;
        }

        .source-name {
          font-weight: 500;
          font-size: 0.9rem;
        }

        .stream-footer {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          margin-bottom: var(--space-xl);
        }

        .video-meta h2 {
          font-size: 2rem;
          margin-bottom: var(--space-xs);
          text-shadow: 0 2px 10px rgba(0,0,0,0.8);
        }

        .video-meta p {
          color: rgba(255,255,255,0.8);
          font-size: 1.1rem;
          text-shadow: 0 1px 5px rgba(0,0,0,0.8);
        }

        .actions-bar {
          display: flex;
          align-items: center;
          justify-content: space-around;
          padding: var(--space-sm);
          border-radius: var(--radius-full);
          width: fit-content;
          gap: var(--space-sm);
        }

        .action-btn {
          background: transparent;
          border: none;
          color: white;
          padding: var(--space-md);
          cursor: pointer;
          border-radius: 50%;
          transition: transform var(--transition-fast), color var(--transition-fast);
        }

        .action-btn:hover {
          transform: scale(1.1);
          color: var(--accent-secondary);
        }

        .divider {
          width: 1px;
          height: 24px;
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
