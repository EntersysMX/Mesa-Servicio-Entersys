#!/usr/bin/env node
import axios from 'axios';
import { CONFIG } from './config.mjs';

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: {
    'Content-Type': 'application/json',
    'App-Token': CONFIG.glpi.appToken,
  },
});

async function main() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const sessionToken = session.data.session_token;

  const headers = {
    'Session-Token': sessionToken,
    'App-Token': CONFIG.glpi.appToken,
  };

  const response = await api.get('/User', {
    headers,
    params: { range: '0-500' },
  });

  const users = response.data;

  console.log('=== TÉCNICOS / USUARIOS EN GLPI ===\n');
  console.log('ID  | Nombre                          | Usuario');
  console.log('-'.repeat(70));

  let count = 0;
  users.forEach(user => {
    if (user.name && user.is_active !== 0) {
      const id = String(user.id).padEnd(3);
      const fullName = (user.realname && user.firstname
        ? `${user.firstname} ${user.realname}`
        : user.realname || user.name).substring(0, 30).padEnd(32);
      console.log(`${id} | ${fullName} | ${user.name}`);
      count++;
    }
  });

  console.log(`\nTotal: ${count} usuarios activos`);
}

main().catch(e => console.error('Error:', e.message));
