#!/usr/bin/env node
/**
 * Script para habilitar todos los permisos a todos los perfiles en GLPI
 * Copia los permisos del Super-Admin a todos los demás perfiles
 */

import axios from 'axios';

const CONFIG = {
  glpiUrl: 'https://glpi.entersys.mx/apirest.php',
  appToken: '***GLPI_APP_TOKEN_REMOVED***',
  username: 'glpi',
  password: 'glpi',
  superAdminProfileId: 4, // ID del Super-Admin
};

let sessionToken = null;

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

async function initSession() {
  const credentials = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
  const response = await axios.get(`${CONFIG.glpiUrl}/initSession`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      'App-Token': CONFIG.appToken,
    },
  });
  sessionToken = response.data.session_token;
  return true;
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

// Obtener todos los perfiles
async function getProfiles() {
  const response = await axios.get(`${CONFIG.glpiUrl}/Profile`, {
    headers: getHeaders(),
  });
  return response.data;
}

// Obtener todos los derechos de perfiles
async function getProfileRights() {
  const response = await axios.get(`${CONFIG.glpiUrl}/ProfileRight?range=0-500`, {
    headers: getHeaders(),
  });
  return response.data;
}

// Actualizar un derecho
async function updateProfileRight(rightId, newRights) {
  try {
    await axios.put(`${CONFIG.glpiUrl}/ProfileRight/${rightId}`, {
      input: { rights: newRights },
    }, {
      headers: getHeaders(),
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Crear un derecho si no existe
async function createProfileRight(profileId, name, rights) {
  try {
    await axios.post(`${CONFIG.glpiUrl}/ProfileRight`, {
      input: {
        profiles_id: profileId,
        name: name,
        rights: rights,
      },
    }, {
      headers: getHeaders(),
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log(`\n${colors.bold}=== Habilitando todos los permisos en GLPI ===${colors.reset}\n`);

  // Iniciar sesión
  log('info', 'Conectando a GLPI...');
  await initSession();
  log('success', 'Conectado');

  // Obtener perfiles
  const profiles = await getProfiles();
  log('info', `Perfiles encontrados: ${profiles.length}`);
  profiles.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));

  // Obtener todos los derechos
  const allRights = await getProfileRights();
  log('info', `Total de registros de permisos: ${allRights.length}`);

  // Obtener permisos del Super-Admin como referencia
  const superAdminRights = allRights.filter(r => r.profiles_id === CONFIG.superAdminProfileId);
  log('info', `Permisos del Super-Admin: ${superAdminRights.length}`);

  // Crear mapa de permisos del Super-Admin
  const superAdminMap = {};
  superAdminRights.forEach(r => {
    superAdminMap[r.name] = r.rights;
  });

  // Procesar cada perfil (excepto Super-Admin)
  const targetProfiles = profiles.filter(p => p.id !== CONFIG.superAdminProfileId);

  console.log(`\n--- Actualizando permisos ---`);

  let updated = 0;
  let created = 0;
  let errors = 0;

  for (const profile of targetProfiles) {
    console.log(`\n${colors.cyan}Perfil: ${profile.name} (ID: ${profile.id})${colors.reset}`);

    // Obtener derechos actuales de este perfil
    const profileRights = allRights.filter(r => r.profiles_id === profile.id);
    const profileRightsMap = {};
    profileRights.forEach(r => {
      profileRightsMap[r.name] = r;
    });

    // Para cada permiso del Super-Admin
    for (const [name, rights] of Object.entries(superAdminMap)) {
      process.stdout.write(`  ${name}... `);

      if (profileRightsMap[name]) {
        // Existe, actualizar si es diferente
        const current = profileRightsMap[name];
        if (current.rights !== rights) {
          const success = await updateProfileRight(current.id, rights);
          if (success) {
            console.log(`${colors.green}actualizado (${current.rights} → ${rights})${colors.reset}`);
            updated++;
          } else {
            console.log(`${colors.red}error${colors.reset}`);
            errors++;
          }
        } else {
          console.log(`${colors.yellow}sin cambios${colors.reset}`);
        }
      } else {
        // No existe, crear
        const success = await createProfileRight(profile.id, name, rights);
        if (success) {
          console.log(`${colors.green}creado (${rights})${colors.reset}`);
          created++;
        } else {
          console.log(`${colors.red}error al crear${colors.reset}`);
          errors++;
        }
      }
    }
  }

  await killSession();

  // Resumen
  console.log(`\n${colors.bold}=== RESUMEN ===${colors.reset}`);
  console.log(`  ${colors.green}Actualizados:${colors.reset} ${updated}`);
  console.log(`  ${colors.cyan}Creados:${colors.reset}      ${created}`);
  console.log(`  ${colors.red}Errores:${colors.reset}      ${errors}`);
  console.log('');
}

main().catch(error => {
  console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
  process.exit(1);
});
