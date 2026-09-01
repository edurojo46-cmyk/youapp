import React from 'react';
import { useUIStore } from '../../store/useUIStore';
import { AiSummaryModal } from '../smartbar/AiSummaryModal';
import { AskModal } from '../smartbar/AskModal';

export const ModalHost: React.FC = () => {
  const { activeModal, closeModal, modalContext } = useUIStore();

  if (!activeModal) return null;

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease forwards'
        }}
        onClick={closeModal}
      />
      
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        pointerEvents: 'none', // Allow clicks to pass through to backdrop unless on the modal itself
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '24px'
      }}>
        <div style={{ pointerEvents: 'auto', maxWidth: '100%', maxHeight: '100%' }}>
          {activeModal === 'summary' && <AiSummaryModal context={modalContext} onClose={closeModal} />}
          {activeModal === 'ask' && <AskModal context={modalContext} onClose={closeModal} />}
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
};
