#!/usr/bin/env node
/**
 * Script genérico para importar datos masivamente a GLPI
 *
 * USO:
 *   node importar-masivo.mjs <tipo> <archivo.xlsx>
 *
 * TIPOS DISPONIBLES:
 *   computadoras, monitores, impresoras, telefonos, equipos_red,
 *   perifericos, software, usuarios, contactos, proveedores,
 *   grupos, ubicaciones, contratos, tickets, presupuestos
 */

import XLSX from 'xlsx';
import axios from 'axios';
import path from 'path';

// Configuración de GLPI
const CONFIG = {
  glpiUrl: process.env.GLPI_URL || 'https://glpi.entersys.mx/apirest.php',
  appToken: process.env.GLPI_APP_TOKEN || '',
  username: process.env.GLPI_USERNAME || '',
  password: process.env.GLPI_PASSWORD || '',
};

let sessionToken = null;

// Colores para consola
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Mapeo de tipos a endpoints de GLPI
const TIPOS = {
  computadoras: {
    endpoint: 'Computer',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      comment: row.comentario || '',
      // Los campos de relación se resuelven después
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
      _usuario: row.usuario,
      _grupo: row.grupo,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion', 'usuario', 'grupo'],
  },

  monitores: {
    endpoint: 'Monitor',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      size: row.tamaño || '',
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
      _usuario: row.usuario,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion', 'usuario'],
  },

  impresoras: {
    endpoint: 'Printer',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
      _grupo: row.grupo,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion', 'grupo'],
  },

  telefonos: {
    endpoint: 'Phone',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      number_line: row.numero || '',
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
      _usuario: row.usuario,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion', 'usuario'],
  },

  equipos_red: {
    endpoint: 'NetworkEquipment',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      mac: row.mac || '',
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion'],
  },

  perifericos: {
    endpoint: 'Peripheral',
    mapeo: (row) => ({
      name: row.nombre,
      serial: row.serial || '',
      otherserial: row.inventario || '',
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _modelo: row.modelo,
      _tipo: row.tipo,
      _estado: row.estado,
      _ubicacion: row.ubicacion,
      _usuario: row.usuario,
    }),
    relaciones: ['fabricante', 'modelo', 'tipo', 'estado', 'ubicacion', 'usuario'],
  },

  software: {
    endpoint: 'Software',
    mapeo: (row) => ({
      name: row.nombre,
      comment: row.comentario || '',
      _fabricante: row.fabricante,
      _categoria: row.categoria,
    }),
    relaciones: ['fabricante', 'categoria'],
  },

  usuarios: {
    endpoint: 'User',
    mapeo: (row) => ({
      name: row.usuario,
      realname: row.apellido,
      firstname: row.nombre,
      password: row.password,
      password2: row.password,
      phone: row.telefono || '',
      mobile: row.movil || '',
      _useremails: row.email ? [row.email] : [],
      is_active: 1,
    }),
    relaciones: [],
    postCreate: async (id, row) => {
      // Asignar perfil
      const perfiles = {
        'technician': 6,
        'tecnico': 6,
        'admin': 3,
        'cliente': 1,
        'self-service': 1,
        'super-admin': 4,
        'supervisor': 7,
      };
      const perfilId = perfiles[(row.perfil || 'technician').toLowerCase()] || 6;
      await crearItem('Profile_User', {
        users_id: id,
        profiles_id: perfilId,
        entities_id: 0,
        is_recursive: 1,
      });
    }
  },

  contactos: {
    endpoint: 'Contact',
    mapeo: (row) => ({
      name: row.nombre,
      email: row.email || '',
      phone: row.telefono || '',
      mobile: row.movil || '',
      address: row.direccion || '',
      town: row.ciudad || '',
      comment: row.comentario || '',
    }),
    relaciones: [],
  },

  proveedores: {
    endpoint: 'Supplier',
    mapeo: (row) => ({
      name: row.nombre,
      email: row.email || '',
      phonenumber: row.telefono || '',
      website: row.sitio_web || '',
      address: row.direccion || '',
      town: row.ciudad || '',
      comment: row.comentario || '',
    }),
    relaciones: ['tipo'],
  },

  grupos: {
    endpoint: 'Group',
    mapeo: (row) => ({
      name: row.nombre,
      comment: row.descripcion || '',
      is_requester: row.es_solicitante?.toLowerCase() === 'si' ? 1 : 0,
      is_assign: row.es_asignable?.toLowerCase() === 'si' ? 1 : 0,
      is_notify: 1,
    }),
    relaciones: [],
  },

  ubicaciones: {
    endpoint: 'Location',
    mapeo: (row) => ({
      name: row.nombre,
      address: row.direccion || '',
      town: row.ciudad || '',
      state: row.estado || '',
      postcode: row.codigo_postal || '',
      country: row.pais || '',
      building: row.edificio || '',
      room: row.piso || '',
      comment: row.comentario || '',
    }),
    relaciones: [],
  },

  contratos: {
    endpoint: 'Contract',
    mapeo: (row) => ({
      name: row.nombre,
      num: row.numero || '',
      begin_date: row.fecha_inicio,
      duration: calcularMeses(row.fecha_inicio, row.fecha_fin),
      comment: row.comentario || '',
      renewal: row.renovacion?.toLowerCase() === 'si' ? 1 : 0,
      alert: parseInt(row.alerta_dias) || 0,
    }),
    relaciones: ['tipo', 'proveedor'],
  },

  tickets: {
    endpoint: 'Ticket',
    mapeo: (row) => ({
      name: row.titulo,
      content: row.descripcion,
      type: row.tipo?.toLowerCase() === 'solicitud' ? 2 : 1,
      urgency: parseInt(row.urgencia) || 3,
      impact: parseInt(row.impacto) || 3,
      status: 1, // Nuevo
    }),
    relaciones: ['categoria', 'solicitante', 'asignado', 'grupo', 'ubicacion'],
  },

  presupuestos: {
    endpoint: 'Budget',
    mapeo: (row) => ({
      name: row.nombre,
      value: parseFloat(row.monto) || 0,
      begin_date: row.fecha_inicio || null,
      end_date: row.fecha_fin || null,
      comment: row.comentario || '',
    }),
    relaciones: ['ubicacion'],
  },
};

// Cachés para evitar búsquedas repetidas
const cache = {
  fabricantes: {},
  modelos: {},
  tipos: {},
  estados: {},
  ubicaciones: {},
  usuarios: {},
  grupos: {},
  categorias: {},
  proveedores: {},
};

function calcularMeses(inicio, fin) {
  if (!inicio || !fin) return 12;
  const d1 = new Date(inicio);
  const d2 = new Date(fin);
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * 30)));
}

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

async function buscarOCrear(endpoint, nombre, campoExtra = {}) {
  if (!nombre) return null;

  const cacheKey = `${endpoint}_${nombre}`;
  if (cache[endpoint]?.[nombre]) return cache[endpoint][nombre];

  try {
    // Buscar existente
    const response = await axios.get(`${CONFIG.glpiUrl}/${endpoint}`, {
      headers: getHeaders(),
      params: { 'searchText[name]': nombre },
    });

    const items = response.data || [];
    const found = items.find(i => i.name.toLowerCase() === nombre.toLowerCase());

    if (found) {
      if (!cache[endpoint]) cache[endpoint] = {};
      cache[endpoint][nombre] = found.id;
      return found.id;
    }

    // Crear nuevo
    const createResponse = await axios.post(`${CONFIG.glpiUrl}/${endpoint}`, {
      input: { name: nombre, ...campoExtra },
    }, { headers: getHeaders() });

    const newId = createResponse.data.id;
    if (!cache[endpoint]) cache[endpoint] = {};
    cache[endpoint][nombre] = newId;
    return newId;

  } catch (error) {
    return null;
  }
}

async function crearItem(endpoint, data) {
  const response = await axios.post(`${CONFIG.glpiUrl}/${endpoint}`, {
    input: data,
  }, { headers: getHeaders() });
  return response.data.id;
}

async function resolverRelaciones(tipo, datos) {
  const config = TIPOS[tipo];
  const resultado = { ...datos };

  // Resolver fabricante
  if (datos._fabricante) {
    resultado.manufacturers_id = await buscarOCrear('Manufacturer', datos._fabricante);
    delete resultado._fabricante;
  }

  // Resolver modelo (depende del tipo)
  if (datos._modelo) {
    const modeloEndpoint = {
      'Computer': 'ComputerModel',
      'Monitor': 'MonitorModel',
      'Printer': 'PrinterModel',
      'Phone': 'PhoneModel',
      'NetworkEquipment': 'NetworkEquipmentModel',
      'Peripheral': 'PeripheralModel',
    }[config.endpoint];
    if (modeloEndpoint) {
      resultado[`${config.endpoint.toLowerCase()}models_id`] = await buscarOCrear(modeloEndpoint, datos._modelo);
    }
    delete resultado._modelo;
  }

  // Resolver tipo
  if (datos._tipo) {
    const tipoEndpoint = {
      'Computer': 'ComputerType',
      'Monitor': 'MonitorType',
      'Printer': 'PrinterType',
      'Phone': 'PhoneType',
      'NetworkEquipment': 'NetworkEquipmentType',
      'Peripheral': 'PeripheralType',
      'Supplier': 'SupplierType',
      'Contract': 'ContractType',
    }[config.endpoint];
    if (tipoEndpoint) {
      resultado[`${config.endpoint.toLowerCase()}types_id`] = await buscarOCrear(tipoEndpoint, datos._tipo);
    }
    delete resultado._tipo;
  }

  // Resolver estado
  if (datos._estado) {
    resultado.states_id = await buscarOCrear('State', datos._estado);
    delete resultado._estado;
  }

  // Resolver ubicación
  if (datos._ubicacion) {
    resultado.locations_id = await buscarOCrear('Location', datos._ubicacion);
    delete resultado._ubicacion;
  }

  // Resolver usuario
  if (datos._usuario) {
    try {
      const response = await axios.get(`${CONFIG.glpiUrl}/User`, {
        headers: getHeaders(),
        params: { 'searchText[name]': datos._usuario },
      });
      const users = response.data || [];
      const user = users.find(u => u.name.toLowerCase() === datos._usuario.toLowerCase());
      if (user) resultado.users_id = user.id;
    } catch (e) {}
    delete resultado._usuario;
  }

  // Resolver grupo
  if (datos._grupo) {
    resultado.groups_id = await buscarOCrear('Group', datos._grupo);
    delete resultado._grupo;
  }

  // Resolver categoría
  if (datos._categoria) {
    resultado.softwarecategories_id = await buscarOCrear('SoftwareCategory', datos._categoria);
    delete resultado._categoria;
  }

  // Resolver proveedor
  if (datos._proveedor) {
    try {
      const response = await axios.get(`${CONFIG.glpiUrl}/Supplier`, {
        headers: getHeaders(),
        params: { 'searchText[name]': datos._proveedor },
      });
      const suppliers = response.data || [];
      const supplier = suppliers.find(s => s.name.toLowerCase() === datos._proveedor.toLowerCase());
      if (supplier) resultado.suppliers_id = supplier.id;
    } catch (e) {}
    delete resultado._proveedor;
  }

  // Limpiar campos undefined
  Object.keys(resultado).forEach(key => {
    if (resultado[key] === undefined || resultado[key] === null) {
      delete resultado[key];
    }
  });

  return resultado;
}

function leerExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
${c.bold}Importador Masivo para GLPI${c.reset}

${c.cyan}Uso:${c.reset}
  node importar-masivo.mjs <tipo> <archivo.xlsx>

${c.cyan}Tipos disponibles:${c.reset}
  ${c.bold}Activos:${c.reset}
    computadoras   - PCs, laptops, servidores
    monitores      - Pantallas
    impresoras     - Impresoras, multifuncionales
    telefonos      - Teléfonos IP, celulares
    equipos_red    - Switches, routers, APs
    perifericos    - Teclados, mouse, webcams
    software       - Licencias, aplicaciones

  ${c.bold}Organización:${c.reset}
    usuarios       - Usuarios del sistema
    contactos      - Contactos externos
    proveedores    - Empresas proveedoras
    grupos         - Departamentos
    ubicaciones    - Oficinas, sucursales

  ${c.bold}Gestión:${c.reset}
    contratos      - Mantenimientos, garantías
    tickets        - Incidentes, solicitudes
    presupuestos   - Control de costos

${c.cyan}Ejemplo:${c.reset}
  node importar-masivo.mjs computadoras plantillas/computadoras.xlsx
`);
    process.exit(0);
  }

  const tipo = args[0].toLowerCase();
  const archivo = path.resolve(args[1]);

  if (!TIPOS[tipo]) {
    console.log(`${c.red}Error: Tipo '${tipo}' no válido${c.reset}`);
    console.log(`Tipos disponibles: ${Object.keys(TIPOS).join(', ')}`);
    process.exit(1);
  }

  const config = TIPOS[tipo];

  console.log(`\n${c.bold}=== Importador Masivo GLPI ===${c.reset}\n`);
  console.log(`${c.cyan}Tipo:${c.reset}    ${tipo}`);
  console.log(`${c.cyan}Archivo:${c.reset} ${archivo}`);
  console.log(`${c.cyan}Endpoint:${c.reset} ${config.endpoint}`);

  // Leer Excel
  let datos;
  try {
    datos = leerExcel(archivo);
    console.log(`${c.green}✓${c.reset} ${datos.length} registros encontrados\n`);
  } catch (error) {
    console.log(`${c.red}✗ Error leyendo archivo: ${error.message}${c.reset}`);
    process.exit(1);
  }

  // Conectar
  console.log('--- Conectando a GLPI ---');
  try {
    await initSession();
    console.log(`${c.green}✓${c.reset} Conectado\n`);
  } catch (error) {
    console.log(`${c.red}✗ Error de conexión: ${error.message}${c.reset}`);
    process.exit(1);
  }

  // Procesar
  console.log('--- Importando datos ---');
  const results = { created: 0, errors: [] };

  for (let i = 0; i < datos.length; i++) {
    const row = datos[i];
    const nombre = row.nombre || row.usuario || row.titulo || `Registro ${i + 1}`;
    process.stdout.write(`  [${i + 1}/${datos.length}] ${nombre}... `);

    try {
      // Mapear datos
      let itemData = config.mapeo(row);

      // Resolver relaciones
      itemData = await resolverRelaciones(tipo, itemData);

      // Crear item
      const id = await crearItem(config.endpoint, itemData);

      // Post-create (ej: asignar perfil a usuario)
      if (config.postCreate) {
        await config.postCreate(id, row);
      }

      console.log(`${c.green}OK (ID: ${id})${c.reset}`);
      results.created++;

    } catch (error) {
      const msg = error.response?.data?.[0] || error.message;
      console.log(`${c.red}ERROR: ${msg}${c.reset}`);
      results.errors.push({ nombre, error: msg });
    }
  }

  await killSession();

  // Resumen
  console.log(`\n${c.bold}=== RESUMEN ===${c.reset}`);
  console.log(`  ${c.green}Creados:${c.reset} ${results.created}`);
  console.log(`  ${c.red}Errores:${c.reset} ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n${c.red}Registros con error:${c.reset}`);
    results.errors.forEach(e => console.log(`  - ${e.nombre}: ${e.error}`));
  }

  console.log('');
}

main().catch(error => {
  console.error(`${c.red}Error fatal: ${error.message}${c.reset}`);
  process.exit(1);
});
