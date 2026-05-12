import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Tag, Check, Loader2 } from 'lucide-react';
import { accountingService } from '../../services/accountingService';
import { AccountingCategory } from '../../types';

interface ManageCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManageCategoriesModal: React.FC<ManageCategoriesModalProps> = ({ isOpen, onClose }) => {
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newType, setNewType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isOpen) fetchCategories();
  }, [isOpen]);

  const fetchCategories = async () => {
    setLoading(true);
    const data = await accountingService.getCategories();
    setCategories(data);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newCategory.trim()) return;
    setIsAdding(true);
    try {
      await accountingService.addCategory(newCategory, newType);
      setNewCategory('');
      await fetchCategories();
    } catch (error) {
      console.warn(error);
    } finally {
      setIsAdding(false);
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
            className="fixed inset-0 m-auto max-w-md w-full h-[600px] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                Categorías Contables
              </h2>
              <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-white space-y-3">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Nueva categoría..."
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                />
                <select 
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50"
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                >
                  <option value="EXPENSE">Gasto</option>
                  <option value="INCOME">Ingreso</option>
                </select>
                <button 
                  onClick={handleAdd}
                  disabled={!newCategory.trim() || isAdding}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {isAdding ? <Loader2 className="w-5 h-5 animate-spin"/> : <Plus className="w-5 h-5"/>}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
              ) : (
                categories.map(cat => (
                  <div key={cat.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-indigo-200 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${cat.type === 'INCOME' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="font-medium text-slate-700 text-sm">{cat.name}</span>
                    </div>
                    {/* Delete button could be added here if needed, but safer to just list for now */}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
