#!/usr/bin/env node
/**
 * Crea plantilla de usuarios con todos los roles de GLPI
 */

import XLSX from 'xlsx';

const plantillasDir = './plantillas/02_Usuarios';

// Roles disponibles en GLPI
const roles = [
  { id: 1, nombre: 'Cliente', descripcion: 'Solo puede crear y ver sus propios tickets' },
  { id: 2, nombre: 'Observer', descripcion: 'Puede ver tickets pero no modificarlos' },
  { id: 3, nombre: 'Admin', descripcion: 'Administrador con acceso a configuración' },
  { id: 4, nombre: 'Super-Admin', descripcion: 'Control total del sistema' },
  { id: 5, nombre: 'Hotliner', descripcion: 'Recibe llamadas y crea tickets para otros' },
  { id: 6, nombre: 'Technician', descripcion: 'Técnico que resuelve tickets' },
  { id: 7, nombre: 'Supervisor', descripcion: 'Supervisa técnicos y tickets' },
  { id: 8, nombre: 'Read-Only', descripcion: 'Solo lectura, sin modificaciones' },
];

// Ejemplos de usuarios para cada rol
const ejemplos = [
  // Super-Admin
  { usuario: 'admin.sistema', nombre: 'Administrador', apellido: 'Sistema', password: 'Admin123!', email: 'admin@empresa.com', telefono: '5500000001', movil: '', rol: 'Super-Admin' },

  // Admin
  { usuario: 'jefe.ti', nombre: 'Roberto', apellido: 'Méndez López', password: 'Admin123!', email: 'rmendez@empresa.com', telefono: '5500000002', movil: '5544332211', rol: 'Admin' },

  // Supervisor
  { usuario: 'supervisor.soporte', nombre: 'Laura', apellido: 'Ramírez Soto', password: 'Super123!', email: 'lramirez@empresa.com', telefono: '5500000003', movil: '5544332212', rol: 'Supervisor' },

  // Technician (técnicos)
  { usuario: 'tecnico1', nombre: 'Carlos', apellido: 'García Pérez', password: 'Tech123!', email: 'cgarcia@empresa.com', telefono: '5500000004', movil: '5544332213', rol: 'Technician' },
  { usuario: 'tecnico2', nombre: 'Ana', apellido: 'López Hernández', password: 'Tech123!', email: 'alopez@empresa.com', telefono: '5500000005', movil: '5544332214', rol: 'Technician' },
  { usuario: 'tecnico3', nombre: 'Miguel', apellido: 'Sánchez Ruiz', password: 'Tech123!', email: 'msanchez@empresa.com', telefono: '5500000006', movil: '', rol: 'Technician' },

  // Hotliner (mesa de ayuda)
  { usuario: 'mesa.ayuda1', nombre: 'Patricia', apellido: 'Torres Vega', password: 'Help123!', email: 'ptorres@empresa.com', telefono: '5500000007', movil: '', rol: 'Hotliner' },
  { usuario: 'mesa.ayuda2', nombre: 'Fernando', apellido: 'Díaz Castro', password: 'Help123!', email: 'fdiaz@empresa.com', telefono: '5500000008', movil: '', rol: 'Hotliner' },

  // Observer
  { usuario: 'auditor', nombre: 'Gabriela', apellido: 'Morales Ríos', password: 'Obs123!', email: 'gmorales@empresa.com', telefono: '5500000009', movil: '', rol: 'Observer' },

  // Cliente (usuarios finales)
  { usuario: 'usuario.ventas1', nombre: 'Pedro', apellido: 'Jiménez Luna', password: 'User123!', email: 'pjimenez@empresa.com', telefono: '5500000010', movil: '5544332220', rol: 'Cliente' },
  { usuario: 'usuario.ventas2', nombre: 'María', apellido: 'Flores Ortiz', password: 'User123!', email: 'mflores@empresa.com', telefono: '5500000011', movil: '', rol: 'Cliente' },
  { usuario: 'usuario.admin1', nombre: 'José', apellido: 'Reyes Medina', password: 'User123!', email: 'jreyes@empresa.com', telefono: '5500000012', movil: '', rol: 'Cliente' },
  { usuario: 'usuario.rh1', nombre: 'Sofía', apellido: 'Vargas Núñez', password: 'User123!', email: 'svargas@empresa.com', telefono: '5500000013', movil: '', rol: 'Cliente' },
];

// Crear workbook
const wb = XLSX.utils.book_new();

// Hoja 1: Datos de usuarios
const ws = XLSX.utils.json_to_sheet(ejemplos);
ws['!cols'] = [
  { wch: 20 }, // usuario
  { wch: 15 }, // nombre
  { wch: 20 }, // apellido
  { wch: 12 }, // password
  { wch: 28 }, // email
  { wch: 12 }, // telefono
  { wch: 12 }, // movil
  { wch: 12 }, // rol
];
XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');

// Hoja 2: Roles disponibles
const wsRoles = XLSX.utils.json_to_sheet([
  { Rol: '=== ROLES DISPONIBLES EN GLPI ===' , Descripcion: '', Uso: '' },
  { Rol: '', Descripcion: '', Uso: '' },
  ...roles.map(r => ({
    Rol: r.nombre,
    Descripcion: r.descripcion,
    Uso: r.nombre === 'Technician' ? 'Técnicos de soporte' :
         r.nombre === 'Cliente' ? 'Usuarios finales que crean tickets' :
         r.nombre === 'Supervisor' ? 'Jefes de área de soporte' :
         r.nombre === 'Admin' ? 'Administradores de TI' :
         r.nombre === 'Super-Admin' ? 'Solo 1-2 personas' :
         r.nombre === 'Hotliner' ? 'Personal de mesa de ayuda' :
         r.nombre === 'Observer' ? 'Auditores, gerentes' :
         'Usuarios temporales'
  })),
  { Rol: '', Descripcion: '', Uso: '' },
  { Rol: '=== NOTAS ===' , Descripcion: '', Uso: '' },
  { Rol: '• El campo "rol" debe coincidir exactamente con los nombres de arriba', Descripcion: '', Uso: '' },
  { Rol: '• Si no pones rol, se asigna "Technician" por defecto', Descripcion: '', Uso: '' },
  { Rol: '• Todos los campos son requeridos excepto teléfono y móvil', Descripcion: '', Uso: '' },
]);
wsRoles['!cols'] = [{ wch: 60 }, { wch: 45 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wb, wsRoles, 'Roles Disponibles');

// Hoja 3: Instrucciones
const wsInst = XLSX.utils.json_to_sheet([
  { Campo: '=== INSTRUCCIONES ===' },
  { Campo: '' },
  { Campo: 'Esta plantilla sirve para cargar usuarios de CUALQUIER rol a GLPI.' },
  { Campo: '' },
  { Campo: '=== CAMPOS ===' },
  { Campo: 'usuario    - Login para iniciar sesión (REQUERIDO)' },
  { Campo: 'nombre     - Nombre(s) del usuario (REQUERIDO)' },
  { Campo: 'apellido   - Apellido(s) del usuario (REQUERIDO)' },
  { Campo: 'password   - Contraseña (REQUERIDO)' },
  { Campo: 'email      - Correo electrónico (REQUERIDO)' },
  { Campo: 'telefono   - Teléfono fijo (opcional)' },
  { Campo: 'movil      - Celular (opcional)' },
  { Campo: 'rol        - Ver hoja "Roles Disponibles" (default: Technician)' },
  { Campo: '' },
  { Campo: '=== CÓMO USAR ===' },
  { Campo: '1. Borra los ejemplos y pon tus usuarios reales' },
  { Campo: '2. Guarda el archivo' },
  { Campo: '3. Ejecuta: node importar-usuarios.mjs plantillas/02_Usuarios/usuarios.xlsx' },
]);
wsInst['!cols'] = [{ wch: 70 }];
XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

// Guardar
const archivo = `${plantillasDir}/usuarios.xlsx`;
XLSX.writeFile(wb, archivo);

console.log(`✓ Plantilla creada: ${archivo}`);
console.log('\nRoles disponibles:');
roles.forEach(r => console.log(`  • ${r.nombre.padEnd(12)} - ${r.descripcion}`));
console.log('\nPara importar: node importar-usuarios.mjs plantillas/02_Usuarios/usuarios.xlsx');
