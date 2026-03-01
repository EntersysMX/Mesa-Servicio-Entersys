#!/usr/bin/env node
import axios from 'axios';

const CONFIG = {
  glpi: {
    url: process.env.GLPI_URL || 'https://glpi.entersys.mx/apirest.php',
    appToken: process.env.GLPI_APP_TOKEN || '',
    username: process.env.GLPI_USERNAME || '',
    password: process.env.GLPI_PASSWORD || '',
  }
};

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: { 'Content-Type': 'application/json', 'App-Token': CONFIG.glpi.appToken }
});

async function triggerEmailCron() {
  console.log('==========================================');
  console.log('FORZANDO ENVÍO DE CORREOS');
  console.log('==========================================\n');

  // 1. Ejecutar cron de GLPI
  console.log('1. Ejecutando cron...');
  try {
    await axios.get('https://glpi.entersys.mx/front/cron.php', { timeout: 60000 });
    console.log('   ✓ Cron ejecutado');
  } catch (e) {
    console.log('   Cron llamado');
  }

  // 2. Verificar cola
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
  const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

  const queue = await api.get('/QueuedNotification', { headers, params: { range: '0-10' } });
  console.log('\n2. Cola de correos:', queue.data.length, 'pendientes');

  if (queue.data.length > 0 && queue.data[0].sent_try > 0) {
    console.log('\n⚠️  Los correos tienen intentos fallidos.');
    console.log('   Gmail probablemente sigue bloqueado.');
    console.log('   El bloqueo se levanta 24h después del exceso.');
  }

  await api.get('/killSession', { headers });

  return { pending: queue.data.length };
}

triggerEmailCron().catch(e => console.error('Error:', e.message));
