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

async function configureNotifications() {
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
  console.log('CONFIGURANDO NOTIFICACIONES DE ASIGNACIÓN');
  console.log('========================================\n');

  // Notificación de asignación de usuario (ID: 63)
  const ASSIGN_USER_NOTIF_ID = 63;
  // Notificación de asignación de grupo (ID: 64)
  const ASSIGN_GROUP_NOTIF_ID = 64;

  // 1. Verificar destinos actuales de las notificaciones de asignación
  console.log('1. VERIFICANDO DESTINOS ACTUALES...\n');

  try {
    const targets = await api.get('/NotificationTarget', {
      headers,
      params: { range: '0-200' }
    });

    const assignUserTargets = targets.data.filter(t => t.notifications_id === ASSIGN_USER_NOTIF_ID);
    const assignGroupTargets = targets.data.filter(t => t.notifications_id === ASSIGN_GROUP_NOTIF_ID);

    console.log('   Destinos de "New user in assignees" (ID: 63):');
    if (assignUserTargets.length === 0) {
      console.log('   ⚠️ NO HAY DESTINOS CONFIGURADOS');
    } else {
      for (const t of assignUserTargets) {
        console.log(`   - Target ID: ${t.id}, Type: ${t.type}, Items_id: ${t.items_id}`);
      }
    }

    console.log('\n   Destinos de "New group in assignees" (ID: 64):');
    if (assignGroupTargets.length === 0) {
      console.log('   ⚠️ NO HAY DESTINOS CONFIGURADOS');
    } else {
      for (const t of assignGroupTargets) {
        console.log(`   - Target ID: ${t.id}, Type: ${t.type}, Items_id: ${t.items_id}`);
      }
    }

    // 2. Si no hay destinos, agregar el "Técnico asignado" como destino
    // Type 1 = specific user/group/etc based on items_id
    // Type 2 = Item author
    // Type 3 = Ticket technician (assigned user)
    // Type 4 = Item group technician
    // Type 21 = Observer
    // Type 26 = Ticket validation approver
    // etc.

    // En GLPI, el destino para notificar al técnico asignado es:
    // type = 1 (específico)
    // items_id = 3 (Assigned technician / Técnico asignado)

    // Verificar si ya existe el destino correcto
    const hasAssignedTechTarget = assignUserTargets.some(t => t.type === 1 && t.items_id === 3);

    if (!hasAssignedTechTarget) {
      console.log('\n2. AGREGANDO DESTINO "TÉCNICO ASIGNADO"...');

      try {
        // Agregar destino a la notificación assign_user
        const newTarget = await api.post('/NotificationTarget', {
          input: {
            notifications_id: ASSIGN_USER_NOTIF_ID,
            type: 1,
            items_id: 3, // 3 = Assigned user (técnico asignado)
          }
        }, { headers });

        console.log('   ✓ Destino agregado para notificación assign_user');
        console.log('     ID del nuevo destino:', newTarget.data.id);
      } catch (e) {
        console.log('   Error agregando destino:', e.response?.data || e.message);
      }
    } else {
      console.log('\n2. ✓ El destino "Técnico asignado" ya existe para assign_user');
    }

    // También verificar para assign_group
    const hasAssignedGroupTarget = assignGroupTargets.some(t => t.type === 1 && t.items_id === 26);

    if (!hasAssignedGroupTarget && assignGroupTargets.length === 0) {
      console.log('\n3. AGREGANDO DESTINO PARA NOTIFICACIÓN DE GRUPO...');

      try {
        // Agregar destino a la notificación assign_group
        // type=1, items_id=26 = Group users
        const newTarget = await api.post('/NotificationTarget', {
          input: {
            notifications_id: ASSIGN_GROUP_NOTIF_ID,
            type: 1,
            items_id: 26, // 26 = Group users
          }
        }, { headers });

        console.log('   ✓ Destino agregado para notificación assign_group');
        console.log('     ID del nuevo destino:', newTarget.data.id);
      } catch (e) {
        console.log('   Error agregando destino:', e.response?.data || e.message);
      }
    }

  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 3. Verificar que las notificaciones estén activas
  console.log('\n4. VERIFICANDO QUE LAS NOTIFICACIONES ESTÉN ACTIVAS...');

  try {
    const notif63 = await api.get(`/Notification/${ASSIGN_USER_NOTIF_ID}`, { headers });
    const notif64 = await api.get(`/Notification/${ASSIGN_GROUP_NOTIF_ID}`, { headers });

    console.log(`   assign_user (ID:63): ${notif63.data.is_active ? 'ACTIVA ✓' : 'INACTIVA ✗'}`);
    console.log(`   assign_group (ID:64): ${notif64.data.is_active ? 'ACTIVA ✓' : 'INACTIVA ✗'}`);

    // Activar si están inactivas
    if (!notif63.data.is_active) {
      await api.put(`/Notification/${ASSIGN_USER_NOTIF_ID}`, {
        input: { is_active: 1 }
      }, { headers });
      console.log('   → Notificación assign_user ACTIVADA');
    }

    if (!notif64.data.is_active) {
      await api.put(`/Notification/${ASSIGN_GROUP_NOTIF_ID}`, {
        input: { is_active: 1 }
      }, { headers });
      console.log('   → Notificación assign_group ACTIVADA');
    }

  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  // 4. Mostrar configuración final de destinos
  console.log('\n5. CONFIGURACIÓN FINAL DE DESTINOS:');

  try {
    const targets = await api.get('/NotificationTarget', {
      headers,
      params: { range: '0-200' }
    });

    const assignTargets = targets.data.filter(t =>
      t.notifications_id === ASSIGN_USER_NOTIF_ID ||
      t.notifications_id === ASSIGN_GROUP_NOTIF_ID
    );

    // Tipos de destino en GLPI
    const targetTypes = {
      1: 'Específico (ver items_id)',
      2: 'Autor del item',
      3: 'Técnico del item',
      4: 'Grupo técnico del item',
      5: 'Solicitante',
      6: 'Grupo solicitante',
      21: 'Observador',
      22: 'Grupo observador',
      26: 'Usuarios del grupo',
    };

    // Items_id para type=1
    const itemsMapping = {
      1: 'Autor del ticket',
      2: 'Solicitante',
      3: 'Técnico asignado',
      4: 'Técnico del grupo',
      5: 'Proveedor',
      19: 'Observador usuario',
      20: 'Grupo observador',
      21: 'Validador',
      22: 'Técnico de validación',
      23: 'Admin del grupo del ítem',
      24: 'Supervisor del grupo del ítem',
      25: 'Solicitante (grupo)',
      26: 'Usuarios del grupo asignado',
    };

    console.log('\n   Destinos configurados:');
    for (const t of assignTargets) {
      const notifName = t.notifications_id === 63 ? 'assign_user' : 'assign_group';
      const typeName = targetTypes[t.type] || `Tipo ${t.type}`;
      const itemName = t.type === 1 ? (itemsMapping[t.items_id] || `items_id=${t.items_id}`) : '-';

      console.log(`   - [${notifName}] ${typeName}: ${itemName} (Target ID: ${t.id})`);
    }

  } catch (e) {
    console.log('   Error:', e.response?.data || e.message);
  }

  console.log('\n========================================');
  console.log('CONFIGURACIÓN COMPLETADA');
  console.log('========================================');
  console.log('\n📧 Las notificaciones de asignación ahora enviarán');
  console.log('   correo al técnico cuando se le asigne un ticket.');
  console.log('\n⚠️  Asegúrate de que GLPI tenga configurado el SMTP');
  console.log('   correctamente en: Configuración → Notificaciones → Configuración de correo');

  // Cerrar sesión
  await api.get('/killSession', { headers });
}

configureNotifications().catch(e => console.error('Error:', e.message));
