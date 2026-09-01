import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldCheck, Sparkles } from 'lucide-react';

export const ExperiencePanel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <aside className="mp-sidebar-right">
      <div className="mp-unified-card">
        <h3 className="mp-unified-title">Tu experiencia, unificada</h3>

        {/* 1. Búsqueda única */}
        <div className="mp-feature-item">
          <div className="mp-feature-icon">
            <Search size={15} />
          </div>
          <div className="mp-feature-text">
            <div className="mp-feature-heading">Búsqueda única</div>
            <p className="mp-feature-desc">
              Buscá en todas tus plataformas desde un solo lugar.
            </p>
          </div>
        </div>

        {/* 2. Dónde verla */}
        <div className="mp-feature-item">
          <div className="mp-feature-icon">
            <ShieldCheck size={15} />
          </div>
          <div className="mp-feature-text">
            <div className="mp-feature-heading">Dónde verla</div>
            <p className="mp-feature-desc">
              Encontrá la opción disponible en Argentina.
            </p>
          </div>
        </div>

        {/* 3. Para vos */}
        <div className="mp-feature-item">
          <div className="mp-feature-icon">
            <Sparkles size={15} />
          </div>
          <div className="mp-feature-text">
            <div className="mp-feature-heading">Para vos</div>
            <p className="mp-feature-desc">
              YouApp aprende lo que preferís sin límites de catálogo.
            </p>
          </div>
        </div>
      </div>

      <button
        className="mp-smart-suggestions-btn"
        onClick={() => navigate('/my-algorithm')}
      >
        <Sparkles size={16} color="#007aff" />
        <span>Sugerencias inteligentes</span>
      </button>
    </aside>
  );
};
