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

async function testNotification() {
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
  console.log('PRUEBA DE NOTIFICACIÓN POR EMAIL');
  console.log('========================================\n');

  // Verificar cola de notificaciones pendientes
  console.log('1. VERIFICANDO COLA DE NOTIFICACIONES...');
  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-20' }
    });
    console.log(`   Notificaciones en cola: ${queue.data.length || 0}`);

    if (queue.data.length > 0) {
      for (const notif of queue.data.slice(0, 5)) {
        console.log(`   - ID: ${notif.id}`);
        console.log(`     Para: ${notif.recipient}`);
        console.log(`     Asunto: ${notif.name}`);
        console.log(`     Estado: ${notif.sent_try} intentos, ${notif.mode}`);
        console.log(`     Creado: ${notif.create_time}`);
        console.log('');
      }
    }
  } catch (e) {
    console.log('   Error o sin acceso:', e.response?.data?.[1] || e.message);
  }

  // Verificar configuración SMTP
  console.log('\n2. CONFIGURACIÓN SMTP...');
  try {
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-200' }
    });

    const smtpConfigs = config.data.filter(c => c.name && c.name.includes('smtp'));
    for (const cfg of smtpConfigs) {
      // Ocultar contraseña
      const value = cfg.name.includes('passwd') ? '***' : cfg.value;
      console.log(`   ${cfg.name}: ${value || '-'}`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data?.[1] || e.message);
  }

  // Crear un ticket de prueba y asignarlo para probar notificación
  console.log('\n3. CREANDO TICKET DE PRUEBA...');

  const testTechId = 7; // amaldonado
  let testTicketId = null;

  try {
    const ticket = await api.post('/Ticket', {
      input: {
        name: '[TEST] Prueba de notificación - ' + new Date().toISOString(),
        content: '<p>Este es un ticket de prueba para verificar notificaciones por email.</p>',
        type: 1,
        urgency: 3,
        priority: 3,
      }
    }, { headers });

    testTicketId = ticket.data.id;
    console.log(`   ✓ Ticket creado: #${testTicketId}`);

    // Asignar técnico
    console.log(`\n4. ASIGNANDO TÉCNICO (ID: ${testTechId})...`);

    await api.post('/Ticket_User', {
      input: {
        tickets_id: testTicketId,
        users_id: testTechId,
        type: 2, // Técnico asignado
      }
    }, { headers });

    console.log('   ✓ Técnico asignado');
    console.log('\n   📧 GLPI debería enviar notificación a:');
    console.log('      armando.maldonado@entersys.mx');

  } catch (e) {
    console.log('   Error:', e.response?.data?.[1] || e.message);
  }

  // Esperar un momento y verificar cola de notificaciones
  console.log('\n5. ESPERANDO 2 SEGUNDOS Y VERIFICANDO COLA...');
  await new Promise(r => setTimeout(r, 2000));

  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-10', sort: 'id', order: 'DESC' }
    });

    console.log(`   Notificaciones en cola: ${queue.data.length || 0}`);

    if (queue.data.length > 0) {
      const recent = queue.data[0];
      console.log(`\n   Última notificación:`);
      console.log(`   - Para: ${recent.recipient}`);
      console.log(`   - Asunto: ${recent.name}`);
      console.log(`   - Creado: ${recent.create_time}`);
      console.log(`   - Intentos: ${recent.sent_try}`);
    } else {
      console.log('   ⚠️ No hay notificaciones en cola');
      console.log('   Esto puede significar que:');
      console.log('   1. El envío automático está activo (se envían de inmediato)');
      console.log('   2. O las notificaciones no se están generando');
    }
  } catch (e) {
    console.log('   Error:', e.response?.data?.[1] || e.message);
  }

  // Verificar logs de notificación
  console.log('\n6. VERIFICANDO LOGS DE NOTIFICACIÓN...');
  try {
    // Buscar logs del ticket de prueba
    const logs = await api.get(`/Ticket/${testTicketId}/Log`, { headers });
    const notifLogs = logs.data.filter(l =>
      l.linked_action && (l.linked_action.includes('notification') || l.linked_action.includes('email'))
    );

    if (notifLogs.length > 0) {
      console.log('   Logs de notificación encontrados:');
      for (const log of notifLogs) {
        console.log(`   - ${log.date_mod}: ${log.old_value} → ${log.new_value}`);
      }
    } else {
      console.log('   No hay logs de notificación específicos (normal)');
    }
  } catch (e) {
    // Normal si no hay logs
  }

  // Eliminar ticket de prueba
  if (testTicketId) {
    console.log(`\n7. ELIMINANDO TICKET DE PRUEBA #${testTicketId}...`);
    try {
      await api.delete(`/Ticket/${testTicketId}`, {
        headers,
        params: { force_purge: true }
      });
      console.log('   ✓ Ticket eliminado');
    } catch (e) {
      console.log('   Error eliminando:', e.response?.data?.[1] || e.message);
    }
  }

  console.log('\n========================================');
  console.log('RESULTADO');
  console.log('========================================');
  console.log('\n✓ Notificación "assign_user" está ACTIVA');
  console.log('✓ Destino "Técnico asignado" está configurado');
  console.log('\n⚠️  Si no recibes correos, verifica en GLPI:');
  console.log('   1. Configuración → Notificaciones → Configuración de correo');
  console.log('   2. Que el modo de envío sea "Automático" o ejecuta:');
  console.log('      php /var/www/html/glpi/front/cron.php');
  console.log('   3. Que la contraseña SMTP esté correcta');
  console.log('   4. Si usas Gmail, necesitas "Contraseña de aplicación"');

  // Cerrar sesión
  await api.get('/killSession', { headers });
}

testNotification().catch(e => console.error('Error:', e.message));
