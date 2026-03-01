#!/usr/bin/env node
/**
 * Script para verificar y configurar el sistema de tracking de correos en GLPI
 *
 * El sistema de tracking funciona así:
 * 1. GLPI envía correos con [GLPI #0000123] en el asunto
 * 2. Cuando el usuario responde (manteniendo el asunto), Mail Collector detecta el tag
 * 3. El correo se vincula automáticamente al ticket correspondiente como seguimiento
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

async function configureEmailTracking() {
  console.log('='.repeat(60));
  console.log('CONFIGURACIÓN DE TRACKING DE CORREOS EN GLPI');
  console.log('='.repeat(60));
  console.log();

  try {
    // Iniciar sesión
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // 1. Verificar configuración de notificaciones
    console.log('1. VERIFICANDO CONFIGURACIÓN DE NOTIFICACIONES');
    console.log('-'.repeat(60));

    const config = await api.get('/Config', { headers, params: { range: '0-500' } });

    const notificationConfigs = [
      'notifications_mailing',
      'admin_email',
      'admin_email_name',
      'from_email',
      'from_email_name',
      'mailing_signature',
      'url_base'
    ];

    for (const name of notificationConfigs) {
      const cfg = config.data.find(c => c.name === name);
      if (cfg) {
        console.log(`   ${name}: ${cfg.value || '(vacío)'}`);
      }
    }

    // 2. Verificar plantillas de notificación
    console.log('\n2. PLANTILLAS DE NOTIFICACIÓN (NotificationTemplate)');
    console.log('-'.repeat(60));

    try {
      const templates = await api.get('/NotificationTemplate', {
        headers,
        params: { range: '0-50' }
      });

      console.log(`   Total de plantillas: ${templates.data.length}`);

      // Buscar plantillas de tickets
      const ticketTemplates = templates.data.filter(t =>
        t.itemtype === 'Ticket' ||
        t.name?.toLowerCase().includes('ticket')
      );

      console.log(`   Plantillas de Tickets: ${ticketTemplates.length}`);

      for (const tpl of ticketTemplates.slice(0, 10)) {
        console.log(`\n   📧 ${tpl.name} (ID: ${tpl.id})`);
        console.log(`      Tipo: ${tpl.itemtype}`);

        // Obtener traducciones/contenido de la plantilla
        try {
          const translations = await api.get('/NotificationTemplateTranslation', {
            headers,
            params: {
              'searchText[notificationtemplates_id]': tpl.id,
              range: '0-10'
            }
          });

          if (translations.data && translations.data.length > 0) {
            for (const trans of translations.data) {
              console.log(`      Idioma: ${trans.language || 'default'}`);
              console.log(`      Asunto: ${trans.subject || '(sin asunto)'}`);

              // Verificar si el asunto incluye el tag del ticket
              if (trans.subject) {
                const hasTag = trans.subject.includes('##ticket.id##') ||
                               trans.subject.includes('##ticket.title##') ||
                               trans.subject.includes('[GLPI');
                console.log(`      ¿Incluye ID?: ${hasTag ? '✓ SÍ' : '✗ NO'}`);
              }
            }
          }
        } catch (e) {
          console.log(`      (No se pudo obtener traducciones)`);
        }
      }
    } catch (e) {
      console.log(`   Error obteniendo plantillas: ${e.message}`);
    }

    // 3. Verificar Mail Collector
    console.log('\n3. CONFIGURACIÓN DE MAIL COLLECTOR');
    console.log('-'.repeat(60));

    try {
      const mailCollectors = await api.get('/MailCollector', { headers, params: { range: '0-10' } });

      if (mailCollectors.data && mailCollectors.data.length > 0) {
        for (const mc of mailCollectors.data) {
          console.log(`\n   📬 ${mc.name} (ID: ${mc.id})`);
          console.log(`      Host: ${mc.host}`);
          console.log(`      Activo: ${mc.is_active ? 'SÍ' : 'NO'}`);
          console.log(`      Frecuencia: cada ${mc.frequency} segundos`);

          // Opciones importantes para tracking
          console.log(`      Rechazar si desconocido: ${mc.refused_mail_with_noticket ? 'SÍ' : 'NO'}`);
          console.log(`      Usar asunto para ticket existente: ${mc.use_mail_date ? 'SÍ' : 'NO'}`);
        }
      } else {
        console.log('   ⚠ No hay Mail Collectors configurados');
      }
    } catch (e) {
      console.log(`   Error: ${e.message}`);
    }

    // 4. Información sobre el sistema de tags
    console.log('\n4. SISTEMA DE TAGS PARA TRACKING');
    console.log('-'.repeat(60));
    console.log(`
   GLPI usa tags especiales en las plantillas de notificación.
   Para el tracking de correos, el asunto debe incluir:

   ##ticket.id##     → Se reemplaza por el ID del ticket (ej: 123)
   ##ticket.title##  → Se reemplaza por el título del ticket

   Ejemplo de asunto configurado:
   "[GLPI ##ticket.id##] ##ticket.title##"

   Se convierte en:
   "[GLPI #123] Problema con impresora"

   Cuando el usuario responde manteniendo este asunto, Mail Collector
   detecta el patrón [GLPI #XXX] y vincula la respuesta al ticket.
`);

    // 5. Verificar si hay un tag configurado
    console.log('\n5. VERIFICACIÓN DE TAG EN CONFIGURACIÓN GLOBAL');
    console.log('-'.repeat(60));

    const tagConfig = config.data.find(c => c.name === 'mailing_signature');
    if (tagConfig) {
      console.log(`   Firma de correo: ${tagConfig.value || '(vacía)'}`);
    }

    // Buscar configuración de URL base (importante para los links)
    const urlBase = config.data.find(c => c.name === 'url_base');
    if (urlBase) {
      console.log(`   URL base: ${urlBase.value}`);
    }

    // Cerrar sesión
    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('PASOS PARA CONFIGURAR EL TRACKING MANUALMENTE:');
    console.log('='.repeat(60));
    console.log(`
1. Ve a: Configuración → Notificaciones → Plantillas de notificación

2. Edita cada plantilla de Ticket y modifica el ASUNTO para incluir:
   [GLPI ##ticket.id##] ##ticket.title##

   Plantillas importantes a modificar:
   - Ticket (nuevo ticket)
   - Ticket - Añadir seguimiento
   - Ticket - Cerrar ticket
   - Ticket - Resolución de ticket

3. En Mail Collector, asegúrate de que:
   - Esté activo
   - Frecuencia sea baja (60 segundos recomendado)
   - La cuenta tenga acceso IMAP

4. IMPORTANTE: GLPI detecta automáticamente el patrón:
   [GLPI #123] en el asunto del correo entrante
   y lo vincula al ticket correspondiente.

5. Para probar:
   a) Crea un ticket de prueba
   b) Verifica que el correo de notificación tenga [GLPI #XXX] en asunto
   c) Responde al correo manteniendo el asunto
   d) Verifica que la respuesta aparezca como seguimiento en el ticket
`);

    return { success: true };

  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

// Ejecutar
configureEmailTracking();
