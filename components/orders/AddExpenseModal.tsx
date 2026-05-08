import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Camera, CheckCircle2, Loader2, Plus, Trash2, SplitSquareHorizontal, FileText, Download, Maximize2, Sparkles, Upload } from 'lucide-react';
import { supabase, finalUrl, finalKey } from '../../services/supabase';
import { Expense, FloatingExpense } from '../../types';
import { analyzeInvoiceImage, urlToBase64 } from '../../services/geminiService';
import { accountingService } from '../../services/accountingService';

interface AddExpenseModalProps {
  onClose: () => void;
  onAddSimple: (desc: string, amount: number, receiptUrl: string, invoiceNumber?: string, vendor?: string, isDuplicate?: boolean) => Promise<void>;
  onAddMultiple: (
    currentOrderExpenses: { desc: string; amount: number }[],
    floatingExpenses: { desc: string; amount: number }[],
    receiptUrl: string,
    sharedReceiptId: string,
    invoiceNumber?: string,
    vendor?: string,
    isDuplicate?: boolean
  ) => Promise<void>;
}

type Step = 'choose_type' | 'scan_qr' | 'success_check' | 'fill_details';
type ExpenseType = 'simple' | 'multiple';

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ onClose, onAddSimple, onAddMultiple }) => {
  const [step, setStep] = useState<Step>('choose_type');
  const [expenseType, setExpenseType] = useState<ExpenseType>('simple');
  const [sessionId] = useState(() => crypto.randomUUID());
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  
  // Simple Form State
  const [simpleDesc, setSimpleDesc] = useState('');
  const [simpleAmount, setSimpleAmount] = useState('');
  
  // Multiple Form State
  const [multipleItems, setMultipleItems] = useState<{ id: string, desc: string, amount: string, isCurrentOrder: boolean }[]>([
    { id: crypto.randomUUID(), desc: '', amount: '', isCurrentOrder: true }
  ]);
  
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [vendor, setVendor] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      if (invoiceNumber.trim() || vendor.trim()) {
        setCheckingDuplicate(true);
        const exists = await accountingService.checkDuplicateInvoice(invoiceNumber, vendor);
        setIsDuplicate(exists);
        setCheckingDuplicate(false);
      } else {
        setIsDuplicate(false);
      }
    };
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, [invoiceNumber, vendor]);

  const processInvoiceImage = async (url: string) => {
    setIsAnalyzing(true);
    setAiAnalysisError(null);
    try {
      const { base64, mimeType } = await urlToBase64(url);
      const result = await analyzeInvoiceImage(base64, mimeType);
      if (result) {
        if (result.invoiceNumber && result.invoiceNumber !== "null") setInvoiceNumber(result.invoiceNumber);
        if (result.vendor && result.vendor !== "null") setVendor(result.vendor);
        
        if (result.articles && result.articles.length > 0) {
          if (result.articles.length === 1) {
            setExpenseType('simple');
            setSimpleDesc(result.articles[0].description);
            
            let parsedAmount = 0;
            if (typeof result.articles[0].amount === 'number') {
              parsedAmount = result.articles[0].amount;
            } else if (typeof result.articles[0].amount === 'string') {
              const cleanStr = (result.articles[0].amount as string).replace(/[^0-9.-]+/g,"");
              parsedAmount = parseFloat(cleanStr);
            }
            setSimpleAmount(isNaN(parsedAmount) ? '' : parsedAmount.toString());
          } else {
            setExpenseType('multiple');
            setMultipleItems(result.articles.map(art => {
              let parsedAmount = 0;
              if (typeof art.amount === 'number') {
                parsedAmount = art.amount;
              } else if (typeof art.amount === 'string') {
                const cleanStr = (art.amount as string).replace(/[^0-9.-]+/g,"");
                parsedAmount = parseFloat(cleanStr);
              }
              
              return {
                id: crypto.randomUUID(),
                desc: art.description,
                amount: isNaN(parsedAmount) ? '' : parsedAmount.toString(),
                isCurrentOrder: true
              };
            }));
          }
        } else {
            setAiAnalysisError("La inteligencia artificial procesó la imagen pero no pudo detectar textos o artículos claros.");
            setExpenseType('simple');
            setSimpleDesc('Servicio / Repuesto');
            setSimpleAmount('0');
        }
      } else {
        setAiAnalysisError("No se pudo formatear la información desde la imagen. Intenta ajustarlo manualmente.");
        setExpenseType('simple');
      }
    } catch (e: any) {
      console.warn("Issue processing invoice image:", e);
      setAiAnalysisError(e.message || e || "Error al procesar la imagen de la factura.");
    } finally {
      setIsAnalyzing(false);
      setStep('fill_details');
    }
  };

  useEffect(() => {
    if (step !== 'scan_qr') return;

    const channel = supabase.channel(`receipt_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'floating_expenses', filter: `shared_receipt_id=eq.${sessionId}` },
        (payload) => {
          if (payload.new.description === 'RECEIPT_UPLOAD_TRIGGER') {
            setReceiptUrl(payload.new.receipt_url);
            setStep('success_check');
            processInvoiceImage(payload.new.receipt_url);
          }
        }
      )
      .subscribe();

    // Fallback polling mechanism in case realtime fails
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('floating_expenses')
          .select('receipt_url')
          .eq('shared_receipt_id', sessionId)
          .eq('description', 'RECEIPT_UPLOAD_TRIGGER')
          .maybeSingle();
          
        if (data && data.receipt_url) {
          setReceiptUrl(data.receipt_url);
          setStep('success_check');
          processInvoiceImage(data.receipt_url);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.warn("Error polling for receipt:", err);
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [step, sessionId]);

  const handleChooseType = (type: ExpenseType) => {
    setExpenseType(type);
    setStep('scan_qr');
  };

  const handleAddMultipleItem = () => {
    setMultipleItems([...multipleItems, { id: crypto.randomUUID(), desc: '', amount: '', isCurrentOrder: false }]);
  };

  const handleRemoveMultipleItem = (id: string) => {
    setMultipleItems(multipleItems.filter(item => item.id !== id));
  };

  const handleUpdateMultipleItem = (id: string, field: string, value: any) => {
    setMultipleItems(multipleItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleClose = async () => {
    try {
      // Cleanup the trigger record if it exists
      await supabase
        .from('floating_expenses')
        .delete()
        .eq('shared_receipt_id', sessionId)
        .eq('description', 'RECEIPT_UPLOAD_TRIGGER');
    } catch (e) {
      console.warn("Cleanup error:", e);
    }
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let finalReceiptUrl = receiptUrl;
      if (receiptFile) {
        finalReceiptUrl = await accountingService.uploadReceipt(receiptFile);
      }

      if (expenseType === 'simple') {
        const amount = parseFloat(simpleAmount);
        if (!simpleDesc || isNaN(amount) || amount <= 0) {
          alert("Por favor ingrese una descripción y un monto válido.");
          setIsSubmitting(false);
          return;
        }
        await onAddSimple(simpleDesc, amount, finalReceiptUrl, invoiceNumber, vendor, isDuplicate);
      } else {
        const currentOrderExpenses: { desc: string; amount: number }[] = [];
        const floatingExpenses: { desc: string; amount: number }[] = [];
        
        let hasError = false;
        multipleItems.forEach(item => {
          const amt = parseFloat(item.amount);
          if (!item.desc || isNaN(amt) || amt <= 0) {
            hasError = true;
          } else {
            if (item.isCurrentOrder) {
              currentOrderExpenses.push({ desc: item.desc, amount: amt });
            } else {
              floatingExpenses.push({ desc: item.desc, amount: amt });
            }
          }
        });

        if (hasError || (currentOrderExpenses.length === 0 && floatingExpenses.length === 0)) {
          alert("Por favor revise que todos los items tengan descripción y monto válido.");
          setIsSubmitting(false);
          return;
        }

        await onAddMultiple(currentOrderExpenses, floatingExpenses, finalReceiptUrl, sessionId, invoiceNumber, vendor, isDuplicate);
      }
      handleClose();
    } catch (error) {
      console.warn(error);
      alert("Error al guardar el gasto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadUrl = `${window.location.origin}/#/mobile-upload/${sessionId}?sbUrl=${encodeURIComponent(finalUrl || '')}&sbKey=${encodeURIComponent(finalKey || '')}`;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Registrar Gasto con Factura
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {step === 'choose_type' && (
            <div className="space-y-6">
              <p className="text-slate-600 text-center mb-6">¿Cómo desea registrar este gasto?</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button 
                  onClick={() => handleChooseType('simple')}
                  className="p-6 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group flex flex-col items-center text-center gap-3"
                >
                  <div className="bg-blue-100 p-4 rounded-full group-hover:bg-blue-200 transition-colors">
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Gasto Simple</h3>
                    <p className="text-sm text-slate-500 mt-1">Una factura para un solo gasto en esta orden.</p>
                  </div>
                </button>
                
                <button 
                  onClick={() => handleChooseType('multiple')}
                  className="p-6 border-2 border-slate-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group flex flex-col items-center text-center gap-3"
                >
                  <div className="bg-purple-100 p-4 rounded-full group-hover:bg-purple-200 transition-colors">
                    <SplitSquareHorizontal className="w-8 h-8 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Factura Compartida</h3>
                    <p className="text-sm text-slate-500 mt-1">Una factura con varios items para distintas órdenes.</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'scan_qr' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
              <div className="bg-slate-100 p-4 rounded-2xl">
                <QRCodeSVG value={uploadUrl} size={200} level="H" includeMargin={true} className="rounded-xl" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Escanee para subir factura</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Use la cámara de su teléfono para escanear este código y subir la foto de la factura directamente.</p>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-full animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Esperando imagen del teléfono...</span>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase
                        .from('floating_expenses')
                        .select('receipt_url')
                        .eq('shared_receipt_id', sessionId)
                        .eq('description', 'RECEIPT_UPLOAD_TRIGGER')
                        .maybeSingle();
                        
                      if (data && data.receipt_url) {
                        setReceiptUrl(data.receipt_url);
                        setStep('success_check');
                        setTimeout(() => {
                          setStep('fill_details');
                        }, 1500);
                      } else {
                        alert("Todavía no se ha recibido la foto. Asegúrese de haberla enviado desde su teléfono y que haya aparecido el check verde.");
                      }
                    } catch (err) {
                      console.warn(err);
                    }
                  }}
                  className="text-sm text-slate-500 hover:text-blue-600 underline underline-offset-2 transition-colors font-medium"
                >
                  ¿Ya la subió? Verificar ahora
                </button>
                
                <div className="w-full max-w-xs flex items-center gap-4 my-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs text-slate-400 font-bold uppercase">O</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <label className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm font-medium cursor-pointer hover:bg-slate-100 transition text-slate-600 w-full max-w-xs">
                  <Upload className="w-5 h-5" />
                  Subir desde la computadora
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setReceiptFile(file);
                        setReceiptUrl(URL.createObjectURL(file));
                        setStep('success_check');
                        setIsAnalyzing(true);
                        try {
                          const reader = new FileReader();
                          reader.readAsDataURL(file);
                          reader.onload = async () => {
                            try {
                              const resultStr = reader.result as string;
                              const mimeType = resultStr.split(';')[0].split(':')[1] || 'image/jpeg';
                              const base64 = resultStr.split(',')[1];
                              const result = await analyzeInvoiceImage(base64, mimeType);
                              if (result) {
                                if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber);
                                if (result.vendor) setVendor(result.vendor);
                                
                                if (result.articles && result.articles.length > 0) {
                                  if (result.articles.length === 1) {
                                    setExpenseType('simple');
                                    setSimpleDesc(result.articles[0].description);
                                    
                                    let parsedAmount = 0;
                                    if (typeof result.articles[0].amount === 'number') {
                                      parsedAmount = result.articles[0].amount;
                                    } else if (typeof result.articles[0].amount === 'string') {
                                      const cleanStr = (result.articles[0].amount as string).replace(/[^0-9.-]+/g,"");
                                      parsedAmount = parseFloat(cleanStr);
                                    }
                                    setSimpleAmount(isNaN(parsedAmount) ? '' : parsedAmount.toString());
                                  } else {
                                    setExpenseType('multiple');
                                    setMultipleItems(result.articles.map(art => {
                                      let parsedAmount = 0;
                                      if (typeof art.amount === 'number') {
                                        parsedAmount = art.amount;
                                      } else if (typeof art.amount === 'string') {
                                        const cleanStr = (art.amount as string).replace(/[^0-9.-]+/g,"");
                                        parsedAmount = parseFloat(cleanStr);
                                      }
                                      
                                      return {
                                        id: crypto.randomUUID(),
                                        desc: art.description,
                                        amount: isNaN(parsedAmount) ? '' : parsedAmount.toString(),
                                        isCurrentOrder: true
                                      };
                                    }));
                                  }
                                } else {
                                  alert("⚠️ La inteligencia artificial procesó la imagen pero no pudo detectar textos o artículos claros. Por favor, desglosa los repuestos manualmente.");
                                  setExpenseType('simple');
                                  setSimpleDesc('Servicio / Repuesto');
                                  setSimpleAmount('0');
                                }
                              } else {
                                alert("⚠️ No se pudo formatear la información desde la imagen. Intenta ajustarlo manualmente.");
                                setExpenseType('simple');
                              }
                            } catch (err) {
                              console.warn("Issue analyzing invoice file:", err);
                            } finally {
                              setIsAnalyzing(false);
                              setStep('fill_details');
                            }
                          };
                          reader.onerror = () => {
                            setIsAnalyzing(false);
                            setStep('fill_details');
                          };
                        } catch (err) {
                          console.warn("Issue processing invoice file:", err);
                          setIsAnalyzing(false);
                          setStep('fill_details');
                        }
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {step === 'success_check' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6 animate-in zoom-in duration-300">
              <div className="relative">
                <div className="bg-green-100 p-4 rounded-full relative z-10">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <div className="absolute inset-0 bg-green-400/20 rounded-full animate-ping" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800">¡Factura Recibida!</h3>
                <p className="text-slate-500 font-medium">Hemos detectado la imagen correctamente.</p>
              </div>

              {receiptUrl && (
                <div className="relative w-48 h-64 bg-slate-100 rounded-xl overflow-hidden shadow-lg border-4 border-white">
                  <img src={receiptUrl} alt="Preview" className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/20 backdrop-blur-[1px]">
                    <div className="w-full h-1 bg-blue-500 absolute top-0 animate-[scan_2s_linear_infinite]" />
                    <Sparkles className="w-10 h-10 text-white animate-pulse drop-shadow-lg" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-6 py-3 rounded-full border border-blue-100 shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-bold text-sm uppercase tracking-tight">Analizando artículos con IA...</span>
              </div>
            </div>
          )}

          {step === 'fill_details' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex flex-col">
                <div className="p-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase text-center">
                  Vista Previa de Factura
                </div>
                <div className="flex-1 p-2 flex items-center justify-center min-h-[200px]">
                  {receiptUrl ? (
                    <img 
                      src={receiptUrl} 
                      alt="Factura" 
                      className="max-w-full max-h-[400px] object-contain rounded shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity" 
                      onClick={() => setShowImageModal(true)}
                    />
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center gap-2">
                      <Camera className="w-8 h-8 opacity-50" />
                      <span className="text-sm">Sin imagen</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                {aiAnalysisError && (
                  <div className="flex items-start gap-2 bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-200 text-sm">
                    <span className="mt-0.5">⚠️</span>
                    <p className="flex-1">{aiAnalysisError}</p>
                  </div>
                )}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proveedor (Opcional)</label>
                    <input 
                      type="text" 
                      value={vendor}
                      onChange={e => setVendor(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Ej. Supermercado, Ferretería, etc."
                    />
                  </div>
                </div>

                {expenseType === 'simple' ? (
                  <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-slate-700 uppercase text-sm border-b border-slate-200 pb-2">Detalles del Gasto</h3>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción / Concepto</label>
                      <input 
                        type="text" 
                        value={simpleDesc}
                        onChange={e => setSimpleDesc(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="Ej. Pantalla iPhone 13"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto ($)</label>
                      <input 
                        type="number" 
                        value={simpleAmount}
                        onChange={e => setSimpleAmount(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <h3 className="font-bold text-slate-700 uppercase text-sm">Desglose de Factura</h3>
                      <button 
                        onClick={handleAddMultipleItem}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Agregar Fila
                      </button>
                    </div>
                    
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {multipleItems.map((item, index) => (
                        <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 relative group">
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <input 
                                type="text" 
                                value={item.desc}
                                onChange={e => handleUpdateMultipleItem(item.id, 'desc', e.target.value)}
                                className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                                placeholder={`Concepto ${index + 1}`}
                              />
                            </div>
                            <div className="w-28">
                              <input 
                                type="number" 
                                value={item.amount}
                                onChange={e => handleUpdateMultipleItem(item.id, 'amount', e.target.value)}
                                className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none font-bold text-right"
                                placeholder="$ 0.00"
                              />
                            </div>
                            {multipleItems.length > 1 && (
                              <button 
                                onClick={() => handleRemoveMultipleItem(item.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <input 
                              type="checkbox" 
                              id={`check-${item.id}`}
                              checked={item.isCurrentOrder}
                              onChange={e => handleUpdateMultipleItem(item.id, 'isCurrentOrder', e.target.checked)}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                            />
                            <label htmlFor={`check-${item.id}`} className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                              Asignar a esta orden
                            </label>
                            {!item.isCurrentOrder && (
                              <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase">
                                Irá a Gastos en Espera
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {step === 'fill_details' && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button 
              onClick={handleClose}
              className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Guardar Gastos
            </button>
          </div>
        )}
      </div>

      {/* Full Image Modal */}
      {showImageModal && receiptUrl && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowImageModal(false)}
        >
          <button 
            onClick={() => setShowImageModal(false)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="max-w-5xl max-h-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img 
              src={receiptUrl} 
              alt="Factura Full" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="flex gap-4">
              <a 
                href={receiptUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white text-slate-900 px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-100 transition-colors"
              >
                <Maximize2 className="w-5 h-5" />
                Abrir en nueva pestaña
              </a>
              <button 
                onClick={() => setShowImageModal(false)}
                className="bg-white/20 text-white px-6 py-2 rounded-xl font-bold hover:bg-white/30 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
