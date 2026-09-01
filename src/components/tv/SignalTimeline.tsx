import React, { useRef } from 'react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
// Force Vite HMR
import { SignalBlockCard } from './SignalBlockCard';
import { Radio, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

interface SignalTimelineProps {
  schedule: ScheduleBlock[];
  currentIndex: number;
  onReorder: (dragIndex: number, dropIndex: number) => void;
  onAddClick?: () => void;
}

export function SignalTimeline({ schedule, currentIndex, onReorder, onAddClick }: SignalTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorder(draggedIndex, index);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const scrollLeft = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <div className="tl-container">
      {/* Top Header & Line */}
      <div className="tl-header">
        <div className="tl-title">
          MI SEÑAL <Radio size={16} />
        </div>
        <div className="tl-line-container">
          <div className="tl-line"></div>
          {schedule.map((b, idx) => {
            const isCurrent = idx === currentIndex;
            const leftPercent = schedule.length > 1 
              ? (idx / (schedule.length - 1)) * 80 + 10 
              : 50;

            const formatOffset = (sec: number) => {
              const startHour = 8;
              const totalMins = Math.floor(sec / 60);
              const h = (startHour + Math.floor(totalMins / 60)) % 24;
              const m = totalMins % 60;
              return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };

            return (
              <div key={b.id} className="tl-point-wrapper" style={{ left: `${leftPercent}%` }}>
                <div className={`tl-time ${isCurrent ? 'current' : ''}`}>
                  {formatOffset(b.startOffsetSec || 0)}
                </div>
                <div className={`tl-point ${isCurrent ? 'current' : ''}`}></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cards Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={scrollLeft} className="tl-scroll-btn">
          <ChevronLeft size={16} />
        </button>

        <div 
          className="tl-scroll-area"
          ref={containerRef}
        >
          {schedule.map((block, index) => (
            <div 
              key={block.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className="tl-card-wrapper"
              style={{
                opacity: draggedIndex === index ? 0.5 : 1,
                borderLeft: dragOverIndex === index ? '2px solid var(--you-blue-vivid)' : 'none'
              }}
            >
              <SignalBlockCard 
                block={block} 
                isCurrent={index === currentIndex}
                isPast={index < currentIndex}
              />
            </div>
          ))}
          
          <div className="tl-add-card" onClick={onAddClick} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
            <Plus size={20} color="var(--you-text-secondary)" />
            <span>Agregar<br/>contenido</span>
          </div>
        </div>

        <button onClick={scrollRight} className="tl-scroll-btn">
          <ChevronRight size={16} />
        </button>
      </div>

      <style>{`
        .tl-container {
          background: var(--you-surface);
          border-radius: var(--you-radius-lg);
          padding: 24px 32px;
          box-shadow: var(--you-shadow);
        }

        .tl-header {
          display: flex;
          align-items: center;
          margin-bottom: 32px;
          position: relative;
        }

        .tl-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--you-blue-vivid);
          display: flex;
          align-items: center;
          gap: 6px;
          width: 140px;
          flex-shrink: 0;
        }

        .tl-line-container {
          flex: 1;
          position: relative;
          height: 32px;
        }

        .tl-line {
          position: absolute;
          top: 16px;
          left: 0;
          right: 0;
          height: 1px;
          background: var(--you-border);
        }

        .tl-point-wrapper {
          position: absolute;
          top: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translateX(-50%);
        }

        .tl-time {
          font-size: 11px;
          color: var(--you-text-secondary);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .tl-time.current {
          background: var(--you-blue-vivid);
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          margin-bottom: 2px;
          margin-top: -2px;
        }

        .tl-point {
          width: 6px;
          height: 6px;
          background: var(--you-border);
          border-radius: 50%;
        }

        .tl-point.current {
          background: var(--you-blue-vivid);
        }

        .tl-scroll-area {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          scrollbar-width: none;
          flex: 1;
          padding-bottom: 4px;
        }
        
        .tl-scroll-area::-webkit-scrollbar {
          display: none;
        }

        .tl-card-wrapper {
          flex: 0 0 auto;
          cursor: grab;
        }

        .tl-card-wrapper:active {
          cursor: grabbing;
        }

        .tl-scroll-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--you-surface);
          border: 1px solid var(--you-border);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--you-text-secondary);
          transition: 0.2s;
          flex-shrink: 0;
        }

        .tl-scroll-btn:hover {
          background: var(--you-bg);
          color: var(--you-text);
        }

        .tl-add-card {
          width: 140px;
          flex: 0 0 auto;
          border: 1px dashed var(--you-border);
          border-radius: var(--you-radius-md);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: var(--you-text-secondary);
          font-size: 12px;
          font-weight: 500;
          text-align: center;
          cursor: pointer;
          background: transparent;
          transition: 0.2s;
        }

        .tl-add-card:hover {
          background: var(--you-bg);
          border-color: var(--you-text-tertiary);
        }
      `}</style>
    </div>
  );
}
