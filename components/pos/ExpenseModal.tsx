import React, { useState, useEffect } from 'react';
import { X, Receipt, Building2, Smartphone, Loader2, Upload, QrCode, CheckCircle2, Sparkles, Plus, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, finalUrl, finalKey } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { accountingService } from '../../services/accountingService';
import { auditService } from '../../services/auditService';
import { TransactionStatus, ApprovalStatus, ExpenseDestination } from '../../types';
import { analyzeInvoiceImage, urlToBase64 } from '../../services/geminiService';

interface ExpenseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ onClose, onSuccess }) => {
  const { currentUser } = useAuth();
  
  const [type, setType] = useState<'ORDER' | 'LOCAL' | null>(null);
  const [items, setItems] = useState<{ id: string, desc: string, amount: string }[]>([
    { id: crypto.randomUUID(), desc: '', amount: '' }
  ]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendor, setVendor] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

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

  const processInvoiceFile = async (file: File) => {
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
              setItems(result.articles.map(art => {
                let parsedAmount = 0;
                if (typeof art.amount === 'number') {
                  parsedAmount = art.amount;
                } else if (typeof art.amount === 'string') {
                  const cleanStr = (art.amount as string).replace(/[^0-9.-]+/g,"");
                  parsedAmount = parseFloat(cleanStr);
                }
                
                return {
                  id: crypto.randomUUID(),
                  desc: art.description || 'Artículo sin nombre',
                  amount: isNaN(parsedAmount) ? '' : parsedAmount.toString()
                };
              }));
            } else {
              setAiAnalysisError("La inteligencia artificial procesó la imagen pero no pudo detectar textos o artículos claros. Por favor, rellena los campos manualmente.");
            }
          } else {
             setAiAnalysisError("No se pudo extraer la información desde la imagen.");
          }
        } catch (err: any) {
          console.warn("Issue analyzing invoice file:", err);
          setAiAnalysisError(err.message || "Error al procesar la imagen de la factura.");
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.onerror = () => {
        setIsAnalyzing(false);
        setAiAnalysisError("Error al leer el archivo en el navegador.");
      };
    } catch (e: any) {
      console.warn("Issue processing invoice file:", e);
      setAiAnalysisError(e.message || "Error al procesar la imagen de la factura.");
      setIsAnalyzing(false);
    }
  };

  const isProcessingRef = React.useRef(false);

  const processInvoiceImage = async (url: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsAnalyzing(true);
    setAiAnalysisError(null);
    try {
      const { base64, mimeType } = await urlToBase64(url);
      const result = await analyzeInvoiceImage(base64, mimeType);
      if (result) {
        if (result.invoiceNumber && result.invoiceNumber !== "null") setInvoiceNumber(result.invoiceNumber);
        if (result.vendor && result.vendor !== "null") setVendor(result.vendor);
        
        if (result.articles && result.articles.length > 0) {
          setItems(result.articles.map(art => {
            // Ensure amount is a valid number string
            let parsedAmount = 0;
            if (typeof art.amount === 'number') {
              parsedAmount = art.amount;
            } else if (typeof art.amount === 'string') {
              // Remove currency symbols and commas
              const cleanStr = (art.amount as string).replace(/[^0-9.-]+/g,"");
              parsedAmount = parseFloat(cleanStr);
            }
            
            return {
              id: crypto.randomUUID(),
              desc: art.description || 'Artículo sin nombre',
              amount: isNaN(parsedAmount) ? '' : parsedAmount.toString()
            };
          }));
        } else {
            setAiAnalysisError("La inteligencia artificial procesó la imagen pero no pudo detectar textos o artículos claros.");
            setItems([{ id: crypto.randomUUID(), desc: 'Consumo / Gasto', amount: '0' }]);
        }
      } else {
        setAiAnalysisError("No se pudo formatear la información desde la imagen. Intenta ajustarlo manualmente.");
      }
    } catch (e: any) {
      console.warn("Issue processing invoice image:", e);
      setAiAnalysisError(e.message || e || "Error al procesar la imagen de la factura.");
    } finally {
      setIsAnalyzing(false);
      setShowQR(false);
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    if (type === 'LOCAL') {
      fetchCategories();
    }
  }, [type]);

  useEffect(() => {
    if (!showQR) return;

    const channel = supabase.channel(`receipt_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'floating_expenses', filter: `shared_receipt_id=eq.${sessionId}` },
        (payload) => {
          if (payload.new.description === 'RECEIPT_UPLOAD_TRIGGER') {
            setReceiptUrl(payload.new.receipt_url);
            processInvoiceImage(payload.new.receipt_url);
          }
        }
      )
      .subscribe();

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
  }, [showQR, sessionId]);

  const fetchCategories = async () => {
    try {
      const { data } = await supabase.from('accounting_categories').select('*').eq('type', 'EXPENSE').order('name');
      if (data) {
        setCategories(data);
        if (data.length > 0) setSelectedCategory(data[0].id);
      }
    } catch (e) {
      console.warn(e);
    }
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

  const handleAddItem = () => {
    setItems([...items, { id: crypto.randomUUID(), desc: '', amount: '' }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: string, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    let hasError = false;
    const validItems: { desc: string, amount: number }[] = [];
    
    items.forEach(item => {
      const numAmount = parseFloat(item.amount);
      if (!item.desc || isNaN(numAmount) || numAmount <= 0) {
        hasError = true;
      } else {
        validItems.push({ desc: item.desc, amount: numAmount });
      }
    });

    if (!type) {
      alert("Por favor seleccione el Tipo de Gasto (Para Taller o Gasto Local).");
      return;
    }

    if (hasError || validItems.length === 0) {
      alert("Por favor revise que todos los items tengan descripción y monto válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      let finalReceiptUrl = receiptUrl;
      if (receiptFile) {
        finalReceiptUrl = await accountingService.uploadReceipt(receiptFile);
      }

      let savedCount = 0;
      let errors: string[] = [];

      if (type === 'ORDER') {
        // 1. Send to Floating Expenses (Limbo) one by one
        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          try {
            const insertData = {
              description: item.desc,
              amount: item.amount,
              receipt_url: finalReceiptUrl,
              created_by: currentUser.id,
              branch_id: currentUser.branch || 'T4',
              approval_status: 'PENDING',
              invoice_number: invoiceNumber || null,
              vendor: vendor || null,
              shared_receipt_id: validItems.length > 1 ? sessionId : null,
              is_duplicate: isDuplicate || i > 0
            };
            
            const { error } = await supabase.from('floating_expenses').insert([insertData]);
            if (error) throw error;
            
            await auditService.recordLog(
              currentUser,
              'CREATE_EXPENSE',
              `Registró gasto de pedido: ${item.desc} (${item.amount})`,
              undefined,
              'TRANSACTION',
              sessionId
            );
            savedCount++;
          } catch (err: any) {
            console.warn("Error saving floating expense:", err);
            errors.push(`${item.desc}: ${err.message || 'Error desconocido'}`);
          }
        }
      } else {
        // 2. Send to General Accounting (Local) one by one
        if (!selectedCategory) throw new Error("Seleccione una categoría");
        
        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          try {
            await accountingService.addTransaction({
              amount: -item.amount,
              description: item.desc,
              category_id: selectedCategory,
              transaction_date: new Date().toISOString().split('T')[0],
              receipt_url: finalReceiptUrl || undefined,
              status: TransactionStatus.COMPLETED, // Money left the register, so it's completed for cash register purposes
              approval_status: ApprovalStatus.PENDING, // Needs approval from auditor
              expense_destination: ExpenseDestination.STORE,
              source: 'STORE',
              branch: currentUser.branch || 'T4',
              created_by: currentUser.id,
              invoice_number: invoiceNumber || undefined,
              vendor: vendor || undefined,
              shared_receipt_id: validItems.length > 1 ? sessionId : undefined,
              is_duplicate: isDuplicate || i > 0
            });
            
            await auditService.recordLog(
              currentUser,
              'CREATE_EXPENSE',
              `Registró gasto local: ${item.desc} (${item.amount})`,
              undefined,
              'TRANSACTION',
              sessionId
            );
            savedCount++;
          } catch (err: any) {
            console.warn("Error saving local expense:", err);
            errors.push(`${item.desc}: ${err.message || 'Error desconocido'}`);
          }
        }
      }
      
      // Cleanup the trigger record if it exists
      try {
        await supabase
          .from('floating_expenses')
          .delete()
          .eq('shared_receipt_id', sessionId)
          .eq('description', 'RECEIPT_UPLOAD_TRIGGER');
      } catch (e) {
        console.warn("Cleanup error:", e);
      }
      
      if (errors.length > 0) {
        alert(`Se guardaron ${savedCount} de ${validItems.length} gastos.\nErrores:\n${errors.join('\n')}`);
      } else {
        alert(`Se guardaron correctamente los ${savedCount} gastos.`);
      }

      onSuccess();
    } catch (error: any) {
      console.warn(error);
      alert("Error general al registrar el gasto: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-red-50 dark:bg-red-900/20">
          <h2 className="text-xl font-black text-red-600 dark:text-red-400 flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            Gasto de Caja
          </h2>
          <button onClick={handleClose} className="p-2 bg-white/50 hover:bg-white rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {showQR ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6">
            {receiptUrl ? (
              <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-300">
                <div className="relative">
                  <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full relative z-10">
                    <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="absolute inset-0 bg-green-400/20 rounded-full animate-ping" />
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">¡Factura Recibida!</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Hemos detectado la imagen correctamente.</p>
                </div>

                {isAnalyzing && (
                  <div className="relative w-48 h-64 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden shadow-lg border-4 border-white dark:border-slate-700">
                    <img src={receiptUrl || undefined} alt="Preview" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/20 backdrop-blur-[1px]">
                      <div className="w-full h-1 bg-blue-500 absolute top-0 animate-[scan_2s_linear_infinite]" />
                      <Sparkles className="w-10 h-10 text-white animate-pulse drop-shadow-lg" />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-6 py-3 rounded-full border border-blue-100 dark:border-blue-800/50 shadow-sm">
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-bold text-sm uppercase tracking-tight">Analizando artículos con IA...</span>
                    </>
                  ) : (
                    <span className="font-bold text-sm uppercase tracking-tight">Análisis completado</span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <QRCodeSVG value={`${window.location.origin}/#/mobile-upload/${sessionId}?sbUrl=${encodeURIComponent(finalUrl || '')}&sbKey=${encodeURIComponent(finalKey || '')}`} size={200} level="H" includeMargin={true} className="rounded-xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Escanee para subir factura</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-sm">Use la cámara de su teléfono para escanear este código y subir la foto de la factura directamente.</p>
                </div>
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-4 py-2 rounded-full animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Esperando imagen del teléfono...</span>
                </div>
                <button 
                  onClick={() => setShowQR(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2 mt-4"
                >
                  Cancelar y volver al formulario
                </button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            
            {/* Type Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo de Gasto (Obligatorio)</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('ORDER')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  type === 'ORDER' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' 
                    : 'border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-6 h-6" />
                <span className="font-bold text-sm text-center">Para Taller (Repuestos)<br/><span className="text-[10px] opacity-70 font-normal">(Requiere asignación)</span></span>
              </button>
              
              <button
                type="button"
                onClick={() => setType('LOCAL')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  type === 'LOCAL' 
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' 
                    : 'border-slate-200 text-slate-500 hover:border-amber-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-6 h-6" />
                <span className="font-bold text-sm text-center">Gasto Local (Operativo)<br/><span className="text-[10px] opacity-70 font-normal">(Directo a Finanzas)</span></span>
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Artículos del Gasto</label>
              <button 
                type="button" 
                onClick={handleAddItem}
                className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Añadir Ítem
              </button>
            </div>
            
            <div className="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
              {items.map((item, index) => (
                <div key={item.id} className="flex gap-2 items-start bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text"
                      required
                      value={item.desc}
                      onChange={e => handleUpdateItem(item.id, 'desc', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium outline-none focus:border-red-500 transition dark:text-white"
                      placeholder={type === 'ORDER' ? "Ej. Pantalla iPhone 11 Pro" : "Ej. Pago de Agua"}
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        value={item.amount}
                        onChange={e => handleUpdateItem(item.id, 'amount', e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold outline-none focus:border-red-500 transition dark:text-white"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

            {type === 'LOCAL' && categories.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Categoría Contable</label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-red-500 transition dark:text-white"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Proveedor (Opcional)</label>
              <input 
                type="text"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-red-500 transition dark:text-white"
                placeholder="Ej. Supermercado, Ferretería, etc."
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Comprobante (Opcional)</label>
              
              {aiAnalysisError && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-3 rounded-lg border border-amber-200 dark:border-amber-800 text-sm">
                  <span className="mt-0.5">⚠️</span>
                  <p className="flex-1">{aiAnalysisError}</p>
                </div>
              )}

              {receiptUrl ? (
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Factura adjuntada vía teléfono</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setReceiptUrl(null)}
                    className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQR(true)}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-2 border-dashed border-blue-300 dark:border-blue-800/50 rounded-xl text-lg font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                >
                  <QrCode className="w-6 h-6" />
                  ESCANEAR QR PARA SUBIR FOTO
                </button>
              )}
            </div>

          {/* Warning */}
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30 text-xs text-red-600 dark:text-red-400 font-medium">
            ⚠️ Este monto se descontará automáticamente de la caja de <strong>{currentUser?.branch || 'T4'}</strong>.
            {type === 'ORDER' && ' El técnico deberá asignarlo a la orden correspondiente.'}
            {type === 'LOCAL' && ' Requerirá aprobación en el Dashboard Financiero.'}
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || items.some(i => !i.desc || !i.amount)}
            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-lg shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Registrar Gasto de Caja'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
};
