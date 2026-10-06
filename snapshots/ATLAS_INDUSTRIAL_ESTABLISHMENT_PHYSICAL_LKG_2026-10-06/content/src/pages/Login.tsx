import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useStore();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    location.pathname === '/registro' ? 'register' : 'login'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname === '/registro') {
      setMode('register');
    } else if (location.pathname === '/login') {
      if (mode === 'register') setMode('login');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (user && user.email) {
      navigate('/perfil');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!email) {
      setError('Por favor, ingresa tu correo electrónico.');
      return;
    }

    if (mode === 'forgot') {
      try {
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`
        });
        if (error) throw error;
        setSuccess('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
      } catch (err: any) {
        setError(err.message || 'Error al solicitar recuperación de contraseña');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Por favor, ingresa tu contraseña.');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
    }

    try {
      setLoading(true);
      
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) {
          navigate('/perfil');
        }
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: name
            }
          }
        });
        if (error) throw error;
        
        if (data?.session) {
          setSuccess('¡Cuenta creada e iniciada exitosamente! Redirigiendo...');
          setTimeout(() => navigate('/perfil'), 1000);
        } else {
          setSuccess('¡Cuenta creada con éxito! Por favor inicia sesión con tus credenciales.');
          setTimeout(() => setMode('login'), 2500);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error en la autenticación');
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (targetMode: 'login' | 'register' | 'forgot') => {
    setMode(targetMode);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="auth-layout">
      <div className="auth-background">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>
      </div>

      <div className="auth-container">
        <div className="auth-card glass-panel">
          
          <div className="brand-header">
            <Link to="/buscaindustrial" className="logo-container" title="Volver a Atlas">
              <svg viewBox="0 0 40 40" fill="none" width={32} height={32}>
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="#0f172a" />
                <polygon points="20,8 30,14 30,26 20,32 10,26 10,14" fill="#2563eb" />
                <polygon points="20,13 26,16.5 26,23.5 20,27 14,23.5 14,16.5" fill="white" opacity="0.95" />
              </svg>
            </Link>
            <h1>ATLAS</h1>
            <p className="subtitle">
              {mode === 'login' && 'Inicia sesión en tu cuenta industrial'}
              {mode === 'register' && 'Crea tu perfil y accede a Mi Base'}
              {mode === 'forgot' && 'Recuperación de contraseña segura'}
            </p>
          </div>

          {error && (
            <div className="alert error-alert">
              <ShieldCheck size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert success-alert">
              <ShieldCheck size={18} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            
            <div className={`form-fields ${mode}-mode`}>
              
              {mode === 'register' && (
                <div className="input-wrapper">
                  <UserIcon size={20} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Nombre completo" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="premium-input"
                  />
                </div>
              )}

              <div className="input-wrapper">
                <Mail size={20} className="input-icon" />
                <input 
                  type="email" 
                  placeholder="Correo electrónico profesional" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="premium-input"
                  required
                />
              </div>
              
              {mode !== 'forgot' && (
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input 
                    type="password" 
                    placeholder="Contraseña" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="premium-input"
                    required
                  />
                </div>
              )}

              {mode === 'register' && (
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input 
                    type="password" 
                    placeholder="Confirmar contraseña" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="premium-input"
                    required
                  />
                </div>
              )}

            </div>

            {mode === 'login' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-8px' }}>
                <button
                  type="button"
                  onClick={() => switchTo('forgot')}
                  className="toggle-btn"
                  style={{ fontSize: '13px', opacity: 0.8 }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading}>
              <span className="btn-text">
                {loading ? 'Procesando...' : (
                  mode === 'login' ? 'Iniciar Sesión' :
                  mode === 'register' ? 'Registrarme' :
                  'Enviar Enlace de Recuperación'
                )}
              </span>
              {!loading && (mode === 'forgot' ? <KeyRound size={18} className="btn-icon" /> : <ArrowRight size={20} className="btn-icon" />)}
            </button>
          </form>

          <div className="auth-footer">
            {mode === 'login' && (
              <>
                <p>¿No tienes una cuenta?</p>
                <button type="button" onClick={() => switchTo('register')} className="toggle-btn">
                  Crear cuenta gratis
                </button>
              </>
            )}

            {mode === 'register' && (
              <>
                <p>¿Ya tienes una cuenta?</p>
                <button type="button" onClick={() => switchTo('login')} className="toggle-btn">
                  Inicia sesión aquí
                </button>
              </>
            )}

            {mode === 'forgot' && (
              <button 
                type="button" 
                onClick={() => switchTo('login')} 
                className="toggle-btn"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ArrowLeft size={16} /> Volver a Iniciar Sesión
              </button>
            )}
          </div>

        </div>
      </div>

      <style>{`
        .auth-layout {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #0f111a;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .auth-background {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }

        .glow-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
        }

        .orb-1 {
          width: 400px;
          height: 400px;
          background: #7928ca;
          top: -100px;
          left: -100px;
          animation: float 10s ease-in-out infinite alternate;
        }

        .orb-2 {
          width: 500px;
          height: 500px;
          background: #ff0080;
          bottom: -200px;
          right: -100px;
          animation: float 12s ease-in-out infinite alternate-reverse;
        }

        @keyframes float {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }

        .auth-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          padding: 20px;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
          padding: 40px;
        }

        .brand-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo-container {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, #7928ca, #ff0080);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 20px rgba(121, 40, 202, 0.3);
        }

        .logo-icon {
          color: white;
        }

        .brand-header h1 {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: 2px;
          color: #ffffff;
          margin: 0 0 8px 0;
        }

        .subtitle {
          color: #8b949e;
          font-size: 15px;
          margin: 0;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          margin-bottom: 24px;
          font-size: 14px;
          font-weight: 500;
          animation: slideDown 0.3s ease-out forwards;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .error-alert {
          background: rgba(255, 59, 48, 0.1);
          color: #ff453a;
          border: 1px solid rgba(255, 59, 48, 0.2);
        }

        .success-alert {
          background: rgba(52, 199, 89, 0.1);
          color: #30d158;
          border: 1px solid rgba(52, 199, 89, 0.2);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: #8b949e;
          transition: color 0.3s ease;
        }

        .premium-input {
          width: 100%;
          padding: 16px 16px 16px 48px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          color: #ffffff;
          font-size: 15px;
          transition: all 0.3s ease;
        }

        .premium-input::placeholder {
          color: #8b949e;
        }

        .premium-input:focus {
          outline: none;
          background: rgba(0, 0, 0, 0.3);
          border-color: #ff0080;
          box-shadow: 0 0 0 4px rgba(255, 0, 128, 0.1);
        }

        .premium-input:focus + .input-icon {
          color: #ff0080;
        }

        .submit-btn {
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #7928ca, #ff0080);
          color: white;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, #ff0080, #7928ca);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 1;
        }

        .submit-btn:hover::before {
          opacity: 1;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .btn-text, .btn-icon {
          position: relative;
          z-index: 2;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(255, 0, 128, 0.3);
        }

        .auth-footer {
          margin-top: 32px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: #8b949e;
          font-size: 14px;
        }

        .toggle-btn {
          background: none;
          border: none;
          color: #ffffff;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: color 0.2s ease;
          text-decoration: underline;
          text-decoration-color: rgba(255,255,255,0.2);
          text-underline-offset: 4px;
        }

        .toggle-btn:hover {
          color: #ff0080;
          text-decoration-color: #ff0080;
        }
      `}</style>
    </div>
  );
}
