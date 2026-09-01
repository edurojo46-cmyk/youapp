import React from 'react';
import { Check } from 'lucide-react';
import { useStreamingStore } from '../../store/useStreamingStore';

export const PlatformFilterPills: React.FC = () => {
  const {
    activePlatformFilter,
    setActivePlatformFilter,
    setIsPlatformsModalOpen
  } = useStreamingStore();

  const PILLS = [
    { code: 'my_platforms', label: 'Mis plataformas', isMyPlatforms: true },
    { code: 'all', label: 'Todas' },
    { code: 'netflix', label: 'Netflix' },
    { code: 'prime_video', label: 'Prime Video' },
    { code: 'disney_plus', label: 'Disney+' },
    { code: 'max', label: 'Max' },
    { code: 'apple_tv_plus', label: 'Apple TV+' },
    { code: 'paramount_plus', label: 'Paramount+' }
  ];

  return (
    <div className="mp-platform-pills">
      {PILLS.map((pill) => {
        const isActive = activePlatformFilter === pill.code;
        return (
          <button
            key={pill.code}
            className={`mp-pill ${isActive ? 'active' : ''}`}
            onClick={() => setActivePlatformFilter(pill.code)}
          >
            {pill.isMyPlatforms && (
              <Check size={13} style={{ marginRight: '5px', verticalAlign: '-1px' }} />
            )}
            <span>{pill.label}</span>
          </button>
        );
      })}

      <button
        className="mp-pill"
        onClick={() => setIsPlatformsModalOpen(true)}
      >
        Más ▾
      </button>
    </div>
  );
};
