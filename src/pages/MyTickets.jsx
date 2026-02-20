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
  X,
} from 'lucide-react';

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, open, closed
  const [searchTerm, setSearchTerm] = useState('');
  const [userEmail, setUserEmail] = useState(null);

  // Obtener ID del usuario de varias fuentes posibles
  const userId = user?.glpiID || user?.id || user?.users_id;

  // Obtener el correo del usuario
  useEffect(() => {
    const fetchUserEmail = async () => {
      if (!userId) return;

      try {
        // Primero verificar si el nombre de usuario es un email
        if (user?.glpiname && user.glpiname.includes('@')) {
          setUserEmail(user.glpiname);
          console.log('📧 Correo del usuario (desde nombre):', user.glpiname);
          return;
        }

        // Si no, buscar el email desde la API
        const email = await glpiApi.getUserEmail(userId);
        if (email) {
          setUserEmail(email);
          console.log('📧 Correo del usuario (desde API):', email);
        }
      } catch (e) {
        console.log('No se pudo obtener el correo del usuario:', e.message);
      }
    };

    fetchUserEmail();
  }, [userId, user]);

  const fetchTickets = useCallback(async () => {
    console.log('========================================');
    console.log('🎫 CARGANDO TICKETS DEL USUARIO');
    console.log('========================================');
    console.log('🎫 User ID:', userId);
    console.log('🎫 GLPI Name:', user?.glpiname);

    setLoading(true);
    setError(null);

    try {
      let allTickets = [];

      // Usar búsqueda avanzada para obtener SOLO los tickets del usuario actual
      console.log('📋 Buscando tickets donde el usuario es solicitante...');
      try {
        // Buscar tickets donde el usuario es el solicitante (requesterId)
        const createdResult = await glpiApi.searchTicketsAdvanced(
          { requesterId: userId },
          { range: '0-200' }
        );

        if (createdResult.data && Array.isArray(createdResult.data)) {
          const createdTickets = await Promise.all(
            createdResult.data.map(async (t) => {
              const ticketId = t.id || t[2];
              try {
                const fullTicket = await glpiApi.getTicket(ticketId);
                return { ...fullTicket, _isCreator: true, _isAssigned: false };
              } catch (e) {
                return null;
              }
            })
          );
          allTickets = createdTickets.filter(t => t !== null);
          console.log(`✅ ${allTickets.length} tickets encontrados como solicitante`);
        }
      } catch (e) {
        console.log('❌ Error en búsqueda:', e.message);

        // Fallback: usar getMyTickets que respeta los permisos de GLPI
        console.log('📋 Fallback: usando getMyTickets...');
        try {
          const myTickets = await glpiApi.getMyTickets({ range: '0-100' });
          if (Array.isArray(myTickets) && myTickets.length > 0) {
            allTickets = myTickets.map(t => ({ ...t, _isCreator: true, _isAssigned: false }));
            console.log(`✅ Fallback: ${allTickets.length} tickets encontrados`);
          }
        } catch (e2) {
          console.log('❌ Fallback falló:', e2.message);
        }
      }

      console.log('========================================');
      console.log(`🎫 TOTAL TICKETS: ${allTickets.length}`);
      console.log(`   - Creados: ${allTickets.filter(t => t._isCreator).length}`);
      console.log(`   - Asignados: ${allTickets.filter(t => t._isAssigned).length}`);
      console.log('========================================');

      // Ordenar tickets por fecha de creación descendente (más reciente primero)
      allTickets.sort((a, b) => {
        const dateA = new Date(a.date || a[15] || 0);
        const dateB = new Date(b.date || b[15] || 0);
        return dateB - dateA; // Descendente
      });

      setTickets(allTickets);

      // Debug info
      setDebugInfo({
        userId: userId,
        glpiname: user?.glpiname,
        profile: user?.glpiactiveprofile?.name || 'Desconocido',
        ticketsFound: allTickets.length,
        created: allTickets.filter(t => t._isCreator).length,
        assigned: allTickets.filter(t => t._isAssigned).length,
      });

    } catch (err) {
      console.error('❌ Error cargando tickets:', err);
      setError('No se pudieron cargar los tickets.');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [userId, user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Editar ticket
  const handleEdit = (ticketId) => {
    navigate(`/tickets/${ticketId}/edit`);
  };

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
        {user && (
          <div className="user-info-card" style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #bae6fd',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem'
          }}>
            <span style={{ fontWeight: '500' }}>👤 Usuario:</span>
            <span>{user.glpiname}</span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ fontWeight: '500' }}>📧 Correo:</span>
            <span style={{ color: '#0369a1' }}>{userEmail || user.glpiname || 'No disponible'}</span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ fontWeight: '500' }}>🏢 Perfil:</span>
            <span style={{ color: '#059669' }}>{user.glpiactiveprofile?.name || 'No especificado'}</span>
          </div>
        )}
      </div>

      {/* Resumen */}
      <div className="tickets-summary" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div
          className={`summary-card ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          style={{
            padding: '1rem',
            backgroundColor: filter === 'all' ? '#eff6ff' : 'white',
            borderRadius: '8px',
            border: filter === 'all' ? '2px solid #3b82f6' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          <Inbox size={24} style={{ color: '#3b82f6', marginBottom: '0.5rem' }} />
          <div>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', display: 'block' }}>{tickets.length}</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total</span>
          </div>
        </div>
        <div
          className={`summary-card ${filter === 'open' ? 'active' : ''}`}
          onClick={() => setFilter('open')}
          style={{
            padding: '1rem',
            backgroundColor: filter === 'open' ? '#fef3c7' : 'white',
            borderRadius: '8px',
            border: filter === 'open' ? '2px solid #f59e0b' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          <Clock size={24} style={{ color: '#f59e0b', marginBottom: '0.5rem' }} />
          <div>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', display: 'block' }}>{openCount}</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Abiertos</span>
          </div>
        </div>
        <div
          className={`summary-card ${filter === 'closed' ? 'active' : ''}`}
          onClick={() => setFilter('closed')}
          style={{
            padding: '1rem',
            backgroundColor: filter === 'closed' ? '#d1fae5' : 'white',
            borderRadius: '8px',
            border: filter === 'closed' ? '2px solid #10b981' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          <CheckCircle size={24} style={{ color: '#10b981', marginBottom: '0.5rem' }} />
          <div>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', display: 'block' }}>{closedCount}</span>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Cerrados</span>
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
      <div className="filter-tabs" style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: filter === 'all' ? '#3b82f6' : '#f3f4f6',
            color: filter === 'all' ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Todos ({tickets.length})
        </button>
        <button
          className={`filter-tab ${filter === 'open' ? 'active' : ''}`}
          onClick={() => setFilter('open')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: filter === 'open' ? '#f59e0b' : '#f3f4f6',
            color: filter === 'open' ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Abiertos ({openCount})
        </button>
        <button
          className={`filter-tab ${filter === 'closed' ? 'active' : ''}`}
          onClick={() => setFilter('closed')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: filter === 'closed' ? '#10b981' : '#f3f4f6',
            color: filter === 'closed' ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: '500'
          }}
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

            const status = getStatusLabel(ticketStatus);
            const StatusIcon = status.icon;

            return (
              <Link
                key={ticketId}
                to={`/tickets/${ticketId}`}
                className="ticket-card"
                style={{
                  display: 'block',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid #e5e7eb',
                  transition: 'box-shadow 0.2s',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{
                    fontWeight: '600',
                    color: '#3b82f6',
                    fontSize: '0.9rem'
                  }}>#{ticketId}</span>
                  <span className={`badge ${status.class}`} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem'
                  }}>
                    <StatusIcon size={12} />
                    {status.label}
                  </span>
                </div>
                <h3 style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  color: '#1f2937',
                  lineHeight: '1.4'
                }}>{ticketName}</h3>
                <div style={{
                  fontSize: '0.8rem',
                  color: '#6b7280',
                  display: 'flex',
                  gap: '1rem'
                }}>
                  <span>Creado: {ticketDate ? new Date(ticketDate).toLocaleDateString('es-MX') : '-'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

    </div>
  );
}
