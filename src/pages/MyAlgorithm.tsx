import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, type AlgorithmProfile, type AlgorithmWeights, type AlgorithmRules } from '../store/useStore';
import { 
  ChevronLeft, Settings, Plus, Brain, BookOpen, Compass, 
  Moon, Target, FastForward, Play, CheckCircle2, Sliders 
} from 'lucide-react';

type ViewState = 'main' | 'controls' | 'rules' | 'catalog' | 'wizard';

// Icons Map
const ICONS: Record<string, React.ReactNode> = {
  'Brain': <Brain size={24} />,
  'BookOpen': <BookOpen size={24} />,
  'Compass': <Compass size={24} />,
  'Moon': <Moon size={24} />,
  'Target': <Target size={24} />,
  'FastForward': <FastForward size={24} />
};

// SVG Radar Chart Component
const RadarChart = ({ 
  weights, color 
}: { 
  weights: AlgorithmProfile['weights'], 
  color: string 
}) => {
  const size = 200;
  const center = size / 2;
  const radius = size / 2 - 20;

  // We map 5 key metrics to the pentagon
  const data = [
    { label: 'Afinidad', value: weights.afinidad },
    { label: 'Actualidad', value: weights.actualidad },
    { label: 'Diversidad', value: weights.diversidad },
    { label: 'Descubrimiento', value: weights.nuevosCreadores },
    { label: 'Popularidad', value: weights.popularidad }
  ];

  const getCoordinatesForAngle = (angle: number, value: number) => {
    const r = (value / 100) * radius;
    const x = center + r * Math.cos(angle - Math.PI / 2);
    const y = center + r * Math.sin(angle - Math.PI / 2);
    return { x, y };
  };

  const points = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / data.length;
    return getCoordinatesForAngle(angle, d.value);
  });

  const polygonString = points.map(p => `${p.x},${p.y}`).join(' ');

  // Background grid (pentagons)
  const bgPolygons = [20, 40, 60, 80, 100].map(val => {
    const pts = data.map((d, i) => {
      const angle = (Math.PI * 2 * i) / data.length;
      return getCoordinatesForAngle(angle, val);
    });
    return pts.map(p => `${p.x},${p.y}`).join(' ');
  });

  return (
    <div className="radar-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Grid */}
        {bgPolygons.map((pts, i) => (
          <polygon 
            key={i} 
            points={pts} 
            fill="none" 
            stroke="rgba(255,255,255,0.1)" 
            strokeWidth="1" 
          />
        ))}
        {/* Axes */}
        {data.map((d, i) => {
          const angle = (Math.PI * 2 * i) / data.length;
          const end = getCoordinatesForAngle(angle, 100);
          return (
            <line 
              key={i} 
              x1={center} y1={center} 
              x2={end.x} y2={end.y} 
              stroke="rgba(255,255,255,0.1)" 
              strokeWidth="1" 
            />
          );
        })}
        {/* Data Polygon */}
        <polygon 
          points={polygonString} 
          fill={`${color}40`} // 25% opacity hex
          stroke={color} 
          strokeWidth="2" 
        />
        {/* Data Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />
        ))}
      </svg>
      {/* Labels */}
      {data.map((d, i) => {
        const angle = (Math.PI * 2 * i) / data.length;
        const pos = getCoordinatesForAngle(angle, 125); // Push labels out
        return (
          <div 
            key={i} 
            className="radar-label" 
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <span>{d.label}</span>
            <strong>{d.value}%</strong>
          </div>
        );
      })}
    </div>
  );
};

export default function MyAlgorithm() {
  const navigate = useNavigate();
  const { savedAlgorithms, activeAlgorithmId, setActiveAlgorithmId, updateAlgorithm, addAlgorithm } = useStore();
  
  const [view, setView] = useState<ViewState>('main');
  
  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardGoal, setWizardGoal] = useState('');

  const activeAlgo = savedAlgorithms.find(a => a.id === activeAlgorithmId) || savedAlgorithms[0];

  const handleUpdateActiveAlgo = (updates: Partial<AlgorithmProfile>) => {
    updateAlgorithm(activeAlgorithmId, updates);
  };

  const handleUpdateWeight = (key: keyof AlgorithmProfile['weights'], val: number) => {
    handleUpdateActiveAlgo({
      weights: { ...activeAlgo.weights, [key]: val }
    });
  };

  const handleUpdateRule = (key: keyof AlgorithmProfile['rules'], val: boolean) => {
    handleUpdateActiveAlgo({
      rules: { ...activeAlgo.rules, [key]: val }
    });
  };

  const startWizard = () => {
    setView('wizard');
    setWizardStep(1);
  };

  const finishWizard = () => {
    const newAlgo: AlgorithmProfile = {
      id: `algo-custom-${Date.now()}`,
      name: wizardGoal || 'Personalizado',
      description: 'Algoritmo creado a tu medida.',
      icon: 'Target',
      color: '#ec4899', // Pink
      weights: {
        afinidad: 70, creadores: 60, actualidad: 50, diversidad: 50,
        nuevosCreadores: 50, popularidad: 50, recomendacionesHumanas: 50, profundidad: 50, contenidoLocal: 50
      },
      rules: {
        max30Min: false, creadoresNuevos20: false, prioridadArgentina: false,
        noRepetido: false, noPolitica: false, menosNoticias24h: false, masDocumentalesNoche: false
      },
      aiControl: 50,
      lastUsed: 'Recién creado'
    };
    addAlgorithm(newAlgo);
    setActiveAlgorithmId(newAlgo.id);
    setView('main');
  };

  // Renders the correct header based on view
  const renderHeader = () => {
    let title = 'Mi Algoritmo';
    let rightAction = <Settings size={22} onClick={() => setView('rules')} className="text-white cursor-pointer" />;
    
    if (view === 'catalog') {
      title = 'Mis Algoritmos';
      rightAction = <Plus size={24} onClick={startWizard} className="text-white cursor-pointer" />;
    } else if (view === 'rules') {
      title = 'Mis Reglas';
      rightAction = <Plus size={24} className="text-white cursor-pointer opacity-50" />;
    } else if (view === 'wizard') {
      title = 'Crear algoritmo';
      rightAction = <span onClick={finishWizard} className="text-accent text-sm font-bold cursor-pointer">Guardar</span>;
    }

    return (
      <header className="ma-header">
        <button className="back-btn" onClick={() => {
          if (view === 'main') navigate(-1);
          else if (view === 'wizard' && wizardStep > 1) setWizardStep(s => s - 1);
          else setView('main');
        }}>
          <ChevronLeft size={24} />
        </button>
        <h2>{title}</h2>
        <div className="header-action">{rightAction}</div>
      </header>
    );
  };

  return (
    <div className="ma-page">
      {renderHeader()}

      <div className="ma-content">
        
        {/* VIEW: MAIN SUMMARY */}
        {view === 'main' && (
          <div className="ma-view-main fade-in">
            <div className="active-algo-card" onClick={() => setView('catalog')}>
              <div className="aac-info">
                <span className="aac-label">Algoritmo activo</span>
                <h3 className="aac-name">{activeAlgo.name}</h3>
                <span className="aac-badge">Predeterminado</span>
                <p className="aac-desc">{activeAlgo.description}</p>
              </div>
              <div className="aac-icon" style={{ color: activeAlgo.color }}>
                {ICONS[activeAlgo.icon] || <Brain size={48} />}
              </div>
              <button className="aac-change-btn">Cambiar algoritmo <ChevronLeft size={16} style={{transform: 'rotate(180deg)'}} /></button>
            </div>

            <div className="radar-section">
              <h3 className="section-title">Resumen de tu algoritmo</h3>
              <div className="radar-wrapper" onClick={() => setView('controls')} style={{cursor: 'pointer'}}>
                <RadarChart weights={activeAlgo.weights} color={activeAlgo.color} />
              </div>
            </div>

            <div className="ai-control-section">
              <div className="ai-control-header">
                <h3 className="section-title">Yo decido vs IA</h3>
                <p>Elegí cuánto control tiene la IA.</p>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={activeAlgo.aiControl}
                onChange={(e) => handleUpdateActiveAlgo({ aiControl: parseInt(e.target.value) })}
                className="ma-range custom-thumb"
                style={{ '--thumb-color': activeAlgo.color } as any}
              />
              <div className="ai-control-labels">
                <span>Yo decido<br/><strong>{100 - activeAlgo.aiControl}%</strong></span>
                <span className="text-right">IA decide<br/><strong>{activeAlgo.aiControl}%</strong></span>
              </div>
            </div>
          </div>
        )}


        {/* VIEW: CONTROLS (SLIDERS) */}
        {view === 'controls' && (
          <div className="ma-view-controls fade-in">
            <div className="controls-header">
              <h3>¿Qué priorizo en los resultados?</h3>
              <p>Mové los controles para ajustar tu algoritmo</p>
            </div>
            
            <div className="sliders-list">
              {[
                { k: 'afinidad', label: 'Afinidad conmigo', desc: 'Contenido que coincide con tus gustos', icon: '💜' },
                { k: 'creadores', label: 'Creadores que sigo', desc: 'Personas y canales que elegiste', icon: '👥' },
                { k: 'actualidad', label: 'Actualidad', desc: 'Contenido reciente y de tendencia', icon: '⏱️' },
                { k: 'diversidad', label: 'Diversidad de opiniones', desc: 'Ver distintas perspectivas', icon: '⚖️' },
                { k: 'nuevosCreadores', label: 'Nuevos creadores', desc: 'Descubrir voces nuevas', icon: '⭐' },
                { k: 'popularidad', label: 'Popularidad', desc: 'Lo más visto y viral', icon: '🔥' },
                { k: 'recomendacionesHumanas', label: 'Recomendaciones humanas', desc: 'Lo que recomiendan tu red y curadores', icon: '🤝' },
                { k: 'profundidad', label: 'Profundidad del contenido', desc: 'Análisis y contenido detallado', icon: '📖' },
                { k: 'contenidoLocal', label: 'Contenido local', desc: 'Priorizar creadores de mi país', icon: '📍' },
              ].map((item, idx) => {
                const val = activeAlgo.weights[item.k as keyof AlgorithmWeights];
                return (
                  <div key={idx} className="slider-item">
                    <div className="slider-item-header">
                      <div className="slider-item-title-group">
                        <span className="slider-emoji">{item.icon}</span>
                        <div>
                          <h4>{item.label}</h4>
                          <p>{item.desc}</p>
                        </div>
                      </div>
                      <span className="slider-val">{val}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={val}
                      onChange={(e) => handleUpdateWeight(item.k as keyof AlgorithmWeights, parseInt(e.target.value))}
                      className="ma-range"
                    />
                  </div>
                );
              })}
            </div>
            <button className="btn-primary w-full mt-6" onClick={() => setView('main')}>
              Guardar cambios
            </button>
          </div>
        )}


        {/* VIEW: RULES */}
        {view === 'rules' && (
          <div className="ma-view-rules fade-in">
            <div className="rules-tabs">
              <button className="rule-tab active">Reglas activas</button>
              <button className="rule-tab">Reglas temporales</button>
            </div>

            <div className="rules-section">
              <h3 className="section-title">Mis reglas siempre activas</h3>
              <p className="section-desc">YouApp TV cumple estas reglas al buscar y programar</p>

              <div className="rules-list">
                {[
                  { k: 'max30Min', label: 'Máximo 30 minutos por video', desc: 'No recibir videos más largos', icon: '⏱️' },
                  { k: 'creadoresNuevos20', label: '20% creadores nuevos', desc: 'En cada señal que se cree', icon: '👤' },
                  { k: 'prioridadArgentina', label: 'Prioridad: Argentina', desc: 'Mostrar más contenido local', icon: '📍' },
                  { k: 'noRepetido', label: 'No mostrarme contenido repetido', desc: 'Videos que ya vi completos', icon: '🔄' },
                  { k: 'noPolitica', label: 'No más de 2 contenidos políticos', desc: 'Seguidos en la misma señal', icon: '🛡️' },
                ].map((r, i) => {
                  const val = activeAlgo.rules[r.k as keyof AlgorithmRules];
                  return (
                    <div key={i} className="rule-item">
                      <span className="rule-emoji">{r.icon}</span>
                      <div className="rule-info">
                        <h4>{r.label}</h4>
                        <p>{r.desc}</p>
                      </div>
                      <label className="switch">
                        <input type="checkbox" checked={!!val} onChange={(e) => handleUpdateRule(r.k as keyof AlgorithmRules, e.target.checked)} />
                        <span className="slider-toggle round"></span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rules-section mt-6">
              <h3 className="section-title">Reglas temporales</h3>
              <p className="section-desc">Se aplican por un tiempo determinado</p>
              
              <div className="rules-list">
                <div className="rule-item">
                  <span className="rule-emoji">⏳</span>
                  <div className="rule-info">
                    <h4>Menos noticias por 24 horas</h4>
                    <p>Hasta mañana 00:00</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={activeAlgo.rules.menosNoticias24h} onChange={(e) => handleUpdateRule('menosNoticias24h', e.target.checked)} />
                    <span className="slider-toggle round"></span>
                  </label>
                </div>
                <div className="rule-item">
                  <span className="rule-emoji">🌙</span>
                  <div className="rule-info">
                    <h4>Más documentales esta noche</h4>
                    <p>Hasta las 23:59</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={activeAlgo.rules.masDocumentalesNoche} onChange={(e) => handleUpdateRule('masDocumentalesNoche', e.target.checked)} />
                    <span className="slider-toggle round"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* VIEW: CATALOG */}
        {view === 'catalog' && (
          <div className="ma-view-catalog fade-in">
            <div className="rules-tabs">
              <button className="rule-tab active">Mis algoritmos</button>
              <button className="rule-tab">Algoritmos populares</button>
            </div>

            <div className="catalog-list">
              {savedAlgorithms.map(algo => (
                <div 
                  key={algo.id} 
                  className={`catalog-card ${activeAlgorithmId === algo.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveAlgorithmId(algo.id);
                    setView('main');
                  }}
                >
                  <div className="cat-icon" style={{ color: algo.color }}>
                    {ICONS[algo.icon] || <Brain size={24} />}
                  </div>
                  <div className="cat-info">
                    <h4>{algo.name}</h4>
                    <p>{algo.description}</p>
                  </div>
                  <div className="cat-meta">
                    {activeAlgorithmId === algo.id ? (
                      <span className="cat-badge">Activo</span>
                    ) : (
                      <span className="cat-lastused">{algo.lastUsed}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-outline w-full mt-6" onClick={startWizard}>
              Crear nuevo algoritmo
            </button>
          </div>
        )}


        {/* VIEW: WIZARD */}
        {view === 'wizard' && (
          <div className="ma-view-wizard fade-in">
            <div className="wizard-stepper">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`wizard-step ${wizardStep >= s ? 'active' : ''}`}>
                  <div className="step-circle">{s}</div>
                  <span className="step-label">
                    {s === 1 ? 'Objetivo' : s === 2 ? 'Reglas' : s === 3 ? 'Fuentes' : 'Resumen'}
                  </span>
                </div>
              ))}
            </div>

            {wizardStep === 1 && (
              <div className="wizard-content">
                <h3 className="section-title text-center text-xl mb-2">¿Cuál es el objetivo principal?</h3>
                <p className="text-center text-gray-400 mb-6 text-sm">Elegí para qué vas a usar este algoritmo</p>
                
                <div className="goals-grid">
                  {[
                    { id: 'Informarme', icon: 'BookOpen', desc: 'Noticias, actualidad y análisis' },
                    { id: 'Aprender', icon: 'Compass', desc: 'Contenido educativo y formativo' },
                    { id: 'Descubrir', icon: 'Sparkles', desc: 'Encontrar cosas nuevas' },
                    { id: 'Entretenimiento', icon: 'Tv', desc: 'Relajarme y divertirme' },
                    { id: 'Profundizar', icon: 'Users', desc: 'Análisis y contenido en profundidad' },
                    { id: 'Personalizado', icon: 'Target', desc: 'Definir mi propio objetivo' }
                  ].map(g => (
                    <div 
                      key={g.id} 
                      className={`goal-card ${wizardGoal === g.id ? 'active' : ''}`}
                      onClick={() => setWizardGoal(g.id)}
                    >
                      <div className="goal-icon">
                        {ICONS[g.icon] || <Brain size={24} />}
                      </div>
                      <h4>{g.id}</h4>
                      <p>{g.desc}</p>
                    </div>
                  ))}
                </div>

                <button 
                  className="btn-primary w-full mt-8" 
                  onClick={() => setWizardStep(2)}
                  disabled={!wizardGoal}
                >
                  Siguiente
                </button>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="wizard-content flex items-center justify-center h-64">
                <p className="text-gray-400 text-center">Configuración de Reglas...<br/>(Simulado para la demo)</p>
                <button className="btn-primary w-full mt-8 absolute bottom-6 left-0" onClick={() => setWizardStep(3)}>Siguiente</button>
              </div>
            )}
            
            {wizardStep === 3 && (
              <div className="wizard-content flex items-center justify-center h-64">
                <p className="text-gray-400 text-center">Configuración de Fuentes...<br/>(Simulado para la demo)</p>
                <button className="btn-primary w-full mt-8 absolute bottom-6 left-0" onClick={() => setWizardStep(4)}>Siguiente</button>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="wizard-content fade-in">
                <div className="wizard-success">
                  <CheckCircle2 size={48} color="#34d399" className="mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-center">Tu algoritmo está listo</h3>
                  <p className="text-gray-400 text-center mb-6">Así funcionará {wizardGoal}</p>
                </div>

                <div className="wizard-summary-list">
                  <div className="ws-item"><span>⏱️ Actualidad</span><strong>80%</strong></div>
                  <div className="ws-item"><span>⚖️ Diversidad</span><strong>80%</strong></div>
                  <div className="ws-item"><span>👥 Creadores que sigo</span><strong>50%</strong></div>
                  <div className="ws-item"><span>⭐ Nuevos creadores</span><strong>30%</strong></div>
                  <div className="ws-item"><span>🔥 Popularidad</span><strong>20%</strong></div>
                  <div className="ws-item"><span>📖 Profundidad</span><strong>50%</strong></div>
                  <div className="ws-item"><span>📍 Contenido local</span><strong>70%</strong></div>
                </div>

                <div className="wizard-rules mt-6">
                  <h4 className="font-bold mb-3">Reglas principales</h4>
                  <ul className="text-gray-400 text-sm space-y-2">
                    <li>Máximo 20 minutos por video</li>
                    <li>Mostrar diferentes perspectivas</li>
                    <li>20% creadores nuevos</li>
                    <li>Prioridad Argentina</li>
                    <li>No repetir contenido visto</li>
                  </ul>
                </div>

                <div className="flex gap-4 mt-8">
                  <button className="btn-outline flex-1">Editar</button>
                  <button className="btn-primary flex-1" onClick={finishWizard}>Activar algoritmo</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        .ma-page {
          min-height: 100vh;
          background: #050505;
          color: white;
          padding-bottom: 90px;
          display: flex;
          flex-direction: column;
        }

        .ma-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
        }

        .ma-header h2 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0;
        }

        .back-btn {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
        }

        .ma-content {
          padding: 0 20px 20px;
          flex: 1;
        }

        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* --- View: Main --- */
        .active-algo-card {
          background: rgba(167, 139, 250, 0.05);
          border: 1px solid rgba(167, 139, 250, 0.2);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          position: relative;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .active-algo-card:hover {
          border-color: rgba(167, 139, 250, 0.4);
        }

        .aac-info {
          flex: 1;
        }

        .aac-label {
          font-size: 0.8rem;
          color: #9ca3af;
          display: block;
          margin-bottom: 4px;
        }

        .aac-name {
          font-size: 1.8rem;
          font-weight: 800;
          margin: 0 0 8px 0;
          color: white;
        }

        .aac-badge {
          font-size: 0.7rem;
          background: rgba(255,255,255,0.1);
          padding: 4px 8px;
          border-radius: 12px;
          display: inline-block;
          margin-bottom: 12px;
        }

        .aac-desc {
          font-size: 0.85rem;
          color: #9ca3af;
          margin: 0;
          line-height: 1.4;
        }

        .aac-icon {
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.8;
        }

        .aac-icon svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 15px currentColor);
        }

        .aac-change-btn {
          width: 100%;
          margin-top: 20px;
          background: none;
          border: 1px solid rgba(255,255,255,0.1);
          color: #a78bfa;
          padding: 12px;
          border-radius: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 600;
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 24px 0 16px 0;
        }

        /* Radar Chart */
        .radar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .radar-wrapper {
          position: relative;
          width: 250px;
          height: 250px;
          margin: 20px 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .radar-container {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .radar-label {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 0.75rem;
          color: #9ca3af;
          text-align: center;
          white-space: nowrap;
        }

        .radar-label strong {
          color: white;
          font-size: 0.85rem;
        }

        /* AI Control Slider */
        .ai-control-section {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 20px;
          margin-top: 10px;
        }

        .ai-control-header p {
          font-size: 0.85rem;
          color: #9ca3af;
          margin: -10px 0 16px 0;
        }

        .ma-range {
          width: 100%;
          -webkit-appearance: none;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 5px;
          outline: none;
        }

        .ma-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #a78bfa;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(167, 139, 250, 0.6);
        }

        .ma-range.custom-thumb::-webkit-slider-thumb {
          background: var(--thumb-color, #a78bfa);
          box-shadow: 0 0 10px var(--thumb-color, #a78bfa);
        }

        .ai-control-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          font-size: 0.8rem;
          color: #9ca3af;
        }
        .ai-control-labels strong {
          color: white;
          font-size: 1rem;
        }

        /* --- View: Controls --- */
        .controls-header p {
          color: #9ca3af;
          font-size: 0.9rem;
          margin-bottom: 24px;
        }

        .sliders-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .slider-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .slider-item-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .slider-emoji {
          font-size: 1.5rem;
          width: 32px;
          text-align: center;
        }

        .slider-item-title-group h4 {
          margin: 0 0 2px 0;
          font-size: 0.95rem;
          color: white;
        }

        .slider-item-title-group p {
          margin: 0;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .slider-val {
          font-weight: 700;
          font-size: 0.95rem;
        }

        /* --- View: Rules --- */
        .rules-tabs {
          display: flex;
          background: rgba(255,255,255,0.05);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 24px;
        }

        .rule-tab {
          flex: 1;
          background: none;
          border: none;
          color: #9ca3af;
          padding: 10px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .rule-tab.active {
          background: #a78bfa;
          color: #050505;
        }

        .section-desc {
          color: #9ca3af;
          font-size: 0.85rem;
          margin: -10px 0 20px 0;
        }

        .rules-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .rule-item {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 16px;
          border-radius: 16px;
        }

        .rule-emoji {
          font-size: 1.5rem;
        }

        .rule-info {
          flex: 1;
        }

        .rule-info h4 {
          margin: 0 0 2px 0;
          font-size: 0.9rem;
          color: white;
        }

        .rule-info p {
          margin: 0;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        /* Toggle Switch */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider-toggle {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(255,255,255,0.1);
          transition: .4s;
        }
        .slider-toggle:before {
          position: absolute;
          content: "";
          height: 18px; width: 18px;
          left: 3px; bottom: 3px;
          background-color: white;
          transition: .4s;
        }
        input:checked + .slider-toggle {
          background-color: #a78bfa;
        }
        input:checked + .slider-toggle:before {
          transform: translateX(20px);
        }
        .slider-toggle.round { border-radius: 24px; }
        .slider-toggle.round:before { border-radius: 50%; }

        /* --- View: Catalog --- */
        .catalog-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .catalog-card {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .catalog-card.active {
          border-color: #a78bfa;
          background: rgba(167, 139, 250, 0.05);
        }

        .cat-icon {
          width: 48px;
          height: 48px;
          background: rgba(255,255,255,0.05);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cat-info {
          flex: 1;
        }

        .cat-info h4 {
          margin: 0 0 4px 0;
          font-size: 1rem;
          color: white;
        }

        .cat-info p {
          margin: 0;
          font-size: 0.8rem;
          color: #9ca3af;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .cat-badge {
          background: #a78bfa;
          color: #050505;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 12px;
        }

        .cat-lastused {
          font-size: 0.7rem;
          color: #6b7280;
        }

        /* --- View: Wizard --- */
        .wizard-stepper {
          display: flex;
          justify-content: space-between;
          margin-bottom: 32px;
          position: relative;
        }

        .wizard-stepper::before {
          content: '';
          position: absolute;
          top: 14px;
          left: 10%;
          right: 10%;
          height: 2px;
          background: rgba(255,255,255,0.1);
          z-index: 0;
        }

        .wizard-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          z-index: 1;
        }

        .step-circle {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #1f2937;
          border: 2px solid #374151;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: #9ca3af;
        }

        .wizard-step.active .step-circle {
          background: #a78bfa;
          border-color: #a78bfa;
          color: #050505;
        }

        .step-label {
          font-size: 0.7rem;
          color: #6b7280;
        }

        .wizard-step.active .step-label {
          color: white;
        }

        .goals-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .goal-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 20px 16px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .goal-card.active {
          border-color: #a78bfa;
          background: rgba(167, 139, 250, 0.05);
        }

        .goal-icon {
          color: #a78bfa;
          margin-bottom: 12px;
          display: flex;
          justify-content: center;
        }

        .goal-card h4 {
          margin: 0 0 6px 0;
          font-size: 0.9rem;
          color: white;
        }

        .goal-card p {
          margin: 0;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .wizard-summary-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ws-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          color: #d1d5db;
        }

        .ws-item strong {
          color: white;
        }

        /* Common Buttons */
        .btn-primary {
          background: #a78bfa;
          color: #050505;
          border: none;
          padding: 16px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-outline {
          background: transparent;
          color: #a78bfa;
          border: 1px solid #a78bfa;
          padding: 16px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }

        .w-full { width: 100%; }
        .mt-6 { margin-top: 24px; }
        .mt-8 { margin-top: 32px; }

        /* Desktop Adjustments */
        @media (min-width: 1024px) {
          .ma-page {
            max-width: 800px;
            margin: 0 auto;
          }
          .ma-header {
            display: none; /* DesktopLayout provides header */
          }
          .ma-content {
            padding: 24px 0;
          }
        }
      `}</style>
    </div>
  );
}
