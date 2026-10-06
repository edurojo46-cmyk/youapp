import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('atlas_discovered_companies')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
          
        if (error) throw error;
        setCompanies(data || []);
      } catch (err) {
        console.error('Error fetching companies:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando empresas...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Directorio de Empresas (Operational Authority)</h1>
      
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Sector</th>
              <th>Ubicación</th>
              <th>Status</th>
              <th>Confianza</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.company_candidate_id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                  {c.company_candidate_id.split('-')[0]}...
                </td>
                <td style={{ fontWeight: 600 }}>{c.company_name}</td>
                <td>{c.sector || '-'}</td>
                <td>{[c.city, c.region, c.country].filter(Boolean).join(', ') || '-'}</td>
                <td>
                  <span className={`admin-badge ${c.status === 'VERIFIED' ? 'success' : 'neutral'}`}>
                    {c.status}
                  </span>
                </td>
                <td>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${(c.confidence || 0) * 100}%`, backgroundColor: 'var(--admin-accent)', height: '100%' }}></div>
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>No hay empresas registradas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
