#!/usr/bin/env node
import express from 'express';
import axios from 'axios';

// Configuración
const CONFIG = {
  port: 3001,
  gemini: {
    apiKey: 'AIzaSyA-_uX-vZijT610p15Swmut146SBXawKko',
    model: 'gemini-2.0-flash',
  },
  glpi: {
    url: 'https://glpi.entersys.mx/apirest.php',
    appToken: 'oxhLE1abmedU2JhBRVVCb3JZw4jAZ5qd1S21dUgi',
    username: 'glpi',
    password: 'glpi',
  }
};

// Cliente GLPI
const glpiApi = axios.create({
  baseURL: CONFIG.glpi.url,
  headers: { 'Content-Type': 'application/json', 'App-Token': CONFIG.glpi.appToken }
});

// Iniciar sesión en GLPI
async function getGlpiSession() {
  const auth = Buffer.from(`${CONFIG.glpi.username}:${CONFIG.glpi.password}`).toString('base64');
  const session = await glpiApi.get('/initSession', {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  return {
    'Session-Token': session.data.session_token,
    'App-Token': CONFIG.glpi.appToken
  };
}

// Consultar a Gemini
async function askGemini(ticketTitle, ticketContent) {
  const prompt = `Eres un asistente de soporte técnico de TI. Un usuario ha creado el siguiente ticket:

TÍTULO: ${ticketTitle}

DESCRIPCIÓN: ${ticketContent}

Analiza el problema y proporciona:
1. Un diagnóstico breve del problema
2. Pasos para solucionarlo (si es posible)
3. Si no puedes resolver, indica qué información adicional necesitas

Responde de forma clara y concisa en español. Si el problema requiere intervención de un técnico, indícalo.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.gemini.model}:generateContent?key=${CONFIG.gemini.apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error Gemini:', error.response?.data || error.message);
    return null;
  }
}

// Agregar respuesta al ticket
async function addFollowup(ticketId, content) {
  const headers = await getGlpiSession();

  try {
    await glpiApi.post('/ITILFollowup', {
      input: {
        itemtype: 'Ticket',
        items_id: ticketId,
        content: `🤖 <strong>Respuesta automática (IA):</strong><br><br>${content.replace(/\n/g, '<br>')}`,
        is_private: 0
      }
    }, { headers });

    console.log(`✓ Respuesta agregada al ticket #${ticketId}`);
    await glpiApi.get('/killSession', { headers });
    return true;
  } catch (error) {
    console.error('Error al agregar followup:', error.response?.data || error.message);
    return false;
  }
}

// Servidor Express
const app = express();
app.use(express.json());

// Endpoint para recibir webhooks de GLPI
app.post('/webhook/ticket', async (req, res) => {
  console.log('\n==========================================');
  console.log('WEBHOOK RECIBIDO:', new Date().toLocaleString());
  console.log('==========================================');

  try {
    const data = req.body;
    console.log('Datos recibidos:', JSON.stringify(data, null, 2));

    // Extraer datos del ticket
    const ticketId = data.id || data.items_id || data.ticket?.id;
    const ticketTitle = data.name || data.title || data.ticket?.name || 'Sin título';
    const ticketContent = data.content || data.description || data.ticket?.content || 'Sin descripción';

    if (!ticketId) {
      console.log('⚠️ No se encontró ID del ticket');
      return res.status(400).json({ error: 'No ticket ID found' });
    }

    console.log(`\nTicket #${ticketId}: ${ticketTitle}`);
    console.log('Contenido:', ticketContent.substring(0, 100) + '...');

    // Consultar a Gemini
    console.log('\n📤 Consultando a Gemini...');
    const aiResponse = await askGemini(ticketTitle, ticketContent);

    if (aiResponse) {
      console.log('\n📥 Respuesta de Gemini:');
      console.log(aiResponse.substring(0, 200) + '...');

      // Agregar respuesta al ticket
      console.log('\n📝 Agregando respuesta al ticket...');
      await addFollowup(ticketId, aiResponse);
    } else {
      console.log('⚠️ Gemini no respondió');
    }

    res.json({ success: true, ticketId });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(CONFIG.port, () => {
  console.log('==========================================');
  console.log('SERVIDOR WEBHOOK + GEMINI');
  console.log('==========================================');
  console.log(`\n✓ Servidor corriendo en puerto ${CONFIG.port}`);
  console.log(`\nEndpoint webhook: http://localhost:${CONFIG.port}/webhook/ticket`);
  console.log('\nEsperando webhooks de GLPI...\n');
});
