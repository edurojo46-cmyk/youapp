import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SmartBar } from '../smartbar/SmartBar';
import { TvUserSessionMenu } from './TvUserSessionMenu';
import { SignalAssociatedRepeatersRail } from './SignalAssociatedRepeatersRail';
import { SignalNetworkHeaderStrip } from './SignalNetworkHeaderStrip';
import { YouAppOfficialLogo } from '../ui/YouAppOfficialLogo';

interface ProgramarTVLayoutProps {
  stage: React.ReactNode;
  intelligence: React.ReactNode;
  timeline: React.ReactNode;
  actions: React.ReactNode;
  status: React.ReactNode;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  isMosaic?: boolean;
  onToggleMosaic?: () => void;
  signalName?: string;
}

export function ProgramarTVLayout({
  stage,
  intelligence,
  timeline,
  actions,
  status,
  isPlaying,
  onPlayPause,
  isMosaic,
  onToggleMosaic,
  signalName = 'Mi Señal Personal'
}: ProgramarTVLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="you-tv-layout fade-in">
      {/* TOP NAV */}
      <nav style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '16px 32px',
        background: 'var(--you-bg)',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <YouAppOfficialLogo theme="light" />
          <div style={{ width: '1px', height: '24px', background: 'var(--you-border)' }}></div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--you-text)' }}>
            Mi Señal <span style={{ color: 'var(--you-blue-vivid)', margin: '0 8px' }}>•</span> <span style={{ color: 'var(--you-text-secondary)', fontWeight: 400 }}>{signalName}</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Inicio</button>
          <button onClick={() => navigate('/mitv')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 600, color: 'var(--you-blue-vivid)', borderBottom: '2px solid var(--you-blue-vivid)', paddingBottom: '4px', cursor: 'pointer' }}>MiTV</button>
          <button onClick={() => navigate('/misenal1')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Mi Señal 1</button>
          <button onClick={() => navigate('/create-signal')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Crear Señal IA</button>
          <button onClick={() => navigate('/search')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Buscar Canales</button>
          <button onClick={() => navigate('/live')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>En Vivo</button>
          <button onClick={() => navigate('/you4')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>You4 (4 Canales)</button>
          <button onClick={() => navigate('/repetidoras')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Repetidoras</button>
          <button onClick={() => navigate('/redes')} style={{ background: 'none', border: 'none', fontSize: '13.5px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Mis Redes</button>
          
          <div style={{ marginLeft: '4px' }}>
            <TvUserSessionMenu />
          </div>
        </div>
      </nav>

      {/* FRANJA SUPERIOR: MI SEÑAL Y RED DE REPETIDORAS */}
      <SignalNetworkHeaderStrip signalName={signalName} />

      {/* MAIN CONTENT GRID */}
      <div className="you-tv-main">
        {/* LEFT COLUMN: Player & SmartBar */}
        <div className="player-smartbar-stack" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div className="you-tv-stage">
            {stage}
          </div>
          <div style={{ position: 'sticky', bottom: '16px', zIndex: 10 }}>
            <SmartBar
              isPlaying={isPlaying}
              onPlayPause={onPlayPause}
              isMosaic={isMosaic}
              onToggleMosaic={onToggleMosaic}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Intelligence Rail */}
        <div className="you-tv-rail">
          {intelligence}
        </div>
      </div>

      {/* BOTTOM SECTION */}
      <div style={{ padding: '0 40px 24px 40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {timeline}
        {actions}
        <SignalAssociatedRepeatersRail />
      </div>

      {/* STATUS BAR */}
      {status}
    </div>
  );
}
