#!/usr/bin/env node
/**
 * Script para importar plantillas Excel a GLPI (producción)
 * Importa: Ubicaciones, Categorías, Grupos, Proveedores, Contactos
 * NO importa: Tickets, Usuarios (ya existen)
 */

import axios from 'axios';
import XLSX from 'xlsx';
import path from 'path';
import { CONFIG } from './config.mjs';

const TEMPLATES_DIR = '../plantillas/plantillas mesa de ayuda';

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

class GLPIImporter {
  constructor() {
    this.api = axios.create({
      baseURL: CONFIG.glpi.url,
      headers: {
        'Content-Type': 'application/json',
        'App-Token': CONFIG.glpi.appToken,
      },
    });
    this.sessionToken = null;
  }

  async init() {
    console.log(`${c.cyan}Iniciando sesión en GLPI...${c.reset}`);
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const response = await this.api.get('/initSession', {
      headers: { 'Authorization': `Basic ${auth}` },
    });
    this.sessionToken = response.data.session_token;
    console.log(`${c.green}✓${c.reset} Sesión iniciada\n`);
  }

  getHeaders() {
    return {
      'Session-Token': this.sessionToken,
      'App-Token': CONFIG.glpi.appToken,
      'Content-Type': 'application/json',
    };
  }

  async getExisting(endpoint) {
    try {
      const response = await this.api.get(endpoint, {
        headers: this.getHeaders(),
        params: { range: '0-9999' },
      });
      return response.data || [];
    } catch (e) {
      return [];
    }
  }

  async create(endpoint, data) {
    try {
      const response = await this.api.post(endpoint, { input: data }, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (e) {
      throw new Error(e.response?.data?.[1] || e.message);
    }
  }

  readExcel(filePath) {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws);
  }

  async close() {
    try {
      await this.api.get('/killSession', { headers: this.getHeaders() });
    } catch (e) {}
  }
}

async function main() {
  console.log(`\n${c.bold}=== Importando Plantillas a GLPI Producción ===${c.reset}\n`);

  const glpi = new GLPIImporter();
  await glpi.init();

  let totalCreated = 0;
  let totalSkipped = 0;

  // 1. UBICACIONES (Locations)
  console.log(`${c.cyan}1. Importando Ubicaciones...${c.reset}`);
  try {
    const ubicaciones = glpi.readExcel(path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/ubicaciones.xlsx'));
    const existing = await glpi.getExisting('/Location');
    const existingNames = new Set(existing.map(l => l.name?.toLowerCase()));

    let created = 0, skipped = 0;
    for (const ub of ubicaciones) {
      if (!ub.name || existingNames.has(ub.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await glpi.create('/Location', {
          name: ub.name,
          comment: ub.comment || `Zona: ${ub.zona || ''}, Región: ${ub['locations_id (padre)'] || ''}`,
        });
        created++;
        existingNames.add(ub.name.toLowerCase());
      } catch (e) {
        console.log(`  ${c.yellow}⚠${c.reset} ${ub.name}: ${e.message}`);
        skipped++;
      }
    }
    console.log(`  ${c.green}✓${c.reset} ${created} creadas, ${skipped} omitidas (duplicados)`);
    totalCreated += created;
    totalSkipped += skipped;
  } catch (e) {
    console.log(`  ${c.red}✗${c.reset} Error: ${e.message}`);
  }

  // 2. CATEGORÍAS (ITILCategories)
  console.log(`${c.cyan}2. Importando Categorías...${c.reset}`);
  try {
    const categorias = glpi.readExcel(path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/categorias_ticket.xlsx'));
    const existing = await glpi.getExisting('/ITILCategory');
    const existingNames = new Set(existing.map(c => c.name?.toLowerCase()));

    let created = 0, skipped = 0;
    for (const cat of categorias) {
      if (!cat.name || existingNames.has(cat.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await glpi.create('/ITILCategory', {
          name: cat.name,
          is_incident: cat.is_incident || 1,
          is_request: cat.is_request || 1,
          comment: cat.comment || '',
        });
        created++;
        existingNames.add(cat.name.toLowerCase());
      } catch (e) {
        console.log(`  ${c.yellow}⚠${c.reset} ${cat.name}: ${e.message}`);
        skipped++;
      }
    }
    console.log(`  ${c.green}✓${c.reset} ${created} creadas, ${skipped} omitidas (duplicados)`);
    totalCreated += created;
    totalSkipped += skipped;
  } catch (e) {
    console.log(`  ${c.red}✗${c.reset} Error: ${e.message}`);
  }

  // 3. GRUPOS (Groups)
  console.log(`${c.cyan}3. Importando Grupos...${c.reset}`);
  try {
    const grupos = glpi.readExcel(path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/grupos.xlsx'));
    const existing = await glpi.getExisting('/Group');
    const existingNames = new Set(existing.map(g => g.name?.toLowerCase()));

    let created = 0, skipped = 0;
    for (const grp of grupos) {
      if (!grp.name || existingNames.has(grp.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await glpi.create('/Group', {
          name: grp.name,
          comment: grp.comment || '',
        });
        created++;
        existingNames.add(grp.name.toLowerCase());
      } catch (e) {
        console.log(`  ${c.yellow}⚠${c.reset} ${grp.name}: ${e.message}`);
        skipped++;
      }
    }
    console.log(`  ${c.green}✓${c.reset} ${created} creados, ${skipped} omitidos (duplicados)`);
    totalCreated += created;
    totalSkipped += skipped;
  } catch (e) {
    console.log(`  ${c.red}✗${c.reset} Error: ${e.message}`);
  }

  // 4. PROVEEDORES (Suppliers)
  console.log(`${c.cyan}4. Importando Proveedores...${c.reset}`);
  try {
    const proveedores = glpi.readExcel(path.join(TEMPLATES_DIR, '04_Organizacion/proveedores.xlsx'));
    const existing = await glpi.getExisting('/Supplier');
    const existingNames = new Set(existing.map(s => s.name?.toLowerCase()));

    let created = 0, skipped = 0;
    for (const prov of proveedores) {
      if (!prov.name || existingNames.has(prov.name.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await glpi.create('/Supplier', {
          name: prov.name,
          registration_number: prov.registration_number || '',
          address: prov.address || '',
          phonenumber: prov.phonenumber || '',
          email: prov.email || '',
          comment: prov.comment || '',
        });
        created++;
        existingNames.add(prov.name.toLowerCase());
      } catch (e) {
        console.log(`  ${c.yellow}⚠${c.reset} ${prov.name}: ${e.message}`);
        skipped++;
      }
    }
    console.log(`  ${c.green}✓${c.reset} ${created} creados, ${skipped} omitidos (duplicados)`);
    totalCreated += created;
    totalSkipped += skipped;
  } catch (e) {
    console.log(`  ${c.red}✗${c.reset} Error: ${e.message}`);
  }

  // 5. CONTACTOS (Contacts)
  console.log(`${c.cyan}5. Importando Contactos...${c.reset}`);
  try {
    const contactos = glpi.readExcel(path.join(TEMPLATES_DIR, '04_Organizacion/contactos.xlsx'));
    const existing = await glpi.getExisting('/Contact');
    const existingEmails = new Set(existing.map(c => c.email?.toLowerCase()).filter(Boolean));

    let created = 0, skipped = 0;
    for (const cont of contactos) {
      if (!cont.email || existingEmails.has(cont.email.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await glpi.create('/Contact', {
          name: cont.name || cont.email.split('@')[0],
          firstname: cont.firstname || '',
          email: cont.email,
          phone: cont.phone || '',
          comment: cont.comment || '',
        });
        created++;
        existingEmails.add(cont.email.toLowerCase());
      } catch (e) {
        console.log(`  ${c.yellow}⚠${c.reset} ${cont.email}: ${e.message}`);
        skipped++;
      }
    }
    console.log(`  ${c.green}✓${c.reset} ${created} creados, ${skipped} omitidos (duplicados)`);
    totalCreated += created;
    totalSkipped += skipped;
  } catch (e) {
    console.log(`  ${c.red}✗${c.reset} Error: ${e.message}`);
  }

  await glpi.close();

  console.log(`\n${c.bold}${c.green}=== Importación Completada ===${c.reset}`);
  console.log(`${c.bold}Total:${c.reset} ${totalCreated} registros creados, ${totalSkipped} omitidos\n`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
