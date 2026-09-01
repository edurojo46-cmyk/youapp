import React, { useState } from 'react';
import { MessageCircleQuestion, X, Send, Sparkles } from 'lucide-react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';

export const AskModal: React.FC<{ context: ScheduleBlock, onClose: () => void }> = ({ context, onClose }) => {
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setHasSearched(true);
  };

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(24px)',
      borderRadius: '24px',
      padding: '24px',
      width: '450px',
      maxWidth: '90vw',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(0,0,0,0.05)',
      animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a1a1a', fontWeight: 600 }}>
          <MessageCircleQuestion size={20} color="var(--you-blue-vivid)" />
          <span>Preguntale a este video <Sparkles size={14} color="var(--you-blue-vivid)" style={{ marginLeft: 4 }}/></span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
          <X size={20} />
        </button>
      </div>

      {!hasSearched ? (
        <>
          <div style={{ color: '#444', fontSize: '14px' }}>
            <div style={{ marginBottom: '12px', fontWeight: 500 }}>Preguntas sugeridas:</div>
            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li style={{ cursor: 'pointer', color: 'var(--you-blue-vivid)' }} onClick={() => setQuery('¿Cuál es la idea principal?')}>¿Cuál es la idea principal?</li>
              <li style={{ cursor: 'pointer', color: 'var(--you-blue-vivid)' }} onClick={() => setQuery('¿Qué argumentos presenta?')}>¿Qué argumentos presenta?</li>
              <li style={{ cursor: 'pointer', color: 'var(--you-blue-vivid)' }} onClick={() => setQuery('¿Qué ocurrió antes?')}>¿Qué ocurrió antes?</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="¿Qué querés saber?"
              style={{
                width: '100%',
                padding: '12px 48px 12px 16px',
                borderRadius: '16px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(0,0,0,0.02)',
                fontSize: '15px',
                outline: 'none',
                color: '#1a1a1a'
              }}
            />
            <button 
              type="submit"
              disabled={!query.trim()}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: query.trim() ? 'var(--you-blue-vivid)' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: query.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '24px 0', textAlign: 'center' }}>
          <div style={{ color: '#1a1a1a', fontWeight: 500, fontSize: '15px' }}>"{query}"</div>
          <div style={{ color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
            Preguntale al video estará disponible cuando termine el análisis completo del contenido.
          </div>
          <button onClick={() => setHasSearched(false)} style={{ marginTop: '8px', background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', padding: '8px 16px', borderRadius: '16px', cursor: 'pointer' }}>
            Hacer otra pregunta
          </button>
        </div>
      )}
    </div>
  );
};
