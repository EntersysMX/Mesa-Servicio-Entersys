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

async function createKOFProject() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const headers = {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken,
    'Content-Type': 'application/json',
  };

  // 1. Crear proyecto padre KOF
  console.log('1. Creando proyecto KOF...');
  let kofId;
  try {
    const kof = await api.post('/Location', {
      input: {
        name: 'KOF - Alto Riesgo',
        comment: 'Proyecto Alto Riesgo - Coca Cola FEMSA',
      }
    }, { headers });
    kofId = kof.data.id;
    console.log('   ✓ Proyecto KOF creado con ID:', kofId);
  } catch (e) {
    console.log('   Error creando KOF:', e.response?.data?.[1] || e.message);
    return;
  }

  // 2. Obtener ubicaciones actuales
  console.log('\n2. Actualizando ubicaciones para que tengan a KOF como padre...');
  const locations = await api.get('/Location', { headers });

  for (const loc of locations.data) {
    if (loc.id !== kofId && !loc.locations_id) {
      try {
        await api.put(`/Location/${loc.id}`, {
          input: {
            locations_id: kofId,
          }
        }, { headers });
        console.log(`   ✓ ${loc.name} → ahora es hijo de KOF`);
      } catch (e) {
        console.log(`   ✗ ${loc.name}:`, e.response?.data?.[1] || e.message);
      }
    }
  }

  console.log('\n✅ Completado');
}

createKOFProject().catch(e => console.error('Error:', e.message));
