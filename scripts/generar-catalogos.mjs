#!/usr/bin/env node
/**
 * Genera plantillas para los catálogos usados en tickets
 */

import XLSX from 'xlsx';
import fs from 'fs';

const plantillasDir = './plantillas';

const catalogos = {
  'categorias_ticket': {
    descripcion: 'Categorías para clasificar tickets (Incidentes/Solicitudes)',
    campos: [
      { col: 'nombre', ejemplo: 'Soporte de Hardware' },
      { col: 'categoria_padre', ejemplo: '' },
      { col: 'codigo', ejemplo: 'HW-001' },
      { col: 'es_incidente', ejemplo: 'si' },
      { col: 'es_solicitud', ejemplo: 'si' },
      { col: 'es_problema', ejemplo: 'no' },
      { col: 'es_cambio', ejemplo: 'no' },
      { col: 'comentario', ejemplo: 'Problemas con equipos físicos' },
    ],
    ejemplos: [
      { nombre: 'Hardware', categoria_padre: '', codigo: 'HW', es_incidente: 'si', es_solicitud: 'si', es_problema: 'no', es_cambio: 'no', comentario: 'Problemas de hardware' },
      { nombre: 'Computadora no enciende', categoria_padre: 'Hardware', codigo: 'HW-001', es_incidente: 'si', es_solicitud: 'no', es_problema: 'no', es_cambio: 'no', comentario: '' },
      { nombre: 'Pantalla dañada', categoria_padre: 'Hardware', codigo: 'HW-002', es_incidente: 'si', es_solicitud: 'no', es_problema: 'no', es_cambio: 'no', comentario: '' },
      { nombre: 'Software', categoria_padre: '', codigo: 'SW', es_incidente: 'si', es_solicitud: 'si', es_problema: 'no', es_cambio: 'no', comentario: 'Problemas de software' },
      { nombre: 'Instalación de programa', categoria_padre: 'Software', codigo: 'SW-001', es_incidente: 'no', es_solicitud: 'si', es_problema: 'no', es_cambio: 'no', comentario: '' },
      { nombre: 'Error en aplicación', categoria_padre: 'Software', codigo: 'SW-002', es_incidente: 'si', es_solicitud: 'no', es_problema: 'no', es_cambio: 'no', comentario: '' },
      { nombre: 'Red e Internet', categoria_padre: '', codigo: 'NET', es_incidente: 'si', es_solicitud: 'si', es_problema: 'no', es_cambio: 'no', comentario: 'Conectividad' },
      { nombre: 'Sin acceso a internet', categoria_padre: 'Red e Internet', codigo: 'NET-001', es_incidente: 'si', es_solicitud: 'no', es_problema: 'no', es_cambio: 'no', comentario: '' },
      { nombre: 'Correo Electrónico', categoria_padre: '', codigo: 'MAIL', es_incidente: 'si', es_solicitud: 'si', es_problema: 'no', es_cambio: 'no', comentario: 'Outlook, Gmail, etc' },
      { nombre: 'No envía correos', categoria_padre: 'Correo Electrónico', codigo: 'MAIL-001', es_incidente: 'si', es_solicitud: 'no', es_problema: 'no', es_cambio: 'no', comentario: '' },
    ]
  },

  'ubicaciones': {
    descripcion: 'Ubicaciones físicas / Proyectos / Sucursales',
    campos: [
      { col: 'nombre', ejemplo: 'Oficina Central' },
      { col: 'ubicacion_padre', ejemplo: '' },
      { col: 'direccion', ejemplo: 'Av. Reforma 123' },
      { col: 'ciudad', ejemplo: 'CDMX' },
      { col: 'estado', ejemplo: 'CDMX' },
      { col: 'codigo_postal', ejemplo: '06600' },
      { col: 'edificio', ejemplo: 'Torre A' },
      { col: 'piso', ejemplo: '5' },
      { col: 'comentario', ejemplo: '' },
    ],
    ejemplos: [
      { nombre: 'Corporativo', ubicacion_padre: '', direccion: 'Av. Reforma 500', ciudad: 'CDMX', estado: 'CDMX', codigo_postal: '06600', edificio: '', piso: '', comentario: 'Oficinas centrales' },
      { nombre: 'Piso 1 - Recepción', ubicacion_padre: 'Corporativo', direccion: '', ciudad: '', estado: '', codigo_postal: '', edificio: 'Principal', piso: '1', comentario: '' },
      { nombre: 'Piso 2 - Ventas', ubicacion_padre: 'Corporativo', direccion: '', ciudad: '', estado: '', codigo_postal: '', edificio: 'Principal', piso: '2', comentario: '' },
      { nombre: 'Piso 3 - TI', ubicacion_padre: 'Corporativo', direccion: '', ciudad: '', estado: '', codigo_postal: '', edificio: 'Principal', piso: '3', comentario: '' },
      { nombre: 'Sucursal Norte', ubicacion_padre: '', direccion: 'Blvd. Norte 200', ciudad: 'Monterrey', estado: 'Nuevo León', codigo_postal: '64000', edificio: '', piso: '', comentario: '' },
      { nombre: 'Sucursal Sur', ubicacion_padre: '', direccion: 'Av. Sur 300', ciudad: 'Guadalajara', estado: 'Jalisco', codigo_postal: '44100', edificio: '', piso: '', comentario: '' },
    ]
  },

  'grupos': {
    descripcion: 'Grupos de trabajo / Departamentos / Áreas',
    campos: [
      { col: 'nombre', ejemplo: 'Soporte Técnico' },
      { col: 'grupo_padre', ejemplo: '' },
      { col: 'es_visible_ticket', ejemplo: 'si' },
      { col: 'puede_asignarse', ejemplo: 'si' },
      { col: 'puede_ser_solicitante', ejemplo: 'si' },
      { col: 'puede_ser_observador', ejemplo: 'si' },
      { col: 'email', ejemplo: 'soporte@empresa.com' },
      { col: 'comentario', ejemplo: 'Equipo de soporte nivel 1' },
    ],
    ejemplos: [
      { nombre: 'TI', grupo_padre: '', es_visible_ticket: 'si', puede_asignarse: 'si', puede_ser_solicitante: 'si', puede_ser_observador: 'si', email: 'ti@empresa.com', comentario: 'Departamento de TI' },
      { nombre: 'Soporte Nivel 1', grupo_padre: 'TI', es_visible_ticket: 'si', puede_asignarse: 'si', puede_ser_solicitante: 'no', puede_ser_observador: 'si', email: 'soporte1@empresa.com', comentario: 'Primera línea de soporte' },
      { nombre: 'Soporte Nivel 2', grupo_padre: 'TI', es_visible_ticket: 'si', puede_asignarse: 'si', puede_ser_solicitante: 'no', puede_ser_observador: 'si', email: 'soporte2@empresa.com', comentario: 'Segunda línea de soporte' },
      { nombre: 'Infraestructura', grupo_padre: 'TI', es_visible_ticket: 'si', puede_asignarse: 'si', puede_ser_solicitante: 'no', puede_ser_observador: 'si', email: 'infra@empresa.com', comentario: 'Servidores y redes' },
      { nombre: 'Desarrollo', grupo_padre: 'TI', es_visible_ticket: 'si', puede_asignarse: 'si', puede_ser_solicitante: 'si', puede_ser_observador: 'si', email: 'dev@empresa.com', comentario: 'Equipo de desarrollo' },
      { nombre: 'Ventas', grupo_padre: '', es_visible_ticket: 'si', puede_asignarse: 'no', puede_ser_solicitante: 'si', puede_ser_observador: 'no', email: 'ventas@empresa.com', comentario: '' },
      { nombre: 'Administración', grupo_padre: '', es_visible_ticket: 'si', puede_asignarse: 'no', puede_ser_solicitante: 'si', puede_ser_observador: 'no', email: 'admin@empresa.com', comentario: '' },
      { nombre: 'Recursos Humanos', grupo_padre: '', es_visible_ticket: 'si', puede_asignarse: 'no', puede_ser_solicitante: 'si', puede_ser_observador: 'no', email: 'rh@empresa.com', comentario: '' },
    ]
  },
};

function crearPlantilla(nombre, config) {
  const wb = XLSX.utils.book_new();

  // Hoja de datos con ejemplos
  const ws = XLSX.utils.json_to_sheet(config.ejemplos);
  ws['!cols'] = config.campos.map(c => ({ wch: Math.max(c.col.length, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');

  // Hoja de instrucciones
  const instrucciones = [
    { Campo: '=== INSTRUCCIONES ===', Descripcion: '', Requerido: '', Ejemplo: '' },
    { Campo: `Plantilla: ${nombre}`, Descripcion: config.descripcion, Requerido: '', Ejemplo: '' },
    { Campo: '', Descripcion: '', Requerido: '', Ejemplo: '' },
    { Campo: 'IMPORTANTE:', Descripcion: 'Primero carga los elementos PADRE, luego los HIJOS', Requerido: '', Ejemplo: '' },
    { Campo: '', Descripcion: '', Requerido: '', Ejemplo: '' },
    { Campo: '=== CAMPOS ===', Descripcion: '', Requerido: '', Ejemplo: '' },
    ...config.campos.map(c => ({
      Campo: c.col,
      Descripcion: c.col === 'nombre' ? 'Nombre del elemento (REQUERIDO)' :
                   c.col.includes('padre') ? 'Nombre del elemento padre (vacío si es raíz)' :
                   c.col.startsWith('es_') || c.col.startsWith('puede_') ? 'Valores: si / no' : '',
      Requerido: c.col === 'nombre' ? 'SÍ' : 'No',
      Ejemplo: c.ejemplo
    }))
  ];
  const wsInst = XLSX.utils.json_to_sheet(instrucciones);
  wsInst['!cols'] = [{ wch: 25 }, { wch: 50 }, { wch: 10 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

  const archivo = `${plantillasDir}/${nombre}.xlsx`;
  XLSX.writeFile(wb, archivo);
  return archivo;
}

console.log('\n=== Generando plantillas de catálogos para tickets ===\n');

for (const [nombre, config] of Object.entries(catalogos)) {
  const archivo = crearPlantilla(nombre, config);
  console.log(`✓ ${archivo} - ${config.descripcion}`);
}

console.log('\n✅ Plantillas de catálogos creadas');
console.log('\nPara importar usa:');
console.log('  node importar-catalogos.mjs categorias plantillas/categorias_ticket.xlsx');
console.log('  node importar-catalogos.mjs ubicaciones plantillas/ubicaciones.xlsx');
console.log('  node importar-catalogos.mjs grupos plantillas/grupos.xlsx\n');
