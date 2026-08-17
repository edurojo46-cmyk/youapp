import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Plus, Play, Check, Loader2, ListVideo, Sparkles, AlertCircle } from 'lucide-react';
import { searchYouTube, fetchPlaylistVideos, extractPlaylistId } from '../lib/youtube';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function SearchAndProgram() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'search' | 'playlist'>('search');
  
  // Estado para búsqueda individual
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [programmed, setProgrammed] = useState(false);

  // Estado para importador de Playlist
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistVideos, setPlaylistVideos] = useState<any[]>([]);
  const [isScanningPlaylist, setIsScanningPlaylist] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importStats, setImportStats] = useState({ count: 0, channelName: '' });
  
  const [userChannels, setUserChannels] = useState<any[]>([]);
  const { user } = useStore();

  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user]);

  const fetchChannels = async () => {
    try {
      const { data: ownChannels } = await supabase.from('channels').select('*').eq('user_id', user?.id);
      
      const { data: collabData } = await supabase
        .from('channel_collaborators')
        .select('channels(*)')
        .eq('user_id', user?.id);

      const collabChannels = collabData ? collabData.map((c: any) => c.channels).filter(Boolean) : [];
      const all = [...(ownChannels || []), ...collabChannels];
      setUserChannels(all);
    } catch (e) {
      console.error(e);
    }
  };

  // Efecto de búsqueda con debounce
  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const data = await searchYouTube(query);
      setResults(data);
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleProgram = (video: any) => {
    setSelectedVideo(video);
    setShowModal(true);
    setProgrammed(false);
  };

  const createChannel = async () => {
    if (!user) return alert("Debes iniciar sesión");
    const name = prompt("Nombre del canal:");
    if (!name) return;
    
    // Generar un slug amigable
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    try {
      const { data, error } = await supabase.from('channels').insert({
        user_id: user.id,
        name,
        slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
        category: "General",
        is_24_7: true
      }).select();
      
      if (!error && data) {
        setUserChannels([...userChannels, data[0]]);
        return data[0];
      }
    } catch (e) {
      console.error(e);
    }
  };

  const confirmProgram = async (channelId: string) => {
    if (!selectedVideo || !user) return;

    try {
      // 1. Insert video
      const { error: videoError } = await supabase.from('videos').insert({
        id: selectedVideo.id,
        title: selectedVideo.title,
        author: selectedVideo.author,
        duration: selectedVideo.duration,
        thumbnail: selectedVideo.thumbnail,
        provider: selectedVideo.provider
      });
      
      if (videoError && videoError.code !== '23505') {
        console.error("Error insertando video:", videoError);
        alert(`Error guardando video: ${videoError.message || JSON.stringify(videoError)}`);
        throw videoError;
      }

      // 2. Programarlo
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);

      const { error: progError } = await supabase.from('programming').insert({
        channel_id: channelId,
        video_id: selectedVideo.id,
        start_time: now.toISOString(),
        end_time: end.toISOString()
      });

      if (progError) {
        alert(`Error programando: ${progError.message || JSON.stringify(progError)}`);
        throw progError;
      }

    } catch (error: any) {
      console.error("Error guardando en base de datos", error);
      return;
    }

    setProgrammed(true);
    setTimeout(() => {
      setShowModal(false);
    }, 1500);
  };

  // Escanear Playlist de YouTube
  const handleScanPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const playlistId = extractPlaylistId(playlistUrl);

    if (!playlistId) {
      alert("Por favor pega un enlace válido de lista de reproducción de YouTube (ej. con 'list=PL...')");
      return;
    }

    setIsScanningPlaylist(true);
    setPlaylistVideos([]);
    try {
      const items = await fetchPlaylistVideos(playlistId);
      if (items.length === 0) {
        alert("No se encontraron videos públicos en esta playlist.");
      } else {
        setPlaylistVideos(items);
      }
    } catch (err: any) {
      alert(`Error al escanear playlist: ${err.message}`);
    } finally {
      setIsScanningPlaylist(false);
    }
  };

  // Importación Masiva de Playlist a un Canal
  const handleImportPlaylistToChannel = async (channelId: string) => {
    if (playlistVideos.length === 0 || !user) return;

    setIsImporting(true);
    try {
      // 1. Guardar todos los videos en la tabla 'videos'
      const videosPayload = playlistVideos.map(v => ({
        id: v.id,
        title: v.title,
        author: v.author,
        duration: v.duration,
        thumbnail: v.thumbnail,
        provider: 'youtube'
      }));

      // Inserción masiva de videos ignorando duplicados
      for (const v of videosPayload) {
        await supabase.from('videos').insert(v);
      }

      // 2. Programar en secuencia cronológica continua
      let currentStartTime = new Date();
      const programmingPayload = playlistVideos.map((v) => {
        const durSec = v.durationSeconds || 300;
        const endTime = new Date(currentStartTime.getTime() + durSec * 1000);
        const item = {
          channel_id: channelId,
          video_id: v.id,
          start_time: currentStartTime.toISOString(),
          end_time: endTime.toISOString()
        };
        currentStartTime = endTime;
        return item;
      });

      const { error: progErr } = await supabase.from('programming').insert(programmingPayload);

      if (progErr) throw progErr;

      const targetChannel = userChannels.find(c => c.id === channelId);
      setImportStats({ count: playlistVideos.length, channelName: targetChannel?.name || 'tu canal' });
      setImportSuccess(true);
      setPlaylistVideos([]);
      setPlaylistUrl("");

    } catch (err: any) {
      console.error(err);
      alert(`Error en la importación: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="search-container">
      {/* Selector de Pestañas Superior */}
      <div className="tab-switcher glass-panel">
        <button 
          className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={18} />
          <span>Buscar Video Individual</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlist')}
        >
          <Sparkles size={18} className="text-accent" />
          <span>⚡ Importar Playlist Completa</span>
        </button>
      </div>

      {activeTab === 'search' ? (
        <>
          <header className="search-header glass-panel">
            <button className="icon-btn" onClick={() => navigate('/')}>
              <ChevronLeft size={24} />
            </button>
            <div className="search-bar">
              <Search size={20} className="search-icon" />
              <input 
                type="text" 
                placeholder="Buscar videos para tu canal..." 
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </header>

          <main className="search-results">
            {query.length > 2 ? (
              <div className="results-list">
                {isSearching && <div style={{textAlign: 'center'}}><Loader2 className="animate-spin" /></div>}
                {results.map(video => (
                  <div key={video.id} className="video-card glass-card">
                    <div className="thumbnail" style={{ backgroundImage: `url(${video.thumbnail})` }}>
                      <span className="duration">{video.duration || 'Video'}</span>
                    </div>
                    <div className="info">
                      <h3 dangerouslySetInnerHTML={{ __html: video.title }}></h3>
                      <p>{video.author} • {video.provider.toUpperCase()}</p>
                      
                      <div className="card-actions">
                        <button 
                          className="btn btn-primary btn-sm program-btn"
                          onClick={() => handleProgram(video)}
                        >
                          <Plus size={16} /> PROGRAMAR
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>Buscá un tema para agregar a tus canales</p>
                <span className="suggestion">Ej: "Documental economía" o "Música Lo-Fi"</span>
              </div>
            )}
          </main>
        </>
      ) : (
        /* Pestaña: Importador de Playlist de Creadores */
        <main className="playlist-importer-container">
          <div className="importer-card glass-panel">
            <div className="importer-header">
              <ListVideo size={36} className="text-accent" />
              <div>
                <h2>Importador Rápido para Creadores</h2>
                <p>Arma tu canal de TV 24/7 en 1 solo clic pegando una lista de reproducción de YouTube.</p>
              </div>
            </div>

            <form onSubmit={handleScanPlaylist} className="playlist-form">
              <div className="input-group">
                <input 
                  type="text" 
                  placeholder="Pega aquí el enlace de la Playlist de YouTube (ej. https://youtube.com/playlist?list=PL...)"
                  value={playlistUrl}
                  onChange={e => setPlaylistUrl(e.target.value)}
                  disabled={isScanningPlaylist || isImporting}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isScanningPlaylist || !playlistUrl.trim()}
                >
                  {isScanningPlaylist ? <Loader2 className="animate-spin" size={18} /> : 'Escanear Playlist'}
                </button>
              </div>
            </form>

            {importSuccess && (
              <div className="import-success-banner">
                <Check size={28} />
                <div>
                  <h4>¡Importación Exitosa!</h4>
                  <p>Se programaron {importStats.count} videos en {importStats.channelName}. Ya están transmitiendo 24/7.</p>
                </div>
                <button className="btn btn-glass btn-sm" onClick={() => navigate('/channels')}>
                  Ver Mi Canal
                </button>
              </div>
            )}
          </div>

          {/* Vista previa de los videos escaneados */}
          {playlistVideos.length > 0 && (
            <div className="scanned-preview glass-panel">
              <div className="preview-header">
                <div>
                  <h3>Se encontraron {playlistVideos.length} videos listos</h3>
                  <p>Selecciona en qué canal quieres transmitirlos en secuencia 24/7:</p>
                </div>

                <div className="target-channel-selector">
                  {userChannels.map(ch => (
                    <button 
                      key={ch.id}
                      className="btn btn-primary"
                      onClick={() => handleImportPlaylistToChannel(ch.id)}
                      disabled={isImporting}
                    >
                      {isImporting ? <Loader2 className="animate-spin" size={16} /> : `📺 Importar a "${ch.name}"`}
                    </button>
                  ))}
                  <button className="btn btn-glass" onClick={createChannel}>
                    ➕ Crear Nuevo Canal
                  </button>
                </div>
              </div>

              <div className="preview-grid">
                {playlistVideos.slice(0, 12).map((vid, idx) => (
                  <div key={vid.id} className="preview-item glass-card">
                    <span className="p-idx">#{idx + 1}</span>
                    <img src={vid.thumbnail} alt="" className="p-thumb" />
                    <div className="p-info">
                      <h5 dangerouslySetInnerHTML={{ __html: vid.title }}></h5>
                      <p>{vid.duration}</p>
                    </div>
                  </div>
                ))}
                {playlistVideos.length > 12 && (
                  <div className="more-count">
                    +{playlistVideos.length - 12} videos más incluidos en la lista
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Modal de Programación Individual */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            {!programmed ? (
              <>
                <h2>¿En qué canal querés ponerlo?</h2>
                <div className="channel-list">
                  {userChannels.length === 0 ? (
                    <p style={{color: '#888', marginBottom: '1rem'}}>No tienes canales todavía.</p>
                  ) : (
                    userChannels.map(ch => (
                      <button key={ch.id} className="channel-item" onClick={() => confirmProgram(ch.id)}>
                        📺 {ch.name}
                      </button>
                    ))
                  )}
                  <button className="channel-item new-channel" onClick={createChannel}>➕ Crear nuevo canal</button>
                </div>
                <button className="btn btn-glass cancel-btn" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <div className="success-state">
                <div className="check-circle">
                  <Check size={48} />
                </div>
                <h2>¡Video Programado!</h2>
                <p>Forma parte de tu canal</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .tab-switcher {
          display: flex;
          gap: var(--space-sm);
          padding: 6px;
          margin-bottom: var(--space-md);
          border-radius: var(--radius-full);
        }

        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: var(--radius-full);
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-btn.active {
          background: var(--accent-primary);
          color: white;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }

        .playlist-importer-container {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          margin-top: var(--space-md);
        }

        .importer-card {
          padding: var(--space-xl);
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .importer-header {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .importer-header h2 {
          font-size: 1.3rem;
          margin: 0 0 4px 0;
        }

        .importer-header p {
          color: var(--text-secondary);
          margin: 0;
          font-size: 0.9rem;
        }

        .playlist-form .input-group {
          display: flex;
          gap: var(--space-sm);
        }

        .playlist-form input {
          flex: 1;
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border-glass);
          padding: 12px 16px;
          border-radius: var(--radius-md);
          color: white;
          font-size: 0.95rem;
          outline: none;
        }

        .playlist-form input:focus {
          border-color: var(--accent-primary);
        }

        .import-success-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 14px 18px;
          border-radius: var(--radius-md);
          color: #10b981;
        }

        .import-success-banner h4 {
          margin: 0 0 2px 0;
          font-size: 1rem;
        }

        .import-success-banner p {
          margin: 0;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.8);
        }

        .scanned-preview {
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: var(--space-md);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: var(--space-md);
        }

        .preview-header h3 {
          margin: 0 0 4px 0;
        }

        .preview-header p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        .target-channel-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 6px;
        }

        .preview-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
        }

        .p-idx {
          font-size: 0.75rem;
          font-weight: bold;
          color: var(--text-muted);
        }

        .p-thumb {
          width: 50px;
          height: 30px;
          border-radius: 4px;
          object-fit: cover;
        }

        .p-info {
          flex: 1;
          overflow: hidden;
        }

        .p-info h5 {
          margin: 0;
          font-size: 0.8rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .p-info p {
          margin: 2px 0 0 0;
          font-size: 0.7rem;
          color: var(--text-secondary);
        }

        .more-count {
          grid-column: 1 / -1;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
          padding: 8px;
        }

        .search-header {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm);
          position: sticky;
          top: var(--space-md);
          z-index: 10;
        }

        .icon-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
        }

        .search-bar {
          flex: 1;
          display: flex;
          align-items: center;
          background: rgba(0,0,0,0.3);
          border-radius: var(--radius-full);
          padding: 0 var(--space-md);
          border: 1px solid var(--border-glass);
        }

        .search-icon {
          color: var(--text-secondary);
        }

        .search-bar input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: var(--space-md);
          font-family: inherit;
          font-size: 1rem;
        }

        .search-bar input:focus {
          outline: none;
        }

        .search-results {
          margin-top: var(--space-xl);
        }

        .empty-state {
          text-align: center;
          color: var(--text-secondary);
          margin-top: 100px;
        }

        .suggestion {
          display: block;
          margin-top: var(--space-sm);
          font-style: italic;
          color: var(--text-muted);
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .video-card {
          display: flex;
          gap: var(--space-md);
          padding: var(--space-sm);
        }

        .thumbnail {
          width: 160px;
          min-width: 160px;
          height: 90px;
          background-size: cover;
          background-position: center;
          border-radius: var(--radius-sm);
          position: relative;
        }

        .duration {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: rgba(0,0,0,0.8);
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .info {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .info h3 {
          font-size: 1rem;
          margin-bottom: 4px;
        }

        .info p {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .card-actions {
          display: flex;
          gap: var(--space-sm);
          margin-top: var(--space-sm);
        }

        .btn-sm {
          padding: var(--space-xs) var(--space-md);
          font-size: 0.85rem;
        }

        .program-btn {
          background: #34c759; /* Verde para destacar la acción de programar */
          box-shadow: 0 4px 15px rgba(52, 199, 89, 0.3);
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: var(--space-md);
        }

        .modal-content {
          width: 100%;
          max-width: 400px;
          padding: var(--space-xl);
          text-align: center;
        }

        .channel-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          margin: var(--space-xl) 0;
        }

        .channel-item {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-glass);
          padding: var(--space-md);
          border-radius: var(--radius-md);
          color: white;
          font-family: inherit;
          font-size: 1rem;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s;
        }

        .channel-item:hover {
          background: rgba(255,255,255,0.1);
        }

        .new-channel {
          border-style: dashed;
          color: var(--accent-secondary);
          text-align: center;
        }

        .cancel-btn {
          width: 100%;
        }

        .success-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-md);
        }

        .check-circle {
          width: 80px;
          height: 80px;
          background: #34c759;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          margin-bottom: var(--space-md);
        }
      `}</style>
    </div>
  );
}
