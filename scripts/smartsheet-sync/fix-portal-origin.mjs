#!/usr/bin/env node
/**
 * Script para agregar [ORIGEN:Portal] a tickets creados desde el portal
 * que no tienen ningún tag de origen
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
}

async function main() {
  console.log(`\n${c.bold}=== Agregando [ORIGEN:Portal] a tickets del portal ===${c.reset}\n`);

  const glpi = new GlpiAPI();
  await glpi.initSession();

  const tickets = await glpi.getAllTickets();
  console.log(`${c.green}✓${c.reset} ${tickets.length} tickets encontrados\n`);

  // Filtrar tickets que:
  // - NO tienen [SS- en el nombre (no son de Smartsheet)
  // - NO tienen ningún [ORIGEN:xxx] en el contenido
  const portalTickets = [];

  for (const ticket of tickets) {
    const name = ticket.name || '';

    // Si es de Smartsheet, saltar
    if (name.includes('[SS-')) continue;

    // Obtener contenido completo
    try {
      const fullTicket = await glpi.getTicket(ticket.id);
      const content = fullTicket.content || '';

      // Si ya tiene algún origen, saltar
      if (content.includes('[ORIGEN:')) continue;

      portalTickets.push({ id: ticket.id, name: ticket.name, content: content });
    } catch (e) {
      // Saltar si hay error
    }
  }

  console.log(`${c.cyan}→${c.reset} ${portalTickets.length} tickets del portal sin origen marcado\n`);

  if (portalTickets.length === 0) {
    console.log(`${c.green}✓ Todos los tickets ya tienen origen marcado${c.reset}`);
    await glpi.killSession();
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const ticket of portalTickets) {
    process.stdout.write(`  Actualizando #${ticket.id} "${ticket.name.substring(0, 30)}..."... `);
    try {
      const newContent = `<p><strong>[ORIGEN:Portal]</strong></p>${ticket.content}`;

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

  await glpi.killSession();

  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Actualizados:${c.reset} ${updated}`);
  console.log(`  ${c.red}Errores:${c.reset}     ${errors}`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
