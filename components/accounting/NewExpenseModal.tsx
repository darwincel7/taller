import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Loader2, Check, AlertCircle, FileText, Camera } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { accountingService } from '../../services/accountingService';
import { aiAccountingService } from '../../services/aiAccounting';
import { AccountingCategory, TransactionStatus, ActionType } from '../../types';
import { auditService } from '../../services/auditService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isScanning, setIsScanning] = useState(false);
  const { currentUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  
  useEffect(() => {
    if (isOpen) {
      accountingService.getCategories().then(setCategories);
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    vendor: '',
    description: '',
    invoice_number: '',
    category: '', // Will be set to first category ID or empty
    source: 'STORE' as 'MANUAL' | 'STORE'
  });

  // Set default category when loaded
  useEffect(() => {
    if (categories.length > 0 && !formData.category) {
      const repuestosCat = categories.find(c => c.name.toLowerCase().includes('repuesto'));
      setFormData(prev => ({ ...prev, category: repuestosCat ? repuestosCat.id : categories[0].id }));
    }
  }, [categories]);

  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState<string>('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const droppedFile = acceptedFiles[0];
    if (!droppedFile) return;

    setFile(droppedFile);
    setScanError(null);
    setApiKeyMissing(false);

    // Check API Key
    const hasKey = await aiAccountingService.checkApiKey();
    if (!hasKey) {
        setApiKeyMissing(true);
        return;
    }

    setIsScanning(true);

    try {
      const scannedData = await aiAccountingService.scanReceipt(droppedFile);
      
      if (scannedData.error) {
        setScanError("No se detectó un recibo válido.");
      } else {
        const matchedCat = categories.find(c => c.name.toLowerCase() === scannedData.category?.toLowerCase());
        setFormData(prev => ({
          ...prev,
          amount: scannedData.amount?.toString() || '',
          date: scannedData.date || format(new Date(), 'yyyy-MM-dd'),
          vendor: scannedData.vendor || '',
          description: scannedData.description || '',
          invoice_number: scannedData.invoice_number || '',
          category: matchedCat ? matchedCat.id : (categories[0]?.id || '')
        }));
        
        // Store raw OCR text for search indexing
        // We might want to ask the AI to return the raw text too, or just use the structured data as proxy
        // For now, let's construct a rich search string from the structured data + any extra fields
        const richText = `OCR_DATA: ${JSON.stringify(scannedData)}`;
        setOcrText(richText);
      }
    } catch (error) {
      console.error("Scan failed", error);
      setScanError("Error al escanear el recibo. Intenta manual.");
    } finally {
      setIsScanning(false);
    }
  }, [categories]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1
  } as any);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const newTransaction = await accountingService.addTransaction({
        amount: -Math.abs(parseFloat(formData.amount)), // Expenses are negative
        transaction_date: formData.date,
        vendor: formData.vendor,
        description: formData.description,
        invoice_number: formData.invoice_number || undefined,
        category_id: formData.category,
        source: formData.source,
        status: TransactionStatus.COMPLETED,
        search_text: ocrText // Pass the OCR text for indexing
      }, file || undefined); // Pass the file for uploading

      // Record audit log
      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_ADDED,
          `Gasto registrado: ${formData.vendor} - $${formData.amount} (${formData.description}) ${newTransaction?.readable_id ? `[Ref: #${newTransaction.readable_id}]` : ''}`
        );
      }
      
      onSuccess();
      onClose();
      // Reset form
      setFormData({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        vendor: '',
        description: '',
        invoice_number: '',
        category: categories[0]?.id || '',
        source: 'MANUAL'
      });
      setFile(null);
      setOcrText('');
    } catch (error: any) {
      console.error("Submit failed", error);
      if (error.message === 'DUPLICATE_INVOICE') {
        setSubmitError(`Error: La factura #${formData.invoice_number} ya fue registrada anteriormente para el proveedor ${formData.vendor}.`);
      } else {
        setSubmitError("Error al guardar. Verifica la conexión o el almacenamiento.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 m-auto max-w-lg w-full h-fit bg-white rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Registrar Nuevo Gasto
              </h2>
              <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {apiKeyMissing && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    <span>Se requiere conectar la API de Gemini para usar la IA.</span>
                  </div>
                  <button 
                    onClick={async () => {
                        await aiAccountingService.promptApiKey();
                        setApiKeyMissing(false);
                    }}
                    className="self-start px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-bold transition"
                  >
                    Conectar API Key
                  </button>
                </div>
              )}

              {submitError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {submitError}
                </div>
              )}

              {/* AI Scanner Dropzone */}
              <div className="flex flex-col gap-3">
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <input {...getInputProps()} />
                  {isScanning ? (
                    <div className="flex flex-col items-center gap-2 text-indigo-600">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="font-medium">Analizando recibo con IA...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex gap-4 w-full justify-center">
                        <button 
                          type="button"
                          className="flex-1 flex flex-col items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-xl shadow-lg shadow-indigo-600/20 transition active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.capture = 'environment';
                            input.onchange = (e: any) => {
                              if (e.target.files && e.target.files.length > 0) {
                                onDrop(Array.from(e.target.files));
                              }
                            };
                            input.click();
                          }}
                        >
                          <Camera className="w-8 h-8" />
                          <span className="font-bold">Tomar Foto</span>
                        </button>
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 p-4 rounded-xl transition active:scale-95">
                          <Upload className="w-8 h-8 text-slate-500" />
                          <span className="font-bold">Subir Archivo</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">o arrastra tu recibo aquí para escanear con IA</p>
                    </div>
                  )}
                </div>
              </div>

              {scanError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {scanError}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input 
                        type="number" 
                        required
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fecha</label>
                    <input 
                      type="date" 
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Proveedor / Comercio</label>
                    <input 
                      type="text" 
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                      placeholder="Ej. Amazon, Proveedor Local"
                      value={formData.vendor}
                      onChange={e => setFormData({...formData, vendor: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nº de Factura / Ticket</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                      placeholder="Opcional"
                      value={formData.invoice_number}
                      onChange={e => setFormData({...formData, invoice_number: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Descripción</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition"
                    placeholder="Detalle del gasto"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Origen de Fondos</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, source: 'MANUAL'})}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${
                        formData.source === 'MANUAL' 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      🏢 Caja Taller
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, source: 'STORE'})}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${
                        formData.source === 'STORE' 
                          ? 'bg-purple-600 text-white border-purple-600' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      🛍️ Caja Tienda 1
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Categoría</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition bg-white"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Guardar Gasto
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
