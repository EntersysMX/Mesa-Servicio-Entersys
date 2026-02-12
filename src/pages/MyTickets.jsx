import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Edit3,
  XCircle,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react';

export default function MyTickets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, open, closed, created, assigned
  const [searchTerm, setSearchTerm] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

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
      const ticketMap = new Map(); // Para evitar duplicados

      // Obtener Ticket_User para identificar tickets creados y asignados
      console.log('📋 Obteniendo relaciones Ticket_User...');
      try {
        const ticketUsers = await glpiApi.getItems('Ticket_User', { range: '0-500' });

        if (Array.isArray(ticketUsers) && ticketUsers.length > 0) {
          // Filtrar tickets donde el usuario actual está relacionado
          const myTicketUsers = ticketUsers.filter(tu => {
            const tuUserId = Number(tu.users_id || tu[3]);
            return tuUserId === Number(userId);
          });

          console.log(`📋 Relaciones del usuario: ${myTicketUsers.length}`);

          // Procesar cada relación
          for (const tu of myTicketUsers) {
            const ticketId = tu.tickets_id || tu[2];
            const type = tu.type || tu[4]; // 1 = creador/solicitante, 2 = asignado

            if (!ticketMap.has(ticketId)) {
              ticketMap.set(ticketId, {
                isCreator: type === 1,
                isAssigned: type === 2,
              });
            } else {
              const existing = ticketMap.get(ticketId);
              if (type === 1) existing.isCreator = true;
              if (type === 2) existing.isAssigned = true;
            }
          }

          // Obtener detalles de cada ticket
          const ticketIds = Array.from(ticketMap.keys());
          console.log(`📋 Obteniendo ${ticketIds.length} tickets...`);

          const ticketPromises = ticketIds.map(id =>
            glpiApi.getTicket(id).catch(e => {
              console.log(`Error obteniendo ticket ${id}:`, e.message);
              return null;
            })
          );
          const tickets = await Promise.all(ticketPromises);

          // Agregar información de tipo a cada ticket
          allTickets = tickets
            .filter(t => t !== null)
            .map(t => {
              const info = ticketMap.get(t.id);
              return {
                ...t,
                _isCreator: info?.isCreator || false,
                _isAssigned: info?.isAssigned || false,
              };
            });

          console.log(`✅ ${allTickets.length} tickets encontrados`);
        }
      } catch (e) {
        console.log('❌ Error obteniendo Ticket_User:', e.message);
      }

      // Fallback: usar getMyTickets
      if (allTickets.length === 0) {
        console.log('📋 Fallback: usando getMyTickets...');
        try {
          const myTickets = await glpiApi.getMyTickets({ range: '0-100' });
          if (Array.isArray(myTickets) && myTickets.length > 0) {
            allTickets = myTickets.map(t => ({ ...t, _isCreator: true, _isAssigned: false }));
            console.log(`✅ Fallback: ${allTickets.length} tickets encontrados`);
          }
        } catch (e) {
          console.log('❌ Fallback falló:', e.message);
        }
      }

      console.log('========================================');
      console.log(`🎫 TOTAL TICKETS: ${allTickets.length}`);
      console.log(`   - Creados: ${allTickets.filter(t => t._isCreator).length}`);
      console.log(`   - Asignados: ${allTickets.filter(t => t._isAssigned).length}`);
      console.log('========================================');

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

  // Cancelar ticket (cambiar estado a cerrado con motivo)
  const handleCancel = async (ticketId) => {
    setActionLoading(true);
    try {
      await glpiApi.updateTicket(ticketId, {
        status: 6, // Cerrado
      });
      // Agregar seguimiento de cancelación
      await glpiApi.addTicketFollowup(ticketId, '<p><strong>Ticket cancelado por el usuario.</strong></p>');
      setShowCancelModal(null);
      fetchTickets();
    } catch (err) {
      console.error('Error cancelando ticket:', err);
      alert('Error al cancelar el ticket: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Eliminar ticket
  const handleDelete = async (ticketId) => {
    setActionLoading(true);
    try {
      await glpiApi.deleteTicket(ticketId);
      setShowDeleteModal(null);
      fetchTickets();
    } catch (err) {
      console.error('Error eliminando ticket:', err);
      alert('Error al eliminar el ticket: ' + err.message);
    } finally {
      setActionLoading(false);
    }
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

    // Filtro por tipo (creados vs asignados)
    if (filter === 'created' && !ticket._isCreator) return false;
    if (filter === 'assigned' && !ticket._isAssigned) return false;

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

  const createdCount = tickets.filter(t => t._isCreator).length;
  const assignedCount = tickets.filter(t => t._isAssigned).length;

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
          className={`summary-card created ${filter === 'created' ? 'active' : ''}`}
          onClick={() => setFilter('created')}
          style={{ borderLeft: '3px solid #3b82f6' }}
        >
          <User size={24} />
          <div>
            <span className="summary-value">{createdCount}</span>
            <span className="summary-label">Creados</span>
          </div>
        </div>
        <div
          className={`summary-card assigned ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
          style={{ borderLeft: '3px solid #8b5cf6' }}
        >
          <UserCheck size={24} />
          <div>
            <span className="summary-value">{assignedCount}</span>
            <span className="summary-label">Asignados</span>
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
          className={`filter-tab ${filter === 'created' ? 'active' : ''}`}
          onClick={() => setFilter('created')}
        >
          Mis Creados ({createdCount})
        </button>
        <button
          className={`filter-tab ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
        >
          Asignados a mí ({assignedCount})
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
            const isCreator = ticket._isCreator;
            const isAssigned = ticket._isAssigned;
            const isClosed = ticketStatus >= 5;

            const status = getStatusLabel(ticketStatus);
            const StatusIcon = status.icon;

            return (
              <div key={ticketId} className="ticket-card-wrapper">
                <Link to={`/tickets/${ticketId}`} className="ticket-card">
                  <div className="ticket-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="ticket-id">#{ticketId}</span>
                      {/* Badges de tipo */}
                      {isCreator && (
                        <span className="badge" style={{
                          backgroundColor: '#dbeafe',
                          color: '#1d4ed8',
                          fontSize: '0.7rem',
                          padding: '2px 6px'
                        }}>
                          <User size={10} style={{ marginRight: '3px' }} />
                          Creado
                        </span>
                      )}
                      {isAssigned && (
                        <span className="badge" style={{
                          backgroundColor: '#ede9fe',
                          color: '#6d28d9',
                          fontSize: '0.7rem',
                          padding: '2px 6px'
                        }}>
                          <UserCheck size={10} style={{ marginRight: '3px' }} />
                          Asignado
                        </span>
                      )}
                    </div>
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

                {/* Botones de acción - solo para tickets creados por el usuario */}
                {isCreator && (
                  <div className="ticket-actions" style={{
                    display: 'flex',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    borderTop: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0 0 8px 8px',
                  }}>
                    <button
                      onClick={(e) => { e.preventDefault(); handleEdit(ticketId); }}
                      className="btn btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                      title="Editar ticket"
                    >
                      <Edit3 size={14} />
                      Editar
                    </button>
                    {!isClosed && (
                      <button
                        onClick={(e) => { e.preventDefault(); setShowCancelModal(ticketId); }}
                        className="btn btn-sm"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        title="Cancelar ticket"
                      >
                        <XCircle size={14} />
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); setShowDeleteModal(ticketId); }}
                      className="btn btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                      title="Eliminar ticket"
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmación para cancelar */}
      {showCancelModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#f59e0b' }}>
              <XCircle size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Cancelar Ticket
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              ¿Estás seguro de que deseas cancelar el ticket #{showCancelModal}?
              El ticket se cerrará y no podrá reabrirse.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
                disabled={actionLoading}
              >
                No, volver
              </button>
              <button
                onClick={() => handleCancel(showCancelModal)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  cursor: 'pointer',
                }}
                disabled={actionLoading}
              >
                {actionLoading ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar */}
      {showDeleteModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#ef4444' }}>
              <Trash2 size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Eliminar Ticket
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              ¿Estás seguro de que deseas eliminar el ticket #{showDeleteModal}?
              <strong style={{ color: '#ef4444', display: 'block', marginTop: '0.5rem' }}>
                Esta acción no se puede deshacer.
              </strong>
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
                disabled={actionLoading}
              >
                No, volver
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                }}
                disabled={actionLoading}
              >
                {actionLoading ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
