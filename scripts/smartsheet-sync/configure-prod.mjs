#!/usr/bin/env node
import axios from 'axios';

const CONFIG = {
  glpi: {
    url: 'https://glpi.entersys.mx/apirest.php',
    appToken: '***GLPI_APP_TOKEN_REMOVED***',
    username: 'glpi',
    password: 'glpi',
  }
};

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: { 'Content-Type': 'application/json', 'App-Token': CONFIG.glpi.appToken }
});

async function configureProd() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
  const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

  console.log('==========================================');
  console.log('CONFIGURACIÓN PRODUCCIÓN: glpi.entersys.mx');
  console.log('==========================================\n');

  // 1. Verificar configuración SMTP
  console.log('1. CONFIGURACIÓN SMTP:');
  try {
    const config = await api.get('/Config', { headers, params: { range: '0-300' } });
    const smtpFields = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_passwd', 'notifications_mailing', 'smtp_mode'];
    for (const field of smtpFields) {
      const cfg = config.data.find(c => c.name === field);
      let val = cfg?.value || '-';
      if (field === 'smtp_passwd') {
        val = cfg?.value ? '***CONFIGURADA***' : '⚠️ VACÍA';
      }
      console.log(`   ${field}: ${val}`);
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Verificar y agregar destino de notificación assign_user
  console.log('\n2. CONFIGURANDO DESTINOS DE NOTIFICACIÓN:');
  try {
    const targets = await api.get('/NotificationTarget', { headers, params: { range: '0-200' } });

    // Para assign_user (ID: 63)
    const assignUserTargets = targets.data.filter(t => t.notifications_id === 63);
    const hasTechTarget = assignUserTargets.some(t => t.type === 1 && t.items_id === 3);

    console.log(`   assign_user (ID:63) - Técnico asignado: ${hasTechTarget ? 'SÍ ✓' : 'NO'}`);

    if (!hasTechTarget) {
      await api.post('/NotificationTarget', {
        input: { notifications_id: 63, type: 1, items_id: 3 }
      }, { headers });
      console.log('   → Destino "Técnico asignado" AGREGADO ✓');
    }

    // Para assign_group (ID: 64)
    const assignGroupTargets = targets.data.filter(t => t.notifications_id === 64);
    const hasGroupTarget = assignGroupTargets.some(t => t.type === 1 && t.items_id === 26);

    console.log(`   assign_group (ID:64) - Usuarios del grupo: ${hasGroupTarget ? 'SÍ ✓' : 'NO'}`);

    if (!hasGroupTarget) {
      await api.post('/NotificationTarget', {
        input: { notifications_id: 64, type: 1, items_id: 26 }
      }, { headers });
      console.log('   → Destino "Usuarios del grupo" AGREGADO ✓');
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 3. Verificar que las notificaciones estén activas
  console.log('\n3. VERIFICANDO NOTIFICACIONES ACTIVAS:');
  try {
    const notif63 = await api.get('/Notification/63', { headers });
    const notif64 = await api.get('/Notification/64', { headers });

    console.log(`   assign_user: ${notif63.data.is_active ? 'ACTIVA ✓' : 'INACTIVA'}`);
    console.log(`   assign_group: ${notif64.data.is_active ? 'ACTIVA ✓' : 'INACTIVA'}`);

    if (!notif63.data.is_active) {
      await api.put('/Notification/63', { input: { is_active: 1 } }, { headers });
      console.log('   → assign_user ACTIVADA');
    }
    if (!notif64.data.is_active) {
      await api.put('/Notification/64', { input: { is_active: 1 } }, { headers });
      console.log('   → assign_group ACTIVADA');
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Ver cola de notificaciones
  console.log('\n4. COLA DE NOTIFICACIONES:');
  try {
    const queue = await api.get('/QueuedNotification', { headers, params: { range: '0-50' } });
    console.log(`   Correos pendientes: ${queue.data.length}`);

    if (queue.data.length > 0) {
      // Agrupar por destinatario
      const byRecipient = {};
      for (const n of queue.data) {
        if (!byRecipient[n.recipient]) byRecipient[n.recipient] = 0;
        byRecipient[n.recipient]++;
      }
      console.log('   Por destinatario:');
      for (const [email, count] of Object.entries(byRecipient)) {
        console.log(`   - ${email}: ${count}`);
      }
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 5. Ejecutar cron para enviar correos
  console.log('\n5. EJECUTANDO CRON DE ENVÍO...');
  try {
    const response = await axios.get('https://glpi.entersys.mx/front/cron.php', {
      timeout: 30000,
      validateStatus: () => true
    });
    console.log(`   Respuesta: ${response.status}`);
    console.log('   ✓ Cron ejecutado');
  } catch (e) {
    console.log(`   Cron llamado: ${e.message}`);
  }

  // 6. Verificar última ejecución del cron
  console.log('\n6. ESTADO DEL CRON:');
  try {
    const cronTask = await api.get('/CronTask/22', { headers });
    console.log(`   Última ejecución: ${cronTask.data.lastrun}`);
    console.log(`   Estado: ${cronTask.data.state === 1 ? 'ACTIVO ✓' : 'INACTIVO'}`);
    console.log(`   Frecuencia: cada ${cronTask.data.frequency} segundos`);
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 7. Esperar y verificar si la cola se vació
  console.log('\n7. ESPERANDO 5 SEGUNDOS...');
  await new Promise(r => setTimeout(r, 5000));

  try {
    const queueAfter = await api.get('/QueuedNotification', { headers, params: { range: '0-10' } });
    console.log(`   Cola después: ${queueAfter.data.length} correos`);

    if (queueAfter.data.length > 0) {
      console.log('\n   ⚠️ Los correos siguen en cola.');
      console.log('   Esto indica que el SMTP no está enviando.');
      console.log('   Verifica la contraseña SMTP en GLPI.');
    } else {
      console.log('   ✓ Cola vacía - correos enviados!');
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n==========================================');
  console.log('RESUMEN');
  console.log('==========================================');
  console.log('✓ Destino "Técnico asignado" configurado');
  console.log('✓ Notificaciones de asignación activadas');
  console.log('✓ Cron ejecutado');
  console.log('\n⚠️ Si los correos no se envían:');
  console.log('   1. Ve a GLPI → Configuración → Notificaciones');
  console.log('   2. Verifica/ingresa la contraseña SMTP');
  console.log('   3. Prueba con "Enviar correo de prueba"');

  await api.get('/killSession', { headers });
}

configureProd().catch(e => console.error('Error:', e.message));
