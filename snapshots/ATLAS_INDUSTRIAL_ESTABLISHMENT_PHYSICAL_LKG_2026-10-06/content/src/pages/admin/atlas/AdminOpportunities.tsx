import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Users, Building2 } from 'lucide-react';

export default function AdminOpportunities() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('atlas_v_unified_subjects')
          .select('*')
          .order('last_seen_at', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        setSubjects(data || []);
      } catch (err) {
        console.error('Error fetching unified subjects:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando oportunidades...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Explorador de Oportunidades (Unified Subjects)</h1>
      
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Sujeto</th>
              <th>Tipo</th>
              <th>Interest</th>
              <th>Intent</th>
              <th>Product Fit</th>
              <th>Ubicación</th>
              <th>Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(s => (
              <tr key={s.subject_id}>
                <td style={{ fontWeight: 600 }}>{s.display_name || 'UNKNOWN'}</td>
                <td>
                  <span className={`admin-badge ${s.subject_type === 'PERSON' ? 'info' : 'warning'}`} style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
                    {s.subject_type === 'PERSON' ? <Users size={12}/> : <Building2 size={12}/>}
                    {s.subject_type}
                  </span>
                </td>
                {/* 10P-B and 10P-C Placeholder Fields */}
                <td style={{ color: 'var(--admin-text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>NOT AVAILABLE</td>
                <td style={{ color: 'var(--admin-text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>NOT AVAILABLE</td>
                <td style={{ color: 'var(--admin-text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>NOT AVAILABLE</td>
                
                <td>{s.location_known ? <span className="admin-badge success">Conocida</span> : <span className="admin-badge neutral">Unknown</span>}</td>
                <td style={{ fontWeight: 600 }}>{s.evidence_count}</td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>No hay sujetos registrados en el registry</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
