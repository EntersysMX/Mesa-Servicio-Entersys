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

async function sendQueuedNotifications() {
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
  console.log('PROCESANDO COLA DE NOTIFICACIONES');
  console.log('========================================\n');

  // 1. Obtener notificaciones en cola
  console.log('1. OBTENIENDO NOTIFICACIONES EN COLA...');
  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-100' }
    });

    console.log(`   Total en cola: ${queue.data.length}\n`);

    if (queue.data.length === 0) {
      console.log('   ✓ No hay notificaciones pendientes');
      return;
    }

    // Mostrar resumen
    const byRecipient = {};
    for (const notif of queue.data) {
      const email = notif.recipient;
      if (!byRecipient[email]) byRecipient[email] = 0;
      byRecipient[email]++;
    }

    console.log('   Pendientes por destinatario:');
    for (const [email, count] of Object.entries(byRecipient)) {
      console.log(`   - ${email}: ${count} correos`);
    }

    // 2. Intentar disparar el cron de GLPI via API
    // Nota: GLPI no tiene un endpoint directo para esto, pero podemos verificar CronTask
    console.log('\n2. VERIFICANDO TAREA CRON DE NOTIFICACIONES...');

    try {
      const cronTasks = await api.get('/CronTask', {
        headers,
        params: { range: '0-50' }
      });

      const mailTask = cronTasks.data.find(t => t.name === 'queuednotification' || t.name === 'queuedmail');

      if (mailTask) {
        console.log(`   Tarea: ${mailTask.name} (ID: ${mailTask.id})`);
        console.log(`   Activa: ${mailTask.state === 1 ? 'SÍ' : 'NO'}`);
        console.log(`   Frecuencia: cada ${mailTask.frequency} segundos`);
        console.log(`   Última ejecución: ${mailTask.lastrun || 'Nunca'}`);
        console.log(`   Modo: ${mailTask.mode === 1 ? 'Interno (PHP)' : 'Externo (cron)'}`);

        // Si no está activa, activarla
        if (mailTask.state !== 1) {
          console.log('\n   → Activando tarea...');
          await api.put(`/CronTask/${mailTask.id}`, {
            input: { state: 1 }
          }, { headers });
          console.log('   ✓ Tarea activada');
        }
      } else {
        console.log('   ⚠️ No se encontró la tarea de cola de correos');
      }

    } catch (e) {
      console.log('   Error accediendo a CronTask:', e.response?.data?.[1] || e.message);
    }

    // 3. Mostrar instrucciones para enviar manualmente
    console.log('\n========================================');
    console.log('SOLUCIÓN');
    console.log('========================================');
    console.log('\nPara enviar los correos pendientes, ejecuta en el servidor GLPI:\n');
    console.log('  sudo -u www-data php /var/www/html/glpi/front/cron.php\n');
    console.log('Para configurar envío automático cada minuto, agrega al crontab:\n');
    console.log('  * * * * * www-data /usr/bin/php /var/www/html/glpi/front/cron.php\n');
    console.log('O desde la interfaz web de GLPI:');
    console.log('  Configuración → Acciones automáticas → queuednotification → Ejecutar\n');

  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // Cerrar sesión
  await api.get('/killSession', { headers });
}

sendQueuedNotifications().catch(e => console.error('Error:', e.message));
