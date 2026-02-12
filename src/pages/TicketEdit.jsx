import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import glpiApi from '../services/glpiApi';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  Folder,
  Users,
  User,
  MapPin,
  Upload,
  Paperclip,
  Image,
  File,
  X,
  CheckCircle,
} from 'lucide-react';

export default function TicketEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Datos para los selectores
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [locations, setLocations] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [groupTechniciansMap, setGroupTechniciansMap] = useState({});

  // Estados para archivos adjuntos
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    content: '',
    type: 1,
    urgency: 3,
    impact: 3,
    priority: 3,
    itilcategories_id: 0,
    locations_id: 0,
    _groups_id_assign: 0,
    _users_id_assign: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        // Cargar datos del ticket y opciones en paralelo
        const [ticket, categoriesData, groupsData, locationsData, techniciansData, groupMapData, docs] = await Promise.all([
          glpiApi.getTicket(id),
          glpiApi.getCategories({ range: '0-100' }).catch(() => []),
          glpiApi.getGroups().catch(() => []),
          glpiApi.getLocations().catch(() => []),
          glpiApi.getTechnicians().catch(() => []),
          glpiApi.getGroupTechniciansMap().catch(() => ({})),
          glpiApi.getTicketDocuments(id).catch(() => []),
        ]);

        // Obtener asignaciones actuales
        const assignees = await glpiApi.getTicketAssignees(id).catch(() => ({ users: [], groups: [] }));

        // Encontrar grupo y técnico asignados
        const assignedGroup = assignees.groups.find(g => g.type === 2);
        const assignedUser = assignees.users.find(u => u.type === 2);

        // Limpiar contenido del ticket (quitar etiquetas de origen)
        let cleanContent = ticket.content || '';
        cleanContent = cleanContent.replace(/<p><strong>\[ORIGEN:[^\]]+\]<\/strong><\/p>/gi, '');
        cleanContent = cleanContent.replace(/<\/?p>/gi, '\n').trim();
        cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n');

        setFormData({
          name: ticket.name || '',
          content: cleanContent,
          type: ticket.type || 1,
          urgency: ticket.urgency || 3,
          impact: ticket.impact || 3,
          priority: ticket.priority || 3,
          itilcategories_id: ticket.itilcategories_id || 0,
          locations_id: ticket.locations_id || 0,
          _groups_id_assign: assignedGroup?.groups_id || 0,
          _users_id_assign: assignedUser?.users_id || 0,
        });

        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setLocations(Array.isArray(locationsData) ? locationsData : []);
        setExistingDocs(Array.isArray(docs) ? docs : []);

        const techList = Array.isArray(techniciansData) ? techniciansData : [];
        setAllTechnicians(techList);
        setTechnicians(techList);
        setGroupTechniciansMap(groupMapData || {});

        // Si hay grupo asignado, filtrar técnicos
        if (assignedGroup?.groups_id && groupMapData[assignedGroup.groups_id]) {
          const techIds = groupMapData[assignedGroup.groups_id];
          const filteredTechs = techList.filter(t => techIds.includes(Number(t.id)));
          setTechnicians(filteredTechs);
        }

      } catch (err) {
        console.error('Error al cargar datos:', err);
        setError('No se pudo cargar el ticket. ' + err.message);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [id]);

  // Manejar drag and drop
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    const numericValue = ['name', 'content'].includes(name) ? value : parseInt(value, 10) || 0;

    setFormData((prev) => ({
      ...prev,
      [name]: numericValue,
      ...(name === '_groups_id_assign' ? { _users_id_assign: 0 } : {}),
    }));

    // Filtrar técnicos cuando cambia el grupo
    if (name === '_groups_id_assign') {
      const groupId = parseInt(value, 10);
      if (groupId > 0 && groupTechniciansMap[groupId]) {
        const techIds = groupTechniciansMap[groupId];
        const filteredTechs = allTechnicians.filter(t => techIds.includes(Number(t.id)));
        setTechnicians(filteredTechs);
      } else {
        setTechnicians(allTechnicians);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Actualizar datos del ticket
      const ticketData = {
        name: formData.name,
        content: `<p>${formData.content.replace(/\n/g, '</p><p>')}</p>`,
        type: formData.type,
        urgency: formData.urgency,
        impact: formData.impact,
        priority: formData.priority,
        itilcategories_id: formData.itilcategories_id || undefined,
        locations_id: formData.locations_id || undefined,
      };

      await glpiApi.updateTicket(id, ticketData);

      // Subir archivos nuevos
      if (attachedFiles.length > 0) {
        console.log(`Subiendo ${attachedFiles.length} archivos...`);
        for (const file of attachedFiles) {
          try {
            await glpiApi.uploadDocument(file, id);
            console.log(`Archivo subido: ${file.name}`);
          } catch (uploadErr) {
            console.error(`Error subiendo ${file.name}:`, uploadErr);
          }
        }
      }

      setSuccess(true);
      setAttachedFiles([]);

      // Recargar documentos
      const docs = await glpiApi.getTicketDocuments(id).catch(() => []);
      setExistingDocs(Array.isArray(docs) ? docs : []);

      // Redirigir después de un momento
      setTimeout(() => {
        navigate(`/tickets/${id}`);
      }, 1500);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => navigate(-1)} className="btn btn-icon">
            <ArrowLeft size={18} />
          </button>
          <h1>Editar Ticket #{id}</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="ticket-form">
        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{
            backgroundColor: '#d1fae5',
            color: '#065f46',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}>
            <CheckCircle size={18} />
            Ticket actualizado correctamente. Redirigiendo...
          </div>
        )}

        {loadingData ? (
          <div className="loading">Cargando ticket...</div>
        ) : (
          <>
            <div className="form-section">
              <h2>Informacion del Incidente</h2>

              <div className="form-group">
                <label htmlFor="name">Titulo *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Describe brevemente el problema"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="content">Descripcion *</label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  placeholder="Describe detalladamente el incidente"
                  rows={6}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="type">Tipo</label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                  >
                    <option value={1}>Incidente</option>
                    <option value={2}>Solicitud</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="itilcategories_id">
                    <Folder size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Categoria
                  </label>
                  <select
                    id="itilcategories_id"
                    name="itilcategories_id"
                    value={formData.itilcategories_id}
                    onChange={handleChange}
                  >
                    <option value={0}>-- Seleccionar categoria --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.completename || cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Documentos existentes */}
            {existingDocs.length > 0 && (
              <div className="form-section">
                <h2>
                  <Paperclip size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  Archivos Existentes ({existingDocs.length})
                </h2>
                <div className="attached-files-list">
                  {existingDocs.map((doc) => (
                    <div key={doc.id} className="attached-file-item">
                      <File size={18} className="file-icon" />
                      <span className="file-name">{doc.filename || doc.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nuevos archivos */}
            <div className="form-section">
              <h2>
                <Upload size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Agregar Archivos
              </h2>

              <div
                className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="file-upload-edit"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.msg,.eml"
                />
                <label htmlFor="file-upload-edit" className="file-drop-label">
                  <Upload size={32} />
                  <span>Arrastra archivos aqui o <strong>haz clic para seleccionar</strong></span>
                  <small>Imagenes, PDF, documentos de Office, correos (.msg, .eml)</small>
                </label>
              </div>

              {attachedFiles.length > 0 && (
                <div className="attached-files-list">
                  <h4>
                    <Paperclip size={14} />
                    Archivos nuevos ({attachedFiles.length}):
                  </h4>
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="attached-file-item">
                      {file.type.startsWith('image/') ? (
                        <Image size={18} className="file-icon" />
                      ) : (
                        <File size={18} className="file-icon" />
                      )}
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
            </div>

            <div className="form-section">
              <h2>Asignacion</h2>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="locations_id">
                    <MapPin size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Proyecto / Ubicacion
                  </label>
                  <select
                    id="locations_id"
                    name="locations_id"
                    value={formData.locations_id}
                    onChange={handleChange}
                  >
                    <option value={0}>-- Seleccionar proyecto --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.completename || loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="_groups_id_assign">
                    <Users size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Area / Grupo
                  </label>
                  <select
                    id="_groups_id_assign"
                    name="_groups_id_assign"
                    value={formData._groups_id_assign}
                    onChange={handleChange}
                  >
                    <option value={0}>-- Seleccionar grupo --</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.completename || group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="_users_id_assign">
                    <User size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Asignar a (Tecnico)
                  </label>
                  <select
                    id="_users_id_assign"
                    name="_users_id_assign"
                    value={formData._users_id_assign}
                    onChange={handleChange}
                  >
                    <option value={0}>-- Sin asignar --</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.realname ? `${tech.realname} ${tech.firstname || ''}`.trim() : tech.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Priorizacion</h2>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="urgency">Urgencia</label>
                  <select
                    id="urgency"
                    name="urgency"
                    value={formData.urgency}
                    onChange={handleChange}
                  >
                    <option value={1}>Muy baja</option>
                    <option value={2}>Baja</option>
                    <option value={3}>Media</option>
                    <option value={4}>Alta</option>
                    <option value={5}>Muy alta</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="impact">Impacto</label>
                  <select
                    id="impact"
                    name="impact"
                    value={formData.impact}
                    onChange={handleChange}
                  >
                    <option value={1}>Muy bajo</option>
                    <option value={2}>Bajo</option>
                    <option value={3}>Medio</option>
                    <option value={4}>Alto</option>
                    <option value={5}>Muy alto</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="priority">Prioridad</label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
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
                onClick={() => navigate(-1)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Save size={18} />
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
