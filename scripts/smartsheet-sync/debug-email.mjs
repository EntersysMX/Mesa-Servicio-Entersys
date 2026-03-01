#!/usr/bin/env node
/**
 * Diagnosticar problema de envío de correos
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

async function debugEmail() {
  console.log('DIAGNÓSTICO DE CORREOS');
  console.log('='.repeat(60));
  console.log('Fecha:', new Date().toISOString());
  console.log();

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // 1. Ver cola de correos
    console.log('1. COLA DE CORREOS PENDIENTES');
    console.log('-'.repeat(60));

    const queue = await api.get('/QueuedNotification', {
      headers,
      params: {
        range: '0-20',
        order: 'DESC',
        sort: 'id'
      }
    });

    console.log(`Total en cola: ${queue.data.length}`);

    if (queue.data.length > 0) {
      console.log('\nÚltimos correos en cola:');
      for (const mail of queue.data.slice(0, 10)) {
        console.log(`\n  ID: ${mail.id}`);
        console.log(`  Para: ${mail.recipient}`);
        console.log(`  Asunto: ${mail.name}`);
        console.log(`  Creado: ${mail.create_time}`);
        console.log(`  Enviado: ${mail.sent_time || 'NO ENVIADO'}`);
        console.log(`  Intentos: ${mail.sent_try || 0}`);
        console.log(`  Modo: ${mail.mode}`);
        if (mail.messageid) {
          console.log(`  MessageID: ${mail.messageid}`);
        }
      }
    }

    // 2. Verificar configuración SMTP actual
    console.log('\n\n2. CONFIGURACIÓN SMTP ACTUAL');
    console.log('-'.repeat(60));

    const config = await api.get('/Config', { headers, params: { range: '0-500' } });

    const smtpKeys = ['smtp_mode', 'smtp_host', 'smtp_port', 'smtp_username',
                      'smtp_sender', 'from_email', 'notifications_mailing',
                      'smtp_check_certificate', 'smtp_max_retries'];

    for (const key of smtpKeys) {
      const cfg = config.data.find(c => c.name === key);
      if (cfg) {
        console.log(`${key}: ${cfg.value || '(vacío)'}`);
      }
    }

    // Interpretar smtp_mode
    const smtpMode = config.data.find(c => c.name === 'smtp_mode');
    if (smtpMode) {
      const modes = {
        '0': 'PHP mail()',
        '1': 'SMTP + TLS',
        '2': 'SMTP + SSL',
        '3': 'SMTP sin cifrado'
      };
      console.log(`\n→ Modo interpretado: ${modes[smtpMode.value] || 'Desconocido'}`);
    }

    // 3. Probar conexión SMTP directamente
    console.log('\n\n3. PRUEBA DE CONEXIÓN SMTP');
    console.log('-'.repeat(60));

    const smtpHost = config.data.find(c => c.name === 'smtp_host')?.value;
    const smtpPort = config.data.find(c => c.name === 'smtp_port')?.value;

    console.log(`Probando conexión a ${smtpHost}:${smtpPort}...`);

    // Intentar ejecutar el cron
    console.log('\n\n4. EJECUTANDO CRON DE ENVÍO');
    console.log('-'.repeat(60));

    try {
      const cronResponse = await axios.get('https://glpi.entersys.mx/front/cron.php', {
        timeout: 60000,
        validateStatus: () => true
      });
      console.log(`Status: ${cronResponse.status}`);
      console.log(`Response length: ${cronResponse.data?.length || 0} bytes`);
    } catch(e) {
      console.log(`Error: ${e.message}`);
    }

    // 5. Ver si hay errores en logs (via CronTaskLog)
    console.log('\n\n5. ÚLTIMOS LOGS DE TAREAS CRON');
    console.log('-'.repeat(60));

    try {
      const cronLogs = await api.get('/CronTaskLog', {
        headers,
        params: {
          range: '0-10',
          order: 'DESC',
          sort: 'id'
        }
      });

      for (const log of cronLogs.data.slice(0, 5)) {
        console.log(`\n  Tarea: ${log.crontasks_id}`);
        console.log(`  Fecha: ${log.date}`);
        console.log(`  Estado: ${log.state}`);
        console.log(`  Volumen: ${log.volume}`);
        if (log.content) {
          console.log(`  Contenido: ${log.content.substring(0, 100)}...`);
        }
      }
    } catch(e) {
      console.log('No se pudo obtener logs de cron');
    }

    // 6. Verificar cola después del cron
    console.log('\n\n6. VERIFICANDO COLA DESPUÉS DEL CRON');
    console.log('-'.repeat(60));

    await new Promise(r => setTimeout(r, 3000)); // Esperar 3 segundos

    const queueAfter = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-5', order: 'DESC', sort: 'id' }
    });

    console.log(`Correos en cola: ${queueAfter.data.length}`);

    if (queueAfter.data.length > 0) {
      const latest = queueAfter.data[0];
      console.log(`\nÚltimo correo:`);
      console.log(`  ID: ${latest.id}`);
      console.log(`  Intentos: ${latest.sent_try || 0}`);
      console.log(`  Enviado: ${latest.sent_time || 'NO'}`);
    }

    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNÓSTICO COMPLETADO');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugEmail();
