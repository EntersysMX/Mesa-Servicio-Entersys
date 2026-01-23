import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, AlertCircle, Mail, Lock, User, Building, Phone } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    // Campos de registro
    name: '',
    firstname: '',
    email: '',
    phone: '',
    company: '',
  });
  const [registerSuccess, setRegisterSuccess] = useState(false);

  const { login, error, loading } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const success = await login(formData.username, formData.password);
    if (success) {
      navigate('/');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    // Por ahora mostrar mensaje de que debe contactar al admin
    // En el futuro se puede implementar registro via API
    setRegisterSuccess(true);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Mesa de Ayuda</h1>
          <p>Sistema de Gestión de Incidentes</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setRegisterSuccess(false); }}
          >
            <LogIn size={16} />
            Iniciar Sesión
          </button>
          <button
            className={`tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setRegisterSuccess(false); }}
          >
            <UserPlus size={16} />
            Registrarse
          </button>
        </div>

        {isLogin ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">
                <User size={16} />
                Usuario
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Ingresa tu usuario"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <Lock size={16} />
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Ingresa tu contraseña"
                required
              />
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              <LogIn size={18} />
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            {registerSuccess ? (
              <div className="success-message">
                <h3>¡Solicitud Enviada!</h3>
                <p>Tu solicitud de registro ha sido recibida.</p>
                <p>Un administrador revisará tu información y te contactará pronto con tus credenciales de acceso.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => { setIsLogin(true); setRegisterSuccess(false); }}
                >
                  Volver a Iniciar Sesión
                </button>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">
                      <User size={16} />
                      Nombre *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Tu nombre"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="firstname">Apellido *</label>
                    <input
                      type="text"
                      id="firstname"
                      name="firstname"
                      value={formData.firstname}
                      onChange={handleChange}
                      placeholder="Tu apellido"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="email">
                    <Mail size={16} />
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="tu@correo.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">
                    <Phone size={16} />
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(55) 1234-5678"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="company">
                    <Building size={16} />
                    Empresa / Proyecto *
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Nombre de tu empresa o proyecto"
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-block">
                  <UserPlus size={18} />
                  Solicitar Acceso
                </button>

                <p className="form-note">
                  Al registrarte, un administrador te asignará credenciales de acceso.
                </p>
              </>
            )}
          </form>
        )}

        <div className="login-footer">
          <p>Conectado a GLPI - Entersys</p>
        </div>
      </div>
    </div>
  );
}
