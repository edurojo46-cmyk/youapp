import { useState, useEffect } from 'react';
import { Flame, Waves, CloudRain, Palette, X, Clock } from 'lucide-react';

interface AmbientModeProps {
  isOpen: boolean;
  onClose: () => void;
}

const AMBIENT_SCENES = [
  {
    id: 'fireplace',
    title: '🔥 Chimenea de Leña 4K',
    desc: 'Fuego crepitante acogedor para relajar o leer',
    videoUrl: 'https://www.youtube.com/embed/AWKzr6n0ea0',
    icon: Flame,
    color: '#f97316'
  },
  {
    id: 'aquarium',
    title: '🐠 Acuario Tropical Marino 4K',
    desc: 'Peces tropicales y arrecifes submarinos en Ultra HD',
    videoUrl: 'https://www.youtube.com/embed/1ZbAZB0h_mQ',
    icon: Waves,
    color: '#06b6d4'
  },
  {
    id: 'rain',
    title: '🌧️ Lluvia Suave en la Ventana',
    desc: 'Gotas de lluvia nocturnas con luces de ciudad',
    videoUrl: 'https://www.youtube.com/embed/eKFTSSKCzWA',
    icon: CloudRain,
    color: '#3b82f6'
  },
  {
    id: 'art',
    title: '🎨 Galería de Arte & Paisajes',
    desc: 'Pinturas maestras y paisajes naturales en 4K',
    videoUrl: 'https://www.youtube.com/embed/BHACKCNDMW8',
    icon: Palette,
    color: '#a855f7'
  }
];

export default function AmbientMode({ isOpen, onClose }: AmbientModeProps) {
  const [currentScene, setCurrentScene] = useState(AMBIENT_SCENES[0]);
  const [currentTime, setCurrentTime] = useState('');
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const hideTimer = setTimeout(() => {
      setShowControls(false);
    }, 4000);

    const handleMouseMove = () => {
      setShowControls(true);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isOpen, currentScene]);

  if (!isOpen) return null;

  return (
    <div className="ambient-mode-viewport">
      {/* Video de Fondo a Pantalla Completa */}
      <iframe
        key={currentScene.id}
        src={`${currentScene.videoUrl}?autoplay=1&mute=0&controls=0&loop=1`}
        title={currentScene.title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="ambient-iframe"
      />

      {/* Reloj Digital Minimalista */}
      <div className={`ambient-clock ${showControls ? 'with-bg' : ''}`}>
        <span className="clock-time">{currentTime}</span>
        <span className="clock-title">{currentScene.title}</span>
      </div>

      {/* Botón de Cierre */}
      <button className="ambient-close-btn" onClick={onClose} title="Salir de Modo Ambiente (ESC)">
        <X size={24} />
      </button>

      {/* Selector de Escenas Flotante */}
      <div className={`ambient-scene-bar glass-panel ${showControls ? 'visible' : 'hidden'}`}>
        {AMBIENT_SCENES.map((scene) => {
          const Icon = scene.icon;
          const isActive = currentScene.id === scene.id;
          return (
            <button
              key={scene.id}
              className={`scene-btn ${isActive ? 'active' : ''}`}
              onClick={() => setCurrentScene(scene)}
              style={{ borderColor: isActive ? scene.color : 'transparent' }}
            >
              <Icon size={18} style={{ color: scene.color }} />
              <span>{scene.title.split(' ')[1]}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        .ambient-mode-viewport {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #000;
          color: white;
          overflow: hidden;
        }

        .ambient-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          border: none;
          pointer-events: none;
          transform: scale(1.05); /* Oculta bordes de reproductor */
        }

        .ambient-clock {
          position: absolute;
          top: 30px;
          left: 30px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          padding: 8px 16px;
          border-radius: 12px;
          transition: background 0.3s ease;
        }

        .ambient-clock.with-bg {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
        }

        .clock-time {
          font-family: monospace;
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: 2px;
          text-shadow: 0 4px 15px rgba(0, 0, 0, 0.8);
        }

        .clock-title {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.7);
          margin-top: 2px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
        }

        .ambient-close-btn {
          position: absolute;
          top: 30px;
          right: 30px;
          z-index: 100;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }

        .ambient-close-btn:hover {
          background: rgba(239, 68, 68, 0.8);
          transform: scale(1.1);
        }

        .ambient-scene-bar {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          display: flex;
          gap: 10px;
          padding: 8px 16px;
          border-radius: 30px;
          background: rgba(15, 17, 26, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }

        .ambient-scene-bar.hidden {
          opacity: 0;
          transform: translate(-50%, 30px);
          pointer-events: none;
        }

        .ambient-scene-bar.visible {
          opacity: 1;
          transform: translate(-50%, 0);
        }

        .scene-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid transparent;
          color: white;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .scene-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .scene-btn.active {
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        }
      `}</style>
    </div>
  );
}
