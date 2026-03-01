#!/usr/bin/env node
/**
 * Verificar correos enviados
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

async function verifySent() {
  console.log('VERIFICANDO CORREOS ENVIADOS');
  console.log('='.repeat(60));

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // Ver correos en cola (debería estar vacía)
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-20', order: 'DESC', sort: 'id' }
    });

    console.log(`\nCorreos en cola: ${queue.data.length}`);

    if (queue.data.length > 0) {
      console.log('\nCorreos pendientes:');
      for (const mail of queue.data) {
        console.log(`  - ${mail.id}: ${mail.recipient} | Intentos: ${mail.sent_try} | ${mail.name?.substring(0, 50)}`);
      }
    } else {
      console.log('✓ Cola vacía - todos los correos fueron procesados');
    }

    // Ver últimos logs de queuednotification
    console.log('\n\nÚLTIMOS LOGS DE ENVÍO:');
    console.log('-'.repeat(60));

    const allLogs = await api.get('/CronTaskLog', {
      headers,
      params: { range: '0-50', order: 'DESC', sort: 'id' }
    });

    const queueLogs = allLogs.data.filter(l => l.crontasks_id === 22);

    for (const log of queueLogs.slice(0, 5)) {
      console.log(`\n  ${log.date}`);
      console.log(`  Estado: ${log.state === 2 ? 'Completado' : 'Procesando'}`);
      console.log(`  Volumen procesado: ${log.volume}`);
      console.log(`  Mensaje: ${log.content}`);
    }

    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('RESUMEN');
    console.log('='.repeat(60));
    console.log(`
Si los correos fueron enviados correctamente, deberías verlos
en tu bandeja de entrada con el asunto:

  [GLPI #0001422] New ticket - prueab final

Si NO llegaron, revisa:
1. Carpeta de Spam
2. Límites de Gmail (2000 correos/día)
3. La App Password de Gmail sigue vigente
`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifySent();
