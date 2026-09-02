import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { createValueTracker } from '../lib/search/learnOnValue';
import { X, ThumbsUp, ThumbsDown } from 'lucide-react';
import ReactPlayer from 'react-player';

const Player: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const videoId = searchParams.get('id');
  const attributionId = searchParams.get('aid') || undefined;

  const [tracker, setTracker] = useState<ReturnType<typeof createValueTracker> | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const durationRef = useRef(0);

  useEffect(() => {
    if (videoId) {
      // Start tracker
      const newTracker = createValueTracker(videoId, 0, { attributionId });
      setTracker(newTracker);
    }
  }, [videoId, attributionId]);

  if (!videoId) {
    return <div style={{ color: 'white', padding: '2rem' }}>Error: Video no especificado</div>;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const handleProgress = (state: { playedSeconds: number }) => {
    if (tracker) {
      tracker.onProgress(state.playedSeconds * 1000);
    }
  };

  const handleDuration = (duration: number) => {
    durationRef.current = duration;
    if (tracker) {
      // Recreate tracker with duration (ReactPlayer gives duration once metadata loads)
      setTracker(createValueTracker(videoId, duration * 1000, { attributionId }));
    }
  };

  const handlePlay = () => {
    if (tracker) tracker.onPlay();
  };

  const handleEnded = () => {
    if (tracker) tracker.onEnded();
    setShowFeedback(true);
  };

  const handleFeedback = (response: 'yes' | 'no') => {
    if (tracker) tracker.onValued(response);
    setFeedbackGiven(true);
    setTimeout(() => setShowFeedback(false), 2000);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'black', zIndex: 9999 }}>
      
      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1rem', display: 'flex', justifyContent: 'space-between', zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer' }}>
          <X size={24} />
        </button>
      </div>

      {/* Video Player */}
      <div style={{ width: '100%', height: '100%' }}>
        {React.createElement(ReactPlayer as any, {
          url: videoUrl,
          width: '100%',
          height: '100%',
          playing: true,
          controls: true,
          onPlay: handlePlay,
          onProgress: handleProgress,
          onDuration: handleDuration,
          onEnded: handleEnded
        })}
      </div>

      {/* Feedback Overlay when ended */}
      {showFeedback && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: 'white', zIndex: 20
        }}>
          {feedbackGiven ? (
            <h3>¡Gracias por tu respuesta!</h3>
          ) : (
            <>
              <h3 style={{ marginBottom: '1.5rem' }}>¿Valió tu tiempo?</h3>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  onClick={() => handleFeedback('yes')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#4CAF50', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  <ThumbsUp /> Sí
                </button>
                <button 
                  onClick={() => handleFeedback('no')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#F44336', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  <ThumbsDown /> No
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Player;
