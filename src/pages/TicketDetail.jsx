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
  Paperclip,
  Upload,
  Image,
  File,
  Download,
  Timer,
  Target,
  TrendingUp,
  AlertTriangle,
  Phone,
  Globe,
  Smartphone,
  FileSpreadsheet,
  Monitor,
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
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [groupTechniciansMap, setGroupTechniciansMap] = useState({});
  const [groups, setGroups] = useState([]);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Estados para notas/seguimientos
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('followup'); // followup, solution
  const [isPrivate, setIsPrivate] = useState(false);

  // Función para forzar el envío de correos pendientes
  const triggerEmailQueue = async () => {
    try {
      // Llamar al cron de GLPI para procesar la cola de correos
      await fetch('https://glpi.entersys.mx/front/cron.php', {
        mode: 'no-cors',
        cache: 'no-cache'
      });
      // Llamar varias veces para asegurar procesamiento
      setTimeout(() => fetch('https://glpi.entersys.mx/front/cron.php', { mode: 'no-cors' }), 2000);
      setTimeout(() => fetch('https://glpi.entersys.mx/front/cron.php', { mode: 'no-cors' }), 5000);
    } catch (e) {
      console.log('Cron triggered');
    }
  };

  // Estado para información del solicitante
  const [requesterInfo, setRequesterInfo] = useState(null);

  // Estados para archivos adjuntos
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [ticketDocuments, setTicketDocuments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Estado para SLA
  const [slaInfo, setSlaInfo] = useState(null);

  // Cache de nombres de usuarios para el timeline
  const [usersCache, setUsersCache] = useState({});

  // Estado para verificar si el usuario actual está asignado al ticket
  const [isAssignedToMe, setIsAssignedToMe] = useState(false);

  const canAssign = isAdmin || isTechnician;
  const canEdit = isAdmin || isTechnician;
  // Solo puede resolver/cerrar si es admin O si está asignado al ticket
  const canResolve = isAdmin || isAssignedToMe;

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
      const followupsList = Array.isArray(followupsData) ? followupsData : [];
      setFollowups(followupsList);

      // Cargar nombres de usuarios para el timeline
      const userIds = [...new Set(followupsList.map(f => f.users_id).filter(Boolean))];
      if (userIds.length > 0) {
        const usersData = {};
        await Promise.all(
          userIds.map(async (userId) => {
            try {
              const userData = await glpiApi.getUser(userId);
              if (userData) {
                // Obtener nombre legible: realname + firstname, o name, o glpiname
                const displayName = userData.realname
                  ? `${userData.realname} ${userData.firstname || ''}`.trim()
                  : userData.name || `Usuario #${userId}`;
                usersData[userId] = displayName;
              }
            } catch (e) {
              usersData[userId] = `Usuario #${userId}`;
            }
          })
        );
        setUsersCache(prev => ({ ...prev, ...usersData }));
      }

      // Preparar datos de edición
      setEditData({
        name: ticketData.name,
        content: ticketData.content?.replace(/<[^>]*>/g, '') || '',
        status: ticketData.status,
        urgency: ticketData.urgency,
        impact: ticketData.impact,
        priority: ticketData.priority,
      });

      // Cargar datos del solicitante (siempre)
      const requester = await glpiApi.getTicketRequester(id);
      setRequesterInfo(requester);

      // Cargar documentos del ticket
      const docs = await glpiApi.getTicketDocuments(id);
      setTicketDocuments(docs);

      // Cargar información de SLA
      const sla = await glpiApi.getTicketSLA(id);
      setSlaInfo(sla);

      // Cargar asignaciones actuales
      const assignees = await glpiApi.getTicketAssignees(id);
      setCurrentAssignees(assignees);

      // Verificar si el usuario actual está asignado al ticket (type=2 es técnico asignado)
      const currentUserId = user?.glpiID;
      const assignedUsers = assignees.users?.filter(u => u.type === 2) || [];
      const userIsAssigned = assignedUsers.some(u => Number(u.users_id) === Number(currentUserId));
      setIsAssignedToMe(userIsAssigned);
      console.log('👤 Usuario actual:', currentUserId, '¿Asignado?:', userIsAssigned);

      // Filtrar técnicos si hay grupo asignado
      if (canAssign) {
        const currentGroup = assignees.groups.find(a => a.type === 2);
        if (currentGroup && groupTechniciansMap[Number(currentGroup.groups_id)]) {
          const techIds = groupTechniciansMap[Number(currentGroup.groups_id)];
          const filteredTechs = allTechnicians.filter(t => techIds.includes(Number(t.id)));
          if (filteredTechs.length > 0) {
            setTechnicians(filteredTechs);
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, canAssign, user]);

  // Manejar drag and drop de archivos
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files) => {
    const newFiles = Array.from(files);
    setAttachedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (attachedFiles.length === 0) return;

    setUploadingFiles(true);
    try {
      for (const file of attachedFiles) {
        await glpiApi.uploadDocument(file, id);
      }
      setAttachedFiles([]);
      // Recargar documentos
      const docs = await glpiApi.getTicketDocuments(id);
      setTicketDocuments(docs);
      setSuccess('Archivos subidos correctamente');
    } catch (err) {
      setError('Error al subir archivos: ' + err.message);
    } finally {
      setUploadingFiles(false);
    }
  };

  // Cargar opciones de asignación
  const fetchAssignmentOptions = useCallback(async () => {
    if (!canAssign) return;
    try {
      const [techData, groupData, groupMapData] = await Promise.all([
        glpiApi.getTechnicians().catch(() => []),
        glpiApi.getGroups().catch(() => []),
        glpiApi.getGroupTechniciansMap().catch(() => ({})),
      ]);
      const techList = Array.isArray(techData) ? techData : [];
      setAllTechnicians(techList);
      setTechnicians(techList);
      setGroups(Array.isArray(groupData) ? groupData : []);
      setGroupTechniciansMap(groupMapData || {});
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

  // Agregar seguimiento/nota - AUTOMÁTICO sin preguntas
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() && attachedFiles.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const isSolution = commentType === 'solution';

      // Subir archivos adjuntos primero
      if (attachedFiles.length > 0) {
        setUploadingFiles(true);
        for (const file of attachedFiles) {
          await glpiApi.uploadDocument(file, id);
        }
        setAttachedFiles([]);
        setUploadingFiles(false);
      }

      // Agregar seguimiento si hay comentario
      if (newComment.trim()) {
        if (isSolution) {
          // Agregar solución y cambiar estado a Resuelto
          await glpiApi.addTicketFollowup(id, `[SOLUCIÓN] ${newComment}`);
          await glpiApi.updateTicket(id, { status: 5 }); // 5 = Resuelto
          setSuccess('Solución agregada - Notificación enviada automáticamente');
        } else {
          // Agregar seguimiento normal
          const prefix = isPrivate ? '[PRIVADO] ' : '';
          await glpiApi.addTicketFollowup(id, `${prefix}${newComment}`);
          setSuccess(isPrivate ? 'Nota privada agregada' : 'Nota agregada - Notificación enviada automáticamente');
        }

        // Forzar envío de correos automáticamente (GLPI los encola, esto fuerza el envío)
        if (!isPrivate) {
          triggerEmailQueue();
        }
      } else {
        setSuccess('Archivos adjuntados correctamente');
      }

      setNewComment('');
      setCommentType('followup');
      setIsPrivate(false);
      fetchTicket();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setUploadingFiles(false);
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

      // Forzar envío de notificaciones
      triggerEmailQueue();

      setSelectedTechnician('');
      setSelectedGroup('');
      setSuccess('Asignación agregada - Notificación enviada');
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

      setSuccess(`Estado cambiado a: ${newStatusName} - Notificación enviada automáticamente`);

      // Forzar envío de correos automáticamente
      triggerEmailQueue();

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

  // Detectar origen del ticket por el contenido
  const getTicketOrigin = (ticketData) => {
    if (!ticketData) return null;
    const content = ticketData.content || '';

    if (content.includes('[ORIGEN:Smartsheet]')) {
      return { label: 'Smartsheet', class: 'origin-smartsheet', icon: FileSpreadsheet };
    }
    if (content.includes('[ORIGEN:Portal]')) {
      return { label: 'Portal', class: 'origin-portal', icon: Monitor };
    }
    if (content.includes('[ORIGEN:Correo]')) {
      return { label: 'Correo', class: 'origin-email', icon: Mail };
    }
    if (content.includes('[ORIGEN:WhatsApp]')) {
      return { label: 'WhatsApp', class: 'origin-whatsapp', icon: Smartphone };
    }
    return null; // Origen desconocido o no marcado
  };

  // Extraer ID de Smartsheet del título
  const getSmartsheetId = (ticketData) => {
    if (!ticketData) return null;
    const name = ticketData.name || '';
    const match = name.match(/\[SS-(\d+)\]/);
    return match ? match[1] : null;
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
  const origin = getTicketOrigin(ticket);
  const smartsheetId = getSmartsheetId(ticket);

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
          {origin && (
            <span className={`badge ${origin.class}`}>
              <origin.icon size={12} />
              {origin.label}
            </span>
          )}
          {smartsheetId && (
            <span className="badge origin-smartsheet" title="ID de Smartsheet">
              <FileSpreadsheet size={12} />
              SS-{smartsheetId}
            </span>
          )}
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
                              {usersCache[followup.users_id] || `Usuario #${followup.users_id}`}
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

            {/* Documentos adjuntos del ticket */}
            {ticketDocuments.length > 0 && (
              <div className="ticket-documents-section">
                <h4>
                  <Paperclip size={16} />
                  Archivos Adjuntos ({ticketDocuments.length})
                </h4>
                <div className="documents-list">
                  {ticketDocuments.map((doc) => (
                    <div key={doc.id} className="document-item">
                      {doc.mime?.startsWith('image/') ? (
                        <Image size={18} className="doc-icon" />
                      ) : (
                        <File size={18} className="doc-icon" />
                      )}
                      <div className="doc-info">
                        <span className="doc-name">{doc.name || doc.filename}</span>
                        <span className="doc-meta">
                          {doc.mime} • {new Date(doc.date_creation).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                      <a
                        href={glpiApi.getDocumentDownloadUrl(doc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary download-btn"
                        title="Descargar archivo"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  ))}
                </div>
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
                      onChange={(e) => setIsPrivate(e.target.checked)}
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

              {/* Zona de archivos adjuntos */}
              <div
                className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <label htmlFor="file-upload" className="file-drop-label">
                  <Upload size={20} />
                  <span>Arrastra archivos aquí o <strong>haz clic para seleccionar</strong></span>
                  <small>Imágenes, PDF, documentos de Office</small>
                </label>
              </div>

              {/* Lista de archivos seleccionados */}
              {attachedFiles.length > 0 && (
                <div className="attached-files-list">
                  <h5><Paperclip size={14} /> Archivos a adjuntar:</h5>
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="attached-file-item">
                      {file.type.startsWith('image/') ? <Image size={16} /> : <File size={16} />}
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="remove-file-btn"
                        title="Quitar archivo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Info de notificación automática */}
              {!isPrivate && (
                <div className="notification-auto-info">
                  <Bell size={14} />
                  <span>
                    {requesterInfo?.email
                      ? `Notificación automática a: ${requesterInfo.email}`
                      : 'Sin correo registrado - No se enviará notificación'}
                  </span>
                </div>
              )}

              <div className="followup-form-actions">
                <button
                  type="submit"
                  className={`btn ${commentType === 'solution' ? 'btn-success' : 'btn-primary'}`}
                  disabled={submitting || !newComment.trim()}
                >
                  <Send size={18} />
                  {submitting
                    ? 'Enviando...'
                    : commentType === 'solution'
                    ? 'Resolver Ticket'
                    : 'Enviar Seguimiento'}
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
                {ticket.status !== 5 && canResolve && (
                  <button
                    onClick={() => handleQuickStatusChange(5)}
                    className="btn btn-sm btn-success"
                    disabled={submitting}
                  >
                    <CheckCircle size={14} />
                    Resolver
                  </button>
                )}
                {ticket.status !== 6 && canResolve && (
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

          {/* Información de SLA */}
          {slaInfo && (
            <div className="sidebar-section sla-section">
              <h4>
                <Timer size={16} />
                SLA / Métricas
              </h4>

              {/* Tiempo para Resolución (TTR) */}
              {slaInfo.ttr.target_date && (
                <div className={`sla-item sla-${slaInfo.ttr.status.color}`}>
                  <div className="sla-header">
                    <Target size={14} />
                    <span>Tiempo de Resolución</span>
                  </div>
                  <div className="sla-details">
                    <span className={`sla-badge badge-${slaInfo.ttr.status.color}`}>
                      {slaInfo.ttr.status.label}
                    </span>
                    <span className="sla-date">
                      {new Date(slaInfo.ttr.target_date).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>
                  {slaInfo.ttr.status.remaining !== undefined && (
                    <div className="sla-remaining">
                      {glpiApi.formatTimeRemaining(slaInfo.ttr.status.remaining)}
                    </div>
                  )}
                </div>
              )}

              {/* Tiempo para Tomar (TTO) */}
              {slaInfo.tto.target_date && (
                <div className={`sla-item sla-${slaInfo.tto.status.color}`}>
                  <div className="sla-header">
                    <TrendingUp size={14} />
                    <span>Primera Respuesta</span>
                  </div>
                  <div className="sla-details">
                    <span className={`sla-badge badge-${slaInfo.tto.status.color}`}>
                      {slaInfo.tto.status.label}
                    </span>
                    <span className="sla-date">
                      {new Date(slaInfo.tto.target_date).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>
                </div>
              )}

              {/* Estadísticas de tiempo */}
              <div className="sla-stats">
                <div className="stat-item">
                  <span className="stat-label">Creado</span>
                  <span className="stat-value">
                    {slaInfo.dates.created
                      ? new Date(slaInfo.dates.created).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                      : '-'}
                  </span>
                </div>
                {slaInfo.stats.takeinto_delay > 0 && (
                  <div className="stat-item">
                    <span className="stat-label">Tiempo de Toma</span>
                    <span className="stat-value">
                      {Math.round(slaInfo.stats.takeinto_delay)} min
                    </span>
                  </div>
                )}
                {slaInfo.dates.solved && (
                  <div className="stat-item">
                    <span className="stat-label">Resuelto</span>
                    <span className="stat-value">
                      {new Date(slaInfo.dates.solved).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
                {slaInfo.stats.solve_delay > 0 && (
                  <div className="stat-item">
                    <span className="stat-label">Tiempo Total</span>
                    <span className="stat-value">
                      {slaInfo.stats.solve_delay < 60
                        ? `${Math.round(slaInfo.stats.solve_delay)} min`
                        : slaInfo.stats.solve_delay < 1440
                        ? `${Math.round(slaInfo.stats.solve_delay / 60)} hrs`
                        : `${Math.round(slaInfo.stats.solve_delay / 1440)} días`}
                    </span>
                  </div>
                )}
              </div>

              {/* Alerta si no hay SLA configurado */}
              {!slaInfo.ttr.target_date && !slaInfo.tto.target_date && (
                <div className="sla-warning">
                  <AlertTriangle size={14} />
                  <span>Sin SLA asignado</span>
                </div>
              )}
            </div>
          )}

          {/* Información del solicitante */}
          <div className="sidebar-section requester-section requester-highlight">
            <h4>
              <User size={16} />
              Información de Solicitante
            </h4>
            {(() => {
              // Obtener email: del campo email, o del nombre si parece email
              const email = requesterInfo?.email ||
                (requesterInfo?.name?.includes('@') ? requesterInfo.name : null);
              const displayName = requesterInfo?.realname
                ? `${requesterInfo.realname} ${requesterInfo.firstname || ''}`.trim()
                : (requesterInfo?.name && !requesterInfo.name.includes('@')
                    ? requesterInfo.name
                    : null);

              return (
                <>
                  <div className="requester-info">
                    <div className="requester-name">
                      <User size={14} />
                      <span>{displayName || email || `Usuario #${ticket.users_id_recipient}`}</span>
                    </div>
                    {email && (
                      <div className="requester-email">
                        <Mail size={14} />
                        <span>{email}</span>
                      </div>
                    )}
                    {requesterInfo?.phone && (
                      <div className="requester-phone">
                        <Phone size={14} />
                        <span>{requesterInfo.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Acciones de contacto */}
                  {email && (
                    <div className="contact-actions">
                      <a
                        href={`mailto:${email}?subject=Re: Ticket #${ticket.id} - ${ticket.name}`}
                        className="btn btn-sm btn-primary contact-btn"
                        title="Enviar correo al solicitante"
                      >
                        <Mail size={14} />
                        Enviar Correo
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(email);
                          setSuccess('Correo copiado al portapapeles');
                        }}
                        className="btn btn-sm btn-secondary contact-btn"
                        title="Copiar correo"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  )}

                  {!email && canEdit && (
                    <p className="no-email-warning">
                      <AlertCircle size={12} />
                      Sin correo registrado
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Grupo asignado */}
          {canAssign && (
            <div className="sidebar-section">
              <h4>
                <Users size={16} />
                Grupo Asignado
              </h4>
              {(() => {
                const currentGroup = currentAssignees.groups.find((a) => a.type === 2);
                const currentGroupId = currentGroup?.groups_id || '';

                return (
                  <div className="single-assignee">
                    <select
                      value={currentGroupId}
                      onChange={async (e) => {
                        const newGroupId = e.target.value;
                        if (newGroupId === String(currentGroupId)) return;

                        setAssigning(true);
                        try {
                          // Remover grupo actual si existe
                          if (currentGroup) {
                            await glpiApi.removeTicketGroupAssignment(currentGroup.id);
                          }

                          let newGroupAssignment = null;

                          // Asignar nuevo grupo si se seleccionó uno
                          if (newGroupId) {
                            const result = await glpiApi.assignTicketToGroup(id, parseInt(newGroupId, 10));
                            const groupName = groups.find(g => g.id === parseInt(newGroupId, 10))?.name || `Grupo #${newGroupId}`;
                            await glpiApi.addTicketFollowup(id, `[ASIGNACIÓN] ${user?.glpiname || 'Sistema'} asignó el ticket al grupo: ${groupName}`);

                            // Crear nuevo objeto de asignación para actualizar estado local
                            newGroupAssignment = {
                              id: result?.id || Date.now(),
                              groups_id: parseInt(newGroupId, 10),
                              type: 2,
                            };

                            // Filtrar técnicos por el nuevo grupo
                            const groupId = parseInt(newGroupId, 10);
                            if (groupTechniciansMap[groupId]) {
                              const techIds = groupTechniciansMap[groupId];
                              const filteredTechs = allTechnicians.filter(t => techIds.includes(Number(t.id)));
                              setTechnicians(filteredTechs);
                            } else {
                              setTechnicians(allTechnicians);
                            }
                          } else {
                            // Sin grupo, mostrar todos los técnicos
                            setTechnicians(allTechnicians);
                          }

                          // Actualizar estado local sin recargar toda la página
                          setCurrentAssignees(prev => ({
                            ...prev,
                            groups: newGroupAssignment
                              ? [...prev.groups.filter(g => g.type !== 2), newGroupAssignment]
                              : prev.groups.filter(g => g.type !== 2),
                          }));

                          setSuccess(newGroupId ? 'Grupo asignado' : 'Grupo removido');
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setAssigning(false);
                        }
                      }}
                      disabled={assigning}
                      className="single-select"
                    >
                      <option value="">-- Sin grupo --</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Técnico asignado */}
          {canAssign && (
            <div className="sidebar-section">
              <h4>
                <User size={16} />
                Técnico Asignado
                {(() => {
                  const currentGroup = currentAssignees.groups.find(a => a.type === 2);
                  if (currentGroup && technicians.length < allTechnicians.length) {
                    return (
                      <span style={{ fontSize: '11px', color: '#666', marginLeft: 8, fontWeight: 'normal' }}>
                        ({technicians.length} del grupo)
                      </span>
                    );
                  }
                  return null;
                })()}
              </h4>
              {(() => {
                const currentTech = currentAssignees.users.find((a) => a.type === 2);
                const currentTechId = currentTech?.users_id || '';
                const currentGroup = currentAssignees.groups.find(a => a.type === 2);
                const hasGroupFilter = currentGroup && technicians.length < allTechnicians.length;

                return (
                  <div className="single-assignee">
                    <select
                      value={currentTechId}
                      onChange={async (e) => {
                        const newTechId = e.target.value;
                        if (newTechId === String(currentTechId)) return;

                        setAssigning(true);
                        try {
                          // Remover técnico actual si existe
                          if (currentTech) {
                            await glpiApi.removeTicketUserAssignment(currentTech.id);
                          }

                          let newTechAssignment = null;

                          // Asignar nuevo técnico si se seleccionó uno
                          if (newTechId) {
                            const result = await glpiApi.assignTicketToUser(id, parseInt(newTechId, 10));
                            const techName = technicians.find(t => t.id === parseInt(newTechId, 10))?.name || `Usuario #${newTechId}`;
                            await glpiApi.addTicketFollowup(id, `[ASIGNACIÓN] ${user?.glpiname || 'Sistema'} asignó el ticket al técnico: ${techName}`);

                            // Crear nuevo objeto de asignación para actualizar estado local
                            newTechAssignment = {
                              id: result?.id || Date.now(),
                              users_id: parseInt(newTechId, 10),
                              type: 2,
                            };
                          }

                          // Actualizar estado local sin recargar toda la página
                          setCurrentAssignees(prev => ({
                            ...prev,
                            users: newTechAssignment
                              ? [...prev.users.filter(u => u.type !== 2), newTechAssignment]
                              : prev.users.filter(u => u.type !== 2),
                          }));

                          setSuccess(newTechId ? 'Técnico asignado' : 'Técnico removido');
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setAssigning(false);
                        }
                      }}
                      disabled={assigning}
                      className="single-select"
                    >
                      <option value="">
                        {hasGroupFilter
                          ? technicians.length > 0
                            ? '-- Seleccionar técnico del grupo --'
                            : '-- No hay técnicos en este grupo --'
                          : '-- Sin técnico --'}
                      </option>
                      {technicians.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name} {tech.realname ? `(${tech.realname})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
