#!/usr/bin/env node
/**
 * Genera todas las plantillas Excel para carga masiva en GLPI
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const plantillasDir = './plantillas';

// Crear directorio si no existe
if (!fs.existsSync(plantillasDir)) {
  fs.mkdirSync(plantillasDir);
}

// Definir todas las plantillas
const plantillas = {
  // ========== ACTIVOS ==========
  'computadoras': {
    descripcion: 'PCs, Laptops, Servidores',
    campos: [
      { col: 'nombre', desc: 'Nombre del equipo', requerido: true, ejemplo: 'PC-VENTAS-001' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SN123456789' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-001' },
      { col: 'fabricante', desc: 'Marca (Dell, HP, Lenovo)', requerido: false, ejemplo: 'Dell' },
      { col: 'modelo', desc: 'Modelo del equipo', requerido: false, ejemplo: 'OptiPlex 7090' },
      { col: 'tipo', desc: 'Tipo (Desktop, Laptop, Servidor)', requerido: false, ejemplo: 'Desktop' },
      { col: 'estado', desc: 'Estado (En uso, En stock, etc)', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación física', requerido: false, ejemplo: 'Oficina Principal' },
      { col: 'usuario', desc: 'Usuario asignado (login)', requerido: false, ejemplo: 'jperez' },
      { col: 'grupo', desc: 'Grupo/Departamento', requerido: false, ejemplo: 'Ventas' },
      { col: 'comentario', desc: 'Notas adicionales', requerido: false, ejemplo: 'Equipo nuevo 2024' },
    ]
  },

  'monitores': {
    descripcion: 'Pantallas y monitores',
    campos: [
      { col: 'nombre', desc: 'Nombre del monitor', requerido: true, ejemplo: 'MON-VENTAS-001' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SN987654321' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-100' },
      { col: 'fabricante', desc: 'Marca', requerido: false, ejemplo: 'Samsung' },
      { col: 'modelo', desc: 'Modelo', requerido: false, ejemplo: 'S24E450' },
      { col: 'tipo', desc: 'Tipo (LCD, LED, OLED)', requerido: false, ejemplo: 'LED' },
      { col: 'tamaño', desc: 'Tamaño en pulgadas', requerido: false, ejemplo: '24' },
      { col: 'estado', desc: 'Estado', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación', requerido: false, ejemplo: 'Oficina Principal' },
      { col: 'usuario', desc: 'Usuario asignado', requerido: false, ejemplo: 'jperez' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'impresoras': {
    descripcion: 'Impresoras y multifuncionales',
    campos: [
      { col: 'nombre', desc: 'Nombre de la impresora', requerido: true, ejemplo: 'IMP-PISO1-001' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SNPRN123456' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-200' },
      { col: 'fabricante', desc: 'Marca', requerido: false, ejemplo: 'HP' },
      { col: 'modelo', desc: 'Modelo', requerido: false, ejemplo: 'LaserJet Pro M404' },
      { col: 'tipo', desc: 'Tipo (Laser, Inyección, Plotter)', requerido: false, ejemplo: 'Laser' },
      { col: 'estado', desc: 'Estado', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación', requerido: false, ejemplo: 'Piso 1' },
      { col: 'grupo', desc: 'Grupo que la usa', requerido: false, ejemplo: 'Administración' },
      { col: 'ip', desc: 'Dirección IP', requerido: false, ejemplo: '192.168.1.100' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: 'Impresora compartida' },
    ]
  },

  'telefonos': {
    descripcion: 'Teléfonos IP y celulares',
    campos: [
      { col: 'nombre', desc: 'Nombre/Extensión', requerido: true, ejemplo: 'TEL-EXT-101' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SNTEL123456' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-300' },
      { col: 'fabricante', desc: 'Marca', requerido: false, ejemplo: 'Cisco' },
      { col: 'modelo', desc: 'Modelo', requerido: false, ejemplo: 'IP Phone 7841' },
      { col: 'tipo', desc: 'Tipo (IP, Celular, Fijo)', requerido: false, ejemplo: 'IP' },
      { col: 'numero', desc: 'Número telefónico', requerido: false, ejemplo: '5512345678' },
      { col: 'estado', desc: 'Estado', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación', requerido: false, ejemplo: 'Recepción' },
      { col: 'usuario', desc: 'Usuario asignado', requerido: false, ejemplo: 'jperez' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'equipos_red': {
    descripcion: 'Switches, Routers, Access Points',
    campos: [
      { col: 'nombre', desc: 'Nombre del equipo', requerido: true, ejemplo: 'SW-PISO1-001' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SNNET123456' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-400' },
      { col: 'fabricante', desc: 'Marca', requerido: false, ejemplo: 'Cisco' },
      { col: 'modelo', desc: 'Modelo', requerido: false, ejemplo: 'Catalyst 2960' },
      { col: 'tipo', desc: 'Tipo (Switch, Router, AP, Firewall)', requerido: false, ejemplo: 'Switch' },
      { col: 'ip', desc: 'Dirección IP', requerido: false, ejemplo: '192.168.1.1' },
      { col: 'mac', desc: 'Dirección MAC', requerido: false, ejemplo: 'AA:BB:CC:DD:EE:FF' },
      { col: 'puertos', desc: 'Número de puertos', requerido: false, ejemplo: '24' },
      { col: 'estado', desc: 'Estado', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación', requerido: false, ejemplo: 'Rack Principal' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'perifericos': {
    descripcion: 'Teclados, Mouse, Webcams, etc',
    campos: [
      { col: 'nombre', desc: 'Nombre del periférico', requerido: true, ejemplo: 'WEBCAM-001' },
      { col: 'serial', desc: 'Número de serie', requerido: false, ejemplo: 'SNPER123456' },
      { col: 'inventario', desc: 'Número de inventario', requerido: false, ejemplo: 'INV-2024-500' },
      { col: 'fabricante', desc: 'Marca', requerido: false, ejemplo: 'Logitech' },
      { col: 'modelo', desc: 'Modelo', requerido: false, ejemplo: 'C920' },
      { col: 'tipo', desc: 'Tipo (Teclado, Mouse, Webcam, etc)', requerido: true, ejemplo: 'Webcam' },
      { col: 'estado', desc: 'Estado', requerido: false, ejemplo: 'En uso' },
      { col: 'ubicacion', desc: 'Ubicación', requerido: false, ejemplo: 'Sala de juntas' },
      { col: 'usuario', desc: 'Usuario asignado', requerido: false, ejemplo: 'jperez' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'software': {
    descripcion: 'Licencias y aplicaciones',
    campos: [
      { col: 'nombre', desc: 'Nombre del software', requerido: true, ejemplo: 'Microsoft Office 365' },
      { col: 'version', desc: 'Versión', requerido: false, ejemplo: '2024' },
      { col: 'fabricante', desc: 'Fabricante', requerido: false, ejemplo: 'Microsoft' },
      { col: 'licencia', desc: 'Número de licencia', requerido: false, ejemplo: 'XXXXX-XXXXX-XXXXX' },
      { col: 'tipo_licencia', desc: 'Tipo (OEM, Volumen, Suscripción)', requerido: false, ejemplo: 'Suscripción' },
      { col: 'cantidad', desc: 'Cantidad de licencias', requerido: false, ejemplo: '50' },
      { col: 'fecha_compra', desc: 'Fecha de compra (YYYY-MM-DD)', requerido: false, ejemplo: '2024-01-15' },
      { col: 'fecha_expiracion', desc: 'Fecha expiración (YYYY-MM-DD)', requerido: false, ejemplo: '2025-01-15' },
      { col: 'categoria', desc: 'Categoría', requerido: false, ejemplo: 'Ofimática' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  // ========== PERSONAS / ORGANIZACIÓN ==========
  'usuarios': {
    descripcion: 'Usuarios del sistema (técnicos, clientes)',
    campos: [
      { col: 'usuario', desc: 'Login del usuario', requerido: true, ejemplo: 'jperez' },
      { col: 'nombre', desc: 'Nombre(s)', requerido: true, ejemplo: 'Juan' },
      { col: 'apellido', desc: 'Apellido(s)', requerido: true, ejemplo: 'Pérez García' },
      { col: 'password', desc: 'Contraseña', requerido: true, ejemplo: 'Password123!' },
      { col: 'email', desc: 'Correo electrónico', requerido: false, ejemplo: 'jperez@empresa.com' },
      { col: 'telefono', desc: 'Teléfono', requerido: false, ejemplo: '5512345678' },
      { col: 'movil', desc: 'Celular', requerido: false, ejemplo: '5598765432' },
      { col: 'perfil', desc: 'Perfil (Technician, Cliente, Admin)', requerido: false, ejemplo: 'Technician' },
    ]
  },

  'contactos': {
    descripcion: 'Contactos externos (proveedores, soporte)',
    campos: [
      { col: 'nombre', desc: 'Nombre del contacto', requerido: true, ejemplo: 'Juan Pérez' },
      { col: 'email', desc: 'Correo electrónico', requerido: false, ejemplo: 'juan@proveedor.com' },
      { col: 'telefono', desc: 'Teléfono', requerido: false, ejemplo: '5512345678' },
      { col: 'movil', desc: 'Celular', requerido: false, ejemplo: '5598765432' },
      { col: 'direccion', desc: 'Dirección', requerido: false, ejemplo: 'Av. Principal 123' },
      { col: 'ciudad', desc: 'Ciudad', requerido: false, ejemplo: 'CDMX' },
      { col: 'puesto', desc: 'Puesto/Cargo', requerido: false, ejemplo: 'Gerente de Ventas' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'proveedores': {
    descripcion: 'Empresas proveedoras',
    campos: [
      { col: 'nombre', desc: 'Nombre de la empresa', requerido: true, ejemplo: 'Tech Solutions SA' },
      { col: 'tipo', desc: 'Tipo de proveedor', requerido: false, ejemplo: 'Hardware' },
      { col: 'telefono', desc: 'Teléfono', requerido: false, ejemplo: '5512345678' },
      { col: 'email', desc: 'Email de contacto', requerido: false, ejemplo: 'ventas@techsolutions.com' },
      { col: 'sitio_web', desc: 'Sitio web', requerido: false, ejemplo: 'www.techsolutions.com' },
      { col: 'direccion', desc: 'Dirección', requerido: false, ejemplo: 'Av. Tecnología 456' },
      { col: 'ciudad', desc: 'Ciudad', requerido: false, ejemplo: 'CDMX' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: 'Proveedor principal de laptops' },
    ]
  },

  'grupos': {
    descripcion: 'Departamentos y grupos de trabajo',
    campos: [
      { col: 'nombre', desc: 'Nombre del grupo', requerido: true, ejemplo: 'Soporte Técnico' },
      { col: 'descripcion', desc: 'Descripción', requerido: false, ejemplo: 'Equipo de soporte nivel 1' },
      { col: 'es_tecnico', desc: 'Es grupo técnico (si/no)', requerido: false, ejemplo: 'si' },
      { col: 'es_solicitante', desc: 'Puede crear tickets (si/no)', requerido: false, ejemplo: 'si' },
      { col: 'es_asignable', desc: 'Se le asignan tickets (si/no)', requerido: false, ejemplo: 'si' },
      { col: 'email', desc: 'Email del grupo', requerido: false, ejemplo: 'soporte@empresa.com' },
    ]
  },

  'ubicaciones': {
    descripcion: 'Oficinas, sucursales, edificios',
    campos: [
      { col: 'nombre', desc: 'Nombre de la ubicación', requerido: true, ejemplo: 'Oficina Central' },
      { col: 'direccion', desc: 'Dirección completa', requerido: false, ejemplo: 'Av. Reforma 123' },
      { col: 'ciudad', desc: 'Ciudad', requerido: false, ejemplo: 'CDMX' },
      { col: 'estado', desc: 'Estado/Provincia', requerido: false, ejemplo: 'CDMX' },
      { col: 'codigo_postal', desc: 'Código postal', requerido: false, ejemplo: '06600' },
      { col: 'pais', desc: 'País', requerido: false, ejemplo: 'México' },
      { col: 'edificio', desc: 'Edificio', requerido: false, ejemplo: 'Torre A' },
      { col: 'piso', desc: 'Piso', requerido: false, ejemplo: '5' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  // ========== GESTIÓN ==========
  'contratos': {
    descripcion: 'Contratos de mantenimiento y garantías',
    campos: [
      { col: 'nombre', desc: 'Nombre del contrato', requerido: true, ejemplo: 'Mantenimiento Anual 2024' },
      { col: 'numero', desc: 'Número de contrato', requerido: false, ejemplo: 'CONT-2024-001' },
      { col: 'tipo', desc: 'Tipo de contrato', requerido: false, ejemplo: 'Mantenimiento' },
      { col: 'proveedor', desc: 'Proveedor', requerido: false, ejemplo: 'Tech Solutions SA' },
      { col: 'fecha_inicio', desc: 'Fecha inicio (YYYY-MM-DD)', requerido: true, ejemplo: '2024-01-01' },
      { col: 'fecha_fin', desc: 'Fecha fin (YYYY-MM-DD)', requerido: false, ejemplo: '2024-12-31' },
      { col: 'costo', desc: 'Costo total', requerido: false, ejemplo: '50000' },
      { col: 'renovacion', desc: 'Renovación automática (si/no)', requerido: false, ejemplo: 'si' },
      { col: 'alerta_dias', desc: 'Alertar X días antes', requerido: false, ejemplo: '30' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: '' },
    ]
  },

  'tickets': {
    descripcion: 'Incidentes y solicitudes',
    campos: [
      { col: 'titulo', desc: 'Título del ticket', requerido: true, ejemplo: 'No funciona el correo' },
      { col: 'descripcion', desc: 'Descripción detallada', requerido: true, ejemplo: 'El usuario no puede enviar correos desde Outlook' },
      { col: 'tipo', desc: 'Tipo (Incidente/Solicitud)', requerido: false, ejemplo: 'Incidente' },
      { col: 'categoria', desc: 'Categoría', requerido: false, ejemplo: 'Correo Electrónico' },
      { col: 'urgencia', desc: 'Urgencia (1-5)', requerido: false, ejemplo: '3' },
      { col: 'impacto', desc: 'Impacto (1-5)', requerido: false, ejemplo: '3' },
      { col: 'solicitante', desc: 'Usuario solicitante (login)', requerido: false, ejemplo: 'jperez' },
      { col: 'asignado', desc: 'Técnico asignado (login)', requerido: false, ejemplo: 'tecnico1' },
      { col: 'grupo', desc: 'Grupo asignado', requerido: false, ejemplo: 'Soporte Nivel 1' },
      { col: 'ubicacion', desc: 'Ubicación del problema', requerido: false, ejemplo: 'Oficina Central' },
    ]
  },

  'presupuestos': {
    descripcion: 'Presupuestos y control de costos',
    campos: [
      { col: 'nombre', desc: 'Nombre del presupuesto', requerido: true, ejemplo: 'Presupuesto TI 2024' },
      { col: 'monto', desc: 'Monto total', requerido: true, ejemplo: '500000' },
      { col: 'fecha_inicio', desc: 'Fecha inicio (YYYY-MM-DD)', requerido: false, ejemplo: '2024-01-01' },
      { col: 'fecha_fin', desc: 'Fecha fin (YYYY-MM-DD)', requerido: false, ejemplo: '2024-12-31' },
      { col: 'ubicacion', desc: 'Ubicación/Entidad', requerido: false, ejemplo: 'Oficina Central' },
      { col: 'comentario', desc: 'Notas', requerido: false, ejemplo: 'Presupuesto anual de TI' },
    ]
  },
};

// Función para crear un archivo Excel
function crearPlantilla(nombre, config) {
  const datos = config.campos.map(c => ({
    [c.col]: c.ejemplo
  }));

  // Crear objeto con una fila de ejemplo
  const ejemploRow = {};
  config.campos.forEach(c => {
    ejemploRow[c.col] = c.ejemplo;
  });

  // Crear workbook
  const wb = XLSX.utils.book_new();

  // Hoja de datos
  const ws = XLSX.utils.json_to_sheet([ejemploRow]);
  ws['!cols'] = config.campos.map(c => ({ wch: Math.max(c.col.length, c.ejemplo.length, 15) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');

  // Hoja de instrucciones
  const instrucciones = [
    { Campo: '=== INSTRUCCIONES ===', Descripcion: '', Requerido: '', Ejemplo: '' },
    { Campo: `Plantilla: ${nombre}`, Descripcion: config.descripcion, Requerido: '', Ejemplo: '' },
    { Campo: '', Descripcion: '', Requerido: '', Ejemplo: '' },
    { Campo: '=== CAMPOS ===', Descripcion: '', Requerido: '', Ejemplo: '' },
    ...config.campos.map(c => ({
      Campo: c.col,
      Descripcion: c.desc,
      Requerido: c.requerido ? 'SÍ' : 'No',
      Ejemplo: c.ejemplo
    }))
  ];
  const wsInst = XLSX.utils.json_to_sheet(instrucciones);
  wsInst['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 10 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

  // Guardar
  const archivo = `${plantillasDir}/${nombre}.xlsx`;
  XLSX.writeFile(wb, archivo);
  return archivo;
}

// Generar todas las plantillas
console.log('\n=== Generando plantillas de carga masiva para GLPI ===\n');

const archivosCreados = [];
for (const [nombre, config] of Object.entries(plantillas)) {
  const archivo = crearPlantilla(nombre, config);
  console.log(`✓ ${archivo}`);
  archivosCreados.push({ nombre, archivo, descripcion: config.descripcion });
}

console.log(`\n✅ ${archivosCreados.length} plantillas creadas en: ${plantillasDir}/`);
console.log('\nPlantillas disponibles:');
console.log('─'.repeat(60));
archivosCreados.forEach(a => {
  console.log(`  ${a.nombre.padEnd(20)} - ${a.descripcion}`);
});
console.log('─'.repeat(60));
console.log('\nPara importar, usa: node importar-masivo.mjs <tipo> <archivo.xlsx>');
console.log('Ejemplo: node importar-masivo.mjs computadoras plantillas/computadoras.xlsx\n');
