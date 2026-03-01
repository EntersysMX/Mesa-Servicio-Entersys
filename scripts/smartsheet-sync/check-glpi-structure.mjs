#!/usr/bin/env node
/**
 * Verificar estructura de GLPI y opciones disponibles
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

async function checkStructure() {
  try {
    const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
    const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
    const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

    // Verificar versión de GLPI
    console.log('INFORMACIÓN DE GLPI');
    console.log('='.repeat(60));

    try {
      const glpiConfig = await api.get('/getGlpiConfig', { headers });
      console.log('Versión:', glpiConfig.data.cfg_glpi?.version || 'No disponible');
    } catch(e) {
      console.log('No se pudo obtener versión');
    }

    // Listar TODAS las plantillas de notificación
    console.log('\nTODAS LAS PLANTILLAS DE NOTIFICACIÓN:');
    console.log('='.repeat(60));

    const templates = await api.get('/NotificationTemplate', { headers, params: { range: '0-100' } });

    for (const tpl of templates.data) {
      console.log(`\nID: ${tpl.id} | ${tpl.name}`);
      console.log(`   Tipo: ${tpl.itemtype}`);
    }

    // Obtener traducciones de plantillas de tipo Ticket
    console.log('\n\nTRADUCCIONES DE PLANTILLAS DE TICKETS:');
    console.log('='.repeat(60));

    const translations = await api.get('/NotificationTemplateTranslation', { headers, params: { range: '0-200' } });

    // Filtrar solo las de tickets
    const ticketTemplateIds = templates.data
      .filter(t => t.itemtype === 'Ticket')
      .map(t => t.id);

    for (const trans of translations.data) {
      if (ticketTemplateIds.includes(trans.notificationtemplates_id)) {
        console.log(`\nPlantilla ID: ${trans.notificationtemplates_id}`);
        console.log(`Traducción ID: ${trans.id}`);
        console.log(`Idioma: ${trans.language || '(default)'}`);
        console.log(`Asunto: ${trans.subject}`);
      }
    }

    // Verificar Entity config (ahí puede estar la config de correo)
    console.log('\n\nCONFIGURACIÓN DE ENTIDAD:');
    console.log('='.repeat(60));

    try {
      const entities = await api.get('/Entity', { headers, params: { range: '0-10' } });
      for (const entity of entities.data) {
        console.log(`\nEntidad: ${entity.name} (ID: ${entity.id})`);
        console.log(`   admin_email: ${entity.admin_email || '(no configurado)'}`);
        console.log(`   admin_email_name: ${entity.admin_email_name || '(no configurado)'}`);
      }
    } catch(e) {
      console.log('No se pudo obtener entidades');
    }

    // Verificar configuraciones relacionadas con notificaciones
    console.log('\n\nCONFIGURACIONES DE NOTIFICACIÓN:');
    console.log('='.repeat(60));

    const config = await api.get('/Config', { headers, params: { range: '0-500' } });

    const notifKeys = config.data.filter(c =>
      c.name.includes('mail') ||
      c.name.includes('smtp') ||
      c.name.includes('notif') ||
      c.name.includes('email') ||
      c.name.includes('url_base') ||
      c.name.includes('from_') ||
      c.name.includes('admin_')
    );

    for (const cfg of notifKeys) {
      const value = cfg.name.includes('passwd') ? '******' : (cfg.value || '(vacío)');
      console.log(`${cfg.name}: ${value}`);
    }

    await api.get('/killSession', { headers });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStructure();
