import React, { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, MessageCircle, User, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { ClientCredit } from '../../types';

interface CreditDetailsModalProps {
  credit: ClientCredit;
  onClose: () => void;
  onContact: () => void;
  onAbono: () => void;
  currentUser?: { id: string; name: string } | null;
}

export const CreditDetailsModal: React.FC<CreditDetailsModalProps> = ({ credit, onClose, onContact, onAbono, currentUser }) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      try {
        const [paymentsRes, contactsRes] = await Promise.all([
          supabase.from('credit_payments').select('*').eq('credit_id', credit.id).order('created_at', { ascending: false }),
          supabase.from('credit_contacts').select('*').eq('credit_id', credit.id).order('created_at', { ascending: false })
        ]);

        if (paymentsRes.data) setPayments(paymentsRes.data);
        if (contactsRes.data) setContacts(contactsRes.data);
      } catch (error) {
        console.warn("Error loading credit details:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [credit.id]);

  const dueDate = new Date(credit.due_date);
  const today = new Date();
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0;

  const handleContactClick = async () => {
    // Record contact
    try {
      await supabase.from('credit_contacts').insert({
        credit_id: credit.id,
        contact_method: 'WHATSAPP',
        notes: 'Recordatorio de pago enviado',
        cashier_id: currentUser?.id || 'system',
        cashier_name: currentUser?.name || 'Sistema'
      });
      // Refresh contacts
      const { data } = await supabase.from('credit_contacts').select('*').eq('credit_id', credit.id).order('created_at', { ascending: false });
      if (data) setContacts(data);
    } catch (e) {
      console.warn(e);
    }
    onContact();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Detalles del Crédito</h2>
            <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-wider">
              {credit.client_name} • {credit.client_phone}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          
          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <DollarSign className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Balance Pendiente</span>
              </div>
              <p className="text-3xl font-black text-slate-800">${credit.amount.toLocaleString()}</p>
            </div>
            
            <div className={`rounded-2xl p-5 border ${isOverdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className={`flex items-center gap-2 mb-2 ${isOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                <Calendar className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Estado de Tiempo</span>
              </div>
              <p className={`text-2xl font-black ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                {isOverdue ? `Vencido hace ${Math.abs(diffDays)} días` : `Faltan ${diffDays} días`}
              </p>
              <p className="text-xs font-bold mt-1 opacity-70">Vence: {dueDate.toLocaleDateString()}</p>
            </div>
          </div>

          {/* History Sections */}
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Payments History */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Historial de Pagos
              </h3>
              {loading ? (
                <div className="text-center py-4 text-slate-400 text-sm">Cargando...</div>
              ) : payments.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100 border-dashed">
                  <p className="text-sm text-slate-400 font-medium">No hay pagos registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map(payment => (
                    <div key={payment.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800">${payment.amount.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">{new Date(payment.created_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md uppercase tracking-wider">
                          {payment.payment_method}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 justify-end">
                          <User className="w-3 h-3" /> {payment.cashier_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacts History */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                <MessageCircle className="w-4 h-4 text-blue-500" />
                Historial de Contactos
              </h3>
              {loading ? (
                <div className="text-center py-4 text-slate-400 text-sm">Cargando...</div>
              ) : contacts.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100 border-dashed">
                  <p className="text-sm text-slate-400 font-medium">No hay contactos registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map(contact => (
                    <div key={contact.id} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm flex gap-3 items-start">
                      <div className="bg-blue-50 p-2 rounded-lg text-blue-500 shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">{contact.notes}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(contact.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                            <User className="w-3 h-3" /> {contact.cashier_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
          <button 
            onClick={handleContactClick}
            className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <MessageCircle className="w-5 h-5" />
            Contactar por WhatsApp
          </button>
          <button 
            onClick={() => {
              onClose();
              onAbono();
            }}
            className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-200"
          >
            <DollarSign className="w-5 h-5" />
            Abonar a Crédito
          </button>
        </div>
      </div>
    </div>
  );
};
