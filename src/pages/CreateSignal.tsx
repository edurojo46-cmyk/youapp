import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mic, Play } from 'lucide-react';
import { generateSchedule } from '../lib/tv/scheduleGenerator';
import { saveDraftSignal, clearDraftSignals } from '../lib/tv/draftStore';
import { persistSignal } from '../lib/tv/signalPersistence';
import { useSignalStore } from '../lib/tv/signalStore';

export default function CreateSignal() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);

  const SUGGESTIONS = [
    'Historia', 'Ciencia', 'Noticias', 'Música', 'Deportes', 'Tecnología', 'Sorpréndeme ✨'
  ];

  const handleCreateSignal = async () => {
    if (!prompt.trim()) return;
    
    // Clear old state before starting
    clearDraftSignals();
    
    setIsGenerating(true);
    setGenerationStep(0);
    
    // Simulate generation steps for UX
    const stepInterval = setInterval(() => {
      setGenerationStep(prev => prev + 1);
    }, 1500);

    try {
      // Generate the schedule using the real brain
      const signal = await generateSchedule(prompt);
      
      clearInterval(stepInterval);
      setGenerationStep(3); // "Tu señal está lista"
      
      // Save it temporarily for immediate playback
      saveDraftSignal(signal);
      useSignalStore.getState().setPersistStatus('saving');
      
      // Play First, Persist Second (async, don't block navigation)
      persistSignal(signal).then((success) => {
        useSignalStore.getState().setPersistStatus(success ? 'saved' : 'failed');
      }).catch((e) => {
        console.error(e);
        useSignalStore.getState().setPersistStatus('failed');
      });
      
      // Navigate to live zapping after a brief pause
      setTimeout(() => {
        navigate(`/live?signal=${signal.id}`);
      }, 1000);
      
    } catch (err) {
      clearInterval(stepInterval);
      setIsGenerating(false);
      alert("Hubo un error armando tu TV. Intentalo de nuevo.");
      console.error(err);
    }
  };

  const getStepText = (step: number) => {
    switch (step) {
      case 0: return 'Entendiendo lo que querés...';
      case 1: return 'Buscando lo mejor...';
      case 2: return 'Armando tu programación...';
      default: return 'Tu señal está lista';
    }
  };

  return (
    <div style={{ 
      background: '#0f172a', 
      minHeight: '100vh', 
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      
      {!isGenerating ? (
        <div style={{ maxWidth: 600, width: '100%', textAlign: 'center' }} className="fade-in">
          <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 }}>
            YOUAPP TV
          </div>
          
          <h1 style={{ fontSize: 42, fontWeight: 800, margin: '0 0 40px', letterSpacing: '-0.02em' }}>
            HACEME UNA TV
          </h1>

          <div style={{ marginBottom: 24, fontSize: 18, color: '#cbd5e1' }}>
            ¿Qué querés ver?
          </div>

          <div style={{ position: 'relative', marginBottom: 24 }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Documentales sobre Roma, arqueología y noticias de hoy..."
              style={{
                width: '100%',
                background: '#1e293b',
                border: '2px solid #334155',
                borderRadius: 16,
                padding: '20px',
                fontSize: 18,
                color: 'white',
                minHeight: 120,
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
              }}
              autoFocus
            />
            <button style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              background: '#334155',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer'
            }}>
              <Mic size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 48 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setPrompt(prev => prev ? `${prev}, ${s.replace(' ✨','')}` : s.replace(' ✨',''))}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  borderRadius: 20,
                  padding: '8px 16px',
                  color: '#cbd5e1',
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={e => e.currentTarget.style.background = '#1e293b'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={handleCreateSignal}
            disabled={!prompt.trim()}
            style={{
              background: prompt.trim() ? 'linear-gradient(90deg, #2563eb, #7c3aed)' : '#334155',
              color: 'white',
              border: 'none',
              borderRadius: 30,
              padding: '16px 48px',
              fontSize: 18,
              fontWeight: 600,
              cursor: prompt.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '0 auto',
              transition: 'all 0.3s ease',
              boxShadow: prompt.trim() ? '0 10px 20px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            CREAR MI SEÑAL
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', maxWidth: 400 }} className="fade-in">
          <div style={{ marginBottom: 40, position: 'relative' }}>
            <Sparkles size={64} color="#7c3aed" style={{ animation: 'pulse 2s infinite', margin: '0 auto' }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
            {getStepText(generationStep)}
          </h2>
          <div style={{ background: '#1e293b', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ 
              background: 'linear-gradient(90deg, #2563eb, #7c3aed)', 
              height: '100%', 
              width: `${Math.min(100, (generationStep / 3) * 100)}%`,
              transition: 'width 1s ease-in-out'
            }} />
          </div>
        </div>
      )}
      
      <style>{`
        .fade-in { animation: fadeIn 0.5s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
