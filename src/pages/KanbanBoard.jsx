import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  RefreshCw,
  AlertTriangle,
  Inbox,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Calendar,
  ExternalLink,
  Filter,
  LayoutGrid,
} from 'lucide-react';

const STATUSES = [
  { id: 1, name: 'Nuevo', color: 'new', icon: AlertCircle },
  { id: 2, name: 'En Curso', color: 'assigned', icon: Clock },
  { id: 4, name: 'En Espera', color: 'waiting', icon: Clock },
  { id: 5, name: 'Resuelto', color: 'solved', icon: CheckCircle },
  { id: 6, name: 'Cerrado', color: 'closed', icon: XCircle },
];

export default function KanbanBoard() {
  const { user, isAdmin, isTechnician } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, mine, unassigned

  const userId = user?.glpiID;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (filter === 'mine' && userId) {
        result = await glpiApi.getTicketsAssignedToUser(userId, { range: '0-100' });
      } else if (filter === 'unassigned') {
        result = await glpiApi.getUnassignedTickets({ range: '0-100' });
      } else {
        result = await glpiApi.searchTicketsAdvanced({}, { range: '0-100' });
      }
      setTickets(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, userId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Agrupar tickets por estado
  const getTicketsByStatus = (statusId) => {
    return tickets.filter((ticket) => {
      const ticketStatus = ticket.status || ticket[12];
      return ticketStatus === statusId;
    });
  };

  const getPriorityClass = (priority) => {
    const priorityMap = {
      1: 'priority-verylow',
      2: 'priority-low',
      3: 'priority-medium',
      4: 'priority-high',
      5: 'priority-veryhigh',
      6: 'priority-major',
    };
    return priorityMap[priority] || 'priority-medium';
  };

  const canManage = isAdmin || isTechnician;

  return (
    <div className="kanban-page">
      {/* Header */}
      <div className="kanban-header">
        <div className="kanban-title">
          <LayoutGrid size={24} />
          <h1>Tablero Kanban</h1>
        </div>
        <div className="kanban-actions">
          {canManage && (
            <div className="kanban-filters">
              <Filter size={16} />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="kanban-filter-select"
              >
                <option value="all">Todos los Tickets</option>
                <option value="mine">Mis Asignados</option>
                <option value="unassigned">Sin Asignar</option>
              </select>
            </div>
          )}
          <button
            onClick={fetchTickets}
            className="btn btn-icon"
            title="Actualizar"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Kanban Board */}
      <div className="kanban-board">
        {STATUSES.map((status) => {
          const statusTickets = getTicketsByStatus(status.id);
          const StatusIcon = status.icon;

          return (
            <div key={status.id} className={`kanban-column kanban-${status.color}`}>
              <div className="kanban-column-header">
                <div className="column-title">
                  <StatusIcon size={16} />
                  <span>{status.name}</span>
                </div>
                <span className="column-count">{statusTickets.length}</span>
              </div>
              <div className="kanban-column-body">
                {statusTickets.length === 0 ? (
                  <div className="kanban-empty">
                    <Inbox size={24} />
                    <span>Sin tickets</span>
                  </div>
                ) : (
                  statusTickets.map((ticket) => {
                    const ticketId = ticket.id || ticket[2];
                    const ticketName = ticket.name || ticket[1];
                    const ticketPriority = ticket.priority || ticket[3];
                    const ticketDate = ticket.date || ticket[15];

                    return (
                      <Link
                        to={`/tickets/${ticketId}`}
                        key={ticketId}
                        className={`kanban-card ${getPriorityClass(ticketPriority)}`}
                      >
                        <div className="kanban-card-header">
                          <span className="kanban-card-id">#{ticketId}</span>
                          <span
                            className={`priority-indicator ${getPriorityClass(ticketPriority)}`}
                          />
                        </div>
                        <h4 className="kanban-card-title">{ticketName}</h4>
                        <div className="kanban-card-footer">
                          <span className="kanban-card-date">
                            <Calendar size={12} />
                            {ticketDate
                              ? new Date(ticketDate).toLocaleDateString('es-MX')
                              : '-'}
                          </span>
                          <ExternalLink size={14} className="kanban-card-link" />
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
