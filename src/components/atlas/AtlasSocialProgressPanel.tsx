import React, { useEffect, useState } from 'react';
import { Activity, Fuel, CheckCircle, Database } from 'lucide-react';

interface SocialProgressData {
  total_target: number;
  total_new_verified: number;
  target_remaining: number;
  progress_percent: number;
  fb: { current: number; target: number; remaining: number; progress_percent: number };
  ig: { current: number; target: number; remaining: number; progress_percent: number };
  li: { current: number; target: number; remaining: number; progress_percent: number };
  net_new_per_min_5m_avg: number;
  high_yield_capacity_available: number;
  process_alive: boolean;
  seconds_since_last_commit: number;
}

export const AtlasSocialProgressPanel: React.FC = () => {
  const [data, setData] = useState<SocialProgressData | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/atlas/social-progress');
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.data) setData(json.data);
        }
      } catch (e) {}
    };

    load();
    const interval = setInterval(load, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  const format = (n: number) => n.toLocaleString('es-AR');

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '16px',
      padding: '1.5rem',
      marginBottom: '2rem',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={24} style={{ color: '#38bdf8' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
            ATLAS ACQUISITION (TOTAL SOCIAL)
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontWeight: '600',
            backgroundColor: data.process_alive ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: data.process_alive ? '#4ade80' : '#ef4444',
            border: `1px solid ${data.process_alive ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
          }}>
            Daemon: {data.process_alive ? 'RUNNING' : 'STOPPED'}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Último commit: {data.seconds_since_last_commit}s
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          <span style={{ color: '#94a3b8' }}>TOTAL SOCIAL:</span>
          <span style={{ fontWeight: '700', color: '#f8fafc' }}>
            {format(data.total_new_verified)} / {format(data.total_target)} ({data.progress_percent}%)
          </span>
        </div>
        <div style={{ width: '100%', height: '10px', background: 'rgba(51, 65, 85, 0.5)', borderRadius: '9999px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, data.progress_percent)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #38bdf8, #818cf8, #c084fc)',
            borderRadius: '9999px',
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* Platforms Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.85rem', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: '600', marginBottom: '0.25rem' }}>FACEBOOK</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
            {format(data.fb.current)} / {format(data.fb.target)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{data.fb.progress_percent}% alcanzado</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: '0.85rem', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#f472b6', fontWeight: '600', marginBottom: '0.25rem' }}>INSTAGRAM</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
            {format(data.ig.current)} / {format(data.ig.target)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{data.ig.progress_percent}% alcanzado</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(14, 165, 233, 0.2)', padding: '0.85rem', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '600', marginBottom: '0.25rem' }}>LINKEDIN</div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
            {format(data.li.current)} / {format(data.li.target)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{data.li.progress_percent}% alcanzado</div>
        </div>
      </div>

      {/* Telemetry Footer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '0.75rem', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8' }}>
          <Activity size={16} style={{ color: '#4ade80' }} />
          <span>Velocidad 5m: <strong style={{ color: '#f8fafc' }}>{format(data.net_new_per_min_5m_avg)}/min</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8' }}>
          <Fuel size={16} style={{ color: '#fbbf24' }} />
          <span>Fuel disponible: <strong style={{ color: '#f8fafc' }}>{format(data.high_yield_capacity_available)}</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8' }}>
          <CheckCircle size={16} style={{ color: '#38bdf8' }} />
          <span>Restantes para +600K: <strong style={{ color: '#f8fafc' }}>{format(data.target_remaining)}</strong></span>
        </div>
      </div>
    </div>
  );
};
