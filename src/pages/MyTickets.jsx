import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  TicketPlus,
  RefreshCw,
  Inbox,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  X,
} from 'lucide-react';

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, open, closed
  const [searchTerm, setSearchTerm] = useState('');

  const userId = user?.glpiID;

  const fetchTickets = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Buscar tickets donde el usuario es el solicitante (field 4)
      const result = await glpiApi.getTicketsCreatedByUser(userId, {
        range: '0-100',
      });

      const ticketData = result.data || [];
      setTickets(ticketData);
    } catch (err) {
      setError(err.message);
      // Fallback: obtener todos los tickets y filtrar en cliente
      try {
        const allTickets = await glpiApi.getTickets({ range: '0-100' });
        const myTickets = (allTickets || []).filter(
          (t) => t.users_id_recipient === userId || t[4] === userId
        );
        setTickets(myTickets);
      } catch (fallbackErr) {
        setTickets([]);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const getStatusLabel = (status) => {
    const statusMap = {
      1: { label: 'Nuevo', class: 'status-new', icon: AlertCircle },
      2: { label: 'En curso', class: 'status-assigned', icon: Clock },
      3: { label: 'Planificado', class: 'status-planned', icon: Clock },
      4: { label: 'En espera', class: 'status-waiting', icon: Clock },
      5: { label: 'Resuelto', class: 'status-solved', icon: CheckCircle },
      6: { label: 'Cerrado', class: 'status-closed', icon: CheckCircle },
    };
    return statusMap[status] || { label: 'Desconocido', class: 'status-unknown', icon: AlertCircle };
  };

  // Filtrar tickets
  const filteredTickets = tickets.filter((ticket) => {
    const ticketStatus = ticket.status || ticket[12];
    const ticketName = (ticket.name || ticket[1] || '').toLowerCase();

    // Filtro por estado
    if (filter === 'open' && ticketStatus >= 5) return false;
    if (filter === 'closed' && ticketStatus < 5) return false;

    // Filtro por búsqueda
    if (searchTerm && !ticketName.includes(searchTerm.toLowerCase())) {
      return false;
    }

    return true;
  });

  const openCount = tickets.filter((t) => {
    const status = t.status || t[12];
    return status < 5;
  }).length;

  const closedCount = tickets.filter((t) => {
    const status = t.status || t[12];
    return status >= 5;
  }).length;

  return (
    <div className="my-tickets-page">
      <div className="page-title">
        <h1>Mis Tickets</h1>
        <p>Consulta el estado de tus solicitudes de soporte</p>
      </div>

      {/* Resumen */}
      <div className="tickets-summary">
        <div
          className={`summary-card ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <Inbox size={24} />
          <div>
            <span className="summary-value">{tickets.length}</span>
            <span className="summary-label">Total</span>
          </div>
        </div>
        <div
          className={`summary-card open ${filter === 'open' ? 'active' : ''}`}
          onClick={() => setFilter('open')}
        >
          <Clock size={24} />
          <div>
            <span className="summary-value">{openCount}</span>
            <span className="summary-label">Abiertos</span>
          </div>
        </div>
        <div
          className={`summary-card closed ${filter === 'closed' ? 'active' : ''}`}
          onClick={() => setFilter('closed')}
        >
          <CheckCircle size={24} />
          <div>
            <span className="summary-value">{closedCount}</span>
            <span className="summary-label">Cerrados</span>
          </div>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="tickets-actions">
        <div className="search-filter-row">
          <div className="search-input-wrapper small">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar mis tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="action-buttons">
          <button onClick={fetchTickets} className="btn btn-icon" title="Actualizar">
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
          <Link to="/tickets/new" className="btn btn-primary">
            <TicketPlus size={18} />
            Nuevo Ticket
          </Link>
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos ({tickets.length})
        </button>
        <button
          className={`filter-tab ${filter === 'open' ? 'active' : ''}`}
          onClick={() => setFilter('open')}
        >
          Abiertos ({openCount})
        </button>
        <button
          className={`filter-tab ${filter === 'closed' ? 'active' : ''}`}
          onClick={() => setFilter('closed')}
        >
          Cerrados ({closedCount})
        </button>
      </div>

      {/* Mensajes de error */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Lista de tickets */}
      {loading ? (
        <div className="loading">Cargando tus tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="empty-state">
          <Inbox size={64} />
          <h3>
            {tickets.length === 0
              ? 'No tienes tickets'
              : `No tienes tickets ${filter === 'open' ? 'abiertos' : filter === 'closed' ? 'cerrados' : ''}`}
          </h3>
          <p>
            {tickets.length === 0
              ? 'Cuando reportes un incidente, aparecerá aquí'
              : 'Intenta con otro filtro'}
          </p>
          {tickets.length === 0 && (
            <Link to="/tickets/new" className="btn btn-primary">
              Crear mi primer ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="tickets-list">
          {filteredTickets.map((ticket) => {
            const ticketId = ticket.id || ticket[2];
            const ticketName = ticket.name || ticket[1];
            const ticketStatus = ticket.status || ticket[12];
            const ticketDate = ticket.date || ticket[15];
            const ticketDateMod = ticket.date_mod || ticket[19];

            const status = getStatusLabel(ticketStatus);
            const StatusIcon = status.icon;

            return (
              <Link to={`/tickets/${ticketId}`} key={ticketId} className="ticket-card">
                <div className="ticket-card-header">
                  <span className="ticket-id">#{ticketId}</span>
                  <span className={`badge ${status.class}`}>
                    <StatusIcon size={14} />
                    {status.label}
                  </span>
                </div>
                <h3 className="ticket-title">{ticketName}</h3>
                <div className="ticket-card-footer">
                  <span className="ticket-date">
                    Creado: {ticketDate ? new Date(ticketDate).toLocaleDateString('es-MX') : '-'}
                  </span>
                  {ticketDateMod && ticketDateMod !== ticketDate && (
                    <span className="ticket-updated">
                      Actualizado: {new Date(ticketDateMod).toLocaleDateString('es-MX')}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
