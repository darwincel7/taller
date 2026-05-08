import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOverdueCredits } from '../services/alertsService';
import { AlertCircle, X, Calendar, User, DollarSign } from 'lucide-react';
import { ClientCredit } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const CreditAlerts = () => {
    const { currentUser } = useAuth();
    const [overdueCredits, setOverdueCredits] = useState<ClientCredit[]>([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!currentUser?.id) return;

        const checkCredits = async () => {
            const credits = await fetchOverdueCredits(currentUser.id);
            setOverdueCredits(credits);
        };

        checkCredits();
        
        // Refresh every 30 minutes
        const interval = setInterval(checkCredits, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [currentUser?.id]);

    if (overdueCredits.length === 0 || dismissed) return null;

    return (
        <div className="fixed bottom-6 left-6 z-50 max-w-md w-full animate-in slide-in-from-left-10 duration-500">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-amber-500 overflow-hidden">
                <div className="bg-amber-500 p-4 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-6 h-6" />
                        <h3 className="font-black uppercase tracking-tight">Créditos Vencidos</h3>
                    </div>
                    <button 
                        onClick={() => setDismissed(true)}
                        className="hover:bg-amber-600 p-1 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-4 max-h-80 overflow-y-auto space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                        Tienes {overdueCredits.length} crédito(s) que han superado su fecha límite de pago. Es tu responsabilidad gestionar el cobro.
                    </p>
                    
                    {overdueCredits.map(credit => (
                        <div key={credit.id} className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/50 space-y-2">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold">
                                    <User className="w-4 h-4" />
                                    <span className="text-sm">{credit.client_name}</span>
                                </div>
                                <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-black">
                                    <DollarSign className="w-4 h-4" />
                                    <span>{credit.amount.toLocaleString()}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Venció el {format(new Date(credit.due_date), 'PPP', { locale: es })}</span>
                            </div>
                            
                            {credit.order_id && (
                                <div className="text-[10px] font-bold text-slate-400 uppercase">
                                    Orden: #{credit.order_id.slice(-6)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                    <button 
                        onClick={() => window.location.href = '/cash'}
                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                        Ver en Caja y Pagos
                    </button>
                </div>
            </div>
        </div>
    );
};
