#!/usr/bin/env node
/**
 * Verificar y activar tareas cron de GLPI
 */
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

async function checkCronTasks() {
  console.log('TAREAS CRON DE GLPI');
  console.log('='.repeat(60));

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // Obtener todas las tareas cron
    const crons = await api.get('/CronTask', {
      headers,
      params: { range: '0-100' }
    });

    console.log(`Total de tareas: ${crons.data.length}\n`);

    // Buscar tareas relacionadas con correos
    const mailTasks = crons.data.filter(c =>
      c.name?.toLowerCase().includes('mail') ||
      c.name?.toLowerCase().includes('notification') ||
      c.name?.toLowerCase().includes('queue') ||
      c.itemtype?.toLowerCase().includes('mail') ||
      c.itemtype?.toLowerCase().includes('notification') ||
      c.itemtype?.toLowerCase().includes('queue')
    );

    console.log('TAREAS RELACIONADAS CON CORREOS:');
    console.log('-'.repeat(60));

    for (const task of mailTasks) {
      const status = task.state === 1 ? '✓ ACTIVA' : '✗ DESACTIVADA';
      console.log(`\n${status} - ${task.name} (ID: ${task.id})`);
      console.log(`   ItemType: ${task.itemtype}`);
      console.log(`   Estado: ${task.state} (0=desactivada, 1=activa, 2=ejecutando)`);
      console.log(`   Modo: ${task.mode} (1=interno, 2=CLI)`);
      console.log(`   Frecuencia: cada ${task.frequency} segundos`);
      console.log(`   Última ejecución: ${task.lastrun || 'Nunca'}`);
      console.log(`   Logs por día: ${task.logs_lifetime}`);
    }

    // Mostrar TODAS las tareas para ver cuál es la de envío
    console.log('\n\nTODAS LAS TAREAS CRON:');
    console.log('-'.repeat(60));

    for (const task of crons.data) {
      const status = task.state === 1 ? '✓' : '✗';
      console.log(`${status} [${task.id}] ${task.name} (${task.itemtype}) - Estado: ${task.state}`);
    }

    // Intentar activar tareas de notificación si están desactivadas
    console.log('\n\nACTIVANDO TAREAS DE NOTIFICACIÓN...');
    console.log('-'.repeat(60));

    for (const task of mailTasks) {
      if (task.state !== 1) {
        try {
          await api.put(`/CronTask/${task.id}`, {
            input: { state: 1 }
          }, { headers });
          console.log(`✓ Activada: ${task.name}`);
        } catch (e) {
          console.log(`✗ No se pudo activar ${task.name}: ${e.message}`);
        }
      } else {
        console.log(`○ Ya activa: ${task.name}`);
      }
    }

    // Forzar ejecución del cron
    console.log('\n\nFORZANDO EJECUCIÓN DEL CRON...');
    console.log('-'.repeat(60));

    try {
      // Llamar cron.php múltiples veces
      for (let i = 0; i < 3; i++) {
        await axios.get('https://glpi.entersys.mx/front/cron.php', {
          timeout: 30000,
          headers: { 'Cache-Control': 'no-cache' }
        });
        console.log(`Ejecución ${i + 1}: OK`);
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch(e) {
      console.log(`Error: ${e.message}`);
    }

    // Verificar cola después
    console.log('\n\nESTADO DE LA COLA DESPUÉS:');
    console.log('-'.repeat(60));

    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-5', order: 'DESC', sort: 'id' }
    });

    for (const mail of queue.data.slice(0, 3)) {
      console.log(`ID: ${mail.id} | Intentos: ${mail.sent_try || 0} | Enviado: ${mail.sent_time || 'NO'}`);
    }

    await api.get('/killSession', { headers });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkCronTasks();
