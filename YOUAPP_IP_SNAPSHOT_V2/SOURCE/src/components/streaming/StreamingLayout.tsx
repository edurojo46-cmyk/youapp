import React, { useEffect } from 'react';
import { StreamingSidebar } from './StreamingSidebar';
import { StreamingHeader } from './StreamingHeader';
import { ExperiencePanel } from './ExperiencePanel';
import { MyPlatformsModal } from './MyPlatformsModal';
import { AvailabilityModal } from './AvailabilityModal';
import { useStreamingStore } from '../../store/useStreamingStore';
import '../../pages/MiPlataforma.css';

interface StreamingLayoutProps {
  children: React.ReactNode;
  showRightPanel?: boolean;
}

export const StreamingLayout: React.FC<StreamingLayoutProps> = ({ children, showRightPanel = true }) => {
  const { syncWithSupabase } = useStreamingStore();

  useEffect(() => {
    syncWithSupabase();
  }, [syncWithSupabase]);

  return (
    <div className="mi-plataforma-layout">
      {/* Left Sidebar */}
      <StreamingSidebar />

      {/* Center Main Area */}
      <main className="mp-main-content">
        <StreamingHeader />
        {children}
      </main>

      {/* Right Sidebar */}
      {showRightPanel && <ExperiencePanel />}

      {/* Global Modals */}
      <MyPlatformsModal />
      <AvailabilityModal />
    </div>
  );
};
