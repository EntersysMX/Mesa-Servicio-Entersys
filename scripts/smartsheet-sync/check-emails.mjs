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

async function checkEmails() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const headers = {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken,
  };

  console.log('=== DIAGNÓSTICO DE CORREOS ===\n');

  // 1. Ver correos en cola
  console.log('1. CORREOS EN COLA:');
  const queue = await api.get('/QueuedNotification', { headers, params: { range: '0-20' } });

  const byRecipient = {};
  for (const n of queue.data) {
    const email = n.recipient;
    if (!byRecipient[email]) byRecipient[email] = 0;
    byRecipient[email]++;
  }

  console.log(`   Total pendientes: ${queue.data.length}`);
  console.log('   Por destinatario:');
  for (const [email, count] of Object.entries(byRecipient)) {
    console.log(`   - ${email}: ${count} correos`);
  }

  // 2. Ver intentos fallidos
  console.log('\n2. CORREOS CON ERRORES:');
  const withErrors = queue.data.filter(n => n.sent_try > 0);
  console.log(`   Con intentos fallidos: ${withErrors.length}`);

  if (withErrors.length > 0) {
    for (const n of withErrors.slice(0, 5)) {
      console.log(`   - ID:${n.id} → ${n.recipient}`);
      console.log(`     Intentos: ${n.sent_try}`);
      console.log(`     Asunto: ${n.name?.substring(0, 50)}`);
    }
  }

  // 3. Ver últimos correos (los que "se enviaron")
  console.log('\n3. MUESTRA DE CORREOS EN COLA:');
  for (const n of queue.data.slice(0, 5)) {
    console.log(`   → ${n.recipient}`);
    console.log(`     Asunto: ${n.name?.substring(0, 50)}`);
    console.log(`     Creado: ${n.create_time}`);
    console.log('');
  }

  // 4. Configuración de remitente
  console.log('4. CONFIGURACIÓN DE ENVÍO:');
  const config = await api.get('/Config', { headers, params: { range: '0-300' } });

  const fields = ['admin_email', 'smtp_sender', 'smtp_username', 'from_email'];
  for (const f of fields) {
    const cfg = config.data.find(c => c.name === f);
    console.log(`   ${f}: ${cfg?.value || '(vacío)'}`);
  }

  console.log('\n=== ¿QUÉ REVISAR? ===');
  console.log('1. Revisa tu carpeta SPAM');
  console.log('2. Busca correos de: armando.maldonado@entersys.mx');
  console.log('3. Busca asunto con: [GLPI #');
  console.log('\nSi no llegan, puede ser que Gmail bloquea el envío.');
  console.log('Prueba en GLPI → Configuración → Notificaciones → Enviar correo de prueba');

  await api.get('/killSession', { headers });
}

checkEmails().catch(e => console.error('Error:', e.message));
