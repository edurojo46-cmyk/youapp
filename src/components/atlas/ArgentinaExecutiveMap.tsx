import React, { useState } from 'react';
import { MapPin, CheckCircle2 } from 'lucide-react';

export interface ProvinceMapItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
  path: string;
  center: [number, number];
}

interface ArgentinaExecutiveMapProps {
  provinces: { value: string; count: number; percentage: number }[];
  selectedProvince?: string;
  onSelectProvince: (province: string) => void;
}

// Canonical Geographic Polygons/Paths for Argentina's 24 Jurisdictions (viewBox 0 0 380 720)
const PROVINCE_PATHS: { id: string; name: string; path: string; center: [number, number] }[] = [
  {
    id: 'jujuy',
    name: 'Jujuy',
    center: [145, 68],
    path: 'M 130,42 L 160,40 L 168,75 L 152,90 L 138,85 L 126,62 Z'
  },
  {
    id: 'salta',
    name: 'Salta',
    center: [168, 102],
    path: 'M 126,62 L 138,85 L 152,90 L 168,75 L 188,80 L 222,86 L 220,118 L 185,122 L 175,142 L 152,142 L 140,115 L 122,118 L 115,88 Z'
  },
  {
    id: 'formosa',
    name: 'Formosa',
    center: [238, 106],
    path: 'M 222,86 L 268,102 L 274,124 L 246,128 L 220,118 Z'
  },
  {
    id: 'chaco',
    name: 'Chaco',
    center: [230, 148],
    path: 'M 220,118 L 246,128 L 274,124 L 268,168 L 232,175 L 198,154 L 202,126 Z'
  },
  {
    id: 'misiones',
    name: 'Misiones',
    center: [308, 142],
    path: 'M 292,126 L 322,118 L 332,148 L 306,168 L 288,154 Z'
  },
  {
    id: 'corrientes',
    name: 'Corrientes',
    center: [272, 185],
    path: 'M 268,168 L 288,154 L 306,168 L 298,212 L 254,215 L 248,188 Z'
  },
  {
    id: 'tucuman',
    name: 'Tucumán',
    center: [156, 154],
    path: 'M 148,142 L 168,142 L 168,168 L 148,168 Z'
  },
  {
    id: 'catamarca',
    name: 'Catamarca',
    center: [136, 172],
    path: 'M 122,118 L 140,115 L 148,142 L 148,168 L 162,185 L 145,212 L 118,202 L 112,154 Z'
  },
  {
    id: 'santiago',
    name: 'Santiago del Estero',
    center: [195, 185],
    path: 'M 175,142 L 198,154 L 232,175 L 222,228 L 180,225 L 168,168 L 175,142 Z'
  },
  {
    id: 'santa_fe',
    name: 'Santa Fe',
    center: [238, 238],
    path: 'M 232,175 L 248,188 L 254,215 L 248,278 L 228,295 L 218,255 L 222,228 Z'
  },
  {
    id: 'la_rioja',
    name: 'La Rioja',
    center: [128, 222],
    path: 'M 118,202 L 145,212 L 158,245 L 138,262 L 105,248 L 108,218 Z'
  },
  {
    id: 'san_juan',
    name: 'San Juan',
    center: [102, 275],
    path: 'M 105,248 L 138,262 L 132,302 L 92,308 L 88,265 Z'
  },
  {
    id: 'cordoba',
    name: 'Córdoba',
    center: [186, 268],
    path: 'M 168,225 L 218,230 L 218,285 L 210,318 L 165,315 L 152,268 L 162,245 Z'
  },
  {
    id: 'entre_rios',
    name: 'Entre Ríos',
    center: [265, 262],
    path: 'M 254,215 L 285,225 L 278,288 L 248,278 Z'
  },
  {
    id: 'san_luis',
    name: 'San Luis',
    center: [142, 312],
    path: 'M 138,262 L 152,268 L 165,315 L 158,355 L 128,348 L 132,302 Z'
  },
  {
    id: 'mendoza',
    name: 'Mendoza',
    center: [98, 345],
    path: 'M 92,308 L 132,302 L 128,348 L 135,392 L 88,388 L 82,342 Z'
  },
  {
    id: 'la_pampa',
    name: 'La Pampa',
    center: [168, 385],
    path: 'M 135,355 L 165,355 L 208,358 L 205,418 L 135,418 Z'
  },
  {
    id: 'buenos_aires',
    name: 'Buenos Aires',
    center: [238, 348],
    path: 'M 218,285 L 248,278 L 275,302 L 285,342 L 272,398 L 225,418 L 205,418 L 208,358 L 210,318 Z'
  },
  {
    id: 'caba',
    name: 'CABA',
    center: [276, 316],
    path: 'M 271,311 L 281,311 L 281,321 L 271,321 Z'
  },
  {
    id: 'rio_negro',
    name: 'Río Negro',
    center: [152, 458],
    path: 'M 92,422 L 135,418 L 205,418 L 212,468 L 148,472 L 82,470 L 88,432 Z'
  },
  {
    id: 'neuquen',
    name: 'Neuquén',
    center: [96, 438],
    path: 'M 88,388 L 135,392 L 135,418 L 92,422 L 78,442 Z'
  },
  {
    id: 'chubut',
    name: 'Chubut',
    center: [136, 520],
    path: 'M 82,470 L 148,472 L 202,482 L 188,552 L 138,558 L 74,550 Z'
  },
  {
    id: 'santa_cruz',
    name: 'Santa Cruz',
    center: [124, 605],
    path: 'M 74,550 L 138,558 L 188,552 L 175,645 L 118,655 L 72,642 Z'
  },
  {
    id: 'tierra_del_fuego',
    name: 'Tierra del Fuego',
    center: [168, 688],
    path: 'M 152,674 L 185,670 L 182,702 L 155,705 Z'
  }
];

export const ArgentinaExecutiveMap: React.FC<ArgentinaExecutiveMapProps> = ({
  provinces,
  selectedProvince,
  onSelectProvince
}) => {
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);

  // Index counts by normalized name
  const countMap = new Map<string, { count: number; percentage: number }>();
  provinces.forEach(p => {
    countMap.set(p.value.toLowerCase(), { count: p.count, percentage: p.percentage });
    // Match variations
    if (p.value === 'CABA') countMap.set('caba', { count: p.count, percentage: p.percentage });
    if (p.value === 'Córdoba') countMap.set('cordoba', { count: p.count, percentage: p.percentage });
    if (p.value === 'Tucumán') countMap.set('tucuman', { count: p.count, percentage: p.percentage });
    if (p.value === 'Entre Ríos') countMap.set('entre rios', { count: p.count, percentage: p.percentage });
    if (p.value === 'Río Negro') countMap.set('rio negro', { count: p.count, percentage: p.percentage });
    if (p.value === 'Neuquén') countMap.set('neuquen', { count: p.count, percentage: p.percentage });
  });

  // Color generator based on physical certified density
  const getProvinceColor = (count: number, isSelected: boolean, isHovered: boolean) => {
    if (isSelected) return '#38bdf8'; // Active cyan highlight
    if (isHovered) return '#67e8f9';
    if (count >= 200000) return '#0284c7'; // Tier 1: CABA
    if (count >= 100000) return '#0369a1'; // Tier 2: Santa Fe, BA, Córdoba
    if (count >= 40000)  return '#075985'; // Tier 3: Mendoza, Tucumán, Salta, Entre Ríos
    if (count >= 10000)  return '#0c4a6e'; // Tier 4: Patagonia / Norte
    if (count > 0)       return '#164e63'; // Tier 5: Certified observations
    return '#0f172a'; // 0 observations in SSOT
  };

  const hoveredData = hoveredProvince 
    ? countMap.get(hoveredProvince.toLowerCase())
    : null;

  return (
    <div style={{
      background: 'linear-gradient(180deg, #090e1a 0%, #060911 100%)',
      border: '1px solid #1e293b',
      borderRadius: '14px',
      padding: '1.25rem',
      position: 'relative',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            margin: 0,
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}>
            <MapPin size={16} color="#38bdf8" />
            MAPA DE INTELIGENCIA GEOGRÁFICA
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
            Distribución física en las 24 jurisdicciones · Click en cualquier provincia para filtrar
          </p>
        </div>
        {selectedProvince && (
          <button
            onClick={() => onSelectProvince('')}
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              padding: '0.25rem 0.6rem',
              color: '#38bdf8',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Filtro: {selectedProvince} ×
          </button>
        )}
      </div>

      {/* SVG Map Container */}
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: '440px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 60% 45%, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        overflow: 'hidden'
      }}>
        <svg
          viewBox="0 0 380 720"
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '480px',
            filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.6))'
          }}
        >
          {/* Subtle Lat/Long Gridlines */}
          <line x1="50" y1="200" x2="350" y2="200" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <line x1="50" y1="360" x2="350" y2="360" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <line x1="50" y1="520" x2="350" y2="520" stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />

          {/* Provinces */}
          {PROVINCE_PATHS.map(p => {
            const data = countMap.get(p.name.toLowerCase());
            const count = data?.count || 0;
            const isSelected = selectedProvince?.toLowerCase() === p.name.toLowerCase();
            const isHovered = hoveredProvince === p.name;
            const fillColor = getProvinceColor(count, isSelected, isHovered);

            return (
              <g
                key={p.id}
                id={`map-prov-${p.id}`}
                onClick={() => onSelectProvince(p.name)}
                onMouseEnter={() => setHoveredProvince(p.name)}
                onMouseLeave={() => setHoveredProvince(null)}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              >
                <path
                  d={p.path}
                  fill={fillColor}
                  stroke={isSelected ? '#38bdf8' : isHovered ? '#67e8f9' : '#1e293b'}
                  strokeWidth={isSelected ? '2.5' : isHovered ? '2' : '1'}
                  strokeLinejoin="round"
                  style={{
                    transition: 'fill 0.2s ease, stroke 0.2s ease',
                    filter: isSelected ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.8))' : 'none'
                  }}
                />

                {/* Marker & Label for Top Certified Centers */}
                {count > 30000 && (
                  <circle
                    cx={p.center[0]}
                    cy={p.center[1]}
                    r={isSelected ? 5 : count > 100000 ? 4 : 3}
                    fill={isSelected ? '#38bdf8' : '#34d399'}
                    stroke="#020617"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}

          {/* CABA Highlight Pin (Callout) */}
          <g style={{ cursor: 'pointer' }} onClick={() => onSelectProvince('CABA')}>
            <line x1="281" y1="316" x2="320" y2="295" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" />
            <rect x="315" y="282" width="55" height="22" rx="4" fill="rgba(15, 23, 42, 0.9)" stroke="#38bdf8" strokeWidth="1" />
            <text x="342" y="296" textAnchor="middle" fill="#38bdf8" fontSize="9" fontWeight="800" fontFamily="sans-serif">
              CABA
            </text>
          </g>
        </svg>

        {/* Floating Tooltip */}
        {hoveredProvince && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
            pointerEvents: 'none',
            zIndex: 10
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.2rem' }}>
              {hoveredProvince}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 700 }}>
              {hoveredData ? `${hoveredData.count.toLocaleString('es-AR')} emails certificados` : '0 emails certificados'}
            </div>
            {hoveredData && (
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                {hoveredData.percentage}% del universo certificado
              </div>
            )}
            <div style={{ fontSize: '0.62rem', color: '#10b981', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <CheckCircle2 size={10} color="#10b981" /> EVIDENCIA FÍSICA SSOT
            </div>
          </div>
        )}
      </div>

      {/* Legend & Tiers */}
      <div style={{
        marginTop: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.68rem',
        color: '#94a3b8',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        paddingTop: '0.5rem'
      }}>
        <span>Densidad Certificada:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0284c7' }} /> &gt; 200k
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0369a1' }} /> 100k - 200k
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#075985' }} /> 30k - 100k
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0c4a6e' }} /> &lt; 30k
          </span>
        </div>
      </div>
    </div>
  );
};

export default ArgentinaExecutiveMap;
