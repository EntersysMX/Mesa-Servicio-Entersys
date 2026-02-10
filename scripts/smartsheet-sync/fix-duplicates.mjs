#!/usr/bin/env node
/**
 * Script para encontrar y eliminar tickets duplicados
 * Identifica tickets con el mismo número de Smartsheet [SS-XXXX]
 * y elimina los duplicados (mantiene el de ID más bajo)
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

  async deleteTicket(ticketId) {
    await this.api.delete(`/Ticket/${ticketId}`, {
      headers: this.getHeaders(),
      params: { force_purge: 1 }
    });
  }
}

async function main() {
  console.log(`\n${c.bold}=== Buscando Tickets Duplicados ===${c.reset}\n`);

  const glpi = new GlpiAPI();
  await glpi.initSession();

  // Obtener todos los tickets
  console.log(`${c.cyan}Obteniendo tickets...${c.reset}`);
  const tickets = await glpi.getAllTickets();
  console.log(`${c.green}✓${c.reset} ${tickets.length} tickets encontrados\n`);

  // Agrupar por número de Smartsheet
  const ticketsBySS = {};
  const nonSSTickets = [];

  for (const ticket of tickets) {
    const match = ticket.name.match(/\[SS-(\d+)\]/);
    if (match) {
      const ssNum = match[1];
      if (!ticketsBySS[ssNum]) {
        ticketsBySS[ssNum] = [];
      }
      ticketsBySS[ssNum].push(ticket);
    } else {
      nonSSTickets.push(ticket);
    }
  }

  // Encontrar duplicados
  const duplicates = [];
  for (const [ssNum, ticketList] of Object.entries(ticketsBySS)) {
    if (ticketList.length > 1) {
      // Ordenar por ID (mantener el más bajo)
      ticketList.sort((a, b) => a.id - b.id);
      // Los demás son duplicados
      for (let i = 1; i < ticketList.length; i++) {
        duplicates.push({
          ssNum,
          ticket: ticketList[i],
          original: ticketList[0]
        });
      }
    }
  }

  if (duplicates.length === 0) {
    console.log(`${c.green}✓ No se encontraron tickets duplicados${c.reset}`);
    await glpi.killSession();
    return;
  }

  console.log(`${c.yellow}⚠ Se encontraron ${duplicates.length} tickets duplicados:${c.reset}\n`);

  // Mostrar duplicados
  for (const dup of duplicates) {
    console.log(`  [SS-${dup.ssNum}]:`);
    console.log(`    ${c.green}Original:${c.reset}  ID #${dup.original.id}`);
    console.log(`    ${c.red}Duplicado:${c.reset} ID #${dup.ticket.id} (será eliminado)`);
  }

  console.log(`\n${c.cyan}Eliminando ${duplicates.length} duplicados...${c.reset}\n`);

  let deleted = 0;
  let errors = 0;

  for (const dup of duplicates) {
    process.stdout.write(`  Eliminando ticket #${dup.ticket.id} [SS-${dup.ssNum}]... `);
    try {
      await glpi.deleteTicket(dup.ticket.id);
      console.log(`${c.green}OK${c.reset}`);
      deleted++;
    } catch (e) {
      console.log(`${c.red}ERROR: ${e.message}${c.reset}`);
      errors++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  await glpi.killSession();

  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Eliminados:${c.reset} ${deleted}`);
  console.log(`  ${c.red}Errores:${c.reset}    ${errors}`);
  console.log(`  ${c.cyan}Tickets únicos restantes:${c.reset} ${tickets.length - deleted}`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
