#!/usr/bin/env node
/**
 * Sincronización BIDIRECCIONAL: Smartsheet ↔ GLPI
 *
 * USO:
 *   node sync-bidireccional.mjs migrate     # Migración inicial
 *   node sync-bidireccional.mjs watch       # Modo continuo (cada 5 min)
 *   node sync-bidireccional.mjs sync-to-ss  # Sincronizar GLPI → Smartsheet
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
  magenta: '\x1b[35m',
};

const STATE_FILE = './sync-state-bidireccional.json';
let syncState = {
  lastSyncFromSS: null,
  lastSyncToSS: null,
  ticketMap: {}, // { glpiId: smartsheetRowId, ... }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      syncState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
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
    this.columnMap = {};
    this.columnIdMap = {};
  }

  async loadColumns() {
    const response = await this.api.get(`/sheets/${CONFIG.smartsheet.sheetId}`);
    for (const col of response.data.columns) {
      this.columnMap[col.id] = col.title;
      this.columnIdMap[col.title] = col.id;
    }
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

  async updateRow(rowId, updates) {
    // Construir celdas a actualizar
    const cells = [];
    for (const [colName, value] of Object.entries(updates)) {
      const colId = this.columnIdMap[colName];
      if (colId) {
        cells.push({
          columnId: colId,
          value: value,
        });
      }
    }

    if (cells.length === 0) return;

    await this.api.put(`/sheets/${CONFIG.smartsheet.sheetId}/rows`, {
      rows: [{
        id: rowId,
        cells: cells,
      }],
    });
  }

  async addRow(data) {
    const cells = [];
    for (const [colName, value] of Object.entries(data)) {
      const colId = this.columnIdMap[colName];
      if (colId && value) {
        cells.push({
          columnId: colId,
          value: value,
        });
      }
    }

    const response = await this.api.post(`/sheets/${CONFIG.smartsheet.sheetId}/rows`, {
      rows: [{
        toBottom: true,
        cells: cells,
      }],
    });

    return response.data.result[0].id;
  }

  parseRow(row) {
    const data = { _rowId: row.id };
    for (const cell of row.cells || []) {
      const colName = this.columnMap[cell.columnId];
      if (colName) {
        data[colName] = cell.displayValue || cell.value || '';
      }
    }
    return data;
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

  async getTicket(id) {
    const response = await this.api.get(`/Ticket/${id}`, {
      headers: this.getHeaders(),
      params: { expand_dropdowns: true },
    });
    return response.data;
  }

  async getTicketsModifiedSince(since) {
    try {
      const response = await this.api.get('/Ticket', {
        headers: this.getHeaders(),
        params: {
          range: '0-500',
          order: 'DESC',
          sort: 'date_mod',
        },
      });

      const tickets = response.data || [];
      const sinceDate = new Date(since);

      return tickets.filter(t => {
        const modDate = new Date(t.date_mod);
        return modDate > sinceDate;
      });
    } catch (e) {
      return [];
    }
  }

  async getTicketFollowups(ticketId) {
    try {
      const response = await this.api.get(`/Ticket/${ticketId}/ITILFollowup`, {
        headers: this.getHeaders(),
      });
      return response.data || [];
    } catch (e) {
      return [];
    }
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

      const createRes = await this.api.post('/Location', {
        input: { name: name },
      }, { headers: this.getHeaders() });
      return createRes.data.id;
    } catch (e) {
      return null;
    }
  }

  async findOrCreateUserByEmail(email, name = null) {
    if (!email) return null;
    try {
      // Buscar usuario por email
      const response = await this.api.get('/User', {
        headers: this.getHeaders(),
        params: {
          'searchText[name]': email,
          range: '0-50'
        },
      });
      const users = response.data || [];

      // Buscar coincidencia exacta por email o nombre de usuario
      let found = users.find(u =>
        u.name?.toLowerCase() === email.toLowerCase() ||
        u.email?.toLowerCase() === email.toLowerCase()
      );

      if (found) return found.id;

      // Si no existe, crear usuario con el email
      const nameParts = name ? name.split(' ') : email.split('@')[0].split('.');
      const createRes = await this.api.post('/User', {
        input: {
          name: email, // username = email
          realname: nameParts[0] || '',
          firstname: nameParts.slice(1).join(' ') || '',
          _useremails: [email],
          is_active: 1,
          profiles_id: 1, // Perfil Self-Service por defecto
        },
      }, { headers: this.getHeaders() });

      console.log(`    ${c.cyan}→ Usuario creado: ${email}${c.reset}`);
      return createRes.data.id;
    } catch (e) {
      console.log(`    ${c.yellow}! No se pudo crear usuario: ${email} - ${e.message}${c.reset}`);
      return null;
    }
  }

  async assignRequesterToTicket(ticketId, userId) {
    if (!ticketId || !userId) return;
    try {
      await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 1, // 1 = Solicitante
        },
      }, { headers: this.getHeaders() });
    } catch (e) {
      // Ya existe la relación o error menor
    }
  }
}

// ============ SINCRONIZACIÓN BIDIRECCIONAL ============
class BidirectionalSync {
  constructor() {
    this.smartsheet = new SmartsheetAPI();
    this.glpi = new GlpiAPI();
  }

  // Mapear estado GLPI a texto Smartsheet
  glpiStatusToSS(status) {
    const map = {
      1: 'Ticket Abierto',
      2: 'Ticket Abierto',
      3: 'Ticket Abierto',
      4: 'Ticket Abierto',
      5: 'Ticket Cerrado',
      6: 'Ticket Cerrado',
    };
    return map[status] || 'Ticket Abierto';
  }

  glpiStatusDetailToSS(status) {
    const map = {
      1: '1 - Nuevo',
      2: '2 - En curso (asignado)',
      3: '3 - En curso (planificado)',
      4: '4 - Esperando respuesta',
      5: '5 - Solucionado',
      6: '6 - Cerrado',
    };
    return map[status] || '1 - Nuevo';
  }

  ssStatusToGlpi(status) {
    if (!status) return 1;
    if (status.includes('Cerrado') || status.includes('Solucionado')) return 5;
    if (status.includes('Esperando')) return 4;
    if (status.includes('En curso')) return 2;
    return 1;
  }

  // Extraer número de ticket de Smartsheet del título de GLPI
  extractSSTicketNum(glpiName) {
    const match = glpiName.match(/\[SS-(\d+)\]/);
    return match ? match[1] : null;
  }

  // Buscar ticket en GLPI por número de Smartsheet
  async findGlpiTicketBySSNumber(ssNumber) {
    try {
      const response = await this.glpi.api.get('/search/Ticket', {
        headers: this.glpi.getHeaders(),
        params: {
          'criteria[0][field]': 1, // Nombre/Título
          'criteria[0][searchtype]': 'contains',
          'criteria[0][value]': `[SS-${ssNumber}]`,
          'forcedisplay[0]': 2, // ID
          'range': '0-1',
        },
      });
      const data = response.data?.data || [];
      if (data.length > 0) {
        return data[0][2]; // Retornar el ID del ticket
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ========== SMARTSHEET → GLPI ==========
  async syncFromSmartsheet() {
    console.log(`\n${c.cyan}[SS → GLPI]${c.reset} Sincronizando desde Smartsheet...`);

    const since = syncState.lastSyncFromSS || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sheet = await this.smartsheet.getRows(since);

    for (const col of sheet.columns) {
      this.smartsheet.columnMap[col.id] = col.title;
      this.smartsheet.columnIdMap[col.title] = col.id;
    }

    const rows = sheet.rows || [];
    let created = 0, updated = 0, skipped = 0;

    for (const row of rows) {
      const data = this.smartsheet.parseRow(row);
      const ticketNum = data['No.Ticket'];
      if (!ticketNum) continue;

      // Buscar si ya existe en GLPI (por mapeo local)
      let glpiId = Object.entries(syncState.ticketMap)
        .find(([gId, ssId]) => ssId === row.id)?.[0];

      // Si no está en el mapeo local, buscar directamente en GLPI
      if (!glpiId) {
        glpiId = await this.findGlpiTicketBySSNumber(ticketNum);
        if (glpiId) {
          // Agregar al mapeo local para futuras consultas
          syncState.ticketMap[glpiId] = row.id;
          skipped++;
          console.log(`  ${c.yellow}→${c.reset} Ticket SS-${ticketNum} ya existe en GLPI (ID: ${glpiId})`);
          continue;
        }
      }

      if (glpiId) {
        // TODO: Actualizar ticket existente si hay cambios
        updated++;
      } else {
        // Crear nuevo ticket
        try {
          const newId = await this.createGlpiTicket(data);
          syncState.ticketMap[newId] = row.id;
          created++;
          console.log(`  ${c.green}✓${c.reset} Ticket #${ticketNum} → GLPI ID: ${newId}`);
        } catch (e) {
          console.log(`  ${c.red}✗${c.reset} Ticket #${ticketNum}: ${e.message}`);
        }
      }
    }

    syncState.lastSyncFromSS = new Date().toISOString();
    saveState(); // Guardar estado después de sincronizar
    console.log(`  ${c.green}Creados: ${created}${c.reset}, Actualizados: ${updated}, ${c.yellow}Ya existían: ${skipped}${c.reset}`);
  }

  async createGlpiTicket(ssData) {
    const ticketNum = ssData['No.Ticket'];
    const problema = ssData['Problema'] || 'Sin descripción';
    const email = ssData['Correo electrónico'] || ssData['Correo Electrónico'] || ssData['Email'] || '';
    const contactName = ssData['Nombre'] || ssData['Solicitante'] || '';

    const ticketData = {
      name: `[SS-${ticketNum}] ${problema.substring(0, 100)}`,
      content: `<p><strong>[ORIGEN:Smartsheet]</strong></p>
<p><strong>Problema:</strong><br>${problema}</p>
<p><strong>Unidad Operativa:</strong> ${ssData['Unidad Operativa'] || 'N/A'}</p>
<p><strong>Área:</strong> ${ssData['Área'] || 'N/A'}</p>`,
      status: this.ssStatusToGlpi(ssData['Estado del Ticket']),
      urgency: 3,
      type: 1,
    };

    // Buscar o crear usuario por email y asignarlo como solicitante
    let requesterId = null;
    if (email) {
      requesterId = await this.glpi.findOrCreateUserByEmail(email, contactName);
      if (requesterId) {
        ticketData._users_id_requester = requesterId;
      }
    }

    if (ssData['Modulo']) {
      const catId = await this.glpi.findOrCreateCategory(ssData['Modulo']);
      if (catId) ticketData.itilcategories_id = catId;
    }

    if (ssData['Unidad Operativa']) {
      const locId = await this.glpi.findOrCreateLocation(ssData['Unidad Operativa']);
      if (locId) ticketData.locations_id = locId;
    }

    const ticketId = await this.glpi.createTicket(ticketData);

    // Si no se asignó el solicitante en la creación, asignarlo después
    if (requesterId && ticketId) {
      await this.glpi.assignRequesterToTicket(ticketId, requesterId);
    }

    return ticketId;
  }

  // ========== GLPI → SMARTSHEET ==========
  async syncToSmartsheet() {
    console.log(`\n${c.magenta}[GLPI → SS]${c.reset} Sincronizando hacia Smartsheet...`);

    const since = syncState.lastSyncToSS || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tickets = await this.glpi.getTicketsModifiedSince(since);

    console.log(`  ${tickets.length} tickets modificados en GLPI`);

    let updated = 0;

    for (const ticket of tickets) {
      const ssRowId = syncState.ticketMap[ticket.id];
      const ssTicketNum = this.extractSSTicketNum(ticket.name);

      if (!ssRowId && !ssTicketNum) {
        // Ticket creado en GLPI, no en Smartsheet - podríamos crear en SS
        continue;
      }

      if (ssRowId) {
        try {
          // Actualizar fila en Smartsheet
          await this.smartsheet.updateRow(ssRowId, {
            'Estado del Ticket': this.glpiStatusToSS(ticket.status),
            'Estado': this.glpiStatusDetailToSS(ticket.status),
          });

          // Si hay seguimientos nuevos, agregar comentario
          const followups = await this.glpi.getTicketFollowups(ticket.id);
          if (followups.length > 0) {
            const lastFollowup = followups[followups.length - 1];
            // Limpiar HTML del contenido
            const cleanContent = lastFollowup.content?.replace(/<[^>]*>/g, '') || '';
            if (cleanContent) {
              await this.smartsheet.updateRow(ssRowId, {
                'Comentarios / Acciónes de resolución': cleanContent.substring(0, 4000),
              });
            }
          }

          updated++;
          console.log(`  ${c.green}✓${c.reset} GLPI #${ticket.id} → SS actualizado`);
        } catch (e) {
          console.log(`  ${c.red}✗${c.reset} GLPI #${ticket.id}: ${e.message}`);
        }
      }
    }

    syncState.lastSyncToSS = new Date().toISOString();
    console.log(`  ${c.green}Actualizados en Smartsheet: ${updated}${c.reset}`);
  }

  // ========== MIGRACIÓN INICIAL ==========
  async migrate() {
    console.log(`\n${c.bold}=== Migración Inicial Smartsheet → GLPI ===${c.reset}\n`);

    await this.smartsheet.loadColumns();
    const sheet = await this.smartsheet.getRows();
    const rows = sheet.rows || [];

    console.log(`${c.green}✓${c.reset} ${rows.length} tickets en Smartsheet\n`);

    await this.glpi.initSession();

    let created = 0, skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const data = this.smartsheet.parseRow(row);
      const ticketNum = data['No.Ticket'];

      if (!ticketNum) continue;

      process.stdout.write(`  [${i + 1}/${rows.length}] #${ticketNum}... `);

      // Verificar si ya está mapeado localmente
      let existingGlpiId = Object.entries(syncState.ticketMap)
        .find(([gId, ssId]) => ssId === row.id)?.[0];

      // Si no está en el mapeo local, buscar directamente en GLPI
      if (!existingGlpiId) {
        existingGlpiId = await this.findGlpiTicketBySSNumber(ticketNum);
        if (existingGlpiId) {
          // Agregar al mapeo local
          syncState.ticketMap[existingGlpiId] = row.id;
        }
      }

      if (existingGlpiId) {
        console.log(`${c.yellow}ya existe (GLPI: ${existingGlpiId})${c.reset}`);
        skipped++;
        continue;
      }

      try {
        const glpiId = await this.createGlpiTicket(data);
        syncState.ticketMap[glpiId] = row.id;

        // Agregar comentario de resolución si existe
        if (data['Comentarios / Acciónes de resolución']) {
          await this.glpi.addFollowup(glpiId,
            `<p><strong>Resolución (migrado de Smartsheet):</strong></p><p>${data['Comentarios / Acciónes de resolución']}</p>`
          );
        }

        console.log(`${c.green}OK (ID: ${glpiId})${c.reset}`);
        created++;
      } catch (e) {
        console.log(`${c.red}ERROR${c.reset}`);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    await this.glpi.killSession();
    saveState();

    console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
    console.log(`  ${c.green}Creados:${c.reset}  ${created}`);
    console.log(`  ${c.yellow}Saltados:${c.reset} ${skipped}`);
  }

  // ========== MODO WATCH ==========
  async watch() {
    console.log(`\n${c.bold}=== Sincronización Bidireccional Continua ===${c.reset}`);
    console.log(`${c.cyan}Smartsheet ↔ GLPI${c.reset}`);
    console.log(`${c.yellow}Intervalo: cada ${CONFIG.syncInterval} minutos${c.reset}`);
    console.log(`${c.yellow}Presiona Ctrl+C para detener${c.reset}\n`);

    await this.smartsheet.loadColumns();

    const sync = async () => {
      const now = new Date().toLocaleTimeString();
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`[${now}] Sincronizando...`);

      try {
        await this.glpi.initSession();

        // Smartsheet → GLPI
        await this.syncFromSmartsheet();

        // GLPI → Smartsheet
        await this.syncToSmartsheet();

        await this.glpi.killSession();
        saveState();

        console.log(`${c.green}✓ Sincronización completada${c.reset}`);
      } catch (error) {
        console.log(`${c.red}Error: ${error.message}${c.reset}`);
      }
    };

    await sync();
    setInterval(sync, CONFIG.syncInterval * 60 * 1000);
  }
}

// ============ MAIN ============
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  loadState();
  const sync = new BidirectionalSync();

  switch (command) {
    case 'migrate':
      await sync.glpi.initSession();
      await sync.smartsheet.loadColumns();
      await sync.migrate();
      break;

    case 'watch':
      await sync.watch();
      break;

    case 'sync-to-ss':
      await sync.glpi.initSession();
      await sync.smartsheet.loadColumns();
      await sync.syncToSmartsheet();
      await sync.glpi.killSession();
      saveState();
      break;

    case 'sync-from-ss':
      await sync.glpi.initSession();
      await sync.smartsheet.loadColumns();
      await sync.syncFromSmartsheet();
      await sync.glpi.killSession();
      saveState();
      break;

    default:
      console.log(`
${c.bold}Sincronización Bidireccional: Smartsheet ↔ GLPI${c.reset}

${c.cyan}Comandos:${c.reset}
  migrate      Migración inicial (SS → GLPI)
  watch        Modo continuo bidireccional
  sync-to-ss   Sincronizar GLPI → Smartsheet
  sync-from-ss Sincronizar Smartsheet → GLPI

${c.cyan}Ejemplos:${c.reset}
  node sync-bidireccional.mjs migrate
  node sync-bidireccional.mjs watch
`);
  }
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
