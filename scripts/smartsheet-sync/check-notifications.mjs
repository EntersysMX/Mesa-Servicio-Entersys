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

async function checkNotifications() {
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
  console.log('VERIFICANDO CONFIGURACIÓN DE NOTIFICACIONES');
  console.log('========================================\n');

  // 1. Verificar configuración de correo
  console.log('1. CONFIGURACIÓN DE CORREO (Entity)...');
  try {
    const entities = await api.get('/Entity', {
      headers,
      params: { range: '0-10' }
    });
    console.log('   Entidades:', entities.data.length);
    for (const entity of entities.data) {
      console.log(`   - ${entity.name} (ID: ${entity.id})`);
      console.log(`     admin_email: ${entity.admin_email || 'NO CONFIGURADO'}`);
      console.log(`     admin_email_name: ${entity.admin_email_name || '-'}`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 2. Verificar notificaciones disponibles
  console.log('\n2. NOTIFICACIONES CONFIGURADAS...');
  try {
    const notifications = await api.get('/Notification', {
      headers,
      params: { range: '0-50' }
    });
    console.log(`   Total notificaciones: ${notifications.data.length}`);

    // Filtrar por notificaciones de Ticket
    const ticketNotifs = notifications.data.filter(n =>
      n.itemtype === 'Ticket' || (n.name && n.name.toLowerCase().includes('ticket'))
    );
    console.log(`   Notificaciones de Ticket: ${ticketNotifs.length}`);

    for (const notif of ticketNotifs) {
      console.log(`\n   📧 ${notif.name} (ID: ${notif.id})`);
      console.log(`      Activa: ${notif.is_active ? 'SÍ ✓' : 'NO ✗'}`);
      console.log(`      Evento: ${notif.event || '-'}`);
      console.log(`      Modo: ${notif.mode || '-'}`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 3. Verificar templates de notificación
  console.log('\n3. PLANTILLAS DE NOTIFICACIÓN...');
  try {
    const templates = await api.get('/NotificationTemplate', {
      headers,
      params: { range: '0-50' }
    });
    console.log(`   Total plantillas: ${templates.data.length}`);

    const ticketTemplates = templates.data.filter(t =>
      t.itemtype === 'Ticket'
    );
    console.log(`   Plantillas de Ticket: ${ticketTemplates.length}`);

    for (const tmpl of ticketTemplates.slice(0, 5)) {
      console.log(`   - ${tmpl.name} (ID: ${tmpl.id})`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 4. Verificar destinos de notificación (NotificationTarget)
  console.log('\n4. DESTINOS DE NOTIFICACIÓN...');
  try {
    const targets = await api.get('/NotificationTarget', {
      headers,
      params: { range: '0-100' }
    });
    console.log(`   Total destinos: ${targets.data.length}`);

    // Agrupar por tipo
    const byType = {};
    for (const target of targets.data) {
      const type = target.type || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(target);
    }

    console.log('   Tipos de destino:');
    for (const [type, items] of Object.entries(byType)) {
      console.log(`   - Tipo ${type}: ${items.length} destinos`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 5. Verificar usuarios y sus emails
  console.log('\n5. TÉCNICOS Y SUS CORREOS...');
  try {
    const users = await api.get('/User', {
      headers,
      params: { range: '0-50', is_active: 1 }
    });

    const technicians = users.data.filter(u =>
      !['glpi', 'post-only', 'normal', 'glpi-system'].includes(u.name?.toLowerCase())
    );

    console.log(`   Técnicos activos: ${technicians.length}`);

    for (const tech of technicians) {
      // Obtener emails del usuario
      let email = tech.email || '-';
      try {
        const userEmails = await api.get(`/User/${tech.id}/UserEmail`, { headers });
        if (userEmails.data && userEmails.data.length > 0) {
          email = userEmails.data.map(e => e.email).join(', ');
        }
      } catch (e) {
        // Ignorar
      }

      console.log(`   - ${tech.name} (ID: ${tech.id})`);
      console.log(`     Email: ${email}`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 6. Verificar configuración SMTP
  console.log('\n6. CONFIGURACIÓN SMTP (Config)...');
  try {
    // Intentar obtener configuración general
    const config = await api.get('/Config', {
      headers,
      params: { range: '0-100' }
    });

    // Buscar configuraciones de email
    const emailConfigs = config.data.filter(c =>
      c.name && (
        c.name.includes('smtp') ||
        c.name.includes('mail') ||
        c.name.includes('notification')
      )
    );

    console.log('   Configuraciones de email encontradas:');
    for (const cfg of emailConfigs) {
      console.log(`   - ${cfg.name}: ${cfg.value || '-'}`);
    }
  } catch (e) {
    console.log('   No se puede acceder a Config via API (normal en algunos perfiles)');
  }

  // 7. Listar eventos de notificación para Ticket
  console.log('\n7. EVENTOS DE NOTIFICACIÓN PARA TICKETS...');
  try {
    const notifications = await api.get('/Notification', {
      headers,
      params: { range: '0-100' }
    });

    const ticketEvents = notifications.data.filter(n => n.itemtype === 'Ticket');

    console.log('   Eventos configurados:');
    for (const notif of ticketEvents) {
      const isAssign = notif.event === 'assign_user' || notif.event === 'assign_group';
      console.log(`   ${isAssign ? '→' : '-'} ${notif.event}: ${notif.name}`);
      console.log(`     Activo: ${notif.is_active ? 'SÍ' : 'NO'}, ID: ${notif.id}`);
    }
  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  console.log('\n========================================');
  console.log('FIN DEL DIAGNÓSTICO');
  console.log('========================================');

  // Cerrar sesión
  await api.get('/killSession', { headers });
}

checkNotifications().catch(e => console.error('Error:', e.message));
