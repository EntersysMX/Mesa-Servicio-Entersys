import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

export default function TicketCreate() {
  const navigate = useNavigate();
  const { user, isClient } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  // Datos para los selectores
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [locations, setLocations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [groupTechniciansMap, setGroupTechniciansMap] = useState({});

  // Estados para archivos adjuntos
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    content: '',
    type: 1, // 1 = Incidente, 2 = Solicitud
    urgency: 3,
    impact: 3,
    priority: 3,
    itilcategories_id: 0,
    projects_id: 0, // Proyecto
    locations_id: 0, // Ubicación
    _groups_id_assign: 0, // Grupo asignado
    _users_id_assign: 0, // Técnico asignado
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [categoriesData, groupsData, locationsData, projectsData, techniciansData, groupMapData] = await Promise.all([
          glpiApi.getCategories({ range: '0-100' }).catch(() => []),
          glpiApi.getGroups().catch(() => []),
          glpiApi.getLocations().catch(() => []),
          glpiApi.getProjects().catch(() => []),
          glpiApi.getTechnicians().catch(() => []),
          glpiApi.getGroupTechniciansMap().catch(() => ({})),
        ]);

        // Obtener la entidad activa del usuario
        const userEntityId = user?.glpiactive_entity;
        console.log('🏢 Entidad activa del usuario:', userEntityId);

        // Filtrar categorías por entidad del usuario
        // Mostrar las de la entidad del usuario + las recursivas de entidades padre (entities_id=0 con is_recursive=1)
        let filteredCategories = Array.isArray(categoriesData) ? categoriesData : [];
        if (userEntityId && userEntityId > 0) {
          filteredCategories = filteredCategories.filter(cat => {
            // Categorías de la entidad del usuario
            if (cat.entities_id === userEntityId) return true;
            // Categorías de la entidad raíz que son recursivas
            if (cat.entities_id === 0 && cat.is_recursive === 1) return true;
            return false;
          });
        }
        console.log('📁 Categorías filtradas:', filteredCategories.length);

        // Filtrar proyectos por entidad del usuario
        let filteredProjects = Array.isArray(projectsData) ? projectsData : [];
        if (userEntityId && userEntityId > 0) {
          filteredProjects = filteredProjects.filter(proj => {
            // Proyectos de la entidad del usuario
            if (proj.entities_id === userEntityId) return true;
            // Proyectos de la entidad raíz que son recursivos (opcional, depende de la necesidad)
            // if (proj.entities_id === 0 && proj.is_recursive === 1) return true;
            return false;
          });
        }
        console.log('📂 Proyectos filtrados:', filteredProjects.length);

        setCategories(filteredCategories);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setLocations(Array.isArray(locationsData) ? locationsData : []);
        setProjects(filteredProjects);

        const techList = Array.isArray(techniciansData) ? techniciansData : [];
        setAllTechnicians(techList);
        setTechnicians(techList);
        setGroupTechniciansMap(groupMapData || {});
      } catch (err) {
        console.error('Error al cargar datos:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [user]);

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

  const handleChange = (e) => {
    const { name, value } = e.target;
    const numericValue = ['name', 'content'].includes(name) ? value : parseInt(value, 10) || 0;

    setFormData((prev) => ({
      ...prev,
      [name]: numericValue,
      // Resetear técnico si cambia el grupo
      ...(name === '_groups_id_assign' ? { _users_id_assign: 0 } : {}),
    }));

    // Filtrar técnicos cuando cambia el grupo
    if (name === '_groups_id_assign') {
      const groupId = parseInt(value, 10);
      console.log('🔍 Grupo seleccionado:', groupId);
      console.log('🔍 Mapeo disponible:', groupTechniciansMap);

      if (groupId > 0 && groupTechniciansMap[groupId]) {
        // Filtrar técnicos que pertenecen al grupo seleccionado
        const techIds = groupTechniciansMap[groupId];
        console.log('🔍 IDs de técnicos del grupo:', techIds);
        // Comparar como números
        const filteredTechs = allTechnicians.filter(t => techIds.includes(Number(t.id)));
        console.log('🔍 Técnicos filtrados:', filteredTechs.map(t => t.name));
        setTechnicians(filteredTechs);
      } else {
        // Sin grupo seleccionado, mostrar todos los técnicos
        console.log('🔍 Sin grupo, mostrando todos los técnicos');
        setTechnicians(allTechnicians);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Obtener el ID del usuario logueado (solicitante)
      const requesterId = user?.glpiID;
      console.log('👤 Usuario logueado (solicitante):', user?.glpiname, 'ID:', requesterId);

      // Preparar datos del ticket con origen Portal
      const ticketData = {
        name: formData.name,
        content: `<p><strong>[ORIGEN:Portal]</strong></p><p>${formData.content.replace(/\n/g, '</p><p>')}</p>`,
        type: formData.type,
        urgency: formData.urgency,
        impact: formData.impact,
        priority: formData.priority,
        itilcategories_id: formData.itilcategories_id || undefined,
        locations_id: formData.locations_id || undefined,
        // Establecer el solicitante como el usuario logueado
        _users_id_requester: requesterId || undefined,
      };

      // Crear el ticket
      const result = await glpiApi.createTicket(ticketData);
      const ticketId = result.id;

      if (ticketId) {
        // Asignar explícitamente el solicitante (usuario logueado)
        if (requesterId) {
          await glpiApi.assignTicketRequester(ticketId, requesterId).catch(console.error);
        }

        // Asociar proyecto si se seleccionó
        if (formData.projects_id > 0) {
          await glpiApi.linkTicketToProject(ticketId, formData.projects_id).catch(console.error);
        }

        // Subir archivos adjuntos
        if (attachedFiles.length > 0) {
          console.log(`📎 Subiendo ${attachedFiles.length} archivos...`);
          for (const file of attachedFiles) {
            try {
              await glpiApi.uploadDocument(file, ticketId);
              console.log(`✅ Archivo subido: ${file.name}`);
            } catch (uploadErr) {
              console.error(`❌ Error subiendo ${file.name}:`, uploadErr);
            }
          }
        }

        // Asignar grupo si se seleccionó
        if (formData._groups_id_assign > 0) {
          await glpiApi.assignTicketToGroup(ticketId, formData._groups_id_assign).catch(console.error);
        }

        // Asignar técnico si se seleccionó
        if (formData._users_id_assign > 0) {
          await glpiApi.assignTicketToUser(ticketId, formData._users_id_assign).catch(console.error);
        }

        navigate(`/tickets/${ticketId}`);
      } else {
        navigate('/tickets');
      }
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
          <h1>Nuevo Ticket</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="ticket-form">
        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {loadingData ? (
          <div className="loading">Cargando opciones...</div>
        ) : (
          <>
            <div className="form-section">
              <h2>Información del Incidente</h2>

              <div className="form-group">
                <label htmlFor="name">Título *</label>
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
                <label htmlFor="content">Descripción *</label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  placeholder="Describe detalladamente el incidente, incluyendo pasos para reproducirlo si aplica"
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
                    Categoría
                  </label>
                  <select
                    id="itilcategories_id"
                    name="itilcategories_id"
                    value={formData.itilcategories_id}
                    onChange={handleChange}
                  >
                    <option value={0}>-- Seleccionar categoría --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.completename || cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección de Archivos Adjuntos */}
            <div className="form-section">
              <h2>
                <Paperclip size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Evidencias / Archivos Adjuntos
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
                  id="file-upload-create"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.msg,.eml"
                />
                <label htmlFor="file-upload-create" className="file-drop-label">
                  <Upload size={32} />
                  <span>Arrastra archivos aquí o <strong>haz clic para seleccionar</strong></span>
                  <small>Imágenes, PDF, documentos de Office, correos (.msg, .eml)</small>
                </label>
              </div>

              {/* Lista de archivos seleccionados */}
              {attachedFiles.length > 0 && (
                <div className="attached-files-list">
                  <h4>
                    <Paperclip size={14} />
                    Archivos a adjuntar ({attachedFiles.length}):
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

            {/* Sección de Proyecto - Visible para todos */}
            <div className="form-section">
              <h2>
                <Folder size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Proyecto
              </h2>
              <div className="form-group">
                <label htmlFor="projects_id">
                  <MapPin size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Selecciona el proyecto relacionado
                </label>
                <select
                  id="projects_id"
                  name="projects_id"
                  value={formData.projects_id}
                  onChange={handleChange}
                >
                  <option value={0}>-- Seleccionar proyecto --</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sección de Asignación - Solo visible para técnicos y admins */}
            {!isClient && (
              <div className="form-section">
                <h2>Asignación</h2>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="locations_id">
                      <MapPin size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Ubicación
                    </label>
                    <select
                      id="locations_id"
                      name="locations_id"
                      value={formData.locations_id}
                      onChange={handleChange}
                    >
                      <option value={0}>-- Seleccionar ubicación --</option>
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
                      Área / Grupo
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
                      Asignar a (Técnico)
                      {formData._groups_id_assign > 0 && technicians.length > 0 && (
                        <span style={{ fontSize: '11px', color: '#666', marginLeft: 8 }}>
                          ({technicians.length} del grupo)
                        </span>
                      )}
                    </label>
                    <select
                      id="_users_id_assign"
                      name="_users_id_assign"
                      value={formData._users_id_assign}
                      onChange={handleChange}
                    >
                      <option value={0}>
                        {formData._groups_id_assign > 0
                          ? technicians.length > 0
                            ? '-- Seleccionar técnico del grupo --'
                            : '-- No hay técnicos en este grupo --'
                          : '-- Sin asignar --'}
                      </option>
                      {technicians.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.realname ? `${tech.realname} ${tech.firstname || ''}`.trim() : tech.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Sección de Priorización - Visible para todos */}
            <div className="form-section">
              <h2>Priorización</h2>

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
                {loading ? (attachedFiles.length > 0 ? 'Subiendo archivos...' : 'Guardando...') : 'Crear Ticket'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
