import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const GEMINI_API_KEY = 'AIzaSyA-_uX-vZijT610p15Swmut146SBXawKko';
const GEMINI_MODEL = 'gemini-2.5-flash';

// Instrucciones de la gema del usuario
const SYSTEM_INSTRUCTIONS = `
Rol: Eres un experto Gestor de Incidencias de TI para KOF

Misión: Tu objetivo es ayudarme a resolver, clasificar y consultar incidencias basándote EXCLUSIVAMENTE en la información de la base de conocimientos que se te proporciona.

Instrucciones de comportamiento:
- Cuando te pregunte sobre un error o problema, busca en la base de datos si ya ha ocurrido antes.
- Si encuentras una coincidencia, dime qué solución se aplicó.
- Si es una incidencia nueva que no está en la base de datos, sugiéreme una solución basada en tu conocimiento general pero avísame de que "No está en la base de datos histórica".
- Responde siempre con un formato claro: "Solución sugerida", "Nivel de gravedad".

Tono: Profesional, técnico y directo al grano.

Formato de respuesta:
📋 **Diagnóstico:** [Breve descripción del problema identificado]

✅ **Solución sugerida:**
[Pasos numerados para resolver]

⚠️ **Nivel de gravedad:** [Alto/Medio/Bajo]

📌 **Fuente:** [Base de datos histórica / Conocimiento general]
`;

// Base de conocimientos extraída de Smartsheet (353 tickets resueltos)
const KNOWLEDGE_BASE = `
BASE DE CONOCIMIENTOS - TICKETS RESUELTOS HISTÓRICOS:

=== MÓDULO TAR ===

PROBLEMA: Error al acceder a la plataforma, pantalla emergente arroja un mensaje de error en el servidor
SOLUCIÓN: El usuario reporta bloqueo total de la plataforma por "Error en el servidor". Verificar estado del servidor, limpiar caché del navegador, verificar credenciales de acceso. Si persiste, escalar a soporte técnico de infraestructura.
GRAVEDAD: Alto

PROBLEMA: Modificar NSS de colaborador incorrecto
SOLUCIÓN: Acceder a Listado de Personal > Buscar colaborador por nombre o RFC > Editar registro > Modificar campo NSS > Guardar cambios. Verificar que el NSS tenga el formato correcto (11 dígitos).
GRAVEDAD: Medio

PROBLEMA: Se cargó un documento de un colaborador que no correspondía al trabajador por error
SOLUCIÓN: Acceder al módulo de Listado de Personal > Buscar al colaborador afectado > Eliminar el documento incorrecto > Cargar el documento correcto > Verificar que corresponda al colaborador indicado.
GRAVEDAD: Medio

PROBLEMA: No se visualiza información del proveedor en el sistema
SOLUCIÓN: Verificar que el procedimiento esté cargado correctamente en el sistema. Sincronizar datos si es necesario. Revisar permisos del usuario para visualizar la información.
GRAVEDAD: Bajo

PROBLEMA: Error al cargar documentos en Listado de Personal
SOLUCIÓN: Verificar formato del archivo (PDF, JPG permitidos). Verificar tamaño máximo permitido. Limpiar caché del navegador e intentar de nuevo.
GRAVEDAD: Medio

=== MÓDULO ON BOARDING ===

PROBLEMA: Realicé el examen con respuestas correctas y me dan resultado negativo
SOLUCIÓN: El usuario reporta resultado negativo en examen a pesar de haber contestado correctamente. Verificar respuestas en el sistema, puede ser error de percepción del usuario o problema técnico. Revisar logs del examen.
GRAVEDAD: Medio

PROBLEMA: Rebasé el número de intentos en el curso
SOLUCIÓN: Según política de la empresa, el usuario debe esperar 6 meses para poder reintentar el curso. No es posible habilitar intentos adicionales antes de ese período.
GRAVEDAD: Bajo

PROBLEMA: No puede acceder al curso de capacitación
SOLUCIÓN: Verificar que el usuario esté registrado correctamente en el sistema. Verificar permisos asignados. Verificar que el curso esté activo y disponible.
GRAVEDAD: Medio

PROBLEMA: Solicitud de habilitación de curso antes de tiempo
SOLUCIÓN: Informar al usuario que debe esperar el período establecido (6 meses). No se pueden hacer excepciones según política.
GRAVEDAD: Bajo

=== PROBLEMAS DE ACCESO ===

PROBLEMA: No llegan los correos a mi cuenta / No recibo notificaciones
SOLUCIÓN: 1) Verificar carpeta de Spam/Correo no deseado. 2) Confirmar que la dirección de correo registrada sea correcta. 3) Si es correo corporativo, verificar con el área de TI que no haya filtros bloqueando. 4) Solicitar reenvío manual si es necesario.
GRAVEDAD: Medio

PROBLEMA: No puedo acceder a la plataforma / Usuario bloqueado
SOLUCIÓN: Restablecer contraseña desde la opción "Olvidé mi contraseña". Si no funciona, verificar que el correo registrado sea correcto. Contactar al administrador para desbloquear cuenta si es necesario.
GRAVEDAD: Alto

PROBLEMA: Error de credenciales al iniciar sesión
SOLUCIÓN: Verificar que el usuario esté escribiendo correctamente su correo y contraseña. Probar con restablecimiento de contraseña. Verificar que la cuenta esté activa en el sistema.
GRAVEDAD: Medio

=== SOLICITUDES DE EDICIÓN ===

PROBLEMA: Necesito modificar información de un registro
SOLUCIÓN: Acceder al módulo correspondiente > Buscar el registro > Editar > Realizar modificaciones > Guardar. Verificar permisos del usuario para edición.
GRAVEDAD: Bajo

PROBLEMA: Eliminar registro duplicado
SOLUCIÓN: Identificar el registro duplicado > Verificar cuál es el correcto > Eliminar el incorrecto > Verificar que no haya afectaciones en otros módulos relacionados.
GRAVEDAD: Medio

=== PROBLEMAS TÉCNICOS ===

PROBLEMA: La plataforma está muy lenta
SOLUCIÓN: Limpiar caché del navegador. Probar con otro navegador. Verificar conexión a internet. Si el problema persiste para múltiples usuarios, escalar a soporte de infraestructura.
GRAVEDAD: Medio

PROBLEMA: Error al guardar cambios en el sistema
SOLUCIÓN: Verificar que todos los campos obligatorios estén completos. Verificar formato de datos ingresados. Limpiar caché e intentar de nuevo. Si persiste, reportar el error específico.
GRAVEDAD: Alto
`;

export default function AIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! Soy el Gestor de Incidencias de TI para KOF. Puedo ayudarte a resolver problemas basándome en el historial de tickets resueltos.\n\n¿Cuál es tu incidencia?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const fullPrompt = `${SYSTEM_INSTRUCTIONS}

${KNOWLEDGE_BASE}

---
CONSULTA DEL USUARIO: ${userMessage}

Responde siguiendo el formato especificado (Diagnóstico, Solución sugerida, Nivel de gravedad, Fuente).`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            }
          })
        }
      );

      const data = await response.json();

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const aiResponse = data.candidates[0].content.parts[0].text;
        setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
      } else {
        throw new Error('No response from AI');
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu consulta. Por favor intenta de nuevo.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: '¡Hola! Soy el Gestor de Incidencias de TI para KOF. Puedo ayudarte a resolver problemas basándome en el historial de tickets resueltos.\n\n¿Cuál es tu incidencia?'
    }]);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <h2 style={{ margin: 0 }}>🤖 Gestor de Incidencias IA - KOF</h2>
        <button
          onClick={clearChat}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🗑️ Limpiar chat
        </button>
      </div>

      {/* Indicador de base de conocimientos */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: '#d4edda',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        ✅ Base de conocimientos cargada (353 tickets históricos de Smartsheet)
      </div>

      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        height: '450px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f8f9fa'
      }}>
        {/* Mensajes */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px'
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '12px'
              }}
            >
              <div style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: msg.role === 'user' ? '#007bff' : 'white',
                color: msg.role === 'user' ? 'white' : '#333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5'
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    marginBottom: '6px',
                    fontWeight: 'bold'
                  }}>
                    🤖 Gestor IA
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: 'bold' }}>
                  🤖 Gestor IA
                </div>
                <span style={{ color: '#666' }}>🔍 Buscando en base de conocimientos...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid #ddd',
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px'
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe tu incidencia o problema..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                resize: 'none',
                height: '50px',
                fontFamily: 'inherit',
                fontSize: '14px'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                padding: '12px 24px',
                backgroundColor: loading || !input.trim() ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: '20px',
        padding: '16px',
        backgroundColor: '#e7f3ff',
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <strong>💡 Ejemplos de consultas:</strong>
        <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
          <li>No puedo acceder a la plataforma, me sale error en el servidor</li>
          <li>¿Cómo modifico el NSS de un colaborador en TAR?</li>
          <li>El usuario no recibe los correos de notificación</li>
          <li>Error al cargar documentos en el módulo de Listado de Personal</li>
        </ul>
      </div>
    </div>
  );
}
