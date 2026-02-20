import { useState, useRef, useEffect } from 'react';

// API Keys - DEBEN configurarse en variables de entorno
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';

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

const KNOWLEDGE_BASE = `
BASE DE CONOCIMIENTOS - TICKETS RESUELTOS HISTÓRICOS:

=== MÓDULO TAR ===
PROBLEMA: Error al acceder a la plataforma / Error en el servidor
SOLUCIÓN: Verificar estado del servidor, limpiar caché del navegador, verificar credenciales. Si persiste, escalar a soporte de infraestructura.

PROBLEMA: Modificar NSS de colaborador
SOLUCIÓN: Listado de Personal > Buscar colaborador > Editar > Modificar NSS > Guardar. Verificar formato (11 dígitos).

PROBLEMA: Documento cargado incorrectamente
SOLUCIÓN: Eliminar documento incorrecto > Cargar correcto > Verificar colaborador.

=== MÓDULO ON BOARDING ===
PROBLEMA: Examen con resultado negativo
SOLUCIÓN: Verificar respuestas en sistema, puede ser error de percepción o técnico.

PROBLEMA: Rebasó intentos en curso
SOLUCIÓN: Usuario debe esperar 6 meses según política.

=== PROBLEMAS GENERALES ===
PROBLEMA: No llegan correos
SOLUCIÓN: Verificar spam, confirmar dirección correcta, solicitar reenvío manual.

PROBLEMA: No puedo acceder / Usuario bloqueado
SOLUCIÓN: Restablecer contraseña, verificar correo, contactar administrador.

PROBLEMA: Plataforma lenta
SOLUCIÓN: Limpiar caché, probar otro navegador, verificar conexión.
`;

const SUGGESTIONS = [
  "No puedo acceder a la plataforma, me sale error en el servidor",
  "¿Cómo modifico el NSS de un colaborador en TAR?",
  "El usuario no recibe los correos de notificación",
  "Error al cargar documentos en Listado de Personal",
  "Rebasé el número de intentos en el curso de ON Boarding",
  "La plataforma está muy lenta",
  "No se visualiza la información del proveedor",
  "¿Cómo elimino un documento cargado por error?"
];

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! Soy el asistente de TI. ¿En qué puedo ayudarte?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ x: null, y: null });
  const [size, setSize] = useState({ width: 380, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const messagesEndRef = useRef(null);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ width: 0, height: 0, x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.chat-header') && !e.target.closest('.header-btn')) {
      setIsDragging(true);
      const rect = dragRef.current.getBoundingClientRect();
      offsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && dragRef.current) {
      const newX = e.clientX - offsetRef.current.x;
      const newY = e.clientY - offsetRef.current.y;
      setPosition({ x: newX, y: newY });
    }
    if (isResizing) {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      const newWidth = Math.max(320, Math.min(900, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(400, Math.min(850, resizeStartRef.current.height + deltaY));
      setSize({ width: newWidth, height: newHeight });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      width: size.width,
      height: size.height,
      x: e.clientX,
      y: e.clientY
    };
  };

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);

  const sendMessage = async (messageText = null) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || loading) return;

    setInput('');
    setShowHelp(false);
    setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setLoading(true);

    try {
      // Verificar que hay API key configurada
      if (!GEMINI_API_KEY) {
        throw new Error('API key de Gemini no configurada. Contacta al administrador.');
      }

      const fullPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${KNOWLEDGE_BASE}\n\n---\nCONSULTA: ${textToSend}\n\nResponde de forma concisa.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
          })
        }
      );

      const data = await response.json();

      // Verificar si hay error en la respuesta
      if (data.error) {
        console.error('Gemini API Error:', data.error);
        throw new Error(data.error.message || 'Error de API');
      }

      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.candidates[0].content.parts[0].text }]);
      } else {
        console.error('Unexpected response:', data);
        throw new Error('Respuesta vacía');
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Error: ${error.message || 'No se pudo conectar'}. Intenta de nuevo.`
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

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const useSuggestion = (text) => {
    setInput(text);
    setShowHelp(false);
  };

  const chatStyle = {
    position: 'fixed',
    bottom: position.y !== null ? 'auto' : '100px',
    right: position.x !== null ? 'auto' : '30px',
    top: position.y !== null ? position.y : 'auto',
    left: position.x !== null ? position.x : 'auto',
    width: size.width,
    height: size.height,
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    display: isOpen ? 'flex' : 'none',
    flexDirection: 'column',
    zIndex: 10001,
    overflow: 'hidden',
    resize: 'none'
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: isOpen ? '#dc3545' : '#007bff',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 10002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          transition: 'all 0.3s ease'
        }}
        title={isOpen ? 'Cerrar chat' : 'Abrir asistente IA'}
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat Window */}
      <div ref={dragRef} style={chatStyle} onMouseDown={handleMouseDown}>
        {/* Header */}
        <div
          className="chat-header"
          style={{
            padding: '12px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            cursor: 'move',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🤖</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Asistente IA</div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>Gestor de Incidencias</div>
            </div>
          </div>
          <button
            className="header-btn"
            onClick={() => setShowHelp(!showHelp)}
            style={{
              background: showHelp ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'background 0.2s'
            }}
            title="Sugerencias de preguntas"
          >
            ❓
          </button>
        </div>

        {/* Help Panel */}
        {showHelp && (
          <div style={{
            position: 'absolute',
            top: '56px',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            borderBottom: '1px solid #eee',
            padding: '12px',
            zIndex: 10,
            maxHeight: '250px',
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', color: '#666' }}>
              💡 Sugerencias de preguntas:
            </div>
            {SUGGESTIONS.map((suggestion, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  marginBottom: '6px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#e9ecef'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#f8f9fa'}
              >
                <span
                  style={{ flex: 1 }}
                  onClick={() => useSuggestion(suggestion)}
                >
                  {suggestion}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(suggestion, idx);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '14px',
                    opacity: 0.6
                  }}
                  title="Copiar"
                >
                  {copiedIndex === idx ? '✓' : '📋'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    sendMessage(suggestion);
                  }}
                  style={{
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: '11px'
                  }}
                  title="Enviar"
                >
                  Usar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#f5f5f5'
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '10px'
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.role === 'user' ? '#007bff' : 'white',
                color: msg.role === 'user' ? 'white' : '#333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                whiteSpace: 'pre-wrap',
                fontSize: '14px',
                lineHeight: '1.4'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                backgroundColor: 'white',
                color: '#666',
                fontSize: '14px'
              }}>
                ⏳ Buscando solución...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 40px 12px 12px',
          borderTop: '1px solid #eee',
          backgroundColor: 'white',
          display: 'flex',
          gap: '8px'
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escribe tu consulta..."
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '20px',
              border: '1px solid #ddd',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: '20px',
              backgroundColor: loading || !input.trim() ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            ➤
          </button>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '28px',
            height: '28px',
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#007bff',
            color: 'white',
            fontSize: '14px',
            userSelect: 'none',
            borderRadius: '8px 0 16px 0',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
          title="Arrastrar para redimensionar"
        >
          ⇲
        </div>
      </div>
    </>
  );
}
