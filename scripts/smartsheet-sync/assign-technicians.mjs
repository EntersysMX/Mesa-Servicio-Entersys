#!/usr/bin/env node
import axios from 'axios';
import { CONFIG } from './config.mjs';

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Mapeo de usuarios
const users = {
  'gmelchor': 13,
  'igarcia': 16,
  'jahinojosa': 14,
  'amaldonado': 7,
  'mdominguez': 17,
  'acortes': 15,
};

// Asignaciones por grupo
const assignments = {
  'Soporte L1 - Mesa de Ayuda': ['gmelchor', 'igarcia'],
  'Soporte L2 - Técnicos': ['gmelchor', 'igarcia', 'jahinojosa'],
  'Soporte L3 - Especialistas': ['igarcia', 'gmelchor', 'amaldonado', 'jahinojosa'],
  'Administración': ['mdominguez', 'acortes', 'jahinojosa', 'amaldonado'],
};

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: {
    'Content-Type': 'application/json',
    'App-Token': CONFIG.glpi.appToken,
  },
});

async function main() {
  console.log(`\n${c.bold}=== Asignando Técnicos a Grupos ===${c.reset}\n`);

  // Iniciar sesión
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const sessionToken = session.data.session_token;

  const headers = {
    'Session-Token': sessionToken,
    'App-Token': CONFIG.glpi.appToken,
    'Content-Type': 'application/json',
  };

  // Obtener grupos
  const groupsResponse = await api.get('/Group', { headers, params: { range: '0-100' } });
  const groups = groupsResponse.data;

  // Crear mapa de grupos por nombre
  const groupMap = {};
  groups.forEach(g => {
    groupMap[g.name] = g.id;
  });

  console.log('Grupos encontrados:');
  Object.entries(groupMap).forEach(([name, id]) => {
    console.log(`  - ${name} (ID: ${id})`);
  });
  console.log('');

  // Asignar usuarios a grupos
  for (const [groupName, userList] of Object.entries(assignments)) {
    const groupId = groupMap[groupName];
    if (!groupId) {
      console.log(`${c.red}✗${c.reset} Grupo no encontrado: ${groupName}`);
      continue;
    }

    console.log(`${c.cyan}${groupName}${c.reset}`);

    for (const username of userList) {
      const userId = users[username];
      if (!userId) {
        console.log(`  ${c.red}✗${c.reset} Usuario no encontrado: ${username}`);
        continue;
      }

      try {
        await api.post('/Group_User', {
          input: {
            groups_id: groupId,
            users_id: userId,
          }
        }, { headers });
        console.log(`  ${c.green}✓${c.reset} ${username} asignado`);
      } catch (e) {
        const msg = e.response?.data?.[1] || e.message;
        if (msg.includes('Duplicate')) {
          console.log(`  ${c.green}✓${c.reset} ${username} (ya estaba asignado)`);
        } else {
          console.log(`  ${c.red}✗${c.reset} ${username}: ${msg}`);
        }
      }
    }
  }

  console.log(`\n${c.bold}${c.green}=== Asignación Completada ===${c.reset}\n`);
}

main().catch(e => {
  console.error(`${c.red}Error: ${e.message}${c.reset}`);
  process.exit(1);
});
