import React, { useState, useEffect } from 'react';
import { getWhatsAppConversations, getWhatsAppMessages, sendCrmWhatsAppMessage } from '../services/whatsappService';
import { Send, User, MessageCircle, Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const WhatsAppInbox: React.FC = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const fetchConversations = async () => {
    try {
      setError(null);
      const data = await getWhatsAppConversations();
      setConversations(data);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const data = await getWhatsAppMessages(convId);
      setMessages(data);
      // mark as read
      await fetch(`/api/whatsapp/conversations/${convId}/read`, { method: 'POST' });
      fetchConversations(); // update unread count
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      // setError(err.message);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000); // Polling every 5s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      const interval = setInterval(() => fetchMessages(activeConversationId), 3000); // Polling messages
      return () => clearInterval(interval);
    }
  }, [activeConversationId]);

  const activeConv = conversations.find(c => c.id === activeConversationId);

  const handleSend = async () => {
    if (!inputText.trim() || !activeConv) return;
    try {
      const text = inputText;
      setInputText('');
      
      const newMsg = {
        id: Date.now().toString(),
        text,
        direction: 'outbound',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);

      await sendCrmWhatsAppMessage({
        phone: activeConv.phone,
        text
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="flex bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 h-[calc(100vh-180px)]">
      {/* Left panel */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            Bandeja WhatsApp
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-slate-400">Cargando...</div>
          ) : error ? (
            <div className="p-6 m-4 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-red-600 font-bold mb-2">Error de Base de Datos</p>
              <p className="text-sm text-red-500 mb-4">{error}</p>
              <a href="/setup_wa_tables.sql" target="_blank" className="text-sm bg-red-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-600">
                Ver SQL necesario
              </a>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-slate-400">No hay conversaciones</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition hover:bg-white flex items-start gap-4 ${activeConversationId === conv.id ? 'bg-white border-l-4 border-l-green-500' : ''}`}
              >
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-500">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-sm text-slate-800 truncate">{conv.phone}</h3>
                    {conv.last_message_at && (
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {format(new Date(conv.last_message_at), 'hh:mm a')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 truncate">{conv.last_message || 'Sin mensaje'}</p>
                </div>
                {conv.unread_count > 0 && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {conv.unread_count}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col bg-white">
        {activeConv ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{activeConv.phone}</h3>
                <p className="text-xs text-slate-500">
                  Status: {activeConv.status}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map(msg => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl p-3 ${isOutbound ? 'bg-green-100 text-green-900 rounded-tr-sm' : 'bg-white shadow-sm border border-slate-100 text-slate-800 rounded-tl-sm'}`}>
                      {msg.media_url ? (
                        msg.media_type === 'image' ? (
                           <img src={msg.media_url} alt="Media" className="rounded-lg mb-2 max-w-xs cursor-pointer hover:opacity-90 transition"/>
                        ) : (
                           <div className="bg-white/50 p-2 rounded mb-2 border border-slate-200 flex items-center gap-2">
                             <a href={msg.media_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 underline">📎 Archivo adjunto ({msg.media_type})</a>
                           </div>
                        )
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-slate-400">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                        {isOutbound && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 p-3 bg-slate-100 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 text-white rounded-xl transition flex items-center justify-center"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <MessageCircle className="w-16 h-16 mb-4 text-slate-300" />
            <p>Selecciona una conversación para empezar a chatear</p>
          </div>
        )}
      </div>
    </div>
  );
};
