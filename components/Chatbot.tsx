
import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, Bot } from 'lucide-react';
import { chatWithDarwin, analyzeImageForOrder } from '../services/geminiService';
import { useOrders } from '../contexts/OrderContext';
import { ChatMessage, RepairOrder } from '../types';

export const Chatbot: React.FC = () => {
  const { orders } = useOrders();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: '¡Hola! Soy Darwin. Si ya tienes una orden, solo escribe el número (ej. 105) y te daré todos los detalles.',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    // Update UI immediately with user message
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setIsTyping(true);

    // --- SMART FILTERING FOR READABLE ID ---
    const idMatch = userMsg.text.match(/\b\d+\b/); // Finds integer numbers like "105"
    let relevantOrders: RepairOrder[] = [];

    if (idMatch) {
        const searchNum = parseInt(idMatch[0]);
        // Filter orders where readable_id matches the number OR the UUID contains the string
        relevantOrders = orders.filter(o => o.readable_id === searchNum || o.id.includes(idMatch[0]));
    } else {
        // Fallback: Send latest 5 orders for context if no ID found
        relevantOrders = orders.slice(0, 5);
    }

    // Pass the relevant orders explicitly to the service
    const responseText = await chatWithDarwin(userMsg.text, relevantOrders, undefined, newHistory);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText || "Hubo un error al procesar tu solicitud.",
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, botMsg]);
    setIsTyping(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1];

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: "📸 [Imagen enviada]",
        timestamp: Date.now()
      };
      
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setIsTyping(true);

      // Attempt to extract text first, then chat
      const extractedId = await analyzeImageForOrder(base64Data);
      
      let relevantOrders = orders;
      if (extractedId) {
          const numId = parseInt(extractedId);
          if (!isNaN(numId)) {
              relevantOrders = orders.filter(o => o.readable_id === numId);
          }
      }

      let prompt = extractedId 
        ? `Encontré este ID de orden en la imagen: ${extractedId}. ¿Cuál es el estado?`
        : `He enviado una imagen de mi factura. ¿Puedes leer el número de orden y decirme el estado?`;
      
      const responseText = await chatWithDarwin(prompt, relevantOrders, base64Data, newHistory);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText || "No pude leer la imagen correctamente.",
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all z-50 flex items-center gap-2"
      >
        <Bot className="w-6 h-6" />
        <span className="font-semibold hidden sm:inline">Consultar Estado</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-48px)] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="bg-blue-600 p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <h3 className="font-bold">Asistente Darwin</h3>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white text-sm">
          Cerrar
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm flex gap-1">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-75"></span>
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-150"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
        <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageUpload}
        />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ej: 105..."
          className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={handleSendMessage}
          disabled={!inputText.trim() && !isTyping}
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
