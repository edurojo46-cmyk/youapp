import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/** Coordenadas reales a nivel ciudad/región (nunca GPS ni ubicación exacta) */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'buenos aires': { lat: -34.6037, lon: -58.3816 },
  'cordoba': { lat: -31.4201, lon: -64.1888 },
  'córdoba': { lat: -31.4201, lon: -64.1888 },
  'rosario': { lat: -32.9442, lon: -60.6505 },
  'mendoza': { lat: -32.8895, lon: -68.8458 },
  'mar del plata': { lat: -38.0055, lon: -57.5426 },
  'tucuman': { lat: -26.8083, lon: -65.2176 },
  'tucumán': { lat: -26.8083, lon: -65.2176 },
  'salta': { lat: -24.7821, lon: -65.4232 },
  'neuquen': { lat: -38.9516, lon: -68.0591 },
  'neuquén': { lat: -38.9516, lon: -68.0591 },
  'argentina': { lat: -34.6037, lon: -63.6167 },
  'montevideo': { lat: -34.9011, lon: -56.1645 },
  'uruguay': { lat: -32.5228, lon: -55.7658 },
  'santiago': { lat: -33.4489, lon: -70.6693 },
  'chile': { lat: -33.4489, lon: -70.6693 },
  'asuncion': { lat: -25.2637, lon: -57.5759 },
  'asunción': { lat: -25.2637, lon: -57.5759 },
  'sao paulo': { lat: -23.5505, lon: -46.6333 },
  'são paulo': { lat: -23.5505, lon: -46.6333 },
  'rio de janeiro': { lat: -22.9068, lon: -43.1729 },
  'lima': { lat: -12.0464, lon: -77.0428 },
  'bogota': { lat: 4.711, lon: -74.0721 },
  'bogotá': { lat: 4.711, lon: -74.0721 },
  'ciudad de mexico': { lat: 19.4326, lon: -99.1332 },
  'ciudad de méxico': { lat: 19.4326, lon: -99.1332 },
  'mexico': { lat: 19.4326, lon: -99.1332 },
  'méxico': { lat: 19.4326, lon: -99.1332 },
  'miami': { lat: 25.7617, lon: -80.1918 },
  'nueva york': { lat: 40.7128, lon: -74.006 },
  'madrid': { lat: 40.4168, lon: -3.7038 },
  'barcelona': { lat: 41.3874, lon: 2.1686 },
  'roma': { lat: 41.9028, lon: 12.4964 },
  'paris': { lat: 48.8566, lon: 2.3522 },
  'parís': { lat: 48.8566, lon: 2.3522 },
  'londres': { lat: 51.5072, lon: -0.1276 }
};

function resolveCityCoords(city: string): { lat: number; lon: number } {
  const norm = city.trim().toLowerCase();
  if (CITY_COORDS[norm]) return CITY_COORDS[norm];
  const partial = Object.keys(CITY_COORDS).find((k) => norm.includes(k) || k.includes(norm));
  if (partial) return CITY_COORDS[partial];
  return CITY_COORDS['buenos aires'];
}

let leafletPromise: Promise<any> | null = null;

function ensureLeafletLoaded(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('youapp-leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'youapp-leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.id = 'youapp-leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve((window as any).L || null);
    script.onerror = () => reject(new Error('No se pudo cargar el mapa interactivo.'));
    document.head.appendChild(script);
  });

  return leafletPromise;
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
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  const cityClusters = useMemo(() => {
    const map = new Map<string, { city: string; lat: number; lon: number; people: LiveParticipant[] }>();
    for (const p of participants) {
      const label = p.city?.trim() || 'Buenos Aires';
      const key = label.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.people.push(p);
      } else {
        const coords = resolveCityCoords(label);
        map.set(key, { city: label, lat: coords.lat, lon: coords.lon, people: [p] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.people.length - a.people.length);
  }, [participants]);

  // Inicializa el mapa real Leaflet + CARTO Dark Matter (OpenStreetMap) solo cuando el modal está abierto
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setMapError(null);

    ensureLeafletLoaded()
      .then((L) => {
        if (cancelled || !L || !mapHostRef.current) return;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
        const map = L.map(mapHostRef.current, {
          center: [-34.6, -58.4],
          zoom: 4,
          minZoom: 2,
          maxZoom: 12,
          zoomControl: true,
          attributionControl: true
        });

        tileLayerRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18
        }).addTo(map);

        markersLayerRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 120);
      })
      .catch(() => {
        if (!cancelled) setMapError('No se pudo cargar el mapa interactivo. Revisá tu conexión.');
      });

    return () => {
      cancelled = true;
      setMapReady(false);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, [isOpen]);

  // Cambia entre estilo Mapa (parecido a Google Maps) y Satélite real sin recargar el modal
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!isOpen || !mapReady || !L || !map) return;
    if (tileLayerRef.current) {
      try {
        map.removeLayer(tileLayerRef.current);
      } catch {
        // ignore
      }
    }
    tileLayerRef.current =
      mapStyle === 'satellite'
        ? L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: '&copy; Esri World Imagery', maxZoom: 18 }
          ).addTo(map)
        : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
          }).addTo(map);
  }, [isOpen, mapReady, mapStyle]);

  // Actualiza los marcadores reales en vivo cuando cambian las ciudades sintonizando
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!isOpen || !mapReady || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds: Array<[number, number]> = [];

    for (const cl of cityClusters) {
      bounds.push([cl.lat, cl.lon]);
      const icon = L.divIcon({
        className: 'slm-live-marker-wrap',
        html: `<div class="slm-live-pin"><span class="slm-live-pin-dot"></span><span class="slm-live-pin-lbl">${cl.city} (${cl.people.length})</span></div>`,
        iconSize: [130, 28],
        iconAnchor: [14, 14]
      });
      const marker = L.marker([cl.lat, cl.lon], { icon }).addTo(layer);
      marker.on('click', () => {
        setSelectedCity(cl.city);
      });
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 6, { animate: true });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 6 });
    }
  }, [isOpen, mapReady, cityClusters]);

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
              <h3>Mapa en vivo · {signalName}</h3>
              <span>
                {participants.length > 0
                  ? `${participants.length} ${participants.length === 1 ? 'persona visible' : 'personas visibles'} en ${cityClusters.length} ${cityClusters.length === 1 ? 'ciudad' : 'ciudades'}`
                  : 'Activá «Estoy aquí» para aparecer en tu ciudad aproximada'}
              </span>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div className="slm-style-toggle" role="group" aria-label="Tipo de mapa">
              <button
                type="button"
                className={mapStyle === 'street' ? 'active' : ''}
                onClick={() => setMapStyle('street')}
              >
                Mapa
              </button>
              <button
                type="button"
                className={mapStyle === 'satellite' ? 'active' : ''}
                onClick={() => setMapStyle('satellite')}
              >
                Satélite
              </button>
            </div>
            <button type="button" className="slm-close" onClick={onClose} aria-label="Cerrar mapa">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* MAPA REAL INTERACTIVO (OpenStreetMap / CARTO Dark Matter · zoom y arrastre real) */}
        <div className="slm-map-wrap">
          {mapError ? (
            <div className="slm-map-loading">{mapError}</div>
          ) : (
            <div ref={mapHostRef} className="slm-leaflet-host" />
          )}
        </div>

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
            <span>Elegí tu ciudad aproximada abajo para encender el primer punto real en el mapa:</span>
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
          Privacidad: mapa geográfico real (OpenStreetMap / CARTO) que solo muestra ciudades aproximadas elegidas manualmente. Nunca GPS ni domicilio.
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
          max-width: 660px;
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
        .slm-style-toggle {
          display: inline-flex;
          padding: 2px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .slm-style-toggle button {
          padding: 4px 9px;
          border-radius: 999px;
          border: 0;
          background: transparent;
          color: rgba(245, 245, 247, 0.78);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .slm-style-toggle button.active {
          background: #0071e3;
          color: #ffffff;
        }
        .slm-map-wrap {
          width: 100%;
          height: 320px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(100, 210, 255, 0.24);
          background: #aad3df;
        }
        .slm-leaflet-host {
          width: 100%;
          height: 100%;
          z-index: 1;
          background: #aad3df;
        }
        .slm-map-loading {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: rgba(245, 245, 247, 0.72);
          padding: 16px;
          text-align: center;
        }
        .slm-live-marker-wrap {
          background: transparent;
          border: none;
        }
        .slm-live-pin {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #ffffff;
          border: 2px solid #ea4335;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
          white-space: nowrap;
        }
        .slm-live-pin-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #ea4335;
          flex-shrink: 0;
        }
        .slm-live-pin-lbl {
          color: #1f2937;
          font-size: 11px;
          font-weight: 800;
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
