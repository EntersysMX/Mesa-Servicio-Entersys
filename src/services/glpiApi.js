import axios from 'axios';

// Configuración hardcodeada como fallback - Producción
const FALLBACK_CONFIG = {
  glpiUrl: import.meta.env.VITE_GLPI_URL || 'https://glpi.entersys.mx',
  appToken: import.meta.env.VITE_GLPI_APP_TOKEN || '***GLPI_APP_TOKEN_REMOVED***',
  userToken: import.meta.env.VITE_GLPI_USER_TOKEN || '',
};

// Obtener configuración (runtime o fallback)
const getConfig = () => {
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG) {
    return {
      glpiUrl: window.RUNTIME_CONFIG.GLPI_URL || FALLBACK_CONFIG.glpiUrl,
      appToken: window.RUNTIME_CONFIG.GLPI_APP_TOKEN || FALLBACK_CONFIG.appToken,
      userToken: window.RUNTIME_CONFIG.GLPI_USER_TOKEN || FALLBACK_CONFIG.userToken,
    };
  }
  return FALLBACK_CONFIG;
};

const API_PATH = '/api.php/v1';

class GlpiApiService {
  constructor() {
    const config = getConfig();
    this.baseUrl = `${config.glpiUrl}${API_PATH}`;
    this.sessionToken = null;
    this.userToken = config.userToken;
    this.appToken = config.appToken;

    console.log('GLPI API Config:', {
      baseUrl: this.baseUrl,
      appToken: this.appToken ? 'SET' : 'NOT SET'
    });

    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.api.interceptors.request.use((reqConfig) => {
      // Obtener appToken fresco cada vez
      const currentConfig = getConfig();
      if (currentConfig.appToken) {
        reqConfig.headers['App-Token'] = currentConfig.appToken;
      }
      if (this.sessionToken) {
        reqConfig.headers['Session-Token'] = this.sessionToken;
      }
      return reqConfig;
    });
  }

  // Autenticación
  async initSession(username, password) {
    try {
      const credentials = btoa(`${username}:${password}`);
      const response = await this.api.get('/initSession', {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });
      this.sessionToken = response.data.session_token;
      localStorage.setItem('glpi_session_token', this.sessionToken);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async initSessionWithToken(userToken) {
    try {
      const response = await this.api.get('/initSession', {
        headers: {
          Authorization: `user_token ${userToken}`,
        },
      });
      this.sessionToken = response.data.session_token;
      localStorage.setItem('glpi_session_token', this.sessionToken);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async killSession() {
    try {
      await this.api.get('/killSession');
      this.sessionToken = null;
      localStorage.removeItem('glpi_session_token');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  restoreSession() {
    const token = localStorage.getItem('glpi_session_token');
    if (token) {
      this.sessionToken = token;
      return true;
    }
    return false;
  }

  hasUserToken() {
    return !!this.userToken;
  }

  async autoLoginWithUserToken() {
    if (!this.userToken) {
      throw new Error('No hay User Token configurado');
    }
    return this.initSessionWithToken(this.userToken);
  }

  // Obtener perfil del usuario actual
  async getFullSession() {
    try {
      const response = await this.api.get('/getFullSession');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getMyProfiles() {
    try {
      const response = await this.api.get('/getMyProfiles');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // CRUD Genérico
  async getItems(itemtype, params = {}) {
    try {
      const response = await this.api.get(`/${itemtype}`, { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getItem(itemtype, id, params = {}) {
    try {
      const response = await this.api.get(`/${itemtype}/${id}`, { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createItem(itemtype, data) {
    try {
      const response = await this.api.post(`/${itemtype}`, { input: data });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateItem(itemtype, id, data) {
    try {
      const response = await this.api.put(`/${itemtype}/${id}`, { input: data });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteItem(itemtype, id, params = {}) {
    try {
      const response = await this.api.delete(`/${itemtype}/${id}`, { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Búsqueda avanzada
  async search(itemtype, criteria = [], params = {}) {
    try {
      const searchParams = { ...params };
      criteria.forEach((criterion, index) => {
        Object.keys(criterion).forEach((key) => {
          searchParams[`criteria[${index}][${key}]`] = criterion[key];
        });
      });
      const response = await this.api.get(`/search/${itemtype}`, { params: searchParams });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Tickets - Métodos específicos
  async getTickets(params = {}) {
    return this.getItems('Ticket', {
      expand_dropdowns: true,
      ...params,
    });
  }

  async getTicket(id) {
    return this.getItem('Ticket', id, {
      expand_dropdowns: true,
      with_logs: true,
    });
  }

  // Obtener información de SLA del ticket
  async getTicketSLA(ticketId) {
    try {
      const ticket = await this.getTicket(ticketId);

      // Campos de SLA en GLPI
      const slaInfo = {
        // Tiempo para tomar el ticket (Time To Own)
        tto: {
          sla_id: ticket.slas_id_tto,
          target_date: ticket.time_to_own,
          status: this.calculateSLAStatus(ticket.time_to_own, ticket.takeintoaccount_delay_stat),
        },
        // Tiempo para resolver (Time To Resolve)
        ttr: {
          sla_id: ticket.slas_id_ttr,
          target_date: ticket.time_to_resolve,
          status: this.calculateSLAStatus(ticket.time_to_resolve, ticket.solve_delay_stat),
        },
        // Tiempos reales
        stats: {
          takeinto_delay: ticket.takeintoaccount_delay_stat, // Minutos para tomar
          solve_delay: ticket.solve_delay_stat, // Minutos para resolver
          waiting_duration: ticket.waiting_duration, // Tiempo en espera
          close_delay: ticket.close_delay_stat, // Tiempo para cerrar
        },
        // Fechas importantes
        dates: {
          created: ticket.date,
          modified: ticket.date_mod,
          solved: ticket.solvedate,
          closed: ticket.closedate,
          due: ticket.time_to_resolve,
        },
        // Estado actual
        status: ticket.status,
        urgency: ticket.urgency,
        priority: ticket.priority,
        impact: ticket.impact,
      };

      return slaInfo;
    } catch (error) {
      console.error('Error obteniendo SLA:', error);
      return null;
    }
  }

  // Calcular estado del SLA
  calculateSLAStatus(targetDate, actualDelay) {
    if (!targetDate) return { status: 'none', label: 'Sin SLA', color: 'gray' };

    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;
    const diffMinutes = diffMs / (1000 * 60);
    const diffHours = diffMinutes / 60;

    // Si ya se resolvió/tomó
    if (actualDelay !== null && actualDelay !== undefined) {
      const targetMinutes = (target - new Date(target).setHours(0,0,0,0)) / (1000 * 60);
      if (actualDelay <= targetMinutes || diffMs >= 0) {
        return { status: 'met', label: 'Cumplido', color: 'success' };
      } else {
        return { status: 'breached', label: 'Vencido', color: 'danger' };
      }
    }

    // Aún en curso
    if (diffMs < 0) {
      return { status: 'breached', label: 'Vencido', color: 'danger', overdue: true };
    } else if (diffHours <= 1) {
      return { status: 'critical', label: 'Crítico', color: 'danger', remaining: diffMinutes };
    } else if (diffHours <= 4) {
      return { status: 'warning', label: 'En riesgo', color: 'warning', remaining: diffMinutes };
    } else {
      return { status: 'ok', label: 'En tiempo', color: 'success', remaining: diffMinutes };
    }
  }

  // Formatear tiempo restante
  formatTimeRemaining(minutes) {
    if (minutes < 0) {
      const absMinutes = Math.abs(minutes);
      if (absMinutes < 60) return `Vencido hace ${Math.round(absMinutes)} min`;
      if (absMinutes < 1440) return `Vencido hace ${Math.round(absMinutes / 60)} hrs`;
      return `Vencido hace ${Math.round(absMinutes / 1440)} días`;
    }
    if (minutes < 60) return `${Math.round(minutes)} min restantes`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hrs restantes`;
    return `${Math.round(minutes / 1440)} días restantes`;
  }

  // Obtener SLAs disponibles
  async getSLAs(params = {}) {
    try {
      const response = await this.api.get('/SLA', { params: { range: '0-50', ...params } });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.log('Error obteniendo SLAs:', error.message);
      return [];
    }
  }

  // Obtener OLAs (Operational Level Agreement)
  async getOLAs(params = {}) {
    try {
      const response = await this.api.get('/OLA', { params: { range: '0-50', ...params } });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.log('Error obteniendo OLAs:', error.message);
      return [];
    }
  }

  async createTicket(ticketData) {
    return this.createItem('Ticket', ticketData);
  }

  async updateTicket(id, ticketData) {
    return this.updateItem('Ticket', id, ticketData);
  }

  async deleteTicket(id) {
    return this.deleteItem('Ticket', id, { force_purge: true });
  }

  async getTicketFollowups(ticketId) {
    try {
      const response = await this.api.get(`/Ticket/${ticketId}/ITILFollowup`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async addTicketFollowup(ticketId, content, options = {}) {
    try {
      const followupData = {
        itemtype: 'Ticket',
        items_id: parseInt(ticketId, 10),
        content: content,
        is_private: options.isPrivate ? 1 : 0,
      };

      const response = await this.api.post('/ITILFollowup', {
        input: followupData,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Subir documento a GLPI
  async uploadDocument(file, ticketId = null) {
    try {
      // Crear FormData para enviar el archivo
      const formData = new FormData();
      formData.append('uploadManifest', JSON.stringify({
        input: {
          name: file.name,
          _filename: [file.name]
        }
      }));
      formData.append('filename[0]', file);

      const response = await this.api.post('/Document', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const documentId = response.data?.id;
      console.log('📎 Documento subido:', documentId);

      // Si hay ticketId, asociar el documento al ticket
      if (documentId && ticketId) {
        await this.linkDocumentToTicket(documentId, ticketId);
      }

      return response.data;
    } catch (error) {
      console.error('Error subiendo documento:', error);
      throw this.handleError(error);
    }
  }

  // Asociar documento a ticket
  async linkDocumentToTicket(documentId, ticketId) {
    try {
      const response = await this.api.post('/Document_Item', {
        input: {
          documents_id: documentId,
          items_id: ticketId,
          itemtype: 'Ticket',
        },
      });
      console.log('📎 Documento asociado al ticket:', response.data);
      return response.data;
    } catch (error) {
      // Si es error de permisos, mostrar mensaje más claro
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('⚠️ Sin permisos para asociar documentos.');
        console.error('   Configurar en GLPI: Perfiles → Self-Service → Gestión → Documentos → "Asociar documento"');
        throw new Error('No tienes permisos para adjuntar archivos. Contacta al administrador.');
      }
      console.error('Error asociando documento:', error);
      throw this.handleError(error);
    }
  }

  // Obtener documentos de un ticket
  async getTicketDocuments(ticketId) {
    try {
      const response = await this.api.get(`/Ticket/${ticketId}/Document_Item`);
      const docItems = response.data || [];

      // Obtener detalles de cada documento
      const documents = await Promise.all(
        docItems.map(async (item) => {
          try {
            const doc = await this.api.get(`/Document/${item.documents_id}`);
            return {
              ...doc.data,
              link_id: item.id,
            };
          } catch (e) {
            return null;
          }
        })
      );

      return documents.filter(d => d !== null);
    } catch (error) {
      // Si es error de permisos, mostrar mensaje más claro
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('⚠️ Sin permisos para ver documentos. Configurar en GLPI: Perfiles → Self-Service → Gestión → Documentos');
      } else {
        console.log('Error obteniendo documentos:', error.message);
      }
      return [];
    }
  }

  // Verificar si el usuario tiene permisos para documentos
  async canAccessDocuments() {
    try {
      await this.api.get('/Document', { params: { range: '0-1' } });
      return true;
    } catch (error) {
      return false;
    }
  }

  // Obtener URL de descarga de documento
  getDocumentDownloadUrl(documentId) {
    return `${this.baseUrl}/Document/${documentId}`;
  }

  // Obtener información del solicitante del ticket con email
  async getTicketRequester(ticketId) {
    try {
      console.log('========================================');
      console.log('📧 OBTENIENDO SOLICITANTE DEL TICKET:', ticketId);
      console.log('========================================');

      // Obtener usuarios relacionados al ticket
      const ticketUsers = await this.api.get(`/Ticket/${ticketId}/Ticket_User`);
      const users = ticketUsers.data || [];

      console.log('👥 Usuarios del ticket:', users);
      console.log('👥 Tipos de usuario encontrados:');
      users.forEach(u => {
        const tipo = u.type === 1 ? 'SOLICITANTE' : (u.type === 2 ? 'ASIGNADO' : `TIPO ${u.type}`);
        console.log(`   - Usuario ID:${u.users_id} → ${tipo}`);
      });

      // Tipo 1 = Solicitante, Tipo 2 = Asignado
      let requester = users.find(u => u.type === 1);

      // Si no hay tipo 1, intentar con el primer usuario
      if (!requester && users.length > 0) {
        console.log('⚠️ No hay usuario tipo 1, usando el primero:', users[0]);
        requester = users[0];
      }

      if (!requester || !requester.users_id) {
        console.log('❌ No se encontró ningún usuario en el ticket');
        return null;
      }

      console.log('Solicitante ID:', requester.users_id);

      // Obtener datos del usuario con expand_dropdowns
      const userData = await this.api.get(`/User/${requester.users_id}`, {
        params: { expand_dropdowns: true, with_emails: true }
      });
      const user = userData.data;

      console.log('📋 DATOS DEL SOLICITANTE:');
      console.log('   ID:', user.id);
      console.log('   Nombre (name):', user.name);
      console.log('   Nombre real (realname):', user.realname);
      console.log('   Apellido (firstname):', user.firstname);
      console.log('   Email directo:', user.email || 'NO TIENE');
      console.log('   _useremails:', user._useremails || 'NO TIENE');
      console.log('   Todos los campos:', Object.keys(user).join(', '));

      // Buscar email en todos los campos posibles
      let email = null;

      // Lista de campos donde puede estar el email
      const emailFields = [
        'email', '_email', 'useremail', 'useremails', '_useremails',
        'email_address', 'mail', 'email1', 'default_email'
      ];

      for (const field of emailFields) {
        if (user[field]) {
          if (Array.isArray(user[field]) && user[field].length > 0) {
            email = user[field][0];
            console.log(`✅ Email encontrado en "${field}" (array):`, email);
            break;
          } else if (typeof user[field] === 'string' && user[field].includes('@')) {
            email = user[field];
            console.log(`✅ Email encontrado en "${field}":`, email);
            break;
          }
        }
      }

      // Si no encontramos, buscar en endpoint UserEmail
      if (!email) {
        try {
          console.log('Buscando en /User/{id}/UserEmail...');
          const userEmails = await this.api.get(`/User/${requester.users_id}/UserEmail`);
          const emails = Array.isArray(userEmails.data) ? userEmails.data : [];
          console.log('UserEmail response:', emails);

          if (emails.length > 0) {
            const primaryEmail = emails.find(e => e.is_default === 1) || emails[0];
            email = primaryEmail?.email;
            console.log(`✅ Email de UserEmail:`, email);
          }
        } catch (e) {
          console.log('❌ Error en UserEmail:', e.message);
        }
      }

      // Buscar cualquier campo que contenga @
      if (!email) {
        console.log('Buscando @ en cualquier campo...');
        for (const [key, value] of Object.entries(user)) {
          if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
            email = value;
            console.log(`✅ Email encontrado en campo "${key}":`, email);
            break;
          }
        }
      }

      // Si el nombre de usuario parece un email, usarlo
      if (!email && user.name && user.name.includes('@') && user.name.includes('.')) {
        email = user.name;
        console.log('✅ Usando nombre de usuario como email:', email);
      }

      user.email = email;
      console.log('========================================');
      console.log('📧 DATOS DEL SOLICITANTE:');
      console.log('   Nombre:', user.name);
      console.log('   Nombre completo:', `${user.realname || ''} ${user.firstname || ''}`.trim() || 'NO TIENE');
      console.log('========================================');
      console.log('📧 EL CORREO DEL SOLICITANTE ES:', email || '❌ NO TIENE CORREO REGISTRADO');
      console.log('========================================');

      return user;
    } catch (error) {
      console.error('❌ Error getting requester:', error);
      return null;
    }
  }

  // Obtener email de un usuario específico
  async getUserEmail(userId) {
    try {
      // Primero intentar con el usuario directamente
      const userData = await this.getUser(userId);
      if (userData.email) return userData.email;
      if (userData._useremails && userData._useremails.length > 0) {
        return userData._useremails[0];
      }

      // Intentar con endpoint UserEmail
      const userEmails = await this.api.get(`/User/${userId}/UserEmail`);
      const emails = Array.isArray(userEmails.data) ? userEmails.data : [];
      const primaryEmail = emails.find(e => e.is_default === 1) || emails[0];
      return primaryEmail?.email || null;
    } catch (e) {
      console.log('Error obteniendo email de usuario:', e.message);
      return null;
    }
  }

  // Enviar notificación manual (si GLPI lo soporta)
  async sendTicketNotification(ticketId, notificationType = 'followup') {
    try {
      // GLPI no tiene un endpoint directo para enviar notificaciones
      // Las notificaciones se envían automáticamente según la configuración
      // Este método es placeholder para documentar la funcionalidad
      console.log(`Notification request for ticket ${ticketId}, type: ${notificationType}`);
      return { success: true, message: 'Las notificaciones dependen de la configuración de GLPI' };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Usuarios
  async getUsers(params = {}) {
    return this.getItems('User', {
      expand_dropdowns: true,
      ...params,
    });
  }

  async getUser(id) {
    return this.getItem('User', id, {
      expand_dropdowns: true,
    });
  }

  // Categorías - usa sesión de servicio si falla con la del usuario
  async getCategories(params = {}) {
    try {
      return await this.getItems('ITILCategory', params);
    } catch (error) {
      // Si falla por permisos, intentar con sesión de servicio
      if (error.message?.includes('permission') || error.message?.includes('RIGHT_MISSING')) {
        console.log('⚠️ Sin permisos para categorías, usando sesión de servicio...');
        return this.getCategoriesWithServiceSession(params);
      }
      throw error;
    }
  }

  // Obtener categorías con sesión de servicio (admin)
  async getCategoriesWithServiceSession(params = {}) {
    try {
      const config = getConfig();
      // Crear sesión temporal con credenciales de servicio
      const credentials = btoa('glpi:glpi');
      const initRes = await this.api.get('/initSession', {
        headers: { Authorization: `Basic ${credentials}` }
      });
      const serviceToken = initRes.data.session_token;

      // Obtener categorías con la sesión de servicio
      const response = await this.api.get('/ITILCategory', {
        params: { range: '0-100', ...params },
        headers: { 'Session-Token': serviceToken }
      });

      // Cerrar sesión de servicio
      await this.api.get('/killSession', {
        headers: { 'Session-Token': serviceToken }
      }).catch(() => {});

      return response.data;
    } catch (error) {
      console.error('Error obteniendo categorías con servicio:', error);
      return [];
    }
  }

  // Entidades
  async getEntities(params = {}) {
    return this.getItems('Entity', params);
  }

  // Grupos
  async getGroups(params = {}) {
    return this.getItems('Group', { range: '0-100', ...params });
  }

  // Ubicaciones
  async getLocations(params = {}) {
    return this.getItems('Location', { range: '0-100', ...params });
  }

  // Proyectos - usa sesión de servicio si falla con la del usuario
  async getProjects(params = {}) {
    try {
      return await this.getItems('Project', { range: '0-100', expand_dropdowns: true, ...params });
    } catch (error) {
      // Si falla por permisos, intentar con sesión de servicio
      if (error.message?.includes('permission') || error.message?.includes('RIGHT_MISSING')) {
        console.log('⚠️ Sin permisos para proyectos, usando sesión de servicio...');
        return this.getProjectsWithServiceSession(params);
      }
      throw error;
    }
  }

  // Obtener proyectos con sesión de servicio (admin)
  async getProjectsWithServiceSession(params = {}) {
    try {
      // Crear sesión temporal con credenciales de servicio
      const credentials = btoa('glpi:glpi');
      const initRes = await this.api.get('/initSession', {
        headers: { Authorization: `Basic ${credentials}` }
      });
      const serviceToken = initRes.data.session_token;

      // Obtener proyectos con la sesión de servicio
      const response = await this.api.get('/Project', {
        params: { range: '0-100', expand_dropdowns: true, ...params },
        headers: { 'Session-Token': serviceToken }
      });

      // Cerrar sesión de servicio
      await this.api.get('/killSession', {
        headers: { 'Session-Token': serviceToken }
      }).catch(() => {});

      return response.data;
    } catch (error) {
      console.error('Error obteniendo proyectos con servicio:', error);
      return [];
    }
  }

  // Asociar ticket a proyecto
  async linkTicketToProject(ticketId, projectId) {
    try {
      console.log(`📂 Asociando ticket ${ticketId} al proyecto ${projectId}`);
      const response = await this.api.post('/Itil_Project', {
        input: {
          itemtype: 'Ticket',
          items_id: ticketId,
          projects_id: projectId,
        },
      });
      console.log('✅ Ticket asociado al proyecto');
      return response.data;
    } catch (error) {
      console.error('Error asociando ticket a proyecto:', error);
      throw this.handleError(error);
    }
  }

  // Técnicos - Obtener usuarios que pueden ser asignados a tickets
  async getTechnicians(params = {}) {
    try {
      console.log('=== OBTENIENDO TÉCNICOS ===');

      // Perfiles que pueden ser técnicos (IDs estándar de GLPI):
      // 3: Admin, 4: Super-Admin, 6: Technician, 7: Supervisor
      // Excluir: 1: Self-Service, 2: Observer, 5: Hotliner (solo lectura)
      const technicianProfiles = [3, 4, 6, 7];

      // Primero obtener Profile_User para saber qué usuarios tienen perfiles de técnico
      let technicianUserIds = new Set();
      try {
        const profileUsersRes = await this.api.get('/Profile_User', {
          params: { range: '0-500' }
        });
        const profileUsers = Array.isArray(profileUsersRes.data) ? profileUsersRes.data : [];

        // Filtrar usuarios que tienen un perfil de técnico
        profileUsers.forEach(pu => {
          if (technicianProfiles.includes(Number(pu.profiles_id))) {
            technicianUserIds.add(Number(pu.users_id));
          }
        });
        console.log(`🔧 Usuarios con perfil técnico: ${technicianUserIds.size}`);
      } catch (e) {
        console.log('Error obteniendo Profile_User:', e.message);
        // Si falla, intentar método alternativo
      }

      // Obtener usuarios activos
      let allUsers = [];
      try {
        const usersRes = await this.api.get('/User', {
          params: { range: '0-200', is_active: 1 }
        });
        allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
        console.log(`👥 Usuarios activos: ${allUsers.length}`);
      } catch (e) {
        console.log('Error obteniendo usuarios:', e.message);
        return [];
      }

      if (allUsers.length === 0) {
        return [];
      }

      // Usuarios de sistema a excluir
      const systemUsers = ['glpi', 'post-only', 'normal', 'glpi-system', 'api'];

      // Filtrar solo técnicos
      const technicians = allUsers.filter(u => {
        const name = (u.name || '').toLowerCase();
        const id = Number(u.id);

        // Excluir usuarios de sistema
        if (systemUsers.includes(name)) return false;

        // Excluir IDs muy bajos (usuarios de sistema)
        if (id <= 2) return false;

        // Solo incluir si tiene perfil de técnico
        if (technicianUserIds.size > 0) {
          return technicianUserIds.has(id);
        }

        // Si no pudimos obtener Profile_User, excluir usuarios que parecen clientes
        // (tienen @ en el nombre, indica que es un email usado como username)
        if (name.includes('@')) return false;

        return true;
      });

      console.log(`✅ Técnicos disponibles: ${technicians.length}`);
      technicians.forEach(t => console.log(`   - ${t.name || t.realname} (ID:${t.id})`));

      return technicians;

    } catch (error) {
      console.error('❌ ERROR getTechnicians:', error);
      return [];
    }
  }

  // Obtener usuarios de un grupo
  async getGroupUsers(groupId) {
    try {
      const response = await this.api.get(`/Group/${groupId}/Group_User`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Obtener técnicos de un grupo específico
  async getTechniciansByGroup(groupId) {
    try {
      console.log(`🔍 Obteniendo técnicos del grupo ${groupId}...`);

      // Obtener usuarios del grupo
      const groupUsers = await this.api.get(`/Group/${groupId}/Group_User`);
      const userIds = (groupUsers.data || []).map(gu => gu.users_id);

      if (userIds.length === 0) {
        console.log('⚠️ No hay usuarios en este grupo');
        return [];
      }

      console.log(`👥 IDs de usuarios en grupo: ${userIds.join(', ')}`);

      // Obtener todos los técnicos
      const allTechnicians = await this.getTechnicians();

      // Filtrar solo los que pertenecen al grupo
      const groupTechnicians = allTechnicians.filter(tech =>
        userIds.includes(tech.id)
      );

      console.log(`✅ Técnicos del grupo: ${groupTechnicians.length}`);
      groupTechnicians.forEach(t => console.log(`   - ${t.realname || t.name} (ID:${t.id})`));

      return groupTechnicians;
    } catch (error) {
      console.error('Error obteniendo técnicos del grupo:', error);
      return [];
    }
  }

  // Obtener mapeo de grupos a técnicos
  async getGroupTechniciansMap() {
    try {
      console.log('🗺️ Cargando mapeo de grupos-técnicos...');

      // Obtener todos los Group_User
      const response = await this.api.get('/Group_User', { params: { range: '0-500' } });
      const groupUsers = response.data || [];
      console.log('📋 Group_User obtenidos:', groupUsers.length);

      // Obtener todos los técnicos
      const technicians = await this.getTechnicians();
      // Usar números para comparación consistente
      const technicianIds = new Set(technicians.map(t => Number(t.id)));
      console.log('👥 Técnicos IDs:', Array.from(technicianIds));

      // Crear mapeo: groupId -> [technicianIds]
      const groupMap = {};
      groupUsers.forEach(gu => {
        const groupId = Number(gu.groups_id);
        const userId = Number(gu.users_id);

        // Solo incluir si es técnico
        if (technicianIds.has(userId)) {
          if (!groupMap[groupId]) {
            groupMap[groupId] = [];
          }
          if (!groupMap[groupId].includes(userId)) {
            groupMap[groupId].push(userId);
          }
        }
      });

      console.log('✅ Mapeo de grupos cargado:', JSON.stringify(groupMap));
      return groupMap;
    } catch (error) {
      console.error('Error obteniendo mapeo de grupos:', error);
      return {};
    }
  }

  // Asignar ticket a grupo
  async assignTicketToGroup(ticketId, groupId) {
    try {
      const response = await this.api.post('/Group_Ticket', {
        input: {
          tickets_id: ticketId,
          groups_id: groupId,
          type: 2, // 2 = asignado
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Asignar ticket a usuario (técnico)
  async assignTicketToUser(ticketId, userId) {
    try {
      const response = await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 2, // 2 = asignado (técnico)
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Asignar solicitante al ticket
  async assignTicketRequester(ticketId, userId) {
    try {
      console.log(`👤 Asignando solicitante ${userId} al ticket ${ticketId}`);
      const response = await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 1, // 1 = solicitante (requester)
        },
      });
      console.log('✅ Solicitante asignado correctamente');
      return response.data;
    } catch (error) {
      // Si ya existe, ignorar el error
      if (error.response?.data?.[1]?.includes('Duplicate')) {
        console.log('ℹ️ El solicitante ya estaba asignado');
        return { already_exists: true };
      }
      throw this.handleError(error);
    }
  }

  // Estadísticas básicas
  async getTicketStats() {
    try {
      const [newTickets, inProgress, solved, closed] = await Promise.all([
        this.search('Ticket', [{ field: 12, searchtype: 'equals', value: 1 }], { range: '0-0' }),
        this.search('Ticket', [{ field: 12, searchtype: 'equals', value: 2 }], { range: '0-0' }),
        this.search('Ticket', [{ field: 12, searchtype: 'equals', value: 5 }], { range: '0-0' }),
        this.search('Ticket', [{ field: 12, searchtype: 'equals', value: 6 }], { range: '0-0' }),
      ]);

      return {
        new: newTickets.totalcount || 0,
        inProgress: inProgress.totalcount || 0,
        solved: solved.totalcount || 0,
        closed: closed.totalcount || 0,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Estadísticas para técnico (solo sus tickets asignados)
  async getTechnicianTicketStats(userId) {
    try {
      const [assigned, newTickets, inProgress] = await Promise.all([
        this.search('Ticket', [{ field: 5, searchtype: 'equals', value: userId }], { range: '0-0' }),
        this.search('Ticket', [
          { field: 5, searchtype: 'equals', value: userId },
          { field: 12, searchtype: 'equals', value: 1, link: 'AND' },
        ], { range: '0-0' }),
        this.search('Ticket', [
          { field: 5, searchtype: 'equals', value: userId },
          { field: 12, searchtype: 'equals', value: 2, link: 'AND' },
        ], { range: '0-0' }),
      ]);

      return {
        assigned: assigned.totalcount || 0,
        new: newTickets.totalcount || 0,
        inProgress: inProgress.totalcount || 0,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Buscar tickets asignados a un usuario específico
  async getTicketsAssignedToUser(userId, params = {}) {
    try {
      const criteria = [
        { field: 5, searchtype: 'equals', value: userId }, // field 5 = assigned user
      ];
      return this.search('Ticket', criteria, {
        range: params.range || '0-50',
        order: 'DESC',
        ...params,
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Buscar tickets asignados a un grupo específico
  async getTicketsAssignedToGroup(groupId, params = {}) {
    try {
      const criteria = [
        { field: 8, searchtype: 'equals', value: groupId }, // field 8 = assigned group
      ];
      return this.search('Ticket', criteria, {
        range: params.range || '0-50',
        order: 'DESC',
        ...params,
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Buscar tickets creados por un usuario específico
  async getTicketsCreatedByUser(userId, params = {}) {
    try {
      const criteria = [
        { field: 4, searchtype: 'equals', value: userId }, // field 4 = requester
      ];
      return this.search('Ticket', criteria, {
        range: params.range || '0-50',
        order: 'DESC',
        ...params,
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Método alternativo para obtener tickets del usuario actual
  // Usa el endpoint /Ticket directamente que debería filtrar por permisos del usuario
  async getMyTickets(params = {}) {
    try {
      console.log('📋 Obteniendo mis tickets con getMyTickets...');

      // Intentar con el endpoint directo primero
      // NOTA: El endpoint /Ticket no soporta sort/order directamente,
      // se hace el ordenamiento en el cliente
      const response = await this.api.get('/Ticket', {
        params: {
          range: params.range || '0-100',
          expand_dropdowns: true,
        }
      });

      let tickets = response.data;
      console.log('📋 Tickets obtenidos:', Array.isArray(tickets) ? tickets.length : 0);

      if (Array.isArray(tickets)) {
        // Ordenar por fecha de modificación descendente (más reciente primero)
        tickets.sort((a, b) => {
          const dateA = new Date(a.date_mod || a.date || 0);
          const dateB = new Date(b.date_mod || b.date || 0);
          return dateB - dateA;
        });
        return tickets;
      }

      return [];
    } catch (error) {
      console.error('Error en getMyTickets:', error);

      // Si falla, intentar con searchTickets
      try {
        const session = await this.getFullSession();
        const userId = session?.session?.glpiID;

        if (userId) {
          console.log('📋 Intentando búsqueda por usuario ID:', userId);
          const result = await this.search('Ticket', [
            { field: 4, searchtype: 'equals', value: userId }
          ], { range: '0-100' });

          return result.data || [];
        }
      } catch (e) {
        console.error('Error en búsqueda alternativa:', e);
      }

      return [];
    }
  }

  // Buscar tickets sin asignar
  async getUnassignedTickets(params = {}) {
    try {
      const criteria = [
        { field: 5, searchtype: 'equals', value: 0 }, // Sin técnico asignado
      ];
      return this.search('Ticket', criteria, {
        range: params.range || '0-50',
        order: 'DESC',
        ...params,
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Búsqueda avanzada de tickets con múltiples filtros
  async searchTicketsAdvanced(filters = {}, params = {}) {
    try {
      const criteria = [];
      let criteriaIndex = 0;

      // Filtro por estado
      if (filters.status && filters.status !== 'all') {
        criteria.push({
          field: 12,
          searchtype: 'equals',
          value: filters.status,
        });
        criteriaIndex++;
      }

      // Filtro por asignación
      if (filters.assignedTo) {
        criteria.push({
          field: 5,
          searchtype: 'equals',
          value: filters.assignedTo,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por grupo asignado
      if (filters.assignedGroup) {
        criteria.push({
          field: 8,
          searchtype: 'equals',
          value: filters.assignedGroup,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por solicitante
      if (filters.requesterId) {
        criteria.push({
          field: 4,
          searchtype: 'equals',
          value: filters.requesterId,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por búsqueda de texto (título)
      if (filters.searchText) {
        criteria.push({
          field: 1,
          searchtype: 'contains',
          value: filters.searchText,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por búsqueda en contenido (para origen)
      if (filters.searchContent) {
        criteria.push({
          field: 21, // Campo de contenido
          searchtype: 'contains',
          value: filters.searchContent,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro para tickets sin asignar
      if (filters.unassigned) {
        criteria.push({
          field: 5,
          searchtype: 'equals',
          value: 0,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por prioridad
      if (filters.priority && filters.priority !== 'all') {
        criteria.push({
          field: 3,
          searchtype: 'equals',
          value: filters.priority,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por fecha desde (fecha de creación)
      if (filters.dateFrom) {
        criteria.push({
          field: 15, // Campo de fecha de creación
          searchtype: 'morethan',
          value: filters.dateFrom,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      // Filtro por fecha hasta (fecha de creación)
      if (filters.dateTo) {
        criteria.push({
          field: 15, // Campo de fecha de creación
          searchtype: 'lessthan',
          value: filters.dateTo,
          link: criteriaIndex > 0 ? 'AND' : undefined,
        });
        criteriaIndex++;
      }

      if (criteria.length > 0) {
        return this.search('Ticket', criteria, {
          range: params.range || '0-50',
          sort: 15, // Campo 15 = fecha de creación
          order: 'DESC', // Más reciente primero
          ...params,
        });
      } else {
        // Sin filtros, obtener todos (el endpoint /Ticket no soporta sort/order)
        const result = await this.getTickets({
          range: params.range || '0-50',
        });
        // Ordenar en el cliente
        let tickets = Array.isArray(result) ? result : [];
        tickets.sort((a, b) => {
          const dateA = new Date(a.date || 0);
          const dateB = new Date(b.date || 0);
          return dateB - dateA;
        });
        return {
          data: tickets,
          totalcount: tickets.length,
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Obtener grupos del usuario actual
  async getMyGroups() {
    try {
      const response = await this.api.get('/getMyEntities');
      return response.data;
    } catch (error) {
      // Si falla, intentar obtener grupos de otra forma
      try {
        const session = await this.getFullSession();
        return session?.session?.glpigroups || [];
      } catch (e) {
        return [];
      }
    }
  }

  // Obtener información de asignaciones del ticket
  async getTicketAssignees(ticketId) {
    try {
      const [users, groups] = await Promise.all([
        this.api.get(`/Ticket/${ticketId}/Ticket_User`).catch(() => ({ data: [] })),
        this.api.get(`/Ticket/${ticketId}/Group_Ticket`).catch(() => ({ data: [] })),
      ]);
      return {
        users: users.data || [],
        groups: groups.data || [],
      };
    } catch (error) {
      return { users: [], groups: [] };
    }
  }

  // Quitar asignación de usuario
  async removeTicketUserAssignment(assignmentId) {
    try {
      const response = await this.api.delete(`/Ticket_User/${assignmentId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Quitar asignación de grupo
  async removeTicketGroupAssignment(assignmentId) {
    try {
      const response = await this.api.delete(`/Group_Ticket/${assignmentId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      const message = error.response.data?.[0] || error.response.data?.message || 'Error en la API de GLPI';
      return new Error(message);
    }
    return error;
  }
}

export const glpiApi = new GlpiApiService();
export default glpiApi;
