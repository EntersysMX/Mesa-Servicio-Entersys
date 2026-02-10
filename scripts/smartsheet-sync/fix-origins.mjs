#!/usr/bin/env node
/**
 * Script para:
 * 1. Agregar tag de origen [Smartsheet] a tickets existentes importados de Smartsheet
 * 2. Crear tickets de prueba para cada origen (Portal, Correo, WhatsApp)
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
  magenta: '\x1b[35m',
};

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
        range: '0-2000',
        order: 'ASC',
      },
    });
    return response.data || [];
  }

  async getTicket(id) {
    const response = await this.api.get(`/Ticket/${id}`, {
      headers: this.getHeaders(),
    });
    return response.data;
  }

  async updateTicket(id, data) {
    await this.api.put(`/Ticket/${id}`, {
      input: data,
    }, { headers: this.getHeaders() });
  }

  async createTicket(data) {
    const response = await this.api.post('/Ticket', {
      input: data,
    }, { headers: this.getHeaders() });
    return response.data.id;
  }
}

async function fixSmartsheetOrigins(glpi) {
  console.log(`\n${c.bold}=== Agregando origen [ORIGEN:Smartsheet] al contenido de tickets ===${c.reset}\n`);

  const tickets = await glpi.getAllTickets();
  console.log(`${c.green}✓${c.reset} ${tickets.length} tickets encontrados\n`);

  // Filtrar tickets que tienen [SS-XXXX] en el nombre
  const ssTickets = tickets.filter(t => {
    const name = t.name || '';
    return name.includes('[SS-');
  });

  console.log(`${c.cyan}→${c.reset} ${ssTickets.length} tickets de Smartsheet encontrados\n`);

  if (ssTickets.length === 0) {
    console.log(`${c.green}✓ No se encontraron tickets de Smartsheet${c.reset}`);
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const ticket of ssTickets) {
    process.stdout.write(`  Verificando #${ticket.id}... `);
    try {
      // Obtener datos completos del ticket
      const fullTicket = await glpi.getTicket(ticket.id);
      const content = fullTicket.content || '';

      // Si ya tiene el tag, saltar
      if (content.includes('[ORIGEN:Smartsheet]')) {
        console.log(`${c.yellow}ya tiene tag${c.reset}`);
        skipped++;
        continue;
      }

      // Actualizar contenido con tag de origen
      const newContent = `<p><strong>[ORIGEN:Smartsheet]</strong></p>${content}`;

      await glpi.updateTicket(ticket.id, {
        content: newContent,
      });

      console.log(`${c.green}OK${c.reset}`);
      updated++;
    } catch (e) {
      console.log(`${c.red}ERROR: ${e.message}${c.reset}`);
      errors++;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n${c.green}Actualizados: ${updated}${c.reset}`);
  console.log(`${c.yellow}Ya tenían tag: ${skipped}${c.reset}`);
  console.log(`${c.red}Errores: ${errors}${c.reset}`);
}

async function removeSmartsheetPrefix(glpi) {
  console.log(`\n${c.bold}=== Removiendo prefijo [Smartsheet] del título ===${c.reset}\n`);

  const tickets = await glpi.getAllTickets();

  // Filtrar tickets que tienen [Smartsheet] en el nombre
  const ssTickets = tickets.filter(t => {
    const name = t.name || '';
    return name.includes('[Smartsheet]');
  });

  console.log(`${c.cyan}→${c.reset} ${ssTickets.length} tickets con prefijo [Smartsheet]\n`);

  if (ssTickets.length === 0) {
    console.log(`${c.green}✓ No hay tickets con prefijo [Smartsheet]${c.reset}`);
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const ticket of ssTickets) {
    process.stdout.write(`  Limpiando #${ticket.id}... `);
    try {
      // Quitar [Smartsheet] del nombre
      const newName = ticket.name.replace('[Smartsheet] ', '').replace('[Smartsheet]', '');

      await glpi.updateTicket(ticket.id, {
        name: newName,
      });

      console.log(`${c.green}OK${c.reset}`);
      updated++;
    } catch (e) {
      console.log(`${c.red}ERROR: ${e.message}${c.reset}`);
      errors++;
    }
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n${c.green}Actualizados: ${updated}${c.reset}`);
  console.log(`${c.red}Errores: ${errors}${c.reset}`);
}

async function createTestTickets(glpi) {
  console.log(`\n${c.bold}=== Creando tickets de prueba para cada origen ===${c.reset}\n`);

  const testTickets = [
    {
      name: 'Ticket de prueba desde Portal',
      content: '<p><strong>[ORIGEN:Portal]</strong></p><p>Este es un ticket de prueba creado desde el Portal de Mesa de Ayuda.</p>',
      urgency: 3,
      priority: 3,
      type: 1,
    },
    {
      name: 'Ticket de prueba recibido por correo',
      content: '<p><strong>[ORIGEN:Correo]</strong></p><p>Este es un ticket de prueba que simula haber sido recibido por correo electrónico.</p>',
      urgency: 3,
      priority: 3,
      type: 1,
    },
    {
      name: 'Ticket de prueba desde WhatsApp',
      content: '<p><strong>[ORIGEN:WhatsApp]</strong></p><p>Este es un ticket de prueba que simula haber sido recibido por WhatsApp.</p>',
      urgency: 3,
      priority: 3,
      type: 1,
    },
  ];

  for (const ticketData of testTickets) {
    process.stdout.write(`  Creando "${ticketData.name.substring(0, 40)}..."... `);
    try {
      const ticketId = await glpi.createTicket(ticketData);
      console.log(`${c.green}OK (ID: ${ticketId})${c.reset}`);
    } catch (e) {
      console.log(`${c.red}ERROR: ${e.message}${c.reset}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  console.log(`\n${c.bold}${c.magenta}=== Herramienta de Gestión de Origen de Tickets ===${c.reset}\n`);

  const glpi = new GlpiAPI();
  await glpi.initSession();

  try {
    if (command === 'fix' || command === 'all') {
      await fixSmartsheetOrigins(glpi);
    }

    if (command === 'clean' || command === 'all') {
      await removeSmartsheetPrefix(glpi);
    }

    if (command === 'test' || command === 'all') {
      await createTestTickets(glpi);
    }

    if (!['fix', 'clean', 'test', 'all'].includes(command)) {
      console.log(`
${c.cyan}Uso:${c.reset}
  node fix-origins.mjs all     # Fix + Clean + Test
  node fix-origins.mjs fix     # Agregar [ORIGEN:Smartsheet] al contenido
  node fix-origins.mjs clean   # Remover [Smartsheet] del título
  node fix-origins.mjs test    # Solo crea tickets de prueba
`);
    }
  } finally {
    await glpi.killSession();
  }

  console.log(`\n${c.green}✓ Proceso completado${c.reset}\n`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
