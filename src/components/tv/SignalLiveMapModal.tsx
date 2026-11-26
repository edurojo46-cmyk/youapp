import React, { useMemo, useState } from 'react';
import { Globe2, MapPin, X } from 'lucide-react';
import {
  QUICK_LIVE_CITIES,
  type LiveParticipant
} from '../../lib/tv/signalLivePresence';

interface SignalLiveMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  signalName: string;
  participants: LiveParticipant[];
  isLiveVisible: boolean;
  liveCity: string;
  onJoinWithCity: (city: string) => void;
  onGreetCity: (city: string) => void;
}

/** Coordenadas aproximadas a nivel ciudad/región (nunca GPS ni ubicación exacta) */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'buenos aires': { lat: -34.6, lon: -58.4 },
  'cordoba': { lat: -31.4, lon: -64.2 },
  'córdoba': { lat: -31.4, lon: -64.2 },
  'rosario': { lat: -32.95, lon: -60.65 },
  'mendoza': { lat: -32.89, lon: -68.84 },
  'mar del plata': { lat: -38.0, lon: -57.55 },
  'tucuman': { lat: -26.82, lon: -65.22 },
  'tucumán': { lat: -26.82, lon: -65.22 },
  'salta': { lat: -24.78, lon: -65.41 },
  'neuquen': { lat: -38.95, lon: -68.06 },
  'neuquén': { lat: -38.95, lon: -68.06 },
  'argentina': { lat: -34.6, lon: -63.6 },
  'montevideo': { lat: -34.9, lon: -56.16 },
  'uruguay': { lat: -33.0, lon: -56.0 },
  'santiago': { lat: -33.45, lon: -70.66 },
  'chile': { lat: -33.45, lon: -70.66 },
  'asuncion': { lat: -25.26, lon: -57.57 },
  'asunción': { lat: -25.26, lon: -57.57 },
  'sao paulo': { lat: -23.55, lon: -46.63 },
  'são paulo': { lat: -23.55, lon: -46.63 },
  'rio de janeiro': { lat: -22.9, lon: -43.17 },
  'lima': { lat: -12.04, lon: -77.04 },
  'bogota': { lat: 4.71, lon: -74.07 },
  'bogotá': { lat: 4.71, lon: -74.07 },
  'ciudad de mexico': { lat: 19.43, lon: -99.13 },
  'ciudad de méxico': { lat: 19.43, lon: -99.13 },
  'mexico': { lat: 19.43, lon: -99.13 },
  'méxico': { lat: 19.43, lon: -99.13 },
  'miami': { lat: 25.76, lon: -80.19 },
  'nueva york': { lat: 40.71, lon: -74.0 },
  'madrid': { lat: 40.42, lon: -3.7 },
  'barcelona': { lat: 41.39, lon: 2.17 },
  'roma': { lat: 41.9, lon: 12.5 },
  'paris': { lat: 48.85, lon: 2.35 },
  'parís': { lat: 48.85, lon: 2.35 },
  'londres': { lat: 51.5, lon: -0.12 }
};

function projectToSvg(lat: number, lon: number): { x: number; y: number } {
  // Proyección equirectangular sobre viewBox 0..720 x 0..360
  const x = ((lon + 180) / 360) * 720;
  const y = ((90 - lat) / 180) * 360;
  return { x, y };
}

function resolveCityCoords(city: string): { lat: number; lon: number } {
  const norm = city.trim().toLowerCase();
  if (CITY_COORDS[norm]) return CITY_COORDS[norm];
  const partial = Object.keys(CITY_COORDS).find((k) => norm.includes(k) || k.includes(norm));
  if (partial) return CITY_COORDS[partial];
  return CITY_COORDS['buenos aires'];
}

export const SignalLiveMapModal: React.FC<SignalLiveMapModalProps> = ({
  isOpen,
  onClose,
  signalName,
  participants,
  isLiveVisible,
  liveCity,
  onJoinWithCity,
  onGreetCity
}) => {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const cityClusters = useMemo(() => {
    const map = new Map<string, { city: string; x: number; y: number; people: LiveParticipant[] }>();
    for (const p of participants) {
      const label = p.city?.trim() || 'Buenos Aires';
      const key = label.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.people.push(p);
      } else {
        const coords = resolveCityCoords(label);
        const pt = projectToSvg(coords.lat, coords.lon);
        map.set(key, { city: label, x: pt.x, y: pt.y, people: [p] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.people.length - a.people.length);
  }, [participants]);

  if (!isOpen) return null;

  const activeCluster =
    cityClusters.find((c) => c.city.toLowerCase() === (selectedCity || '').toLowerCase()) ||
    cityClusters[0] ||
    null;

  return (
    <div className="slm-backdrop" role="dialog" aria-modal="true" aria-label="Mapa de Señal Viva" onClick={onClose}>
      <div className="slm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="slm-head">
          <div className="slm-head-title">
            <Globe2 size={18} color="#34d399" />
            <div>
              <h3>Mapa · {signalName}</h3>
              <span>
                {participants.length > 0
                  ? `${participants.length} ${participants.length === 1 ? 'persona visible' : 'personas visibles'} en ${cityClusters.length} ${cityClusters.length === 1 ? 'región' : 'regiones'}`
                  : 'Activá «Estoy aquí» para aparecer en tu ciudad aproximada'}
              </span>
            </div>
          </div>
          <button type="button" className="slm-close" onClick={onClose} aria-label="Cerrar mapa">
            <X size={16} />
          </button>
        </div>

        {/* MAPA VECTORIAL DARK GLASS (0 cuota · 100 % privacidad regional) */}
        <div className="slm-map-wrap">
          <svg viewBox="0 0 720 360" className="slm-svg" role="img" aria-label="Mapa regional de espectadores">
            <defs>
              <radialGradient id="slmBgGlow" cx="50%" cy="55%" r="65%">
                <stop offset="0%" stopColor="#12263a" />
                <stop offset="100%" stopColor="#090e18" />
              </radialGradient>
              <radialGradient id="slmPinGlow">
                <stop offset="0%" stopColor="rgba(52,211,153,0.9)" />
                <stop offset="100%" stopColor="rgba(52,211,153,0)" />
              </radialGradient>
            </defs>

            <rect x="0" y="0" width="720" height="360" fill="url(#slmBgGlow)" />

            {/* Grilla sutil de meridianos y paralelos */}
            <g stroke="rgba(100,210,255,0.09)" strokeWidth="0.7">
              {[60, 120, 180, 240, 300].map((y) => (
                <line key={`lat-${y}`} x1="0" y1={y} x2="720" y2={y} />
              ))}
              {[90, 180, 270, 360, 450, 540, 630].map((x) => (
                <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="360" />
              ))}
            </g>

            {/* Siluetas estilizadas de continentes */}
            <g fill="rgba(148, 197, 255, 0.14)" stroke="rgba(148, 197, 255, 0.28)" strokeWidth="0.9">
              {/* América del Norte y Central */}
              <path d="M 76 58 L 155 48 L 210 64 L 222 104 L 195 128 L 176 154 L 188 170 L 166 176 L 146 154 L 122 126 L 94 102 Z" />
              {/* América del Sur */}
              <path d="M 196 184 L 238 190 L 278 214 L 284 246 L 254 294 L 230 330 L 214 326 L 204 282 L 192 232 Z" />
              {/* Europa */}
              <path d="M 332 68 L 382 58 L 418 72 L 410 104 L 372 110 L 340 102 Z" />
              {/* África */}
              <path d="M 334 122 L 392 122 L 430 162 L 418 228 L 386 270 L 362 260 L 348 202 L 324 166 Z" />
              {/* Asia */}
              <path d="M 418 62 L 548 56 L 614 86 L 594 148 L 542 178 L 488 172 L 436 142 Z" />
              {/* Oceanía */}
              <path d="M 576 234 L 640 232 L 656 276 L 618 294 L 574 274 Z" />
            </g>

            {/* Puntos luminosos por ciudad activa */}
            {cityClusters.map((cl) => {
              const isSelected = activeCluster?.city === cl.city;
              return (
                <g
                  key={cl.city}
                  className="slm-pin-group"
                  onClick={() => setSelectedCity(cl.city)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={cl.x} cy={cl.y} r={isSelected ? 22 : 16} fill="url(#slmPinGlow)" />
                  <circle
                    cx={cl.x}
                    cy={cl.y}
                    r={isSelected ? 6.5 : 5}
                    fill="#34d399"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                  />
                  <text
                    x={cl.x + 9}
                    y={cl.y + 4}
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="700"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                  >
                    {cl.city} ({cl.people.length})
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* DETALLE DE REGIÓN SELECCIONADA O INVITACIÓN OPT-IN */}
        {activeCluster ? (
          <div className="slm-region-box">
            <div className="slm-region-left">
              <MapPin size={15} color="#34d399" />
              <div>
                <strong>
                  {activeCluster.city} ({activeCluster.people.length})
                </strong>
                <span>
                  {activeCluster.people
                    .slice(0, 4)
                    .map((p) => p.name)
                    .join(' · ')}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="slm-greet-btn"
              onClick={() => onGreetCity(activeCluster.city)}
            >
              👋 Saludar
            </button>
          </div>
        ) : (
          <div className="slm-empty-box">
            <strong>Todavía no hay ciudades visibles en esta señal.</strong>
            <span>Elegí tu ciudad aproximada abajo para encender el primer punto en el mapa:</span>
          </div>
        )}

        {!isLiveVisible && (
          <div className="slm-join-row">
            <span className="slm-join-label">Sumarme al mapa (opcional):</span>
            <div className="slm-city-chips">
              {QUICK_LIVE_CITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`slm-city-chip ${liveCity === c ? 'active' : ''}`}
                  onClick={() => onJoinWithCity(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="slm-privacy-note">
          Privacidad: solo muestra ciudades aproximadas elegidas manualmente. Nunca GPS ni domicilio; usuarios ocultos o invitados no aparecen.
        </p>
      </div>

      <style>{`
        .slm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99995;
          background: rgba(6, 9, 16, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
        }
        .slm-modal {
          width: 100%;
          max-width: 620px;
          max-height: 90dvh;
          overflow-y: auto;
          border-radius: 22px;
          padding: 16px;
          background: rgba(14, 18, 28, 0.96);
          border: 1px solid rgba(100, 210, 255, 0.28);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
          color: #f5f5f7;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .slm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .slm-head-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .slm-head-title h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
          color: #ffffff;
        }
        .slm-head-title span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
        }
        .slm-close {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .slm-map-wrap {
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(100, 210, 255, 0.22);
          background: #090e18;
        }
        .slm-svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .slm-region-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(16, 185, 129, 0.14);
          border: 1px solid rgba(52, 211, 153, 0.35);
        }
        .slm-region-left {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }
        .slm-region-left strong {
          display: block;
          font-size: 13px;
          color: #ffffff;
        }
        .slm-region-left span {
          display: block;
          font-size: 11.5px;
          color: rgba(235, 250, 245, 0.78);
        }
        .slm-greet-btn {
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid rgba(52, 211, 153, 0.65);
          background: rgba(16, 185, 129, 0.32);
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
        }
        .slm-empty-box {
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .slm-empty-box strong {
          font-size: 12.5px;
          color: #ffffff;
        }
        .slm-empty-box span {
          font-size: 11.5px;
          color: rgba(245, 245, 247, 0.68);
        }
        .slm-join-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .slm-join-label {
          font-size: 11.5px;
          font-weight: 700;
          color: #a7f3d0;
        }
        .slm-city-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .slm-city-chip {
          padding: 5px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f7;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
        }
        .slm-city-chip.active,
        .slm-city-chip:hover {
          background: #0071e3;
          border-color: #64d2ff;
          color: #ffffff;
        }
        .slm-privacy-note {
          margin: 0;
          font-size: 10.5px;
          color: rgba(245, 245, 247, 0.55);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
};
