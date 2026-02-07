#!/usr/bin/env node
/**
 * Script para importar catálogos de tickets a GLPI
 * (Categorías, Ubicaciones, Grupos)
 *
 * USO:
 *   node importar-catalogos.mjs <tipo> <archivo.xlsx>
 *
 * TIPOS:
 *   categorias  - Categorías de tickets (ITILCategory)
 *   ubicaciones - Ubicaciones/Proyectos (Location)
 *   grupos      - Grupos/Áreas (Group)
 */

import XLSX from 'xlsx';
import axios from 'axios';
import path from 'path';

const CONFIG = {
  glpiUrl: 'https://glpi.entersys.mx/apirest.php',
  appToken: '***GLPI_APP_TOKEN_REMOVED***',
  username: 'glpi',
  password: 'glpi',
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

async function initSession() {
  const credentials = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
  const response = await axios.get(`${CONFIG.glpiUrl}/initSession`, {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'App-Token': CONFIG.appToken,
    },
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
  return {
    'Content-Type': 'application/json',
    'Session-Token': sessionToken,
    'App-Token': CONFIG.appToken,
  };
}

// Cache para IDs de padres
const cache = {};

async function buscarPorNombre(endpoint, nombre) {
  if (!nombre) return null;

  const cacheKey = `${endpoint}_${nombre}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const response = await axios.get(`${CONFIG.glpiUrl}/${endpoint}`, {
      headers: getHeaders(),
      params: { 'searchText[name]': nombre, range: '0-100' },
    });
    const items = response.data || [];
    const found = items.find(i => i.name.toLowerCase() === nombre.toLowerCase());
    if (found) {
      cache[cacheKey] = found.id;
      return found.id;
    }
  } catch (e) {}
  return null;
}

async function crearItem(endpoint, data) {
  const response = await axios.post(`${CONFIG.glpiUrl}/${endpoint}`, {
    input: data,
  }, { headers: getHeaders() });

  const id = response.data.id;
  // Guardar en cache
  if (data.name) {
    cache[`${endpoint}_${data.name}`] = id;
  }
  return id;
}

function leerExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

function siNo(valor) {
  if (!valor) return 0;
  return valor.toString().toLowerCase() === 'si' ? 1 : 0;
}

// Importar categorías de tickets
async function importarCategorias(datos) {
  console.log(`\n${c.cyan}Importando ${datos.length} categorías...${c.reset}\n`);

  // Ordenar: primero los que no tienen padre
  const sinPadre = datos.filter(d => !d.categoria_padre);
  const conPadre = datos.filter(d => d.categoria_padre);
  const ordenados = [...sinPadre, ...conPadre];

  const results = { created: 0, errors: [] };

  for (const row of ordenados) {
    process.stdout.write(`  ${row.nombre}... `);

    try {
      // Verificar si ya existe
      const existente = await buscarPorNombre('ITILCategory', row.nombre);
      if (existente) {
        console.log(`${c.yellow}ya existe${c.reset}`);
        continue;
      }

      // Buscar padre si existe
      let padreId = 0;
      if (row.categoria_padre) {
        padreId = await buscarPorNombre('ITILCategory', row.categoria_padre);
        if (!padreId) {
          console.log(`${c.red}padre '${row.categoria_padre}' no encontrado${c.reset}`);
          results.errors.push({ nombre: row.nombre, error: `Padre no encontrado: ${row.categoria_padre}` });
          continue;
        }
      }

      const data = {
        name: row.nombre,
        itilcategories_id: padreId,
        code: row.codigo || '',
        is_incident: siNo(row.es_incidente),
        is_request: siNo(row.es_solicitud),
        is_problem: siNo(row.es_problema),
        is_change: siNo(row.es_cambio),
        comment: row.comentario || '',
      };

      const id = await crearItem('ITILCategory', data);
      console.log(`${c.green}OK (ID: ${id})${c.reset}`);
      results.created++;

    } catch (error) {
      const msg = error.response?.data?.[0] || error.message;
      console.log(`${c.red}ERROR: ${msg}${c.reset}`);
      results.errors.push({ nombre: row.nombre, error: msg });
    }
  }

  return results;
}

// Importar ubicaciones
async function importarUbicaciones(datos) {
  console.log(`\n${c.cyan}Importando ${datos.length} ubicaciones...${c.reset}\n`);

  // Ordenar: primero los que no tienen padre
  const sinPadre = datos.filter(d => !d.ubicacion_padre);
  const conPadre = datos.filter(d => d.ubicacion_padre);
  const ordenados = [...sinPadre, ...conPadre];

  const results = { created: 0, errors: [] };

  for (const row of ordenados) {
    process.stdout.write(`  ${row.nombre}... `);

    try {
      // Verificar si ya existe
      const existente = await buscarPorNombre('Location', row.nombre);
      if (existente) {
        console.log(`${c.yellow}ya existe${c.reset}`);
        continue;
      }

      // Buscar padre si existe
      let padreId = 0;
      if (row.ubicacion_padre) {
        padreId = await buscarPorNombre('Location', row.ubicacion_padre);
        if (!padreId) {
          console.log(`${c.red}padre '${row.ubicacion_padre}' no encontrado${c.reset}`);
          results.errors.push({ nombre: row.nombre, error: `Padre no encontrado: ${row.ubicacion_padre}` });
          continue;
        }
      }

      const data = {
        name: row.nombre,
        locations_id: padreId,
        address: row.direccion || '',
        town: row.ciudad || '',
        state: row.estado || '',
        postcode: row.codigo_postal || '',
        building: row.edificio || '',
        room: row.piso || '',
        comment: row.comentario || '',
      };

      const id = await crearItem('Location', data);
      console.log(`${c.green}OK (ID: ${id})${c.reset}`);
      results.created++;

    } catch (error) {
      const msg = error.response?.data?.[0] || error.message;
      console.log(`${c.red}ERROR: ${msg}${c.reset}`);
      results.errors.push({ nombre: row.nombre, error: msg });
    }
  }

  return results;
}

// Importar grupos
async function importarGrupos(datos) {
  console.log(`\n${c.cyan}Importando ${datos.length} grupos...${c.reset}\n`);

  // Ordenar: primero los que no tienen padre
  const sinPadre = datos.filter(d => !d.grupo_padre);
  const conPadre = datos.filter(d => d.grupo_padre);
  const ordenados = [...sinPadre, ...conPadre];

  const results = { created: 0, errors: [] };

  for (const row of ordenados) {
    process.stdout.write(`  ${row.nombre}... `);

    try {
      // Verificar si ya existe
      const existente = await buscarPorNombre('Group', row.nombre);
      if (existente) {
        console.log(`${c.yellow}ya existe${c.reset}`);
        continue;
      }

      // Buscar padre si existe
      let padreId = 0;
      if (row.grupo_padre) {
        padreId = await buscarPorNombre('Group', row.grupo_padre);
        if (!padreId) {
          console.log(`${c.red}padre '${row.grupo_padre}' no encontrado${c.reset}`);
          results.errors.push({ nombre: row.nombre, error: `Padre no encontrado: ${row.grupo_padre}` });
          continue;
        }
      }

      const data = {
        name: row.nombre,
        groups_id: padreId,
        is_requester: siNo(row.puede_ser_solicitante),
        is_watcher: siNo(row.puede_ser_observador),
        is_assign: siNo(row.puede_asignarse),
        is_task: 1,
        is_notify: 1,
        comment: row.comentario || '',
      };

      const id = await crearItem('Group', data);
      console.log(`${c.green}OK (ID: ${id})${c.reset}`);
      results.created++;

    } catch (error) {
      const msg = error.response?.data?.[0] || error.message;
      console.log(`${c.red}ERROR: ${msg}${c.reset}`);
      results.errors.push({ nombre: row.nombre, error: msg });
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
${c.bold}Importador de Catálogos para Tickets${c.reset}

${c.cyan}Uso:${c.reset}
  node importar-catalogos.mjs <tipo> <archivo.xlsx>

${c.cyan}Tipos disponibles:${c.reset}
  categorias   - Categorías de tickets (ITILCategory)
  ubicaciones  - Ubicaciones/Proyectos (Location)
  grupos       - Grupos/Áreas/Departamentos (Group)

${c.cyan}Ejemplos:${c.reset}
  node importar-catalogos.mjs categorias plantillas/categorias_ticket.xlsx
  node importar-catalogos.mjs ubicaciones plantillas/ubicaciones.xlsx
  node importar-catalogos.mjs grupos plantillas/grupos.xlsx

${c.yellow}IMPORTANTE:${c.reset} Carga primero los elementos PADRE antes que los HIJOS
`);
    process.exit(0);
  }

  const tipo = args[0].toLowerCase();
  const archivo = path.resolve(args[1]);

  const tiposValidos = ['categorias', 'ubicaciones', 'grupos'];
  if (!tiposValidos.includes(tipo)) {
    console.log(`${c.red}Error: Tipo '${tipo}' no válido${c.reset}`);
    console.log(`Tipos válidos: ${tiposValidos.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${c.bold}=== Importador de Catálogos GLPI ===${c.reset}\n`);
  console.log(`${c.cyan}Tipo:${c.reset}    ${tipo}`);
  console.log(`${c.cyan}Archivo:${c.reset} ${archivo}`);

  // Leer Excel
  let datos;
  try {
    datos = leerExcel(archivo);
    console.log(`${c.green}✓${c.reset} ${datos.length} registros encontrados`);
  } catch (error) {
    console.log(`${c.red}✗ Error leyendo archivo: ${error.message}${c.reset}`);
    process.exit(1);
  }

  // Conectar
  console.log('\n--- Conectando a GLPI ---');
  try {
    await initSession();
    console.log(`${c.green}✓${c.reset} Conectado`);
  } catch (error) {
    console.log(`${c.red}✗ Error: ${error.message}${c.reset}`);
    process.exit(1);
  }

  // Importar según tipo
  let results;
  switch (tipo) {
    case 'categorias':
      results = await importarCategorias(datos);
      break;
    case 'ubicaciones':
      results = await importarUbicaciones(datos);
      break;
    case 'grupos':
      results = await importarGrupos(datos);
      break;
  }

  await killSession();

  // Resumen
  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Creados:${c.reset} ${results.created}`);
  console.log(`  ${c.red}Errores:${c.reset} ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n${c.red}Errores:${c.reset}`);
    results.errors.forEach(e => console.log(`  - ${e.nombre}: ${e.error}`));
  }

  console.log('');
}

main().catch(error => {
  console.error(`${c.red}Error: ${error.message}${c.reset}`);
  process.exit(1);
});
