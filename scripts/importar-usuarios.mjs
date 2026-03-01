#!/usr/bin/env node
/**
 * Script para importar usuarios de cualquier rol a GLPI
 *
 * USO:
 *   node importar-usuarios.mjs <archivo.xlsx>
 *
 * ROLES SOPORTADOS:
 *   Cliente, Observer, Admin, Super-Admin, Hotliner, Technician, Supervisor, Read-Only
 */

import XLSX from 'xlsx';
import axios from 'axios';
import path from 'path';

const CONFIG = {
  glpiUrl: process.env.GLPI_URL || 'https://glpi.entersys.mx/apirest.php',
  appToken: process.env.GLPI_APP_TOKEN || '',
  username: process.env.GLPI_USERNAME || '',
  password: process.env.GLPI_PASSWORD || '',
  entityId: 0,
  isRecursive: 1,
};

// Mapeo de nombres de rol a IDs de GLPI
const ROLES = {
  'cliente': 1,
  'self-service': 1,
  'observer': 2,
  'observador': 2,
  'admin': 3,
  'administrador': 3,
  'super-admin': 4,
  'superadmin': 4,
  'hotliner': 5,
  'mesa de ayuda': 5,
  'technician': 6,
  'tecnico': 6,
  'técnico': 6,
  'supervisor': 7,
  'read-only': 8,
  'solo lectura': 8,
};

let sessionToken = null;

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(type, msg) {
  const prefix = { success: `${c.green}✓${c.reset}`, error: `${c.red}✗${c.reset}`, info: `${c.cyan}ℹ${c.reset}` };
  console.log(`${prefix[type] || ''} ${msg}`);
}

async function initSession() {
  const credentials = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
  const response = await axios.get(`${CONFIG.glpiUrl}/initSession`, {
    headers: { 'Authorization': `Basic ${credentials}`, 'App-Token': CONFIG.appToken },
  });
  sessionToken = response.data.session_token;
}

async function killSession() {
  if (!sessionToken) return;
  try {
    await axios.get(`${CONFIG.glpiUrl}/killSession`, {
      headers: { 'Session-Token': sessionToken, 'App-Token': CONFIG.appToken },
    });
  } catch (e) {}
}

function getHeaders() {
  return { 'Content-Type': 'application/json', 'Session-Token': sessionToken, 'App-Token': CONFIG.appToken };
}

async function userExists(username) {
  try {
    const response = await axios.get(`${CONFIG.glpiUrl}/User`, {
      headers: getHeaders(),
      params: { 'searchText[name]': username },
    });
    const users = response.data || [];
    return users.some(u => u.name.toLowerCase() === username.toLowerCase());
  } catch (e) {
    return false;
  }
}

async function createUser(userData) {
  const response = await axios.post(`${CONFIG.glpiUrl}/User`, {
    input: {
      name: userData.usuario,
      realname: userData.apellido,
      firstname: userData.nombre,
      password: userData.password,
      password2: userData.password,
      is_active: 1,
      phone: userData.telefono || '',
      mobile: userData.movil || '',
      _useremails: userData.email ? [userData.email] : [],
    },
  }, { headers: getHeaders() });
  return response.data.id;
}

async function assignProfile(userId, profileId) {
  await axios.post(`${CONFIG.glpiUrl}/Profile_User`, {
    input: {
      users_id: userId,
      profiles_id: profileId,
      entities_id: CONFIG.entityId,
      is_recursive: CONFIG.isRecursive,
      is_dynamic: 0,
    },
  }, { headers: getHeaders() });
}

function getProfileId(rolName) {
  if (!rolName) return 6; // Default: Technician
  const key = rolName.toString().toLowerCase().trim();
  return ROLES[key] || 6;
}

function getProfileName(profileId) {
  const names = {
    1: 'Cliente', 2: 'Observer', 3: 'Admin', 4: 'Super-Admin',
    5: 'Hotliner', 6: 'Technician', 7: 'Supervisor', 8: 'Read-Only'
  };
  return names[profileId] || 'Technician';
}

function leerExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

function validateUser(user, index) {
  const errors = [];
  if (!user.usuario) errors.push('usuario');
  if (!user.nombre) errors.push('nombre');
  if (!user.apellido) errors.push('apellido');
  if (!user.password) errors.push('password');
  if (errors.length > 0) return `Fila ${index + 2}: Faltan: ${errors.join(', ')}`;
  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
${c.bold}Importador de Usuarios a GLPI${c.reset}

${c.cyan}Uso:${c.reset}
  node importar-usuarios.mjs <archivo.xlsx>

${c.cyan}Roles disponibles:${c.reset}
  Cliente      - Solo crea y ve sus tickets
  Observer     - Ve tickets sin modificar
  Admin        - Administrador de TI
  Super-Admin  - Control total
  Hotliner     - Mesa de ayuda
  Technician   - Técnico de soporte (default)
  Supervisor   - Supervisa técnicos
  Read-Only    - Solo lectura

${c.cyan}Ejemplo:${c.reset}
  node importar-usuarios.mjs plantillas/02_Usuarios/usuarios.xlsx
`);
    process.exit(0);
  }

  const filePath = path.resolve(args[0]);

  console.log(`\n${c.bold}=== Importador de Usuarios GLPI ===${c.reset}\n`);
  log('info', `Archivo: ${filePath}`);

  // Leer Excel
  let usuarios;
  try {
    usuarios = leerExcel(filePath);
    log('success', `${usuarios.length} usuarios encontrados`);
  } catch (error) {
    log('error', `Error leyendo archivo: ${error.message}`);
    process.exit(1);
  }

  // Validar
  console.log('\n--- Validando datos ---');
  const validationErrors = [];
  usuarios.forEach((user, index) => {
    const error = validateUser(user, index);
    if (error) validationErrors.push(error);
  });

  if (validationErrors.length > 0) {
    log('error', 'Errores de validación:');
    validationErrors.forEach(err => console.log(`   ${err}`));
    process.exit(1);
  }
  log('success', 'Datos válidos');

  // Conectar
  console.log('\n--- Conectando a GLPI ---');
  try {
    await initSession();
    log('success', 'Conectado');
  } catch (error) {
    log('error', `Error: ${error.response?.data?.[0] || error.message}`);
    process.exit(1);
  }

  // Procesar
  console.log('\n--- Creando usuarios ---');
  const results = { created: [], skipped: [], errors: [] };
  const countByRole = {};

  for (const user of usuarios) {
    const profileId = getProfileId(user.rol);
    const profileName = getProfileName(profileId);
    process.stdout.write(`  ${user.usuario} (${profileName})... `);

    try {
      if (await userExists(user.usuario)) {
        console.log(`${c.yellow}ya existe${c.reset}`);
        results.skipped.push(user.usuario);
        continue;
      }

      const userId = await createUser(user);
      await assignProfile(userId, profileId);

      console.log(`${c.green}OK (ID: ${userId})${c.reset}`);
      results.created.push({ usuario: user.usuario, id: userId, rol: profileName });
      countByRole[profileName] = (countByRole[profileName] || 0) + 1;

    } catch (error) {
      const msg = error.response?.data?.[0] || error.message;
      console.log(`${c.red}ERROR: ${msg}${c.reset}`);
      results.errors.push({ usuario: user.usuario, error: msg });
    }
  }

  await killSession();

  // Resumen
  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Creados:${c.reset}  ${results.created.length}`);
  console.log(`  ${c.yellow}Saltados:${c.reset} ${results.skipped.length}`);
  console.log(`  ${c.red}Errores:${c.reset}  ${results.errors.length}`);

  if (Object.keys(countByRole).length > 0) {
    console.log(`\n${c.cyan}Por rol:${c.reset}`);
    Object.entries(countByRole).forEach(([rol, count]) => {
      console.log(`  ${rol}: ${count}`);
    });
  }

  if (results.errors.length > 0) {
    console.log(`\n${c.red}Errores:${c.reset}`);
    results.errors.forEach(e => console.log(`  - ${e.usuario}: ${e.error}`));
  }

  console.log('');
}

main().catch(error => {
  log('error', `Error fatal: ${error.message}`);
  process.exit(1);
});
