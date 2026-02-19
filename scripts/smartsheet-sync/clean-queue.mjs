#!/usr/bin/env node
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

async function cleanQueue() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', { headers: { 'Authorization': `Basic ${auth}` } });
  const headers = { 'Session-Token': session.data.session_token, 'App-Token': CONFIG.glpi.appToken };

  console.log('==========================================');
  console.log('LIMPIANDO COLA DE CORREOS');
  console.log('==========================================\n');

  // 1. Obtener todos los correos en cola
  console.log('1. OBTENIENDO CORREOS EN COLA...');
  let allIds = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const queue = await api.get('/QueuedNotification', {
      headers,
      params: { range: `${offset}-${offset + limit - 1}` }
    });

    if (queue.data.length === 0) break;

    const ids = queue.data.map(n => n.id);
    allIds = allIds.concat(ids);
    console.log(`   Encontrados: ${allIds.length} correos...`);

    if (queue.data.length < limit) break;
    offset += limit;
  }

  console.log(`\n   Total en cola: ${allIds.length} correos\n`);

  if (allIds.length === 0) {
    console.log('   La cola ya está vacía.');
    await api.get('/killSession', { headers });
    return;
  }

  // 2. Eliminar en lotes
  console.log('2. ELIMINANDO CORREOS...');
  const batchSize = 50;
  let deleted = 0;

  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);

    try {
      // Eliminar usando el endpoint de purga masiva
      await api.delete('/QueuedNotification', {
        headers,
        data: {
          input: batch.map(id => ({ id })),
          force_purge: true
        }
      });
      deleted += batch.length;
      console.log(`   Eliminados: ${deleted}/${allIds.length}`);
    } catch (e) {
      // Si falla el lote, intentar uno por uno
      console.log(`   Error en lote, eliminando uno por uno...`);
      for (const id of batch) {
        try {
          await api.delete(`/QueuedNotification/${id}`, {
            headers,
            params: { force_purge: true }
          });
          deleted++;
        } catch (e2) {
          console.log(`   No se pudo eliminar ID ${id}: ${e2.message}`);
        }
      }
      console.log(`   Eliminados: ${deleted}/${allIds.length}`);
    }
  }

  // 3. Verificar
  console.log('\n3. VERIFICANDO...');
  const queueAfter = await api.get('/QueuedNotification', {
    headers,
    params: { range: '0-10' }
  });
  console.log(`   Correos restantes: ${queueAfter.data.length}`);

  console.log('\n==========================================');
  console.log('LIMPIEZA COMPLETADA');
  console.log('==========================================');
  console.log(`\n   Correos eliminados: ${deleted}`);
  console.log('   La cola está limpia.');

  await api.get('/killSession', { headers });
}

cleanQueue().catch(e => console.error('Error:', e.message));
