#!/usr/bin/env node
/**
 * Crea una plantilla de Excel de ejemplo para importar técnicos
 */

import XLSX from 'xlsx';

// Datos de ejemplo
const ejemplos = [
  {
    usuario: 'jperez',
    nombre: 'Juan',
    apellido: 'Pérez García',
    password: 'Password123!',
    email: 'jperez@empresa.com',
    telefono: '5512345678',
    movil: '5598765432',
  },
  {
    usuario: 'mlopez',
    nombre: 'María',
    apellido: 'López Hernández',
    password: 'Password123!',
    email: 'mlopez@empresa.com',
    telefono: '',
    movil: '5587654321',
  },
  {
    usuario: 'agarcia',
    nombre: 'Antonio',
    apellido: 'García Ramírez',
    password: 'Password123!',
    email: 'agarcia@empresa.com',
    telefono: '5543218765',
    movil: '',
  },
];

// Crear workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(ejemplos);

// Ajustar anchos de columna
ws['!cols'] = [
  { wch: 15 }, // usuario
  { wch: 15 }, // nombre
  { wch: 20 }, // apellido
  { wch: 15 }, // password
  { wch: 25 }, // email
  { wch: 12 }, // telefono
  { wch: 12 }, // movil
];

XLSX.utils.book_append_sheet(wb, ws, 'Tecnicos');

// Guardar archivo
const outputPath = 'plantilla_tecnicos.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✓ Plantilla creada: ${outputPath}`);
console.log('\nColumnas:');
console.log('  - usuario   (requerido)');
console.log('  - nombre    (requerido)');
console.log('  - apellido  (requerido)');
console.log('  - password  (requerido)');
console.log('  - email     (opcional)');
console.log('  - telefono  (opcional)');
console.log('  - movil     (opcional)');
