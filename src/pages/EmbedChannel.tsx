import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { VolumeX, Radio, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateCurrentLiveProgram, type TVProgramItem, type SyncState } from '../utils/tvEngine';

export default function EmbedChannel() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();

  const [channel, setChannel] = useState<any>(null);
  const [programming, setProgramming] = useState<TVProgramItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const fetchEmbedData = async () => {
      if (!idOrSlug) return;
      setLoading(true);

      try {
        let query = supabase.from('channels').select('*');
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
        
        if (isUUID) {
          query = query.eq('id', idOrSlug);
        } else {
          query = query.eq('slug', idOrSlug);
        }

        const { data: channelData } = await query.single();
        if (!channelData) return;

        setChannel(channelData);

        const { data: progData } = await supabase
          .from('programming')
          .select('*, videos(*)')
          .eq('channel_id', channelData.id)
          .order('start_time', { ascending: true });

        if (progData && progData.length > 0) {
          setProgramming(progData as TVProgramItem[]);
          setSyncState(calculateCurrentLiveProgram(progData as TVProgramItem[], channelData.is_24_7 !== false));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchEmbedData();
  }, [idOrSlug]);

  // Auto-avanzar cuando finaliza el video en el embed
  useEffect(() => {
    if (programming.length === 0 || !channel || !syncState) return;

    const currentDurSec = syncState.currentProgram.videos?.duration
      ? (syncState.currentProgram.videos.duration.split(':').length === 3
          ? Number(syncState.currentProgram.videos.duration.split(':')[0]) * 3600 + Number(syncState.currentProgram.videos.duration.split(':')[1]) * 60 + Number(syncState.currentProgram.videos.duration.split(':')[2])
          : Number(syncState.currentProgram.videos.duration.split(':')[0]) * 60 + Number(syncState.currentProgram.videos.duration.split(':')[1]))
      : 300;

    const remainingSec = Math.max(1, currentDurSec - syncState.offsetSeconds);

    const timer = setTimeout(() => {
      setSyncState(calculateCurrentLiveProgram(programming, channel.is_24_7 !== false));
    }, remainingSec * 1000);

    return () => clearTimeout(timer);
  }, [programming, channel, syncState?.currentProgram?.id]);

  if (loading) {
    return (
      <div style={{ height: '100vh', background: '#000', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (!channel || !syncState) {
    return (
      <div style={{ height: '100vh', background: '#000', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Canal no disponible</p>
      </div>
    );
  }

  const currentVideo = syncState.currentProgram.videos;
  const rawVideoId = currentVideo.id.replace('yt-', '');

  return (
    <div className="embed-player-container">
      <iframe
        key={`${rawVideoId}_${syncState.offsetSeconds}`}
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${rawVideoId}?autoplay=1&mute=${isMuted ? 1 : 0}&start=${syncState.offsetSeconds}&controls=1`}
        title={currentVideo.title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{ width: '100vw', height: '100vh', border: 'none' }}
      />

      {isMuted && (
        <button 
          onClick={() => setIsMuted(false)} 
          className="embed-unmute-btn"
        >
          <VolumeX size={16} />
          <span>Activar Sonido</span>
        </button>
      )}

      {/* Mini Watermark Branding */}
      <a 
        href={`https://youapp.com/c/${channel.slug || channel.id}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="embed-badge"
      >
        <Radio size={12} color="#ef4444" />
        <span>{channel.name} en <strong>YouApp TV</strong></span>
        <ExternalLink size={10} />
      </a>

      <style>{`
        .embed-player-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: #000;
        }

        .embed-unmute-btn {
          position: absolute;
          top: 15px;
          left: 15px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(99, 102, 241, 0.9);
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }

        .embed-badge {
          position: absolute;
          bottom: 12px;
          right: 12px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(15, 17, 26, 0.8);
          color: white;
          text-decoration: none;
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
        }
      `}</style>
    </div>
  );
}
