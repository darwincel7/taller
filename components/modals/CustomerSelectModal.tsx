import React, { useState, useEffect } from 'react';
import { Search, X, User, Phone, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { Customer } from '../../types';

interface CustomerSelectModalProps {
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

export const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({ onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      try {
        let query = supabase.from('customers').select('*').order('name');
        
        if (searchTerm) {
          query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        }
        
        const { data, error } = await query.limit(10);
        if (error) throw error;
        setCustomers(data || []);
      } catch (err) {
        console.warn("Error fetching customers:", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      fetchCustomers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Seleccionar Cliente
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-500" />
              <p className="text-sm font-medium">Buscando...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <p className="font-medium">No se encontraron clientes.</p>
              <p className="text-sm mt-1">Puedes crear uno nuevo al ingresar los datos en el formulario.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => onSelect(customer)}
                  className="w-full text-left p-3 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{customer.name}</p>
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {customer.phone}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
