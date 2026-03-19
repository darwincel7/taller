
// ... (previous imports and code unchanged up to handleSubmit) ...
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { RepairOrder, OrderType, PriorityLevel, OrderStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orderService } from '../services/orderService';
import { 
  PlusCircle, User, Smartphone, Save, DollarSign, 
  ShoppingBag, Video, Sparkles, X, 
  Camera, Loader2, Play, Trash2, 
  BrainCircuit, FileVideo, Radio,
  XCircle, ChevronRight, ShieldCheck,
  AlertTriangle, HardDrive, Palette, Lock, Headphones, Eye, Search
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { analyzeVideoForIntake } from '../services/geminiService';
import { CameraCapture } from '../components/CameraCapture';
import { printInvoice } from '../services/invoiceService';
import { CustomerSelectModal } from '../components/modals/CustomerSelectModal';
import { Customer } from '../types';

// ... (rest of helper functions and components) ...

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const VideoRecorderModal = ({ onCapture, onClose }: { onCapture: (file: File) => void, onClose: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        let interval: any;
        if (isRecording) interval = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, [isRecording]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (e) { alert("Error accediendo a la cámara."); onClose(); }
    };

    useEffect(() => { startCamera(); }, []);

    const handleStartRecording = () => {
        const stream = videoRef.current?.srcObject as MediaStream;
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        const localChunks: Blob[] = [];
        recorder.ondataavailable = (e) => localChunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(localChunks, { type: 'video/mp4' });
            const file = new File([blob], `capture_${Date.now()}.mp4`, { type: 'video/mp4' });
            onCapture(file);
        };
        recorder.start();
        setIsRecording(true);
    };

    const handleStopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        const stream = videoRef.current?.srcObject as MediaStream;
        if (stream) stream.getTracks().forEach(t => t.stop());
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-4 animate-in fade-in">
            <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
                <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video bg-black object-cover" />
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full text-white text-xs font-bold backdrop-blur">
                    <Radio className={`w-3 h-3 ${isRecording ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    {isRecording ? `GRABANDO: ${seconds}s` : 'VISTA PREVIA'}
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white"><X /></button>
                <div className="p-6 flex justify-center gap-4">
                    {!isRecording ? (
                        <button onClick={handleStartRecording} className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-red-900/40 hover:bg-red-700 transition"><Video className="w-6 h-6" /> INICIAR GRABACIÓN</button>
                    ) : (
                        <button onClick={handleStopRecording} className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg hover:bg-slate-100 transition"><XCircle className="w-6 h-6 text-red-600" /> DETENER Y ANALIZAR</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Intake = () => {
  const navigate = useNavigate();
  const { addOrder } = useOrders();
  const { currentUser } = useAuth();
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>(OrderType.REPAIR);
  
  // AI States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [showAiChoices, setShowAiChoices] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form States
  const [deviceCategory, setDeviceCategory] = useState("Celular");
  const [deviceColor, setDeviceColor] = useState("");
  const [deviceStorage, setDeviceStorage] = useState("");

  // Default Deadline (48h)
  const [deadlineInput, setDeadlineInput] = useState(() => {
      const now = new Date();
      now.setHours(now.getHours() + 48); 
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
  });

  const [formData, setFormData] = useState<Partial<RepairOrder>>({
      customer: { name: '', phone: '' },
      deviceModel: '',
      deviceIssue: '',
      deviceCondition: '', 
      devicePassword: '',
      accessories: '',
      imei: '',
      priority: PriorityLevel.NORMAL,
      estimatedCost: 0,
      purchaseCost: 0,
      targetPrice: 0,
      deviceSource: '', 
      devicePhoto: '',
  });

  // Customer History Logic (Server-side)
  const { data: historyData } = useQuery({
    queryKey: ['customerHistory', formData.customer?.phone],
    queryFn: () => orderService.getCustomerHistory(formData.customer!.phone),
    enabled: !!formData.customer?.phone && formData.customer.phone.length >= 8
  });

  const customerHistory = useMemo(() => {
      if (!historyData || historyData.length === 0) return null;
      
      const totalSpent = historyData.reduce((sum, o) => {
          if (o.status === OrderStatus.RETURNED) {
              return sum + (o.finalPrice || o.estimatedCost || 0);
          }
          return sum;
      }, 0);

      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const abandoned = historyData.filter(o => 
          o.status !== OrderStatus.RETURNED && 
          o.status !== OrderStatus.CANCELED && 
          (o.createdAt || 0) < thirtyDaysAgo
      );
      
      const active = historyData.filter(o => 
          o.status !== OrderStatus.RETURNED && 
          o.status !== OrderStatus.CANCELED &&
          (o.createdAt || 0) >= thirtyDaysAgo
      );

      const mostRecentOrder = [...historyData].sort((a, b) => b.createdAt - a.createdAt)[0];

      return {
          visits: historyData.length,
          totalSpent,
          abandoned: abandoned.length,
          active: active.length,
          lastVisit: mostRecentOrder.createdAt,
          suggestedName: mostRecentOrder.customer.name
      };
  }, [historyData]);

  // Warranty Alert Logic (Server-side)
  const { data: warrantyData } = useQuery({
    queryKey: ['warrantyAlert', formData.imei],
    queryFn: () => orderService.getWarrantyAlert(formData.imei!),
    enabled: !!formData.imei && formData.imei.length >= 4
  });

  const warrantyAlert = useMemo(() => {
      if (!warrantyData || warrantyData.length === 0) return null;

      const lastOrder = warrantyData[0];
      const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
      
      if (lastOrder.status === OrderStatus.RETURNED && (lastOrder.createdAt || 0) > sixtyDaysAgo) {
          const daysAgo = Math.floor((Date.now() - (lastOrder.createdAt || 0)) / (1000 * 60 * 60 * 24));
          return {
              orderId: lastOrder.readable_id || lastOrder.id.slice(-4),
              daysAgo,
              issue: lastOrder.deviceIssue
          };
      }

      return null;
  }, [warrantyData]);

  // Auto-fill customer name if found in history and current name is empty
  useEffect(() => {
      if (customerHistory?.suggestedName && !formData.customer?.name) {
          setFormData(prev => ({
              ...prev,
              customer: { ...prev.customer!, name: customerHistory.suggestedName }
          }));
      }
  }, [customerHistory?.suggestedName, formData.customer?.name]);

  // ... (processVideoInternal and extractFramesFromVideo functions omitted for brevity, assume they are here) ...
  const extractFramesFromVideo = async (file: File): Promise<string[]> => {
      return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const frames: string[] = [];
          video.src = URL.createObjectURL(file);
          video.muted = true;
          video.playsInline = true;
          video.onloadedmetadata = async () => {
              try {
                  const duration = video.duration;
                  const numberOfFrames = 5;
                  const timestamps = [];
                  for (let i = 0; i < numberOfFrames; i++) timestamps.push(duration * ((i + 0.5) / numberOfFrames));
                  canvas.width = video.videoWidth > 1280 ? 1280 : video.videoWidth;
                  canvas.height = (canvas.width / video.videoWidth) * video.videoHeight;
                  for (const time of timestamps) {
                      video.currentTime = time;
                      await new Promise(r => { video.onseeked = () => r(null); });
                      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                      frames.push(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
                  }
                  resolve(frames);
              } catch (e) { reject(e); }
          };
          video.onerror = () => reject("Error cargando video.");
      });
  };

  const processVideoInternal = async (file: File) => {
      setShowVideoRecorder(false); 
      setIsAnalyzing(true);
      setShowAiChoices(false);
      setAnalysisStep('Procesando video HD...');
      try {
          const frames = await extractFramesFromVideo(file);
          setAnalysisStep('🤖 IA Buscando IMEI, Color y GB...');
          const aiData: any = await analyzeVideoForIntake(frames);
          if (!aiData) throw new Error("La IA no pudo identificar el equipo.");
          const safeString = (val: any) => typeof val === 'string' ? val : (val ? JSON.stringify(val) : '');
          setAnalysisStep('✨ Completando datos...');
          
          if (aiData.color) setDeviceColor(safeString(aiData.color));
          if (aiData.storage) setDeviceStorage(safeString(aiData.storage));
          
          setFormData(prev => ({
              ...prev,
              deviceModel: safeString(aiData.deviceModel) || prev.deviceModel,
              deviceIssue: safeString(aiData.deviceIssue) || prev.deviceIssue,
              imei: safeString(aiData.imei).replace(/[^0-9]/g, '').slice(0, 15) || prev.imei, 
              accessories: safeString(aiData.accessories) || prev.accessories,
              deviceCondition: safeString(aiData.deviceCondition) || prev.deviceCondition,
              devicePhoto: `data:image/jpeg;base64,${frames[aiData.bestFrameIndex || 2]}` 
          }));
      } catch (error: any) {
          alert(`⚠️ ${error.message || "Error analizando video"}`);
      } finally { setIsAnalyzing(false); setAnalysisStep(''); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.deviceModel || !formData.deviceIssue) { alert("Modelo y Falla son obligatorios."); return; }
      
      // PRE-OPEN WINDOW TO PREVENT BLOCKING
      const printWindow = window.open('about:blank', '_blank');
      if (printWindow) {
          printWindow.document.write(`
            <html>
                <head><title>Generando...</title></head>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1>Generando Recibo...</h1>
                    <p>Por favor espere mientras se guarda la orden en el sistema.</p>
                </body>
            </html>
          `);
      }

      setLoading(true);
      try {
          // 1. Check if customer exists by phone, or create a new one
          let customerId = undefined;
          if (orderType === OrderType.REPAIR || orderType === OrderType.WARRANTY) {
              try {
                  const { data: existingCustomers } = await supabase
                      .from('customers')
                      .select('id')
                      .eq('phone', formData.customer!.phone)
                      .limit(1);
                  
                  if (existingCustomers && existingCustomers.length > 0) {
                      customerId = existingCustomers[0].id;
                  } else {
                      const newCustId = `CUST-${Math.floor(10000 + Math.random() * 90000)}`;
                      await supabase.from('customers').insert([{
                          id: newCustId,
                          name: formData.customer!.name,
                          phone: formData.customer!.phone,
                          createdAt: Date.now()
                      }]);
                      customerId = newCustId;
                  }
              } catch (err) {
                  console.error("Error managing customer directory:", err);
                  // Non-blocking error, continue with order creation
              }
          }

          const newOrder: any = {
              id: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
              orderType,
              customerId,
              customer: orderType === OrderType.REPAIR || orderType === OrderType.WARRANTY ? formData.customer! : { name: formData.deviceSource || 'STOCK', phone: '000' },
              deviceModel: `${deviceCategory} ${formData.deviceModel}`, // Include Category
              deviceIssue: formData.deviceIssue!,
              // Combine visuals with specific fields for the full string, but keep fields too
              deviceCondition: formData.deviceCondition || 'Sin observaciones',
              devicePassword: formData.devicePassword || 'Sin clave',
              accessories: formData.accessories || 'Solo equipo',
              imei: formData.imei?.trim() || '',
              devicePhoto: formData.devicePhoto,
              status: OrderStatus.PENDING,
              priority: formData.priority || PriorityLevel.NORMAL,
              createdAt: Date.now(),
              deadline: (() => {
                  if (!deadlineInput) return Date.now() + 48 * 60 * 60 * 1000;
                  const [datePart, timePart] = deadlineInput.split('T');
                  if (datePart && timePart) {
                      const [year, month, day] = datePart.split('-').map(Number);
                      const [hours, minutes] = timePart.split(':').map(Number);
                      return new Date(year, month - 1, day, hours, minutes).getTime();
                  }
                  return Date.now() + 48 * 60 * 60 * 1000;
              })(),
              estimatedCost: formData.estimatedCost || 0, 
              totalAmount: formData.totalAmount || formData.estimatedCost || 0,
              purchaseCost: formData.purchaseCost || 0,
              targetPrice: formData.targetPrice || 0,
              history: [{ date: new Date().toISOString(), status: OrderStatus.PENDING, note: "Orden creada", technician: currentUser?.name || 'Sistema' }],
              currentBranch: currentUser?.branch || 'T4',
              // Save specific fields for future use
              deviceStorage,
              unlockStatus: deviceColor ? `Color: ${deviceColor}` : undefined 
          };
          
          if (deviceColor) newOrder.deviceCondition += ` [Color: ${deviceColor}]`;
          if (deviceStorage) newOrder.deviceModel += ` (${deviceStorage})`;

          const createdOrder = await addOrder(newOrder);
          
          const orderToPrint = createdOrder || newOrder;
          
          // PASS PRE-OPENED WINDOW
          printInvoice(orderToPrint, printWindow);
          
          setTimeout(() => {
              navigate('/orders');
          }, 300);

      } catch (e: any) { 
          alert(e.message); 
          if(printWindow) printWindow.close(); // Close on error
      } finally { setLoading(false); }
  };

  // ... (getTheme and render) ...
  const getTheme = () => {
      switch (orderType) {
          case OrderType.STORE: return { main: 'red', bg: 'bg-red-600', border: 'border-red-600', light: 'bg-red-50', text: 'text-red-700', icon: ShoppingBag };
          case OrderType.WARRANTY: return { main: 'yellow', bg: 'bg-yellow-500', border: 'border-yellow-500', light: 'bg-yellow-50', text: 'text-yellow-800', icon: ShieldCheck };
          default: return { main: 'blue', bg: 'bg-blue-600', border: 'border-blue-600', light: 'bg-slate-50', text: 'text-slate-800', icon: PlusCircle };
      }
  };
  const theme = getTheme();

  return (
    <div className={`p-4 md:p-6 max-w-4xl mx-auto pb-24 ${orderType !== OrderType.REPAIR ? 'border-x-8 ' + (orderType === OrderType.STORE ? 'border-red-600' : 'border-yellow-400') : ''}`}>
      
      {/* AI Processing Overlay */}
      {isAnalyzing && (
          <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6">
              <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl text-center">
                  <BrainCircuit className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-bounce" />
                  <h3 className="text-2xl font-bold text-white mb-2">Analizando Equipo</h3>
                  <p className="text-blue-200 text-sm font-medium animate-pulse">{analysisStep}</p>
              </div>
          </div>
      )}

      {/* AI Choices Modal */}
      {showAiChoices && (
          <div className="fixed inset-0 z-[190] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAiChoices(false)}>
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600"/> Auto-Llenado IA</h3>
                  <div className="space-y-3">
                      <button onClick={() => { setShowAiChoices(false); setShowVideoRecorder(true); }} className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold flex items-center justify-between group hover:bg-indigo-700 transition"><div className="flex items-center gap-3"><Video className="w-5 h-5" /><span>Grabar con Cámara</span></div><ChevronRight className="w-4 h-4 opacity-50" /></button>
                      <button onClick={() => { setShowAiChoices(false); fileInputRef.current?.click(); }} className="w-full bg-slate-100 text-slate-700 p-4 rounded-2xl font-bold flex items-center justify-between group hover:bg-slate-200 transition"><div className="flex items-center gap-3"><FileVideo className="w-5 h-5" /><span>Subir Archivo</span></div><ChevronRight className="w-4 h-4 opacity-50" /></button>
                  </div>
              </div>
          </div>
      )}

      {showVideoRecorder && <VideoRecorderModal onCapture={processVideoInternal} onClose={() => setShowVideoRecorder(false)} />}
      {showCamera && <CameraCapture onCapture={(img) => setFormData({ ...formData, devicePhoto: img })} onClose={() => setShowCamera(false)} />}
      {showCustomerSelect && (
        <CustomerSelectModal
          onSelect={(customer) => {
            setFormData({
              ...formData,
              customer: { name: customer.name, phone: customer.phone }
            });
            setShowCustomerSelect(false);
          }}
          onClose={() => setShowCustomerSelect(false)}
        />
      )}

      {/* --- HEADER --- */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className={`p-2 rounded-lg text-white ${theme.bg}`}>
                <theme.icon className="w-6 h-6"/>
            </div>
            {orderType === OrderType.STORE ? 'Nuevo Recibido de Tienda' : orderType === OrderType.WARRANTY ? 'Ingreso por Garantía' : 'Nueva Reparación Cliente'}
        </h1>
        <div className="bg-slate-900 text-white px-4 py-2 rounded-lg text-right shadow-lg">
            <p className="text-[10px] text-slate-400 font-bold uppercase">NUEVO INGRESO</p>
            <p className="text-xl font-mono font-bold leading-none">EQUIPO</p>
        </div>
      </div>

      {/* --- TABS --- */}
      <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex mb-6">
          <button onClick={() => setOrderType(OrderType.REPAIR)} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${orderType === OrderType.REPAIR ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Cliente</button>
          <button onClick={() => setOrderType(OrderType.STORE)} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${orderType === OrderType.STORE ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Tienda (Stock)</button>
          <button onClick={() => setOrderType(OrderType.WARRANTY)} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${orderType === OrderType.WARRANTY ? 'bg-yellow-400 text-yellow-900 shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Garantía</button>
      </div>

      {/* --- AI BANNER --- */}
      <button onClick={() => setShowAiChoices(true)} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-3 rounded-xl shadow-lg flex items-center justify-between mb-6 border border-indigo-400/50">
          <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-full"><Video className="w-5 h-5 text-white"/></div>
              <div className="text-left">
                  <div className="font-bold text-sm">Auto-Llenado IA</div>
                  <div className="text-[10px] opacity-80">Graba el equipo (Muestra pantalla, bordes, IMEI). Sin límite de tiempo.</div>
              </div>
          </div>
          <Sparkles className="w-5 h-5 opacity-70"/>
      </button>

      {/* --- GARANTIA WARNING --- */}
      {orderType === OrderType.WARRANTY && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-6 rounded-r text-sm text-yellow-800 font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5"/> NO AFECTA CAJA NI PUNTOS
          </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
          {/* ... (Existing form fields remain identical, just ensure they are within the form tag) ... */}
          
          {/* 1. CLIENT / SOURCE SECTION */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${theme.bg}`}></div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <User className={`w-4 h-4 ${theme.text}`}/> 
                      {orderType === OrderType.STORE ? 'Procedencia (Vendedor/Origen)' : 'Datos del Cliente'}
                  </h3>
                  {orderType !== OrderType.STORE && (
                      <button
                          type="button"
                          onClick={() => setShowCustomerSelect(true)}
                          className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
                      >
                          <Search className="w-3 h-3" />
                          Buscar Cliente
                      </button>
                  )}
              </div>
              
              {orderType === OrderType.STORE ? (
                  <div>
                      <label className="text-[10px] font-bold text-red-600 uppercase mb-1 block">FUENTE DEL EQUIPO</label>
                      <input required className="w-full p-3 bg-red-50 border border-red-100 rounded-xl font-bold text-red-900 placeholder-red-300" value={formData.deviceSource} onChange={e => setFormData({...formData, deviceSource: e.target.value})} placeholder="Ej. Compra a Cliente, Cambio, Proveedor X"/>
                  </div>
              ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">NOMBRE COMPLETO</label>
                          <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={formData.customer?.name} onChange={e => setFormData({...formData, customer: { ...formData.customer!, name: e.target.value }})} placeholder="Ej. Juan Pérez"/>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">TELÉFONO / WHATSAPP</label>
                          <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={formData.customer?.phone} onChange={e => setFormData({...formData, customer: { ...formData.customer!, phone: e.target.value }})} placeholder="Ej. 809-555-5555"/>
                      </div>
                  </div>
              )}

              {/* Customer History Summary */}
              {orderType !== OrderType.STORE && customerHistory && (
                  <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-4 items-center justify-between animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                              <User className="w-5 h-5" />
                          </div>
                          <div>
                              <p className="text-xs font-bold text-slate-500 uppercase">Historial del Cliente</p>
                              <p className="text-sm font-black text-slate-800">{customerHistory.visits} Visitas Registradas</p>
                          </div>
                      </div>
                      
                      <div className="flex gap-4">
                          <div className="text-center px-4 border-r border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Total Gastado</p>
                              <p className="text-sm font-black text-green-600">${customerHistory.totalSpent.toLocaleString()}</p>
                          </div>
                          <div className="text-center px-4 border-r border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Equipos Activos</p>
                              <p className="text-sm font-black text-blue-600">{customerHistory.active}</p>
                          </div>
                          <div className="text-center px-4">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Abandonados</p>
                              <p className={`text-sm font-black ${customerHistory.abandoned > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                  {customerHistory.abandoned}
                              </p>
                          </div>
                      </div>
                  </div>
              )}
          </div>

          {/* 2. DEVICE DATA SECTION */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${theme.bg}`}></div>
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${theme.text}`}/> Datos del Equipo
              </h3>

              <div className="flex flex-col md:flex-row gap-6">
                  {/* LEFT: PHOTO */}
                  <div className="w-full md:w-1/3">
                      <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Camera className="w-3 h-3"/> FOTO EVIDENCIA</label>
                      {formData.devicePhoto ? (
                          <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 h-48 group">
                              <img src={formData.devicePhoto} className="w-full h-full object-cover" />
                              <button type="button" onClick={() => setFormData({...formData, devicePhoto: ''})} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg hover:scale-110 transition"><Trash2 className="w-4 h-4"/></button>
                          </div>
                      ) : (
                          <button type="button" onClick={() => setShowCamera(true)} className="w-full h-48 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300 hover:bg-slate-50 transition-all gap-2">
                              <Camera className="w-8 h-8 opacity-50"/>
                              <span className="text-[10px] font-bold uppercase">Tomar Foto</span>
                          </button>
                      )}
                  </div>

                  {/* RIGHT: GRID INPUTS */}
                  <div className="w-full md:w-2/3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Smartphone className="w-3 h-3"/> TIPO</label>
                              <select className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100" value={deviceCategory} onChange={e => setDeviceCategory(e.target.value)}>
                                  <option>Celular</option>
                                  <option>Tablet</option>
                                  <option>Laptop</option>
                                  <option>Reloj</option>
                                  <option>Otro</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">MODELO EXACTO</label>
                              <input required className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700" value={formData.deviceModel} onChange={e => setFormData({...formData, deviceModel: e.target.value})} placeholder="Ej. iPhone 13 Pro Max"/>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Palette className="w-3 h-3"/> COLOR</label>
                              <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={deviceColor} onChange={e => setDeviceColor(e.target.value)} placeholder="Ej. Azul Sierra"/>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><HardDrive className="w-3 h-3"/> CAPACIDAD (GB)</label>
                              <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={deviceStorage} onChange={e => setDeviceStorage(e.target.value)} placeholder="Ej. 128GB"/>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block text-red-500 flex items-center gap-1"><Smartphone className="w-3 h-3"/> IMEI / SERIE *</label>
                              <input required className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono uppercase placeholder:text-slate-300" value={formData.imei} onChange={e => setFormData({...formData, imei: e.target.value})} placeholder="OBLIGATORIO"/>
                              
                              {warrantyAlert && (
                                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 animate-in fade-in">
                                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                      <div>
                                          <p className="text-[10px] font-bold text-amber-800 uppercase">Posible Garantía</p>
                                          <p className="text-[10px] text-amber-700 leading-tight">
                                              Reparado hace {warrantyAlert.daysAgo} días (Orden #{warrantyAlert.orderId}).<br/>
                                              <span className="font-medium opacity-80">Falla anterior: {warrantyAlert.issue}</span>
                                          </p>
                                      </div>
                                  </div>
                              )}
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Lock className="w-3 h-3"/> CONTRASEÑA / PATRÓN</label>
                              <input className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono placeholder:text-slate-300" value={formData.devicePassword} onChange={e => setFormData({...formData, devicePassword: e.target.value})} placeholder="Ej. 1234, 'L', 'Z'..."/>
                          </div>
                      </div>

                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Headphones className="w-3 h-3"/> ACCESORIOS RECIBIDOS</label>
                          <input className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-300" value={formData.accessories} onChange={e => setFormData({...formData, accessories: e.target.value})} placeholder="Funda, Cargador, SIM..."/>
                      </div>
                  </div>
              </div>
          </div>

          {/* 3. DIAGNOSIS SECTION */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${theme.bg}`}></div>
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Eye className={`w-4 h-4 ${theme.text}`}/> Estado y Diagnóstico
              </h3>
              
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 mb-4">
                  <label className="text-[10px] font-bold text-red-800 uppercase mb-2 block flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> OBSERVACIONES VISUALES (OBLIGATORIO)</label>
                  <textarea 
                      className="w-full p-3 bg-white border border-red-200 rounded-xl text-sm text-slate-700 min-h-[80px] focus:ring-2 focus:ring-red-200 outline-none"
                      value={formData.deviceCondition}
                      onChange={e => setFormData({...formData, deviceCondition: e.target.value})}
                      placeholder="Describa el estado físico: Rayones, golpes, pantalla rota, manchas..."
                  />
                  <p className="text-[10px] text-red-600 mt-1 font-bold">* Debe llenar este campo para proteger al taller de reclamos.</p>
              </div>

              <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {orderType === OrderType.STORE ? 'DETALLE / RAZÓN INGRESO' : 'FALLA REPORTADA POR CLIENTE'}</label>
                  <textarea 
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 min-h-[80px] focus:ring-2 focus:ring-blue-100 outline-none"
                      value={formData.deviceIssue}
                      onChange={e => setFormData({...formData, deviceIssue: e.target.value})}
                      placeholder={orderType === OrderType.STORE ? "Ej. Pantalla rota para reparar y vender..." : "¿Qué le pasa al equipo?"}
                  />
              </div>
          </div>

          {/* 4. FINANCIAL & TIME SECTION */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-600"/> Costo y Tiempo
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                  {/* COST INPUT */}
                  <div className={`p-4 rounded-xl border ${orderType === OrderType.STORE ? 'bg-red-50 border-red-100' : (orderType === OrderType.WARRANTY ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-100')}`}>
                      {orderType === OrderType.WARRANTY ? (
                          <div className="text-center py-4">
                              <ShieldCheck className="w-8 h-8 text-yellow-600 mx-auto mb-2"/>
                              <p className="font-bold text-yellow-800 uppercase">SIN COSTO AL CLIENTE</p>
                              <p className="text-xs text-yellow-700">Cubierto por Garantía</p>
                          </div>
                      ) : (
                          <>
                              <label className={`text-[10px] font-bold uppercase mb-1 block ${orderType === OrderType.STORE ? 'text-red-700' : 'text-green-700'}`}>
                                  {orderType === OrderType.STORE ? 'COSTO ADQUISICIÓN (COMPRA)' : 'PRECIO ACORDADO (CLIENTE)'}
                              </label>
                              <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                  <input 
                                      type="number" 
                                      className="w-full pl-6 p-3 bg-white border border-transparent rounded-xl text-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-opacity-50 shadow-sm"
                                      value={orderType === OrderType.STORE ? formData.purchaseCost : formData.estimatedCost}
                                      onChange={e => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setFormData(prev => ({
                                              ...prev, 
                                              [orderType === OrderType.STORE ? 'purchaseCost' : 'estimatedCost']: val,
                                              totalAmount: orderType === OrderType.REPAIR ? val : prev.totalAmount
                                          }));
                                      }}
                                      placeholder="0.00"
                                  />
                              </div>
                              <p className={`text-[10px] mt-1 ${orderType === OrderType.STORE ? 'text-red-500' : 'text-green-600'}`}>
                                  {orderType === OrderType.STORE ? 'Cuánto pagó el taller por este equipo. No afecta caja diaria.' : 'Deje en 0 si es a revisar.'}
                              </p>
                              
                              {orderType === OrderType.REPAIR && (
                                  <div className="mt-4 pt-4 border-t border-green-100">
                                      <label className="text-[10px] font-bold uppercase mb-1 block text-green-700">
                                          TOTAL FINAL ESTIMADO (CON REPUESTOS)
                                      </label>
                                      <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                          <input 
                                              type="number" 
                                              className="w-full pl-6 p-2 bg-white border border-green-200 rounded-lg text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-green-100"
                                              value={formData.totalAmount || formData.estimatedCost}
                                              onChange={e => setFormData(prev => ({
                                                  ...prev, 
                                                  totalAmount: parseFloat(e.target.value) || 0
                                              }))}
                                              placeholder="0.00"
                                          />
                                      </div>
                                  </div>
                              )}
                          </>
                      )}
                  </div>

                  {/* TIME & PRIORITY */}
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-blue-700 uppercase mb-1 block">COMPROMISO DE ENTREGA</label>
                          <input 
                              type="datetime-local" 
                              className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-slate-700"
                              value={deadlineInput}
                              onChange={e => setDeadlineInput(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-blue-700 uppercase mb-1 block">PRIORIDAD</label>
                          <select 
                              className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-slate-700 outline-none"
                              value={formData.priority}
                              onChange={e => setFormData({...formData, priority: e.target.value as PriorityLevel})}
                          >
                              <option value={PriorityLevel.LOW}>Baja (Económica)</option>
                              <option value={PriorityLevel.NORMAL}>Normal (Estándar)</option>
                              <option value={PriorityLevel.HIGH}>Alta (Urgente)</option>
                              <option value={PriorityLevel.CRITICAL}>Crítica (Inmediata)</option>
                          </select>
                      </div>
                  </div>
              </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 sticky bottom-0 bg-slate-50/90 backdrop-blur p-4 -mx-4 -mb-6 md:static md:bg-transparent md:p-0 md:m-0">
              <button type="button" onClick={() => navigate('/orders')} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
              <button type="submit" disabled={loading} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 transition active:scale-95 disabled:opacity-70">
                  {loading ? <Loader2 className="animate-spin"/> : <Save className="w-5 h-5"/>} 
                  GUARDAR ORDEN
              </button>
          </div>
      </form>
      
      {/* Hidden File Input for Video Upload */}
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {const f = e.target.files?.[0]; if(f) processVideoInternal(f);}} />
    </div>
  );
};
