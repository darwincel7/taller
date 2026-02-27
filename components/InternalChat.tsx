
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InternalChatMessage } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Send, User, Clock, CheckCircle2 } from 'lucide-react';

interface InternalChatProps {
    orderId: string;
}

export const InternalChat: React.FC<InternalChatProps> = ({ orderId }) => {
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState<InternalChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchMessages = async () => {
        if (!supabase) return;
        const { data } = await supabase
            .from('internal_messages')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });
        
        if (data) setMessages(data as InternalChatMessage[]);
        setLoading(false);
    };

    useEffect(() => {
        fetchMessages();

        if (supabase) {
            const channel = supabase.channel(`chat:${orderId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'internal_messages', filter: `order_id=eq.${orderId}` }, payload => {
                    setMessages(prev => [...prev, payload.new as InternalChatMessage]);
                })
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [orderId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || !currentUser || !supabase) return;

        const msg = {
            order_id: orderId,
            user_id: currentUser.id,
            user_name: currentUser.name,
            message: newMessage.trim(),
            created_at: new Date().toISOString()
        };

        // Optimistic update
        setNewMessage('');
        
        await supabase.from('internal_messages').insert([msg]);
    };

    return (
        <div className="flex flex-col h-[400px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h4 className="font-bold text-slate-700 text-sm">Bitácora Interna</h4>
                <span className="text-xs text-slate-400">{messages.length} mensajes</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {loading && <div className="text-center text-xs text-slate-400">Cargando historial...</div>}
                
                {messages.length === 0 && !loading && (
                    <div className="text-center text-slate-400 text-xs py-10 opacity-60">
                        No hay mensajes internos aún. Inicia la conversación.
                    </div>
                )}

                {messages.map(msg => {
                    const isMe = msg.user_id === currentUser?.id;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'}`}>
                                <p>{msg.message}</p>
                            </div>
                            <div className="flex items-center gap-1 mt-1 px-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{isMe ? 'Yo' : msg.user_name}</span>
                                <span className="text-[9px] text-slate-400">• {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2">
                <input 
                    className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Escribe una nota interna..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                />
                <button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 transition">
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
};
