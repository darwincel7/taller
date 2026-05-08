import React, { useState, useEffect, useRef } from 'react';
import { getWhatsAppConversations, getWhatsAppMessages, sendCrmWhatsAppMessage } from '../services/whatsappService';
import { supabase } from '../services/supabase';
import { Send, User, MessageCircle, Clock, CheckCircle2, AlertCircle, Link as LinkIcon, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const WhatsAppInbox: React.FC = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      setError(null);
      const data = await getWhatsAppConversations();
      setConversations(data);
    } catch (err: any) {
      if (err.message !== 'Failed to fetch') {
        console.error('Error fetching conversations:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const data = await getWhatsAppMessages(convId);
      setMessages(data);
      await fetch(`/api/whatsapp/conversations/${convId}/read`, { method: 'POST' });
      fetchConversations(); 
    } catch (err: any) {
      if (err.message !== 'Failed to fetch') {
        console.error('Error fetching messages:', err);
      }
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000); // Polling every 10s as fallback
    
    const realtimeSub = supabase.channel('whatsapp_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, (payload) => {
        console.log('Conversations changed', payload);
        fetchConversations();
      })
      .subscribe();
      
    return () => {
      clearInterval(interval);
      supabase.removeChannel(realtimeSub);
    };
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
      const interval = setInterval(() => fetchMessages(activeConversationId), 5000); // Polling messages as fallback
      
      const messagesSub = supabase.channel(`whatsapp_messages_${activeConversationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${activeConversationId}` }, (payload) => {
          console.log('New message inserted', payload);
          fetchMessages(activeConversationId);
        })
        .subscribe();
        
      return () => {
        clearInterval(interval);
        supabase.removeChannel(messagesSub);
      };
    }
  }, [activeConversationId]);

  const filteredConversations = conversations.filter(c => 
    c.phone?.includes(searchQuery) || c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeConv = conversations.find(c => c.id === activeConversationId);

  const handleSend = async () => {
    if (!inputText.trim() || !activeConv) return;
    
    const text = inputText;
    setInputText('');
    
    const tempId = `temp-${Date.now()}`;
    const newMsg = {
      id: tempId,
      text,
      direction: 'outbound',
      status: 'sending', // optimistic UI
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);

    try {
      await sendCrmWhatsAppMessage({
        phone: activeConv.phone,
        text
      });
      // Update state to sent
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));
    } catch (error) {
      console.error('Error sending message:', error);
      // Update state to failed
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const handleLinkOrder = async () => {
    const orderId = prompt('Ingresa el ID de la orden para vincularla a este chat:');
    if (orderId && activeConversationId) {
      try {
        await fetch(`/api/whatsapp/conversations/${activeConversationId}/link-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId })
        });
        alert('Orden vinculada exitosamente');
        fetchConversations();
      } catch (err) {
        alert('Error al vincular orden');
      }
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
          <div className="mt-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por número o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-green-500 transition-all outline-none"
            />
          </div>
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
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-slate-400">No se encontraron conversaciones</div>
          ) : (
            filteredConversations.map(conv => (
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
                  {activeConv.customer_name ? `${activeConv.customer_name} • ` : ''}Status: {activeConv.status}
                </p>
              </div>
              <div className="ml-auto">
                {activeConv.linked_order_id ? (
                  <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    Orden: {activeConv.linked_order_id}
                  </span>
                ) : (
                  <button 
                    onClick={handleLinkOrder}
                    className="text-xs font-bold bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    Vincular Orden
                  </button>
                )}
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
                        {isOutbound && (
                          <div className="flex items-center">
                            {msg.status === 'sending' ? (
                              <Clock className="w-3 h-3 text-slate-400 ml-1" />
                            ) : msg.status === 'failed' ? (
                              <AlertCircle className="w-3 h-3 text-red-500 ml-1" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-green-500 ml-1" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
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
