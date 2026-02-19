import { createContext, useContext, useState, useEffect } from 'react';
import glpiApi from '../services/glpiApi';

const AuthContext = createContext(null);

// Mapeo de perfiles de GLPI a roles del sistema
const ROLE_MAPPING = {
  // Administradores
  'Super-Admin': 'admin',
  'Admin': 'admin',
  'Administrador': 'admin',

  // Técnicos - agregar aquí más perfiles si es necesario
  'Technician': 'technician',
  'Técnico': 'technician',
  'Tecnico': 'technician',
  'Supervisor': 'technician',
  'Hotliner': 'technician',
  'Soporte': 'technician',
  'Support': 'technician',
  'Help Desk': 'technician',
  'Helpdesk': 'technician',
  'IT': 'technician',
  'TI': 'technician',

  // Clientes
  'Self-Service': 'client',
  'Observer': 'client',
  'Cliente': 'client',
  'Client': 'client',
  'User': 'client',
  'Usuario': 'client',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'admin', 'technician', 'client'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const determineRole = (session) => {
    // Obtener el perfil del usuario desde la sesión
    const profileName = session?.glpiactiveprofile?.name || '';

    // Buscar en el mapeo
    for (const [glpiProfile, appRole] of Object.entries(ROLE_MAPPING)) {
      if (profileName.toLowerCase().includes(glpiProfile.toLowerCase())) {
        return appRole;
      }
    }

    // Por defecto, si no se reconoce, es cliente
    return 'client';
  };

  useEffect(() => {
    const checkSession = async () => {
      const hasSession = glpiApi.restoreSession();
      if (hasSession) {
        try {
          const session = await glpiApi.getFullSession();
          setUser(session.session);
          setRole(determineRole(session.session));
          setLoading(false);
          return;
        } catch (err) {
          localStorage.removeItem('glpi_session_token');
        }
      }

      // Si hay User Token configurado, hacer auto-login
      if (glpiApi.hasUserToken()) {
        try {
          await glpiApi.autoLoginWithUserToken();
          const session = await glpiApi.getFullSession();
          setUser(session.session);
          setRole(determineRole(session.session));
        } catch (err) {
          console.error('Auto-login falló:', err);
        }
      }

      setLoading(false);
    };
    checkSession();
  }, []);

  const login = async (username, password) => {
    setError(null);
    setLoading(true);
    try {
      await glpiApi.initSession(username, password);
      const session = await glpiApi.getFullSession();
      setUser(session.session);
      setRole(determineRole(session.session));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loginWithToken = async (userToken) => {
    setError(null);
    setLoading(true);
    try {
      await glpiApi.initSessionWithToken(userToken);
      const session = await glpiApi.getFullSession();
      setUser(session.session);
      setRole(determineRole(session.session));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await glpiApi.killSession();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      setUser(null);
      setRole(null);
    }
  };

  const value = {
    user,
    role,
    loading,
    error,
    login,
    loginWithToken,
    logout,
    isAuthenticated: !!user,
    isAdmin: role === 'admin',
    isTechnician: role === 'technician',
    isClient: role === 'client',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
