import React, { useEffect, useState } from 'react';
import { Sparkles, X, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ScheduleBlock } from '../../lib/tv/signalTypes';

export const AiSummaryModal: React.FC<{ context: ScheduleBlock, onClose: () => void }> = ({ context, onClose }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'fallback'>('loading');

  useEffect(() => {
    let isMounted = true;
    
    const fetchSummary = async () => {
      try {
        const contentKey = `${context.contentItem.provider}:${context.contentItem.providerId || context.contentItem.id}`;
        
        // 1. Try to fetch from video_moments summary or youapp_index
        const { data } = await supabase
          .from('youapp_index')
          .select('video_summary, description')
          .eq('provider_content_id', context.contentItem.providerId || context.contentItem.id)
          .eq('provider', context.contentItem.provider)
          .maybeSingle();

        if (!isMounted) return;

        if (data?.video_summary) {
          setSummary(data.video_summary);
          setStatus('success');
        } else if (data?.description || context.contentItem.description) {
          setSummary(data?.description || context.contentItem.description || '');
          setStatus('fallback');
        } else {
          setSummary('Resumen IA todavía no disponible para este contenido.');
          setStatus('fallback');
        }
      } catch (err) {
        if (isMounted) {
          setSummary(context.contentItem.description || 'Resumen IA todavía no disponible.');
          setStatus('fallback');
        }
      }
    };

    fetchSummary();
    return () => { isMounted = false; };
  }, [context]);

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(24px)',
      borderRadius: '24px',
      padding: '24px',
      width: '400px',
      maxWidth: '90vw',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(0,0,0,0.05)',
      animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a1a1a', fontWeight: 600 }}>
          <Sparkles size={20} color="var(--you-blue-vivid)" />
          <span>Resumen</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ minHeight: '100px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {status === 'loading' ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#666' }}>
            <Sparkles size={16} className="pulse-anim" color="var(--you-blue-vivid)" />
            <span>Analizando contenido...</span>
          </div>
        ) : (
          <div style={{ color: '#333', fontSize: '15px', lineHeight: '1.6' }}>
            {summary}
          </div>
        )}

        <div style={{ height: '1px', background: 'rgba(0,0,0,0.05)' }} />

        {status === 'success' && (
          <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={12} /> Generado por YouApp IA
          </div>
        )}
        {status === 'fallback' && (
          <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={12} /> Descripción original del creador
          </div>
        )}
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
