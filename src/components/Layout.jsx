import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  TicketPlus,
  Ticket,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Shield,
  Wrench,
  LayoutGrid,
  KeyRound,
} from 'lucide-react';
import { useState } from 'react';

export default function Layout({ children }) {
  const { user, role, logout, isAdmin, isTechnician, isClient } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getRoleLabel = () => {
    if (isAdmin) return { label: 'Administrador', icon: Shield, color: '#dc2626' };
    if (isTechnician) return { label: 'Técnico', icon: Wrench, color: '#2563eb' };
    return { label: 'Cliente', icon: User, color: '#059669' };
  };

  const roleInfo = getRoleLabel();

  const getNavItems = () => {
    const items = [];

    // Dashboard - todos
    items.push({
      path: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
    });

    // Crear ticket - todos
    items.push({
      path: '/tickets/new',
      label: 'Nuevo Ticket',
      icon: TicketPlus,
    });

    // Mis tickets - clientes
    if (isClient) {
      items.push({
        path: '/my-tickets',
        label: 'Mis Tickets',
        icon: Ticket,
      });
    }

    // Técnicos - Gestión de tickets
    if (isTechnician) {
      items.push({
        path: '/tickets?assignment=mine',
        label: 'Mis Asignados',
        icon: Ticket,
      });
      items.push({
        path: '/tickets',
        label: 'Todos los Tickets',
        icon: Ticket,
      });
      items.push({
        path: '/kanban',
        label: 'Tablero Kanban',
        icon: LayoutGrid,
      });
    }

    // Admin - Gestión completa
    if (isAdmin) {
      items.push({
        path: '/tickets?assignment=mine',
        label: 'Mis Asignados',
        icon: Ticket,
      });
      items.push({
        path: '/tickets?assignment=unassigned',
        label: 'Sin Asignar',
        icon: Ticket,
      });
      items.push({
        path: '/tickets',
        label: 'Todos los Tickets',
        icon: Ticket,
      });
      items.push({
        path: '/kanban',
        label: 'Tablero Kanban',
        icon: LayoutGrid,
      });
    }

    return items;
  };

  const navItems = getNavItems();

  // Helper para verificar si un item está activo
  const isItemActive = (itemPath) => {
    const [pathname, search] = itemPath.split('?');

    // Si no hay query params, comparar solo pathname
    if (!search) {
      return location.pathname === pathname && !location.search;
    }

    // Si hay query params, comparar pathname y params específicos
    if (location.pathname !== pathname) return false;

    const itemParams = new URLSearchParams(search);
    const currentParams = new URLSearchParams(location.search);

    // Verificar que los params del item coincidan
    for (const [key, value] of itemParams) {
      if (currentParams.get(key) !== value) return false;
    }

    return true;
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Mesa de Ayuda</h2>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">
            {user?.glpiname?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.glpiname || 'Usuario'}</span>
            <span className="user-role" style={{ color: roleInfo.color }}>
              <roleInfo.icon size={12} />
              {roleInfo.label}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isItemActive(item.path) ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/change-password"
            className={`nav-item ${location.pathname === '/change-password' ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <KeyRound size={20} />
            <span>Cambiar Contraseña</span>
          </Link>
          <button className="nav-item logout" onClick={logout}>
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="main-content">
        <header className="main-header">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="header-title">
            <h1>Mesa de Ayuda - Entersys</h1>
          </div>
          <div className="header-user">
            <span className="role-badge" style={{ backgroundColor: roleInfo.color }}>
              {roleInfo.label}
            </span>
          </div>
        </header>

        <div className="main-body">
          {children}
        </div>
      </main>
    </div>
  );
}
