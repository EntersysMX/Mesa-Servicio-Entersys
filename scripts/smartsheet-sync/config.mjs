/**
 * Configuración para sincronización Smartsheet ↔ GLPI
 * Lee variables de entorno (para Docker) o usa valores por defecto
 */

export const CONFIG = {
  // Smartsheet
  smartsheet: {
    apiToken: process.env.SMARTSHEET_TOKEN || '***SMARTSHEET_TOKEN_REMOVED***',
    sheetId: process.env.SMARTSHEET_SHEET_ID || '6629881724331908',
    baseUrl: 'https://api.smartsheet.com/2.0',
  },

  // GLPI
  glpi: {
    url: process.env.GLPI_URL || 'https://glpi.entersys.mx/apirest.php',
    appToken: process.env.GLPI_APP_TOKEN || '***GLPI_APP_TOKEN_REMOVED***',
    username: process.env.GLPI_USERNAME || 'glpi',
    password: process.env.GLPI_PASSWORD || 'glpi',
  },

  // Mapeo de columnas Smartsheet → GLPI
  columnMapping: {
    'No.Ticket': 'external_id',
    'Problema': 'content',
    'Estado del Ticket': 'status',
    'Modulo': 'category',
    'Técnico asignado': 'technician',
    'Urgencia': 'urgency',
    'Área': 'group',
    'Correo electrónico': 'requester_email',
    'Unidad Operativa': 'location',
    'Comentarios / Acciónes de resolución': 'followup',
    'Fecha de solicitud': 'date_creation',
    'Fecha de cierre': 'date_solved',
    'Estado': 'status_detail',
  },

  // Mapeo de estados
  statusMapping: {
    'Ticket Abierto': 1,
    'Ticket Cerrado': 6,
    '1 - Nuevo': 1,
    '2 - En curso (asignado)': 2,
    '3 - En curso (planificado)': 3,
    '4 - Esperando respuesta': 4,
    '5 - Solucionado': 5,
    '6 - Cerrado': 6,
  },

  // Mapeo de urgencia
  urgencyMapping: {
    '1 - Alto-Urgente': 5,
    '2 - Medio-Tengo inconvenientes': 3,
    '3 - Bajo-Informativo': 1,
    'default': 3,
  },

  // Intervalo de sincronización (en minutos)
  syncInterval: parseInt(process.env.SYNC_INTERVAL) || 5,
};

export default CONFIG;
