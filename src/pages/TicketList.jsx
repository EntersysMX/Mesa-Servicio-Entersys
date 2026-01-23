import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  ArrowLeft,
  TicketPlus,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Inbox,
  AlertCircle,
  Clock,
  CheckCircle,
  UserPlus,
  X,
  Hash,
} from 'lucide-react';

export default function TicketList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, isTechnician } = useAuth();

  // Estados principales
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [assignmentFilter, setAssignmentFilter] = useState(
    searchParams.get('assignment') || 'all'
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get('status') || 'all'
  );
  const [priorityFilter, setPriorityFilter] = useState(
    searchParams.get('priority') || 'all'
  );
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get('search') || ''
  );
  const [searchById, setSearchById] = useState('');
  const [searchByIdError, setSearchByIdError] = useState('');

  // Paginación
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  // Stats rápidas (se cargan independientemente de los filtros)
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    myAssigned: 0,
    unassigned: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Datos auxiliares
  const [technicians, setTechnicians] = useState([]);
  const [groups, setGroups] = useState([]);

  // Modal de asignación rápida
  const [showQuickAssign, setShowQuickAssign] = useState(null);
  const [quickAssignTech, setQuickAssignTech] = useState('');
  const [quickAssignGroup, setQuickAssignGroup] = useState('');
  const [assigning, setAssigning] = useState(false);

  const userId = user?.glpiID;

  // Cargar estadísticas independientes (no cambian con filtros)
  const fetchStats = useCallback(async () => {
    if (!userId) return;

    setLoadingStats(true);
    try {
      // Obtener conteos reales desde la API
      const [allTickets, myAssigned, unassigned, newTickets] = await Promise.all([
        glpiApi.searchTicketsAdvanced({}, { range: '0-0' }).catch(() => ({ totalcount: 0 })),
        glpiApi.searchTicketsAdvanced({ assignedTo: userId }, { range: '0-0' }).catch(() => ({ totalcount: 0 })),
        glpiApi.searchTicketsAdvanced({ unassigned: true }, { range: '0-0' }).catch(() => ({ totalcount: 0 })),
        glpiApi.searchTicketsAdvanced({ status: '1' }, { range: '0-0' }).catch(() => ({ totalcount: 0 })),
      ]);

      setStats({
        total: allTickets.totalcount || 0,
        myAssigned: myAssigned.totalcount || 0,
        unassigned: unassigned.totalcount || 0,
        new: newTickets.totalcount || 0,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [userId]);

  // Cargar datos auxiliares
  useEffect(() => {
    const loadAuxData = async () => {
      if (isAdmin || isTechnician) {
        try {
          const [techData, groupData] = await Promise.all([
            glpiApi.getTechnicians().catch(() => []),
            glpiApi.getGroups().catch(() => []),
          ]);
          setTechnicians(Array.isArray(techData) ? techData : []);
          setGroups(Array.isArray(groupData) ? groupData : []);
        } catch (err) {
          console.error('Error loading aux data:', err);
        }
      }
    };
    loadAuxData();
  }, [isAdmin, isTechnician]);

  // Función principal de búsqueda
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filters = {};
      const range = `${page * pageSize}-${(page + 1) * pageSize - 1}`;

      // Aplicar filtro de asignación
      if (assignmentFilter === 'mine' && userId) {
        filters.assignedTo = userId;
      } else if (assignmentFilter === 'unassigned') {
        filters.unassigned = true;
      }

      // Aplicar filtro de estado
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      // Aplicar filtro de prioridad
      if (priorityFilter !== 'all') {
        filters.priority = priorityFilter;
      }

      // Aplicar búsqueda de texto
      if (searchTerm.trim()) {
        filters.searchText = searchTerm.trim();
      }

      const result = await glpiApi.searchTicketsAdvanced(filters, { range });

      const ticketData = result.data || [];
      setTickets(ticketData);
      setTotalCount(result.totalcount || ticketData.length);
    } catch (err) {
      setError(err.message);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [page, assignmentFilter, statusFilter, priorityFilter, searchTerm, userId]);

  // Efecto para cargar tickets
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Efecto para cargar estadísticas (solo al montar y al refrescar)
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Actualizar URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (assignmentFilter !== 'all') params.set('assignment', assignmentFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (searchTerm) params.set('search', searchTerm);
    if (page > 0) params.set('page', page.toString());
    setSearchParams(params, { replace: true });
  }, [assignmentFilter, statusFilter, priorityFilter, searchTerm, page, setSearchParams]);

  // Handlers
  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchTickets();
  };

  // Búsqueda por ID
  const handleSearchById = async (e) => {
    e.preventDefault();
    setSearchByIdError('');

    const ticketId = searchById.trim().replace('#', '');

    if (!ticketId || isNaN(ticketId)) {
      setSearchByIdError('Ingresa un ID válido');
      return;
    }

    try {
      // Verificar si el ticket existe
      const ticket = await glpiApi.getTicket(ticketId);
      if (ticket && ticket.id) {
        navigate(`/tickets/${ticketId}`);
      } else {
        setSearchByIdError(`Ticket #${ticketId} no encontrado`);
      }
    } catch (err) {
      setSearchByIdError(`Ticket #${ticketId} no encontrado`);
    }
  };

  const handleFilterChange = (filterType, value) => {
    setPage(0);
    if (filterType === 'assignment') setAssignmentFilter(value);
    if (filterType === 'status') setStatusFilter(value);
    if (filterType === 'priority') setPriorityFilter(value);
  };

  const clearFilters = () => {
    setAssignmentFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setSearchTerm('');
    setPage(0);
  };

  const handleQuickAssign = async (ticketId) => {
    if (!quickAssignTech && !quickAssignGroup) {
      setError('Selecciona un técnico o grupo');
      return;
    }

    setAssigning(true);
    try {
      if (quickAssignTech) {
        await glpiApi.assignTicketToUser(ticketId, parseInt(quickAssignTech, 10));
      }
      if (quickAssignGroup) {
        await glpiApi.assignTicketToGroup(ticketId, parseInt(quickAssignGroup, 10));
      }
      setShowQuickAssign(null);
      setQuickAssignTech('');
      setQuickAssignGroup('');
      fetchTickets();
      fetchStats(); // Actualizar estadísticas
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // Helpers de presentación
  const getStatusLabel = (status) => {
    const statusMap = {
      1: { label: 'Nuevo', class: 'status-new', icon: AlertCircle },
      2: { label: 'Asignado', class: 'status-assigned', icon: Clock },
      3: { label: 'Planificado', class: 'status-planned', icon: Clock },
      4: { label: 'En espera', class: 'status-waiting', icon: Clock },
      5: { label: 'Resuelto', class: 'status-solved', icon: CheckCircle },
      6: { label: 'Cerrado', class: 'status-closed', icon: CheckCircle },
    };
    return statusMap[status] || { label: 'Desconocido', class: 'status-unknown', icon: AlertCircle };
  };

  const getPriorityLabel = (priority) => {
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

  const totalPages = Math.ceil(totalCount / pageSize);
  const hasActiveFilters =
    assignmentFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    searchTerm !== '';

  return (
    <div className="page-container ticket-management">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => navigate('/')} className="btn btn-icon">
            <ArrowLeft size={18} />
          </button>
          <h1>Gestión de Tickets</h1>
        </div>
        <div className="header-actions">
          <button
            onClick={() => { fetchTickets(); fetchStats(); }}
            className="btn btn-icon"
            title="Actualizar"
          >
            <RefreshCw size={18} className={loading || loadingStats ? 'spinning' : ''} />
          </button>
          <Link to="/tickets/new" className="btn btn-primary">
            <TicketPlus size={18} />
            Nuevo Ticket
          </Link>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="ticket-stats-bar">
        <div
          className={`stat-mini ${assignmentFilter === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('assignment', 'all')}
        >
          <Inbox size={20} />
          <div className="stat-mini-content">
            <span className="stat-mini-value">{loadingStats ? '...' : stats.total}</span>
            <span className="stat-mini-label">Todos</span>
          </div>
        </div>
        {(isAdmin || isTechnician) && (
          <>
            <div
              className={`stat-mini stat-mine ${assignmentFilter === 'mine' ? 'active' : ''}`}
              onClick={() => handleFilterChange('assignment', 'mine')}
            >
              <User size={20} />
              <div className="stat-mini-content">
                <span className="stat-mini-value">{loadingStats ? '...' : stats.myAssigned}</span>
                <span className="stat-mini-label">Mis Asignados</span>
              </div>
            </div>
            <div
              className={`stat-mini stat-unassigned ${assignmentFilter === 'unassigned' ? 'active' : ''}`}
              onClick={() => handleFilterChange('assignment', 'unassigned')}
            >
              <AlertCircle size={20} />
              <div className="stat-mini-content">
                <span className="stat-mini-value">{loadingStats ? '...' : stats.unassigned}</span>
                <span className="stat-mini-label">Sin Asignar</span>
              </div>
            </div>
          </>
        )}
        <div
          className={`stat-mini stat-new ${statusFilter === '1' ? 'active' : ''}`}
          onClick={() => handleFilterChange('status', '1')}
        >
          <AlertCircle size={20} />
          <div className="stat-mini-content">
            <span className="stat-mini-value">{loadingStats ? '...' : stats.new}</span>
            <span className="stat-mini-label">Nuevos</span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="search-row">
          {/* Búsqueda por ID */}
          <form onSubmit={handleSearchById} className="search-by-id-form">
            <div className={`search-input-wrapper small ${searchByIdError ? 'error' : ''}`}>
              <Hash size={16} />
              <input
                type="text"
                placeholder="Buscar por ID..."
                value={searchById}
                onChange={(e) => {
                  setSearchById(e.target.value);
                  setSearchByIdError('');
                }}
                style={{ width: '100px' }}
              />
              {searchById && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => {
                    setSearchById('');
                    setSearchByIdError('');
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-sm btn-primary">
              Ir
            </button>
            {searchByIdError && (
              <span className="search-error">{searchByIdError}</span>
            )}
          </form>

          {/* Búsqueda por título */}
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-input-wrapper">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar por título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-secondary">
              Buscar
            </button>
          </form>
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <Filter size={16} />
            <label>Estado:</label>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="1">Nuevo</option>
              <option value="2">Asignado</option>
              <option value="3">Planificado</option>
              <option value="4">En espera</option>
              <option value="5">Resuelto</option>
              <option value="6">Cerrado</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Prioridad:</label>
            <select
              value={priorityFilter}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="5">Muy alta</option>
              <option value="4">Alta</option>
              <option value="3">Media</option>
              <option value="2">Baja</option>
              <option value="1">Muy baja</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-sm btn-secondary">
              <X size={14} />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          {error}
          <button onClick={() => setError(null)} className="alert-close">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabla de Tickets */}
      {loading ? (
        <div className="loading">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <Inbox size={64} />
          <h3>No se encontraron tickets</h3>
          <p>
            {hasActiveFilters
              ? 'Intenta ajustar los filtros de búsqueda'
              : 'Aún no hay tickets en el sistema'}
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-secondary">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="tickets-count">
            Mostrando {tickets.length} de {totalCount} tickets
          </div>

          <div className="tickets-table-wrapper">
            <table className="tickets-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>Asignado a</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const ticketId = ticket.id || ticket[2];
                  const ticketName = ticket.name || ticket[1];
                  const ticketStatus = ticket.status || ticket[12];
                  const ticketPriority = ticket.priority || ticket[3];
                  const ticketDate = ticket.date || ticket[15];
                  const assignedUser = ticket[5] || ticket.users_id_assign || null;
                  const assignedUserName = ticket[83] || null;

                  const status = getStatusLabel(ticketStatus);
                  const priority = getPriorityLabel(ticketPriority);
                  const StatusIcon = status.icon;

                  return (
                    <tr key={ticketId} className={ticketStatus === 1 ? 'ticket-row-new' : ''}>
                      <td className="ticket-id">#{ticketId}</td>
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
                      <td className="ticket-assigned">
                        {assignedUser && assignedUser !== 0 ? (
                          <span className="assigned-user">
                            <User size={14} />
                            {assignedUserName || `Usuario #${assignedUser}`}
                          </span>
                        ) : (
                          <span className="unassigned">
                            Sin asignar
                            {(isAdmin || isTechnician) && (
                              <button
                                className="btn-quick-assign"
                                onClick={() => setShowQuickAssign(ticketId)}
                                title="Asignar"
                              >
                                <UserPlus size={14} />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="ticket-date">
                        {ticketDate
                          ? new Date(ticketDate).toLocaleDateString('es-MX')
                          : '-'}
                      </td>
                      <td className="ticket-actions">
                        <Link
                          to={`/tickets/${ticketId}`}
                          className="btn btn-sm btn-secondary"
                        >
                          Ver
                        </Link>
                        {(isAdmin || isTechnician) && (
                          <button
                            className="btn btn-sm btn-icon"
                            onClick={() => setShowQuickAssign(ticketId)}
                            title="Asignar"
                          >
                            <UserPlus size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-icon"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="pagination-info">
                Página {page + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-icon"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal de asignación rápida */}
      {showQuickAssign && (
        <div className="modal-overlay" onClick={() => setShowQuickAssign(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <UserPlus size={20} />
                Asignar Ticket #{showQuickAssign}
              </h3>
              <button
                className="btn btn-icon"
                onClick={() => setShowQuickAssign(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  <User size={16} />
                  Técnico
                </label>
                <select
                  value={quickAssignTech}
                  onChange={(e) => setQuickAssignTech(e.target.value)}
                >
                  <option value="">-- Seleccionar técnico --</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} {tech.realname ? `(${tech.realname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>
                  <Users size={16} />
                  Grupo
                </label>
                <select
                  value={quickAssignGroup}
                  onChange={(e) => setQuickAssignGroup(e.target.value)}
                >
                  <option value="">-- Seleccionar grupo --</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowQuickAssign(null)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleQuickAssign(showQuickAssign)}
                disabled={assigning || (!quickAssignTech && !quickAssignGroup)}
              >
                {assigning ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
