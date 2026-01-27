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
  Info,
} from 'lucide-react';

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, open, closed
  const [searchTerm, setSearchTerm] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
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
    console.log('🎫 GLPI ID:', user?.glpiID);
    console.log('🎫 GLPI Name:', user?.glpiname);
    console.log('🎫 Perfil activo:', user?.glpiactiveprofile);
    console.log('🎫 Datos completos de sesión:', user);

    setLoading(true);
    setError(null);

    try {
      let ticketsFound = [];

      // Método 1: Usar el nuevo método getMyTickets
      console.log('📋 Método 1: Usando getMyTickets...');
      try {
        const myTickets = await glpiApi.getMyTickets({ range: '0-100' });
        console.log('📋 Respuesta de getMyTickets:', myTickets);

        if (Array.isArray(myTickets) && myTickets.length > 0) {
          console.log(`✅ Método 1: ${myTickets.length} tickets encontrados`);
          ticketsFound = myTickets;
        } else {
          console.log('⚠️ Método 1: No hay tickets o respuesta vacía');
        }
      } catch (e) {
        console.log('❌ Método 1 falló:', e.message);
      }

      // Método 1b: Obtener tickets directamente (fallback)
      if (ticketsFound.length === 0) {
        console.log('📋 Método 1b: Obteniendo todos los tickets accesibles...');
        try {
          const allTickets = await glpiApi.getTickets({ range: '0-100' });
          console.log('📋 Respuesta de getTickets:', allTickets);

          if (Array.isArray(allTickets) && allTickets.length > 0) {
            console.log(`✅ Método 1b: ${allTickets.length} tickets encontrados`);
            ticketsFound = allTickets;
          } else {
            console.log('⚠️ Método 1b: No hay tickets o respuesta vacía');
          }
        } catch (e) {
          console.log('❌ Método 1b falló:', e.message);
        }
      }

      // Método 2: Buscar tickets donde el usuario es solicitante (requester)
      if (ticketsFound.length === 0 && userId) {
        console.log(`📋 Método 2: Buscando tickets creados por usuario ID ${userId}...`);
        try {
          const result = await glpiApi.getTicketsCreatedByUser(userId, {
            range: '0-100',
          });
          console.log('📋 Respuesta de getTicketsCreatedByUser:', result);

          const ticketData = result.data || result || [];
          if (Array.isArray(ticketData) && ticketData.length > 0) {
            console.log(`✅ Método 2: ${ticketData.length} tickets encontrados`);
            ticketsFound = ticketData;
          } else {
            console.log('⚠️ Método 2: No hay tickets');
          }
        } catch (e) {
          console.log('❌ Método 2 falló:', e.message);
        }
      }

      // Método 3: Buscar con searchTicketsAdvanced
      if (ticketsFound.length === 0 && userId) {
        console.log(`📋 Método 3: Búsqueda avanzada por solicitante ID ${userId}...`);
        try {
          const result = await glpiApi.searchTicketsAdvanced(
            { requesterId: userId },
            { range: '0-100' }
          );
          console.log('📋 Respuesta de searchTicketsAdvanced:', result);

          const ticketData = result.data || [];
          if (Array.isArray(ticketData) && ticketData.length > 0) {
            console.log(`✅ Método 3: ${ticketData.length} tickets encontrados`);
            ticketsFound = ticketData;
          } else {
            console.log('⚠️ Método 3: No hay tickets');
          }
        } catch (e) {
          console.log('❌ Método 3 falló:', e.message);
        }
      }

      // Método 4: Obtener todos los Ticket_User del usuario actual
      if (ticketsFound.length === 0 && userId) {
        console.log(`📋 Método 4: Obteniendo Ticket_User directamente...`);
        try {
          // Usar getItems en lugar de search para evitar problemas de permisos
          const ticketUsers = await glpiApi.getItems('Ticket_User', {
            range: '0-200',
          });
          console.log('📋 Todos los Ticket_User:', ticketUsers);

          if (Array.isArray(ticketUsers) && ticketUsers.length > 0) {
            // Filtrar por el usuario actual como solicitante (type=1)
            const myTicketUsers = ticketUsers.filter(tu => {
              const tuUserId = tu.users_id || tu[3];
              const tuType = tu.type || tu[4];
              return tuUserId == userId && tuType == 1;
            });

            console.log('📋 Ticket_User del usuario actual:', myTicketUsers);

            if (myTicketUsers.length > 0) {
              // Extraer IDs de tickets
              const ticketIds = myTicketUsers.map(tu => tu.tickets_id || tu[2]);
              console.log('📋 IDs de tickets encontrados:', ticketIds);

              // Obtener detalles de cada ticket
              const ticketPromises = ticketIds.map(id =>
                glpiApi.getTicket(id).catch(e => {
                  console.log(`Error obteniendo ticket ${id}:`, e.message);
                  return null;
                })
              );
              const tickets = await Promise.all(ticketPromises);
              ticketsFound = tickets.filter(t => t !== null);
              console.log(`✅ Método 4: ${ticketsFound.length} tickets obtenidos`);
            }
          }
        } catch (e) {
          console.log('❌ Método 4 falló:', e.message);
        }
      }

      // Método 5: Verificar sesión completa y tickets accesibles
      if (ticketsFound.length === 0) {
        console.log('📋 Método 5: Verificando permisos de sesión...');
        try {
          const session = await glpiApi.getFullSession();
          console.log('📋 Sesión completa:', session);
          console.log('📋 Perfiles disponibles:', session?.session?.glpiprofiles);
          console.log('📋 Entidades disponibles:', session?.session?.glpientities);
        } catch (e) {
          console.log('❌ Error obteniendo sesión:', e.message);
        }
      }

      console.log('========================================');
      console.log(`🎫 TOTAL TICKETS ENCONTRADOS: ${ticketsFound.length}`);
      console.log('========================================');

      setTickets(ticketsFound);

      // Guardar información de debug
      const debug = {
        userId: userId,
        glpiID: user?.glpiID,
        glpiname: user?.glpiname,
        profile: user?.glpiactiveprofile?.name || 'Desconocido',
        profileId: user?.glpiactiveprofile?.id,
        entity: user?.glpiactive_entity,
        ticketsFound: ticketsFound.length,
      };
      setDebugInfo(debug);

      if (ticketsFound.length === 0) {
        console.log('⚠️ No se encontraron tickets. Posibles causas:');
        console.log('   1. El usuario no ha creado ningún ticket');
        console.log('   2. El perfil Self-Service no tiene permisos de API para ver tickets');
        console.log('   3. Los tickets están en otra entidad');
      }

    } catch (err) {
      console.error('❌ Error cargando tickets:', err);
      setError('No se pudieron cargar los tickets. Verifica tu conexión.');
      setTickets([]);
      setDebugInfo({
        error: err.message,
        userId: userId,
        glpiID: user?.glpiID,
        profile: user?.glpiactiveprofile?.name || 'Desconocido',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, user]);

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

          {/* Información de diagnóstico */}
          {tickets.length === 0 && debugInfo && (
            <div className="debug-section" style={{ marginTop: '2rem' }}>
              <button
                className="btn btn-icon"
                onClick={() => setShowDebug(!showDebug)}
                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
              >
                <Info size={14} />
                {showDebug ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}
              </button>

              {showDebug && (
                <div
                  className="debug-info"
                  style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '8px',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                  }}
                >
                  <h4 style={{ marginBottom: '0.5rem' }}>Información de sesión:</h4>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    <li><strong>User ID:</strong> {debugInfo.userId || 'No disponible'}</li>
                    <li><strong>GLPI ID:</strong> {debugInfo.glpiID || 'No disponible'}</li>
                    <li><strong>Usuario:</strong> {debugInfo.glpiname || 'No disponible'}</li>
                    <li><strong>Perfil:</strong> {debugInfo.profile} (ID: {debugInfo.profileId || 'N/A'})</li>
                    <li><strong>Entidad activa:</strong> {debugInfo.entity || 'No especificada'}</li>
                  </ul>

                  <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Posibles soluciones:</h4>
                  <ul style={{ paddingLeft: '1.2rem', color: '#666' }}>
                    <li>Verificar que el perfil <strong>Self-Service</strong> tenga permisos de lectura en la API</li>
                    <li>En GLPI: Configuración → Perfiles → Self-Service → API → Habilitar "Leer"</li>
                    <li>Verificar que los tickets estén en la entidad correcta</li>
                    <li>Revisar la consola del navegador (F12) para más detalles</li>
                  </ul>

                  {debugInfo.error && (
                    <p style={{ color: '#dc2626', marginTop: '1rem' }}>
                      <strong>Error:</strong> {debugInfo.error}
                    </p>
                  )}
                </div>
              )}
            </div>
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
