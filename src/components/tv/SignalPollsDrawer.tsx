import React, { useEffect, useState } from 'react';
import { BarChart3, Check, ChevronDown, Lock, Plus, Trash2, Unlock, X } from 'lucide-react';
import {
  createSignalPoll,
  deleteSignalPoll,
  readSignalPolls,
  toggleSignalPollOpen,
  voteSignalPoll,
  type SignalPoll
} from '../../lib/tv/signalPollsStore';

interface SignalPollsDrawerProps {
  signalId: string;
  isOwner?: boolean;
}

export const SignalPollsDrawer: React.FC<SignalPollsDrawerProps> = ({
  signalId,
  isOwner = true
}) => {
  const [open, setOpen] = useState(false);
  const [polls, setPolls] = useState<SignalPoll[]>(() => readSignalPolls(signalId));
  const [showCreator, setShowCreator] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    setPolls(readSignalPolls(signalId));
    setShowCreator(false);
  }, [signalId]);

  const activeOpenCount = polls.filter((p) => p.isOpen).length;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOpts.length < 2) return;
    const next = createSignalPoll(signalId, question, cleanOpts);
    setPolls(next);
    setQuestion('');
    setOptions(['', '']);
    setShowCreator(false);
  };

  return (
    <div className="spd-drawer">
      <button
        type="button"
        className={`spd-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="spd-title">
          <BarChart3 size={13} color="#0071e3" />
          <span>Encuestas en vivo</span>
          <span className="spd-badge">{polls.length}</span>
          {activeOpenCount > 0 && <span className="spd-live-dot" title="Encuesta abierta" />}
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
        <div className="spd-body">
          {isOwner && !showCreator && (
            <button
              type="button"
              className="spd-new-btn"
              onClick={() => setShowCreator(true)}
            >
              <Plus size={12} />
              <span>Crear encuesta rápida</span>
            </button>
          )}

          {isOwner && showCreator && (
            <form onSubmit={handleCreate} className="spd-form">
              <div className="spd-form-head">
                <span>Nueva encuesta para tu audiencia</span>
                <button
                  type="button"
                  className="spd-close-x"
                  onClick={() => setShowCreator(false)}
                  aria-label="Cancelar"
                >
                  <X size={13} />
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={110}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pregunta (ej. ¿Qué tema vemos en el próximo programa?)"
                className="spd-input"
              />
              {options.map((opt, idx) => (
                <div key={idx} className="spd-opt-row">
                  <input
                    type="text"
                    required={idx < 2}
                    maxLength={60}
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Opción ${idx + 1}`}
                    className="spd-input"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="spd-close-x"
                      onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Quitar opción"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <div className="spd-form-foot">
                {options.length < 4 && (
                  <button
                    type="button"
                    className="spd-add-opt"
                    onClick={() => setOptions((prev) => [...prev, ''])}
                  >
                    + Otra opción
                  </button>
                )}
                <button type="submit" className="spd-publish-btn">
                  Publicar
                </button>
              </div>
            </form>
          )}

          {polls.length === 0 ? (
            <div className="spd-empty">
              Todavía no hay encuestas en esta señal. {isOwner ? 'Creá una para que tu audiencia vote en vivo.' : ''}
            </div>
          ) : (
            <div className="spd-list">
              {polls.map((poll) => {
                const totalVotes = poll.options.reduce((acc, o) => acc + o.votes, 0);
                const hasVoted = Boolean(poll.userVotedOptionId);

                return (
                  <div key={poll.id} className="spd-poll-card">
                    <div className="spd-poll-head">
                      <strong>{poll.question}</strong>
                      {isOwner && (
                        <div className="spd-owner-ctrls">
                          <button
                            type="button"
                            className="spd-mini-ico"
                            onClick={() => setPolls(toggleSignalPollOpen(signalId, poll.id))}
                            title={poll.isOpen ? 'Cerrar votación' : 'Reabrir votación'}
                          >
                            {poll.isOpen ? <Unlock size={11} /> : <Lock size={11} />}
                          </button>
                          <button
                            type="button"
                            className="spd-mini-ico danger"
                            onClick={() => setPolls(deleteSignalPoll(signalId, poll.id))}
                            title="Eliminar encuesta"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="spd-options">
                      {poll.options.map((opt) => {
                        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                        const isMine = poll.userVotedOptionId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!poll.isOpen}
                            className={`spd-vote-btn ${isMine ? 'selected' : ''}`}
                            onClick={() => setPolls(voteSignalPoll(signalId, poll.id, opt.id))}
                          >
                            {(hasVoted || !poll.isOpen) && (
                              <span
                                className="spd-vote-bar"
                                style={{ width: `${pct}%` }}
                                aria-hidden="true"
                              />
                            )}
                            <span className="spd-vote-label">
                              {isMine && <Check size={11} />}
                              <span>{opt.label}</span>
                            </span>
                            {(hasVoted || !poll.isOpen) && (
                              <span className="spd-vote-pct">{pct}%</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="spd-poll-foot">
                      <span>
                        {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
                      </span>
                      <span>{poll.isOpen ? '● Abierta' : 'Cerrada'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        .spd-drawer {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        .spd-toggle {
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
        .spd-toggle:hover {
          background: rgba(0, 0, 0, 0.025);
        }
        .spd-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .spd-badge {
          padding: 1px 7px;
          border-radius: 999px;
          background: rgba(0, 113, 227, 0.1);
          color: #0071e3;
          font-size: 11px;
          font-weight: 700;
        }
        .spd-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #30d158;
          display: inline-block;
        }
        .spd-body {
          padding: 9px 11px 11px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .spd-new-btn {
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
        .spd-form {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 10px;
          border-radius: 14px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .spd-form-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
          color: #424245;
        }
        .spd-opt-row {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .spd-input {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          background: #ffffff;
          font-size: 12px;
          color: #1d1d1f;
          outline: none;
        }
        .spd-input:focus {
          border-color: #0071e3;
        }
        .spd-close-x {
          border: none;
          background: transparent;
          color: #86868b;
          cursor: pointer;
          padding: 2px;
          display: inline-flex;
        }
        .spd-form-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 2px;
        }
        .spd-add-opt {
          border: none;
          background: transparent;
          color: #0071e3;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .spd-publish-btn {
          margin-left: auto;
          padding: 6px 14px;
          border-radius: 999px;
          border: none;
          background: #0071e3;
          color: #ffffff;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .spd-empty {
          font-size: 12px;
          color: #6e6e73;
          padding: 3px 2px;
        }
        .spd-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .spd-poll-card {
          padding: 10px;
          border-radius: 14px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .spd-poll-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .spd-poll-head strong {
          font-size: 12.5px;
          font-weight: 700;
          color: #1d1d1f;
          line-height: 1.3;
        }
        .spd-owner-ctrls {
          display: inline-flex;
          gap: 3px;
          flex-shrink: 0;
        }
        .spd-mini-ico {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.07);
          background: #ffffff;
          color: #6e6e73;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .spd-mini-ico.danger:hover {
          color: #d70015;
        }
        .spd-options {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .spd-vote-btn {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
        }
        .spd-vote-btn.selected {
          border-color: #0071e3;
          color: #0071e3;
        }
        .spd-vote-btn:disabled {
          cursor: default;
        }
        .spd-vote-bar {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          background: rgba(0, 113, 227, 0.13);
          transition: width 0.25s ease;
          pointer-events: none;
        }
        .spd-vote-label {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .spd-vote-pct {
          position: relative;
          z-index: 1;
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #424245;
        }
        .spd-poll-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10.5px;
          font-weight: 600;
          color: #86868b;
        }
      `}</style>
    </div>
  );
};
