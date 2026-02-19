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

async function executeCron() {
  // Iniciar sesión
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const headers = {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken,
    'Content-Type': 'application/json',
  };

  console.log('========================================');
  console.log('EJECUTANDO CRON DE NOTIFICACIONES');
  console.log('========================================\n');

  // 1. Obtener estado actual de la cola
  console.log('1. ESTADO ACTUAL DE LA COLA...');
  let queueBefore = 0;
  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-200' }
    });
    queueBefore = queue.data.length;
    console.log(`   Notificaciones pendientes: ${queueBefore}`);
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Forzar ejecución del cron actualizando lastrun a null
  console.log('\n2. FORZANDO EJECUCIÓN DEL CRON...');

  const CRON_TASK_ID = 22; // queuednotification

  try {
    // Método 1: Resetear lastrun para forzar ejecución
    await api.put(`/CronTask/${CRON_TASK_ID}`, {
      input: {
        state: 1, // Asegurar que está activo
        lastrun: null, // Resetear última ejecución
      }
    }, { headers });
    console.log('   ✓ Tarea cron reseteada');
  } catch (e) {
    console.log('   Error reseteando:', e.response?.data?.[1] || e.message);
  }

  // 3. Intentar llamar al endpoint de cron directamente
  console.log('\n3. LLAMANDO A CRON.PHP...');

  // El cron de GLPI se puede ejecutar via HTTP también
  const glpiBase = CONFIG.glpi.url.replace('/apirest.php', '');

  try {
    // Intentar ejecutar cron via HTTP
    const cronUrl = `${glpiBase}/front/cron.php`;
    console.log(`   URL: ${cronUrl}`);

    const cronResponse = await axios.get(cronUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'GLPI-Cron-Trigger'
      }
    });

    console.log('   ✓ Cron ejecutado');
    console.log(`   Respuesta: ${cronResponse.status}`);
  } catch (e) {
    if (e.response) {
      console.log(`   Respuesta: ${e.response.status}`);
      // 200 o 204 son OK, también puede redirigir
      if (e.response.status < 400) {
        console.log('   ✓ Cron probablemente ejecutado');
      }
    } else {
      console.log('   Error:', e.message);
    }
  }

  // 4. Esperar y verificar
  console.log('\n4. ESPERANDO 5 SEGUNDOS...');
  await new Promise(r => setTimeout(r, 5000));

  // 5. Verificar estado de la cola después
  console.log('\n5. VERIFICANDO COLA DESPUÉS DE EJECUCIÓN...');
  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-200' }
    });
    const queueAfter = queue.data.length;
    console.log(`   Notificaciones pendientes: ${queueAfter}`);

    if (queueAfter < queueBefore) {
      console.log(`   ✓ Se procesaron ${queueBefore - queueAfter} notificaciones`);
    } else if (queueAfter === queueBefore) {
      console.log('   ⚠️ La cola no cambió - el cron puede no haber enviado correos');
    }

    // Verificar última ejecución del cron
    const cronTask = await api.get(`/CronTask/${CRON_TASK_ID}`, { headers });
    console.log(`\n   Última ejecución del cron: ${cronTask.data.lastrun || 'Nunca'}`);

  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 6. Si aún hay correos, intentar procesar directamente
  console.log('\n6. INTENTANDO PROCESAR CORREOS INDIVIDUALMENTE...');

  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-10' }
    });

    if (queue.data.length > 0) {
      console.log(`   Hay ${queue.data.length} correos pendientes aún`);
      console.log('\n   Los primeros 5:');

      for (const notif of queue.data.slice(0, 5)) {
        console.log(`   - ID:${notif.id} → ${notif.recipient}`);
        console.log(`     Asunto: ${notif.name?.substring(0, 50)}...`);
        console.log(`     Intentos: ${notif.sent_try}, Creado: ${notif.create_time}`);
      }
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n========================================');
  console.log('RESULTADO');
  console.log('========================================');

  // Cerrar sesión
  await api.get('/killSession', { headers });
}

executeCron().catch(e => console.error('Error:', e.message));
