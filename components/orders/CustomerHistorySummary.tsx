
import React from 'react';
import { User } from 'lucide-react';

interface CustomerHistorySummaryProps {
    customerName: string;
    history: {
        visits: number;
        totalSpent: number;
        abandoned: number;
        active: number;
    };
}

export const CustomerHistorySummary: React.FC<CustomerHistorySummaryProps> = ({ customerName, history }) => {
    return (
        <div className="mb-6 p-4 bg-white border border-slate-200 rounded-2xl flex flex-wrap gap-4 items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    <User className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Historial de {customerName}</p>
                    <p className="text-sm font-black text-slate-800">{history.visits} Visitas Registradas</p>
                </div>
            </div>
            
            <div className="flex gap-4">
                <div className="text-center px-4 border-r border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Gastado</p>
                    <p className="text-sm font-black text-green-600">${history.totalSpent.toLocaleString()}</p>
                </div>
                <div className="text-center px-4 border-r border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Equipos Activos</p>
                    <p className="text-sm font-black text-blue-600">{history.active}</p>
                </div>
                <div className="text-center px-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Abandonados</p>
                    <p className={`text-sm font-black ${history.abandoned > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                        {history.abandoned}
                    </p>
                </div>
            </div>
        </div>
    );
};
