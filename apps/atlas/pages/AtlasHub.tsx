import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Building2, 
  Database, 
  ShieldCheck, 
  Search, 
  Factory, 
  Tv, 
  Layers, 
  ArrowRight, 
  Activity,
  Briefcase,
  Contact2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Package,
  Compass
} from 'lucide-react';
import { useAtlasAuthStore } from '../../../src/store/atlas/atlasAuthStore.ts';
import { getIndustrialUrl, getYouAppUrl, getCurrentProduct } from '../../../packages/config/products.ts';

export const AtlasHub: React.FC = () => {
  const { user } = useAtlasAuthStore();
  const [metrics, setMetrics] = useState<{ total_people?: number; status?: string }>({});

  useEffect(() => {
    fetch('/api/atlas/live-metrics')
      .then(r => r.json())
      .then(data => {
        if (data && data.metrics) setMetrics(data.metrics);
      })
      .catch(() => {});
  }, []);

  const isStandaloneAtlas = getCurrentProduct() === 'ATLAS';
  const industrialUrl = isStandaloneAtlas ? getIndustrialUrl('/', { sso: true }) : '/buscaindustrial';
  const industrialLocalUrl = isStandaloneAtlas ? getIndustrialUrl('/local/caballito', { sso: true }) : '/local/caballito';
  const youappUrl = isStandaloneAtlas ? getYouAppUrl('/', { sso: true }) : '/';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      backgroundImage: 'radial-gradient(at 10% 10%, rgba(224, 242, 254, 0.7) 0px, transparent 40%), radial-gradient(at 90% 90%, rgba(240, 249, 255, 0.8) 0px, transparent 50%)',
      color: '#0f172a',
      padding: '32px 20px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
        
        {/* Top Header */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          paddingBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '36px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}>
              <Layers size={24} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px', color: '#0f172a' }}>
                  ATLAS
                </h1>
                <span style={{ 
                  background: '#e0f2fe', 
                  color: '#0369a1', 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  padding: '2px 8px', 
                  borderRadius: '12px',
                  letterSpacing: '0.04em'
                }}>
                  PLATAFORMA
                </span>
              </div>
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Plataforma Central de Inteligencia, Entidades & CRM B2B
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link 
              to="/productos"
              id="atlas-header-catalogo-btn"
              style={{
                background: '#0284c7',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <Package size={15} />
              <span>Catálogo</span>
            </Link>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              fontSize: '12.5px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              <span style={{ color: '#0369a1', fontWeight: 600 }}>Atlas SSOT</span>
              <span style={{ color: '#94a3b8' }}>•</span>
              <span style={{ color: '#475569' }}>
                {metrics.total_people ? `${metrics.total_people.toLocaleString()} registros` : 'Postgres SSOT'}
              </span>
            </div>

            {user ? (
              <Link 
                to="/perfil"
                id="atlas-user-profile-btn"
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }}></span>
                {user.email || 'Mi Perfil'}
              </Link>
            ) : (
              <Link
                to="/login"
                id="atlas-login-btn"
                style={{
                  background: '#f8fafc',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  padding: '8px 18px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Iniciar Sesión
              </Link>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section style={{ marginBottom: '36px', textAlign: 'center', padding: '12px 0' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#e0f2fe',
            color: '#0369a1',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '14px'
          }}>
            <CheckCircle2 size={13} />
            Hub de Conectividad & Motores Especializados
          </div>
          <h2 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.75px',
            marginBottom: '10px',
            color: '#0f172a'
          }}>
            Hub Central Atlas
          </h2>
          <p style={{ fontSize: '15px', color: '#64748b', maxWidth: '680px', margin: '0 auto', lineHeight: '1.6' }}>
            Acceso unificado a motores de personas, contactos verificados, organizaciones,
            gestión comercial en Mi Base, buscador industrial y suite multimedia.
          </p>
        </section>

        {/* Section 1: Motores de Descubrimiento & Directorio */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Directorio & Motores Atlas Core
            </span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '18px'
          }}>

            {/* Launcher 1: Personas */}
            <Link to="/search/personas" id="nav-personas" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#7dd3fc';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(2, 132, 199, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Users size={22} color="#0284c7" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0284c7'
                  }}>
                    Explorar <ArrowRight size={14} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Buscar Personas
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Encontrá ejecutivos, directores y tomadores de decisiones de la industria nacional. Identificación de cargos y perfiles clave.
                </p>
              </div>
            </Link>

            {/* Launcher 2: Contactos */}
            <Link to="/search/contactos" id="nav-contactos" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#6ee7b7';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(16, 185, 129, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#d1fae5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Contact2 size={22} color="#059669" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#059669'
                  }}>
                    Explorar <ArrowRight size={14} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Buscar Contactos
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Directorio verificado de correos corporativos, líneas telefónicas directas y vías oficiales de contacto con evidencia pública.
                </p>
              </div>
            </Link>

            {/* Launcher 3: Organizaciones */}
            <Link to="/search/organizaciones" id="nav-organizaciones" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#c084fc';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(168, 85, 247, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#f3e8ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Building2 size={22} color="#9333ea" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#9333ea'
                  }}>
                    Explorar <ArrowRight size={14} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Buscar Organizaciones
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Explorá el padrón industrial, razones sociales, CUITs verificados, rubro productivo y localización de empresas.
                </p>
              </div>
            </Link>

            {/* Launcher 4: Atlas Audience Map */}
            <Link to="/audience-map" id="nav-audience-map" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#38bdf8';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(56, 189, 248, 0.2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(56, 189, 248, 0.25)'
                  }}>
                    <Compass size={22} color="#0284c7" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0284c7',
                    background: '#f0f9ff',
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}>
                    Audience Map V1 <ArrowRight size={14} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Audience Map
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Mapeá superficies públicas reales donde tu audiencia se concentra: comunidades, colegios, foros, gacetas, facultades y canales.
                </p>
              </div>
            </Link>

          </div>
        </div>

        {/* Section 2: Operaciones Comerciales & CRM */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Gestión Comercial & Verticales Atlas
            </span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '18px'
          }}>

            {/* Launcher 4: Buscador Industrial */}
            <a href={industrialUrl} id="nav-industrial" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#fcd34d';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(245, 158, 11, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Factory size={22} color="#d97706" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#d97706'
                  }}>
                    Abrir Vertical <ExternalLink size={13} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Buscador Industrial
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Vertical comercial especializada: descubrí proveedores de insumos, catálogos verificados y cotizaciones de compra interempresariales.
                </p>
              </div>
            </a>

            {/* Launcher 5: Mi Base */}
            <Link to="/mi-base" id="nav-mi-base" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#7dd3fc';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(2, 132, 199, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Database size={22} color="#0284c7" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0284c7'
                  }}>
                    Abrir CRM <ArrowRight size={14} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Mi Base (Posibles Clientes)
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Tu CRM comercial privado: gestioná tus posibles clientes, notas de seguimiento, estado de oportunidades y propuestas emitidas.
                </p>
              </div>
            </Link>

            {/* Launcher 6: Industrial Local / Mercado Local (Owned by Busca Industrial) */}
            <a href={industrialLocalUrl} id="nav-industrial-local" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#38bdf8';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(56, 189, 248, 0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <MapPin size={22} color="#0284c7" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0284c7'
                  }}>
                    Explorar Mercado <ExternalLink size={13} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Industrial Local (Caballito)
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Vertical Busca Industrial: comercios de proximidad, ofertas B2B activas y comunidad vecinal georreferenciada con Google Maps.
                </p>
              </div>
            </a>

            {/* Launcher 6: YOUAPP Streaming */}
            <a href={youappUrl} id="nav-youapp" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#f472b6';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(236, 72, 153, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#fce7f3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Tv size={22} color="#db2777" />
                  </div>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#db2777'
                  }}>
                    Abrir App <ExternalLink size={13} />
                  </span>
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  YOUAPP Streaming
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, flexGrow: 1, lineHeight: '1.5' }}>
                  Plataforma multimedia independiente: Televisión en vivo, zapping 24/7 y canales de contenido.
                </p>
              </div>
            </a>

          </div>
        </div>

        {/* Section 3: Administración y Perfil */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Configuración & Auditoría
            </span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '18px'
          }}>

            {/* Launcher 7: Perfil */}
            <Link to="/perfil" id="nav-perfil" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '20px 24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Briefcase size={20} color="#475569" />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0', color: '#0f172a' }}>
                    Perfil & Empresa
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    Datos fiscales, CUIT, configuración corporativa y miembros.
                  </p>
                </div>
                <ArrowRight size={16} color="#94a3b8" />
              </div>
            </Link>

            {/* Launcher 8: Admin */}
            <Link to="/admin/atlas" id="nav-admin" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '20px 24px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShieldCheck size={20} color="#475569" />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0', color: '#0f172a' }}>
                    Admin Control Suite
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    Gobernanza de fuentes, telemetría y auditoría de reputación.
                  </p>
                </div>
                <ArrowRight size={16} color="#94a3b8" />
              </div>
            </Link>

          </div>
        </div>

      </div>
    </div>
  );
};

export default AtlasHub;
