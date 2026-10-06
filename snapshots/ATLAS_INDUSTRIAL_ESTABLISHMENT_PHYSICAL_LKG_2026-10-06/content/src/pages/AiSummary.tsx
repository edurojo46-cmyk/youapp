import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Search, Bell, Sparkles, Lightbulb, 
  BookOpen, Star, Send, GraduationCap, 
  Bookmark, Radio, Share, Loader2
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import './AiSummary.css';


interface AiData {
  summary: { short: string; medium: string; detailed: string; };
  ideas: string[];
  chapters: { time: string; title: string; }[];
  moments: { time: string; title: string; }[];
  learning: string;
}

export default function AiSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useStore();
  
  const [loading, setLoading] = useState(true);
  const [videoData, setVideoData] = useState<any>(null);
  const [aiData, setAiData] = useState<AiData | null>(null);
  const [summaryMode, setSummaryMode] = useState<'short'|'medium'|'detailed'>('medium');
  const [error, setError] = useState('');
  const [playerActive, setPlayerActive] = useState(false);
  const [seekTime, setSeekTime] = useState(0);



  useEffect(() => {
    window.scrollTo(0, 0);
    if (id) fetchVideoData();
  }, [id]);

  const fetchVideoData = async () => {
    setLoading(true);
    setError('');
    try {
      // location.state may carry { title, description, thumbnail, author } from navigation.
      const navState = (location.state as any) || {};

      let ytId = id || '';
      let title = navState.title || '';
      let description = navState.description || '';
      let thumbnail = navState.thumbnail || '';
      let author = navState.author || '';

      // Detect if id is a Supabase UUID (36 chars with dashes) rather than a YouTube video ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

      if (isUUID || !title) {
        // Build the right query: by UUID or by YouTube video ID in URL
        let query = supabase.from('youapp_index').select('id, title, description, thumbnail, url');
        if (isUUID) {
          query = query.eq('id', id);
        } else {
          query = query.ilike('url', `%${id}%`);
        }
        const { data } = await query.limit(1).maybeSingle();

        if (data) {
          title = data.title || title;
          description = data.description || description;
          thumbnail = data.thumbnail || thumbnail;

          // Extract YouTube video ID from stored URL if we don't have it yet
          if (isUUID || !ytId || ytId === id) {
            const urlMatch = data.url?.match(/(?:embed\/|[?&]v=|youtu\.be\/)([^/?&]+)/);
            if (urlMatch) ytId = urlMatch[1];
          }
        }
      }

      // Fallback: fetch title from YouTube oEmbed (no API key needed)
      if (!title && ytId && !/^[0-9a-f-]{36}$/i.test(ytId)) {
        try {
          const oembed = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`
          );
          if (oembed.ok) {
            const odata = await oembed.json();
            title = odata.title || '';
            author = odata.author_name || author;
          }
        } catch { /* ignore */ }
      }

      if (!title) title = navState.title || 'Video sin título';
      if (!thumbnail) thumbnail = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;

      setVideoData({ ytId, title, description, thumbnail, author });

      // Guard: only call AI if we have a meaningful title
      if (!title || title === 'Video sin título') {
        setError('No se pudo obtener información del video para generar el resumen.');
        return;
      }

      // Fetch AI analysis from edge function
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('ai-gateway', {
        body: { 
          action: 'analyze_video', 
          title, 
          description: description || `Video de YouTube: ${title}` // always give context
        }
      });
      
      if (aiError) throw new Error(`Error de IA: ${aiError.message}`);
      if (aiResponse?.error) throw new Error(`Error de IA: ${aiResponse.error}`);

      setAiData(aiResponse);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleSeek = (timeStr: string) => {
    const parts = timeStr.split(':');
    let seconds = 0;
    if (parts.length === 2) {
      seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    setSeekTime(seconds);
    setPlayerActive(true);
    // Scroll to top using the correct scroll container
    document.querySelector('.app-layout')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="ai-summary-layout">
      {/* ── Navbar ── */}
      <nav className="ai-navbar">
        <div className="logo-area" style={{cursor:'pointer'}} onClick={() => navigate('/')}>
          <span className="logo-you">Y O U</span>
          <span className="logo-app">A P P</span>
          <span className="logo-tv">T V</span>
        </div>
        
        <div className="nav-links">
          <button className="nav-link active" onClick={() => navigate('/')}>Inicio</button>
          <button className="nav-link" onClick={() => navigate('/search')}>Explorar</button>
          <button className="nav-link" onClick={() => navigate('/live')}>En Vivo</button>
          <button className="nav-link" onClick={() => navigate('/my-algorithm')}>Mi Señal</button>
        </div>

        <div className="user-area">
          <button className="icon-btn">
            <Bell size={20} />
          </button>
          {(user as any)?.avatar_url ? (
            <img src={(user as any).avatar_url} alt="Profile" className="avatar" />
          ) : (
            <div className="avatar fallback" />
          )}
        </div>
      </nav>

      {/* ── Search Bar ── */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={20} className="search-icon" />
          <input 
            type="text" 
            placeholder="¿Qué querés ver hoy?" 
            className="search-input"
          />
          <button className="btn-ai-search" onClick={() => navigate('/search')}>
            <Sparkles size={16} /> Buscar con IA
          </button>
        </div>
      </div>

      <main className="main-content">
        <div className="header-row">
          <button onClick={() => navigate(-1)} className="back-btn">
            <ArrowLeft size={20} /> Volver
          </button>
          <h1 className="page-title">Resumen IA</h1>
        </div>

        {error && (
          <div style={{color:'red', padding:'1rem', background:'#fee2e2', borderRadius:'12px', marginBottom:'1rem'}}>
            Error: {error}
          </div>
        )}

        <div className="bento-grid">
          {/* Fila 1 */}
          <div className="ai-card video-card">
            <div className="video-container" style={{background:'#111'}}>
              {loading ? (
                <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#1a1a2e'}}>
                  <Loader2 className="animate-spin" style={{color:'white'}} size={40} />
                </div>
              ) : playerActive && videoData?.ytId ? (
                <iframe
                  key={seekTime}
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoData.ytId}?autoplay=1&rel=0&modestbranding=1${seekTime > 0 ? `&start=${seekTime}` : ''}`}
                  title={videoData?.title || 'Video'}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{border:'none', width:'100%', height:'100%', display:'block'}}
                ></iframe>
              ) : (
                /* Thumbnail poster — click to activate player */
                <div
                  className="video-placeholder"
                  style={{cursor:'pointer'}}
                  onClick={() => setPlayerActive(true)}
                >
                  <img
                    src={videoData?.thumbnail || `https://img.youtube.com/vi/${videoData?.ytId}/maxresdefault.jpg`}
                    alt={videoData?.title || ''}
                    className="video-poster"
                    onError={(e) => {
                      // fallback to hqdefault if maxresdefault missing
                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoData?.ytId}/hqdefault.jpg`;
                    }}
                  />
                  <div className="video-overlay">
                    <div className="play-button-large" style={{pointerEvents:'none'}}>
                      <div className="play-triangle" />
                    </div>
                    <div className="video-info">
                      <h2 style={{fontSize:'1.1rem'}}>{videoData?.title}</h2>
                      {videoData?.author && <p>{videoData.author}</p>}
                    </div>
                  </div>
                </div>
              )}
              {/* Open in YouTube link */}
              {!loading && videoData?.ytId && (
                <a
                  href={`https://www.youtube.com/watch?v=${videoData.ytId}${seekTime > 0 ? `&t=${seekTime}s` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position:'absolute', top:'10px', right:'10px',
                    background:'rgba(0,0,0,0.6)', color:'white',
                    fontSize:'0.7rem', padding:'4px 10px', borderRadius:'99px',
                    textDecoration:'none', backdropFilter:'blur(4px)', zIndex:2
                  }}
                >
                  ↗ Ver en YouTube
                </a>
              )}
            </div>
          </div>

          <div className="ai-card ai-summary-card">
            <div className="ai-card-header">
              <Sparkles size={20} className="text-blue" />
              <h3>Resumen IA</h3>
            </div>
            {loading ? (
              <div style={{opacity: 0.5}} className="animate-pulse">
                <div style={{height:'12px', background:'#e5e7eb', borderRadius:'4px', marginBottom:'8px'}}/>
                <div style={{height:'12px', background:'#e5e7eb', borderRadius:'4px', marginBottom:'8px'}}/>
                <div style={{height:'12px', background:'#e5e7eb', borderRadius:'4px', width:'60%'}}/>
              </div>
            ) : (
              <>
                <p className="summary-text">
                  {aiData?.summary[summaryMode] || 'Resumen no disponible.'}
                </p>
                <div className="duration-toggles">
                  <button className={`toggle-btn ${summaryMode === 'short' ? 'active' : ''}`} onClick={()=>setSummaryMode('short')}>
                    Corto<br/><span>1 min</span>
                  </button>
                  <button className={`toggle-btn ${summaryMode === 'medium' ? 'active' : ''}`} onClick={()=>setSummaryMode('medium')}>
                    Medio<br/><span>3 min</span>
                  </button>
                  <button className={`toggle-btn ${summaryMode === 'detailed' ? 'active' : ''}`} onClick={()=>setSummaryMode('detailed')}>
                    Detallado<br/><span>8 min</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Fila 2 */}
          <div className="ai-card ideas-card">
            <div className="ai-card-header">
              <Lightbulb size={20} className="text-gray" />
              <h3>5 ideas principales</h3>
            </div>
            {loading ? (
              <div className="animate-pulse" style={{height:'200px', background:'#f9fafb', borderRadius:'12px'}}></div>
            ) : (
              <ul className="idea-list">
                {aiData?.ideas?.map((idea, idx) => (
                  <li key={idx}>
                    {idx < 2 ? <Sparkles size={16} className="text-blue"/> : <div className="icon-circle"><div className="dot"/></div>}
                    {idea}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card chapters-card">
            <div className="ai-card-header">
              <BookOpen size={20} className="text-gray" />
              <h3>Capítulos</h3>
            </div>
            {loading ? (
              <div className="animate-pulse" style={{height:'200px', background:'#f9fafb', borderRadius:'12px'}}></div>
            ) : (
              <ul className="chapter-list">
                {aiData?.chapters?.map((ch, idx) => (
                  <li key={idx} onClick={() => handleSeek(ch.time)}>
                    <span className="time">{ch.time}</span> <span className="title">{ch.title}</span> <span className="chevron">&gt;</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ai-card moments-card">
            <div className="ai-card-header">
              <Star size={20} className="text-gray" />
              <h3>Momentos clave</h3>
            </div>
            {loading ? (
              <div className="animate-pulse" style={{height:'200px', background:'#f9fafb', borderRadius:'12px'}}></div>
            ) : (
              <div className="moment-pill-list">
                {aiData?.moments?.map((m, idx) => (
                  <button className="moment-pill" key={idx} onClick={() => handleSeek(m.time)}>
                    <span className="time text-blue">{m.time}</span> {m.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fila 3 */}
          <div className="ai-card ask-card">
            <div className="ai-card-header">
              <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <h3>Preguntarle al video</h3>
              </div>
            </div>
            <div className="chat-input-container">
              <input type="text" placeholder="Hacé tu pregunta sobre este video..." />
              <button className="send-btn"><Send size={18} /></button>
            </div>
            <div className="suggestions">
              <span className="sugg-label">Sugerencias</span>
              <div className="sugg-buttons">
                <button>Explicámelo fácil &gt;</button>
                <button>Dame los datos importantes &gt;</button>
                <button>¿Dónde habla de IA? &gt;</button>
              </div>
            </div>
          </div>

          <div className="ai-card learning-card">
            <div className="ai-card-header">
              <GraduationCap size={20} className="text-gray" />
              <h3>Qué aprendí</h3>
            </div>
            {loading ? (
               <div className="animate-pulse" style={{height:'100px', background:'#f9fafb', borderRadius:'12px'}}></div>
            ) : (
              <p className="learning-text">
                <em>{aiData?.learning}</em>
              </p>
            )}
            <div className="ai-badge">
              <Sparkles size={14} /> Generado por IA
            </div>
          </div>

          <div className="ai-card actions-card">
            <button className="action-row">
              <Bookmark size={20} className="icon" /> Guardar resumen <span className="chevron">&gt;</span>
            </button>
            <div className="divider" />
            <button className="action-row">
              <Sparkles size={20} className="icon" /> Crear momento <span className="chevron">&gt;</span>
            </button>
            <div className="divider" />
            <button className="action-row">
              <Radio size={20} className="icon" /> Agregar a Mi Señal <span className="chevron">&gt;</span>
            </button>
            <div className="divider" />
            <button className="action-row">
              <Share size={20} className="icon" /> Compartir <span className="chevron">&gt;</span>
            </button>
          </div>

        </div>
      </main>
    </div>
  );
} 
