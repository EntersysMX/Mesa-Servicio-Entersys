import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  TicketPlus,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Inbox,
  TrendingUp,
  Users,
  Ticket,
  User,
  AlertCircle,
  Timer,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Target,
  Calendar,
} from 'lucide-react';

export default function Dashboard() {
  const { user, isAdmin, isTechnician, isClient } = useAuth();
  const [stats, setStats] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const [recentTickets, setRecentTickets] = useState([]);
  const [urgentTickets, setUrgentTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userId = user?.glpiID;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Estadísticas globales
      const globalStats = await glpiApi.getTicketStats().catch(() => ({
        new: 0,
        inProgress: 0,
        solved: 0,
        closed: 0,
      }));
      setStats(globalStats);

      // Para técnicos y admins
      if ((isAdmin || isTechnician) && userId) {
        // Mis estadísticas
        const techStats = await glpiApi
          .getTechnicianTicketStats(userId)
          .catch(() => ({ assigned: 0, new: 0, inProgress: 0 }));
        setMyStats(techStats);

        // Tickets urgentes (prioridad alta o muy alta, no resueltos)
        const urgent = await glpiApi
          .searchTicketsAdvanced(
            { priority: '4' }, // Alta prioridad
            { range: '0-5' }
          )
          .catch(() => ({ data: [] }));
        setUrgentTickets(urgent.data || []);

        // Mis tickets recientes
        const myRecent = await glpiApi
          .getTicketsAssignedToUser(userId, { range: '0-9' })
          .catch(() => ({ data: [] }));
        setRecentTickets(myRecent.data || []);
      } else if (isClient && userId) {
        // Tickets del cliente
        const clientTickets = await glpiApi
          .getTicketsCreatedByUser(userId, { range: '0-9' })
          .catch(() => ({ data: [] }));
        setRecentTickets(clientTickets.data || []);
      } else {
        const allTickets = await glpiApi
          .getTickets({ range: '0-9', order: 'DESC' })
          .catch(() => []);
        setRecentTickets(Array.isArray(allTickets) ? allTickets : []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isTechnician, isClient, userId]);

  useEffect(() => {
    fetchData();
    // Auto-refresh cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getStatusInfo = (status) => {
    const statusMap = {
      1: { label: 'Nuevo', class: 'status-new', icon: AlertCircle },
      2: { label: 'En curso', class: 'status-assigned', icon: Clock },
      3: { label: 'Planificado', class: 'status-planned', icon: Calendar },
      4: { label: 'En espera', class: 'status-waiting', icon: Timer },
      5: { label: 'Resuelto', class: 'status-solved', icon: CheckCircle },
      6: { label: 'Cerrado', class: 'status-closed', icon: XCircle },
    };
    return statusMap[status] || { label: 'Desconocido', class: 'status-unknown', icon: AlertCircle };
  };

  const getPriorityInfo = (priority) => {
    const priorityMap = {
      1: { label: 'Muy baja', class: 'priority-verylow' },
      2: { label: 'Baja', class: 'priority-low' },
      3: { label: 'Media', class: 'priority-medium' },
      4: { label: 'Alta', class: 'priority-high' },
      5: { label: 'Muy alta', class: 'priority-veryhigh' },
      6: { label: 'Mayor', class: 'priority-major' },
    };
    return priorityMap[priority] || { label: 'Normal', class: 'priority-medium' };
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const totalActive = (stats?.new || 0) + (stats?.inProgress || 0);
  const resolutionRate =
    stats && stats.solved + stats.closed > 0
      ? Math.round(
          ((stats.solved + stats.closed) /
            (stats.new + stats.inProgress + stats.solved + stats.closed)) *
            100
        )
      : 0;

  return (
    <div className="dashboard-page service-desk">
      {/* Header */}
      <div className="dashboard-header">
        <div className="welcome-section">
          <div className="welcome-text">
            <h1>
              {getGreeting()}, {user?.glpifriendlyname || user?.glpiname || 'Usuario'}
            </h1>
            <p className="welcome-subtitle">
              {isAdmin && 'Centro de Control - Service Desk'}
              {isTechnician && 'Panel de Técnico - Gestión de Incidentes'}
              {isClient && 'Portal de Soporte - ¿Necesitas ayuda?'}
            </p>
          </div>
          <div className="header-actions">
            <button
              onClick={fetchData}
              className="btn btn-icon"
              title="Actualizar"
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? 'spinning' : ''} />
            </button>
            <Link to="/tickets/new" className="btn btn-primary">
              <TicketPlus size={18} />
              Nuevo Ticket
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Dashboard para Admin/Técnico */}
      {(isAdmin || isTechnician) && (
        <>
          {/* KPIs principales */}
          <div className="kpi-grid">
            <div className="kpi-card kpi-primary">
              <div className="kpi-icon">
                <Activity size={24} />
              </div>
              <div className="kpi-content">
                <span className="kpi-value">{totalActive}</span>
                <span className="kpi-label">Tickets Activos</span>
              </div>
              <div className="kpi-trend up">
                <ArrowUpRight size={16} />
                <span>En proceso</span>
              </div>
            </div>

            <div className="kpi-card kpi-warning">
              <div className="kpi-icon">
                <Zap size={24} />
              </div>
              <div className="kpi-content">
                <span className="kpi-value">{myStats?.assigned || 0}</span>
                <span className="kpi-label">Mis Asignados</span>
              </div>
              <Link to="/tickets?assignment=mine" className="kpi-link">
                Ver todos
              </Link>
            </div>

            <div className="kpi-card kpi-danger">
              <div className="kpi-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="kpi-content">
                <span className="kpi-value">{stats?.new || 0}</span>
                <span className="kpi-label">Sin Atender</span>
              </div>
              <Link to="/tickets?status=1" className="kpi-link">
                Atender
              </Link>
            </div>

            <div className="kpi-card kpi-success">
              <div className="kpi-icon">
                <Target size={24} />
              </div>
              <div className="kpi-content">
                <span className="kpi-value">{resolutionRate}%</span>
                <span className="kpi-label">Tasa Resolución</span>
              </div>
              <div className="kpi-trend">
                <CheckCircle size={16} />
                <span>{stats?.solved || 0} resueltos</span>
              </div>
            </div>
          </div>

          {/* Panel de acciones rápidas y tickets urgentes */}
          <div className="dashboard-grid">
            {/* Tickets Urgentes */}
            <div className="dashboard-card urgent-tickets">
              <div className="card-header">
                <h3>
                  <AlertTriangle size={18} />
                  Tickets Urgentes
                </h3>
                <Link to="/tickets?priority=4" className="btn btn-sm btn-secondary">
                  Ver todos
                </Link>
              </div>
              <div className="card-body">
                {urgentTickets.length === 0 ? (
                  <div className="empty-card">
                    <CheckCircle size={32} />
                    <p>No hay tickets urgentes</p>
                  </div>
                ) : (
                  <div className="urgent-list">
                    {urgentTickets.slice(0, 5).map((ticket) => {
                      const ticketId = ticket.id || ticket[2];
                      const ticketName = ticket.name || ticket[1];
                      const ticketPriority = ticket.priority || ticket[3];
                      const priority = getPriorityInfo(ticketPriority);

                      return (
                        <Link
                          to={`/tickets/${ticketId}`}
                          key={ticketId}
                          className="urgent-item"
                        >
                          <span className={`priority-dot ${priority.class}`} />
                          <div className="urgent-info">
                            <span className="urgent-id">#{ticketId}</span>
                            <span className="urgent-title">{ticketName}</span>
                          </div>
                          <span className={`badge ${priority.class}`}>
                            {priority.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Resumen de Estados */}
            <div className="dashboard-card status-summary">
              <div className="card-header">
                <h3>
                  <BarChart3 size={18} />
                  Resumen por Estado
                </h3>
              </div>
              <div className="card-body">
                <div className="status-bars">
                  <Link to="/tickets?status=1" className="status-bar-item">
                    <div className="status-bar-label">
                      <span className="status-dot status-new" />
                      <span>Nuevos</span>
                    </div>
                    <div className="status-bar-value">{stats?.new || 0}</div>
                  </Link>
                  <Link to="/tickets?status=2" className="status-bar-item">
                    <div className="status-bar-label">
                      <span className="status-dot status-assigned" />
                      <span>En Curso</span>
                    </div>
                    <div className="status-bar-value">{stats?.inProgress || 0}</div>
                  </Link>
                  <Link to="/tickets?status=5" className="status-bar-item">
                    <div className="status-bar-label">
                      <span className="status-dot status-solved" />
                      <span>Resueltos</span>
                    </div>
                    <div className="status-bar-value">{stats?.solved || 0}</div>
                  </Link>
                  <Link to="/tickets?status=6" className="status-bar-item">
                    <div className="status-bar-label">
                      <span className="status-dot status-closed" />
                      <span>Cerrados</span>
                    </div>
                    <div className="status-bar-value">{stats?.closed || 0}</div>
                  </Link>
                </div>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="dashboard-card quick-actions-card">
              <div className="card-header">
                <h3>
                  <Zap size={18} />
                  Acciones Rápidas
                </h3>
              </div>
              <div className="card-body">
                <div className="quick-action-buttons">
                  <Link to="/tickets/new" className="quick-action-btn primary">
                    <TicketPlus size={20} />
                    <span>Crear Ticket</span>
                  </Link>
                  <Link to="/tickets?assignment=unassigned" className="quick-action-btn warning">
                    <Users size={20} />
                    <span>Sin Asignar</span>
                  </Link>
                  <Link to="/tickets?assignment=mine" className="quick-action-btn info">
                    <User size={20} />
                    <span>Mis Tickets</span>
                  </Link>
                  <Link to="/tickets" className="quick-action-btn">
                    <Inbox size={20} />
                    <span>Todos</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Mis Tickets Recientes */}
          <div className="dashboard-card recent-tickets-card">
            <div className="card-header">
              <h3>
                <Clock size={18} />
                Mis Tickets Recientes
              </h3>
              <Link to="/tickets?assignment=mine" className="btn btn-sm btn-secondary">
                Ver todos
              </Link>
            </div>
            <div className="card-body">
              {recentTickets.length === 0 ? (
                <div className="empty-card">
                  <Inbox size={48} />
                  <p>No tienes tickets asignados</p>
                  <Link to="/tickets?assignment=unassigned" className="btn btn-primary">
                    Ver tickets sin asignar
                  </Link>
                </div>
              ) : (
                <div className="tickets-table-wrapper">
                  <table className="tickets-table compact">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Título</th>
                        <th>Estado</th>
                        <th>Prioridad</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTickets.slice(0, 5).map((ticket) => {
                        const ticketId = ticket.id || ticket[2];
                        const ticketName = ticket.name || ticket[1];
                        const ticketStatus = ticket.status || ticket[12];
                        const ticketPriority = ticket.priority || ticket[3];
                        const ticketDate = ticket.date || ticket[15];

                        const status = getStatusInfo(ticketStatus);
                        const priority = getPriorityInfo(ticketPriority);
                        const StatusIcon = status.icon;

                        return (
                          <tr key={ticketId}>
                            <td>
                              <Link to={`/tickets/${ticketId}`} className="ticket-id">
                                #{ticketId}
                              </Link>
                            </td>
                            <td className="ticket-name">
                              <Link to={`/tickets/${ticketId}`}>{ticketName}</Link>
                            </td>
                            <td>
                              <span className={`badge ${status.class}`}>
                                <StatusIcon size={12} />
                                {status.label}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${priority.class}`}>
                                {priority.label}
                              </span>
                            </td>
                            <td className="ticket-date">
                              {ticketDate
                                ? new Date(ticketDate).toLocaleDateString('es-MX')
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Dashboard para Cliente */}
      {isClient && (
        <>
          {/* Acciones principales para cliente */}
          <div className="client-actions">
            <Link to="/tickets/new" className="client-action-card primary">
              <div className="action-icon">
                <TicketPlus size={40} />
              </div>
              <h3>Reportar Incidente</h3>
              <p>¿Tienes un problema? Crea un nuevo ticket de soporte</p>
            </Link>
            <Link to="/my-tickets" className="client-action-card">
              <div className="action-icon">
                <Ticket size={40} />
              </div>
              <h3>Mis Tickets</h3>
              <p>Consulta el estado de tus solicitudes de soporte</p>
            </Link>
          </div>

          {/* Tickets recientes del cliente */}
          {recentTickets.length > 0 && (
            <div className="dashboard-card">
              <div className="card-header">
                <h3>
                  <Clock size={18} />
                  Mis Tickets Recientes
                </h3>
                <Link to="/my-tickets" className="btn btn-sm btn-secondary">
                  Ver todos
                </Link>
              </div>
              <div className="card-body">
                <div className="client-tickets-list">
                  {recentTickets.slice(0, 5).map((ticket) => {
                    const ticketId = ticket.id || ticket[2];
                    const ticketName = ticket.name || ticket[1];
                    const ticketStatus = ticket.status || ticket[12];
                    const ticketDate = ticket.date || ticket[15];

                    const status = getStatusInfo(ticketStatus);
                    const StatusIcon = status.icon;

                    return (
                      <Link
                        to={`/tickets/${ticketId}`}
                        key={ticketId}
                        className="client-ticket-item"
                      >
                        <div className="ticket-main-info">
                          <span className="ticket-id">#{ticketId}</span>
                          <span className="ticket-title">{ticketName}</span>
                        </div>
                        <div className="ticket-meta-info">
                          <span className={`badge ${status.class}`}>
                            <StatusIcon size={12} />
                            {status.label}
                          </span>
                          <span className="ticket-date">
                            {ticketDate
                              ? new Date(ticketDate).toLocaleDateString('es-MX')
                              : '-'}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
