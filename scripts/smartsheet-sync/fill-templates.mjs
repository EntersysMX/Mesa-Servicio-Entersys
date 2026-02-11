#!/usr/bin/env node
/**
 * Script para llenar las plantillas de Excel con datos de Smartsheet
 */

import axios from 'axios';
import XLSX from 'xlsx';
import fs from 'fs';
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

async function getSmartsheetData() {
  console.log(`${c.cyan}Obteniendo datos de Smartsheet...${c.reset}`);

  const api = axios.create({
    baseURL: 'https://api.smartsheet.com/2.0',
    headers: {
      'Authorization': `Bearer ${CONFIG.smartsheet.apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  const response = await api.get(`/sheets/${CONFIG.smartsheet.sheetId}`);
  const sheet = response.data;

  // Crear mapa de columnas
  const colMap = {};
  sheet.columns.forEach(col => colMap[col.id] = col.title);

  // Parsear filas
  const rows = sheet.rows.map(row => {
    const data = {};
    row.cells.forEach(cell => {
      const colName = colMap[cell.columnId];
      data[colName] = cell.displayValue || cell.value || '';
    });
    return data;
  });

  console.log(`${c.green}✓${c.reset} ${rows.length} filas obtenidas\n`);
  return rows;
}

function extractUniqueValues(rows, field) {
  const values = new Set();
  rows.forEach(row => {
    if (row[field] && row[field].toString().trim()) {
      values.add(row[field].toString().trim());
    }
  });
  return Array.from(values).sort();
}

function writeExcel(filePath, data, headers) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filePath);
}

async function main() {
  console.log(`\n${c.bold}=== Llenando Plantillas con Datos de Smartsheet ===${c.reset}\n`);

  const rows = await getSmartsheetData();

  // 1. UBICACIONES
  console.log(`${c.cyan}1. Ubicaciones...${c.reset}`);
  const ubicaciones = extractUniqueValues(rows, 'Unidad Operativa');
  const regiones = extractUniqueValues(rows, 'Región');
  const zonas = extractUniqueValues(rows, 'Zona');

  const ubicacionesData = ubicaciones.map((ub, i) => {
    // Buscar región y zona asociada
    const row = rows.find(r => r['Unidad Operativa'] === ub);
    return [
      i + 1,                           // ID
      ub,                              // Nombre
      row?.['Región'] || '',           // Región (como ubicación padre)
      row?.['Zona'] || '',             // Zona
      '',                              // Comentario
    ];
  });

  writeExcel(
    path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/ubicaciones.xlsx'),
    ubicacionesData,
    ['id', 'name', 'locations_id (padre)', 'zona', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${ubicaciones.length} ubicaciones guardadas`);

  // 2. CATEGORÍAS
  console.log(`${c.cyan}2. Categorías...${c.reset}`);
  const modulos = extractUniqueValues(rows, 'Modulo');
  const procesos = extractUniqueValues(rows, 'Proceso');
  const areas = extractUniqueValues(rows, 'Área');

  // Combinar módulos y procesos como categorías
  const allCategories = [...new Set([...modulos, ...procesos])].filter(c => c && c !== '#NO MATCH');
  const categoriasData = allCategories.map((cat, i) => [
    i + 1,                             // ID
    cat,                               // Nombre
    '',                                // Categoría padre
    1,                                 // is_incident
    1,                                 // is_request
    '',                                // Comentario
  ]);

  writeExcel(
    path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/categorias_ticket.xlsx'),
    categoriasData,
    ['id', 'name', 'itilcategories_id (padre)', 'is_incident', 'is_request', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${allCategories.length} categorías guardadas`);

  // 3. GRUPOS (Áreas)
  console.log(`${c.cyan}3. Grupos...${c.reset}`);
  const gruposData = areas.filter(a => a && a !== '#NO MATCH').map((area, i) => [
    i + 1,                             // ID
    area,                              // Nombre
    '',                                // Comentario
  ]);

  writeExcel(
    path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/grupos.xlsx'),
    gruposData,
    ['id', 'name', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${gruposData.length} grupos guardados`);

  // 4. USUARIOS (Técnicos y Clientes)
  console.log(`${c.cyan}4. Usuarios...${c.reset}`);

  // Técnicos
  const tecnicos = extractUniqueValues(rows, 'Técnico asignado');

  // Clientes (por correo electrónico)
  const clientesMap = new Map();
  rows.forEach(row => {
    const email = row['Correo electrónico'];
    if (email && email.includes('@') && !clientesMap.has(email)) {
      clientesMap.set(email, {
        email: email,
        phone: row['Número de contacto'] || '',
        area: row['Área'] || '',
        tipo: row['Tipo de Usuario'] || '',
        empresa: row['Empresa contratista'] || '',
      });
    }
  });

  const usuariosData = [];

  // Agregar técnicos
  tecnicos.forEach((tech, i) => {
    if (tech) {
      const parts = tech.split(' ');
      usuariosData.push([
        tech.toLowerCase().replace(/\s+/g, '.'),  // name (username)
        parts[0] || '',                            // realname (apellido)
        parts.slice(1).join(' ') || '',           // firstname
        `${tech.toLowerCase().replace(/\s+/g, '.')}@entersys.mx`, // email
        '',                                        // phone
        'Technician',                              // profile
        '',                                        // comment
      ]);
    }
  });

  // Agregar clientes
  clientesMap.forEach((client, email) => {
    const namePart = email.split('@')[0];
    usuariosData.push([
      email,                                       // name (username = email)
      namePart,                                    // realname
      '',                                          // firstname
      email,                                       // email
      client.phone,                                // phone
      'Self-Service',                              // profile
      `${client.tipo} - ${client.empresa}`.trim(), // comment
    ]);
  });

  writeExcel(
    path.join(TEMPLATES_DIR, '02_Usuarios/usuarios.xlsx'),
    usuariosData,
    ['name', 'realname', 'firstname', '_useremails', 'phone', 'profile', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${tecnicos.length} técnicos + ${clientesMap.size} clientes = ${usuariosData.length} usuarios guardados`);

  // 5. TICKETS (muestra de los últimos 50)
  console.log(`${c.cyan}5. Tickets (muestra)...${c.reset}`);
  const ticketsData = rows.slice(0, 50).map(row => [
    row['No.Ticket'] || '',
    row['Problema']?.substring(0, 200) || '',
    row['Estado'] || '',
    row['Urgencia'] || '',
    row['Modulo'] || '',
    row['Unidad Operativa'] || '',
    row['Técnico asignado'] || '',
    row['Correo electrónico'] || '',
    row['Fecha de solicitud'] || '',
    row['Comentarios / Acciónes de resolución']?.substring(0, 500) || '',
  ]);

  writeExcel(
    path.join(TEMPLATES_DIR, '01_Catalogos_Tickets/tickets.xlsx'),
    ticketsData,
    ['No.Ticket', 'name', 'status', 'urgency', 'itilcategories_id', 'locations_id', 'technician', 'requester_email', 'date', 'solution']
  );
  console.log(`  ${c.green}✓${c.reset} ${ticketsData.length} tickets guardados`);

  // 6. PROVEEDORES (Empresas contratistas)
  console.log(`${c.cyan}6. Proveedores...${c.reset}`);
  const empresas = extractUniqueValues(rows, 'Empresa contratista');
  const rfcs = new Map();
  rows.forEach(row => {
    const empresa = row['Empresa contratista'];
    const rfc = row['RFC Contratista'];
    if (empresa && rfc && !rfcs.has(empresa)) {
      rfcs.set(empresa, rfc);
    }
  });

  const proveedoresData = empresas
    .filter(e => e && e !== '#NO MATCH')
    .map((emp, i) => [
      i + 1,
      emp,
      rfcs.get(emp) || '',
      '',  // address
      '',  // phone
      '',  // email
      '',  // comment
    ]);

  writeExcel(
    path.join(TEMPLATES_DIR, '04_Organizacion/proveedores.xlsx'),
    proveedoresData,
    ['id', 'name', 'registration_number', 'address', 'phonenumber', 'email', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${proveedoresData.length} proveedores guardados`);

  // 7. CONTACTOS
  console.log(`${c.cyan}7. Contactos...${c.reset}`);
  const contactosData = [];
  clientesMap.forEach((client, email) => {
    if (client.empresa && client.empresa !== '#NO MATCH') {
      contactosData.push([
        email.split('@')[0],           // name
        '',                             // firstname
        email,                          // email
        client.phone,                   // phone
        client.empresa,                 // supplier
        client.area,                    // comment
      ]);
    }
  });

  writeExcel(
    path.join(TEMPLATES_DIR, '04_Organizacion/contactos.xlsx'),
    contactosData.slice(0, 100), // Limitar a 100
    ['name', 'firstname', 'email', 'phone', 'supplier', 'comment']
  );
  console.log(`  ${c.green}✓${c.reset} ${Math.min(contactosData.length, 100)} contactos guardados`);

  console.log(`\n${c.bold}${c.green}=== Plantillas llenadas exitosamente ===${c.reset}\n`);

  // Resumen
  console.log(`${c.bold}Resumen:${c.reset}`);
  console.log(`  - Ubicaciones: ${ubicaciones.length}`);
  console.log(`  - Categorías: ${allCategories.length}`);
  console.log(`  - Grupos: ${gruposData.length}`);
  console.log(`  - Usuarios: ${usuariosData.length}`);
  console.log(`  - Tickets: ${ticketsData.length}`);
  console.log(`  - Proveedores: ${proveedoresData.length}`);
  console.log(`  - Contactos: ${Math.min(contactosData.length, 100)}`);
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
