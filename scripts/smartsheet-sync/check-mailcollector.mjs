#!/usr/bin/env node
/**
 * Verificar y forzar Mail Collector
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

async function checkMailCollector() {
  console.log('DIAGNÓSTICO DE MAIL COLLECTOR');
  console.log('='.repeat(60));
  console.log('Fecha:', new Date().toISOString());

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // 1. Ver configuración del Mail Collector
    console.log('\n1. CONFIGURACIÓN DE MAIL COLLECTORS:');
    console.log('-'.repeat(60));

    const collectors = await api.get('/MailCollector', { headers, params: { range: '0-10' } });

    for (const mc of collectors.data) {
      console.log(`\n📬 ${mc.name} (ID: ${mc.id})`);
      console.log(`   Host: ${mc.host}`);
      console.log(`   Activo: ${mc.is_active ? '✓ SÍ' : '✗ NO'}`);
      console.log(`   Login: ${mc.login}`);
      console.log(`   Último error: ${mc.errors || 'Ninguno'}`);
    }

    // 2. Ver tarea cron mailgate
    console.log('\n\n2. TAREA CRON MAILGATE:');
    console.log('-'.repeat(60));

    const crons = await api.get('/CronTask', { headers, params: { range: '0-100' } });
    const mailgate = crons.data.find(c => c.name === 'mailgate');

    if (mailgate) {
      console.log(`Estado: ${mailgate.state === 1 ? '✓ Activa' : '✗ Inactiva'}`);
      console.log(`Última ejecución: ${mailgate.lastrun || 'Nunca'}`);
      console.log(`Frecuencia: ${mailgate.frequency} segundos`);

      if (mailgate.lastrun) {
        const lastRun = new Date(mailgate.lastrun);
        const now = new Date();
        const diffMinutes = (now - lastRun) / 1000 / 60;
        if (diffMinutes > 5) {
          console.log(`\n⚠️ ATORADA: Última ejecución hace ${Math.round(diffMinutes)} minutos`);
        }
      }
    }

    // 3. Resetear mailgate
    console.log('\n\n3. REINICIANDO MAILGATE:');
    console.log('-'.repeat(60));

    if (mailgate) {
      try {
        await api.put(`/CronTask/${mailgate.id}`, {
          input: { state: 1, lastrun: null }
        }, { headers });
        console.log('✓ Tarea mailgate reiniciada');
      } catch(e) {
        console.log(`Error: ${e.message}`);
      }
    }

    // 4. Ejecutar cron
    console.log('\n\n4. FORZANDO EJECUCIÓN:');
    console.log('-'.repeat(60));

    for (let i = 0; i < 5; i++) {
      await axios.get('https://glpi.entersys.mx/front/cron.php', { timeout: 60000 });
      console.log(`Ejecución ${i + 1}: OK`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // 5. Ver logs después
    console.log('\n\n5. LOGS DE MAILGATE:');
    console.log('-'.repeat(60));

    const allLogs = await api.get('/CronTaskLog', {
      headers,
      params: { range: '0-50', order: 'DESC', sort: 'id' }
    });

    const mailgateLogs = allLogs.data.filter(l => l.crontasks_id === mailgate?.id);

    for (const log of mailgateLogs.slice(0, 5)) {
      console.log(`\n  ${log.date}`);
      console.log(`  Volumen: ${log.volume}`);
      console.log(`  Mensaje: ${log.content}`);
    }

    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('VERIFICAR EN GLPI');
    console.log('='.repeat(60));
    console.log(`
Ve a: Configuración → Colectores de correo → Soporte Entersys
Y haz clic en "Obtener correos ahora" para forzar la lectura.
`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMailCollector();
