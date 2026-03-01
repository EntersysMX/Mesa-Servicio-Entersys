#!/usr/bin/env node
/**
 * Script para importar técnicos masivamente a GLPI
 *
 * USO:
 *   node importar-tecnicos.mjs tecnicos.xlsx
 *
 * FORMATO DEL EXCEL (columnas requeridas):
 *   - usuario: Login del usuario (requerido)
 *   - nombre: Nombre(s) (requerido)
 *   - apellido: Apellido(s) (requerido)
 *   - password: Contraseña (requerido)
 *   - email: Correo electrónico (opcional)
 *   - telefono: Teléfono (opcional)
 *   - movil: Celular (opcional)
 */

import XLSX from 'xlsx';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de GLPI
const CONFIG = {
  glpiUrl: process.env.GLPI_URL || 'https://glpi.entersys.mx/apirest.php',
  appToken: process.env.GLPI_APP_TOKEN || '',
  username: process.env.GLPI_USERNAME || '',
  password: process.env.GLPI_PASSWORD || '',
  profileId: 6,      // ID del perfil Technician
  entityId: 0,       // ID de la entidad Root
  isRecursive: 1,    // Acceso recursivo a sub-entidades
};

let sessionToken = null;

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(type, message) {
  const prefix = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    info: `${colors.cyan}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

// Iniciar sesión en GLPI
async function initSession() {
  try {
    const credentials = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
    const response = await axios.get(`${CONFIG.glpiUrl}/initSession`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
        'App-Token': CONFIG.appToken,
      },
    });
    sessionToken = response.data.session_token;
    log('success', 'Sesión iniciada en GLPI');
    return true;
  } catch (error) {
    log('error', `Error iniciando sesión: ${error.response?.data?.[0] || error.message}`);
    return false;
  }
}

// Cerrar sesión
async function killSession() {
  if (!sessionToken) return;
  try {
    await axios.get(`${CONFIG.glpiUrl}/killSession`, {
      headers: {
        'Session-Token': sessionToken,
        'App-Token': CONFIG.appToken,
      },
    });
    log('info', 'Sesión cerrada');
  } catch (error) {
    // Ignorar errores al cerrar
  }
}

// Headers para peticiones autenticadas
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Session-Token': sessionToken,
    'App-Token': CONFIG.appToken,
  };
}

// Verificar si el usuario ya existe
async function userExists(username) {
  try {
    const response = await axios.get(`${CONFIG.glpiUrl}/User`, {
      headers: getHeaders(),
      params: {
        'searchText[name]': username,
      },
    });
    const users = response.data || [];
    return users.some(u => u.name.toLowerCase() === username.toLowerCase());
  } catch (error) {
    return false;
  }
}

// Crear usuario
async function createUser(userData) {
  try {
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
    }, {
      headers: getHeaders(),
    });

    return response.data.id;
  } catch (error) {
    throw new Error(error.response?.data?.[0] || error.message);
  }
}

// Asignar perfil al usuario
async function assignProfile(userId) {
  try {
    const response = await axios.post(`${CONFIG.glpiUrl}/Profile_User`, {
      input: {
        users_id: userId,
        profiles_id: CONFIG.profileId,
        entities_id: CONFIG.entityId,
        is_recursive: CONFIG.isRecursive,
        is_dynamic: 0,
      },
    }, {
      headers: getHeaders(),
    });
    return true;
  } catch (error) {
    throw new Error(error.response?.data?.[0] || error.message);
  }
}

// Leer archivo Excel
function readExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
  } catch (error) {
    throw new Error(`Error leyendo Excel: ${error.message}`);
  }
}

// Validar datos del usuario
function validateUser(user, index) {
  const errors = [];
  if (!user.usuario) errors.push('usuario');
  if (!user.nombre) errors.push('nombre');
  if (!user.apellido) errors.push('apellido');
  if (!user.password) errors.push('password');

  if (errors.length > 0) {
    return `Fila ${index + 2}: Faltan campos requeridos: ${errors.join(', ')}`;
  }
  return null;
}

// Proceso principal
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
${colors.bold}Importador de Técnicos a GLPI${colors.reset}

${colors.cyan}Uso:${colors.reset}
  node importar-tecnicos.mjs <archivo.xlsx>

${colors.cyan}Formato del Excel (columnas):${colors.reset}
  - usuario   (requerido) - Login del usuario
  - nombre    (requerido) - Nombre(s)
  - apellido  (requerido) - Apellido(s)
  - password  (requerido) - Contraseña
  - email     (opcional)  - Correo electrónico
  - telefono  (opcional)  - Teléfono
  - movil     (opcional)  - Celular

${colors.cyan}Ejemplo:${colors.reset}
  node importar-tecnicos.mjs tecnicos.xlsx
`);
    process.exit(0);
  }

  const filePath = path.resolve(args[0]);

  console.log(`\n${colors.bold}=== Importador de Técnicos a GLPI ===${colors.reset}\n`);
  log('info', `Archivo: ${filePath}`);
  log('info', `GLPI URL: ${CONFIG.glpiUrl}`);
  log('info', `Perfil a asignar: Technician (ID: ${CONFIG.profileId})`);
  console.log('');

  // Leer Excel
  let usuarios;
  try {
    usuarios = readExcel(filePath);
    log('success', `${usuarios.length} usuarios encontrados en el archivo`);
  } catch (error) {
    log('error', error.message);
    process.exit(1);
  }

  // Validar datos
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
  log('success', 'Todos los datos son válidos');

  // Iniciar sesión
  console.log('\n--- Conectando a GLPI ---');
  if (!await initSession()) {
    process.exit(1);
  }

  // Procesar usuarios
  console.log('\n--- Creando usuarios ---');
  const results = {
    created: [],
    skipped: [],
    errors: [],
  };

  for (const user of usuarios) {
    process.stdout.write(`  ${user.usuario}... `);

    try {
      // Verificar si existe
      if (await userExists(user.usuario)) {
        console.log(`${colors.yellow}ya existe, saltando${colors.reset}`);
        results.skipped.push(user.usuario);
        continue;
      }

      // Crear usuario
      const userId = await createUser(user);

      // Asignar perfil Technician
      await assignProfile(userId);

      console.log(`${colors.green}creado (ID: ${userId})${colors.reset}`);
      results.created.push({ usuario: user.usuario, id: userId });

    } catch (error) {
      console.log(`${colors.red}error: ${error.message}${colors.reset}`);
      results.errors.push({ usuario: user.usuario, error: error.message });
    }
  }

  // Cerrar sesión
  await killSession();

  // Resumen
  console.log(`\n${colors.bold}=== RESUMEN ===${colors.reset}`);
  console.log(`  ${colors.green}Creados:${colors.reset}  ${results.created.length}`);
  console.log(`  ${colors.yellow}Saltados:${colors.reset} ${results.skipped.length}`);
  console.log(`  ${colors.red}Errores:${colors.reset}  ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n${colors.red}Usuarios con error:${colors.reset}`);
    results.errors.forEach(e => console.log(`  - ${e.usuario}: ${e.error}`));
  }

  console.log('');
}

main().catch(error => {
  log('error', `Error fatal: ${error.message}`);
  process.exit(1);
});
