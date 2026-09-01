import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Sparkles, Play } from 'lucide-react';

const CATEGORIES = [
  { id: 'pol', label: 'Política', defaultVal: 30 },
  { id: 'eco', label: 'Economía', defaultVal: 20 },
  { id: 'his', label: 'Historia', defaultVal: 20 },
  { id: 'cul', label: 'Cultura', defaultVal: 10 },
  { id: 'sol', label: 'Solidaridad', defaultVal: 20 },
];

export default function MixChannel() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [sliders, setSliders] = useState(
    CATEGORIES.reduce((acc, cat) => ({...acc, [cat.id]: cat.defaultVal}), {} as Record<string, number>)
  );

  const handleSliderChange = (id: string, value: number) => {
    setSliders(prev => ({ ...prev, [id]: value }));
  };

  const handleCreate = () => {
    // Aquí iría la lógica para enviar a la IA y crear el canal
    navigate('/stream');
  };

  return (
    <div className="mix-container">
      <header className="mix-header">
        <button className="icon-btn glass-panel" onClick={() => navigate('/')}>
          <ChevronLeft size={24} />
        </button>
        <h2>Crear un Canal</h2>
        <div style={{width: 48}}></div> {/* Spacer */}
      </header>

      <main className="mix-content">
        <div className="ai-prompt-section glass-card">
          <label>
            <Sparkles size={20} className="ai-icon" />
            IA Director de Programación
          </label>
          <textarea 
            placeholder="Ej: Creame un canal sobre política argentina con posiciones diferentes, poca farándula, videos de menos de 20 minutos..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="divider-text">O ajustá manualmente:</div>

        <div className="sliders-section">
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="slider-group">
              <div className="slider-labels">
                <span>{cat.label}</span>
                <span>{sliders[cat.id]}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={sliders[cat.id]} 
                onChange={(e) => handleSliderChange(cat.id, parseInt(e.target.value))}
                className="mix-slider"
              />
            </div>
          ))}
        </div>
      </main>

      <footer className="mix-footer">
        <button className="btn btn-primary create-btn" onClick={handleCreate}>
          <Play size={24} />
          CREAR MI STREAM
        </button>
      </footer>

      <style>{`
        .mix-container {
          padding: var(--space-lg);
          max-width: 600px;
          margin: 0 auto;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .mix-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-xl);
        }

        .icon-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
        }

        .mix-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: var(--space-xl);
        }

        .ai-prompt-section {
          padding: var(--space-md);
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }

        .ai-prompt-section label {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-weight: 600;
          color: var(--accent-secondary);
        }

        .ai-prompt-section textarea {
          background: rgba(0,0,0,0.2);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-sm);
          padding: var(--space-md);
          color: white;
          font-family: inherit;
          min-height: 100px;
          resize: vertical;
        }

        .ai-prompt-section textarea:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .divider-text {
          text-align: center;
          color: var(--text-secondary);
          font-weight: 500;
          position: relative;
        }

        .divider-text::before, .divider-text::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 30%;
          height: 1px;
          background: var(--border-glass);
        }

        .divider-text::before { left: 0; }
        .divider-text::after { right: 0; }

        .sliders-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .slider-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-weight: 500;
        }

        .mix-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: var(--bg-secondary);
          outline: none;
        }

        .mix-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent-gradient);
          cursor: pointer;
          border: 2px solid white;
        }

        .mix-footer {
          margin-top: var(--space-2xl);
          padding-bottom: var(--space-xl);
          display: flex;
          justify-content: center;
        }

        .create-btn {
          width: 100%;
          padding: var(--space-lg);
          font-size: 1.2rem;
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
}
