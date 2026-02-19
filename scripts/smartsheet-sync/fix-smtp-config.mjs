#!/usr/bin/env node
/**
 * Corregir configuración SMTP para Gmail
 */
import axios from 'axios';

const CONFIG = {
  glpi: {
    url: 'https://glpi.entersys.mx/apirest.php',
    appToken: '***GLPI_APP_TOKEN_REMOVED***',
    username: 'glpi',
    password: 'glpi',
  }
};

const SMTP_CONFIG = {
  smtp_host: 'smtp.gmail.com',
  smtp_port: '587',           // TLS - mejor para Gmail
  smtp_mode: '1',             // 1 = SMTP+TLS
  smtp_username: 'armando.maldonado@entersys.mx',
  smtp_passwd: '***SMTP_PASSWORD_REMOVED***',
  smtp_sender: 'armando.maldonado@entersys.mx',
  from_email: 'armando.maldonado@entersys.mx',
  from_email_name: 'GLPI Mesa de Ayuda',
  admin_email_name: 'Soporte Entersys',
  notifications_mailing: '1',
  smtp_check_certificate: '1'
};

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: { 'Content-Type': 'application/json', 'App-Token': CONFIG.glpi.appToken }
});

async function fixSmtp() {
  console.log('CORRIGIENDO CONFIGURACIÓN SMTP');
  console.log('='.repeat(60));

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    const configItems = await api.get('/Config', { headers, params: { range: '0-500' } });

    let updated = 0;
    let failed = 0;

    for (const [name, value] of Object.entries(SMTP_CONFIG)) {
      const cfg = configItems.data.find(c => c.name === name);

      if (cfg) {
        // Verificar si necesita actualización
        const needsUpdate = name === 'smtp_passwd' || cfg.value !== value;

        if (needsUpdate) {
          try {
            await api.put(`/Config/${cfg.id}`, {
              input: { value: value }
            }, { headers });
            console.log(`✓ ${name}: actualizado`);
            updated++;
          } catch (e) {
            console.log(`✗ ${name}: no se pudo actualizar (${e.response?.status || e.message})`);
            failed++;
          }
        } else {
          console.log(`○ ${name}: ya correcto`);
        }
      } else {
        console.log(`? ${name}: no encontrado`);
      }
    }

    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log(`Actualizados: ${updated} | Fallidos: ${failed}`);

    // Probar envío
    console.log('\nProbando cron de envío...');
    try {
      await axios.get('https://glpi.entersys.mx/front/cron.php', { timeout: 30000 });
      console.log('✓ Cron ejecutado');
    } catch(e) {
      console.log('Cron llamado');
    }

    // Ver cola de correos
    const auth2 = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session2 = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth2}` } });
    const headers2 = { 'Session-Token': session2.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    const queue = await api.get('/QueuedNotification', { headers: headers2, params: { range: '0-10' } });
    console.log(`\nCola de correos: ${queue.data.length} pendientes`);

    if (queue.data.length > 0) {
      console.log('\nCorreos en cola:');
      for (const mail of queue.data.slice(0, 5)) {
        console.log(`  - ID: ${mail.id} | Para: ${mail.recipient} | Asunto: ${mail.name?.substring(0, 40)}...`);
      }
    }

    await api.get('/killSession', { headers: headers2 });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

fixSmtp();
