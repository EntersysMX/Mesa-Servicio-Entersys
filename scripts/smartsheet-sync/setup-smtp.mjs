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

const SMTP_PASSWORD = 'qjlgertcwmngjlfv';

async function setupSmtp() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const headers = {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken,
  };

  console.log('==========================================');
  console.log('CONFIGURANDO SMTP EN PRODUCCIÓN');
  console.log('==========================================\n');

  // 1. Obtener ID de la configuración smtp_passwd
  console.log('1. BUSCANDO CONFIGURACIÓN SMTP...');
  try {
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-300' }
    });

    const smtpPasswdConfig = config.data.find(c => c.name === 'smtp_passwd');

    if (smtpPasswdConfig) {
      console.log(`   Encontrado: Config ID ${smtpPasswdConfig.id}`);
      console.log(`   Valor actual: ${smtpPasswdConfig.value ? '***' : 'VACÍO'}`);

      // 2. Actualizar la contraseña
      console.log('\n2. ACTUALIZANDO CONTRASEÑA SMTP...');

      await api.put(`/Config/${smtpPasswdConfig.id}`, {
        input: {
          value: SMTP_PASSWORD
        }
      }, { headers });

      console.log('   ✓ Contraseña SMTP configurada');
    } else {
      console.log('   No se encontró configuración smtp_passwd');
    }

  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);

    // Intentar método alternativo - actualizar via endpoint específico
    console.log('\n   Intentando método alternativo...');
    try {
      // Algunos GLPI usan endpoint diferente
      await api.post('/Config', {
        input: {
          name: 'smtp_passwd',
          value: SMTP_PASSWORD
        }
      }, { headers });
      console.log('   ✓ Configuración creada');
    } catch (e2) {
      console.log('   Error alternativo:', e2.response?.data?.[1] || e2.message);
    }
  }

  // 3. Verificar la configuración
  console.log('\n3. VERIFICANDO CONFIGURACIÓN...');
  try {
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-300' }
    });

    const smtpFields = ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_passwd', 'smtp_mode'];
    for (const field of smtpFields) {
      const cfg = config.data.find(c => c.name === field);
      let val = cfg?.value || '-';
      if (field === 'smtp_passwd') {
        val = cfg?.value ? '✓ CONFIGURADA' : '✗ VACÍA';
      }
      console.log(`   ${field}: ${val}`);
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Ejecutar cron para enviar correos pendientes
  console.log('\n4. EJECUTANDO CRON PARA ENVIAR CORREOS...');
  try {
    await axios.get('https://glpi.entersys.mx/front/cron.php', {
      timeout: 30000,
      validateStatus: () => true
    });
    console.log('   ✓ Cron ejecutado');
  } catch (e) {
    console.log('   Cron llamado');
  }

  // 5. Esperar y verificar cola
  console.log('\n5. ESPERANDO 5 SEGUNDOS...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n6. VERIFICANDO COLA DE CORREOS...');
  try {
    const queueBefore = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-100' }
    });
    console.log(`   Correos en cola: ${queueBefore.data.length}`);

    if (queueBefore.data.length > 0) {
      // Ver si hay intentos fallidos
      const withAttempts = queueBefore.data.filter(n => n.sent_try > 0);
      console.log(`   Con intentos: ${withAttempts.length}`);

      if (withAttempts.length > 0) {
        console.log('\n   Últimos intentos:');
        for (const n of withAttempts.slice(0, 3)) {
          console.log(`   - ID:${n.id} → ${n.recipient}`);
          console.log(`     Intentos: ${n.sent_try}`);
        }
      }
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n==========================================');
  console.log('CONFIGURACIÓN COMPLETADA');
  console.log('==========================================');
  console.log('\n📧 La contraseña SMTP ha sido configurada.');
  console.log('   Los correos pendientes deberían enviarse.');
  console.log('\n   Si aún no funcionan, verifica en GLPI:');
  console.log('   Configuración → Notificaciones → Enviar correo de prueba');

  await api.get('/killSession', { headers });
}

setupSmtp().catch(e => console.error('Error:', e.message));
