#!/usr/bin/env node
/**
 * Script para actualizar las plantillas de notificación de GLPI
 * Agrega el tag [GLPI ##ticket.id##] para habilitar tracking de correos
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

const api = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: { 'Content-Type': 'application/json', 'App-Token': CONFIG.glpi.appToken }
});

async function updateTemplates() {
  console.log('='.repeat(60));
  console.log('ACTUALIZANDO PLANTILLAS DE NOTIFICACIÓN');
  console.log('='.repeat(60));
  console.log();

  try {
    // Iniciar sesión
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // 1. Corregir URL base
    console.log('1. CORRIGIENDO URL BASE');
    console.log('-'.repeat(60));

    const configItems = await api.get('/Config', { headers, params: { range: '0-500' } });
    const urlBaseConfig = configItems.data.find(c => c.name === 'url_base');

    if (urlBaseConfig && urlBaseConfig.value !== 'https://glpi.entersys.mx') {
      try {
        await api.put(`/Config/${urlBaseConfig.id}`, {
          input: { value: 'https://glpi.entersys.mx' }
        }, { headers });
        console.log('   ✓ URL base actualizada: https://glpi.entersys.mx');
      } catch (e) {
        console.log(`   ⚠ No se pudo actualizar URL base: ${e.message}`);
      }
    } else {
      console.log('   ○ URL base ya está correcta');
    }

    // Corregir from_email si está vacío
    const fromEmail = configItems.data.find(c => c.name === 'from_email');
    if (fromEmail && !fromEmail.value) {
      try {
        await api.put(`/Config/${fromEmail.id}`, {
          input: { value: 'armando.maldonado@entersys.mx' }
        }, { headers });
        console.log('   ✓ from_email configurado');
      } catch (e) {
        console.log(`   ⚠ No se pudo configurar from_email`);
      }
    }

    const fromEmailName = configItems.data.find(c => c.name === 'from_email_name');
    if (fromEmailName && !fromEmailName.value) {
      try {
        await api.put(`/Config/${fromEmailName.id}`, {
          input: { value: 'GLPI Mesa de Ayuda - Entersys' }
        }, { headers });
        console.log('   ✓ from_email_name configurado');
      } catch (e) {
        console.log(`   ⚠ No se pudo configurar from_email_name`);
      }
    }

    // 2. Obtener plantillas de tickets
    console.log('\n2. ACTUALIZANDO PLANTILLAS DE TICKETS');
    console.log('-'.repeat(60));

    // IDs de plantillas de tickets según la verificación anterior
    const ticketTemplateIds = [4, 5, 6, 7, 14, 32];

    for (const templateId of ticketTemplateIds) {
      try {
        // Obtener traducciones de esta plantilla
        const translations = await api.get('/NotificationTemplateTranslation', {
          headers,
          params: { range: '0-50' }
        });

        // Filtrar las que pertenecen a esta plantilla y son de tipo Ticket
        const templateTranslations = translations.data.filter(t =>
          t.notificationtemplates_id === templateId
        );

        for (const trans of templateTranslations) {
          const currentSubject = trans.subject || '';

          // Si el asunto ya tiene el tag, saltar
          if (currentSubject.includes('[GLPI') || currentSubject.includes('##ticket.id##')) {
            console.log(`   ○ Template ${templateId} (${trans.language || 'default'}): Ya tiene tag`);
            continue;
          }

          // Si contiene ##ticket - es una plantilla de ticket
          if (currentSubject.includes('##ticket.')) {
            // Nuevo formato: [GLPI ##ticket.id##] + asunto actual
            const newSubject = `[GLPI ##ticket.id##] ${currentSubject}`;

            try {
              await api.put(`/NotificationTemplateTranslation/${trans.id}`, {
                input: { subject: newSubject }
              }, { headers });

              console.log(`   ✓ Template ${templateId}:`);
              console.log(`      Antes: ${currentSubject}`);
              console.log(`      Ahora: ${newSubject}`);
            } catch (e) {
              console.log(`   ✗ Error actualizando template ${templateId}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        console.log(`   Error con template ${templateId}: ${e.message}`);
      }
    }

    // 3. Verificación final
    console.log('\n3. VERIFICACIÓN FINAL');
    console.log('-'.repeat(60));

    // Obtener todas las traducciones de plantillas
    const allTranslations = await api.get('/NotificationTemplateTranslation', {
      headers,
      params: { range: '0-100' }
    });

    const ticketSubjects = allTranslations.data
      .filter(t => t.subject && t.subject.includes('##ticket.'))
      .map(t => ({
        id: t.id,
        templateId: t.notificationtemplates_id,
        subject: t.subject,
        hasTag: t.subject.includes('[GLPI')
      }));

    console.log('\n   Plantillas de Ticket configuradas:');
    for (const ts of ticketSubjects) {
      const status = ts.hasTag ? '✓' : '✗';
      console.log(`   ${status} [${ts.templateId}] ${ts.subject.substring(0, 60)}...`);
    }

    // Cerrar sesión
    await api.get('/killSession', { headers });

    console.log('\n' + '='.repeat(60));
    console.log('ACTUALIZACIÓN COMPLETADA');
    console.log('='.repeat(60));
    console.log(`
Ahora cuando GLPI envíe notificaciones de tickets, el asunto incluirá:
[GLPI #123] Nuevo ticket - Problema con impresora

Cuando el usuario responda manteniendo este asunto, Mail Collector
vinculará automáticamente la respuesta al ticket #123.
`);

    return { success: true };

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

// Ejecutar
updateTemplates();
