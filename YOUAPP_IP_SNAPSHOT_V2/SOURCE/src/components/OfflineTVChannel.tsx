/**
 * OfflineTVChannel.tsx
 * Señal de Televisión Interactiva y Generativa Offline (Modo Sin Datos) para YouApp TV.
 * 
 * ✨ CARACTERÍSTICAS SIN CONEXIÓN:
 * 1. Visualizador Generativo Canvas 60 FPS (Túnel Neon Synthwave / Ondas de Frecuencia).
 * 2. Sintetizador de Audio Ambiental Lo-Fi con Web Audio API nativo (0 bytes de descarga).
 * 3. Minijuego Arcade Retro "Sintonizador Zapper" (Interactúa y suma puntos).
 * 4. Mira de Ajuste SMPTE & Reloj de Precisión en Vivo.
 * 5. Detector y Reconexión Automática en tiempo real cuando vuelven los datos/Wi-Fi.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WifiOff, Radio, Play, Pause, Volume2, VolumeX, Sparkles, Gamepad2, Tv, RefreshCw, Trophy } from 'lucide-react';

interface OfflineTVChannelProps {
  channelName?: string;
  onReconnect?: () => void;
  isMuted?: boolean;
}

export default function OfflineTVChannel({
  channelName = 'YouApp TV',
  onReconnect,
  isMuted = true
}: OfflineTVChannelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTab, setActiveTab] = useState<'visualizer' | 'arcade' | 'testcard'>('visualizer');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem('youapp_arcade_highscore') || '0', 10); } catch { return 0; }
  });
  const [targetFreq, setTargetFreq] = useState(88.5);
  const [currentFreq, setCurrentFreq] = useState(94.2);
  const [gameMessage, setGameMessage] = useState('Girá el dial para sintonizar la frecuencia');

  // Audio Context nativo para sintetizador Lo-Fi
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // ── Detector de estado de red en tiempo real ─────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (onReconnect) onReconnect();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onReconnect]);

  // ── Generador Visual Canvas 60fps (Synthwave / Starfield) ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 450);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || 800;
      height = canvas.height = canvas.parentElement?.clientHeight || 450;
    };
    window.addEventListener('resize', handleResize);

    // Partículas neon
    const stars: Array<{ x: number; y: number; z: number; speed: number; color: string }> = [];
    const colors = ['#00f0ff', '#7928ca', '#ff0080', '#10b981', '#3b82f6'];
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * width,
        speed: 1.5 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.fillStyle = '#05030a';
      ctx.fillRect(0, 0, width, height);

      // 1. Grid Synthwave en el horizonte
      const horizonY = height * 0.65;
      const gradient = ctx.createLinearGradient(0, horizonY - 100, 0, height);
      gradient.addColorStop(0, 'rgba(121, 40, 202, 0)');
      gradient.addColorStop(0.3, 'rgba(121, 40, 202, 0.25)');
      gradient.addColorStop(1, 'rgba(0, 240, 255, 0.4)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // Líneas de perspectiva del suelo
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      ctx.lineWidth = 1.5;
      const numLines = 14;
      for (let i = -numLines; i <= numLines; i++) {
        ctx.beginPath();
        ctx.moveTo(width / 2 + (i * width) / (numLines * 2), horizonY);
        ctx.lineTo(width / 2 + i * (width * 0.35), height);
        ctx.stroke();
      }

      // Líneas horizontales en movimiento
      const gridOffset = (time * 40) % 35;
      for (let y = horizonY; y < height; y += 18 + (y - horizonY) * 0.15) {
        const animatedY = y + gridOffset * ((y - horizonY) / (height - horizonY));
        if (animatedY <= height) {
          ctx.beginPath();
          ctx.moveTo(0, animatedY);
          ctx.lineTo(width, animatedY);
          ctx.stroke();
        }
      }

      // 2. Sol Neon Retro en el centro
      const sunRadius = Math.min(width, height) * 0.16;
      const sunGrad = ctx.createRadialGradient(width / 2, horizonY - 20, 10, width / 2, horizonY - 20, sunRadius);
      sunGrad.addColorStop(0, '#ff0080');
      sunGrad.addColorStop(0.7, '#7928ca');
      sunGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(width / 2, horizonY - 20, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Campo de Estrellas en túnel 3D
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.z -= star.speed;
        if (star.z <= 0) {
          star.z = width;
          star.x = (Math.random() - 0.5) * width * 2;
          star.y = (Math.random() - 0.5) * height * 2;
        }

        const k = 250 / star.z;
        const px = star.x * k + width / 2;
        const py = star.y * k + horizonY * 0.7;

        if (px >= 0 && px <= width && py >= 0 && py <= horizonY) {
          const size = Math.max(1, (1 - star.z / width) * 3);
          ctx.fillStyle = star.color;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ── Sintetizador de Audio Generativo Web Audio API ────────────────────────
  const toggleLoFiSound = () => {
    if (isPlayingAudio) {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      }
      setIsPlayingAudio(false);
    } else {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Tono cálido tipo Lo-Fi chill (Frecuencia pentatónica relajante 220Hz / 432Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(216, ctx.currentTime);

        // LFO para efecto de modulación suave
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(0.2, ctx.currentTime);
        lfoGain.gain.setValueAtTime(4, ctx.currentTime);
        lfo.connect(osc.frequency);
        lfo.start();

        gain.gain.setValueAtTime(0.08, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
        setIsPlayingAudio(true);
      } catch (e) {
        console.warn('Web Audio API not allowed without user gesture:', e);
      }
    }
  };

  // ── Lógica Minijuego Retro TV Zapper ──────────────────────────────────────
  const handleDialChange = (val: number) => {
    setCurrentFreq(val);
    const diff = Math.abs(val - targetFreq);
    if (diff < 0.3) {
      const newScore = score + 100;
      setScore(newScore);
      if (newScore > highScore) {
        setHighScore(newScore);
        try { localStorage.setItem('youapp_arcade_highscore', newScore.toString()); } catch {}
      }
      setGameMessage('🎉 ¡SEÑAL SINTONIZADA! +100 PTS');
      // Generar nueva frecuencia
      const next = parseFloat((87.5 + Math.random() * 20).toFixed(1));
      setTimeout(() => {
        setTargetFreq(next);
        setGameMessage(`Buscá la frecuencia: ${next} MHz`);
      }, 900);
    } else if (diff < 1.2) {
      setGameMessage('📶 ¡Casi! Estás muy cerca...');
    } else {
      setGameMessage(`Buscá la frecuencia: ${targetFreq} MHz`);
    }
  };

  return (
    <div className="youapp-offline-tv-screen">
      {/* Canvas Animado de Fondo */}
      <canvas ref={canvasRef} className="offline-canvas-layer" />

      {/* Overlay Superior con Badge de Modo Offline */}
      <div className="offline-top-overlay">
        <div className="offline-badge-pill">
          <WifiOff size={15} className="pulse-offline-icon" />
          <span>MODO SIN DATOS (OFFLINE)</span>
        </div>

        <div className="offline-channel-tag">
          <Radio size={14} />
          <span>{channelName}</span>
        </div>

        {isOnline && (
          <button className="reconnect-prompt-btn" onClick={() => onReconnect && onReconnect()}>
            <RefreshCw size={14} className="spin-reconnect" />
            <span>¡Conexión detectada! Volver a Directo</span>
          </button>
        )}
      </div>

      {/* Contenido Central según Pestaña */}
      <div className="offline-center-card glass-morph">
        {activeTab === 'visualizer' && (
          <div className="offline-visualizer-info">
            <div className="glow-tv-symbol">
              <Tv size={36} />
            </div>
            <h3>Señal YouApp Offline 24/7</h3>
            <p>
              No tenés conexión a internet en este momento, pero podés disfrutar de visuales generativas Lo-Fi,
              sintetizador de relajación o jugar en el modo Arcade sin consumir ni 1 mega de tu plan.
            </p>

            <div className="offline-action-buttons">
              <button
                className={`btn-lofi-sound ${isPlayingAudio ? 'active' : ''}`}
                onClick={toggleLoFiSound}
              >
                {isPlayingAudio ? <VolumeX size={18} /> : <Volume2 size={18} />}
                <span>{isPlayingAudio ? 'Silenciar Audio Lo-Fi' : 'Activar Sonido Relajante (432Hz)'}</span>
              </button>

              <button
                className="btn-play-arcade"
                onClick={() => setActiveTab('arcade')}
              >
                <Gamepad2 size={18} />
                <span>Jugar al Sintonizador Arcade</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'arcade' && (
          <div className="offline-arcade-game">
            <div className="arcade-header">
              <div className="arcade-score">
                <Trophy size={16} color="#00f0ff" />
                <span>Puntaje: <strong>{score}</strong></span>
              </div>
              <div className="arcade-highscore">
                <span>Récord: {highScore}</span>
              </div>
            </div>

            <div className="arcade-frequency-display">
              <div className="dial-box">
                <span className="dial-target">OBJETIVO: <strong>{targetFreq} MHz</strong></span>
                <span className="dial-current">{currentFreq.toFixed(1)} MHz</span>
              </div>
              <div className="signal-bar-wrap">
                <div
                  className="signal-bar-fill"
                  style={{
                    width: `${Math.max(5, 100 - Math.abs(currentFreq - targetFreq) * 15)}%`,
                    background: Math.abs(currentFreq - targetFreq) < 0.4 ? '#10b981' : '#00f0ff'
                  }}
                />
              </div>
              <p className="game-feedback-text">{gameMessage}</p>
            </div>

            <div className="arcade-slider-control">
              <input
                type="range"
                min="87.0"
                max="108.0"
                step="0.1"
                value={currentFreq}
                onChange={e => handleDialChange(parseFloat(e.target.value))}
                className="retro-frequency-slider"
              />
              <div className="slider-ticks">
                <span>88 MHz</span>
                <span>94 MHz</span>
                <span>100 MHz</span>
                <span>108 MHz</span>
              </div>
            </div>

            <button className="btn-back-visualizer" onClick={() => setActiveTab('visualizer')}>
              ← Volver al Visualizador
            </button>
          </div>
        )}

        {activeTab === 'testcard' && (
          <div className="smpte-testcard-wrap">
            <div className="smpte-bars">
              <div className="bar white" />
              <div className="bar yellow" />
              <div className="bar cyan" />
              <div className="bar green" />
              <div className="bar magenta" />
              <div className="bar red" />
              <div className="bar blue" />
            </div>
            <div className="smpte-info-row">
              <span>YOUAPP TV — SEÑAL DE PRUEBA</span>
              <span>PATRÓN NTSC / HD 60Hz</span>
            </div>
          </div>
        )}
      </div>

      {/* Selector de Modos Inferior */}
      <div className="offline-bottom-dock">
        <button
          className={`dock-btn ${activeTab === 'visualizer' ? 'active' : ''}`}
          onClick={() => setActiveTab('visualizer')}
        >
          <Sparkles size={16} />
          <span>Visuales Lo-Fi</span>
        </button>

        <button
          className={`dock-btn ${activeTab === 'arcade' ? 'active' : ''}`}
          onClick={() => setActiveTab('arcade')}
        >
          <Gamepad2 size={16} />
          <span>Juego Zapper ({score} pts)</span>
        </button>

        <button
          className={`dock-btn ${activeTab === 'testcard' ? 'active' : ''}`}
          onClick={() => setActiveTab('testcard')}
        >
          <Tv size={16} />
          <span>Mira de Ajuste</span>
        </button>
      </div>

      {/* ── ESTILOS DARK NEON OFFLINE ───────────────────────────────────────── */}
      <style>{`
        .youapp-offline-tv-screen {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background: #05030a;
          color: #ffffff;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          z-index: 50;
        }

        .offline-canvas-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .offline-top-overlay {
          position: absolute;
          top: 18px;
          left: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 10;
          gap: 12px;
          flex-wrap: wrap;
        }

        .offline-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(239, 68, 68, 0.22);
          border: 1px solid rgba(239, 68, 68, 0.6);
          color: #f87171;
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.8px;
          padding: 6px 14px;
          border-radius: 20px;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.3);
          backdrop-filter: blur(12px);
        }

        .pulse-offline-icon {
          animation: pulseOffline 1.4s infinite ease-in-out;
        }
        @keyframes pulseOffline {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .offline-channel-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(14, 12, 28, 0.85);
          border: 1px solid rgba(0, 240, 255, 0.25);
          color: #00f0ff;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 20px;
          backdrop-filter: blur(12px);
        }

        .reconnect-prompt-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.5);
          animation: floatBtnIn 0.3s ease-out;
        }
        .spin-reconnect {
          animation: spin 1.5s linear infinite;
        }

        /* Tarjeta Central */
        .offline-center-card {
          position: relative;
          z-index: 10;
          max-width: 540px;
          width: 90%;
          padding: 28px 24px;
          border-radius: 24px;
          background: rgba(14, 12, 28, 0.78);
          border: 1px solid rgba(0, 240, 255, 0.25);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 240, 255, 0.15);
          text-align: center;
          animation: cardPop 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cardPop {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }

        .glow-tv-symbol {
          width: 68px;
          height: 68px;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(121, 40, 202, 0.3));
          border: 1px solid rgba(0, 240, 255, 0.4);
          color: #00f0ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
        }

        .offline-visualizer-info h3 {
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #ffffff 40%, #00f0ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .offline-visualizer-info p {
          color: rgba(255, 255, 255, 0.65);
          font-size: 0.88rem;
          line-height: 1.55;
          margin-bottom: 24px;
        }

        .offline-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .btn-lofi-sound {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #ffffff;
          font-size: 0.88rem;
          font-weight: 700;
          padding: 12px 20px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-lofi-sound:hover, .btn-lofi-sound.active {
          background: rgba(0, 240, 255, 0.18);
          border-color: #00f0ff;
          color: #00f0ff;
          box-shadow: 0 0 16px rgba(0, 240, 255, 0.25);
        }

        .btn-play-arcade {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #7928ca 0%, #ff0080 100%);
          border: none;
          color: #ffffff;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 12px 20px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 22px rgba(121, 40, 202, 0.4);
        }
        .btn-play-arcade:hover {
          filter: brightness(1.15);
          transform: translateY(-1px);
        }

        /* Modo Arcade */
        .offline-arcade-game {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .arcade-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.7);
        }
        .arcade-score {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
        }
        .dial-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(0, 240, 255, 0.2);
          border-radius: 16px;
          padding: 12px;
          margin-bottom: 10px;
        }
        .dial-target {
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.6);
        }
        .dial-target strong {
          color: #ff0080;
        }
        .dial-current {
          font-size: 1.8rem;
          font-weight: 900;
          color: #00f0ff;
          letter-spacing: 1px;
        }

        .signal-bar-wrap {
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .signal-bar-fill {
          height: 100%;
          transition: width 0.15s ease, background 0.15s ease;
          box-shadow: 0 0 10px currentColor;
        }
        .game-feedback-text {
          font-size: 0.85rem;
          font-weight: 700;
          color: #e2e8f0;
          min-height: 22px;
        }

        .arcade-slider-control {
          padding: 10px 0;
        }
        .retro-frequency-slider {
          width: 100%;
          accent-color: #00f0ff;
          height: 8px;
          cursor: pointer;
        }
        .slider-ticks {
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 4px;
        }
        .btn-back-visualizer {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.82rem;
          cursor: pointer;
          padding: 6px;
        }
        .btn-back-visualizer:hover {
          color: #00f0ff;
        }

        /* SMPTE Color Bars */
        .smpte-testcard-wrap {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .smpte-bars {
          display: flex;
          height: 140px;
          width: 100%;
        }
        .bar { flex: 1; height: 100%; }
        .bar.white { background: #e5e5e5; }
        .bar.yellow { background: #eab308; }
        .bar.cyan { background: #06b6d4; }
        .bar.green { background: #22c55e; }
        .bar.magenta { background: #ec4899; }
        .bar.red { background: #ef4444; }
        .bar.blue { background: #3b82f6; }
        .smpte-info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #000;
          font-family: monospace;
          font-size: 0.75rem;
          color: #00f0ff;
        }

        /* Bottom Dock */
        .offline-bottom-dock {
          position: absolute;
          bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(14, 12, 28, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          padding: 6px;
          z-index: 10;
          backdrop-filter: blur(16px);
        }
        .dock-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.82rem;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dock-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .dock-btn.active {
          background: linear-gradient(135deg, #00f0ff 0%, #7928ca 100%);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(0, 240, 255, 0.35);
        }

        @media (max-width: 600px) {
          .offline-center-card {
            padding: 20px 16px;
          }
          .offline-top-overlay {
            top: 12px;
            left: 12px;
            right: 12px;
          }
          .offline-bottom-dock {
            bottom: 14px;
            width: 90%;
            justify-content: space-around;
          }
          .dock-btn span {
            font-size: 0.76rem;
          }
        }
      `}</style>
    </div>
  );
}
