import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  ArrowLeft,
  Edit,
  Trash2,
  MessageSquare,
  Send,
  RefreshCw,
  AlertCircle,
  Clock,
  User,
  Calendar,
  Tag,
  UserPlus,
  Users,
  X,
  Check,
  FileText,
  Lock,
  Unlock,
  CheckCircle,
  Save,
  Activity,
  ArrowRightLeft,
  UserMinus,
  Settings,
  Lightbulb,
  Mail,
  Copy,
  ExternalLink,
  Bell,
} from 'lucide-react';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isTechnician } = useAuth();

  // Estados principales
  const [ticket, setTicket] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Estados de edición
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Estados para asignaciones actuales
  const [currentAssignees, setCurrentAssignees] = useState({ users: [], groups: [] });

  // Estados para asignación
  const [technicians, setTechnicians] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Estados para notas/seguimientos
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('followup'); // followup, solution
  const [isPrivate, setIsPrivate] = useState(false);
  const [sendNotification, setSendNotification] = useState(true); // Notificar por correo por defecto

  // Estado para información del solicitante
  const [requesterInfo, setRequesterInfo] = useState(null);

  const canAssign = isAdmin || isTechnician;
  const canEdit = isAdmin || isTechnician;

  // Cargar ticket y datos relacionados
  const fetchTicket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketData, followupsData] = await Promise.all([
        glpiApi.getTicket(id),
        glpiApi.getTicketFollowups(id).catch(() => []),
      ]);

      setTicket(ticketData);
      setFollowups(Array.isArray(followupsData) ? followupsData : []);

      // Preparar datos de edición
      setEditData({
        name: ticketData.name,
        content: ticketData.content?.replace(/<[^>]*>/g, '') || '',
        status: ticketData.status,
        urgency: ticketData.urgency,
        impact: ticketData.impact,
        priority: ticketData.priority,
      });

      // Cargar asignaciones actuales y datos del solicitante
      if (canAssign) {
        const [assignees, requester] = await Promise.all([
          glpiApi.getTicketAssignees(id),
          glpiApi.getTicketRequester(id),
        ]);
        setCurrentAssignees(assignees);
        setRequesterInfo(requester);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, canAssign]);

  // Cargar opciones de asignación
  const fetchAssignmentOptions = useCallback(async () => {
    if (!canAssign) return;
    try {
      const [techData, groupData] = await Promise.all([
        glpiApi.getTechnicians().catch(() => []),
        glpiApi.getGroups().catch(() => []),
      ]);
      setTechnicians(Array.isArray(techData) ? techData : []);
      setGroups(Array.isArray(groupData) ? groupData : []);
    } catch (err) {
      console.error('Error fetching assignment options:', err);
    }
  }, [canAssign]);

  useEffect(() => {
    fetchTicket();
    fetchAssignmentOptions();
  }, [fetchTicket, fetchAssignmentOptions]);

  // Limpiar mensajes después de un tiempo
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Generar cuerpo del correo con formato profesional
  const generateEmailBody = (content, ticketData, isSolution = false) => {
    const ticketUrl = `${window.location.origin}/tickets/${id}`;
    const statusLabel = isSolution ? 'RESUELTO' : 'EN SEGUIMIENTO';

    return `
Estimado(a) ${requesterInfo?.realname || requesterInfo?.firstname || 'Usuario'},

${isSolution ? 'Su ticket ha sido RESUELTO.' : 'Tiene una actualización en su ticket de soporte.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TICKET #${id} - ${statusLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Asunto: ${ticketData?.name || ''}

MENSAJE DEL TÉCNICO:
${content}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para dar seguimiento a su ticket:
• Responda directamente a este correo
• O acceda al portal: ${ticketUrl}

Si tiene alguna duda, no dude en contactarnos.

Atentamente,
${user?.glpifriendlyname || user?.glpiname || 'Equipo de Soporte'}
Mesa de Ayuda - Entersys
    `.trim();
  };

  // Abrir cliente de correo con el mensaje
  const openEmailClient = (content, isSolution = false) => {
    if (!requesterInfo?.email) return;

    const subject = `${isSolution ? '[RESUELTO]' : '[Seguimiento]'} Ticket #${id} - ${ticket?.name || ''}`;
    const body = generateEmailBody(content, ticket, isSolution);

    const mailtoUrl = `mailto:${requesterInfo.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Agregar seguimiento/nota
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const isSolution = commentType === 'solution';

      if (isSolution) {
        // Agregar solución y cambiar estado a Resuelto
        await glpiApi.addTicketFollowup(id, `[SOLUCIÓN] ${newComment}`);
        await glpiApi.updateTicket(id, { status: 5 }); // 5 = Resuelto
        setSuccess('Solución agregada y ticket marcado como resuelto');
      } else {
        // Agregar seguimiento normal
        const prefix = isPrivate ? '[PRIVADO] ' : '';
        await glpiApi.addTicketFollowup(id, `${prefix}${newComment}`);
        setSuccess('Nota agregada correctamente');
      }

      // Abrir correo automáticamente si está activada la notificación y no es privado
      if (sendNotification && !isPrivate && requesterInfo?.email) {
        openEmailClient(newComment, isSolution);
        setSuccess(prev => prev + ' - Se abrió el correo para enviar notificación');
      }

      const commentContent = newComment; // Guardar antes de limpiar
      setNewComment('');
      setCommentType('followup');
      setIsPrivate(false);
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Actualizar ticket con seguimiento automático de cambios
  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const userName = user?.glpiname || 'Sistema';
      const changes = [];

      // Detectar cambios
      if (editData.name !== ticket.name) {
        changes.push(`Título: "${ticket.name}" → "${editData.name}"`);
      }
      if (editData.status !== ticket.status) {
        const statusNames = {
          1: 'Nuevo', 2: 'En curso (asignado)', 3: 'En curso (planificado)',
          4: 'En espera', 5: 'Resuelto', 6: 'Cerrado',
        };
        changes.push(`Estado: "${statusNames[ticket.status]}" → "${statusNames[editData.status]}"`);
      }
      if (editData.urgency !== ticket.urgency) {
        const urgencyNames = { 1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Muy alta' };
        changes.push(`Urgencia: "${urgencyNames[ticket.urgency]}" → "${urgencyNames[editData.urgency]}"`);
      }
      if (editData.priority !== ticket.priority) {
        const priorityNames = { 1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Muy alta', 6: 'Mayor' };
        changes.push(`Prioridad: "${priorityNames[ticket.priority]}" → "${priorityNames[editData.priority]}"`);
      }

      await glpiApi.updateTicket(id, {
        ...editData,
        content: `<p>${editData.content.replace(/\n/g, '</p><p>')}</p>`,
      });

      // Agregar seguimiento automático si hubo cambios
      if (changes.length > 0) {
        const followupContent = `[ACTUALIZACIÓN] ${userName} modificó el ticket:\n• ${changes.join('\n• ')}`;
        await glpiApi.addTicketFollowup(id, followupContent);
      }

      setEditing(false);
      setSuccess('Ticket actualizado correctamente');
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Agregar asignación (técnico o grupo) con seguimiento automático
  const handleAddAssignment = async () => {
    if (!selectedTechnician && !selectedGroup) {
      setError('Selecciona un técnico o grupo para asignar');
      return;
    }

    setAssigning(true);
    setError(null);
    try {
      const userName = user?.glpiname || 'Sistema';
      const followupMessages = [];

      if (selectedTechnician) {
        await glpiApi.assignTicketToUser(id, parseInt(selectedTechnician, 10));
        const techName = technicians.find(t => t.id === parseInt(selectedTechnician, 10))?.name || `Usuario #${selectedTechnician}`;
        followupMessages.push(`[ASIGNACIÓN] ${userName} asignó el ticket al técnico: ${techName}`);
      }
      if (selectedGroup) {
        await glpiApi.assignTicketToGroup(id, parseInt(selectedGroup, 10));
        const groupName = groups.find(g => g.id === parseInt(selectedGroup, 10))?.name || `Grupo #${selectedGroup}`;
        followupMessages.push(`[ASIGNACIÓN] ${userName} asignó el ticket al grupo: ${groupName}`);
      }

      // Agregar seguimientos automáticos
      for (const msg of followupMessages) {
        await glpiApi.addTicketFollowup(id, msg);
      }

      setSelectedTechnician('');
      setSelectedGroup('');
      setSuccess('Asignación agregada correctamente');
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // Quitar asignación de usuario con seguimiento automático
  const handleRemoveUserAssignment = async (assignmentId, techUserId) => {
    if (!window.confirm('¿Quitar esta asignación de técnico?')) return;

    setAssigning(true);
    setError(null);
    try {
      const userName = user?.glpiname || 'Sistema';
      const techName = technicians.find(t => t.id === techUserId)?.name || `Usuario #${techUserId}`;

      await glpiApi.removeTicketUserAssignment(assignmentId);

      // Agregar seguimiento automático
      await glpiApi.addTicketFollowup(
        id,
        `[DESASIGNACIÓN] ${userName} removió al técnico: ${techName}`
      );

      setSuccess('Asignación de técnico removida');
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // Quitar asignación de grupo con seguimiento automático
  const handleRemoveGroupAssignment = async (assignmentId, groupId) => {
    if (!window.confirm('¿Quitar esta asignación de grupo?')) return;

    setAssigning(true);
    setError(null);
    try {
      const userName = user?.glpiname || 'Sistema';
      const groupName = groups.find(g => g.id === groupId)?.name || `Grupo #${groupId}`;

      await glpiApi.removeTicketGroupAssignment(assignmentId);

      // Agregar seguimiento automático
      await glpiApi.addTicketFollowup(
        id,
        `[DESASIGNACIÓN] ${userName} removió el grupo: ${groupName}`
      );

      setSuccess('Asignación de grupo removida');
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // Cambiar estado rápido con seguimiento automático y notificación
  const handleQuickStatusChange = async (newStatus) => {
    setSubmitting(true);
    setError(null);
    try {
      const statusNames = {
        1: 'Nuevo',
        2: 'En curso (asignado)',
        3: 'En curso (planificado)',
        4: 'En espera',
        5: 'Resuelto',
        6: 'Cerrado',
      };
      const oldStatusName = statusNames[ticket.status] || 'Desconocido';
      const newStatusName = statusNames[newStatus] || 'Desconocido';

      // Actualizar estado
      await glpiApi.updateTicket(id, { status: newStatus });

      // Agregar seguimiento automático del cambio
      const userName = user?.glpiname || 'Sistema';
      const followupMessage = `${userName} cambió el estado de "${oldStatusName}" a "${newStatusName}"`;
      await glpiApi.addTicketFollowup(id, `[CAMBIO DE ESTADO] ${followupMessage}`);

      setSuccess(`Estado cambiado a: ${newStatusName}`);

      // Enviar notificación por correo automáticamente si hay email
      if (requesterInfo?.email) {
        const isSolved = newStatus === 5 || newStatus === 6;
        const subject = `${isSolved ? '[RESUELTO]' : '[Actualización]'} Ticket #${id} - ${ticket?.name || ''}`;
        const body = `
Estimado(a) ${requesterInfo?.realname || requesterInfo?.firstname || 'Usuario'},

El estado de su ticket ha sido actualizado.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TICKET #${id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Asunto: ${ticket?.name || ''}

NUEVO ESTADO: ${newStatusName}
Estado anterior: ${oldStatusName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${isSolved ? 'Su ticket ha sido marcado como resuelto. Si tiene alguna duda o el problema persiste, por favor responda a este correo.' : 'Puede consultar el estado de su ticket en el portal o responder a este correo.'}

Portal: ${window.location.origin}/tickets/${id}

Atentamente,
${user?.glpifriendlyname || user?.glpiname || 'Equipo de Soporte'}
Mesa de Ayuda - Entersys
        `.trim();

        const mailtoUrl = `mailto:${requesterInfo.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
      }

      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar ticket
  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este ticket? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      await glpiApi.deleteTicket(id);
      navigate('/tickets');
    } catch (err) {
      setError(err.message);
    }
  };

  // Helpers de presentación
  const getStatusLabel = (status) => {
    const statusMap = {
      1: { label: 'Nuevo', class: 'status-new' },
      2: { label: 'En curso (asignado)', class: 'status-assigned' },
      3: { label: 'En curso (planificado)', class: 'status-planned' },
      4: { label: 'En espera', class: 'status-waiting' },
      5: { label: 'Resuelto', class: 'status-solved' },
      6: { label: 'Cerrado', class: 'status-closed' },
    };
    return statusMap[status] || { label: 'Desconocido', class: 'status-unknown' };
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

  const getUrgencyLabel = (urgency) => {
    const urgencyMap = {
      1: 'Muy baja',
      2: 'Baja',
      3: 'Media',
      4: 'Alta',
      5: 'Muy alta',
    };
    return urgencyMap[urgency] || 'Media';
  };

  // Loading state
  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Cargando ticket...</div>
      </div>
    );
  }

  // Not found state
  if (!ticket) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <AlertCircle size={64} />
          <h3>Ticket no encontrado</h3>
          <button onClick={() => navigate('/tickets')} className="btn btn-primary">
            Volver a tickets
          </button>
        </div>
      </div>
    );
  }

  const status = getStatusLabel(ticket.status);
  const priority = getPriorityLabel(ticket.priority);

  return (
    <div className="page-container ticket-detail-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => navigate(-1)} className="btn btn-icon">
            <ArrowLeft size={18} />
          </button>
          <h1>Ticket #{ticket.id}</h1>
          <span className={`badge ${status.class}`}>{status.label}</span>
        </div>
        <div className="header-actions">
          <button onClick={fetchTicket} className="btn btn-icon" title="Actualizar">
            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          </button>
          {canEdit && (
            <button
              onClick={() => setEditing(!editing)}
              className={`btn ${editing ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Edit size={18} />
              {editing ? 'Editando' : 'Editar'}
            </button>
          )}
          {isAdmin && (
            <button onClick={handleDelete} className="btn btn-danger">
              <Trash2 size={18} />
              Eliminar
            </button>
          )}
        </div>
      </header>

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
      {success && (
        <div className="alert alert-success">
          <Check size={18} />
          {success}
        </div>
      )}

      <div className="ticket-detail-layout">
        {/* Columna principal */}
        <div className="ticket-main-column">
          {/* Contenido del ticket */}
          <div className="ticket-detail">
            {editing ? (
              <form onSubmit={handleUpdate} className="ticket-edit-form">
                <div className="form-section">
                  <h3>Información del Ticket</h3>

                  <div className="form-group">
                    <label>Título</label>
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Descripción</label>
                    <textarea
                      value={editData.content}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, content: e.target.value }))
                      }
                      rows={6}
                      required
                    />
                  </div>
                </div>

                <div className="form-section">
                  <h3>Estado y Prioridad</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Estado</label>
                      <select
                        value={editData.status}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            status: parseInt(e.target.value, 10),
                          }))
                        }
                      >
                        <option value={1}>Nuevo</option>
                        <option value={2}>En curso (asignado)</option>
                        <option value={3}>En curso (planificado)</option>
                        <option value={4}>En espera</option>
                        <option value={5}>Resuelto</option>
                        <option value={6}>Cerrado</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Urgencia</label>
                      <select
                        value={editData.urgency}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            urgency: parseInt(e.target.value, 10),
                          }))
                        }
                      >
                        <option value={1}>Muy baja</option>
                        <option value={2}>Baja</option>
                        <option value={3}>Media</option>
                        <option value={4}>Alta</option>
                        <option value={5}>Muy alta</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Prioridad</label>
                      <select
                        value={editData.priority}
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            priority: parseInt(e.target.value, 10),
                          }))
                        }
                      >
                        <option value={1}>Muy baja</option>
                        <option value={2}>Baja</option>
                        <option value={3}>Media</option>
                        <option value={4}>Alta</option>
                        <option value={5}>Muy alta</option>
                        <option value={6}>Mayor</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="btn btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    <Save size={18} />
                    {submitting ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="ticket-main">
                  <h2>{ticket.name}</h2>
                  <div
                    className="ticket-content"
                    dangerouslySetInnerHTML={{ __html: ticket.content }}
                  />
                </div>

                <div className="ticket-meta">
                  <div className="meta-item">
                    <Calendar size={16} />
                    <span>Creado: {new Date(ticket.date).toLocaleString('es-MX')}</span>
                  </div>
                  {ticket.date_mod && (
                    <div className="meta-item">
                      <Clock size={16} />
                      <span>
                        Modificado: {new Date(ticket.date_mod).toLocaleString('es-MX')}
                      </span>
                    </div>
                  )}
                  <div className="meta-item">
                    <Tag size={16} />
                    <span>Prioridad: </span>
                    <span className={`badge ${priority.class}`}>{priority.label}</span>
                  </div>
                  <div className="meta-item">
                    <AlertCircle size={16} />
                    <span>Urgencia: {getUrgencyLabel(ticket.urgency)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Seguimientos / Notas - Timeline */}
          <div className="ticket-followups-section">
            <div className="section-header">
              <h3>
                <Activity size={18} />
                Timeline de Actividad ({followups.length})
              </h3>
            </div>

            {followups.length > 0 ? (
              <div className="activity-timeline">
                {followups.map((followup) => {
                  const content = followup.content || '';
                  const isPrivateNote = content.includes('[PRIVADO]');
                  const isSolution = content.includes('[SOLUCIÓN]');
                  const isStatusChange = content.includes('[CAMBIO DE ESTADO]');
                  const isAssignment = content.includes('[ASIGNACIÓN]');
                  const isUnassignment = content.includes('[DESASIGNACIÓN]');
                  const isUpdate = content.includes('[ACTUALIZACIÓN]');

                  // Determinar el tipo y estilo del seguimiento
                  const getFollowupType = () => {
                    if (isSolution) return { type: 'solution', icon: Lightbulb, label: 'Solución', color: 'success' };
                    if (isStatusChange) return { type: 'status', icon: ArrowRightLeft, label: 'Cambio de Estado', color: 'info' };
                    if (isAssignment) return { type: 'assignment', icon: UserPlus, label: 'Asignación', color: 'primary' };
                    if (isUnassignment) return { type: 'unassignment', icon: UserMinus, label: 'Desasignación', color: 'warning' };
                    if (isUpdate) return { type: 'update', icon: Settings, label: 'Actualización', color: 'secondary' };
                    if (isPrivateNote) return { type: 'private', icon: Lock, label: 'Nota Privada', color: 'warning' };
                    return { type: 'comment', icon: MessageSquare, label: 'Comentario', color: 'default' };
                  };

                  const followupType = getFollowupType();
                  const TypeIcon = followupType.icon;

                  // Limpiar el contenido de los prefijos
                  const cleanContent = content
                    .replace('[PRIVADO] ', '')
                    .replace('[SOLUCIÓN] ', '')
                    .replace('[CAMBIO DE ESTADO] ', '')
                    .replace('[ASIGNACIÓN] ', '')
                    .replace('[DESASIGNACIÓN] ', '')
                    .replace('[ACTUALIZACIÓN] ', '');

                  return (
                    <div
                      key={followup.id}
                      className={`timeline-item timeline-${followupType.color}`}
                    >
                      <div className="timeline-marker">
                        <TypeIcon size={14} />
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <div className="timeline-info">
                            <span className={`timeline-badge badge-${followupType.color}`}>
                              {followupType.label}
                            </span>
                            <span className="timeline-user">
                              <User size={12} />
                              Usuario #{followup.users_id}
                            </span>
                          </div>
                          <span className="timeline-date">
                            <Clock size={12} />
                            {new Date(followup.date).toLocaleString('es-MX')}
                          </span>
                        </div>
                        <div
                          className="timeline-body"
                          dangerouslySetInnerHTML={{ __html: cleanContent }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-timeline">
                <MessageSquare size={32} />
                <p>No hay actividad registrada aún</p>
              </div>
            )}

            {/* Formulario de nueva nota */}
            <form onSubmit={handleAddComment} className="followup-form">
              <div className="followup-form-header">
                <div className="comment-type-selector">
                  <button
                    type="button"
                    className={`type-btn ${commentType === 'followup' ? 'active' : ''}`}
                    onClick={() => setCommentType('followup')}
                  >
                    <FileText size={16} />
                    Nota
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className={`type-btn solution ${commentType === 'solution' ? 'active' : ''}`}
                      onClick={() => setCommentType('solution')}
                    >
                      <CheckCircle size={16} />
                      Solución
                    </button>
                  )}
                </div>
                {commentType === 'followup' && canEdit && (
                  <label className="private-toggle">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => {
                        setIsPrivate(e.target.checked);
                        // Si es privado, desactivar notificación
                        if (e.target.checked) setSendNotification(false);
                      }}
                    />
                    <Lock size={14} />
                    Nota privada
                  </label>
                )}
              </div>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={
                  commentType === 'solution'
                    ? 'Describe la solución aplicada...'
                    : isPrivate
                    ? 'Nota privada (solo visible para técnicos)...'
                    : 'Escribe un comentario o actualización...'
                }
                rows={4}
                required
              />

              {/* Opciones de notificación */}
              {!isPrivate && requesterInfo?.email && (
                <div className="notification-options">
                  <label className="notification-toggle">
                    <input
                      type="checkbox"
                      checked={sendNotification}
                      onChange={(e) => setSendNotification(e.target.checked)}
                    />
                    <Mail size={14} />
                    Enviar correo al cliente
                  </label>
                  <span className="notification-help">
                    Se abrirá tu correo con el mensaje listo para enviar a: <strong>{requesterInfo.email}</strong>
                  </span>
                </div>
              )}

              {/* Aviso si no hay correo */}
              {!isPrivate && !requesterInfo?.email && canEdit && (
                <div className="notification-warning">
                  <AlertCircle size={14} />
                  El solicitante no tiene correo registrado. No se podrá notificar por email.
                </div>
              )}

              <div className="followup-form-actions">
                {/* Botón para abrir correo manualmente */}
                {!isPrivate && requesterInfo?.email && newComment.trim() && (
                  <a
                    href={`mailto:${requesterInfo.email}?subject=Re: Ticket #${id} - ${ticket?.name || ''}&body=${encodeURIComponent(newComment)}`}
                    className="btn btn-secondary"
                    title="Enviar por correo manualmente"
                  >
                    <ExternalLink size={16} />
                    Abrir en correo
                  </a>
                )}
                <button
                  type="submit"
                  className={`btn ${commentType === 'solution' ? 'btn-success' : 'btn-primary'}`}
                  disabled={submitting || !newComment.trim()}
                >
                  <Send size={18} />
                  {submitting
                    ? 'Enviando...'
                    : commentType === 'solution'
                    ? 'Agregar Solución'
                    : sendNotification && requesterInfo?.email
                    ? 'Agregar y Notificar'
                    : 'Agregar Nota'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Barra lateral - Asignaciones y acciones rápidas */}
        <div className="ticket-sidebar">
          {/* Acciones rápidas de estado */}
          {canEdit && (
            <div className="sidebar-section">
              <h4>Acciones Rápidas</h4>
              <div className="quick-actions-grid">
                {ticket.status !== 2 && (
                  <button
                    onClick={() => handleQuickStatusChange(2)}
                    className="btn btn-sm btn-secondary"
                    disabled={submitting}
                  >
                    <Clock size={14} />
                    En Curso
                  </button>
                )}
                {ticket.status !== 4 && (
                  <button
                    onClick={() => handleQuickStatusChange(4)}
                    className="btn btn-sm btn-secondary"
                    disabled={submitting}
                  >
                    <Clock size={14} />
                    En Espera
                  </button>
                )}
                {ticket.status !== 5 && (
                  <button
                    onClick={() => handleQuickStatusChange(5)}
                    className="btn btn-sm btn-success"
                    disabled={submitting}
                  >
                    <CheckCircle size={14} />
                    Resolver
                  </button>
                )}
                {ticket.status !== 6 && (
                  <button
                    onClick={() => handleQuickStatusChange(6)}
                    className="btn btn-sm btn-secondary"
                    disabled={submitting}
                  >
                    <Check size={14} />
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Información del solicitante */}
          <div className="sidebar-section requester-section">
            <h4>
              <User size={16} />
              Solicitante
            </h4>
            <div className="requester-info">
              <div className="requester-name">
                <User size={14} />
                <span>
                  {requesterInfo?.realname
                    ? `${requesterInfo.realname} ${requesterInfo.firstname || ''}`.trim()
                    : requesterInfo?.name || `Usuario #${ticket.users_id_recipient}`}
                </span>
              </div>
              {requesterInfo?.email && (
                <div className="requester-email">
                  <Mail size={14} />
                  <span>{requesterInfo.email}</span>
                </div>
              )}
              {requesterInfo?.phone && (
                <div className="requester-phone">
                  <span>Tel: {requesterInfo.phone}</span>
                </div>
              )}
            </div>

            {/* Acciones de contacto */}
            {requesterInfo?.email && (
              <div className="contact-actions">
                <a
                  href={`mailto:${requesterInfo.email}?subject=Re: Ticket #${ticket.id} - ${ticket.name}`}
                  className="btn btn-sm btn-primary contact-btn"
                  title="Enviar correo al solicitante"
                >
                  <Mail size={14} />
                  Enviar Correo
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(requesterInfo.email);
                    setSuccess('Correo copiado al portapapeles');
                  }}
                  className="btn btn-sm btn-secondary contact-btn"
                  title="Copiar correo"
                >
                  <Copy size={14} />
                </button>
              </div>
            )}

            {!requesterInfo?.email && canEdit && (
              <p className="no-email-warning">
                <AlertCircle size={12} />
                Sin correo registrado
              </p>
            )}
          </div>

          {/* Técnicos asignados */}
          {canAssign && (
            <div className="sidebar-section">
              <h4>
                <User size={16} />
                Técnicos Asignados
              </h4>
              {currentAssignees.users.length > 0 ? (
                <div className="assignees-list">
                  {currentAssignees.users
                    .filter((a) => a.type === 2) // type 2 = asignado
                    .map((assignment) => (
                      <div key={assignment.id} className="assignee-item">
                        <User size={14} />
                        <span>
                          {technicians.find((t) => t.id === assignment.users_id)?.name ||
                            `Usuario #${assignment.users_id}`}
                        </span>
                        <button
                          onClick={() => handleRemoveUserAssignment(assignment.id, assignment.users_id)}
                          className="btn-remove"
                          title="Quitar asignación"
                          disabled={assigning}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="no-assignees">Sin técnico asignado</p>
              )}

              {/* Agregar técnico */}
              <div className="add-assignee">
                <select
                  value={selectedTechnician}
                  onChange={(e) => setSelectedTechnician(e.target.value)}
                >
                  <option value="">-- Agregar técnico --</option>
                  {technicians
                    .filter(
                      (t) =>
                        !currentAssignees.users.some(
                          (a) => a.users_id === t.id && a.type === 2
                        )
                    )
                    .map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name} {tech.realname ? `(${tech.realname})` : ''}
                      </option>
                    ))}
                </select>
                {selectedTechnician && (
                  <button
                    onClick={handleAddAssignment}
                    className="btn btn-sm btn-primary"
                    disabled={assigning}
                  >
                    <UserPlus size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Grupos asignados */}
          {canAssign && (
            <div className="sidebar-section">
              <h4>
                <Users size={16} />
                Grupos Asignados
              </h4>
              {currentAssignees.groups.length > 0 ? (
                <div className="assignees-list">
                  {currentAssignees.groups
                    .filter((a) => a.type === 2) // type 2 = asignado
                    .map((assignment) => (
                      <div key={assignment.id} className="assignee-item">
                        <Users size={14} />
                        <span>
                          {groups.find((g) => g.id === assignment.groups_id)?.name ||
                            `Grupo #${assignment.groups_id}`}
                        </span>
                        <button
                          onClick={() => handleRemoveGroupAssignment(assignment.id, assignment.groups_id)}
                          className="btn-remove"
                          title="Quitar asignación"
                          disabled={assigning}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="no-assignees">Sin grupo asignado</p>
              )}

              {/* Agregar grupo */}
              <div className="add-assignee">
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="">-- Agregar grupo --</option>
                  {groups
                    .filter(
                      (g) =>
                        !currentAssignees.groups.some(
                          (a) => a.groups_id === g.id && a.type === 2
                        )
                    )
                    .map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                </select>
                {selectedGroup && (
                  <button
                    onClick={handleAddAssignment}
                    className="btn btn-sm btn-primary"
                    disabled={assigning}
                  >
                    <UserPlus size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
