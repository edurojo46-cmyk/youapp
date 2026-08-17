import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Play, Users, Share2, Copy, Loader2, Tv, 
  Settings, ExternalLink, Check, Plus, Trash2, Globe, Sparkles 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function ChannelProfile() {
  const navigate = useNavigate();
  const { user } = useStore();
  
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [programming, setProgramming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Modal de configuración del creador
  const [showSettings, setShowSettings] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const [editSlug, setEditSlug] = useState('');
  const [editBannerCTA, setEditBannerCTA] = useState('');
  const [editRequireEmailGate, setEditRequireEmailGate] = useState(false);
  const [editSponsorUrl, setEditSponsorUrl] = useState('');
  const [editLinks, setEditLinks] = useState<Array<{ title: string; url: string }>>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUserChannels();
    }
  }, [user]);

  const fetchUserChannels = async () => {
    setLoading(true);
    try {
      // Canales propios
      const { data: ownChannels, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      // Canales donde es colaborador (Cadena de creadores)
      const { data: collabData } = await supabase
        .from('channel_collaborators')
        .select('channels(*)')
        .eq('user_id', user?.id);

      const collabChannels = collabData ? collabData.map((c: any) => c.channels).filter(Boolean) : [];
      const allChannels = [...(ownChannels || []), ...collabChannels];
      
      if (allChannels.length > 0) {
        setChannels(allChannels);
        setActiveChannel(allChannels[0]);
        initChannelSettings(allChannels[0]);
        fetchProgramming(allChannels[0].id);
        fetchSubscribersCount(allChannels[0].id);
        fetchCollaborators(allChannels[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollaborators = async (channelId: string) => {
    try {
      const { data } = await supabase
        .from('channel_collaborators')
        .select('*')
        .eq('channel_id', channelId);
      if (data) setCollaborators(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleInviteCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeChannel) return;

    setIsInviting(true);
    try {
      // Buscar el usuario por email
      const { data: userData, error: userErr } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (userErr || !userData) {
        alert("No se encontró ningún usuario registrado con ese email. Pídele que se registre primero en YouApp.");
        setIsInviting(false);
        return;
      }

      const { error: collabErr } = await supabase
        .from('channel_collaborators')
        .insert({
          channel_id: activeChannel.id,
          user_id: userData.id,
          role: 'editor'
        });

      if (collabErr) {
        if (collabErr.code === '23505') alert("Este creador ya es colaborador del canal.");
        else alert(`Error: ${collabErr.message}`);
      } else {
        alert(`¡Creador ${inviteEmail} agregado con éxito a tu Cadena de TV!`);
        setInviteEmail('');
        fetchCollaborators(activeChannel.id);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collabId: string) => {
    if (!confirm("¿Quitar a este colaborador del canal?")) return;
    try {
      await supabase.from('channel_collaborators').delete().eq('id', collabId);
      fetchCollaborators(activeChannel.id);
    } catch (e) {
      console.error(e);
    }
  };

  const initChannelSettings = (channel: any) => {
    setEditSlug(channel.slug || '');
    setEditBannerCTA(channel.banner_cta || '');
    setEditRequireEmailGate(channel.require_email_gate || false);
    setEditSponsorUrl(channel.sponsor_bumper_url || '');
    setEditLinks(channel.custom_links || []);
  };

  const fetchSubscribersCount = async (channelId: string) => {
    try {
      const { count, error } = await supabase
        .from('channel_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId);

      if (!error && count !== null) {
        setSubscribersCount(count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const downloadSubscribersCSV = async () => {
    if (!activeChannel) return;
    try {
      const { data, error } = await supabase
        .from('channel_subscribers')
        .select('email, name, created_at')
        .eq('channel_id', activeChannel.id);

      if (error || !data || data.length === 0) {
        alert("Aún no tienes suscriptores registrados en este canal.");
        return;
      }

      const csvContent = "data:text/csv;charset=utf-8," 
        + "Email,Nombre,Fecha\n"
        + data.map(e => `"${e.email}","${e.name || ''}","${new Date(e.created_at).toLocaleDateString()}"`).join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `suscriptores_${activeChannel.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Error descargando lista: ${err.message}`);
    }
  };

  const fetchProgramming = async (channelId: string) => {
    try {
      const { data, error } = await supabase
        .from('programming')
        .select('*, videos(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setProgramming(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectChannel = (channel: any) => {
    setActiveChannel(channel);
    initChannelSettings(channel);
    fetchProgramming(channel.id);
    fetchSubscribersCount(channel.id);
  };

  const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;

  const baseAppUrl = `${window.location.origin}${basePath}#`;

  const publicUrl = activeChannel 
    ? `${baseAppUrl}/c/${activeChannel.slug || activeChannel.id}`
    : '';

  const embedCode = activeChannel
    ? `<iframe src="${baseAppUrl}/embed/${activeChannel.slug || activeChannel.id}" width="100%" height="600" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`
    : '';


  const handleCopyLink = async () => {
    if (!publicUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${activeChannel.name} en YouApp`,
          text: `¡Mira mi canal de TV 24/7 "${activeChannel.name}" en YouApp!`,
          url: publicUrl
        });
        return;
      } catch (e) {
        // Fallback a clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback para navegadores antiguos
      prompt("Copia tu enlace público:", publicUrl);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel) return;

    setIsSavingSettings(true);
    try {
      const cleanSlug = editSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const { data, error } = await supabase
        .from('channels')
        .update({
          slug: cleanSlug || null,
          banner_cta: editBannerCTA.trim() || null,
          require_email_gate: editRequireEmailGate,
          sponsor_bumper_url: editSponsorUrl.trim() || null,
          custom_links: editLinks.filter(l => l.title.trim() && l.url.trim())
        })
        .eq('id', activeChannel.id)
        .select()
        .single();

      if (error) {
        alert(`Error al guardar: ${error.message}`);
      } else if (data) {
        setActiveChannel(data);
        setChannels(channels.map(c => c.id === data.id ? data : c));
        setShowSettings(false);
        alert("¡Configuración del canal actualizada con éxito!");
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addCustomLink = () => {
    setEditLinks([...editLinks, { title: '', url: '' }]);
  };

  const removeCustomLink = (idx: number) => {
    setEditLinks(editLinks.filter((_, i) => i !== idx));
  };

  if (loading) {
    return <div style={{height: '100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f111a', color:'white'}}><Loader2 className="animate-spin" size={48}/></div>;
  }

  return (
    <div className="profile-container">
      <header className="profile-cover">
        <button className="icon-btn back-btn glass-panel" onClick={() => navigate('/')}>
          <ChevronLeft size={24} />
        </button>
        <div className="cover-overlay"></div>
      </header>

      <main className="profile-info">
        <div className="curator-avatar">
          <span>{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
        </div>
        
        {channels.length === 0 ? (
          <div className="header-info" style={{textAlign: 'center', marginTop: '2rem'}}>
            <h2>No tienes canales creados</h2>
            <p className="curator-bio">Ve a "Buscar y Programar" para crear tu primer canal o importar una playlist.</p>
            <button className="btn btn-primary" onClick={() => navigate('/search')} style={{marginTop: '1rem', width: '100%', padding: '1rem'}}>
              Ir a Buscar y Programar
            </button>
          </div>
        ) : (
          <>
            <div className="header-info">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>{activeChannel?.name}</h1>
                <button 
                  className="btn btn-glass btn-sm"
                  onClick={() => setShowSettings(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Settings size={16} /> Configurar
                </button>
              </div>

              <p className="curator-bio">Canal 24/7 administrado por ti ({user?.email})</p>
              
              <div className="stats">
                <div className="stat-item">
                  <Globe size={16} />
                  <span>24/7 En Vivo</span>
                </div>
                <div className="stat-item">
                  <span>📺 {programming.length} Programas</span>
                </div>
                <div className="stat-item">
                  <Users size={16} />
                  <span>👥 {subscribersCount} Suscriptores</span>
                </div>
              </div>
            </div>

            {/* Enlace público compartible y Embed */}
            <div className="shareable-link-box glass-panel">
              <div className="link-info">
                <span className="link-label">🔗 Tu Enlace Público para Compartir:</span>
                <span className="link-url">{publicUrl}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={handleCopyLink}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar Link'}
                </button>
                <button 
                  className="btn btn-glass btn-sm" 
                  onClick={() => setShowCollaboratorsModal(true)}
                  title="Gestionar Creadores / Cadena de TV"
                >
                  🤝 Cadena de Creadores ({collaborators.length})
                </button>
                <button 
                  className="btn btn-glass btn-sm" 
                  onClick={() => setShowEmbedModal(true)}
                  title="Incrustar en mi sitio web"
                >
                  <Tv size={16} style={{ marginRight: '4px' }} /> Código Embed
                </button>
                <button 
                  className="btn btn-glass btn-sm" 
                  onClick={() => window.open(publicUrl, '_blank')}
                  title="Abrir como espectador"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Acciones de Creador */}
            <div className="profile-actions">
              <button className="btn btn-primary main-action" onClick={() => navigate(`/stream?channelId=${activeChannel.id}`)}>
                <Play size={20} /> Transmitir / Mirar Canal
              </button>
              {subscribersCount > 0 && (
                <button className="btn btn-glass" onClick={downloadSubscribersCSV} style={{ width: '100%' }}>
                  📥 Descargar {subscribersCount} Emails de Fans (Excel/CSV)
                </button>
              )}
            </div>

            {channels.length > 1 && (
              <div className="channel-selector" style={{display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '10px'}}>
                {channels.map(ch => (
                  <button 
                    key={ch.id} 
                    onClick={() => handleSelectChannel(ch)}
                    className={`btn ${ch.id === activeChannel?.id ? 'btn-primary' : 'btn-glass'}`}
                    style={{whiteSpace: 'nowrap'}}
                  >
                    <Tv size={16} style={{marginRight: '8px'}} /> {ch.name}
                  </button>
                ))}
              </div>
            )}

            <section className="program-list">
              <h3>Programación de {activeChannel?.name}</h3>
              {programming.length === 0 ? (
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                  <p style={{color: '#888', marginBottom: '12px'}}>No hay videos programados en este canal.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/search')}>
                    <Sparkles size={16} style={{ marginRight: '6px' }} /> Importar Videos o Playlist
                  </button>
                </div>
              ) : (
                programming.map((prog, index) => (
                  <div 
                    key={prog.id} 
                    className="list-item glass-card" 
                    style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                    onClick={() => navigate(`/stream?channelId=${activeChannel.id}&progId=${prog.id}`)}
                  >
                    <span className="order">{index + 1}</span>
                    <div className="thumbnail" style={{backgroundImage: `url(${prog.videos?.thumbnail})`, width: '80px', height: '45px', borderRadius: '4px', backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0}}></div>
                    <div className="item-details" style={{flex: 1, overflow: 'hidden'}}>
                      <h4 style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} dangerouslySetInnerHTML={{__html: prog.videos?.title || ''}}></h4>
                      <p>{prog.videos?.author} • {prog.videos?.duration || '5:00'}</p>
                    </div>
                    <Play size={20} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </main>

      {/* Modal de Cadena de Creadores / Colaboradores */}
      {showCollaboratorsModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel settings-modal">
            <h3>🤝 Cadena de Creadores / Canal Colaborativo</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Invita a otros creadores de YouTube para que puedan programar sus propios videos en <strong>{activeChannel.name}</strong> y armar una cadena conjunta de TV 24/7:
            </p>

            <form onSubmit={handleInviteCollaborator} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input 
                type="email" 
                placeholder="Email del creador registrado..." 
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'white', padding: '8px 12px' }}
              />
              <button type="submit" className="btn btn-primary" disabled={isInviting}>
                {isInviting ? <Loader2 className="animate-spin" size={16} /> : '➕ Invitar'}
              </button>
            </form>

            <div className="collab-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <h4>Colaboradores Actuales:</h4>
              {collaborators.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>No hay otros creadores en este canal aún.</p>
              ) : (
                collaborators.map((c: any) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '6px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.85rem' }}>ID: {c.user_id.slice(0, 8)}... ({c.role})</span>
                    <button className="del-btn" onClick={() => handleRemoveCollaborator(c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-glass" onClick={() => setShowCollaboratorsModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Código Embed */}
      {showEmbedModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel settings-modal">
            <h3>🔌 Incrustar Canal en tu Sitio Web</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Copia este código HTML y pégalo en tu blog, tienda online o sitio de WordPress para que tus fans vean tu canal de TV 24/7 en tu propia web:
            </p>

            <textarea 
              readOnly 
              value={embedCode} 
              rows={4} 
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.5)',
                color: '#a5b4fc',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-glass" onClick={() => setShowEmbedModal(false)}>
                Cerrar
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode);
                  alert("¡Código Embed copiado al portapapeles!");
                  setShowEmbedModal(false);
                }}
              >
                <Copy size={16} style={{ marginRight: '6px' }} /> Copiar Código HTML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuración del Creador */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel settings-modal">
            <h3>⚙️ Configuración & Monetización del Canal</h3>
            
            <form onSubmit={handleSaveSettings} className="settings-form">
              <div className="form-group">
                <label>URL personalizada (Slug):</label>
                <div className="slug-input-wrapper">
                  <span>youapp.com/c/</span>
                  <input 
                    type="text" 
                    value={editSlug}
                    placeholder="mi-canal"
                    onChange={e => setEditSlug(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Banner de Anuncio en Pantalla (CTA):</label>
                <input 
                  type="text" 
                  value={editBannerCTA}
                  placeholder="Ej: ¡Nuevo estreno todos los viernes a las 20hs!"
                  onChange={e => setEditBannerCTA(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={editRequireEmailGate}
                    onChange={e => setEditRequireEmailGate(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>🔒 Solicitar Email para entrar (Comunidad VIP)</span>
                </label>
                <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', display: 'block' }}>
                  Pide a los visitantes su correo antes de ver la transmisión para armar tu lista de fans.
                </small>
              </div>

              <div className="form-group">
                <label>Tanda Publicitaria Propia (URL Video Sponsor YouTube):</label>
                <input 
                  type="text" 
                  value={editSponsorUrl}
                  placeholder="https://youtube.com/watch?v=... (Anuncio de 15s de tu marca)"
                  onChange={e => setEditSponsorUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>Enlaces de Monetización & Redes:</label>
                  <button type="button" className="add-link-btn" onClick={addCustomLink}>
                    <Plus size={14} /> Agregar Enlace
                  </button>
                </div>

                {editLinks.map((link, idx) => (
                  <div key={idx} className="link-row">
                    <input 
                      type="text" 
                      placeholder="Título (Ej. Cafecito)" 
                      value={link.title}
                      onChange={e => {
                        const newL = [...editLinks];
                        newL[idx].title = e.target.value;
                        setEditLinks(newL);
                      }}
                      style={{ width: '40%' }}
                    />
                    <input 
                      type="text" 
                      placeholder="URL (https://cafecito.app/...)" 
                      value={link.url}
                      onChange={e => {
                        const newL = [...editLinks];
                        newL[idx].url = e.target.value;
                        setEditLinks(newL);
                      }}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="del-btn" onClick={() => removeCustomLink(idx)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-glass" onClick={() => setShowSettings(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingSettings}>
                  {isSavingSettings ? <Loader2 className="animate-spin" size={18} /> : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .profile-container {
          min-height: 100vh;
          max-width: 600px;
          margin: 0 auto;
        }

        .profile-cover {
          height: 200px;
          background: url('https://images.unsplash.com/photo-1544477815-18e388147d3e?auto=format&fit=crop&q=80&w=800') center/cover;
          position: relative;
        }

        .cover-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, var(--bg-primary) 0%, transparent 100%);
        }

        .back-btn {
          position: absolute;
          top: var(--space-md);
          left: var(--space-md);
          z-index: 10;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .profile-info {
          padding: 0 var(--space-lg);
          margin-top: -40px;
          position: relative;
          z-index: 5;
        }

        .curator-avatar {
          width: 80px;
          height: 80px;
          background: var(--accent-gradient);
          border: 4px solid var(--bg-primary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: var(--space-md);
        }

        .header-info h1 {
          font-size: 1.8rem;
          margin-bottom: var(--space-xs);
        }

        .curator-bio {
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }

        .shareable-link-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          margin-bottom: var(--space-xl);
          border-radius: var(--radius-md);
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.3);
          gap: 10px;
          flex-wrap: wrap;
        }

        .link-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }

        .link-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #a5b4fc;
        }

        .link-url {
          font-size: 0.85rem;
          color: white;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Modal Overlay & Container */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-content {
          width: 100%;
          max-width: 500px;
          background: rgba(15, 17, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }

        /* Settings Modal */
        .settings-modal {
          max-width: 500px;
          text-align: left;
        }

        .settings-modal h3 {
          margin-top: 0;
          margin-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 10px;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .form-group input {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border-glass);
          padding: 8px 12px;
          border-radius: 6px;
          color: white;
          font-size: 0.9rem;
          outline: none;
        }

        .form-group input:focus {
          border-color: var(--accent-primary);
        }

        .slug-input-wrapper {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border-glass);
          border-radius: 6px;
          overflow: hidden;
        }

        .slug-input-wrapper span {
          padding-left: 10px;
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .slug-input-wrapper input {
          border: none;
          background: transparent;
          flex: 1;
        }

        .add-link-btn {
          background: none;
          border: none;
          color: #6366f1;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .link-row {
          display: flex;
          gap: 6px;
          margin-top: 6px;
        }

        .del-btn {
          background: rgba(239, 68, 68, 0.2);
          border: none;
          color: #ef4444;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 14px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          color: var(--text-muted);
          font-weight: 500;
        }

        .profile-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          margin-bottom: var(--space-2xl);
        }

        .main-action {
          width: 100%;
          padding: var(--space-md);
        }

        .secondary-actions {
          display: flex;
          gap: var(--space-sm);
        }

        .flex-1 {
          flex: 1;
        }

        .icon-only {
          padding: var(--space-sm);
        }

        .program-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding-bottom: var(--space-xl);
        }

        .program-list h3 {
          margin-bottom: var(--space-md);
          color: var(--text-secondary);
        }

        .list-item {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
        }

        .order {
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--text-muted);
          width: 24px;
          text-align: center;
        }

        .item-details h4 {
          font-size: 1rem;
          margin-bottom: 2px;
        }

        .item-details p {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
