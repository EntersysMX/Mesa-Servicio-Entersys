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
        items_id: ticketId,
        content: content,
        is_private: options.isPrivate ? 1 : 0,
      };

      // Agregar fuente de solicitud si se especifica (para tracking)
      if (options.requestsource_id) {
        followupData.requesttypes_id = options.requestsource_id;
      }

      const response = await this.api.post('/ITILFollowup', {
        input: followupData,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Obtener información del solicitante del ticket con email
  async getTicketRequester(ticketId) {
    try {
      console.log('📧 Obteniendo solicitante del ticket:', ticketId);
      const ticketUsers = await this.api.get(`/Ticket/${ticketId}/Ticket_User`);
      const users = ticketUsers.data || [];
      console.log('Usuarios del ticket:', users);

      // Tipo 1 = Solicitante
      const requester = users.find(u => u.type === 1);
      console.log('Solicitante encontrado:', requester);

      if (requester && requester.users_id) {
        const userData = await this.getUser(requester.users_id);
        console.log('Datos del usuario:', userData);

        // Intentar obtener email de múltiples fuentes
        let email = userData.email;

        // Fuente 1: Campo email directo
        if (!email && userData.email) {
          email = userData.email;
        }

        // Fuente 2: Campo _useremails
        if (!email && userData._useremails && userData._useremails.length > 0) {
          email = userData._useremails[0];
          console.log('Email de _useremails:', email);
        }

        // Fuente 3: Endpoint UserEmail
        if (!email) {
          try {
            const userEmails = await this.api.get(`/User/${requester.users_id}/UserEmail`);
            const emails = Array.isArray(userEmails.data) ? userEmails.data : [];
            console.log('UserEmail response:', emails);
            const primaryEmail = emails.find(e => e.is_default === 1) || emails[0];
            if (primaryEmail) {
              email = primaryEmail.email;
              console.log('Email de UserEmail:', email);
            }
          } catch (e) {
            console.log('No se pudo obtener UserEmail:', e.message);
          }
        }

        // Fuente 4: Buscar en los campos del usuario expandido
        if (!email) {
          // Algunos GLPI usan campos personalizados
          const possibleEmailFields = ['useremail', 'email_address', 'mail', 'email1'];
          for (const field of possibleEmailFields) {
            if (userData[field]) {
              email = userData[field];
              console.log(`Email encontrado en campo ${field}:`, email);
              break;
            }
          }
        }

        userData.email = email;
        console.log('📧 Email final del solicitante:', email || 'NO ENCONTRADO');
        return userData;
      }
      return null;
    } catch (error) {
      console.error('Error getting requester:', error);
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

  // Categorías
  async getCategories(params = {}) {
    return this.getItems('ITILCategory', params);
  }

  // Entidades
  async getEntities(params = {}) {
    return this.getItems('Entity', params);
  }

  // Grupos
  async getGroups(params = {}) {
    return this.getItems('Group', { range: '0-100', ...params });
  }

  // Ubicaciones/Proyectos
  async getLocations(params = {}) {
    return this.getItems('Location', { range: '0-100', ...params });
  }

  // Técnicos - SOLO usuarios con perfil Technician/Admin/Super-Admin
  async getTechnicians(params = {}) {
    try {
      console.log('========================================');
      console.log('=== OBTENIENDO TÉCNICOS ===');
      console.log('========================================');

      // Nombres de perfiles que son TÉCNICOS (no clientes)
      const TECH_PROFILE_NAMES = ['technician', 'técnico', 'tecnico', 'admin', 'super-admin', 'supervisor'];
      // Nombres de perfiles que son CLIENTES (excluir)
      const CLIENT_PROFILE_NAMES = ['self-service', 'observer', 'hotliner'];

      // 1. Obtener TODOS los perfiles de GLPI
      let allProfiles = [];
      let techProfileIds = [];

      try {
        const profilesRes = await this.api.get('/Profile', { params: { range: '0-50' } });
        allProfiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];

        console.log('📋 PERFILES EN GLPI:');
        allProfiles.forEach(p => {
          const name = (p.name || '').toLowerCase();
          const esTecnico = TECH_PROFILE_NAMES.some(n => name.includes(n));
          const esCliente = CLIENT_PROFILE_NAMES.some(n => name.includes(n));
          const tipo = esTecnico ? '🔧 TÉCNICO' : (esCliente ? '👤 CLIENTE' : '❓ OTRO');
          console.log(`   ID:${p.id} "${p.name}" → ${tipo}`);

          if (esTecnico) {
            techProfileIds.push(Number(p.id));
          }
        });
      } catch (e) {
        console.log('❌ Error obteniendo perfiles:', e.message);
        return [];
      }

      if (techProfileIds.length === 0) {
        console.log('❌ No se encontraron perfiles de técnico');
        return [];
      }

      console.log('🔧 IDs de perfiles TÉCNICOS:', techProfileIds);

      // 2. Obtener todos los usuarios activos
      const usersRes = await this.api.get('/User', {
        params: { range: '0-100', is_active: 1 }
      });
      const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
      console.log('👥 Usuarios activos:', allUsers.length);

      if (allUsers.length === 0) {
        return [];
      }

      // Crear mapa de usuarios para búsqueda rápida
      const userMap = new Map();
      allUsers.forEach(u => userMap.set(Number(u.id), u));

      // 3. Obtener relaciones Profile_User
      let profileUsers = [];
      try {
        const puRes = await this.api.get('/Profile_User', { params: { range: '0-500' } });
        profileUsers = Array.isArray(puRes.data) ? puRes.data : [];
        console.log('🔗 Relaciones Profile_User:', profileUsers.length);
      } catch (e) {
        console.log('❌ Error obteniendo Profile_User:', e.message);
        return [];
      }

      // Crear mapa de perfiles para búsqueda rápida
      const profileMap = new Map();
      allProfiles.forEach(p => profileMap.set(Number(p.id), p.name));

      // 4. Filtrar SOLO usuarios con perfil técnico
      const techUserIds = new Set();

      console.log('🔍 USUARIOS CON PERFIL TÉCNICO:');
      profileUsers.forEach(pu => {
        const profileId = Number(pu.profiles_id);
        const userId = Number(pu.users_id);
        const profileName = profileMap.get(profileId) || `ID:${profileId}`;
        const user = userMap.get(userId);

        if (techProfileIds.includes(profileId) && user) {
          console.log(`   ✅ ${user.name || user.realname} (ID:${userId}) - Perfil: ${profileName}`);
          techUserIds.add(userId);
        }
      });

      if (techUserIds.size === 0) {
        console.log('❌ No hay usuarios con perfil técnico');
        return [];
      }

      // 5. Retornar solo los técnicos
      const technicians = allUsers.filter(u => techUserIds.has(Number(u.id)));

      console.log('✅ TÉCNICOS FINALES:', technicians.length);
      technicians.forEach(t => {
        console.log(`   - ${t.name || t.realname} (ID:${t.id})`);
      });

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

  // Asignar ticket a usuario
  async assignTicketToUser(ticketId, userId) {
    try {
      const response = await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 2, // 2 = asignado
        },
      });
      return response.data;
    } catch (error) {
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
      }

      if (criteria.length > 0) {
        return this.search('Ticket', criteria, {
          range: params.range || '0-50',
          order: 'DESC',
          ...params,
        });
      } else {
        // Sin filtros, obtener todos
        const result = await this.getTickets({
          range: params.range || '0-50',
          order: 'DESC',
          ...params,
        });
        return {
          data: Array.isArray(result) ? result : [],
          totalcount: Array.isArray(result) ? result.length : 0,
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
