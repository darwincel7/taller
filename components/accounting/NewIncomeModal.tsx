import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, DollarSign, Upload, AlertCircle } from 'lucide-react';
import { accountingService } from '../../services/accountingService';
import { AccountingCategory } from '../../types';
import { useDropzone, DropzoneOptions } from 'react-dropzone';

interface NewIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewIncomeModal: React.FC<NewIncomeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [file, setFile] = useState<File | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      accountingService.getCategories().then(data => {
        setCategories(data);
      });
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    source_name: '', // Vendor/Client
    description: '',
    category: '', 
    source: 'MANUAL' as 'MANUAL' | 'STORE'
  });

  // Set default category
  useEffect(() => {
    if (categories.length > 0 && !formData.category) {
        // Try to find a category that looks like income
        const incomeCat = categories.find(c => c.name.toLowerCase().includes('venta') || c.name.toLowerCase().includes('ingreso') || c.name.toLowerCase().includes('servicio'));
        setFormData(prev => ({ ...prev, category: incomeCat ? incomeCat.id : categories[0].id }));
    }
  }, [categories]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const droppedFile = acceptedFiles[0];
    if (droppedFile) {
        setFile(droppedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1
  } as unknown as DropzoneOptions);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await accountingService.addTransaction({
        amount: Math.abs(parseFloat(formData.amount)), // Income is positive
        transaction_date: formData.date,
        vendor: formData.source_name, // Reusing vendor field for Payer/Source
        description: formData.description,
        category_id: formData.category,
        source: formData.source,
        status: 'COMPLETED',
        search_text: file ? `FILE_UPLOADED: ${file.name}` : '' // Simple search text for file presence
      }, file || undefined);
      
      onSuccess();
      onClose();
      // Reset form
      setFormData({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        source_name: '',
        description: '',
        category: '',
        source: 'MANUAL'
      });
      setFile(null);
    } catch (error) {
      console.error("Submit failed", error);
      setSubmitError("Error al guardar. Verifica la conexión o el almacenamiento.");
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
            className="fixed inset-0 m-auto max-w-lg w-full h-fit bg-white rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
              <h2 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Registrar Nuevo Ingreso
              </h2>
              <button onClick={onClose} className="p-1 hover:bg-emerald-200 rounded-full transition">
                <X className="w-5 h-5 text-emerald-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {submitError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {submitError}
                </div>
              )}

              {/* File Upload Area */}
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                }`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-600">
                    <Check className="w-5 h-5" />
                    <span className="font-medium text-sm truncate max-w-[200px]">{file.name}</span>
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="p-1 hover:bg-emerald-100 rounded-full"
                    >
                        <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-500">
                    <Upload className="w-5 h-5 mb-1" />
                    <p className="text-xs font-medium">Adjuntar comprobante (Opcional)</p>
                  </div>
                )}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Monto Ingreso</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">+ $</span>
                      <input 
                        type="number" 
                        required
                        step="0.01"
                        className="w-full pl-9 pr-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition font-bold text-emerald-700"
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Cliente / Origen</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition"
                    placeholder="Ej. Venta de Accesorio, Inversión Inicial"
                    value={formData.source_name}
                    onChange={e => setFormData({...formData, source_name: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Descripción</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition"
                    placeholder="Detalle del ingreso"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Destino de Fondos</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, source: 'MANUAL'})}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${
                        formData.source === 'MANUAL' 
                          ? 'bg-emerald-600 text-white border-emerald-600' 
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
                      🛍️ Caja Tienda
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Categoría</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition bg-white"
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
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Guardar Ingreso
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
