#!/usr/bin/env node
/**
 * Forzar envío de correos y ver logs detallados
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

async function forceSend() {
  console.log('FORZANDO ENVÍO DE CORREOS');
  console.log('='.repeat(60));
  console.log('Fecha:', new Date().toISOString());

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // 1. Ver logs de la tarea queuednotification (ID: 22)
    console.log('\n1. LOGS DE TAREA QUEUEDNOTIFICATION:');
    console.log('-'.repeat(60));

    try {
      const logs = await api.get('/CronTaskLog', {
        headers,
        params: {
          'searchText[crontasks_id]': 22,
          range: '0-20',
          order: 'DESC',
          sort: 'id'
        }
      });

      // Si no funciona el filtro, obtener todos y filtrar
      const allLogs = await api.get('/CronTaskLog', {
        headers,
        params: {
          range: '0-100',
          order: 'DESC',
          sort: 'id'
        }
      });

      const queueLogs = allLogs.data.filter(l => l.crontasks_id === 22);

      console.log(`Logs de queuednotification: ${queueLogs.length}`);

      for (const log of queueLogs.slice(0, 10)) {
        console.log(`\n  Fecha: ${log.date}`);
        console.log(`  Estado: ${log.state === 0 ? 'Iniciado' : log.state === 1 ? 'Ejecutando' : 'Completado'}`);
        console.log(`  Volumen: ${log.volume}`);
        if (log.content) {
          console.log(`  Contenido: ${log.content}`);
        }
      }
    } catch(e) {
      console.log(`Error obteniendo logs: ${e.message}`);
    }

    // 2. Verificar si la tarea está bloqueada
    console.log('\n\n2. ESTADO DE LA TAREA:');
    console.log('-'.repeat(60));

    const crons = await api.get('/CronTask', { headers, params: { range: '0-100' } });
    const queueTask = crons.data.find(c => c.id === 22);

    if (queueTask) {
      console.log(`Nombre: ${queueTask.name}`);
      console.log(`Estado: ${queueTask.state}`);
      console.log(`Modo: ${queueTask.mode}`);
      console.log(`Última ejecución: ${queueTask.lastrun}`);
      console.log(`Frecuencia: ${queueTask.frequency}s`);
      console.log(`Límite por ejecución: ${queueTask.param || 'sin límite'}`);
    }

    // 3. Intentar cambiar el modo a CLI y volver a interno
    console.log('\n\n3. REINICIANDO TAREA:');
    console.log('-'.repeat(60));

    try {
      // Actualizar la tarea para forzar ejecución
      await api.put('/CronTask/22', {
        input: {
          state: 1,
          mode: 1,
          lastrun: null  // Resetear última ejecución
        }
      }, { headers });
      console.log('Tarea reiniciada');
    } catch(e) {
      console.log(`No se pudo reiniciar: ${e.message}`);
    }

    // 4. Llamar cron.php con parámetros específicos
    console.log('\n\n4. EJECUTANDO CRON MÚLTIPLES VECES:');
    console.log('-'.repeat(60));

    for (let i = 0; i < 5; i++) {
      try {
        // Intentar diferentes URLs del cron
        const urls = [
          'https://glpi.entersys.mx/front/cron.php',
          'https://glpi.entersys.mx/front/cron.php?force=1',
        ];

        for (const url of urls) {
          const response = await axios.get(url, {
            timeout: 60000,
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          console.log(`${url}: ${response.status} (${response.data?.length || 0} bytes)`);
        }

        await new Promise(r => setTimeout(r, 3000));
      } catch(e) {
        console.log(`Error: ${e.message}`);
      }
    }

    // 5. Verificar cola final
    console.log('\n\n5. ESTADO FINAL DE LA COLA:');
    console.log('-'.repeat(60));

    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-10', order: 'DESC', sort: 'id' }
    });

    console.log(`Correos en cola: ${queue.data.length}`);

    for (const mail of queue.data.slice(0, 5)) {
      console.log(`\n  ID: ${mail.id}`);
      console.log(`  Intentos: ${mail.sent_try || 0}`);
      console.log(`  Enviado: ${mail.sent_time || 'NO'}`);
      console.log(`  Para: ${mail.recipient}`);
    }

    // 6. Verificar última ejecución de la tarea
    console.log('\n\n6. VERIFICANDO TAREA DESPUÉS:');
    console.log('-'.repeat(60));

    const cronsAfter = await api.get('/CronTask', { headers, params: { range: '0-100' } });
    const queueTaskAfter = cronsAfter.data.find(c => c.id === 22);

    if (queueTaskAfter) {
      console.log(`Última ejecución: ${queueTaskAfter.lastrun}`);
    }

    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('POSIBLES CAUSAS:');
    console.log('='.repeat(60));
    console.log(`
1. El cron web (cron.php) no está procesando la cola correctamente
2. Se necesita un cron real del sistema (crontab)
3. El servidor puede tener restricciones de tiempo de ejecución

SOLUCIÓN: Configura un cron job real en el servidor:

   * * * * * php /var/www/html/glpi/front/cron.php

O usa el CLI de GLPI:

   php /var/www/html/glpi/bin/console glpi:notification:send
`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

forceSend();
