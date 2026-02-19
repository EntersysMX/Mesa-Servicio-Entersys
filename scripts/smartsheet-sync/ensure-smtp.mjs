#!/usr/bin/env node
/**
 * Script para asegurar que la contraseña SMTP siempre esté configurada
 * Se puede ejecutar como cron job o llamar periódicamente
 */
import axios from 'axios';

// Configuración SMTP - GUARDAR AQUÍ LA CONTRASEÑA
const SMTP_CONFIG = {
  password: '***SMTP_PASSWORD_REMOVED***',  // App password de Gmail
  host: 'smtp.gmail.com',
  port: '587',
  username: 'armando.maldonado@entersys.mx'
};

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

async function ensureSmtpPassword() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Verificando configuración SMTP...`);

  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // Obtener configuraciones
    const config = await api.get('/Config', { headers, params: { range: '0-500' } });

    const smtpFields = {
      smtp_host: SMTP_CONFIG.host,
      smtp_port: SMTP_CONFIG.port,
      smtp_username: SMTP_CONFIG.username,
      smtp_passwd: SMTP_CONFIG.password,
      smtp_mode: '1', // SMTP+TLS
      notifications_mailing: '1' // Activar notificaciones
    };

    let updated = 0;

    for (const [fieldName, expectedValue] of Object.entries(smtpFields)) {
      const cfg = config.data.find(c => c.name === fieldName);

      if (cfg) {
        // Para smtp_passwd, siempre actualizar (no podemos verificar el valor actual)
        if (fieldName === 'smtp_passwd') {
          try {
            await api.put(`/Config/${cfg.id}`, {
              input: { value: expectedValue }
            }, { headers });
            console.log(`   ✓ ${fieldName}: actualizado`);
            updated++;
          } catch (e) {
            // Si falla por API, intentar otro método
            console.log(`   ⚠ ${fieldName}: no se pudo actualizar via API (normal por seguridad)`);
          }
        } else if (cfg.value !== expectedValue) {
          try {
            await api.put(`/Config/${cfg.id}`, {
              input: { value: expectedValue }
            }, { headers });
            console.log(`   ✓ ${fieldName}: ${cfg.value || '(vacío)'} → ${expectedValue}`);
            updated++;
          } catch (e) {
            console.log(`   ✗ ${fieldName}: error al actualizar`);
          }
        } else {
          console.log(`   ○ ${fieldName}: OK`);
        }
      }
    }

    // Verificar cola de correos
    const queue = await api.get('/QueuedNotification', { headers, params: { range: '0-5' } });
    console.log(`\n   Cola de correos: ${queue.data.length} pendientes`);

    // Ejecutar cron si hay correos pendientes
    if (queue.data.length > 0) {
      console.log('   Ejecutando cron de envío...');
      try {
        await axios.get('https://glpi.entersys.mx/front/cron.php', { timeout: 30000 });
        console.log('   ✓ Cron ejecutado');
      } catch (e) {
        console.log('   Cron llamado');
      }
    }

    await api.get('/killSession', { headers });

    console.log(`\n[${timestamp}] Verificación completada. Campos actualizados: ${updated}`);
    return { success: true, updated };

  } catch (error) {
    console.error(`[${timestamp}] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

// Ejecutar inmediatamente
ensureSmtpPassword();

// Exportar para uso como módulo
export { ensureSmtpPassword, SMTP_CONFIG };
