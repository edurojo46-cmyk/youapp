import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function Login() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { user } = useStore();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!email || !password) {
      setError('Por favor, completa todos los campos obligatorios.');
      return;
    }

    if (!isLoginMode) {
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
      
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: name
            }
          }
        });
        if (error) throw error;
        
        setSuccess("¡Cuenta creada con éxito! Iniciando sesión...");
        // After successful signup, many systems auto-login if email confirm is off.
        // If not, we switch them to login mode.
        setTimeout(() => setIsLoginMode(true), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Error en la autenticación');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
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
            <div className="logo-container">
              <Tv size={32} className="logo-icon" />
            </div>
            <h1>YOUAPP</h1>
            <p className="subtitle">{isLoginMode ? 'Bienvenido de vuelta' : 'Crea tu cuenta profesional'}</p>
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
            
            <div className={`form-fields ${isLoginMode ? 'login-mode' : 'register-mode'}`}>
              
              {!isLoginMode && (
                <div className="input-wrapper">
                  <UserIcon size={20} className="input-icon" />
                  <input 
                    type="text" 
                    placeholder="Tu Nombre (Opcional)" 
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
                  placeholder="Correo electrónico" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="premium-input"
                  required
                />
              </div>
              
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

              {!isLoginMode && (
                <div className="input-wrapper">
                  <Lock size={20} className="input-icon" />
                  <input 
                    type="password" 
                    placeholder="Confirmar contraseña" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="premium-input"
                    required={!isLoginMode}
                  />
                </div>
              )}

            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              <span className="btn-text">
                {loading ? 'Procesando...' : (isLoginMode ? 'Iniciar Sesión' : 'Registrarme')}
              </span>
              {!loading && <ArrowRight size={20} className="btn-icon" />}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              {isLoginMode ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
            </p>
            <button type="button" onClick={toggleMode} className="toggle-btn">
              {isLoginMode ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
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
