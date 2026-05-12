import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, CheckCircle2, AlertTriangle, Sparkles, Clock, X, Smile, Paperclip, Calendar, FileText, FileImage, FileAudio, FileVideo } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { RepairOrder } from '../types';

interface Message {
  id: string;
  sender: 'client' | 'seller' | 'system';
  text: string;
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

interface WhatsAppVisualizerProps {
  lead: RepairOrder | null;
  onClose: () => void;
  onSendMessage?: (text: string) => void;
  embedded?: boolean;
  allLeads?: any[];
  onSelectLead?: (lead: any) => void;
}

export const WhatsAppVisualizer: React.FC<WhatsAppVisualizerProps> = ({ lead, onClose, onSendMessage, embedded, allLeads, onSelectLead }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TEMPLATES = [
    "¡Hola! Gracias por contactarnos. ¿En qué podemos ayudarte hoy?",
    "Tu equipo ya está diagnosticado. El costo de reparación sería: $",
    "¡Excelente noticia! Tu equipo está listo para ser recogido.",
    "¿Podemos agendar una cita para revisar tu equipo?",
  ];

  // Initialize chat based on lead info
  useEffect(() => {
    if (!lead) return;
    const issueText = lead.deviceIssue || 'Interesado en cotización de equipo/reparación.';
    
    // Create an initial interaction representing the CRM record
    const baseInteraction: Message[] = [
      {
        id: 'msg-1',
        sender: 'system',
        text: `Prospecto registrado en CRM por: ${issueText}`,
        timestamp: new Date(lead.createdAt || Date.now()),
      }
    ];

    const history = lead.metadata?.whatsappHistory || [];
    
    // Parse the history to ensure valid Date objects
    const parsedHistory: Message[] = history.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));

    setMessages([...baseInteraction, ...parsedHistory]);
  }, [lead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'seller',
      text: inputText,
      timestamp: new Date(),
      status: 'sent'
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    
    if (onSendMessage) {
      onSendMessage(newMsg.text);
    }
  };

  const handleAiSuggestion = (suggestion: string) => {
    setInputText(suggestion);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const [isAiThinking, setIsAiThinking] = useState(false);
  const [dynamicAiSuggestion, setDynamicAiSuggestion] = useState<string | null>(null);

  const generateDynamicAiSuggestion = async () => {
    setIsAiThinking(true);
    setDynamicAiSuggestion(null);
    try {
      // Build minimal chat history for context
      const chatHistory = messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');
      
      const prompt = `
      Eres un asistente experto de ventas en un taller de reparaciones de celulares y venta de equipos.
      Contexto del cliente:
      - Nombre: ${lead?.customer?.name || 'Cliente'}
      - Modelo de Interés / Equipo Reparación: ${lead?.deviceModel || 'General'}
      - Tipo de orden: ${lead?.orderType || 'Desconocido'}

      Historial de chat reciente:
      ${chatHistory}

      Tu tarea es escribir EXACTAMENTE el próximo mensaje que el vendedor (SELLER) debería enviar.
      El mensaje debe ser cortés, persuasivo, corto (menos de 250 caracteres), y estar enfocado en cerrar la venta, agendar cita o brindar excelente servicio.
      No incluyas el prefijo "SELLER:", genera únicamente el texto del mensaje listo para enviarse.
      `;

      const res = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 0.7 }
        })
      });

      const data = await res.json();
      if (data.text) {
        setDynamicAiSuggestion(data.text);
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Determine AI insights based on the conversation state
  const getAiAnalysis = () => {
    const sellerMessages = messages.filter(m => m.sender === 'seller');
    const clientMessages = messages.filter(m => m.sender === 'client');
    const lastMessage = messages[messages.length - 1];

    let sentiment = { type: 'positive', text: 'Conversación fluyendo. ¡Buen ritmo!' };
    let suggestion = '¿Deseas completar la venta con algún accesorio adicional?';

    if (lastMessage?.sender === 'client') {
      sentiment = { type: 'warning', text: 'El cliente está esperando respuesta activo.' };
      suggestion = `¡Claro! El ${lead.deviceModel || 'equipo'} tiene un precio excelente y con financiamiento te lo llevas en cuotas súper cómodas. ¿Te preparo una corrida de pagos?`;
    } else if (sellerMessages.length > 0 && clientMessages.length > 0) {
      sentiment = { type: 'positive', text: 'Interés detectado en métodos de pago.' };
      suggestion = `Podemos dividir el pago en 3 cuotas sin intereses. ¿Te envío el link de pre-aprobación?`;
    }

    return { sentiment, suggestion };
  };

  const aiInsight = getAiAnalysis();

  if (!lead) {
      return (
          <div className={`flex w-full h-full bg-white border border-slate-200 rounded-3xl overflow-hidden ${embedded ? '' : 'fixed inset-0 z-50 p-4 bg-slate-900/50 backdrop-blur-sm'}`}>
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <Bot className="w-16 h-16 mb-4 text-slate-300" />
                  <p>Selecciona un chat en la sección de Clientes o Prospectos para comenzar a conversar.</p>
              </div>
          </div>
      )
  }

  return (
    <div className={embedded ? "w-full h-full flex rounded-2xl shadow-sm border border-slate-200 overflow-hidden" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"} onClick={!embedded ? onClose : undefined}>
      <div className={embedded ? "w-full h-full flex" : "bg-slate-50 w-full max-w-6xl h-[85vh] rounded-3xl shadow-2xl flex overflow-hidden border border-slate-200"} onClick={e => e.stopPropagation()}>
        
        {embedded && allLeads && (
          <div className="w-1/3 bg-white border-r border-slate-200 flex flex-col">
            <div className="p-4 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="font-black text-xl text-slate-800">Chats</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allLeads.map(l => (
                <div 
                  key={l.id} 
                  onClick={() => onSelectLead?.(l)}
                  className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition flex items-center gap-3 ${lead.id === l.id ? 'bg-indigo-50 border-indigo-100' : ''}`}
                >
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex shrink-0 items-center justify-center overflow-hidden">
                    {(l.customer as any)?.metadata?.waProfilePic ? (
                       <img src={(l.customer as any)?.metadata?.waProfilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                       <User className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-bold text-sm text-slate-800 truncate">{l.customer?.name || l.id}</p>
                    <p className="text-xs text-slate-500 truncate">{l.customer?.phone || 'Sin número'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center/Left Column: WhatsApp Chat UI */}
        <div className="flex-1 flex flex-col border-r border-slate-200 bg-[#efeae2]">
          {/* Header */}
          <div className="h-16 bg-[#f0f2f5] border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center overflow-hidden">
                {(lead.customer as any)?.metadata?.waProfilePic ? (
                   <img src={(lead.customer as any)?.metadata?.waProfilePic} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                   <User className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{lead.customer?.name || 'Cliente'}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  En línea • {lead.customer?.phone || 'Sin número'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
               <button className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition">
                  <Clock className="w-5 h-5" />
               </button>
            </div>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}>
            <div className="flex justify-center mb-4">
              <span className="bg-[#fff3c4] text-[#A67C00] text-[11px] px-3 py-1 rounded-lg shadow-sm">
                Chat vinculado al caso #{lead.id?.slice(0, 5).toUpperCase() || 'NEW'}
              </span>
            </div>

            {messages.map((msg) => {
              const isSeller = msg.sender === 'seller';
              const isSystem = msg.sender === 'system';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="bg-slate-800/80 text-white text-xs px-3 py-1 rounded-xl shadow-sm backdrop-blur-sm flex items-center gap-1">
                      <Bot className="w-3 h-3" />
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex ${isSeller ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative ${isSeller ? 'bg-[#d9fdd3] text-gray-800 rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                    <div className="text-sm">
                      {msg.mediaUrl && msg.mediaType === 'image' && (
                        <div className="mb-2">
                           <img src={msg.mediaUrl} alt="Adjunto" className="max-w-full rounded-xl" style={{ maxHeight: '250px' }} />
                        </div>
                      )}
                      {msg.mediaUrl && msg.mediaType === 'video' && (
                        <div className="mb-2">
                           <video src={msg.mediaUrl} controls className="max-w-full rounded-xl" style={{ maxHeight: '250px' }} />
                        </div>
                      )}
                      {msg.mediaUrl && msg.mediaType === 'audio' && (
                        <div className="mb-2 w-64 max-w-full">
                           <audio src={msg.mediaUrl} controls className="w-full h-10" />
                        </div>
                      )}
                      <p>{msg.text}</p>
                    </div>
                    <div className="flex justify-end items-center gap-1 mt-1 -mb-1">
                      <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
                      {isSeller && msg.status === 'failed' && (
                        <span className="text-[10px] text-red-500 font-bold ml-1">Fallo al enviar</span>
                      )}
                      {isSeller && msg.status !== 'failed' && (
                        <CheckCircle2 className={`w-3 h-3 ${msg.status === 'read' ? 'text-blue-500' : 'text-gray-400'}`} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Extra interactions area */}
          <div className="bg-[#f0f2f5] px-4 py-2 border-t border-slate-200 flex items-center justify-between relative">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowTemplates(false);
                  setShowAttachMenu(false);
                }}
                className="text-slate-500 hover:text-slate-700 transition"
              >
                <Smile className="w-6 h-6" />
              </button>
              
              <button 
                onClick={() => {
                  setShowAttachMenu(!showAttachMenu);
                  setShowEmojiPicker(false);
                  setShowTemplates(false);
                }}
                className="text-slate-500 hover:text-slate-700 transition"
              >
                <Paperclip className="w-6 h-6" />
              </button>

              <button 
                onClick={() => {
                  setShowTemplates(!showTemplates);
                  setShowEmojiPicker(false);
                  setShowAttachMenu(false);
                }}
                className="text-slate-500 hover:text-slate-700 transition"
                title="Respuestas Rápidas"
              >
                <FileText className="w-5 h-5 shadow-sm bg-white rounded-full p-0.5 border" />
              </button>
            </div>
            
            <button 
              onClick={() => setShowAppointmentModal(true)}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 flex items-center gap-1 transition"
            >
              <Calendar className="w-4 h-4" /> Agendar Cita
            </button>

            {/* Float menus */}
            {showEmojiPicker && (
              <div className="absolute bottom-16 left-2 z-50 shadow-2xl rounded-xl">
                 <EmojiPicker onEmojiClick={(em) => setInputText(prev => prev + em.emoji)} width={300} height={400} />
              </div>
            )}

            {showTemplates && (
              <div className="absolute bottom-16 left-12 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                 <div className="bg-slate-50 p-3 border-b flex justify-between items-center">
                    <span className="font-bold text-slate-700 text-sm">Respuestas Rápidas</span>
                    <button onClick={() => setShowTemplates(false)}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                 </div>
                 <div className="max-h-64 overflow-y-auto p-2">
                    {TEMPLATES.map((tmpl, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          setInputText(tmpl);
                          setShowTemplates(false);
                        }}
                        className="w-full text-left p-3 hover:bg-blue-50 rounded-xl text-sm text-slate-700 transition border-b border-slate-50 last:border-0"
                      >
                        {tmpl}
                      </button>
                    ))}
                 </div>
              </div>
            )}

            {showAttachMenu && (
              <div className="absolute bottom-16 left-12 z-50 bg-white rounded-2xl shadow-xl flex flex-col p-2 gap-2 border border-slate-200">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,audio/*,application/pdf" onChange={(e) => {
                     const file = e.target.files?.[0];
                     if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const base64 = event.target?.result as string;
                          if (onSendMessage) {
                             // Send a special payload through onSendMessage, or we need a new prop `onSendMedia`
                             // We don't have onSendMedia yet, let's modify onSendMessage signature or pass a JSON string if it's a media
                             // For simplicity on the parent, let's assume onSendMessage will handle a text or a JSON string if it starts with { "media": ... }
                             // But it's better to add an optional `onSendMedia` prop.
                             const mediaPayload = JSON.stringify({ type: 'media', base64, mimetype: file.type, fileName: file.name });
                             onSendMessage(mediaPayload);
                             
                             const newMsg: Message = {
                               id: Date.now().toString(),
                               sender: 'seller',
                               text: `📎 Archivo adjunto: ${file.name}`,
                               timestamp: new Date(),
                               status: 'sent'
                             };
                             setMessages(prev => [...prev, newMsg]);
                          }
                        };
                        reader.readAsDataURL(file);
                     }
                     setShowAttachMenu(false);
                  }} />
                  <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="p-3 rounded-xl hover:bg-blue-50 flex items-center gap-3 text-sm font-medium text-slate-700 transition">
                     <div className="bg-blue-100 text-blue-600 p-2 rounded-full"><FileImage className="w-5 h-5" /></div> Fotos y Videos
                  </button>
                  <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="p-3 rounded-xl hover:bg-red-50 flex items-center gap-3 text-sm font-medium text-slate-700 transition">
                     <div className="bg-red-100 text-red-600 p-2 rounded-full"><FileAudio className="w-5 h-5" /></div> Nota de Voz / Audio
                  </button>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#f0f2f5] flex items-end gap-2 pb-5">
            <textarea
              className="flex-1 bg-white border-none rounded-xl p-3 max-h-32 min-h-[44px] shadow-sm resize-none focus:ring-0 outline-none"
              placeholder="Escribe un mensaje..."
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button 
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="w-11 h-11 bg-teal-600 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-teal-700 disabled:opacity-50 transition shadow-sm"
            >
              <Send className="w-5 h-5 ml-1" />
            </button>
          </div>
        </div>

        {/* Right Column: AI Sales Assistant & Idealization */}
        <div className="w-[320px] flex flex-col bg-white border-l border-slate-200">
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-600" />
              Copiloto de Ventas
            </h3>
            {!embedded && (
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Live Conversation Sentiment */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Análisis en Vivo</h4>
              <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                aiInsight.sentiment.type === 'positive' 
                  ? 'bg-green-50 border-green-100 text-green-900' 
                  : 'bg-orange-50 border-orange-100 text-orange-900'
              }`}>
                {aiInsight.sentiment.type === 'positive' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">{aiInsight.sentiment.text}</p>
                  {aiInsight.sentiment.type === 'warning' && (
                    <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md">Atención Requerida</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Promoted Action / Ideal Reply */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                 Respuesta Especializada <Sparkles className="w-3 h-3 text-indigo-500" />
              </h4>

              <div className="flex gap-2 mb-3">
                  <button 
                     onClick={generateDynamicAiSuggestion}
                     disabled={isAiThinking}
                     className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                     {isAiThinking ? <Clock className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                     {isAiThinking ? 'Generando...' : 'Generar con IA (GPT)'}
                  </button>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100 rounded-2xl p-4 cursor-pointer hover:shadow-md transition relative group overflow-hidden"
                   onClick={() => handleAiSuggestion(dynamicAiSuggestion || aiInsight.suggestion)}>
                <div className="absolute inset-0 bg-white/40 group-hover:bg-transparent transition"></div>
                <p className="text-sm text-indigo-900 font-medium relative z-10 italic">
                  "{dynamicAiSuggestion || aiInsight.suggestion}"
                </p>
                <div className="mt-3 flex justify-end relative z-10">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-md">Clic para usar</span>
                </div>
              </div>
            </div>

            {/* Data & Context for Salesperson */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contexto del Prospecto</h4>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm text-slate-700 space-y-2">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Equipo:</span>
                    <span className="font-semibold text-right">{lead.deviceModel || 'No especificado'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Motivo:</span>
                    <span className="font-semibold text-right">{lead.deviceIssue || 'Contacto Inicial'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Tiempo Asignado:</span>
                    <span className="font-semibold text-right">
                       {lead.metadata?.firstContactAt ? "Atendido" : "En Espera (Alerta)"}
                    </span>
                </div>
                <div>
                    <span className="block text-slate-500 mb-1">Estrategia recomendada:</span>
                    <span className="font-medium text-xs">Venta consultiva. El cliente busca financiamiento. Concéntrate en planes de pago y garantías extendidas para aumentar credibilidad.</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAppointmentModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm border border-slate-200" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4 text-slate-800">Agendar Cita</h3>
            <p className="text-sm text-slate-500 mb-4">Esta cita se agendará y se enviarán recordatorios a este cliente por WhatsApp 24 horas y 1 hora antes.</p>
            <div className="space-y-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha y Hora</label>
                  <input type="datetime-local" id="appointmentDate" className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
               </div>
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Motivo / Notas</label>
                  <input type="text" id="appointmentNotes" placeholder="Ej. Revisión de iPhone 13" className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
               </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
               <button onClick={() => setShowAppointmentModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200">Cancelar</button>
               <button onClick={() => {
                  const dateInput = document.getElementById('appointmentDate') as HTMLInputElement;
                  const notesInput = document.getElementById('appointmentNotes') as HTMLInputElement;
                  if (!dateInput?.value) return alert('Selecciona una fecha');
                  
                  const apDate = new Date(dateInput.value);
                  const friendlyDate = apDate.toLocaleDateString() + ' a las ' + apDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  // Send confirmation to client
                  const confirmMsg = `¡Cita agendada! 🗓️ Hemos agendado tu cita para revisión el día ${friendlyDate}. Te enviaremos un recordatorio. Motivo: ${notesInput?.value || 'Revisión'}`;
                  
                  if (onSendMessage) onSendMessage(confirmMsg);
                  
                  const newMsg: Message = {
                     id: Date.now().toString(),
                     sender: 'system',
                     text: `✅ Cita programada para: ${friendlyDate}`,
                     timestamp: new Date()
                  };
                  setMessages(prev => [...prev, newMsg]);

                  // Wait, how do we handle the backend reminders? Let's send a post request to save the appointment schedule
                  if (lead) {
                      fetch('/api/appointments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                             orderId: lead.id,
                             phone: lead.customer?.phone,
                             date: apDate.toISOString(),
                             notes: notesInput?.value
                          })
                      }).catch(console.error);
                  }

                  setShowAppointmentModal(false);
               }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Guardar Cita</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
