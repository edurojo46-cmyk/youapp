import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  CloudSun,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';
import {
  addSignalAgendaItem,
  addSignalEditorial,
  ARGENTINA_CITIES,
  deleteSignalAgendaItem,
  deleteSignalEditorial,
  downloadAgendaIcs,
  fetchArgentinaLiveData,
  readSignalStationExtras,
  setSignalCity,
  type ArgentinaCityKey,
  type ArgentinaLiveData,
  type SignalEditorialPost,
  type SignalStationExtras
} from '../../lib/tv/signalStationExtrasStore';

interface SignalStationHubDrawerProps {
  signalId: string;
  signalName: string;
  isOwner?: boolean;
}

export const SignalStationHubDrawer: React.FC<SignalStationHubDrawerProps> = ({
  signalId,
  signalName,
  isOwner = true
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'data' | 'editorial' | 'agenda'>('data');
  const [extras, setExtras] = useState<SignalStationExtras>(() => readSignalStationExtras(signalId));
  const [liveData, setLiveData] = useState<ArgentinaLiveData | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Editorial form + reader modal
  const [showEdForm, setShowEdForm] = useState(false);
  const [edTitle, setEdTitle] = useState('');
  const [edSubtitle, setEdSubtitle] = useState('');
  const [edBody, setEdBody] = useState('');
  const [readingPost, setReadingPost] = useState<SignalEditorialPost | null>(null);

  // Agenda form
  const [showAgForm, setShowAgForm] = useState(false);
  const [agTitle, setAgTitle] = useState('');
  const [agStartsAt, setAgStartsAt] = useState(() =>
    new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [agNote, setAgNote] = useState('');

  useEffect(() => {
    setExtras(readSignalStationExtras(signalId));
    setShowEdForm(false);
    setShowAgForm(false);
  }, [signalId]);

  const loadData = useCallback(
    async (city: ArgentinaCityKey, force = false) => {
      setLoadingData(true);
      try {
        const res = await fetchArgentinaLiveData(city, force);
        setLiveData(res);
      } finally {
        setLoadingData(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open && tab === 'data') {
      void loadData(extras.city, false);
    }
  }, [open, tab, extras.city, loadData]);

  const handlePublishEditorial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edTitle.trim() || !edBody.trim()) return;
    const next = addSignalEditorial(signalId, {
      title: edTitle.trim(),
      subtitle: edSubtitle.trim() || undefined,
      body: edBody.trim(),
      authorName: signalName
    });
    setExtras(next);
    setEdTitle('');
    setEdSubtitle('');
    setEdBody('');
    setShowEdForm(false);
  };

  const handleAddAgenda = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agTitle.trim() || !agStartsAt) return;
    const next = addSignalAgendaItem(signalId, {
      title: agTitle.trim(),
      startsAt: new Date(agStartsAt).toISOString(),
      note: agNote.trim() || undefined
    });
    setExtras(next);
    setAgTitle('');
    setAgNote('');
    setShowAgForm(false);
  };

  const totalItems = extras.editorials.length + extras.agenda.length;

  return (
    <>
      <div className="shd-drawer">
        <button
          type="button"
          className={`shd-toggle ${open ? 'open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="shd-title">
            <CloudSun size={13} color="#0071e3" />
            <span>Datos, Editorial y Agenda</span>
            {totalItems > 0 && <span className="shd-badge">{totalItems}</span>}
          </span>
          <ChevronDown
            size={14}
            style={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.18s ease'
            }}
          />
        </button>

        {open && (
          <div className="shd-body">
            <div className="shd-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'data'}
                className={`shd-tab ${tab === 'data' ? 'active' : ''}`}
                onClick={() => setTab('data')}
              >
                <CloudSun size={12} /> Datos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'editorial'}
                className={`shd-tab ${tab === 'editorial' ? 'active' : ''}`}
                onClick={() => setTab('editorial')}
              >
                <FileText size={12} /> Editorial ({extras.editorials.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'agenda'}
                className={`shd-tab ${tab === 'agenda' ? 'active' : ''}`}
                onClick={() => setTab('agenda')}
              >
                <Calendar size={12} /> Agenda ({extras.agenda.length})
              </button>
            </div>

            {/* TAB 1: DATOS EN VIVO (Clima + Dólar Argentina) */}
            {tab === 'data' && (
              <div className="shd-section">
                <div className="shd-city-row">
                  <select
                    value={extras.city}
                    onChange={(e) => {
                      const nextCity = e.target.value as ArgentinaCityKey;
                      setExtras(setSignalCity(signalId, nextCity));
                      void loadData(nextCity, true);
                    }}
                    className="shd-select"
                    aria-label="Elegir ciudad para el clima"
                  >
                    {Object.entries(ARGENTINA_CITIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="shd-refresh-btn"
                    disabled={loadingData}
                    onClick={() => void loadData(extras.city, true)}
                    title="Actualizar datos en vivo"
                  >
                    <RefreshCw size={11} />
                    <span>{liveData?.fetchedAt || 'Ahora'}</span>
                  </button>
                </div>

                <div className="shd-weather-card">
                  <div>
                    <span className="shd-mini-lbl">CLIMA · {liveData?.cityLabel || ARGENTINA_CITIES[extras.city].label}</span>
                    <strong>{liveData?.tempC !== null && liveData?.tempC !== undefined ? `${liveData.tempC}°C` : '—'}</strong>
                  </div>
                  <span className="shd-weather-desc">{liveData?.weatherLabel || 'Cargando…'}</span>
                </div>

                {liveData?.dollars && liveData.dollars.length > 0 && (
                  <div className="shd-dollar-grid">
                    {liveData.dollars.map((d) => (
                      <div key={d.casa} className="shd-dollar-card">
                        <span className="shd-mini-lbl">Dólar {d.nombre}</span>
                        <strong>${Math.round(d.venta).toLocaleString('es-AR')}</strong>
                        <small>Compra ${Math.round(d.compra).toLocaleString('es-AR')}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: EDITORIAL / NOTAS PROPIAS (se leen 100% enteras dentro de YOUAPP) */}
            {tab === 'editorial' && (
              <div className="shd-section">
                {isOwner && !showEdForm && (
                  <button type="button" className="shd-action-btn" onClick={() => setShowEdForm(true)}>
                    <Plus size={12} /> Escribir editorial propia
                  </button>
                )}

                {isOwner && showEdForm && (
                  <form onSubmit={handlePublishEditorial} className="shd-form">
                    <input
                      type="text"
                      required
                      value={edTitle}
                      onChange={(e) => setEdTitle(e.target.value)}
                      placeholder="Título de tu columna o editorial"
                      className="shd-input"
                    />
                    <input
                      type="text"
                      value={edSubtitle}
                      onChange={(e) => setEdSubtitle(e.target.value)}
                      placeholder="Bajada corta (opcional)"
                      className="shd-input"
                    />
                    <textarea
                      required
                      rows={4}
                      value={edBody}
                      onChange={(e) => setEdBody(e.target.value)}
                      placeholder="Escribí tu nota completa acá… tus espectadores la van a leer entera dentro de YOUAPP."
                      className="shd-textarea"
                    />
                    <div className="shd-form-actions">
                      <button type="button" className="shd-cancel-btn" onClick={() => setShowEdForm(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="shd-save-btn">
                        Publicar
                      </button>
                    </div>
                  </form>
                )}

                {extras.editorials.length === 0 ? (
                  <div className="shd-empty">
                    Todavía no publicaste notas propias. Las editoriales que escribas acá se leen 100 % enteras dentro de YOUAPP.
                  </div>
                ) : (
                  <div className="shd-list">
                    {extras.editorials.map((post) => (
                      <div key={post.id} className="shd-item-card">
                        <button
                          type="button"
                          className="shd-item-hit"
                          onClick={() => setReadingPost(post)}
                        >
                          <strong>{post.title}</strong>
                          <span>{post.subtitle || post.body.slice(0, 80)}</span>
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            className="shd-del-btn"
                            title="Eliminar editorial"
                            onClick={() => setExtras(deleteSignalEditorial(signalId, post.id))}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AGENDA DE LA SEÑAL (con botón + Calendario .ics) */}
            {tab === 'agenda' && (
              <div className="shd-section">
                {isOwner && !showAgForm && (
                  <button type="button" className="shd-action-btn" onClick={() => setShowAgForm(true)}>
                    <Plus size={12} /> Agendar próximo vivo o evento
                  </button>
                )}

                {isOwner && showAgForm && (
                  <form onSubmit={handleAddAgenda} className="shd-form">
                    <input
                      type="text"
                      required
                      value={agTitle}
                      onChange={(e) => setAgTitle(e.target.value)}
                      placeholder="Ej: Vivo especial · Análisis del domingo"
                      className="shd-input"
                    />
                    <input
                      type="datetime-local"
                      required
                      value={agStartsAt}
                      onChange={(e) => setAgStartsAt(e.target.value)}
                      className="shd-input"
                    />
                    <input
                      type="text"
                      value={agNote}
                      onChange={(e) => setAgNote(e.target.value)}
                      placeholder="Detalle breve (opcional)"
                      className="shd-input"
                    />
                    <div className="shd-form-actions">
                      <button type="button" className="shd-cancel-btn" onClick={() => setShowAgForm(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="shd-save-btn">
                        Guardar en agenda
                      </button>
                    </div>
                  </form>
                )}

                {extras.agenda.length === 0 ? (
                  <div className="shd-empty">
                    No hay eventos agendados todavía. Sumá tus próximos vivos, partidos o charlas.
                  </div>
                ) : (
                  <div className="shd-list">
                    {extras.agenda.map((ag) => (
                      <div key={ag.id} className="shd-item-card">
                        <div className="shd-item-hit">
                          <small className="shd-ag-date">
                            {new Date(ag.startsAt).toLocaleString('es-AR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </small>
                          <strong>{ag.title}</strong>
                          {ag.note && <span>{ag.note}</span>}
                        </div>
                        <div className="shd-ag-btns">
                          <button
                            type="button"
                            className="shd-ics-btn"
                            title="Agregar a Google / Apple Calendar (.ics)"
                            onClick={() => downloadAgendaIcs(ag, signalName)}
                          >
                            <Download size={11} />
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              className="shd-del-btn"
                              title="Quitar de la agenda"
                              onClick={() => setExtras(deleteSignalAgendaItem(signalId, ag.id))}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Lectura Completa de Editorial Propia dentro de YOUAPP */}
      {readingPost && (
        <div
          className="shd-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setReadingPost(null)}
        >
          <div className="shd-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="shd-modal-close"
              onClick={() => setReadingPost(null)}
              aria-label="Cerrar editorial"
            >
              <X size={16} />
            </button>
            <span className="shd-modal-eyebrow">EDITORIAL · {readingPost.authorName.toUpperCase()}</span>
            <h2>{readingPost.title}</h2>
            {readingPost.subtitle && <p className="shd-modal-sub">{readingPost.subtitle}</p>}
            <div className="shd-modal-text">
              {readingPost.body.split('\n').map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .shd-drawer {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        .shd-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 13px;
          border: none;
          background: transparent;
          color: #1d1d1f;
          font-size: 12.5px;
          font-weight: 660;
          cursor: pointer;
        }
        .shd-toggle:hover { background: rgba(0, 0, 0, 0.025); }
        .shd-title { display: inline-flex; align-items: center; gap: 7px; }
        .shd-badge {
          padding: 1px 7px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          font-size: 11px;
          font-weight: 700;
        }
        .shd-body {
          padding: 9px 11px 11px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .shd-tabs {
          display: flex;
          gap: 3px;
          padding: 3px;
          border-radius: 999px;
          background: rgba(118, 118, 128, 0.1);
        }
        .shd-tab {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 5px 6px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #424245;
          font-size: 11px;
          font-weight: 620;
          cursor: pointer;
          white-space: nowrap;
        }
        .shd-tab.active {
          background: #ffffff;
          color: #1d1d1f;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .shd-section { display: flex; flex-direction: column; gap: 8px; }
        .shd-city-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .shd-select {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #f5f5f7;
          font-size: 11.5px;
          font-weight: 620;
          color: #1d1d1f;
        }
        .shd-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.07);
          background: #ffffff;
          color: #6e6e73;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .shd-weather-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(0, 113, 227, 0.08) 0%, #f5f5f7 100%);
          border: 1px solid rgba(0, 113, 227, 0.16);
        }
        .shd-mini-lbl {
          display: block;
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.04em;
          color: #6e6e73;
        }
        .shd-weather-card strong {
          font-size: 22px;
          font-weight: 800;
          color: #1d1d1f;
        }
        .shd-weather-desc { font-size: 12px; font-weight: 620; color: #0071e3; }
        .shd-dollar-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .shd-dollar-card {
          padding: 8px 10px;
          border-radius: 12px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .shd-dollar-card strong {
          display: block;
          font-size: 15px;
          font-weight: 760;
          color: #1d1d1f;
          font-variant-numeric: tabular-nums;
        }
        .shd-dollar-card small {
          font-size: 10px;
          color: #86868b;
          font-variant-numeric: tabular-nums;
        }
        .shd-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 100%;
          padding: 7px 11px;
          border-radius: 999px;
          border: 1px solid rgba(0, 113, 227, 0.22);
          background: rgba(0, 113, 227, 0.07);
          color: #0071e3;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .shd-form {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 10px;
          border-radius: 14px;
          background: #f5f5f7;
        }
        .shd-input, .shd-textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          font-size: 12px;
          color: #1d1d1f;
          font-family: inherit;
          outline: none;
        }
        .shd-form-actions { display: flex; justify-content: flex-end; gap: 6px; }
        .shd-cancel-btn {
          padding: 5px 11px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.14);
          color: #424245;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .shd-save-btn {
          padding: 5px 13px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .shd-empty { font-size: 12px; color: #6e6e73; padding: 3px 2px; line-height: 1.4; }
        .shd-list { display: flex; flex-direction: column; gap: 6px; }
        .shd-item-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.04);
        }
        .shd-item-hit {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
          cursor: pointer;
        }
        .shd-item-hit strong {
          font-size: 12px;
          font-weight: 680;
          color: #1d1d1f;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .shd-item-hit span {
          font-size: 11px;
          color: #6e6e73;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .shd-ag-date { font-size: 10px; font-weight: 700; color: #0071e3; }
        .shd-ag-btns { display: inline-flex; gap: 4px; flex-shrink: 0; }
        .shd-ics-btn, .shd-del-btn {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #424245;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .shd-ics-btn:hover { color: #0071e3; border-color: rgba(0, 113, 227, 0.3); }
        .shd-del-btn:hover { color: #d70015; }
        .shd-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 110;
          background: rgba(29, 29, 31, 0.48);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .shd-modal {
          position: relative;
          width: 100%;
          max-width: 560px;
          max-height: 86dvh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 24px;
          padding: 24px 24px 26px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
        }
        .shd-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: none;
          background: rgba(118, 118, 128, 0.14);
          color: #1d1d1f;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .shd-modal-eyebrow {
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          color: #0071e3;
        }
        .shd-modal h2 { margin: 5px 0 6px; font-size: 22px; font-weight: 760; letter-spacing: -0.025em; }
        .shd-modal-sub { margin: 0 0 14px; font-size: 14px; color: #6e6e73; }
        .shd-modal-text p { margin: 0 0 10px; font-size: 14.5px; color: #1d1d1f; line-height: 1.62; }
      `}</style>
    </>
  );
};
