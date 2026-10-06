import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminSignals() {
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('atlas_social_signals')
          .select('*')
          .order('detected_at', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        setSignals(data || []);
      } catch (err) {
        console.error('Error fetching signals:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando señales...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Señales de Redes Sociales (10B)</h1>
      
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Plataforma</th>
              <th>Tipo de Señal</th>
              <th>Status</th>
              <th>Confianza</th>
              <th>Detectado</th>
            </tr>
          </thead>
          <tbody>
            {signals.map(s => (
              <tr key={s.signal_id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  {s.signal_id.split('-')[0]}...
                </td>
                <td>{s.platform}</td>
                <td style={{ fontWeight: 600 }}>{s.signal_type}</td>
                <td>
                  <span className={`admin-badge ${
                    s.status === 'CONFIRMED' ? 'success' : 
                    s.status === 'CONFLICT' ? 'danger' : 'neutral'
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${(s.confidence || 0) * 100}%`, backgroundColor: 'var(--admin-accent)', height: '100%' }}></div>
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)' }}>
                  {new Date(s.detected_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {signals.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>No hay señales registradas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
