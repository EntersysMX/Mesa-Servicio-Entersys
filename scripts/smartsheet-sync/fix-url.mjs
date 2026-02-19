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

const PROD_URL = 'https://glpi.entersys.mx';

async function fixUrl() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await api.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  const headers = {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken,
  };

  console.log('==========================================');
  console.log('CORRIGIENDO URL DE GLPI');
  console.log('==========================================\n');

  // 1. Obtener configuraciones de URL
  console.log('1. CONFIGURACIONES DE URL ACTUALES:');
  try {
    const config = await api.get('/Config', { headers, params: { range: '0-500' } });

    const urlConfigs = config.data.filter(c =>
      c.name && (c.name.includes('url') || c.name === 'url_base' || c.name === 'url_base_api')
    );

    for (const cfg of urlConfigs) {
      console.log(`   ${cfg.name} (ID:${cfg.id}): ${cfg.value || '(vacío)'}`);
    }

    // 2. Actualizar url_base
    const urlBase = config.data.find(c => c.name === 'url_base');
    if (urlBase) {
      console.log(`\n2. URL BASE ACTUAL: ${urlBase.value}`);

      if (urlBase.value !== PROD_URL) {
        console.log(`   Cambiando a: ${PROD_URL}`);
        try {
          await api.put(`/Config/${urlBase.id}`, {
            input: { value: PROD_URL }
          }, { headers });
          console.log('   ✓ URL actualizada');
        } catch (e) {
          console.log('   Error:', e.response?.data?.[1] || e.message);
          console.log('\n   ⚠️ No se puede cambiar via API.');
          console.log('   Debes cambiarlo manualmente en GLPI:');
          console.log('   Configuración → General → URL de la aplicación');
        }
      } else {
        console.log('   ✓ URL ya está correcta');
      }
    }

    // 3. Verificar url_base_api
    const urlBaseApi = config.data.find(c => c.name === 'url_base_api');
    if (urlBaseApi && urlBaseApi.value) {
      console.log(`\n3. URL API: ${urlBaseApi.value}`);
    }

  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n==========================================');
  console.log('INSTRUCCIONES MANUALES (si falló el API)');
  console.log('==========================================');
  console.log('\n1. Ve a GLPI → Configuración → General');
  console.log('2. En "URL de la aplicación" pon:');
  console.log('   https://glpi.entersys.mx');
  console.log('3. Guarda los cambios');
  console.log('\nEsto corregirá los links en los correos.');

  await api.get('/killSession', { headers });
}

fixUrl().catch(e => console.error('Error:', e.message));
