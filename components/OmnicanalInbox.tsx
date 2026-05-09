import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { supabase } from '../services/supabase';
import { Send, User, MessageCircle, Clock, CheckCircle2, AlertCircle, Link as LinkIcon, Search, Image as ImageIcon, File, Mic, Phone, Instagram, Facebook, HelpCircle, Bot } from 'lucide-react';
import { format } from 'date-fns';

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';

const ChannelIcon = ({ channel, className }: { channel: Channel, className?: string }) => {
  switch (channel) {
    case 'whatsapp': return <Phone className={className} />;
    case 'instagram': return <Instagram className={className} />;
    case 'facebook': return <Facebook className={className} />;
    default: return <MessageCircle className={className} />;
  }
};

export const OmnicanalInbox: React.FC = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
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
      const res = await fetchWithAuth('/api/omnicanal/conversations');
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response from server");
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
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
      const res = await fetchWithAuth(`/api/omnicanal/conversations/${convId}/messages`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response from server");
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(data);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
    }
  };

  const fetchInsights = async (convId: string) => {
    try {
      const { data } = await supabase.from('crm_ai_insights').select('*').eq('conversation_id', convId).single();
      setInsights(data);
    } catch (err) {
      setInsights(null);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    
    const realtimeSub = supabase.channel('crm_conversations_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_conversations' }, () => {
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
      fetchInsights(activeConversationId);
      const interval = setInterval(() => fetchMessages(activeConversationId), 5000);
      
      const messagesSub = supabase.channel(`crm_messages_${activeConversationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages', filter: `conversation_id=eq.${activeConversationId}` }, () => {
          fetchMessages(activeConversationId);
          fetchInsights(activeConversationId);
        })
        .subscribe();
        
      return () => {
        clearInterval(interval);
        supabase.removeChannel(messagesSub);
      };
    } else {
      setInsights(null);
    }
  }, [activeConversationId]);

  const activeConv = conversations.find(c => c.id === activeConversationId);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !activeConv) return;
    
    const file = e.target.files[0];
    e.target.value = ''; // reset so the same file could be selected again
    
    // Determine type
    let msgType = 'image';
    if (file.type.startsWith('video/')) msgType = 'video';
    else if (file.type.startsWith('audio/')) msgType = 'audio';
    else if (!file.type.startsWith('image/')) msgType = 'document';

    // Convert to base64 for quick preview / upload mock
    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        
        const tempMsg = {
          id: `temp-${Date.now()}`,
          text: '',
          message_type: msgType,
          media_url: base64,
          direction: 'outbound',
          status: 'sending',
          created_at: new Date().toISOString(),
          channel: activeConv.active_channel
        };
        setMessages(prev => [...prev, tempMsg]);

        try {
          const res = await fetchWithAuth('/api/omnicanal/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              conversationId: activeConv.id, 
              text: '',
              mediaUrl: base64,
              mediaType: msgType
            })
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          
          setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent' } : m));
        } catch (error) {
          console.error('Error sending media:', error);
          setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
        }
    };
    reader.readAsDataURL(file);
  };

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64AudioMessage = reader.result as string;
          // Send audio message
          if (!activeConv) return;
          const tempMsg = {
            id: `temp-${Date.now()}`,
            text: '',
            message_type: 'audio',
            media_url: base64AudioMessage,
            direction: 'outbound',
            status: 'sending',
            created_at: new Date().toISOString(),
            channel: activeConv.active_channel
          };
          setMessages(prev => [...prev, tempMsg]);

          try {
            const res = await fetchWithAuth('/api/omnicanal/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                conversationId: activeConv.id, 
                text: '',
                mediaUrl: base64AudioMessage,
                mediaType: 'audio'
              })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent' } : m));
          } catch (error) {
            console.error('Error sending audio:', error);
            setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
          }
        };
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !activeConv) return;
    
    const text = inputText;
    setInputText('');
    
    const tempMsg = {
      id: `temp-${Date.now()}`,
      text,
      direction: 'outbound',
      status: 'sending',
      created_at: new Date().toISOString(),
      channel: activeConv.active_channel
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetchWithAuth('/api/omnicanal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, text })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent' } : m));
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
    }
  };

  const filteredConversations = conversations.filter(c => {
    const searchMatch = (c.crm_contacts?.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (c.crm_contacts?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (c.crm_contacts?.primary_phone || '').includes(searchQuery);
    return searchMatch;
  });

  return (
    <div className="flex bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 h-full">
      {/* Left panel - Inbox List */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50 min-w-[300px]">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-500" />
            Bandeja Omnicanal
          </h2>
          <div className="mt-3 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
             <div className="p-4 text-center text-slate-400">Cargando...</div>
          ) : error ? (
             <div className="p-4 m-4 bg-red-50 text-red-600 rounded-xl text-sm">Error: {error}</div>
          ) : filteredConversations.length === 0 ? (
             <div className="p-4 text-center text-slate-400 text-sm">No hay conversaciones omnicanal. Asegúrate de haber ejecutado setup_omnicanal_tables.sql y procesado eventos.</div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition flex items-start gap-3 ${activeConversationId === conv.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-100 border-l-4 border-l-transparent'}`}
              >
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 flex-shrink-0 relative">
                  {conv.crm_contacts?.display_name?.[0]?.toUpperCase() || 'U'}
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                    <ChannelIcon channel={conv.active_channel} className={`w-3 h-3 ${conv.active_channel === 'whatsapp' ? 'text-green-500' : conv.active_channel === 'instagram' ? 'text-pink-500' : 'text-blue-500'}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-sm text-slate-800 truncate">
                      {conv.crm_contacts?.display_name || conv.crm_contacts?.primary_phone}
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.last_message || '...'}</p>
                </div>
                {conv.unread_count > 0 && (
                  <div className="w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                    {conv.unread_count}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle panel - Chat Area */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200">
        {activeConv ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  {activeConv.crm_contacts?.display_name?.[0]?.toUpperCase() || 'U'}
               </div>
               <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    {activeConv.crm_contacts?.display_name}
                    <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider border border-slate-200 flex items-center gap-1">
                      <ChannelIcon channel={activeConv.active_channel} className="w-3 h-3" />
                      {activeConv.active_channel}
                    </span>
                  </h3>
                  {activeConv.crm_contacts?.primary_phone && (
                     <p className="text-xs text-slate-500">{activeConv.crm_contacts.primary_phone}</p>
                  )}
               </div>
               <div className="ml-auto">
                 {/* actions dropdown o tools if needed */}
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map(msg => {
                const isOutbound = msg.direction === 'outbound' || msg.direction === 'system';
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl p-3 ${isOutbound ? 'bg-indigo-100 text-indigo-900 rounded-tr-sm' : 'bg-white shadow-sm border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                      {msg.channel !== activeConv.active_channel && msg.direction === 'inbound' && (
                         <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1 font-bold">
                           <ChannelIcon channel={msg.channel} className="w-3 h-3" /> 
                           Desde {msg.channel}
                         </div>
                      )}
                      
                      {msg.media_url ? (
                        msg.message_type === 'image' ? (
                           <img src={msg.media_url} alt="Media" className="rounded-lg mb-2 max-w-sm"/>
                        ) : msg.message_type === 'audio' ? (
                           <audio src={msg.media_url} controls className="mb-2 w-48" />
                        ) : msg.message_type === 'video' ? (
                           <video src={msg.media_url} controls className="mb-2 max-w-sm rounded-lg" />
                        ) : (
                           <a href={msg.media_url} target="_blank" rel="noreferrer" className="text-sm font-bold underline mb-1 block">📎 Documento</a>
                        )
                      ) : null}
                      
                      <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                      
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] opacity-70">
                          {format(new Date(msg.created_at || new Date()), 'HH:mm')}
                        </span>
                        {isOutbound && (
                           msg.status === 'sending' ? <Clock className="w-3 h-3 opacity-50" /> :
                           msg.status === 'failed' ? <AlertCircle className="w-3 h-3 text-red-500" /> :
                           <CheckCircle2 className="w-3 h-3 opacity-70" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200">
               <div className="flex items-center gap-2 mb-2 px-1">
                 <input type="file" id="omnicanal-img-upload" className="hidden" accept="image/*,video/*" onChange={handleImageSelect} />
                 <input type="file" id="omnicanal-doc-upload" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleImageSelect} />
                 <button className="text-slate-400 hover:text-indigo-600 transition p-1" onClick={() => document.getElementById('omnicanal-img-upload')?.click()}>
                    <ImageIcon className="w-5 h-5"/>
                 </button>
                 <button className="text-slate-400 hover:text-indigo-600 transition p-1" onClick={() => document.getElementById('omnicanal-doc-upload')?.click()}>
                    <File className="w-5 h-5"/>
                 </button>
                 <button 
                  className={`transition p-1 ${isRecording ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-indigo-600'}`}
                  onClick={isRecording ? stopRecording : startRecording}
                 >
                    <Mic className="w-5 h-5"/>
                 </button>
                 {isRecording && (
                   <div className="flex items-center gap-2 ml-2">
                     <span className="text-red-500 text-xs font-bold">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                     <button onClick={cancelRecording} className="text-xs text-slate-500 hover:text-red-600">Cancelar</button>
                   </div>
                 )}
                 <div className="flex-1" />
                 {/* Cambio de canal selector simulado si hubiera más canales vinculados */}
                 <span className="text-[10px] font-bold text-slate-400">Respondiendo vía {activeConv.active_channel}</span>
               </div>
               <div className="flex gap-2">
                 <input
                   type="text"
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                   placeholder="Escribe un mensaje omnicanal..."
                   className="flex-1 p-3 bg-slate-100 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                 />
                 <button
                   onClick={handleSend}
                   disabled={!inputText.trim()}
                   className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition"
                 >
                   <Send className="w-5 h-5" />
                 </button>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
            <HelpCircle className="w-16 h-16 mb-4 opacity-20" />
            <p>Selecciona una conversación</p>
          </div>
        )}
      </div>

      {/* Right panel - AI Info & Customer Sidebar */}
      <div className="w-1/4 bg-slate-50 flex flex-col min-w-[280px]">
        {activeConv ? (
          <div className="p-5 overflow-y-auto w-full h-full">
            <h3 className="font-bold text-slate-800 text-sm mb-4 uppercase tracking-wider">Inteligencia Comercial</h3>
            
            <div className="bg-white border border-indigo-100 rounded-xl p-4 shadow-sm mb-4 relative overflow-hidden">
               <div className="absolute -top-6 -right-6 text-indigo-50 opacity-50"><Bot className="w-24 h-24" /></div>
               <div className="relative">
                 <h4 className="text-xs font-bold text-indigo-600 mb-2 flex items-center gap-1"><Bot className="w-4 h-4"/> Resumen IA</h4>
                 <p className="text-sm text-slate-700 italic">{insights?.summary || "Analizando conversación..."}</p>
               </div>
            </div>

            <div className="space-y-4">
              {insights?.objections && insights.objections.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Objeciones Detectadas</h4>
                  <div className="flex gap-2 flex-wrap">
                    {insights.objections.map((obj: string, i: number) => (
                       <span key={i} className="bg-red-50 text-red-700 text-xs px-2 py-1 rounded-md border border-red-100">{obj}</span>
                    ))}
                  </div>
                </div>
              )}

              {insights?.interests && insights.interests.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-2">Intereses</h4>
                  <div className="flex gap-2 flex-wrap">
                    {insights.interests.map((int: string, i: number) => (
                       <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md border border-blue-100">{int}</span>
                    ))}
                  </div>
                </div>
              )}

              {insights?.next_best_action && (
                <div className="bg-emerald-50 rounded-lg p-3 text-emerald-800 border border-emerald-100 text-sm">
                   <p className="font-bold text-xs uppercase mb-1">Acción Sugerida</p>
                   {insights.next_best_action}
                </div>
              )}

              {activeConv.crm_contacts?.primary_phone && (
                <div className="bg-slate-100 hover:bg-slate-200 transition cursor-pointer rounded-lg p-3 text-center border border-slate-200" onClick={async () => {
                   if (activeConv.active_channel !== 'whatsapp') {
                      try {
                        const res = await fetchWithAuth(`/api/omnicanal/conversations/${activeConv.id}/change-channel`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ channel: 'whatsapp', phone: activeConv.crm_contacts.primary_phone })
                        });
                        const data = await res.json();
                        if (data.success) {
                           // Forzar recarga
                           fetchConversations();
                        } else {
                           alert('Error: ' + data.error);
                        }
                      } catch (err) {
                        alert('Error de red');
                      }
                   }
                }}>
                  <p className="text-xs text-slate-500 mb-1">Contacto Principal</p>
                  <p className="font-bold text-slate-800 flex justify-center items-center gap-2">
                     {activeConv.active_channel !== 'whatsapp' && <Phone className="w-4 h-4 text-green-500"/>}
                     {activeConv.crm_contacts.primary_phone}
                  </p>
                  {activeConv.active_channel !== 'whatsapp' && (
                     <p className="text-[10px] text-green-600 font-bold mt-1">Continuar por WhatsApp</p>
                  )}
                </div>
              )}

              <button className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition rounded-xl text-sm font-bold border border-indigo-200 mt-6 shadow-sm">
                Crear Orden desde Chat
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
             <Bot className="w-12 h-12 mb-4 opacity-20" />
             <p className="text-sm">El panel de inteligencia comercial se activará cuando selecciones un contacto.</p>
          </div>
        )}
      </div>
    </div>
  );
};
