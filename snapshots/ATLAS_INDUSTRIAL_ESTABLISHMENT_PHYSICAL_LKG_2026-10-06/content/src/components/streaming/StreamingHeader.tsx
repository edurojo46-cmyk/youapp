import React from 'react';
import { LayoutGrid, Bell } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';

export const StreamingHeader: React.FC = () => {
  const { setIsPlatformsModalOpen, userPlatforms } = useStreamingStore();

  return (
    <header className="mp-top-bar">
      <button
        className="mp-platforms-btn"
        onClick={() => setIsPlatformsModalOpen(true)}
      >
        <LayoutGrid size={15} color="#007aff" />
        <span>Mis plataformas ({userPlatforms.length})</span>
      </button>
      <button className="mp-notification-btn" title="Notificaciones">
        <Bell size={17} />
        <span className="mp-notification-dot"></span>
      </button>
    </header>
  );
};
