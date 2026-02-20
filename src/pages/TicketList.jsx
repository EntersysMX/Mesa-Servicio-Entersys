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
  Timer,
  AlertTriangle,
  FileSpreadsheet,
  Monitor,
  Mail,
  Smartphone,
  Globe,
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
  const [originFilter, setOriginFilter] = useState(
    searchParams.get('origin') || 'all'
  );
  const [technicianFilter, setTechnicianFilter] = useState(
    searchParams.get('technician') || 'all'
  );

  // Por defecto mostrar tickets de los últimos 7 días
  const getDefaultDateFrom = () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  };

  const [dateFromFilter, setDateFromFilter] = useState(
    searchParams.get('dateFrom') || getDefaultDateFrom()
  );
  const [dateToFilter, setDateToFilter] = useState(
    searchParams.get('dateTo') || ''
  );
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get('search') || ''
  );
  const [searchById, setSearchById] = useState('');
  const [searchByIdError, setSearchByIdError] = useState('');
  const [searchBySSId, setSearchBySSId] = useState('');
  const [searchBySSIdError, setSearchBySSIdError] = useState('');

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
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [groupTechniciansMap, setGroupTechniciansMap] = useState({});

  // Cache de asignaciones de tickets
  const [ticketAssignments, setTicketAssignments] = useState({});

  // Modal de asignación rápida
  const [showQuickAssign, setShowQuickAssign] = useState(null);
  const [quickAssignTech, setQuickAssignTech] = useState('');
  const [quickAssignGroup, setQuickAssignGroup] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [filteredTechnicians, setFilteredTechnicians] = useState([]);

  const userId = user?.glpiID;

  // Sincronizar filtros con URL cuando cambian los searchParams
  useEffect(() => {
    const assignment = searchParams.get('assignment') || 'all';
    const status = searchParams.get('status') || 'all';
    const priority = searchParams.get('priority') || 'all';
    const origin = searchParams.get('origin') || 'all';
    const technician = searchParams.get('technician') || 'all';
    const dateFrom = searchParams.get('dateFrom') || getDefaultDateFrom();
    const dateTo = searchParams.get('dateTo') || '';
    const search = searchParams.get('search') || '';
    const pageNum = parseInt(searchParams.get('page')) || 0;

    setAssignmentFilter(assignment);
    setStatusFilter(status);
    setPriorityFilter(priority);
    setOriginFilter(origin);
    setTechnicianFilter(technician);
    setDateFromFilter(dateFrom);
    setDateToFilter(dateTo);
    setSearchTerm(search);
    setPage(pageNum);
  }, [searchParams]);

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
          const [techData, groupData, groupMapData] = await Promise.all([
            glpiApi.getTechnicians().catch(() => []),
            glpiApi.getGroups().catch(() => []),
            glpiApi.getGroupTechniciansMap().catch(() => ({})),
          ]);
          const techList = Array.isArray(techData) ? techData : [];
          setTechnicians(techList);
          setAllTechnicians(techList);
          setFilteredTechnicians(techList);
          setGroups(Array.isArray(groupData) ? groupData : []);
          setGroupTechniciansMap(groupMapData || {});
        } catch (err) {
          console.error('Error loading aux data:', err);
        }
      }
    };
    loadAuxData();
  }, [isAdmin, isTechnician]);

  // Estado para controlar carga de asignaciones
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Cargar asignaciones de tickets - OPTIMIZADO: carga en lotes pequeños y en background
  useEffect(() => {
    const loadAssignments = async () => {
      if (tickets.length === 0) return;

      setLoadingAssignments(true);
      const assignments = {};

      // Cargar en lotes de 5 para no saturar
      const batchSize = 5;
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (ticket) => {
            const ticketId = ticket.id || ticket[2];
            try {
              const assignees = await glpiApi.getTicketAssignees(ticketId);
              const assignedUser = assignees.users.find(u => u.type === 2);
              const assignedGroup = assignees.groups.find(g => g.type === 2);

              if (assignedUser || assignedGroup) {
                let techName = null;
                if (assignedUser?.users_id) {
                  const tech = technicians.find(t => Number(t.id) === Number(assignedUser.users_id));
                  techName = tech ? (tech.realname ? `${tech.realname} ${tech.firstname || ''}`.trim() : tech.name) : `ID:${assignedUser.users_id}`;
                }

                let groupName = null;
                if (assignedGroup?.groups_id) {
                  const grp = groups.find(g => Number(g.id) === Number(assignedGroup.groups_id));
                  groupName = grp?.name || `Grupo #${assignedGroup.groups_id}`;
                }

                assignments[ticketId] = {
                  userId: assignedUser?.users_id,
                  userName: techName,
                  userAssignmentId: assignedUser?.id,
                  groupId: assignedGroup?.groups_id,
                  groupName: groupName,
                  groupAssignmentId: assignedGroup?.id,
                };
              }
            } catch (e) {
              // Ignorar errores individuales
            }
          })
        );

        // Actualizar parcialmente mientras carga
        setTicketAssignments(prev => ({ ...prev, ...assignments }));
      }

      setLoadingAssignments(false);
    };

    if (technicians.length > 0 || groups.length > 0) {
      loadAssignments();
    }
  }, [tickets, technicians, groups]);

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

      // Aplicar filtro de origen
      if (originFilter !== 'all') {
        if (originFilter === 'Smartsheet') {
          // Smartsheet se busca por [SS- en el título
          filters.searchText = '[SS-';
        } else {
          // Otros orígenes se buscan por [ORIGEN:xxx] en el contenido
          filters.searchContent = `[ORIGEN:${originFilter}]`;
        }
      }

      // Aplicar filtro de técnico asignado
      if (technicianFilter !== 'all') {
        filters.assignedTo = parseInt(technicianFilter, 10);
      }

      // Aplicar filtro de fechas
      if (dateFromFilter) {
        filters.dateFrom = dateFromFilter;
      }
      if (dateToFilter) {
        filters.dateTo = dateToFilter;
      }

      // Aplicar búsqueda de texto (se suma al filtro de origen si existe)
      if (searchTerm.trim()) {
        if (filters.searchText) {
          filters.searchText += ` ${searchTerm.trim()}`;
        } else {
          filters.searchText = searchTerm.trim();
        }
      }

      const result = await glpiApi.searchTicketsAdvanced(filters, { range });

      let ticketData = result.data || [];

      // Ordenar por fecha descendente (más reciente primero) como fallback
      ticketData.sort((a, b) => {
        const dateA = new Date(a.date || a[15] || 0);
        const dateB = new Date(b.date || b[15] || 0);
        return dateB - dateA;
      });

      setTickets(ticketData);
      setTotalCount(result.totalcount || ticketData.length);
    } catch (err) {
      setError(err.message);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [page, assignmentFilter, statusFilter, priorityFilter, originFilter, technicianFilter, dateFromFilter, dateToFilter, searchTerm, userId]);

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
    if (originFilter !== 'all') params.set('origin', originFilter);
    if (technicianFilter !== 'all') params.set('technician', technicianFilter);
    if (dateFromFilter) params.set('dateFrom', dateFromFilter);
    if (dateToFilter) params.set('dateTo', dateToFilter);
    if (searchTerm) params.set('search', searchTerm);
    if (page > 0) params.set('page', page.toString());
    setSearchParams(params, { replace: true });
  }, [assignmentFilter, statusFilter, priorityFilter, originFilter, technicianFilter, dateFromFilter, dateToFilter, searchTerm, page, setSearchParams]);

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

  // Búsqueda por ID de Smartsheet
  const handleSearchBySSId = async (e) => {
    e.preventDefault();
    setSearchBySSIdError('');

    const ssId = searchBySSId.trim().replace('SS-', '').replace('ss-', '');

    if (!ssId || isNaN(ssId)) {
      setSearchBySSIdError('Ingresa un ID válido');
      return;
    }

    // Buscar ticket que contenga [SS-XXX] en el título
    setOriginFilter('all');
    setSearchTerm(`[SS-${ssId}]`);
    setPage(0);
  };

  const handleFilterChange = (filterType, value) => {
    setPage(0);
    if (filterType === 'assignment') setAssignmentFilter(value);
    if (filterType === 'status') setStatusFilter(value);
    if (filterType === 'priority') setPriorityFilter(value);
    if (filterType === 'origin') setOriginFilter(value);
    if (filterType === 'technician') setTechnicianFilter(value);
    if (filterType === 'dateFrom') setDateFromFilter(value);
    if (filterType === 'dateTo') setDateToFilter(value);
  };

  const clearFilters = () => {
    setAssignmentFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setOriginFilter('all');
    setTechnicianFilter('all');
    setDateFromFilter('');
    setDateToFilter('');
    setSearchTerm('');
    setPage(0);
  };

  // Filtrar técnicos cuando cambia el grupo en el modal
  const handleQuickGroupChange = (groupId) => {
    setQuickAssignGroup(groupId);
    setQuickAssignTech(''); // Reset técnico

    if (groupId && groupTechniciansMap[groupId]) {
      const techIds = groupTechniciansMap[groupId];
      const filtered = allTechnicians.filter(t => techIds.includes(Number(t.id)));
      setFilteredTechnicians(filtered);
    } else {
      setFilteredTechnicians(allTechnicians);
    }
  };

  const handleQuickAssign = async (ticketId) => {
    if (!quickAssignTech && !quickAssignGroup) {
      setError('Selecciona un técnico o grupo');
      return;
    }

    setAssigning(true);
    try {
      // Verificar asignaciones existentes
      const currentAssignment = ticketAssignments[ticketId];

      // Si hay técnico nuevo y ya existía uno, primero eliminar el anterior
      if (quickAssignTech) {
        if (currentAssignment?.userAssignmentId) {
          await glpiApi.removeTicketUserAssignment(currentAssignment.userAssignmentId).catch(() => {});
        }
        await glpiApi.assignTicketToUser(ticketId, parseInt(quickAssignTech, 10));
      }

      // Si hay grupo nuevo y ya existía uno, primero eliminar el anterior
      if (quickAssignGroup) {
        if (currentAssignment?.groupAssignmentId) {
          await glpiApi.removeTicketGroupAssignment(currentAssignment.groupAssignmentId).catch(() => {});
        }
        await glpiApi.assignTicketToGroup(ticketId, parseInt(quickAssignGroup, 10));
      }

      setShowQuickAssign(null);
      setQuickAssignTech('');
      setQuickAssignGroup('');
      setFilteredTechnicians(allTechnicians);
      fetchTickets();
      fetchStats();
    } catch (err) {
      setError('Error al asignar: ' + err.message);
    } finally {
      setAssigning(false);
    }
  };

  // Al abrir el modal, precargar asignaciones existentes
  const openQuickAssign = (ticketId) => {
    const current = ticketAssignments[ticketId];
    if (current) {
      setQuickAssignGroup(current.groupId?.toString() || '');
      setQuickAssignTech(current.userId?.toString() || '');
      // Filtrar técnicos si hay grupo
      if (current.groupId && groupTechniciansMap[current.groupId]) {
        const techIds = groupTechniciansMap[current.groupId];
        const filtered = allTechnicians.filter(t => techIds.includes(Number(t.id)));
        setFilteredTechnicians(filtered);
      } else {
        setFilteredTechnicians(allTechnicians);
      }
    } else {
      setQuickAssignGroup('');
      setQuickAssignTech('');
      setFilteredTechnicians(allTechnicians);
    }
    setShowQuickAssign(ticketId);
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

  // Detectar origen del ticket - Smartsheet se detecta por [SS-XXX], los demás por el contenido
  const getTicketOrigin = (ticketName, ticketContent) => {
    // Los tickets de Smartsheet tienen [SS-XXXX] en el nombre
    if (ticketName && ticketName.includes('[SS-')) {
      return { label: 'Smartsheet', class: 'origin-smartsheet', icon: FileSpreadsheet };
    }
    // Para otros orígenes, verificar el contenido si está disponible
    if (ticketContent) {
      if (ticketContent.includes('[ORIGEN:Portal]')) {
        return { label: 'Portal', class: 'origin-portal', icon: Monitor };
      }
      if (ticketContent.includes('[ORIGEN:Correo]')) {
        return { label: 'Correo', class: 'origin-email', icon: Mail };
      }
      if (ticketContent.includes('[ORIGEN:WhatsApp]')) {
        return { label: 'WhatsApp', class: 'origin-whatsapp', icon: Smartphone };
      }
    }
    return null;
  };

  // Extraer ID de Smartsheet del título
  const getSmartsheetId = (ticketName) => {
    if (!ticketName) return null;
    const match = ticketName.match(/\[SS-(\d+)\]/);
    return match ? match[1] : null;
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const hasActiveFilters =
    assignmentFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    originFilter !== 'all' ||
    technicianFilter !== 'all' ||
    dateFromFilter !== '' ||
    dateToFilter !== '' ||
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

          {/* Búsqueda por ID Smartsheet */}
          <form onSubmit={handleSearchBySSId} className="search-by-id-form">
            <div className={`search-input-wrapper small ${searchBySSIdError ? 'error' : ''}`}>
              <FileSpreadsheet size={16} />
              <input
                type="text"
                placeholder="ID SS..."
                value={searchBySSId}
                onChange={(e) => {
                  setSearchBySSId(e.target.value);
                  setSearchBySSIdError('');
                }}
                style={{ width: '80px' }}
              />
              {searchBySSId && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => {
                    setSearchBySSId('');
                    setSearchBySSIdError('');
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-sm btn-secondary">
              Buscar
            </button>
            {searchBySSIdError && (
              <span className="search-error">{searchBySSIdError}</span>
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

          <div className="filter-group">
            <label>
              <Globe size={14} />
              Origen:
            </label>
            <select
              value={originFilter}
              onChange={(e) => handleFilterChange('origin', e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="Smartsheet">Smartsheet</option>
              <option value="Portal">Portal</option>
              <option value="Correo">Correo</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
          </div>

          {(isAdmin || isTechnician) && (
            <div className="filter-group">
              <label>
                <User size={14} />
                Técnico:
              </label>
              <select
                value={technicianFilter}
                onChange={(e) => handleFilterChange('technician', e.target.value)}
              >
                <option value="all">Todos</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.realname || tech.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group filter-dates">
            <label>
              <Clock size={14} />
              Desde:
            </label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="date-input"
            />
          </div>

          <div className="filter-group filter-dates">
            <label>Hasta:</label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="date-input"
            />
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
                  <th>ID SS</th>
                  <th>Título</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>SLA</th>
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
                  const timeToResolve = ticket.time_to_resolve;

                  const status = getStatusLabel(ticketStatus);
                  const priority = getPriorityLabel(ticketPriority);

                  // Calcular estado SLA
                  const getSLAStatus = () => {
                    // Si está cerrado o resuelto, no mostrar SLA
                    if (ticketStatus >= 5) return { status: 'done', label: 'Cerrado', class: '' };
                    if (!timeToResolve) return { status: 'none', label: '-', class: '' };

                    const now = new Date();
                    const target = new Date(timeToResolve);
                    const diffMs = target - now;
                    const diffHours = diffMs / (1000 * 60 * 60);

                    if (diffMs < 0) {
                      return { status: 'breached', label: 'Vencido', class: 'sla-breached', icon: AlertTriangle };
                    } else if (diffHours <= 2) {
                      return { status: 'critical', label: `${Math.round(diffHours * 60)}m`, class: 'sla-risk', icon: AlertTriangle };
                    } else if (diffHours <= 8) {
                      return { status: 'warning', label: `${Math.round(diffHours)}h`, class: 'sla-risk', icon: Timer };
                    } else {
                      const days = Math.floor(diffHours / 24);
                      const hours = Math.round(diffHours % 24);
                      return {
                        status: 'ok',
                        label: days > 0 ? `${days}d ${hours}h` : `${hours}h`,
                        class: 'sla-ok',
                        icon: Timer
                      };
                    }
                  };
                  const slaStatus = getSLAStatus();
                  const StatusIcon = status.icon;
                  const ticketContent = ticket.content || ticket[21] || '';
                  const origin = getTicketOrigin(ticketName, ticketContent);
                  const smartsheetId = getSmartsheetId(ticketName);

                  return (
                    <tr key={ticketId} className={ticketStatus === 1 ? 'ticket-row-new' : ''}>
                      <td className="ticket-id">#{ticketId}</td>
                      <td className="ticket-ss-id">
                        {smartsheetId ? (
                          <span className="ss-id-badge">SS-{smartsheetId}</span>
                        ) : (
                          <span className="ss-id-na">N/A</span>
                        )}
                      </td>
                      <td className="ticket-name">
                        <Link to={`/tickets/${ticketId}`}>{ticketName}</Link>
                      </td>
                      <td className="ticket-origin">
                        {origin ? (
                          <span className={`badge ${origin.class}`}>
                            <origin.icon size={12} />
                            {origin.label}
                          </span>
                        ) : (
                          <span className="origin-unknown">-</span>
                        )}
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
                      <td className="ticket-sla">
                        {slaStatus.class ? (
                          <span className={`sla-indicator ${slaStatus.class}`}>
                            {slaStatus.icon && <slaStatus.icon size={12} />}
                            {slaStatus.label}
                          </span>
                        ) : (
                          <span className="sla-none">{slaStatus.label}</span>
                        )}
                      </td>
                      <td className="ticket-assigned">
                        {ticketAssignments[ticketId]?.userName ? (
                          <span className="assigned-user" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={14} />
                            {ticketAssignments[ticketId].userName}
                            {(isAdmin || isTechnician) && (
                              <button
                                className="btn-quick-assign"
                                onClick={() => openQuickAssign(ticketId)}
                                title="Cambiar asignación"
                                style={{ marginLeft: '4px' }}
                              >
                                <UserPlus size={12} />
                              </button>
                            )}
                          </span>
                        ) : ticketAssignments[ticketId]?.groupName ? (
                          <span className="assigned-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={14} />
                            {ticketAssignments[ticketId].groupName}
                            {(isAdmin || isTechnician) && (
                              <button
                                className="btn-quick-assign"
                                onClick={() => openQuickAssign(ticketId)}
                                title="Cambiar asignación"
                                style={{ marginLeft: '4px' }}
                              >
                                <UserPlus size={12} />
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="unassigned">
                            Sin asignar
                            {(isAdmin || isTechnician) && (
                              <button
                                className="btn-quick-assign"
                                onClick={() => openQuickAssign(ticketId)}
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
                            onClick={() => openQuickAssign(ticketId)}
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
              {/* Grupo primero */}
              <div className="form-group">
                <label>
                  <Users size={16} />
                  Grupo
                </label>
                <select
                  value={quickAssignGroup}
                  onChange={(e) => handleQuickGroupChange(e.target.value)}
                >
                  <option value="">-- Seleccionar grupo --</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.completename || group.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Técnico después */}
              <div className="form-group">
                <label>
                  <User size={16} />
                  Técnico
                  {quickAssignGroup && filteredTechnicians.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#666', marginLeft: 8 }}>
                      ({filteredTechnicians.length} del grupo)
                    </span>
                  )}
                </label>
                <select
                  value={quickAssignTech}
                  onChange={(e) => setQuickAssignTech(e.target.value)}
                >
                  <option value="">
                    {quickAssignGroup
                      ? filteredTechnicians.length > 0
                        ? '-- Seleccionar técnico del grupo --'
                        : '-- No hay técnicos en este grupo --'
                      : '-- Seleccionar técnico --'}
                  </option>
                  {filteredTechnicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.realname ? `${tech.realname} ${tech.firstname || ''}`.trim() : tech.name}
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
