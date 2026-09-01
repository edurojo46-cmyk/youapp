import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { SmartBar } from '../smartbar/SmartBar';

interface ProgramarTVLayoutProps {
  stage: React.ReactNode;
  intelligence: React.ReactNode;
  timeline: React.ReactNode;
  actions: React.ReactNode;
  status: React.ReactNode;
  isPlaying?: boolean;
  onPlayPause?: () => void;
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
        padding: '20px 40px',
        background: 'var(--you-bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '0.5px', color: 'var(--you-blue-vivid)' }}>
            YOUAPP <span style={{ fontWeight: 400 }}>TV</span>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--you-border)' }}></div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--you-text)' }}>
            Mi Señal <span style={{ color: 'var(--you-blue-vivid)', margin: '0 8px' }}>•</span> <span style={{ color: 'var(--you-text-secondary)', fontWeight: 400 }}>{signalName}</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Inicio</button>
          <button style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: 600, color: 'var(--you-blue-vivid)', borderBottom: '2px solid var(--you-blue-vivid)', paddingBottom: '4px', cursor: 'pointer' }}>Mi Señal</button>
          <button style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: 500, color: 'var(--you-text-secondary)', cursor: 'pointer' }}>Programación</button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
            <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--you-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT GRID */}
      <div className="you-tv-main">
        {/* LEFT COLUMN: Player & SmartBar */}
        <div className="player-smartbar-stack" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div className="you-tv-stage">
            {stage}
          </div>
          <div style={{ position: 'sticky', bottom: '16px', zIndex: 10 }}>
            <SmartBar isPlaying={isPlaying} onPlayPause={onPlayPause} />
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
      </div>

      {/* STATUS BAR */}
      {status}
    </div>
  );
}
