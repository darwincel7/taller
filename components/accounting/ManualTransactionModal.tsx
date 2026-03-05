import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, DollarSign, Store, Wrench } from 'lucide-react';
import { AccountingCategory } from '../../types';
import { accountingService } from '../../services/accountingService';
import { motion } from 'framer-motion';

interface ManualTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
    date: new Date().toISOString().split('T')[0],
    description: '',
    category_id: '',
    source_department: 'STORE' as 'STORE' | 'WORKSHOP',
    vendor: ''
  });

  useEffect(() => {
    if (isOpen) {
      accountingService.getCategories().then(setCategories);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amount = parseFloat(formData.amount);
      await accountingService.addTransaction({
        amount: formData.type === 'EXPENSE' ? -Math.abs(amount) : Math.abs(amount),
        transaction_date: formData.date,
        description: formData.description,
        category_id: formData.category_id,
        source_department: formData.source_department,
        vendor: formData.vendor,
        status: 'CONSOLIDATED' // Manual entries by admin are consolidated
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categories.filter(c => c.type === formData.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-black text-slate-800">Nueva Transacción</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type Selector */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFormData({...formData, type: 'INCOME'})}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${formData.type === 'INCOME' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500'}`}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => setFormData({...formData, type: 'EXPENSE'})}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${formData.type === 'EXPENSE' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500'}`}
            >
              Gasto
            </button>
          </div>

          {/* Source Selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData({...formData, source_department: 'STORE'})}
              className={`p-3 border rounded-xl flex flex-col items-center gap-2 transition ${
                formData.source_department === 'STORE' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50 text-slate-500'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="text-xs font-bold">Tienda</span>
            </button>
            <button
              type="button"
              onClick={() => setFormData({...formData, source_department: 'WORKSHOP'})}
              className={`p-3 border rounded-xl flex flex-col items-center gap-2 transition ${
                formData.source_department === 'WORKSHOP' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50 text-slate-500'
              }`}
            >
              <Wrench className="w-5 h-5" />
              <span className="text-xs font-bold">Taller</span>
            </button>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" step="0.01" required
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <input 
                type="date" required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
            <select 
              required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none"
              value={formData.category_id}
              onChange={e => setFormData({...formData, category_id: e.target.value})}
            >
              <option value="">Seleccionar...</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label>
            <input 
              type="text" required
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <button 
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            <CheckCircle2 className="w-5 h-5" />
            Guardar Transacción
          </button>
        </form>
      </motion.div>
    </div>
  );
};
