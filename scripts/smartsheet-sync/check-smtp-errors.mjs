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

async function checkSmtpErrors() {
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
  console.log('DIAGNÓSTICO DE SMTP');
  console.log('========================================\n');

  // 1. Ver notificaciones con errores
  console.log('1. NOTIFICACIONES CON INTENTOS FALLIDOS...');
  try {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: '0-50' }
    });

    const withErrors = queue.data.filter(n => n.sent_try > 0);
    console.log(`   Con intentos: ${withErrors.length}`);
    console.log(`   Sin intentos: ${queue.data.length - withErrors.length}`);

    if (withErrors.length > 0) {
      console.log('\n   Errores encontrados:');
      for (const n of withErrors.slice(0, 5)) {
        console.log(`   - ID:${n.id} Intentos:${n.sent_try}`);
        if (n.messageid) console.log(`     Message ID: ${n.messageid}`);
      }
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Verificar configuración SMTP detallada
  console.log('\n2. CONFIGURACIÓN SMTP...');
  try {
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-300' }
    });

    const smtpFields = [
      'smtp_mode', 'smtp_host', 'smtp_port', 'smtp_username',
      'smtp_sender', 'smtp_check_certificate', 'smtp_max_retries',
      'admin_email', 'admin_email_name', 'from_email', 'noreply_email',
      'notifications_mailing'
    ];

    for (const field of smtpFields) {
      const cfg = config.data.find(c => c.name === field);
      if (cfg) {
        console.log(`   ${field}: ${cfg.value || '(vacío)'}`);
      }
    }

    // Verificar si smtp_passwd tiene valor
    const passwdCfg = config.data.find(c => c.name === 'smtp_passwd');
    console.log(`   smtp_passwd: ${passwdCfg?.value ? '***CONFIGURADO***' : '⚠️ VACÍO'}`);

  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 3. Verificar logs de eventos
  console.log('\n3. LOGS DE EVENTOS RECIENTES...');
  try {
    const events = await api.get('/Event', {
      headers,
      params: {
        range: '0-20',
        sort: 'id',
        order: 'DESC'
      }
    });

    const mailEvents = events.data.filter(e =>
      e.message?.toLowerCase().includes('mail') ||
      e.message?.toLowerCase().includes('smtp') ||
      e.message?.toLowerCase().includes('notification') ||
      e.type?.toLowerCase().includes('mail')
    );

    if (mailEvents.length > 0) {
      console.log('   Eventos de correo encontrados:');
      for (const ev of mailEvents.slice(0, 10)) {
        console.log(`   - [${ev.date}] ${ev.type}: ${ev.message?.substring(0, 80)}`);
      }
    } else {
      console.log('   No hay eventos de correo recientes');
    }

    // Mostrar últimos eventos en general
    console.log('\n   Últimos 5 eventos:');
    for (const ev of events.data.slice(0, 5)) {
      console.log(`   - [${ev.date}] ${ev.type}: ${ev.message?.substring(0, 60)}...`);
    }

  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Verificar si hay problema con certificado SSL
  console.log('\n4. PRUEBA DE CONEXIÓN SMTP...');
  console.log('   Host: smtp.gmail.com');
  console.log('   Puerto: 465 (SSL)');
  console.log('   Usuario: armando.maldonado@entersys.mx');
  console.log('\n   ⚠️ Si usas Gmail con 2FA, necesitas "Contraseña de aplicación"');
  console.log('   → https://myaccount.google.com/apppasswords');

  // 5. Verificar modo de notificaciones
  console.log('\n5. MODO DE NOTIFICACIONES...');
  try {
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-300' }
    });

    const mailMode = config.data.find(c => c.name === 'smtp_mode');
    const modes = {
      0: 'PHP mail()',
      1: 'SMTP',
      2: 'SMTP+SSL',
      3: 'SMTP+TLS'
    };

    console.log(`   Modo actual: ${modes[mailMode?.value] || mailMode?.value || 'Desconocido'}`);

    // Verificar si está activado el mailing
    const mailingEnabled = config.data.find(c => c.name === 'notifications_mailing');
    console.log(`   Notificaciones activas: ${mailingEnabled?.value === '1' ? 'SÍ' : 'NO'}`);

  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n========================================');
  console.log('DIAGNÓSTICO COMPLETO');
  console.log('========================================');
  console.log('\n📧 POSIBLES PROBLEMAS:');
  console.log('   1. Contraseña SMTP vacía o incorrecta');
  console.log('   2. Gmail requiere "Contraseña de aplicación" si tienes 2FA');
  console.log('   3. El puerto 465 puede estar bloqueado');
  console.log('\n🔧 SOLUCIÓN:');
  console.log('   1. Ve a GLPI → Configuración → Notificaciones → Configuración de email');
  console.log('   2. Ingresa la contraseña de aplicación de Gmail');
  console.log('   3. Haz clic en "Enviar correo de prueba"');

  await api.get('/killSession', { headers });
}

checkSmtpErrors().catch(e => console.error('Error:', e.message));
