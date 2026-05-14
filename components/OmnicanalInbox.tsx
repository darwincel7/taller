import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { supabase } from '../services/supabase';
import { Send, User, MessageCircle, Clock, CheckCircle2, AlertCircle, Link as LinkIcon, Search, Image as ImageIcon, File, Mic, Phone, Instagram, Facebook, HelpCircle, Bot, Check, CheckCheck } from 'lucide-react';
import { format, isToday } from 'date-fns';

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';

const ChannelIcon = ({ channel, className }: { channel: Channel, className?: string }) => {
  switch (channel) {
    case 'whatsapp': return <Phone className={className} />;
    case 'instagram': return <Instagram className={className} />;
    case 'facebook': return <Facebook className={className} />;
    default: return <MessageCircle className={className} />;
  }
};

const formatMessageDate = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    return format(date, 'd/M/yy');
  } catch (e) {
    return '';
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
  const [searchResults, setSearchResults] = useState<{messages: any[], contacts: any[]} | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [agents, setAgents] = useState<any[]>([]);
  const [duplicatesInfo, setDuplicatesInfo] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = localStorage.getItem('user_id'); // Assuming user_id is stored
  const userRole = localStorage.getItem('userRole') || 'ADMIN'; // Using localStorage for role (you might want useAuth context)

  const checkDuplicates = async () => {
    try {
      const res = await fetchWithAuth('/api/omnicanal/diagnostics/duplicates');
      if (res.ok) setDuplicatesInfo(await res.json());
    } catch(e) { console.error(e); }
  };

  const handleMergeDuplicates = async () => {
    if (!confirm('¿Estás seguro de que quieres unificar los contactos y conversaciones duplicadas de forma automática?')) return;
    try {
      const res = await fetchWithAuth('/api/omnicanal/diagnostics/merge', { method: 'POST' });
      if (!res.ok) throw new Error('Error al unificar duplicados');
      const data = await res.json();
      alert(`Unificación completada: ${data.mergedContacts} contactos y ${data.mergedConversations} conversaciones.`);
      fetchConversations();
      checkDuplicates();
    } catch (e: any) {
      alert(`Error unificando: ${e.message}`);
    }
  };

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
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Non-JSON response received:', text.substring(0, 200));
        throw new Error(`Invalid response format (Expected JSON, got ${contentType}).`);
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

  const fetchAgents = async () => {
    try {
      const res = await fetchWithAuth('/api/omnicanal/agents');
      if (res.ok) setAgents(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleClaim = async (convId: string) => {
    try {
      const res = await fetchWithAuth(`/api/omnicanal/conversations/${convId}/claim`, { method: 'POST' });
      if (res.ok) fetchConversations();
    } catch (e) { console.error(e); }
  };

  const handleAssign = async (convId: string, agentId: string) => {
    try {
      const res = await fetchWithAuth(`/api/omnicanal/conversations/${convId}/assign`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId })
      });
      if (res.ok) fetchConversations();
    } catch (e) { console.error(e); }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const filteredConversations = conversations.filter(c => {
    const term = searchQuery.toLowerCase();
    const searchMatch = (c.crm_contacts?.display_name || '').toLowerCase().includes(term) || 
                        (c.crm_contacts?.full_name || '').toLowerCase().includes(term) ||
                        (c.crm_contacts?.primary_phone || '').includes(term) ||
                        (c.last_message || '').toLowerCase().includes(term) ||
                        (c.active_channel || '').toLowerCase().includes(term);
    
    const channelMatch = filterChannel === 'all' || c.active_channel === filterChannel;
    const statusMatch = (filterStatus === 'all' && c.status !== 'merged') || c.status === filterStatus;
    const priorityMatch = filterPriority === 'all' || c.priority === filterPriority;
    const assignmentMatch = filterAssignment === 'all' || 
                          (filterAssignment === 'mine' && c.assigned_to === userId) ||
                          (filterAssignment === 'unassigned' && !c.assigned_to);

    return searchMatch && channelMatch && statusMatch && priorityMatch && assignmentMatch;
  });
  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetchWithAuth(`/api/omnicanal/conversations/${convId}/messages`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response from server");
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setMessages(prev => {
        // Merge without losing client optimistic messages that are not yet in DB
        const serverIds = new Set(data.map((m: any) => m.raw?.client_request_id || m.client_request_id || m.id));
        const localPending = prev.filter(m => String(m.id).startsWith('temp-') && !serverIds.has(m.client_request_id || m.raw?.client_request_id));
        return [...data, ...localPending].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
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
    fetchAgents();
    checkDuplicates();
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_messages', filter: `conversation_id=eq.${activeConversationId}` }, () => {
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

    if (activeConv.active_channel === 'tiktok' && msgType !== 'image') {
      alert('TikTok actualmente solo permite enviar imágenes y texto.');
      return;
    }

    // Attempt upload to Supabase Storage
    let mediaUrl = '';
    try {
      const fileExt = file.name.split('.').pop() || 'tmp';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `omnicanal/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('crm-media')
        .upload(filePath, file);

      if (!uploadError) {
        const { data } = supabase.storage.from('crm-media').getPublicUrl(filePath);
        mediaUrl = data.publicUrl;
      }
    } catch(e) {
      console.warn("Storage upload failed, falling back to base64 if needed", e);
    }

    // Convert to base64 for quick preview / upload mock
    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const finalUrl = mediaUrl || base64; // Use Supabase URL if successful, otherwise base64
        
        const tempMsgId = `temp-${Date.now()}`;
        const tempMsg = {
          id: tempMsgId,
          client_request_id: tempMsgId,
          text: '',
          message_type: msgType,
          media_url: finalUrl,
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
              mediaUrl: finalUrl,
              mediaType: msgType,
              clientRequestId: tempMsgId
            })
          });
          
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Invalid response from server");
          }
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          
          setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent', id: data.message?.id || m.id } : m));
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
          const tempMsgId = `temp-${Date.now()}`;
          const tempMsg = {
            id: tempMsgId,
            client_request_id: tempMsgId,
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
                mediaType: 'audio',
                clientRequestId: tempMsgId
              })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent', id: data.message?.id || m.id } : m));
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
    
    const tempMsgId = `temp-${Date.now()}`;
    const tempMsg = {
      id: tempMsgId,
      client_request_id: tempMsgId,
      text,
      direction: 'outbound',
      message_type: 'text',
      status: 'sending',
      created_at: new Date().toISOString(),
      channel: activeConv.active_channel
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetchWithAuth('/api/omnicanal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, text, clientRequestId: tempMsgId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'sent', id: data.message?.id || m.id } : m));
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
    }
  };

  const handleRetry = async (msg: any) => {
    if (!activeConv) return;
    
    // Optimistic UI update
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sending' } : m));

    try {
      const res = await fetchWithAuth('/api/omnicanal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           conversationId: activeConv.id, 
           text: msg.text || '', 
           mediaUrl: msg.media_url,
           mediaType: msg.message_type,
           clientRequestId: msg.client_request_id || msg.id 
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'sent', id: data.message?.id || m.id } : m));
    } catch (error) {
      console.error('Error retrying message:', error);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'failed' } : m));
    }
  };



  return (
    <div className="flex bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 h-full">
      {/* Left panel - Inbox List */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50 min-w-[300px]">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-3">
            <MessageCircle className="w-5 h-5 text-indigo-500" />
            Bandeja Omnicanal
          </h2>
          {userRole === 'ADMIN' && duplicatesInfo && 
           (duplicatesInfo.by_phone?.length > 0 || duplicatesInfo.multiple_conversations_per_contact?.length > 0) && (
             <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-800">
               <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
               <div className="flex-1">
                 <p className="font-medium mb-1">Contactos duplicados detectados</p>
                 <button onClick={handleMergeDuplicates} className="font-bold underline hover:text-amber-900 transition">Unificar automáticamente</button>
               </div>
             </div>
          )}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Buscar mensajes o clientes..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="w-1/4 text-xs bg-slate-100 border-none rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500">
                <option value="all">Canal</option>
                <option value="whatsapp">WA</option>
                <option value="instagram">IG</option>
                <option value="facebook">FB</option>
                <option value="tiktok">TK</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-1/4 text-xs bg-slate-100 border-none rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500">
                <option value="all">Estado</option>
                <option value="open">Abierto</option>
                <option value="closed">Cerrado</option>
              </select>
              <select value={filterAssignment} onChange={e => setFilterAssignment(e.target.value as any)} className="w-1/4 text-xs bg-slate-100 border-none rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500">
                <option value="all">Asign.</option>
                <option value="mine">Míos</option>
                <option value="unassigned">Sin asign</option>
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="w-1/4 text-xs bg-slate-100 border-none rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500">
                <option value="all">Prior.</option>
                <option value="normal">Norm</option>
                <option value="urgent">Urg</option>
              </select>
            </div>
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
                    <h3 className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                      {conv.crm_contacts?.display_name || conv.crm_contacts?.primary_phone}
                    </h3>
                    <span className={`text-[10px] ${conv.unread_count > 0 ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                      {formatMessageDate(conv.last_message_at || conv.created_at)}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${conv.unread_count > 0 ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                    {conv.last_message || '...'}
                  </p>
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
                    {activeConv.crm_contacts?.display_name || 'Desconocido'}
                    <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider border border-slate-200 flex items-center gap-1">
                      <ChannelIcon channel={activeConv.active_channel} className="w-3 h-3" />
                      {activeConv.active_channel}
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {activeConv.crm_contacts?.primary_phone && (
                      <p className="text-xs text-slate-500">{activeConv.crm_contacts.primary_phone}</p>
                    )}
                    {/* Badge de canales conectados */}
                    {activeConv.crm_contacts?.crm_contact_identities && (
                      <div className="flex gap-1">
                        {Array.from(new Set(activeConv.crm_contacts.crm_contact_identities.map((id: any) => id.channel))).map((channel: any) => (
                           <div key={channel} className="bg-slate-50 border border-slate-200 p-0.5 rounded text-slate-400" title={`Conectado vía ${channel}`}>
                              <ChannelIcon channel={channel} className="w-3 h-3" />
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
               </div>
                <div className="ml-auto flex items-center gap-2">
                 {activeConv.assigned_to ? (
                    <div className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md border border-indigo-100 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {agents.find(a => a.id === activeConv.assigned_to)?.full_name || 'Agente'}
                    </div>
                 ) : (
                    <button 
                      onClick={() => handleClaim(activeConv.id)}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium"
                    >
                      Tomar Chat
                    </button>
                 )}
                 <select 
                   onChange={(e) => handleAssign(activeConv.id, e.target.value)}
                   className="text-xs border-slate-200 rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500"
                   value={activeConv.assigned_to || ''}
                 >
                   <option value="">{activeConv.assigned_to ? 'Reasignar...' : 'Asignar a...'}</option>
                   {agents.map(agent => (
                     <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                   ))}
                 </select>
                 <button className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition" onClick={() => {
                   const note = prompt("Escribe una nota interna para este cliente:");
                   if (note) {
                     // Lógica de nota interna (mock o real mediante update msg)
                     setMessages(prev => [...prev, {
                       id: `note-${Date.now()}`,
                       text: `📝 Nota interna: ${note}`,
                       message_type: 'text',
                       direction: 'system',
                       created_at: new Date().toISOString(),
                       channel: 'system'
                     }]);
                   }
                 }}>
                   Añadir Nota
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 relative">
              {activeConv.ai_suggested_reply && (
                <div className="sticky top-0 z-10 mb-4 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-indigo-600 text-white rounded-2xl p-4 shadow-xl border border-indigo-500 flex items-start gap-3">
                    <Bot className="w-5 h-5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">Darwin AI Sugiere:</p>
                      <p className="text-sm font-medium mb-3">"{activeConv.ai_suggested_reply}"</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setInputText(activeConv.ai_suggested_reply)}
                          className="px-4 py-1.5 bg-white text-indigo-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition"
                        >
                          Usar Sugerencia
                        </button>
                        <button 
                          onClick={() => handleClaim(activeConv.id)}
                          className="px-4 py-1.5 bg-indigo-500/50 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 transition"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                          {formatMessageDate(msg.created_at || new Date().toISOString())}
                        </span>
                        {isOutbound && (
                           <div className="flex items-center ml-1">
                             {msg.status === 'sending' && <Clock className="w-3 h-3 text-slate-400" />}
                             {msg.status === 'sent' && <Check className="w-3 h-3 text-slate-500" />}
                             {msg.status === 'delivered' && <CheckCheck className="w-3 h-3 text-slate-500" />}
                             {msg.status === 'received' && <CheckCheck className="w-3 h-3 text-slate-500" />}
                             {msg.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                             {msg.status === 'failed' && (
                               <div className="flex items-center gap-1 text-red-500 ml-1">
                                 <AlertCircle className="w-3 h-3" />
                                 <button
                                    onClick={() => handleRetry(msg)}
                                    className="text-[10px] underline hover:text-red-700"
                                 >
                                    Reintentar
                                 </button>
                               </div>
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

            <div className="p-4 bg-white border-t border-slate-200">
               <div className="flex gap-2 overflow-x-auto pb-2 mb-2 w-full no-scrollbar">
                 {['¿Cuál es el precio? 💰', 'Financiamiento disponible 🏦', 'Ubicación de tienda 📍', 'Garantía del equipo 🛡️', 'Estado de reparación 🔧'].map((reply, i) => (
                    <button 
                      key={i} 
                      onClick={() => setInputText(reply)}
                      className="whitespace-nowrap px-3 py-1 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 text-[11px] rounded-full transition"
                    >
                      {reply}
                    </button>
                 ))}
               </div>
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

              {/* CRM Info section */}
              <div className="mt-8 border-t border-slate-200 pt-4">
                 <h3 className="font-bold text-slate-800 text-sm mb-4 uppercase tracking-wider">Historial del Cliente</h3>
                 
                 <div className="mb-4">
                   <h4 className="text-xs font-bold text-slate-500 mb-2">Últimas Órdenes</h4>
                   <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs space-y-2">
                      <div className="flex justify-between items-center text-slate-700">
                        <span>#10405 - <span className="text-emerald-600 font-medium">Completada</span></span>
                        <span className="text-slate-400">Hace 2 días</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700">
                        <span>#10390 - <span className="text-emerald-600 font-medium">Completada</span></span>
                        <span className="text-slate-400">Hace 1 mes</span>
                      </div>
                   </div>
                 </div>

                 <div>
                   <h4 className="text-xs font-bold text-slate-500 mb-2">Casos Taller (Reparaciones)</h4>
                   <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs space-y-2">
                      <div className="flex justify-between items-center text-slate-700">
                        <span>Pantalla iPhone 13 - <span className="text-blue-600 font-medium">En Taller</span></span>
                      </div>
                   </div>
                 </div>
              </div>
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
