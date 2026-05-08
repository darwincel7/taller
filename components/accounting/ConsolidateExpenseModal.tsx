import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Loader2, Check, AlertCircle, Camera } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { accountingService } from '../../services/accountingService';
import { aiAccountingService } from '../../services/aiAccounting';

import { useAuth } from '../../contexts/AuthContext';
import { ActionType, TransactionStatus } from '../../types';
import { auditService } from '../../services/auditService';

interface ConsolidateExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expense: any; // The pending expense object
}

export const ConsolidateExpenseModal: React.FC<ConsolidateExpenseModalProps> = ({ isOpen, onClose, onSuccess, expense }) => {
  const { currentUser } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  const [formData, setFormData] = useState({
    vendor: expense?.vendor || '',
    invoice_number: expense?.invoice_number || '',
  });

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
        setScanError("No se detectó un recibo válido, pero puedes continuar.");
      } else {
        setFormData(prev => ({
          ...prev,
          vendor: scannedData.vendor || prev.vendor,
          invoice_number: scannedData.invoice_number || prev.invoice_number,
        }));
        
        const richText = `OCR_DATA: ${JSON.stringify(scannedData)}`;
        setOcrText(richText);
      }
    } catch (error) {
      console.warn("Scan failed", error);
      setScanError("Error al escanear el recibo. Puedes llenar los datos manualmente.");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDrop as any,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1
  } as any);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !expense.receipt_url) {
      setSubmitError("Debes subir una foto o documento del gasto.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Validate with AI (optional, but requested in original code)
      if (file) {
        const validation = await aiAccountingService.validateReceiptForExpense(file, Math.abs(expense.amount));
        
        if (!validation.isValid) {
          // If it's not valid, we could block it, but let's allow them to override or just show error
          // For strictness, we throw error as in the original code
          throw new Error(validation.reason || "La factura no coincide con el monto esperado.");
        }
      }

      // 2. Upload and update
      let url = expense.receipt_url;
      if (file) {
        url = await accountingService.uploadReceipt(file);
      }
      const updatedDescription = `${expense.description} (Consolidado por: ${currentUser?.name || 'Admin'})`;
      
      await accountingService.updateTransaction(expense.id, { 
        status: TransactionStatus.COMPLETED,
        receipt_url: url || undefined,
        vendor: formData.vendor,
        invoice_number: formData.invoice_number,
        search_text: ocrText,
        description: updatedDescription
      });

      // Record audit log
      if (currentUser) {
        await auditService.recordLog(
          { id: currentUser.id, name: currentUser.name },
          ActionType.TRANSACTION_EDITED,
          `Gasto consolidado: ${formData.vendor} - $${Math.abs(expense.amount)} ${expense.readable_id ? `[Ref: #${expense.readable_id}]` : `(ID: ${expense.id})`}`,
          undefined,
          'TRANSACTION',
          expense.id
        );
      }
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.warn("Consolidation error:", error);
      setSubmitError(error.message || "Error al consolidar el gasto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && expense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <Camera className="w-7 h-7 text-indigo-600" />
                  Consolidar Gasto
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-1">Sube el comprobante para justificar este gasto.</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            {/* Form */}
            <div className="p-8 overflow-y-auto">
              {submitError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm font-bold">{submitError}</p>
                </div>
              )}

              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <p className="text-sm font-bold text-indigo-900 mb-1">Detalles del Gasto Pendiente:</p>
                <p className="text-sm text-indigo-700">{expense.description}</p>
                <p className="text-lg font-black text-indigo-700 mt-2">Monto: ${Math.abs(expense.amount).toLocaleString()}</p>
              </div>

              <form id="consolidate-form" onSubmit={handleSubmit} className="space-y-6">
                
                {/* Dropzone */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Comprobante / Factura *</label>
                  {expense.receipt_url && !file ? (
                    <div className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-8 text-center relative">
                        <div className="flex flex-col items-center text-emerald-600">
                            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                                <Check className="w-6 h-6" />
                            </div>
                            <p className="font-bold text-emerald-800">{expense.shared_receipt_id ? 'Factura Compartida Adjunta' : 'Recibo Adjunto'}</p>
                            <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 mt-2 underline hover:text-emerald-800">Ver Factura Original</a>
                        </div>
                        <div className="mt-4 pt-4 border-t border-emerald-200">
                            <p className="text-xs text-slate-500 mb-2">¿Deseas reemplazarla?</p>
                            <div 
                                {...getRootProps()} 
                                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                                isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-white'
                                }`}
                            >
                                <input {...getInputProps()} />
                                <p className="text-xs font-bold text-slate-600">Arrastra o haz clic aquí para subir una nueva</p>
                            </div>
                        </div>
                    </div>
                  ) : (
                  <div 
                    {...getRootProps()} 
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragActive ? 'border-indigo-500 bg-indigo-50' : 
                      file ? 'border-emerald-500 bg-emerald-50' : 
                      'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                    }`}
                  >
                    <input {...getInputProps()} />
                    
                    {isScanning ? (
                      <div className="flex flex-col items-center text-indigo-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-3" />
                        <p className="font-bold">Analizando recibo con IA...</p>
                        <p className="text-xs opacity-70 mt-1">Extrayendo proveedor y número de factura</p>
                      </div>
                    ) : file ? (
                      <div className="flex flex-col items-center text-emerald-600">
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                          <Check className="w-6 h-6" />
                        </div>
                        <p className="font-bold text-emerald-800">{file.name}</p>
                        <p className="text-xs text-emerald-600 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        <p className="text-xs text-slate-500 mt-4 underline">Haz clic o arrastra para cambiar</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-500">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-100 transition-colors">
                          <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500" />
                        </div>
                        <p className="font-bold text-slate-700">Arrastra tu recibo aquí</p>
                        <p className="text-sm mt-1">o haz clic para seleccionar</p>
                        <p className="text-xs text-slate-400 mt-4">Soporta JPG, PNG, PDF</p>
                      </div>
                    )}
                  </div>
                  )}
                  {scanError && <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {scanError}</p>}
                  {apiKeyMissing && <p className="text-xs font-bold text-amber-600 mt-2">Configura tu API Key de Gemini en Ajustes para usar el escáner automático.</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Proveedor</label>
                    <input 
                      type="text" 
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
                      placeholder="Ej. Novex, EPA..."
                      value={formData.vendor}
                      onChange={e => setFormData({...formData, vendor: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Número de Factura</label>
                    <input 
                      type="text" 
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
                      placeholder="Ej. FCF-00123"
                      value={formData.invoice_number}
                      onChange={e => setFormData({...formData, invoice_number: e.target.value})}
                    />
                  </div>
                </div>

              </form>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                form="consolidate-form"
                disabled={isSubmitting || (!file && !expense.receipt_url)}
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {isSubmitting ? 'Consolidando...' : 'Consolidar Gasto'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
