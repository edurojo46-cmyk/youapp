import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminEvidence() {
  const [evidence, setEvidence] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('atlas_person_attribute_evidence')
          .select('*')
          .order('observed_at', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        setEvidence(data || []);
      } catch (err) {
        console.error('Error fetching evidence:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando evidencias...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Evidencia de Atributos</h1>
      
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID Persona</th>
              <th>Atributo</th>
              <th>Valor Normalizado</th>
              <th>Aserción</th>
              <th>Confianza</th>
              <th>Observado</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map(e => (
              <tr key={e.evidence_id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  {e.person_id?.split('-')[0] || '-'}...
                </td>
                <td style={{ fontWeight: 600 }}>{e.attribute_key}</td>
                <td>{e.normalized_value || '-'}</td>
                <td>
                  <span className={`admin-badge ${
                    e.assertion_type === 'VERIFIED' ? 'success' : 
                    e.assertion_type === 'OBSERVED' ? 'info' : 
                    e.assertion_type === 'DECLARED' ? 'warning' : 'neutral'
                  }`}>
                    {e.assertion_type}
                  </span>
                </td>
                <td>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${(e.confidence || 0) * 100}%`, backgroundColor: 'var(--admin-accent)', height: '100%' }}></div>
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)' }}>
                  {new Date(e.observed_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {evidence.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>No hay evidencias registradas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
