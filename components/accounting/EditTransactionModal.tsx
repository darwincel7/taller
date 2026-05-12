import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, AlertCircle, Edit3 } from 'lucide-react';
import { accountingService } from '../../services/accountingService';
import { AccountingTransaction, AccountingCategory, ActionType } from '../../types';
import { auditService } from '../../services/auditService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: AccountingTransaction | null;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ isOpen, onClose, onSuccess, transaction }) => {
  const { currentUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  
  const [formData, setFormData] = useState({
    amount: '',
    date: '',
    vendor: '',
    description: '',
    invoice_number: '',
    category: '',
    source: 'MANUAL' as any
  });

  useEffect(() => {
    if (isOpen && transaction) {
      setFormData({
        amount: Math.abs(transaction.amount).toString(),
        date: transaction.transaction_date,
        vendor: transaction.vendor || '',
        description: transaction.description || '',
        invoice_number: transaction.invoice_number || '',
        category: transaction.category_id || '',
        source: transaction.source || 'MANUAL'
      });
      setSubmitError(null);
      
      accountingService.getCategories().then(cats => {
        setCategories(cats);
        if (cats.length > 0 && !transaction.category_id) {
          setFormData(prev => ({ ...prev, category: cats[0].id }));
        }
      });
    }
  }, [isOpen, transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !transaction) return;
    
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount)) {
        setSubmitError("Monto inválido.");
        setIsSubmitting(false);
        return;
      }

      // Keep the sign of the original transaction (income vs expense)
      const isExpense = transaction.amount < 0;
      const finalAmount = isExpense ? -Math.abs(amount) : Math.abs(amount);

      await accountingService.updateTransaction(transaction.id, {
        amount: finalAmount,
        transaction_date: formData.date,
        vendor: formData.vendor,
        description: formData.description,
        invoice_number: formData.invoice_number || undefined,
        category_id: formData.category,
        source: formData.source
      });

      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_EDITED,
          `Transacción editada: ${formData.vendor || ''} - $${formData.amount} (${formData.description}) [Ref: #${transaction.readable_id || transaction.id}]`,
          undefined,
          'TRANSACTION',
          transaction.id
        );
      }
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.warn("Submit failed", error);
      setSubmitError("Error al guardar los cambios. Verifica la conexión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 m-auto max-w-lg w-full h-fit bg-white rounded-2xl shadow-2xl z-[60] overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                Editar Transacción
              </h2>
              <button 
                onClick={onClose} 
                className="p-1 hover:bg-slate-200 rounded-full transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {submitError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition font-mono font-bold text-slate-700"
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition font-mono text-slate-700"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Proveedor / Beneficiario</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition text-slate-700"
                    value={formData.vendor}
                    onChange={e => setFormData({...formData, vendor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Descripción</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition text-slate-700"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Categoría</label>
                    <select 
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition bg-white text-slate-700"
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Guardar Cambios
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
