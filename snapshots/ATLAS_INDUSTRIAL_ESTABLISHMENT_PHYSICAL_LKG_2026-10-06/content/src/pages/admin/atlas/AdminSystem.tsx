import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Activity, ShieldCheck, Mail, MessageCircle, Share2, Megaphone, CheckCircle2, XCircle } from 'lucide-react';

export default function AdminSystem() {
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [outreachConfig, setOutreachConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [capsRes, configRes] = await Promise.all([
          supabase.from('atlas_channel_capabilities').select('*'),
          supabase.from('atlas_outreach_config').select('*').limit(1).single()
        ]);
          
        if (capsRes.error) throw capsRes.error;
        // Don't throw on config error if it's just missing table/RLS, gracefully fallback
        if (configRes.data) {
          setOutreachConfig(configRes.data);
        }
        
        setCapabilities(capsRes.data || []);
      } catch (err) {
        console.error('Error fetching system capabilities:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)' }}>Cargando estado del sistema...</div>;

  // Helper to check if any specific action is globally active
  const isActionActive = (actionPrefix: string) => {
    return capabilities.some(c => c.action_id.startsWith(actionPrefix) && c.global_status === 'ACTIVE');
  };

  // Ensure BOTH capability exists AND the global outreach gate is enabled
  const globalSendEnabled = outreachConfig?.send_enabled === true;
  const isGlobalOff = !globalSendEnabled || !capabilities.some(c => c.global_status === 'ACTIVE');
  
  const isEmailActive = isActionActive('EMAIL_') && globalSendEnabled;
  const isSocialActive = (isActionActive('INSTAGRAM_PUB') || isActionActive('YOUTUBE_')) && globalSendEnabled;
  const isWhatsAppActive = isActionActive('WHATSAPP_') && globalSendEnabled;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>Atlas System Health</h1>
      
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '3rem' }}>
        <div className={`admin-glass-card ${isGlobalOff ? 'admin-system-alert off' : 'admin-system-alert'}`} style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={48} style={{ marginBottom: '1rem', color: isGlobalOff ? '#f87171' : '#34d399' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            GLOBAL EXTERNAL ACTIONS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800 }}>
            {isGlobalOff ? 'OFF 🔴' : 'ON 🟢'}
          </div>
        </div>

        <div className="admin-glass-card" style={{ flex: 2 }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--admin-glass-border)', paddingBottom: '0.5rem' }}>Current Subsystem Status</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Mail size={20} color="var(--admin-text-secondary)" />
                <span style={{ fontWeight: 600 }}>EMAIL</span>
              </div>
              {isEmailActive ? <CheckCircle2 color="#34d399"/> : <span style={{color: '#f87171', fontWeight: 700}}>OFF</span>}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Share2 size={20} color="var(--admin-text-secondary)" />
                <span style={{ fontWeight: 600 }}>SOCIAL WRITES</span>
              </div>
              {isSocialActive ? <CheckCircle2 color="#34d399"/> : <span style={{color: '#f87171', fontWeight: 700}}>OFF</span>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <MessageCircle size={20} color="var(--admin-text-secondary)" />
                <span style={{ fontWeight: 600 }}>WHATSAPP</span>
              </div>
              {isWhatsAppActive ? <CheckCircle2 color="#34d399"/> : <span style={{color: '#f87171', fontWeight: 700}}>OFF</span>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Megaphone size={20} color="var(--admin-text-secondary)" />
                <span style={{ fontWeight: 600 }}>ADS</span>
              </div>
              <span style={{color: '#f87171', fontWeight: 700}}>OFF</span> {/* Ads module not yet implemented in capabilities */}
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Modules Status</h2>
      <div className="admin-glass-card admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Status</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>Harvester</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Contact 8C</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Outreach 8D</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Decision 9B</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Provider Router 9D</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Social Identity 10A</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Signals 10B</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Channel Eligibility 10C</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Person Identity 10P-A</td>
              <td><span className="admin-badge success">Certified ✅</span></td>
              <td>v1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
