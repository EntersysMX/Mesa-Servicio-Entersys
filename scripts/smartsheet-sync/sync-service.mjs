#!/usr/bin/env node
/**
 * Servicio de sincronización Smartsheet → GLPI
 *
 * USO:
 *   node sync-service.mjs migrate    # Migración inicial (todos los tickets)
 *   node sync-service.mjs sync       # Sincronizar cambios recientes
 *   node sync-service.mjs watch      # Modo continuo (cada 5 min)
 */

import axios from 'axios';
import fs from 'fs';
import { CONFIG } from './config.mjs';

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Estado de sincronización
const STATE_FILE = './sync-state.json';
let syncState = {
  lastSync: null,
  ticketsMigrated: [],
  ticketsUpdated: [],
};

// Cargar estado previo
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      syncState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('Estado inicial creado');
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2));
}

// ============ SMARTSHEET API ============
class SmartsheetAPI {
  constructor() {
    this.api = axios.create({
      baseURL: CONFIG.smartsheet.baseUrl,
      headers: {
        'Authorization': `Bearer ${CONFIG.smartsheet.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getSheet() {
    const response = await this.api.get(`/sheets/${CONFIG.smartsheet.sheetId}`);
    return response.data;
  }

  async getRows(modifiedSince = null) {
    let url = `/sheets/${CONFIG.smartsheet.sheetId}`;
    if (modifiedSince) {
      url += `?rowsModifiedSince=${modifiedSince}`;
    }
    const response = await this.api.get(url);
    return response.data;
  }
}

// ============ GLPI API ============
class GlpiAPI {
  constructor() {
    this.sessionToken = null;
    this.api = axios.create({
      baseURL: CONFIG.glpi.url,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async initSession() {
    const credentials = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const response = await this.api.get('/initSession', {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'App-Token': CONFIG.glpi.appToken,
      },
    });
    this.sessionToken = response.data.session_token;
  }

  async killSession() {
    if (!this.sessionToken) return;
    try {
      await this.api.get('/killSession', { headers: this.getHeaders() });
    } catch (e) {}
    this.sessionToken = null;
  }

  getHeaders() {
    return {
      'Session-Token': this.sessionToken,
      'App-Token': CONFIG.glpi.appToken,
    };
  }

  async createTicket(ticketData) {
    const response = await this.api.post('/Ticket', {
      input: ticketData,
    }, { headers: this.getHeaders() });
    return response.data.id;
  }

  async addFollowup(ticketId, content) {
    await this.api.post('/ITILFollowup', {
      input: {
        itemtype: 'Ticket',
        items_id: ticketId,
        content: content,
        is_private: 0,
      },
    }, { headers: this.getHeaders() });
  }

  async searchTicketByExternalId(externalId) {
    try {
      const response = await this.api.get('/search/Ticket', {
        headers: this.getHeaders(),
        params: {
          'criteria[0][field]': 1,  // name
          'criteria[0][searchtype]': 'contains',
          'criteria[0][value]': `[SS-${externalId}]`,
        },
      });
      const data = response.data.data || [];
      return data.length > 0 ? data[0] : null;
    } catch (e) {
      return null;
    }
  }

  async findOrCreateCategory(name) {
    if (!name) return null;
    try {
      const response = await this.api.get('/ITILCategory', {
        headers: this.getHeaders(),
        params: { 'searchText[name]': name },
      });
      const cats = response.data || [];
      const found = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;

      // Crear nueva
      const createRes = await this.api.post('/ITILCategory', {
        input: { name: name, is_incident: 1, is_request: 1 },
      }, { headers: this.getHeaders() });
      return createRes.data.id;
    } catch (e) {
      return null;
    }
  }

  async findOrCreateLocation(name) {
    if (!name) return null;
    try {
      const response = await this.api.get('/Location', {
        headers: this.getHeaders(),
        params: { 'searchText[name]': name },
      });
      const locs = response.data || [];
      const found = locs.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;

      // Crear nueva
      const createRes = await this.api.post('/Location', {
        input: { name: name },
      }, { headers: this.getHeaders() });
      return createRes.data.id;
    } catch (e) {
      return null;
    }
  }

  async findOrCreateGroup(name) {
    if (!name) return null;
    try {
      const response = await this.api.get('/Group', {
        headers: this.getHeaders(),
        params: { 'searchText[name]': name },
      });
      const groups = response.data || [];
      const found = groups.find(g => g.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;

      // Crear nuevo
      const createRes = await this.api.post('/Group', {
        input: { name: name, is_assign: 1, is_requester: 1 },
      }, { headers: this.getHeaders() });
      return createRes.data.id;
    } catch (e) {
      return null;
    }
  }

  async findUserByName(name) {
    if (!name) return null;
    try {
      const response = await this.api.get('/User', {
        headers: this.getHeaders(),
        params: { 'searchText[realname]': name.split(' ')[0] },
      });
      const users = response.data || [];
      return users.length > 0 ? users[0].id : null;
    } catch (e) {
      return null;
    }
  }

  async findUserByEmail(email) {
    if (!email || !email.includes('@')) return null;
    try {
      const response = await this.api.get('/User', {
        headers: this.getHeaders(),
        params: { range: '0-200' },
      });
      const users = response.data || [];
      // Buscar por email en el nombre (algunos usuarios tienen email como login)
      const found = users.find(u =>
        u.name?.toLowerCase() === email.toLowerCase() ||
        u.name?.toLowerCase().includes(email.split('@')[0].toLowerCase())
      );
      return found ? found.id : null;
    } catch (e) {
      return null;
    }
  }

  async assignTicketToUser(ticketId, userId) {
    try {
      await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 2, // Asignado
        },
      }, { headers: this.getHeaders() });
    } catch (e) {}
  }

  async setTicketRequester(ticketId, userId) {
    try {
      await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 1, // Solicitante
        },
      }, { headers: this.getHeaders() });
    } catch (e) {}
  }
}

// ============ SINCRONIZACIÓN ============
class SyncService {
  constructor() {
    this.smartsheet = new SmartsheetAPI();
    this.glpi = new GlpiAPI();
    this.columnMap = {};
  }

  parseRow(row) {
    const data = {};
    for (const cell of row.cells || []) {
      const colName = this.columnMap[cell.columnId];
      if (colName) {
        data[colName] = cell.displayValue || cell.value || '';
      }
    }
    return data;
  }

  getStatus(row) {
    const statusTicket = row['Estado del Ticket'] || '';
    const statusDetail = row['Estado'] || '';

    // Primero revisar estado detallado
    for (const [key, value] of Object.entries(CONFIG.statusMapping)) {
      if (statusDetail.includes(key) || statusTicket.includes(key)) {
        return value;
      }
    }

    // Default
    return statusTicket.includes('Cerrado') ? 6 : 1;
  }

  getUrgency(row) {
    const urgency = row['Urgencia'] || '';
    for (const [key, value] of Object.entries(CONFIG.urgencyMapping)) {
      if (urgency.includes(key.split('-')[0])) {
        return value;
      }
    }
    return CONFIG.urgencyMapping.default;
  }

  async migrateTicket(row) {
    const ticketNum = row['No.Ticket'];
    if (!ticketNum) return null;

    // Verificar si ya existe
    const existing = await this.glpi.searchTicketByExternalId(ticketNum);
    if (existing) {
      return { id: existing.id || existing['2'], skipped: true };
    }

    // Preparar datos del ticket
    const problema = row['Problema'] || 'Sin descripción';
    const titulo = `[SS-${ticketNum}] ${problema.substring(0, 100)}`;

    const ticketData = {
      name: titulo,
      content: `<p><strong>Ticket Smartsheet #${ticketNum}</strong></p>
<p><strong>Problema:</strong><br>${problema}</p>
<p><strong>Unidad Operativa:</strong> ${row['Unidad Operativa'] || 'N/A'}</p>
<p><strong>Área:</strong> ${row['Área'] || 'N/A'}</p>
<p><strong>Solicitante:</strong> ${row['Correo electrónico'] || 'N/A'}</p>`,
      status: this.getStatus(row),
      urgency: this.getUrgency(row),
      type: 1, // Incidente
    };

    // Buscar/crear categoría
    if (row['Modulo']) {
      const catId = await this.glpi.findOrCreateCategory(row['Modulo']);
      if (catId) ticketData.itilcategories_id = catId;
    }

    // Buscar/crear ubicación
    if (row['Unidad Operativa']) {
      const locId = await this.glpi.findOrCreateLocation(row['Unidad Operativa']);
      if (locId) ticketData.locations_id = locId;
    }

    // Crear ticket
    const ticketId = await this.glpi.createTicket(ticketData);

    // Asignar técnico
    if (row['Técnico asignado']) {
      const techId = await this.glpi.findUserByName(row['Técnico asignado']);
      if (techId) {
        await this.glpi.assignTicketToUser(ticketId, techId);
      }
    }

    // Agregar solicitante
    if (row['Correo electrónico']) {
      const requesterId = await this.glpi.findUserByEmail(row['Correo electrónico']);
      if (requesterId) {
        await this.glpi.setTicketRequester(ticketId, requesterId);
      }
    }

    // Agregar comentarios de resolución como seguimiento
    if (row['Comentarios / Acciónes de resolución']) {
      await this.glpi.addFollowup(ticketId, `<p><strong>Resolución (migrado de Smartsheet):</strong></p><p>${row['Comentarios / Acciónes de resolución']}</p>`);
    }

    return { id: ticketId, skipped: false };
  }

  async migrate() {
    console.log(`\n${c.bold}=== Migración Smartsheet → GLPI ===${c.reset}\n`);

    // Obtener datos de Smartsheet
    console.log(`${c.cyan}Obteniendo tickets de Smartsheet...${c.reset}`);
    const sheet = await this.smartsheet.getSheet();

    // Crear mapa de columnas
    for (const col of sheet.columns) {
      this.columnMap[col.id] = col.title;
    }

    const rows = sheet.rows || [];
    console.log(`${c.green}✓${c.reset} ${rows.length} tickets encontrados\n`);

    // Conectar a GLPI
    console.log(`${c.cyan}Conectando a GLPI...${c.reset}`);
    await this.glpi.initSession();
    console.log(`${c.green}✓${c.reset} Conectado\n`);

    // Migrar tickets
    console.log(`${c.cyan}Migrando tickets...${c.reset}\n`);
    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = this.parseRow(rows[i]);
      const ticketNum = row['No.Ticket'];

      if (!ticketNum) continue;

      process.stdout.write(`  [${i + 1}/${rows.length}] Ticket #${ticketNum}... `);

      try {
        const result = await this.migrateTicket(row);

        if (result.skipped) {
          console.log(`${c.yellow}ya existe${c.reset}`);
          results.skipped++;
        } else {
          console.log(`${c.green}OK (ID: ${result.id})${c.reset}`);
          results.created++;
          syncState.ticketsMigrated.push({ ss: ticketNum, glpi: result.id });
        }
      } catch (error) {
        const msg = error.response?.data?.[0] || error.message;
        console.log(`${c.red}ERROR: ${msg}${c.reset}`);
        results.errors.push({ ticket: ticketNum, error: msg });
      }

      // Pequeña pausa para no saturar la API
      await new Promise(r => setTimeout(r, 100));
    }

    await this.glpi.killSession();

    // Guardar estado
    syncState.lastSync = new Date().toISOString();
    saveState();

    // Resumen
    console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
    console.log(`  ${c.green}Creados:${c.reset}  ${results.created}`);
    console.log(`  ${c.yellow}Saltados:${c.reset} ${results.skipped}`);
    console.log(`  ${c.red}Errores:${c.reset}  ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log(`\n${c.red}Errores:${c.reset}`);
      results.errors.slice(0, 10).forEach(e => console.log(`  - #${e.ticket}: ${e.error}`));
      if (results.errors.length > 10) {
        console.log(`  ... y ${results.errors.length - 10} más`);
      }
    }

    console.log('');
  }

  async syncRecent() {
    console.log(`\n${c.bold}=== Sincronizando cambios recientes ===${c.reset}\n`);

    const since = syncState.lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log(`${c.cyan}Buscando cambios desde: ${since}${c.reset}\n`);

    const sheet = await this.smartsheet.getRows(since);

    for (const col of sheet.columns) {
      this.columnMap[col.id] = col.title;
    }

    const rows = sheet.rows || [];

    if (rows.length === 0) {
      console.log(`${c.yellow}No hay cambios nuevos${c.reset}\n`);
      return;
    }

    console.log(`${c.green}✓${c.reset} ${rows.length} tickets modificados\n`);

    await this.glpi.initSession();

    for (const row of rows) {
      const data = this.parseRow(row);
      const ticketNum = data['No.Ticket'];

      if (!ticketNum) continue;

      process.stdout.write(`  Ticket #${ticketNum}... `);

      try {
        const result = await this.migrateTicket(data);
        if (result.skipped) {
          console.log(`${c.yellow}ya existe${c.reset}`);
        } else {
          console.log(`${c.green}creado (ID: ${result.id})${c.reset}`);
        }
      } catch (error) {
        console.log(`${c.red}error${c.reset}`);
      }
    }

    await this.glpi.killSession();

    syncState.lastSync = new Date().toISOString();
    saveState();

    console.log(`\n${c.green}✓${c.reset} Sincronización completada\n`);
  }

  async watch() {
    console.log(`\n${c.bold}=== Modo de sincronización continua ===${c.reset}`);
    console.log(`${c.cyan}Intervalo: cada ${CONFIG.syncInterval} minutos${c.reset}`);
    console.log(`${c.yellow}Presiona Ctrl+C para detener${c.reset}\n`);

    const sync = async () => {
      const now = new Date().toLocaleTimeString();
      console.log(`\n[${now}] Sincronizando...`);
      try {
        await this.syncRecent();
      } catch (error) {
        console.log(`${c.red}Error: ${error.message}${c.reset}`);
      }
    };

    // Primera sincronización inmediata
    await sync();

    // Programar siguientes
    setInterval(sync, CONFIG.syncInterval * 60 * 1000);
  }
}

// ============ MAIN ============
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  loadState();
  const service = new SyncService();

  switch (command) {
    case 'migrate':
      await service.migrate();
      break;

    case 'sync':
      await service.syncRecent();
      break;

    case 'watch':
      await service.watch();
      break;

    default:
      console.log(`
${c.bold}Sincronización Smartsheet ↔ GLPI${c.reset}

${c.cyan}Comandos:${c.reset}
  migrate   Migración inicial (todos los tickets)
  sync      Sincronizar cambios recientes
  watch     Modo continuo (cada ${CONFIG.syncInterval} min)

${c.cyan}Ejemplos:${c.reset}
  node sync-service.mjs migrate
  node sync-service.mjs watch
`);
  }
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
