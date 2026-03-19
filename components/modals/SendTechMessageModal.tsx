
import React, { useState } from 'react';
import { MessageCircle, X, Zap, Phone, Sparkles, Send, Loader2 } from 'lucide-react';

interface SendTechMessageModalProps {
    techName: string;
    onSend: (msg: string) => void;
    onClose: () => void;
}

export const SendTechMessageModal: React.FC<SendTechMessageModalProps> = ({ techName, onSend, onClose }) => {
    const [msg, setMsg] = useState('');
    const [isSending, setIsSending] = useState(false);

    const quickMsg = (text: string) => setMsg(text);

    const handleSend = () => {
        if(!msg.trim()) return;
        setIsSending(true);
        setTimeout(() => {
            onSend(msg);
        }, 600);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="bg-slate-50 rounded-[32px] shadow-2xl w-full max-w-md relative overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 pt-8 pb-10 text-white relative">
                    <div className="absolute top-0 right-0 p-3 opacity-20">
                        <MessageCircle className="w-24 h-24 -mr-6 -mt-6 rotate-12" />
                    </div>
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition backdrop-blur-sm">
                        <X className="w-5 h-5" />
                    </button>
                    <h3 className="text-3xl font-black tracking-tight mb-1 flex items-center gap-2">
                        Mensaje Rápido
                    </h3>
                    <p className="text-blue-100 font-medium flex items-center gap-2 text-sm opacity-90">
                        Para: <span className="bg-white/20 px-2 py-0.5 rounded-lg font-bold text-white shadow-sm border border-white/10 uppercase tracking-wider">{techName}</span>
                    </p>
                </div>

                <div className="relative -mt-6 px-6 pb-6">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-1">
                        <div className="flex gap-2 overflow-x-auto p-3 pb-1 no-scrollbar">
                            <button onClick={() => quickMsg("⚡ Prioridad Urgente, por favor revisar.")} className="whitespace-nowrap px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-[10px] font-bold border border-yellow-100 hover:bg-yellow-100 transition active:scale-95 flex items-center gap-1"><Zap className="w-3 h-3"/> Urgente</button>
                            <button onClick={() => quickMsg("📞 Llámame cuando puedas.")} className="whitespace-nowrap px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold border border-green-100 hover:bg-green-100 transition active:scale-95 flex items-center gap-1"><Phone className="w-3 h-3"/> Llámame</button>
                            <button onClick={() => quickMsg("👀 ¿En qué estado está esto?")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition active:scale-95 flex items-center gap-1"><Sparkles className="w-3 h-3"/> Status</button>
                        </div>
                        <div className="p-3">
                            <textarea
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-slate-700 font-medium focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none text-sm leading-relaxed placeholder:text-slate-300 shadow-inner"
                                placeholder="Escribe tu mensaje aquí..."
                                rows={4}
                                value={msg}
                                onChange={e => setMsg(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="mt-6">
                        <button
                            onClick={handleSend}
                            disabled={!msg.trim() || isSending}
                            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
                                isSending
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200 hover:-translate-y-1'
                            }`}
                        >
                            {isSending ? (
                                <>Enviando <Loader2 className="w-4 h-4 animate-spin"/></>
                            ) : (
                                <>Enviar Nota <Send className="w-4 h-4" /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
