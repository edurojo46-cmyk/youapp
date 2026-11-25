import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import IndustrialGlobalHeader from '../components/IndustrialGlobalHeader';
import './Perfil.css';

interface ProfileData {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string;
  country: string;
  province: string;
  avatar_url: string | null;
}

interface OrganizationData {
  organization_id: string;
  name: string;
  legal_name: string;
  tax_id: string;
  website: string;
  industry: string;
  country: string;
  province: string;
  city: string;
  address: string;
}

interface MembershipData {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: string;
}

export default function Perfil() {
  const { user, signOut } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'personal';

  const [loading, setLoading] = useState(true);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Personal Profile state
  const [profile, setProfile] = useState<ProfileData>({
    user_id: '',
    first_name: '',
    last_name: '',
    display_name: '',
    phone: '',
    country: 'AR',
    province: '',
    avatar_url: null
  });

  // Organization state
  const [org, setOrg] = useState<OrganizationData>({
    organization_id: '',
    name: '',
    legal_name: '',
    tax_id: '',
    website: '',
    industry: '',
    country: 'AR',
    province: '',
    city: '',
    address: ''
  });
  const [hasOrg, setHasOrg] = useState(false);
  const [membership, setMembership] = useState<MembershipData | null>(null);

  // Security state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          navigate('/login');
          return;
        }

        const res = await fetch('/api/user/profile', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.profile) {
              setProfile({
                user_id: data.profile.user_id || '',
                first_name: data.profile.first_name || '',
                last_name: data.profile.last_name || '',
                display_name: data.profile.display_name || '',
                phone: data.profile.phone || '',
                country: data.profile.country || 'AR',
                province: data.profile.province || '',
                avatar_url: data.profile.avatar_url || null
              });
            }
            if (data.organization) {
              setOrg({
                organization_id: data.organization.organization_id || '',
                name: data.organization.name || '',
                legal_name: data.organization.legal_name || '',
                tax_id: data.organization.tax_id || '',
                website: data.organization.website || '',
                industry: data.organization.industry || '',
                country: data.organization.country || 'AR',
                province: data.organization.province || '',
                city: data.organization.city || '',
                address: data.organization.address || ''
              });
              setHasOrg(true);
            }
            if (data.membership) {
              setMembership(data.membership);
            }
          }
        }
      } catch (err: any) {
        console.error('Error loading profile data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [navigate]);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión no encontrada');

      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(profile)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar perfil');
      }

      showToast('✓ Datos personales guardados exitosamente');
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo guardar el perfil');
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión no encontrada');

      if (!org.name.trim()) {
        throw new Error('El nombre de la empresa es obligatorio');
      }

      const method = hasOrg ? 'PUT' : 'POST';
      const res = await fetch('/api/user/organization', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(org)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar empresa');
      }

      if (data.organization) {
        setOrg(prev => ({ ...prev, ...data.organization }));
        setHasOrg(true);
      }
      if (data.membership) {
        setMembership(data.membership);
      }

      showToast(hasOrg ? '✓ Empresa actualizada correctamente' : '✓ Empresa registrada exitosamente');
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo guardar la información empresarial');
    } finally {
      setSavingOrg(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setErrorMessage(null);
    try {
      if (newPassword.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      showToast('✓ Contraseña actualizada correctamente');
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo actualizar la contraseña');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="perfil-root">
        <IndustrialGlobalHeader />
        <div className="perfil-loading">
          <div className="perfil-spinner" />
          <p>Cargando información del perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="perfil-root">
      <IndustrialGlobalHeader />

      <div className="perfil-container">
        {/* Profile Header Card */}
        <div className="perfil-header-card">
          <div className="perfil-header-avatar">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} />
            ) : (
              <span>{(profile.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}</span>
            )}
          </div>
          <div className="perfil-header-info">
            <h1 className="perfil-header-title">
              {profile.display_name || `${profile.first_name} ${profile.last_name}`.trim() || 'Mi Perfil Atlas'}
            </h1>
            <p className="perfil-header-email">{user?.email}</p>
            <div className="perfil-header-badges">
              <span className="perfil-badge perfil-badge--blue">Identidad Verificada</span>
              {hasOrg && (
                <span className="perfil-badge perfil-badge--green">
                  {org.name} ({membership?.role || 'MEMBER'})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="perfil-alert perfil-alert--error">
            <span>{errorMessage}</span>
          </div>
        )}
        {toastMessage && (
          <div className="perfil-alert perfil-alert--success">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="perfil-tabs">
          <button 
            type="button" 
            className={`perfil-tab ${activeTab === 'personal' ? 'perfil-tab--active' : ''}`}
            onClick={() => setSearchParams({ tab: 'personal' })}
          >
            Datos personales
          </button>
          <button 
            type="button" 
            className={`perfil-tab ${activeTab === 'empresa' ? 'perfil-tab--active' : ''}`}
            onClick={() => setSearchParams({ tab: 'empresa' })}
          >
            Mi empresa
          </button>
          <button 
            type="button" 
            className={`perfil-tab ${activeTab === 'seguridad' ? 'perfil-tab--active' : ''}`}
            onClick={() => setSearchParams({ tab: 'seguridad' })}
          >
            Seguridad
          </button>
          <button 
            type="button" 
            className={`perfil-tab ${activeTab === 'integraciones' ? 'perfil-tab--active' : ''}`}
            onClick={() => setSearchParams({ tab: 'integraciones' })}
          >
            Integraciones
          </button>
        </div>

        {/* Tab 1: Datos Personales */}
        {activeTab === 'personal' && (
          <div className="perfil-card">
            <h2 className="perfil-card-title">Información Personal</h2>
            <p className="perfil-card-subtitle">
              Gestiona tu información pública y de contacto para cotizaciones y transacciones comerciales.
            </p>

            <form onSubmit={handleSavePersonal} className="perfil-form">
              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Nombre</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={profile.first_name}
                    onChange={e => setProfile({ ...profile, first_name: e.target.value })}
                    placeholder="Ej. Juan"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Apellido</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={profile.last_name}
                    onChange={e => setProfile({ ...profile, last_name: e.target.value })}
                    placeholder="Ej. Pérez"
                  />
                </div>
              </div>

              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Nombre visible / Alias profesional</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={profile.display_name}
                    onChange={e => setProfile({ ...profile, display_name: e.target.value })}
                    placeholder="Ej. Juan Pérez - Ventas Industriales"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Teléfono de contacto</label>
                  <input 
                    type="tel" 
                    className="perfil-input"
                    value={profile.phone}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="+54 11 4000-0000"
                  />
                </div>
              </div>

              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">País</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={profile.country}
                    onChange={e => setProfile({ ...profile, country: e.target.value })}
                    placeholder="AR"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Provincia / Región</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={profile.province}
                    onChange={e => setProfile({ ...profile, province: e.target.value })}
                    placeholder="Buenos Aires, Córdoba, Santa Fe..."
                  />
                </div>
              </div>

              <div className="perfil-actions">
                <button type="submit" className="perfil-btn-primary" disabled={savingPersonal}>
                  {savingPersonal ? 'Guardando...' : 'Guardar datos personales'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Mi Empresa */}
        {activeTab === 'empresa' && (
          <div className="perfil-card">
            <h2 className="perfil-card-title">
              {hasOrg ? 'Información de la Empresa' : 'Registrar Empresa o Razón Social'}
            </h2>
            <p className="perfil-card-subtitle">
              Los datos de tu empresa aparecerán como emisor oficial en las propuestas comerciales enviadas a clientes.
            </p>

            <form onSubmit={handleSaveOrganization} className="perfil-form">
              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Nombre Comercial de la Empresa *</label>
                  <input 
                    type="text" 
                    required
                    className="perfil-input"
                    value={org.name}
                    onChange={e => setOrg({ ...org, name: e.target.value })}
                    placeholder="Ej. Molinos del Sur S.A."
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Razón Social</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.legal_name}
                    onChange={e => setOrg({ ...org, legal_name: e.target.value })}
                    placeholder="Ej. Molinos del Sur Sociedad Anónima"
                  />
                </div>
              </div>

              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">CUIT / Identificación Tributaria</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.tax_id}
                    onChange={e => setOrg({ ...org, tax_id: e.target.value })}
                    placeholder="30-71234567-8"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Sitio Web Oficial</label>
                  <input 
                    type="url" 
                    className="perfil-input"
                    value={org.website}
                    onChange={e => setOrg({ ...org, website: e.target.value })}
                    placeholder="https://www.molinosdelsur.com.ar"
                  />
                </div>
              </div>

              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Rubro o Industria</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.industry}
                    onChange={e => setOrg({ ...org, industry: e.target.value })}
                    placeholder="Maquinaria y Equipos Industriales"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Provincia</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.province}
                    onChange={e => setOrg({ ...org, province: e.target.value })}
                    placeholder="Córdoba"
                  />
                </div>
              </div>

              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Ciudad</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.city}
                    onChange={e => setOrg({ ...org, city: e.target.value })}
                    placeholder="San Francisco"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Dirección / Planta Industrial</label>
                  <input 
                    type="text" 
                    className="perfil-input"
                    value={org.address}
                    onChange={e => setOrg({ ...org, address: e.target.value })}
                    placeholder="Ruta 19 Km 120"
                  />
                </div>
              </div>

              <div className="perfil-actions">
                <button type="submit" className="perfil-btn-primary" disabled={savingOrg}>
                  {savingOrg ? 'Guardando...' : (hasOrg ? 'Actualizar datos de empresa' : 'Registrar empresa')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Seguridad */}
        {activeTab === 'seguridad' && (
          <div className="perfil-card">
            <h2 className="perfil-card-title">Seguridad de la Cuenta</h2>
            <p className="perfil-card-subtitle">
              Gestiona tus credenciales de acceso y mantén segura tu cuenta.
            </p>

            <form onSubmit={handleUpdatePassword} className="perfil-form">
              <div className="perfil-grid-2">
                <div className="perfil-field">
                  <label className="perfil-label">Nueva Contraseña</label>
                  <input 
                    type="password" 
                    required
                    className="perfil-input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="perfil-field">
                  <label className="perfil-label">Confirmar Nueva Contraseña</label>
                  <input 
                    type="password" 
                    required
                    className="perfil-input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                  />
                </div>
              </div>

              <div className="perfil-actions">
                <button type="submit" className="perfil-btn-primary" disabled={savingPassword}>
                  {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>

            <div className="perfil-security-meta">
              <div className="perfil-meta-row">
                <span>Identificador Único (UUID):</span>
                <code>{user?.id}</code>
              </div>
              <div className="perfil-meta-row">
                <span>Email Asociado:</span>
                <strong>{user?.email}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Integraciones */}
        {activeTab === 'integraciones' && (
          <div className="perfil-card">
            <h2 className="perfil-card-title">Integraciones y Pasarelas de Pago</h2>
            <p className="perfil-card-subtitle">
              Conecta los servicios de cobro y liquidación para tus cotizaciones comerciales.
            </p>

            <div className="perfil-integration-box">
              <div className="perfil-int-left">
                <div className="perfil-int-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" width={28} height={28} style={{ color: '#009ee3' }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm1-12c2.21 0 4 1.79 4 4 0 1.5-.82 2.78-2.02 3.44l-.98.56V14h-2v-2.5l1.62-.93c.85-.47 1.38-1.37 1.38-2.07 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="perfil-int-name">Mercado Pago</h3>
                  <p className="perfil-int-desc">
                    Recepción de pagos B2B vía Checkout Pro con acreditación directa y retención de marketplace fee.
                  </p>
                  <div className="perfil-int-status">
                    <span className="perfil-status-dot perfil-status-dot--gray" />
                    <span>Estado: <strong>No conectado</strong></span>
                  </div>
                </div>
              </div>

              <div className="perfil-int-right">
                <button 
                  type="button" 
                  className="perfil-btn-disabled"
                  disabled
                  title="Disponible próximamente en la fase de activación de pasarelas"
                >
                  Conectar Mercado Pago
                </button>
                <span className="perfil-int-note">Disponible próximamente</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
