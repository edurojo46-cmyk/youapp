import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminChannels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('atlas_channel_eligibility')
          .select(`
            id,
            subject_id,
            channel_id,
            action_id,
            status,
            updated_at
          `)
          .order('updated_at', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        setChannels(data || []);
      } catch (err) {
        console.error('Error fetching channels:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando eligibilidad de canales...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Elegibilidad de Canales (10C)</h1>
      
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID Sujeto</th>
              <th>Canal</th>
              <th>Acción</th>
              <th>Status</th>
              <th>Última Evaluación</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(c => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  {c.subject_id?.split('-')[0] || '-'}...
                </td>
                <td style={{ fontWeight: 600 }}>{c.channel_id}</td>
                <td>{c.action_id}</td>
                <td>
                  <span className={`admin-badge ${
                    c.status === 'ELIGIBLE' ? 'success' : 
                    c.status === 'INELIGIBLE' ? 'danger' : 
                    c.status === 'CONSENT_REQUIRED' ? 'warning' :
                    c.status === 'REVIEW_REQUIRED' ? 'info' : 'neutral'
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)' }}>
                  {new Date(c.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>No hay estados de canales registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
