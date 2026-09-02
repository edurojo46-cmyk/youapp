import React, { useRef, useState } from 'react';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';
import { SignalBlockCard } from './SignalBlockCard';
import { Radio, ChevronLeft, ChevronRight, Plus, Compass, Sliders } from 'lucide-react';

interface SignalTimelineProps {
  schedule: ScheduleBlock[];
  currentIndex: number;
  onReorder: (dragIndex: number, dropIndex: number) => void;
  onAddClick?: () => void;
  onMapClick?: () => void;
  onRigorClick?: () => void;
  entityName?: string;
  onBlockContextClick?: (block: ScheduleBlock) => void;
}

export function SignalTimeline({
  schedule,
  currentIndex,
  onReorder,
  onAddClick,
  onMapClick,
  onRigorClick,
  entityName = 'Tema',
  onBlockContextClick
}: SignalTimelineProps) {
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
        <div className="tl-title-group">
          <div className="tl-title">
            MI SEÑAL <Radio size={16} />
          </div>

          <div className="tl-epistemic-controls">
            {onMapClick && (
              <button 
                className="tl-epistemic-btn map-btn"
                onClick={onMapClick}
                title="Ver equilibrio y distribución epistemológica de la señal"
              >
                <Compass size={13} className="text-cyan-400" />
                <span>Ver mapa de conocimiento</span>
              </button>
            )}
            {onRigorClick && (
              <button 
                className="tl-epistemic-btn rigor-btn"
                onClick={onRigorClick}
                title="Ajustar perfil de rigor de la señal"
              >
                <Sliders size={13} className="text-slate-400" />
                <span>Ajustar rigor</span>
              </button>
            )}
          </div>
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
              <div key={b.id || idx} className="tl-point-wrapper" style={{ left: `${leftPercent}%` }}>
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
              key={block.id || index}
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
                entityName={entityName}
                onContextClick={() => onBlockContextClick?.(block)}
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
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .tl-title-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .tl-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--you-blue-vivid);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tl-epistemic-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tl-epistemic-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--you-border);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          color: var(--you-text);
          cursor: pointer;
          transition: 0.15s;
        }

        .tl-epistemic-btn:hover {
          background: var(--you-bg);
          transform: translateY(-1px);
        }

        .tl-epistemic-btn.map-btn {
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }

        .tl-line-container {
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
