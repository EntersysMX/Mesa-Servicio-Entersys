#!/usr/bin/env node
/**
 * Script para corregir los solicitantes de tickets existentes
 * Lee el correo electrónico de Smartsheet y lo asigna como solicitante en GLPI
 */

import axios from 'axios';
import { CONFIG } from './config.mjs';

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

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
  }

  async loadSheet() {
    const response = await this.api.get(`/sheets/${CONFIG.smartsheet.sheetId}`);
    for (const col of response.data.columns) {
      this.columnMap[col.id] = col.title;
    }
    return response.data;
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
    console.log(`${c.green}✓${c.reset} Sesión GLPI iniciada`);
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

  async getAllTickets() {
    const response = await this.api.get('/Ticket', {
      headers: this.getHeaders(),
      params: {
        range: '0-1000',
        order: 'ASC',
      },
    });
    return response.data || [];
  }

  async getTicketUsers(ticketId) {
    try {
      const response = await this.api.get(`/Ticket/${ticketId}/Ticket_User`, {
        headers: this.getHeaders(),
      });
      return response.data || [];
    } catch (e) {
      return [];
    }
  }

  async findUserByEmail(email) {
    if (!email) return null;
    try {
      const response = await this.api.get('/User', {
        headers: this.getHeaders(),
        params: {
          'searchText[name]': email,
          range: '0-50'
        },
      });
      const users = response.data || [];
      return users.find(u =>
        u.name?.toLowerCase() === email.toLowerCase() ||
        u.email?.toLowerCase() === email.toLowerCase()
      );
    } catch (e) {
      return null;
    }
  }

  async createUser(email, name = null) {
    try {
      const nameParts = name ? name.split(' ') : email.split('@')[0].split('.');
      const response = await this.api.post('/User', {
        input: {
          name: email,
          realname: nameParts[0] || '',
          firstname: nameParts.slice(1).join(' ') || '',
          _useremails: [email],
          is_active: 1,
          profiles_id: 1,
        },
      }, { headers: this.getHeaders() });
      return response.data.id;
    } catch (e) {
      console.log(`    ${c.yellow}! Error creando usuario: ${e.message}${c.reset}`);
      return null;
    }
  }

  async removeTicketRequester(ticketUserId) {
    try {
      await this.api.delete(`/Ticket_User/${ticketUserId}`, {
        headers: this.getHeaders(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async assignRequester(ticketId, userId) {
    try {
      await this.api.post('/Ticket_User', {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 1, // 1 = Solicitante
        },
      }, { headers: this.getHeaders() });
      return true;
    } catch (e) {
      return false;
    }
  }
}

// ============ MAIN ============
async function main() {
  console.log(`\n${c.bold}=== Corrigiendo Solicitantes de Tickets ===${c.reset}\n`);

  const smartsheet = new SmartsheetAPI();
  const glpi = new GlpiAPI();

  // Cargar datos de Smartsheet
  console.log(`${c.cyan}Cargando datos de Smartsheet...${c.reset}`);
  const sheet = await smartsheet.loadSheet();
  const rows = sheet.rows || [];
  console.log(`${c.green}✓${c.reset} ${rows.length} filas en Smartsheet\n`);

  // Crear mapa de tickets SS por número
  const ssTickets = {};
  for (const row of rows) {
    const data = smartsheet.parseRow(row);
    const ticketNum = data['No.Ticket'];
    if (ticketNum) {
      ssTickets[ticketNum] = data;
    }
  }

  // Mostrar columnas disponibles
  console.log(`${c.cyan}Columnas en Smartsheet:${c.reset}`);
  const sampleRow = rows[0] ? smartsheet.parseRow(rows[0]) : {};
  Object.keys(sampleRow).filter(k => k !== '_rowId').forEach(col => {
    console.log(`  - ${col}`);
  });
  console.log('');

  // Conectar a GLPI
  await glpi.initSession();

  // Obtener todos los tickets
  console.log(`${c.cyan}Obteniendo tickets de GLPI...${c.reset}`);
  const tickets = await glpi.getAllTickets();
  console.log(`${c.green}✓${c.reset} ${tickets.length} tickets en GLPI\n`);

  let fixed = 0, skipped = 0, noEmail = 0, errors = 0;

  for (const ticket of tickets) {
    // Buscar si es un ticket de Smartsheet
    const match = ticket.name.match(/\[SS-(\d+)\]/);
    if (!match) {
      skipped++;
      continue;
    }

    const ssNum = match[1];
    const ssData = ssTickets[ssNum];

    if (!ssData) {
      console.log(`  ${c.yellow}!${c.reset} Ticket #${ticket.id} [SS-${ssNum}] - No encontrado en Smartsheet`);
      skipped++;
      continue;
    }

    // Obtener correo del solicitante de Smartsheet
    const email = ssData['Correo electrónico'] || ssData['Correo Electrónico'] || ssData['Email'] || '';

    if (!email || !email.includes('@')) {
      console.log(`  ${c.yellow}!${c.reset} Ticket #${ticket.id} [SS-${ssNum}] - Sin correo electrónico`);
      noEmail++;
      continue;
    }

    process.stdout.write(`  Ticket #${ticket.id} [SS-${ssNum}] → ${email}... `);

    try {
      // Buscar usuario por email
      let user = await glpi.findUserByEmail(email);
      let userId;

      if (user) {
        userId = user.id;
      } else {
        // Crear usuario
        const name = ssData['Nombre'] || ssData['Solicitante'] || '';
        userId = await glpi.createUser(email, name);
        if (!userId) {
          console.log(`${c.red}ERROR (no se pudo crear usuario)${c.reset}`);
          errors++;
          continue;
        }
        console.log(`${c.cyan}(usuario creado)${c.reset} `);
      }

      // Obtener solicitantes actuales del ticket
      const ticketUsers = await glpi.getTicketUsers(ticket.id);
      const currentRequesters = ticketUsers.filter(tu => tu.type === 1);

      // Verificar si ya tiene el solicitante correcto
      const alreadyAssigned = currentRequesters.some(r => r.users_id === userId);
      if (alreadyAssigned) {
        console.log(`${c.green}OK (ya asignado)${c.reset}`);
        skipped++;
        continue;
      }

      // Remover solicitantes actuales (que no sean el correcto)
      for (const req of currentRequesters) {
        if (req.users_id !== userId) {
          await glpi.removeTicketRequester(req.id);
        }
      }

      // Asignar nuevo solicitante
      const assigned = await glpi.assignRequester(ticket.id, userId);
      if (assigned) {
        console.log(`${c.green}OK${c.reset}`);
        fixed++;
      } else {
        console.log(`${c.red}ERROR${c.reset}`);
        errors++;
      }
    } catch (e) {
      console.log(`${c.red}ERROR: ${e.message}${c.reset}`);
      errors++;
    }

    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 100));
  }

  await glpi.killSession();

  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Corregidos:${c.reset}    ${fixed}`);
  console.log(`  ${c.yellow}Sin correo:${c.reset}    ${noEmail}`);
  console.log(`  ${c.yellow}Saltados:${c.reset}      ${skipped}`);
  console.log(`  ${c.red}Errores:${c.reset}       ${errors}`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
